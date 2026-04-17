const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { optionalString, requireString } = require("../../utils/validators");
const { createReferralRepository } = require("../referrals/referral-repository");
const {
  parseLedgerListFilters,
  parseReferralQueueFilters,
  listRewardLedgerEntries,
  getRewardLedgerEntryDetail,
  listReferralAttributionQueue,
  getReferralAttributionById,
  listOperationalFraudFlags,
  listCheckoutRewardRedemptions,
  getRewardFraudFlagById,
  reviewRewardFraudFlag,
  ingestHeuristicFraudFlags
} = require("./rewards-admin-queries");

const ATTRIBUTION_REJECTABLE = new Set(["pending_purchase", "pending_clear"]);

/**
 * @param {string} routeBase e.g. "/rewards" for /admin router, or "" when mounted at /monetization/admin/rewards
 * @param {string} suffix e.g. "ledger-entries"
 */
function rewardsRoutePath(routeBase, suffix) {
  const b = routeBase == null || routeBase === "" ? "" : String(routeBase).replace(/\/$/, "");
  const s = suffix.startsWith("/") ? suffix.slice(1) : suffix;
  return b ? `${b}/${s}` : `/${s}`;
}

/**
 * Best-effort reversal of referral ledger credits when an admin rejects an attribution that already has ledger ids.
 * @param {{ referrer_user_id: number; referee_user_id: number; referrer_ledger_entry_id: unknown; referee_ledger_entry_id: unknown }} prior
 */
async function tryReverseReferralLedgerCredits({ prior, attributionId, rewardsLedgerService, analytics }) {
  const out = {
    attempted: Boolean(rewardsLedgerService && typeof rewardsLedgerService.reverseEntry === "function"),
    referrerReversed: false,
    refereeReversed: false,
    referrerError: null,
    refereeError: null
  };
  if (!out.attempted) {
    return out;
  }
  const rid = prior.referrer_ledger_entry_id != null ? Number(prior.referrer_ledger_entry_id) : null;
  const zid = prior.referee_ledger_entry_id != null ? Number(prior.referee_ledger_entry_id) : null;
  const refUid = Number(prior.referrer_user_id);
  const refeUid = Number(prior.referee_user_id);
  if (rid && Number.isInteger(rid) && refUid) {
    try {
      await rewardsLedgerService.reverseEntry({
        userId: refUid,
        originalLedgerEntryId: rid,
        reason: "referral_admin_reject",
        idempotencyKey: `referral:admin_reject:ref:${attributionId}:${rid}`,
        metadata: { attributionId }
      });
      out.referrerReversed = true;
    } catch (err) {
      out.referrerError = err && err.message ? String(err.message) : "reverse_failed";
    }
  }
  if (zid && Number.isInteger(zid) && refeUid) {
    try {
      await rewardsLedgerService.reverseEntry({
        userId: refeUid,
        originalLedgerEntryId: zid,
        reason: "referral_admin_reject",
        idempotencyKey: `referral:admin_reject:refe:${attributionId}:${zid}`,
        metadata: { attributionId }
      });
      out.refereeReversed = true;
    } catch (err) {
      out.refereeError = err && err.message ? String(err.message) : "reverse_failed";
    }
  }
  if (analytics && typeof analytics.trackEvent === "function" && (out.referrerReversed || out.refereeReversed)) {
    try {
      await analytics.trackEvent("admin_referral_reject_ledger_reversed", {
        attributionId,
        referrerReversed: out.referrerReversed,
        refereeReversed: out.refereeReversed
      });
    } catch {
      /* ignore */
    }
  }
  return out;
}

/**
 * @param {import("express").Router} router
 * @param {{ db: object; authMiddleware: import("express").RequestHandler; modGuard: import("express").RequestHandler; analytics: object | null; config?: object | null; rewardsLedgerService?: object | null; referralService?: object | null }} deps
 * @param {{ routeBase?: string }} [options]
 */
function registerRewardsAdminRoutes(router, deps, options = {}) {
  const { db, authMiddleware, modGuard, analytics, config = null, rewardsLedgerService = null, referralService = null } =
    deps;
  const routeBase = options.routeBase === undefined ? "/rewards" : options.routeBase;
  const referralRepo = createReferralRepository();

  async function track(name, payload) {
    if (!analytics || typeof analytics.trackEvent !== "function") {
      return;
    }
    try {
      await analytics.trackEvent(name, payload);
    } catch {
      /* ignore */
    }
  }

  router.get(
    rewardsRoutePath(routeBase, "ledger-entries"),
    authMiddleware,
    modGuard,
    asyncHandler(async (req, res) => {
      const filters = parseLedgerListFilters(req.query || {});
      const result = await listRewardLedgerEntries(db, filters);
      res.status(200).json({
        items: result.items,
        hasMore: result.hasMore,
        nextOffset: result.nextOffset,
        filters
      });
    })
  );

  router.get(
    rewardsRoutePath(routeBase, "ledger-entries/:id"),
    authMiddleware,
    modGuard,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      if (!id) {
        throw httpError(400, "id must be a number");
      }
      const detail = await getRewardLedgerEntryDetail(db, id);
      if (!detail) {
        throw httpError(404, "Ledger entry not found");
      }
      res.status(200).json(detail);
    })
  );

  router.get(
    rewardsRoutePath(routeBase, "referrals/queue"),
    authMiddleware,
    modGuard,
    asyncHandler(async (req, res) => {
      const filters = parseReferralQueueFilters(req.query || {});
      const result = await listReferralAttributionQueue(db, filters);
      res.status(200).json({
        items: result.items,
        hasMore: result.hasMore,
        nextOffset: result.nextOffset,
        filters
      });
    })
  );

  router.get(
    rewardsRoutePath(routeBase, "referrals/attributions/:id"),
    authMiddleware,
    modGuard,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      if (!id) {
        throw httpError(400, "id must be a number");
      }
      const row = await getReferralAttributionById(db, id);
      if (!row) {
        throw httpError(404, "Attribution not found");
      }
      res.status(200).json(row);
    })
  );

  router.post(
    rewardsRoutePath(routeBase, "referrals/attributions/:id/review"),
    authMiddleware,
    modGuard,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      if (!id) {
        throw httpError(400, "id must be a number");
      }
      const action = requireString(req.body?.action, "action", 4, 32);
      const notes = optionalString(req.body?.notes, "notes", 2000);

      if (action === "release_hold") {
        if (!referralService || typeof referralService.tryReleaseQualifiedRewards !== "function") {
          throw httpError(503, "Referral service not configured");
        }
        const prior = await getReferralAttributionById(db, id);
        if (!prior) {
          throw httpError(404, "Attribution not found");
        }
        if (prior.status !== "pending_clear") {
          throw httpError(409, "Only pending_clear attributions can release hold early");
        }
        const release = await referralService.tryReleaseQualifiedRewards(id, new Date(), { forceClearHold: true });
        await track("admin_referral_release_hold", {
          attributionId: id,
          reviewerUserId: req.user.id,
          released: Boolean(release.released),
          reason: release.reason || null
        });
        const row = await getReferralAttributionById(db, id);
        return res.status(200).json({ ok: true, action, release, attribution: row });
      }

      if (action === "mark_reviewed") {
        await db.withTransaction(async (client) => {
          const locked = await referralRepo.findAttributionByIdForUpdate(client, id);
          if (!locked) {
            throw httpError(404, "Attribution not found");
          }
          await referralRepo.updateAttribution(client, id, {
            metadata: {
              admin_review: {
                reviewerUserId: req.user.id,
                reviewedAt: new Date().toISOString(),
                notes: notes || null
              }
            }
          });
        });
        await track("admin_referral_attribution_mark_reviewed", {
          attributionId: id,
          reviewerUserId: req.user.id
        });
        const row = await getReferralAttributionById(db, id);
        return res.status(200).json({ ok: true, action, attribution: row });
      }

      if (action === "reject") {
        const reason = requireString(req.body?.reason, "reason", 3, 64);
        const prior = await db.withTransaction(async (client) => {
          const locked = await referralRepo.findAttributionByIdForUpdate(client, id);
          if (!locked) {
            throw httpError(404, "Attribution not found");
          }
          if (!ATTRIBUTION_REJECTABLE.has(String(locked.status))) {
            throw httpError(
              409,
              "Only pending_purchase or pending_clear attributions can be rejected via this endpoint"
            );
          }
          await referralRepo.updateAttribution(client, id, {
            status: "rejected",
            void_reason: `admin_manual:${reason}`,
            metadata: {
              admin_review: {
                reviewerUserId: req.user.id,
                reviewedAt: new Date().toISOString(),
                notes: notes || null,
                rejectReason: reason
              }
            }
          });
          return locked;
        });

        const ledgerOutcome = await tryReverseReferralLedgerCredits({
          prior,
          attributionId: id,
          rewardsLedgerService,
          analytics
        });

        await track("admin_referral_attribution_rejected", {
          attributionId: id,
          reviewerUserId: req.user.id,
          priorStatus: prior.status
        });
        const row = await getReferralAttributionById(db, id);
        return res.status(200).json({ ok: true, action, attribution: row, ledgerReversal: ledgerOutcome });
      }

      throw httpError(400, "action must be mark_reviewed, reject, or release_hold");
    })
  );

  router.post(
    rewardsRoutePath(routeBase, "fraud-flags/ingest"),
    authMiddleware,
    modGuard,
    asyncHandler(async (_req, res) => {
      const out = await ingestHeuristicFraudFlags(db, config);
      await track("admin_fraud_heuristic_ingest", {
        inserted: out.inserted,
        skipped: out.skipped,
        unavailable: Boolean(out.unavailable)
      });
      res.status(200).json(out);
    })
  );

  router.get(
    rewardsRoutePath(routeBase, "fraud-flags/records/:id"),
    authMiddleware,
    modGuard,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      if (!id) {
        throw httpError(400, "id must be a number");
      }
      const flag = await getRewardFraudFlagById(db, id);
      if (!flag) {
        throw httpError(404, "Fraud flag not found");
      }
      res.status(200).json({ flag });
    })
  );

  router.post(
    rewardsRoutePath(routeBase, "fraud-flags/records/:id/review"),
    authMiddleware,
    modGuard,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      if (!id) {
        throw httpError(400, "id must be a number");
      }
      const action = requireString(req.body?.action, "action", 4, 16);
      const notes = optionalString(req.body?.notes, "notes", 2000);
      try {
        const outcome = await reviewRewardFraudFlag(db, {
          id,
          reviewerUserId: req.user.id,
          action,
          notes
        });
        if (outcome.notFound) {
          throw httpError(404, "Fraud flag not found");
        }
        if (outcome.conflict) {
          throw httpError(409, "Fraud flag is not in a reviewable state");
        }
        await track("admin_reward_fraud_flag_reviewed", {
          fraudFlagId: id,
          reviewerUserId: req.user.id,
          action,
          unchanged: Boolean(outcome.unchanged)
        });
        return res.status(200).json({ ok: true, action, flag: outcome.flag });
      } catch (err) {
        if (err && err.code === "INVALID_FRAUD_REVIEW_ACTION") {
          throw httpError(400, "action must be dismiss, confirm, or triage");
        }
        throw err;
      }
    })
  );

  router.get(
    rewardsRoutePath(routeBase, "fraud-flags"),
    authMiddleware,
    modGuard,
    asyncHandler(async (req, res) => {
      const result = await listOperationalFraudFlags(db, config, req.query || {});
      res.status(200).json(result);
    })
  );

  router.get(
    rewardsRoutePath(routeBase, "redemptions"),
    authMiddleware,
    modGuard,
    asyncHandler(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const result = await listCheckoutRewardRedemptions(db, { limit, offset });
      res.status(200).json({
        items: result.items,
        hasMore: result.hasMore,
        nextOffset: result.nextOffset
      });
    })
  );
}

module.exports = {
  registerRewardsAdminRoutes,
  rewardsRoutePath
};
