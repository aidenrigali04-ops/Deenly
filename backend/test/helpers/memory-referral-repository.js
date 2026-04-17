const { generateReferralCodeCandidate } = require("../../src/modules/referrals/referral-repository");

/**
 * In-memory referral store for unit tests (same method shapes as createReferralRepository()).
 */
function createMemoryReferralRepository() {
  const codes = [];
  const attributions = [];
  let nextCodeId = 1;
  let nextAttrId = 1;

  async function findCodeByNormalized(_client, normalizedCode) {
    return codes.find((c) => String(c.code).toLowerCase() === normalizedCode) || null;
  }

  async function findCodeByReferrerUserId(_client, referrerUserId) {
    return codes.find((c) => Number(c.referrer_user_id) === Number(referrerUserId)) || null;
  }

  async function insertReferralCode(_client, row) {
    const rec = {
      id: nextCodeId++,
      referrer_user_id: row.referrer_user_id,
      code: row.code,
      status: row.status || "active",
      max_redemptions: row.max_redemptions,
      attributable_signups_count: 0,
      created_at: new Date(),
      updated_at: new Date()
    };
    codes.push(rec);
    return rec;
  }

  async function countActiveAttributionsForCode(_client, referralCodeId) {
    return attributions.filter(
      (a) =>
        Number(a.referral_code_id) === Number(referralCodeId) &&
        ["pending_purchase", "pending_clear", "qualified"].includes(a.status)
    ).length;
  }

  async function insertAttribution(_client, row) {
    const rec = {
      id: nextAttrId++,
      referral_code_id: row.referral_code_id,
      referrer_user_id: row.referrer_user_id,
      referee_user_id: row.referee_user_id,
      status: row.status,
      attributed_at: row.attributed_at != null ? new Date(row.attributed_at) : new Date(),
      first_qualified_order_id: null,
      clear_after_at: null,
      referrer_ledger_entry_id: null,
      referee_ledger_entry_id: null,
      qualified_at: null,
      void_reason: null,
      metadata: row.metadata || {},
      created_at: new Date(),
      updated_at: new Date()
    };
    attributions.push(rec);
    const code = codes.find((c) => c.id === row.referral_code_id);
    if (code) {
      code.attributable_signups_count += 1;
    }
    return rec;
  }

  async function findAttributionByRefereeUserId(_client, refereeUserId) {
    return attributions.find((a) => Number(a.referee_user_id) === Number(refereeUserId)) || null;
  }

  async function findAttributionByIdForUpdate(_client, id) {
    return attributions.find((a) => Number(a.id) === Number(id)) || null;
  }

  async function findAttributionsByOrderId(_client, orderId) {
    return attributions.filter((a) => Number(a.first_qualified_order_id) === Number(orderId));
  }

  async function updateAttribution(_client, id, patch) {
    const a = attributions.find((x) => Number(x.id) === Number(id));
    if (!a) {
      return null;
    }
    if (patch.status != null) {
      a.status = patch.status;
    }
    if (patch.first_qualified_order_id !== undefined) {
      a.first_qualified_order_id = patch.first_qualified_order_id;
    }
    if (patch.attributed_at !== undefined) {
      const v = patch.attributed_at;
      a.attributed_at = v instanceof Date ? v : new Date(v);
    }
    if (patch.clear_after_at !== undefined) {
      a.clear_after_at = patch.clear_after_at;
    }
    if (patch.referrer_ledger_entry_id !== undefined) {
      a.referrer_ledger_entry_id = patch.referrer_ledger_entry_id;
    }
    if (patch.referee_ledger_entry_id !== undefined) {
      a.referee_ledger_entry_id = patch.referee_ledger_entry_id;
    }
    if (patch.qualified_at !== undefined) {
      a.qualified_at = patch.qualified_at;
    }
    if (patch.void_reason !== undefined) {
      a.void_reason = patch.void_reason;
    }
    if (patch.metadata != null) {
      a.metadata = { ...a.metadata, ...patch.metadata };
    }
    a.updated_at = new Date();
    return { ...a };
  }

  const ordersById = new Map();

  function seedOrder(order) {
    ordersById.set(Number(order.id), { ...order });
  }

  async function getOrderById(_client, orderId) {
    return ordersById.get(Number(orderId)) || null;
  }

  async function findOrdersByStripePaymentIntentId(_client, paymentIntentId) {
    return [...ordersById.values()].filter((o) => String(o.stripe_payment_intent_id) === String(paymentIntentId));
  }

  async function updateOrderStatus(_client, orderId, status) {
    const o = ordersById.get(Number(orderId));
    if (o) {
      o.status = status;
    }
  }

  async function countQualifiedReferralsForReferrerSince(_client, referrerUserId, since) {
    const sinceMs = new Date(since).getTime();
    return attributions.filter(
      (a) =>
        Number(a.referrer_user_id) === Number(referrerUserId) &&
        a.status === "qualified" &&
        a.qualified_at &&
        new Date(a.qualified_at).getTime() >= sinceMs
    ).length;
  }

  async function findAttributionsByOrderIdPool(_db, orderId) {
    return attributions.filter((a) => Number(a.first_qualified_order_id) === Number(orderId));
  }

  async function listPendingClearReadyPool(_db, { now, limit = 50 }) {
    const n = now instanceof Date ? now.getTime() : Date.parse(String(now));
    return attributions
      .filter((a) => {
        if (a.status !== "pending_clear") {
          return false;
        }
        if (a.clear_after_at == null) {
          return true;
        }
        const c = a.clear_after_at instanceof Date ? a.clear_after_at.getTime() : Date.parse(String(a.clear_after_at));
        return Number.isFinite(c) && n >= c;
      })
      .slice(0, limit);
  }

  async function finalizeQualifiedReleaseOnPool(_db, { attributionId, referrerLedgerEntryId, refereeLedgerEntryId }) {
    const a = attributions.find((x) => Number(x.id) === Number(attributionId) && x.status === "pending_clear");
    if (!a) {
      return 0;
    }
    a.status = "qualified";
    a.referrer_ledger_entry_id = referrerLedgerEntryId;
    a.referee_ledger_entry_id = refereeLedgerEntryId;
    a.qualified_at = new Date();
    a.updated_at = new Date();
    return 1;
  }

  async function findCodeByReferrerUserIdPool(_db, referrerUserId) {
    return findCodeByReferrerUserId(null, referrerUserId);
  }

  async function findCodeByNormalizedPool(_db, normalizedCode) {
    return findCodeByNormalized(null, normalizedCode);
  }

  async function countActiveAttributionsForCodePool(_db, referralCodeId) {
    return countActiveAttributionsForCode(null, referralCodeId);
  }

  async function findAttributionByRefereeUserIdPool(_db, refereeUserId) {
    return findAttributionByRefereeUserId(null, refereeUserId);
  }

  async function countQualifiedReferralsForReferrerAllTimePool(_db, referrerUserId) {
    return attributions.filter((a) => Number(a.referrer_user_id) === Number(referrerUserId) && a.status === "qualified")
      .length;
  }

  return {
    generateReferralCodeCandidate,
    findCodeByNormalized,
    findCodeByReferrerUserId,
    insertReferralCode,
    countActiveAttributionsForCode,
    insertAttribution,
    findAttributionByRefereeUserId,
    findAttributionByIdForUpdate,
    findAttributionsByOrderId,
    updateAttribution,
    getOrderById,
    findOrdersByStripePaymentIntentId,
    updateOrderStatus,
    countQualifiedReferralsForReferrerSince,
    findAttributionsByOrderIdPool,
    listPendingClearReadyPool,
    finalizeQualifiedReleaseOnPool,
    findCodeByReferrerUserIdPool,
    findCodeByNormalizedPool,
    countActiveAttributionsForCodePool,
    findAttributionByRefereeUserIdPool,
    countQualifiedReferralsForReferrerAllTimePool,
    seedOrder,
    _attributions() {
      return attributions.slice();
    },
    _codes() {
      return codes.slice();
    }
  };
}

module.exports = {
  createMemoryReferralRepository
};
