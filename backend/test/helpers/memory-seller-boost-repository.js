/**
 * In-memory seller boost store for unit tests.
 * @param {{ postAuthorById?: Map<number, number> }} opts postId -> authorUserId
 */
function createMemorySellerBoostRepository(opts = {}) {
  const postAuthorById = opts.postAuthorById instanceof Map ? opts.postAuthorById : new Map();
  const purchases = new Map();
  const targetsByPurchase = new Map();
  const impressions = [];
  let nextPurchaseId = 1;

  function purchaseTargets(pid) {
    if (!targetsByPurchase.has(pid)) {
      targetsByPurchase.set(pid, new Set());
    }
    return targetsByPurchase.get(pid);
  }

  async function countPostsOwnedBySeller(_client, postIds, sellerUserId) {
    let c = 0;
    for (const id of postIds) {
      if (Number(postAuthorById.get(id)) === Number(sellerUserId)) {
        c += 1;
      }
    }
    return c;
  }

  async function findPurchaseBySellerIdempotency(_client, sellerUserId, idempotencyKey) {
    for (const row of purchases.values()) {
      if (row.seller_user_id === sellerUserId && row.idempotency_key === idempotencyKey) {
        return { ...row };
      }
    }
    return null;
  }

  async function insertPurchaseWithTargets(_client, row, postIds) {
    const id = nextPurchaseId++;
    const rec = {
      id,
      seller_user_id: row.seller_user_id,
      checkout_session_id: row.checkout_session_id ?? null,
      package_tier_id: row.package_tier_id,
      amount_minor: row.amount_minor,
      currency: row.currency,
      status: "pending_payment",
      starts_at: null,
      ends_at: null,
      activated_at: null,
      canceled_at: null,
      idempotency_key: row.idempotency_key,
      payment_confirmation_id: null,
      metadata: row.metadata || {},
      created_at: new Date(),
      updated_at: new Date()
    };
    purchases.set(id, rec);
    const tset = purchaseTargets(id);
    for (const postId of postIds) {
      tset.add(postId);
    }
    return { ...rec };
  }

  async function getPurchaseByIdForSeller(_client, purchaseId, sellerUserId) {
    const row = purchases.get(Number(purchaseId));
    if (!row || row.seller_user_id !== sellerUserId) {
      return null;
    }
    return { ...row };
  }

  async function activateFromPending(_client, purchaseId, sellerUserId, fields) {
    const row = purchases.get(Number(purchaseId));
    if (!row || row.seller_user_id !== sellerUserId || row.status !== "pending_payment") {
      return null;
    }
    row.status = "active";
    row.starts_at = new Date(fields.startsAtIso);
    row.ends_at = new Date(fields.endsAtIso);
    row.activated_at = new Date(fields.activatedAtIso);
    row.payment_confirmation_id = fields.paymentConfirmationId || null;
    if (fields.checkoutSessionId != null) {
      row.checkout_session_id = fields.checkoutSessionId;
    }
    row.updated_at = new Date();
    return { ...row };
  }

  async function cancelPending(_client, purchaseId, sellerUserId) {
    const row = purchases.get(Number(purchaseId));
    if (!row || row.seller_user_id !== sellerUserId || row.status !== "pending_payment") {
      return false;
    }
    row.status = "canceled";
    row.canceled_at = new Date();
    row.updated_at = new Date();
    return true;
  }

  async function markRefunded(_client, purchaseId, sellerUserId) {
    const row = purchases.get(Number(purchaseId));
    if (!row || row.seller_user_id !== sellerUserId) {
      return false;
    }
    if (row.status !== "pending_payment" && row.status !== "active") {
      return false;
    }
    row.status = "refunded";
    row.updated_at = new Date();
    return true;
  }

  async function expireIfDue(_client, purchaseId, asOfIso) {
    const row = purchases.get(Number(purchaseId));
    if (!row || row.status !== "active" || !row.ends_at) {
      return false;
    }
    if (new Date(row.ends_at).getTime() > new Date(asOfIso).getTime()) {
      return false;
    }
    row.status = "expired";
    row.updated_at = new Date();
    return true;
  }

  async function expireActiveDueBatch(_client, asOfIso) {
    const asOf = new Date(asOfIso).getTime();
    const ids = [];
    for (const [id, row] of [...purchases.entries()]) {
      if (
        row.status === "active" &&
        row.ends_at &&
        new Date(row.ends_at).getTime() <= asOf
      ) {
        row.status = "expired";
        row.updated_at = new Date();
        ids.push(id);
      }
    }
    return ids;
  }

  async function insertImpressionIfActiveTarget(_client, { purchaseId, postId, viewerUserId, metadata }) {
    const row = purchases.get(Number(purchaseId));
    if (!row || row.status !== "active" || !row.ends_at || new Date(row.ends_at) <= new Date()) {
      return false;
    }
    const tset = purchaseTargets(Number(purchaseId));
    if (!tset.has(Number(postId))) {
      return false;
    }
    impressions.push({
      purchase_id: purchaseId,
      post_id: postId,
      viewer_user_id: viewerUserId,
      metadata
    });
    return true;
  }

  async function listTargetsForPurchase(_client, purchaseId) {
    const tset = purchaseTargets(Number(purchaseId));
    return [...tset];
  }

  async function fetchPurchaseForSeller(poolQuery, purchaseId, sellerUserId) {
    void poolQuery;
    return getPurchaseByIdForSeller(null, purchaseId, sellerUserId);
  }

  async function fetchTargetsForPurchase(poolQuery, purchaseId) {
    void poolQuery;
    return listTargetsForPurchase(null, purchaseId);
  }

  async function listPurchasesForSeller(_poolQuery, sellerUserId, limit) {
    const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const rows = [...purchases.values()]
      .filter((r) => r.seller_user_id === sellerUserId)
      .sort((a, b) => b.id - a.id)
      .slice(0, lim)
      .map((r) => ({ ...r }));
    return rows;
  }

  return {
    countPostsOwnedBySeller,
    findPurchaseBySellerIdempotency,
    insertPurchaseWithTargets,
    getPurchaseByIdForSeller,
    activateFromPending,
    cancelPending,
    markRefunded,
    expireIfDue,
    expireActiveDueBatch,
    insertImpressionIfActiveTarget,
    listTargetsForPurchase,
    fetchPurchaseForSeller,
    fetchTargetsForPurchase,
    listPurchasesForSeller,
    _impressions: () => impressions.slice(),
    _setPostAuthor(postId, authorId) {
      postAuthorById.set(Number(postId), Number(authorId));
    }
  };
}

function createMemoryDbForSellerBoost() {
  return {
    withTransaction: async (fn) => fn({}),
    query: async () => {
      throw new Error("use repository pool helpers or withTransaction only in memory tests");
    }
  };
}

module.exports = {
  createMemorySellerBoostRepository,
  createMemoryDbForSellerBoost
};
