const { getReferralDomainConfig } = require("./referral-config");
const {
  normalizeReferralCode,
  evaluateAttributionFraudRisk,
  assertNoSelfReferralOrThrow
} = require("./referral-fraud-hooks");
const {
  orderQualifiesForReferral,
  purchaseWithinAttributionWindow,
  computeClearAfterAt,
  isClearWindowSatisfied
} = require("./referral-qualification");
const { generateReferralCodeCandidate } = require("./referral-repository");
const { getTrustSignalThresholds } = require("../trust/trust-signal-thresholds");
const { maybeReferralQualifiedClawbackTrustFlag, tryRecordTrustFlag } = require("../trust/trust-surface-flag-builders");

function noopLogger() {
  return { info() {}, warn() {}, error() {} };
}

function startOfUtcDayIso(d = new Date()) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x.toISOString();
}

async function track(analytics, name, payload) {
  if (!analytics || typeof analytics.trackEvent !== "function") {
    return;
  }
  try {
    await analytics.trackEvent(name, payload);
  } catch {
    /* ignore */
  }
}

function createReferralService({
  db,
  repository,
  rewardsLedger,
  analytics,
  logger,
  getReferralConfig = (appConfig) => getReferralDomainConfig(appConfig),
  appConfig,
  trustFlagService = null,
  duplicateAccountGuard = null
}) {
  const repo = repository;
  const log = logger && typeof logger.warn === "function" ? logger : noopLogger();
  const cfgSource = appConfig;

  function cfg() {
    return getReferralConfig(cfgSource);
  }

  async function ensurePrimaryReferralCodeForUser({ referrerUserId }) {
    const c = cfg();
    return db.withTransaction(async (client) => {
      const existing = await repo.findCodeByReferrerUserId(client, referrerUserId);
      if (existing) {
        return { code: existing.code, status: existing.status, id: existing.id };
      }
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const candidate = generateReferralCodeCandidate(referrerUserId);
        try {
          const row = await repo.insertReferralCode(client, {
            referrer_user_id: referrerUserId,
            code: candidate,
            status: "active",
            max_redemptions: c.defaultCodeMaxRedemptions
          });
          await track(analytics, "referral_code_created", {
            referralCodeId: row.id,
            referrerUserId
          });
          return { code: row.code, status: row.status, id: row.id };
        } catch (err) {
          if (err && err.code === "23505") {
            continue;
          }
          throw err;
        }
      }
      throw new Error("referral_code_generate_exhausted");
    });
  }

  /**
   * @returns {Promise<{ status: 'attached'|'ignored'|'rejected'; reason?: string }>}
   */
  async function tryAttributeOnSignup({ refereeUserId, rawReferralCode, requestContext = {} }) {
    const normalized = normalizeReferralCode(rawReferralCode);
    if (!normalized) {
      return { status: "ignored", reason: "no_code" };
    }
    try {
      return await db.withTransaction(async (client) => {
        const codeRow = await repo.findCodeByNormalized(client, normalized);
        if (!codeRow || codeRow.status !== "active") {
          await track(analytics, "referral_signup_code_invalid", { refereeUserId, normalized });
          return { status: "ignored", reason: "invalid_code" };
        }

        assertNoSelfReferralOrThrow(codeRow.referrer_user_id, refereeUserId);

        const existing = await repo.findAttributionByRefereeUserId(client, refereeUserId);
        if (existing) {
          return { status: "ignored", reason: "already_attributed" };
        }

        const used = await repo.countActiveAttributionsForCode(client, codeRow.id);
        if (used >= Number(codeRow.max_redemptions)) {
          await track(analytics, "referral_signup_code_exhausted", {
            referralCodeId: codeRow.id,
            refereeUserId
          });
          return { status: "rejected", reason: "code_exhausted" };
        }

        let refereeEmail = requestContext.refereeEmail ?? null;
        let referrerEmail = requestContext.referrerEmail ?? null;
        if ((!refereeEmail || !referrerEmail) && typeof db.query === "function") {
          try {
            const er = await db.query(`SELECT id, email FROM users WHERE id = $1 OR id = $2`, [
              refereeUserId,
              codeRow.referrer_user_id
            ]);
            const byId = new Map(er.rows.map((r) => [Number(r.id), String(r.email || "").trim()]));
            refereeEmail = refereeEmail || byId.get(refereeUserId) || null;
            referrerEmail = referrerEmail || byId.get(codeRow.referrer_user_id) || null;
          } catch {
            refereeEmail = refereeEmail || null;
            referrerEmail = referrerEmail || null;
          }
        }

        const thresholds = getTrustSignalThresholds(cfgSource);
        const fraud = await evaluateAttributionFraudRisk({
          refereeUserId,
          referrerUserId: codeRow.referrer_user_id,
          referralCodeId: codeRow.id,
          requestContext,
          thresholds,
          refereeEmail,
          referrerEmail,
          duplicateAccountGuard: duplicateAccountGuard || undefined
        });
        if (!fraud.ok) {
          const dupHit = fraud.reasons.includes("duplicate_account_blocked");
          await track(analytics, dupHit ? "referral_signup_duplicate_blocked" : "referral_signup_fraud_blocked", {
            refereeUserId,
            reasons: fraud.reasons
          });
          return { status: "rejected", reason: fraud.reasons[0] || "fraud_blocked" };
        }

        await repo.insertAttribution(client, {
          referral_code_id: codeRow.id,
          referrer_user_id: codeRow.referrer_user_id,
          referee_user_id: refereeUserId,
          status: "pending_purchase",
          metadata: { signupChannel: requestContext.signupChannel || null }
        });

        await track(analytics, "referral_attribution_pending_purchase", {
          referralCodeId: codeRow.id,
          referrerUserId: codeRow.referrer_user_id,
          refereeUserId
        });

        if (trustFlagService && fraud.reviewSignals && fraud.reviewSignals.length) {
          for (const s of fraud.reviewSignals) {
            await trustFlagService.recordFlag(cfgSource, {
              domain: "referral",
              flagType: s.flagType,
              severity: s.severity,
              subjectUserId: s.subjectUserId || refereeUserId,
              relatedEntityType: "referral_attribution",
              relatedEntityId: String(refereeUserId),
              metadata: {
                ...s.metadata,
                referrerUserId: codeRow.referrer_user_id,
                referralCodeId: codeRow.id
              }
            });
          }
        }

        return { status: "attached" };
      });
    } catch (err) {
      if (err && err.code === "23505") {
        return { status: "ignored", reason: "already_attributed" };
      }
      if (err && err.name === "SelfReferralError") {
        await track(analytics, "referral_signup_self_blocked", { refereeUserId });
        return { status: "rejected", reason: "self_referral" };
      }
      log.warn({ err, refereeUserId }, "referral_try_attribute_failed");
      throw err;
    }
  }

  /**
   * Ledger earns run in their own transactions (see rewards-ledger-service); never nest them
   * inside referral row locks. Final state flip uses a single UPDATE … WHERE status='pending_clear'.
   */
  /**
   * @param {object} [options]
   * @param {boolean} [options.forceClearHold] Admin-only: release pending_clear even if hold window not elapsed (order must still be completed).
   */
  async function tryReleaseQualifiedRewards(attributionId, now = new Date(), options = {}) {
    const forceClearHold = Boolean(options && options.forceClearHold);
    const c = cfg();
    const gate = await db.withTransaction(async (client) => {
      const locked = await repo.findAttributionByIdForUpdate(client, attributionId);
      if (!locked || locked.status !== "pending_clear") {
        return { proceed: false };
      }
      const order = await repo.getOrderById(client, locked.first_qualified_order_id);
      if (!order || String(order.status) !== "completed") {
        await repo.updateAttribution(client, locked.id, {
          status: "voided",
          void_reason: "order_not_completed_at_release"
        });
        await track(analytics, "referral_voided_order_state", {
          attributionId: locked.id,
          orderId: locked.first_qualified_order_id
        });
        return { proceed: false };
      }
      if (!forceClearHold && !isClearWindowSatisfied(now, locked.clear_after_at)) {
        return { proceed: false, reason: "hold_active" };
      }
      const since = startOfUtcDayIso(now);
      const already = await repo.countQualifiedReferralsForReferrerSince(client, locked.referrer_user_id, since);
      if (c.maxReferrerRewardsPerDay > 0 && already >= c.maxReferrerRewardsPerDay) {
        await track(analytics, "referral_release_cap_blocked", {
          attributionId: locked.id,
          referrerUserId: locked.referrer_user_id,
          already
        });
        return { proceed: false, reason: "referrer_daily_cap" };
      }
      return { proceed: true, locked };
    });

    if (!gate.proceed) {
      return { released: false, reason: gate.reason };
    }

    const { locked } = gate;
    let referrerLedgerEntryId = null;
    let refereeLedgerEntryId = null;

    try {
      if (rewardsLedger && Number(c.referrerRewardPointsMinor) > 0) {
        const r = await rewardsLedger.earnPoints({
          userId: locked.referrer_user_id,
          points: c.referrerRewardPointsMinor,
          reason: "referral_qualified",
          idempotencyKey: `referral:qualified:referrer:${locked.id}`,
          metadata: { attributionId: locked.id, orderId: locked.first_qualified_order_id }
        });
        referrerLedgerEntryId = r.ledgerEntry.id;
      }
      if (rewardsLedger && Number(c.refereeRewardPointsMinor) > 0) {
        const r = await rewardsLedger.earnPoints({
          userId: locked.referee_user_id,
          points: c.refereeRewardPointsMinor,
          reason: "referral_qualified",
          idempotencyKey: `referral:qualified:referee:${locked.id}`,
          metadata: { attributionId: locked.id, orderId: locked.first_qualified_order_id }
        });
        refereeLedgerEntryId = r.ledgerEntry.id;
      }

      const upRowCount = await repo.finalizeQualifiedReleaseOnPool(db, {
        attributionId: locked.id,
        referrerLedgerEntryId,
        refereeLedgerEntryId
      });

      if (upRowCount === 0) {
        if (referrerLedgerEntryId && rewardsLedger) {
          try {
            await rewardsLedger.reverseEntry({
              userId: locked.referrer_user_id,
              originalLedgerEntryId: referrerLedgerEntryId,
              reason: "referral_release_race",
              idempotencyKey: `referral:race_rev:ref:${locked.id}:${referrerLedgerEntryId}`,
              metadata: { attributionId: locked.id }
            });
          } catch (e) {
            log.warn({ err: e, attributionId: locked.id }, "referral_race_reverse_referrer_failed");
          }
        }
        if (refereeLedgerEntryId && rewardsLedger) {
          try {
            await rewardsLedger.reverseEntry({
              userId: locked.referee_user_id,
              originalLedgerEntryId: refereeLedgerEntryId,
              reason: "referral_release_race",
              idempotencyKey: `referral:race_rev:refe:${locked.id}:${refereeLedgerEntryId}`,
              metadata: { attributionId: locked.id }
            });
          } catch (e) {
            log.warn({ err: e, attributionId: locked.id }, "referral_race_reverse_referee_failed");
          }
        }
        return { released: false, reason: "race_lost" };
      }

      await track(analytics, "referral_qualified_released", {
        attributionId: locked.id,
        referrerUserId: locked.referrer_user_id,
        refereeUserId: locked.referee_user_id,
        orderId: locked.first_qualified_order_id,
        referrerPoints: c.referrerRewardPointsMinor,
        refereePoints: c.refereeRewardPointsMinor
      });

      return { released: true };
    } catch (err) {
      log.warn({ err, attributionId: locked.id }, "referral_release_failed");
      throw err;
    }
  }

  async function onOrderCompleted({ orderId, now = new Date() }) {
    const c = cfg();
    let attributionIdToTryRelease = null;
    const summary = await db.withTransaction(async (client) => {
      const order = await repo.getOrderById(client, orderId);
      if (!order || !order.buyer_user_id) {
        return { evaluated: false };
      }

      const attr = await repo.findAttributionByRefereeUserId(client, order.buyer_user_id);
      if (!attr || attr.status !== "pending_purchase") {
        return { evaluated: false };
      }

      if (
        !purchaseWithinAttributionWindow(attr.attributed_at, order.created_at, c.attributionWindowDays)
      ) {
        await repo.updateAttribution(client, attr.id, {
          status: "expired",
          void_reason: "outside_attribution_window"
        });
        await track(analytics, "referral_expired_window", { attributionId: attr.id, orderId });
        return { evaluated: true, transitioned: "expired" };
      }

      const q = orderQualifiesForReferral(order, c);
      if (!q.ok) {
        await track(analytics, "referral_order_not_qualifying", {
          attributionId: attr.id,
          orderId,
          reason: q.reason
        });
        return { evaluated: true, transitioned: "unchanged" };
      }

      const clearAfter = computeClearAfterAt(order.created_at, c.holdClearHoursAfterOrder);
      await repo.updateAttribution(client, attr.id, {
        status: "pending_clear",
        first_qualified_order_id: orderId,
        clear_after_at: clearAfter
      });
      await track(analytics, "referral_pending_clear", {
        attributionId: attr.id,
        orderId,
        clearAfterAt: clearAfter.toISOString()
      });
      attributionIdToTryRelease = attr.id;
      return { evaluated: true, transitioned: "pending_clear" };
    });

    if (attributionIdToTryRelease) {
      await tryReleaseQualifiedRewards(attributionIdToTryRelease, now);
      const st = await db.withTransaction(async (client) => {
        const r = await repo.findAttributionByIdForUpdate(client, attributionIdToTryRelease);
        return r?.status || null;
      });
      return {
        ...summary,
        transitioned: st === "qualified" ? "qualified" : summary.transitioned
      };
    }

    return summary;
  }

  async function releasePendingReferralsIfReady({ now = new Date() } = {}) {
    const rows = await repo.listPendingClearReadyPool(db, { now, limit: 100 });
    const results = [];
    for (const row of rows) {
      try {
        const r = await tryReleaseQualifiedRewards(row.id, now);
        results.push({ id: row.id, ...r });
      } catch (err) {
        log.warn({ err, attributionId: row.id }, "referral_release_row_failed");
        results.push({ id: row.id, released: false, error: true });
      }
    }
    return results;
  }

  /**
   * Read-only signup UX: whether a code string could attach (does not create rows).
   */
  async function peekReferralCodeStatus({ rawReferralCode }) {
    const normalized = normalizeReferralCode(rawReferralCode);
    if (!normalized) {
      return { ok: false, reason: "no_code" };
    }
    const row = await repo.findCodeByNormalizedPool(db, normalized);
    if (!row || String(row.status) !== "active") {
      return { ok: false, reason: "invalid_code" };
    }
    const used = await repo.countActiveAttributionsForCodePool(db, row.id);
    const maxRedemptions = Number(row.max_redemptions);
    const exhausted = maxRedemptions > 0 && used >= maxRedemptions;
    return { ok: true, exhausted };
  }

  async function onOrderFinanciallyInvalidated({ orderId, reason }) {
    const rows = await repo.findAttributionsByOrderIdPool(db, orderId);
    if (!rows.length) {
      return { processed: 0 };
    }

    let processed = 0;
    for (const attr of rows) {
      await db.withTransaction(async (client) => {
        const locked = await repo.findAttributionByIdForUpdate(client, attr.id);
        if (!locked) {
          return;
        }
        if (locked.status === "pending_clear") {
          await repo.updateAttribution(client, locked.id, {
            status: "voided",
            void_reason: reason || "payment_invalidated"
          });
          await track(analytics, "referral_voided_refund", {
            attributionId: locked.id,
            orderId,
            reason
          });
          processed += 1;
          return;
        }
        if (locked.status === "qualified") {
          const c = cfg();
          if (rewardsLedger && locked.referrer_ledger_entry_id && Number(c.referrerRewardPointsMinor) > 0) {
            try {
              await rewardsLedger.reverseEntry({
                userId: locked.referrer_user_id,
                originalLedgerEntryId: locked.referrer_ledger_entry_id,
                reason: "referral_refund",
                idempotencyKey: `referral:reverse:referrer:${locked.id}:${locked.referrer_ledger_entry_id}`,
                metadata: { attributionId: locked.id, orderId }
              });
            } catch (err) {
              log.warn({ err, attributionId: locked.id }, "referral_reverse_referrer_failed");
            }
          }
          if (rewardsLedger && locked.referee_ledger_entry_id && Number(c.refereeRewardPointsMinor) > 0) {
            try {
              await rewardsLedger.reverseEntry({
                userId: locked.referee_user_id,
                originalLedgerEntryId: locked.referee_ledger_entry_id,
                reason: "referral_refund",
                idempotencyKey: `referral:reverse:referee:${locked.id}:${locked.referee_ledger_entry_id}`,
                metadata: { attributionId: locked.id, orderId }
              });
            } catch (err) {
              log.warn({ err, attributionId: locked.id }, "referral_reverse_referee_failed");
            }
          }
          await repo.updateAttribution(client, locked.id, {
            status: "voided",
            void_reason: reason || "payment_invalidated",
            metadata: { clawedBackAt: new Date().toISOString() }
          });
          await track(analytics, "referral_reversal_applied", {
            attributionId: locked.id,
            orderId,
            reason
          });
          const thr = getTrustSignalThresholds(cfgSource);
          const clawbackCandidate = maybeReferralQualifiedClawbackTrustFlag({
            thresholds: thr,
            referrerUserId: locked.referrer_user_id,
            attributionId: locked.id,
            orderId,
            reason
          });
          await tryRecordTrustFlag(cfgSource, trustFlagService, clawbackCandidate);
          processed += 1;
        }
      });
    }
    return { processed };
  }

  return {
    ensurePrimaryReferralCodeForUser,
    tryAttributeOnSignup,
    peekReferralCodeStatus,
    onOrderCompleted,
    tryReleaseQualifiedRewards,
    releasePendingReferralsIfReady,
    onOrderFinanciallyInvalidated
  };
}

module.exports = {
  createReferralService
};
