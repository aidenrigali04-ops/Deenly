const {
  toRewardLedgerEntryListItemDto,
  toReferralAttributionQueueItemDto,
  toFraudFlagItemDto,
  toCheckoutRewardRedemptionListItemDto,
  toRewardFraudFlagQueueItemDto
} = require("./rewards-admin-dto");

const LEDGER_KINDS = new Set(["earn", "spend", "reversal"]);
const REFERRAL_QUEUE_STATUSES = new Set(["pending_purchase", "pending_clear"]);
const FRAUD_FLAG_QUEUE_STATUSES = new Set(["open", "triaged", "dismissed", "confirmed"]);

/**
 * @param {object} q
 * @returns {{ userId: number | null; entryKind: string | null; reasonPrefix: string | null; since: string | null; until: string | null; limit: number; offset: number }}
 */
function parseLedgerListFilters(q) {
  const userIdRaw = q.userId != null && String(q.userId).trim() !== "" ? Number(q.userId) : null;
  const userId = userIdRaw != null && Number.isInteger(userIdRaw) && userIdRaw > 0 ? userIdRaw : null;
  const entryKindRaw = q.entryKind != null ? String(q.entryKind).trim().toLowerCase() : null;
  const entryKind = entryKindRaw && LEDGER_KINDS.has(entryKindRaw) ? entryKindRaw : null;
  const reasonPrefix = q.reasonPrefix != null && String(q.reasonPrefix).trim() ? String(q.reasonPrefix).trim() : null;
  const since = q.since != null && String(q.since).trim() ? String(q.since).trim() : null;
  const until = q.until != null && String(q.until).trim() ? String(q.until).trim() : null;
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
  const offset = Math.max(Number(q.offset) || 0, 0);
  return { userId, entryKind, reasonPrefix, since, until, limit, offset };
}

/**
 * @param {object} q
 */
/**
 * @param {object} q querystring (optional `queueStatus`, `queueLimit`, `queueOffset`)
 * @returns {{ status: string | null; limit: number; offset: number }}
 */
function parseFraudFlagQueueFilters(q) {
  const statusRaw = q.queueStatus != null ? String(q.queueStatus).trim().toLowerCase() : null;
  const status = statusRaw && FRAUD_FLAG_QUEUE_STATUSES.has(statusRaw) ? statusRaw : null;
  const limit = Math.min(Math.max(Number(q.queueLimit) || 30, 1), 100);
  const offset = Math.max(Number(q.queueOffset) || 0, 0);
  return { status, limit, offset };
}

function parseReferralQueueFilters(q) {
  const statusRaw = q.status != null ? String(q.status).trim().toLowerCase() : null;
  const status = statusRaw && REFERRAL_QUEUE_STATUSES.has(statusRaw) ? statusRaw : null;
  const referrerUserIdRaw =
    q.referrerUserId != null && String(q.referrerUserId).trim() !== "" ? Number(q.referrerUserId) : null;
  const referrerUserId =
    referrerUserIdRaw != null && Number.isInteger(referrerUserIdRaw) && referrerUserIdRaw > 0
      ? referrerUserIdRaw
      : null;
  const refereeUserIdRaw =
    q.refereeUserId != null && String(q.refereeUserId).trim() !== "" ? Number(q.refereeUserId) : null;
  const refereeUserId =
    refereeUserIdRaw != null && Number.isInteger(refereeUserIdRaw) && refereeUserIdRaw > 0
      ? refereeUserIdRaw
      : null;
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
  const offset = Math.max(Number(q.offset) || 0, 0);
  return { status, referrerUserId, refereeUserId, limit, offset };
}

/**
 * @param {*} db
 * @param {ReturnType<typeof parseLedgerListFilters>} f
 */
async function listRewardLedgerEntries(db, f) {
  const params = [];
  let i = 1;
  const where = [];
  if (f.userId) {
    where.push(`a.user_id = $${i++}`);
    params.push(f.userId);
  }
  if (f.entryKind) {
    where.push(`e.entry_kind = $${i++}`);
    params.push(f.entryKind);
  }
  if (f.reasonPrefix) {
    where.push(`e.reason LIKE $${i++}`);
    params.push(`${f.reasonPrefix}%`);
  }
  if (f.since) {
    where.push(`e.created_at >= $${i++}::timestamptz`);
    params.push(f.since);
  }
  if (f.until) {
    where.push(`e.created_at <= $${i++}::timestamptz`);
    params.push(f.until);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  params.push(f.limit + 1, f.offset);
  const limIdx = i++;
  const offIdx = i++;
  const res = await db.query(
    `SELECT e.id,
            e.delta_points,
            e.entry_kind,
            e.reason,
            e.idempotency_key,
            e.metadata,
            e.reverses_ledger_entry_id,
            e.created_at,
            a.user_id
     FROM reward_ledger_entries e
     JOIN reward_accounts a ON a.id = e.reward_account_id
     ${whereSql}
     ORDER BY e.created_at DESC, e.id DESC
     LIMIT $${limIdx} OFFSET $${offIdx}`,
    params
  );
  const rows = res.rows;
  const hasMore = rows.length > f.limit;
  const items = hasMore ? rows.slice(0, f.limit) : rows;
  return {
    items: items.map(toRewardLedgerEntryListItemDto),
    hasMore,
    nextOffset: hasMore ? f.offset + f.limit : null
  };
}

/**
 * @param {*} db
 * @param {number} id
 */
async function getRewardLedgerEntryDetail(db, id) {
  const res = await db.query(
    `SELECT e.id,
            e.delta_points,
            e.entry_kind,
            e.reason,
            e.idempotency_key,
            e.metadata,
            e.reverses_ledger_entry_id,
            e.created_at,
            a.user_id
     FROM reward_ledger_entries e
     JOIN reward_accounts a ON a.id = e.reward_account_id
     WHERE e.id = $1
     LIMIT 1`,
    [id]
  );
  if (res.rowCount === 0) {
    return null;
  }
  const entry = toRewardLedgerEntryListItemDto(res.rows[0]);
  let reversalOf = null;
  if (res.rows[0].reverses_ledger_entry_id) {
    const orig = await db.query(
      `SELECT e.id,
              e.delta_points,
              e.entry_kind,
              e.reason,
              e.idempotency_key,
              e.metadata,
              e.reverses_ledger_entry_id,
              e.created_at,
              a.user_id
       FROM reward_ledger_entries e
       JOIN reward_accounts a ON a.id = e.reward_account_id
       WHERE e.id = $1
       LIMIT 1`,
      [res.rows[0].reverses_ledger_entry_id]
    );
    if (orig.rowCount) {
      reversalOf = toRewardLedgerEntryListItemDto(orig.rows[0]);
    }
  }
  return { entry, reversalOf };
}

/**
 * @param {*} db
 * @param {ReturnType<typeof parseReferralQueueFilters>} f
 */
async function listReferralAttributionQueue(db, f) {
  const params = [];
  let i = 1;
  const where = [];
  if (f.status) {
    where.push(`ra.status = $${i++}`);
    params.push(f.status);
  } else {
    where.push(`ra.status IN ('pending_purchase', 'pending_clear')`);
  }
  if (f.referrerUserId) {
    where.push(`ra.referrer_user_id = $${i++}`);
    params.push(f.referrerUserId);
  }
  if (f.refereeUserId) {
    where.push(`ra.referee_user_id = $${i++}`);
    params.push(f.refereeUserId);
  }
  const whereSql = `WHERE ${where.join(" AND ")}`;
  params.push(f.limit + 1, f.offset);
  const limIdx = i++;
  const offIdx = i++;
  const res = await db.query(
    `SELECT ra.id,
            ra.referral_code_id,
            ra.referrer_user_id,
            ra.referee_user_id,
            ra.status,
            ra.attributed_at,
            ra.first_qualified_order_id,
            ra.clear_after_at,
            ra.referrer_ledger_entry_id,
            ra.referee_ledger_entry_id,
            ra.qualified_at,
            ra.void_reason,
            ra.metadata,
            ra.created_at
     FROM referral_attributions ra
     ${whereSql}
     ORDER BY ra.id ASC
     LIMIT $${limIdx} OFFSET $${offIdx}`,
    params
  );
  const rows = res.rows;
  const hasMore = rows.length > f.limit;
  const items = hasMore ? rows.slice(0, f.limit) : rows;
  return {
    items: items.map(toReferralAttributionQueueItemDto),
    hasMore,
    nextOffset: hasMore ? f.offset + f.limit : null
  };
}

/**
 * @param {*} db
 * @param {number} id
 */
async function getReferralAttributionById(db, id) {
  const res = await db.query(
    `SELECT ra.id,
            ra.referral_code_id,
            ra.referrer_user_id,
            ra.referee_user_id,
            ra.status,
            ra.attributed_at,
            ra.first_qualified_order_id,
            ra.clear_after_at,
            ra.referrer_ledger_entry_id,
            ra.referee_ledger_entry_id,
            ra.qualified_at,
            ra.void_reason,
            ra.metadata,
            ra.created_at,
            rc.code AS referral_code
     FROM referral_attributions ra
     JOIN referral_codes rc ON rc.id = ra.referral_code_id
     WHERE ra.id = $1
     LIMIT 1`,
    [id]
  );
  if (res.rowCount === 0) {
    return null;
  }
  const row = res.rows[0];
  const dto = toReferralAttributionQueueItemDto(row);
  return { ...dto, referralCode: String(row.referral_code || "") };
}

/** @param {object} [config] */
function getRewardsFraudThresholds(config) {
  const t = config?.rewardsFraudThresholds || {};
  return {
    redemptionVelocityWindowHours: Number(t.redemptionVelocityWindowHours) || 24,
    redemptionVelocityMinCount: Number(t.redemptionVelocityMinCount) || 4,
    reversalBurstWindowDays: Number(t.reversalBurstWindowDays) || 7,
    reversalBurstMinCount: Number(t.reversalBurstMinCount) || 3,
    referralQualifiedVelocityWindowHours: Number(t.referralQualifiedVelocityWindowHours) || 24,
    referralQualifiedVelocityMinCount: Number(t.referralQualifiedVelocityMinCount) || 8,
    voidedAttributionWindowDays: Number(t.voidedAttributionWindowDays) || 7,
    voidedAttributionListLimit: Number(t.voidedAttributionListLimit) || 40
  };
}

/**
 * Persisted rewards-domain fraud queue (`reward_fraud_flags`).
 * @param {*} db
 * @param {ReturnType<typeof parseFraudFlagQueueFilters>} f
 */
async function listRewardFraudFlagRecords(db, f) {
  const params = [];
  let i = 1;
  const where = [];
  if (f.status) {
    where.push(`f.status = $${i++}`);
    params.push(f.status);
  } else {
    where.push(`f.status IN ('open', 'triaged')`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  params.push(f.limit + 1, f.offset);
  const limIdx = i++;
  const offIdx = i++;
  const res = await db.query(
    `SELECT f.id,
            f.flag_type,
            f.severity,
            f.status,
            f.subject_user_id,
            f.related_entity_type,
            f.related_entity_id,
            f.reward_ledger_entry_id,
            f.referral_attribution_id,
            f.seller_boost_purchase_id,
            f.reviewer_user_id,
            f.reviewed_at,
            f.metadata,
            f.created_at,
            f.updated_at
     FROM reward_fraud_flags f
     ${whereSql}
     ORDER BY f.created_at DESC, f.id DESC
     LIMIT $${limIdx} OFFSET $${offIdx}`,
    params
  );
  const rows = res.rows;
  const hasMore = rows.length > f.limit;
  const slice = hasMore ? rows.slice(0, f.limit) : rows;
  return {
    items: slice.map(toRewardFraudFlagQueueItemDto),
    hasMore,
    nextOffset: hasMore ? f.offset + f.limit : null
  };
}

/**
 * @param {*} db
 * @param {number} id
 */
async function getRewardFraudFlagById(db, id) {
  const res = await db.query(
    `SELECT f.id,
            f.flag_type,
            f.severity,
            f.status,
            f.subject_user_id,
            f.related_entity_type,
            f.related_entity_id,
            f.reward_ledger_entry_id,
            f.referral_attribution_id,
            f.seller_boost_purchase_id,
            f.reviewer_user_id,
            f.reviewed_at,
            f.metadata,
            f.created_at,
            f.updated_at
     FROM reward_fraud_flags f
     WHERE f.id = $1
     LIMIT 1`,
    [id]
  );
  if (res.rowCount === 0) {
    return null;
  }
  return toRewardFraudFlagQueueItemDto(res.rows[0]);
}

const FRAUD_REVIEW_ACTIONS = new Map([
  ["dismiss", "dismissed"],
  ["confirm", "confirmed"],
  ["triage", "triaged"]
]);

/**
 * @param {*} db
 * @param {{ id: number; reviewerUserId: number; action: string; notes?: string | null }} input
 */
async function reviewRewardFraudFlag(db, input) {
  const id = Number(input.id);
  const reviewerUserId = Number(input.reviewerUserId);
  if (!Number.isInteger(id) || id < 1 || !Number.isInteger(reviewerUserId) || reviewerUserId < 1) {
    throw new TypeError("id and reviewerUserId must be positive integers");
  }
  const action = String(input.action || "").trim().toLowerCase();
  const nextStatus = FRAUD_REVIEW_ACTIONS.get(action);
  if (!nextStatus) {
    const err = new Error("INVALID_FRAUD_REVIEW_ACTION");
    err.code = "INVALID_FRAUD_REVIEW_ACTION";
    throw err;
  }
  const notes = input.notes != null && String(input.notes).trim() ? String(input.notes).trim().slice(0, 2000) : null;

  return db.withTransaction(async (client) => {
    const lock = await client.query(`SELECT * FROM reward_fraud_flags WHERE id = $1 FOR UPDATE`, [id]);
    if (lock.rowCount === 0) {
      return { ok: false, notFound: true };
    }
    const row = lock.rows[0];
    const cur = String(row.status || "");
    if (!["open", "triaged"].includes(cur)) {
      return { ok: false, conflict: true, current: toRewardFraudFlagQueueItemDto(row) };
    }
    if (action === "triage" && cur === "triaged") {
      const unchanged = toRewardFraudFlagQueueItemDto(row);
      return { ok: true, unchanged: true, flag: unchanged };
    }

    const adminPatch = {
      admin_review: {
        reviewerUserId,
        reviewedAt: new Date().toISOString(),
        action,
        notes
      }
    };
    const upd = await client.query(
      `UPDATE reward_fraud_flags
       SET status = $2::varchar,
           reviewer_user_id = $3,
           reviewed_at = NOW(),
           metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb,
           updated_at = NOW()
       WHERE id = $1
         AND status IN ('open', 'triaged')
       RETURNING id,
                 flag_type,
                 severity,
                 status,
                 subject_user_id,
                 related_entity_type,
                 related_entity_id,
                 reward_ledger_entry_id,
                 referral_attribution_id,
                 seller_boost_purchase_id,
                 reviewer_user_id,
                 reviewed_at,
                 metadata,
                 created_at,
                 updated_at`,
      [id, nextStatus, reviewerUserId, JSON.stringify(adminPatch)]
    );
    if (upd.rowCount === 0) {
      return { ok: false, conflict: true };
    }
    const flag = toRewardFraudFlagQueueItemDto(upd.rows[0]);
    await client.query(
      `INSERT INTO rewards_admin_actions (
         actor_user_id,
         action_kind,
         scope,
         target_kind,
         target_id,
         reward_fraud_flag_id,
         payload
       )
       VALUES ($1, $2, 'fraud', 'reward_fraud_flag', $3, $4, $5::jsonb)`,
      [
        reviewerUserId,
        `fraud_flag_${action}`,
        String(id),
        id,
        JSON.stringify({ fraudFlagId: id, nextStatus, notes })
      ]
    );
    return { ok: true, flag };
  });
}

/**
 * Heuristic fraud / risk signals (same rows as GET fraud-flags `items`); no DB writes.
 * @param {*} db
 * @param {object} [config]
 */
async function buildHeuristicFraudFlagItems(db, config) {
  const th = getRewardsFraudThresholds(config);
  const items = [];

  const redemptionVelocity = await db.query(
    `SELECT r.buyer_user_id AS entity_id,
            COUNT(*)::int AS redemption_count,
            MIN(r.created_at) AS window_start,
            MAX(r.created_at) AS window_end
     FROM checkout_reward_redemptions r
     WHERE r.created_at >= NOW() - ($1::int * interval '1 hour')
     GROUP BY r.buyer_user_id
     HAVING COUNT(*) >= $2::int
     ORDER BY redemption_count DESC
     LIMIT 25`,
    [th.redemptionVelocityWindowHours, th.redemptionVelocityMinCount]
  );
  for (const row of redemptionVelocity.rows) {
    items.push(
      toFraudFlagItemDto({
        flag_type: "checkout_redemption_velocity",
        severity: "medium",
        entity_type: "user",
        entity_id: String(row.entity_id),
        summary: `${row.redemption_count} reward checkouts in ${th.redemptionVelocityWindowHours}h`,
        detected_at: row.window_end,
        metadata: {
          buyerUserId: Number(row.entity_id),
          redemptionCount: Number(row.redemption_count),
          windowStart: row.window_start,
          windowEnd: row.window_end,
          thresholdHours: th.redemptionVelocityWindowHours,
          thresholdMinCount: th.redemptionVelocityMinCount
        }
      })
    );
  }

  const reversalBurst = await db.query(
    `SELECT a.user_id AS entity_id,
            COUNT(*)::int AS reversal_count,
            MAX(e.created_at) AS last_at
     FROM reward_ledger_entries e
     JOIN reward_accounts a ON a.id = e.reward_account_id
     WHERE e.entry_kind = 'reversal'
       AND e.created_at >= NOW() - ($1::int * interval '1 day')
     GROUP BY a.user_id
     HAVING COUNT(*) >= $2::int
     ORDER BY reversal_count DESC
     LIMIT 25`,
    [th.reversalBurstWindowDays, th.reversalBurstMinCount]
  );
  for (const row of reversalBurst.rows) {
    items.push(
      toFraudFlagItemDto({
        flag_type: "ledger_reversal_burst",
        severity: "high",
        entity_type: "user",
        entity_id: String(row.entity_id),
        summary: `${row.reversal_count} reversals in ${th.reversalBurstWindowDays}d`,
        detected_at: row.last_at,
        metadata: {
          userId: Number(row.entity_id),
          reversalCount: Number(row.reversal_count),
          thresholdDays: th.reversalBurstWindowDays,
          thresholdMinCount: th.reversalBurstMinCount
        }
      })
    );
  }

  const refVelocity = await db.query(
    `SELECT ra.referrer_user_id AS entity_id,
            COUNT(*)::int AS qualified_count
     FROM referral_attributions ra
     WHERE ra.status = 'qualified'
       AND ra.qualified_at >= NOW() - ($1::int * interval '1 hour')
     GROUP BY ra.referrer_user_id
     HAVING COUNT(*) >= $2::int
     ORDER BY qualified_count DESC
     LIMIT 25`,
    [th.referralQualifiedVelocityWindowHours, th.referralQualifiedVelocityMinCount]
  );
  for (const row of refVelocity.rows) {
    items.push(
      toFraudFlagItemDto({
        flag_type: "referral_release_velocity",
        severity: "medium",
        entity_type: "user",
        entity_id: String(row.entity_id),
        summary: `${row.qualified_count} qualified referrals in ${th.referralQualifiedVelocityWindowHours}h`,
        detected_at: new Date(),
        metadata: {
          referrerUserId: Number(row.entity_id),
          qualifiedCount: Number(row.qualified_count),
          thresholdHours: th.referralQualifiedVelocityWindowHours,
          thresholdMinCount: th.referralQualifiedVelocityMinCount
        }
      })
    );
  }

  const voidedRecent = await db.query(
    `SELECT ra.id,
            ra.referrer_user_id,
            ra.referee_user_id,
            ra.void_reason,
            ra.updated_at
     FROM referral_attributions ra
     WHERE ra.status = 'voided'
       AND ra.updated_at >= NOW() - ($1::int * interval '1 day')
     ORDER BY ra.updated_at DESC
     LIMIT $2::int`,
    [th.voidedAttributionWindowDays, th.voidedAttributionListLimit]
  );
  for (const row of voidedRecent.rows) {
    items.push(
      toFraudFlagItemDto({
        flag_type: "referral_voided_recent",
        severity: "low",
        entity_type: "referral_attribution",
        entity_id: String(row.id),
        summary: `Voided referral: ${String(row.void_reason || "unknown")}`,
        detected_at: row.updated_at,
        metadata: {
          attributionId: Number(row.id),
          referrerUserId: Number(row.referrer_user_id),
          refereeUserId: Number(row.referee_user_id),
          voidReason: row.void_reason != null ? String(row.void_reason) : null,
          thresholdDays: th.voidedAttributionWindowDays,
          listLimit: th.voidedAttributionListLimit
        }
      })
    );
  }

  return { items, thresholds: th };
}

function heuristicSubjectUserIdFromItem(it) {
  const m = it.metadata && typeof it.metadata === "object" ? it.metadata : {};
  if (typeof m.buyerUserId === "number" && Number.isFinite(m.buyerUserId)) {
    return m.buyerUserId;
  }
  if (typeof m.userId === "number" && Number.isFinite(m.userId)) {
    return m.userId;
  }
  if (typeof m.referrerUserId === "number" && Number.isFinite(m.referrerUserId)) {
    return m.referrerUserId;
  }
  return null;
}

/**
 * Materialize current heuristic signals into `reward_fraud_flags` (deduped by metadata.heuristicFingerprint).
 * @param {*} db
 * @param {object} [config]
 * @returns {Promise<{ inserted: number; skipped: number; thresholds: object; unavailable?: boolean }>}
 */
async function ingestHeuristicFraudFlags(db, config) {
  const { items, thresholds } = await module.exports.buildHeuristicFraudFlagItems(db, config);
  let inserted = 0;
  for (const it of items) {
    const fingerprint = `${it.flagType}:${it.entityType}:${it.entityId}`;
    const subjectUserId = heuristicSubjectUserIdFromItem(it);
    const meta = {
      ...(it.metadata && typeof it.metadata === "object" ? it.metadata : {}),
      heuristicFingerprint: fingerprint,
      heuristicSummary: it.summary,
      detectedAt: it.detectedAt
    };
    try {
      const r = await db.query(
        `INSERT INTO reward_fraud_flags (
           flag_type,
           severity,
           status,
           subject_user_id,
           related_entity_type,
           related_entity_id,
           metadata
         )
         SELECT $1::varchar,
                $2::varchar,
                'open'::varchar,
                $3::integer,
                $4::varchar,
                $5::varchar,
                $6::jsonb
         WHERE NOT EXISTS (
           SELECT 1
           FROM reward_fraud_flags f
           WHERE f.status IN ('open', 'triaged')
             AND (f.metadata->>'heuristicFingerprint') = $7
         )
         RETURNING id`,
        [it.flagType, it.severity, subjectUserId, it.entityType, it.entityId, JSON.stringify(meta), fingerprint]
      );
      if (r.rowCount > 0) {
        inserted += 1;
      }
    } catch (err) {
      if (err && err.code === "42P01") {
        return { inserted: 0, skipped: items.length, thresholds, unavailable: true };
      }
      throw err;
    }
  }
  return { inserted, skipped: items.length - inserted, thresholds };
}

/**
 * Heuristic fraud / risk signals for manual review (not automated decisions).
 * @param {*} db
 * @param {object} [config]
 * @param {object} [query] optional `queueStatus`, `queueLimit`, `queueOffset` for persisted queue slice
 */
async function listOperationalFraudFlags(db, config, query = {}) {
  const queueFilters = parseFraudFlagQueueFilters(query || {});
  let queuedRecords = { items: [], hasMore: false, nextOffset: null };
  try {
    queuedRecords = await listRewardFraudFlagRecords(db, queueFilters);
  } catch (err) {
    if (err && err.code === "42P01") {
      queuedRecords = { items: [], hasMore: false, nextOffset: null, unavailable: true };
    } else {
      throw err;
    }
  }

  const { items, thresholds } = await module.exports.buildHeuristicFraudFlagItems(db, config);
  return { items, thresholds, queuedRecords };
}

/**
 * @param {*} db
 * @param {{ limit: number; offset: number }} page
 */
async function listCheckoutRewardRedemptions(db, page) {
  const res = await db.query(
    `SELECT id,
            stripe_checkout_session_id,
            buyer_user_id,
            product_id,
            points_spent,
            discount_minor,
            status,
            created_at
     FROM checkout_reward_redemptions
     ORDER BY created_at DESC, id DESC
     LIMIT $1 OFFSET $2`,
    [page.limit + 1, page.offset]
  );
  const rows = res.rows;
  const hasMore = rows.length > page.limit;
  const slice = hasMore ? rows.slice(0, page.limit) : rows;
  return {
    items: slice.map(toCheckoutRewardRedemptionListItemDto),
    hasMore,
    nextOffset: hasMore ? page.offset + page.limit : null
  };
}

module.exports = {
  parseLedgerListFilters,
  parseReferralQueueFilters,
  parseFraudFlagQueueFilters,
  listRewardLedgerEntries,
  getRewardLedgerEntryDetail,
  listReferralAttributionQueue,
  getReferralAttributionById,
  listOperationalFraudFlags,
  buildHeuristicFraudFlagItems,
  ingestHeuristicFraudFlags,
  listRewardFraudFlagRecords,
  getRewardFraudFlagById,
  reviewRewardFraudFlag,
  getRewardsFraudThresholds,
  listCheckoutRewardRedemptions,
  LEDGER_KINDS,
  REFERRAL_QUEUE_STATUSES,
  FRAUD_FLAG_QUEUE_STATUSES
};
