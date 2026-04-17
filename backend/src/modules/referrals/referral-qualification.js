/**
 * @param {object} order
 * @param {number|null} order.buyer_user_id
 * @param {number} order.seller_user_id
 * @param {string} order.status
 * @param {string} order.kind
 * @param {number} order.amount_minor
 * @param {object} cfg
 * @param {number} cfg.minQualifyingOrderAmountMinor
 * @param {readonly string[]} cfg.qualifyingOrderKinds
 * @param {boolean} cfg.allowBuyerIsSellerForQualification
 * @returns {{ ok: true } | { ok: false; reason: string }}
 */
function orderQualifiesForReferral(order, cfg) {
  if (!order || !Number.isInteger(Number(order.id))) {
    return { ok: false, reason: "missing_order" };
  }
  const buyerId = order.buyer_user_id != null ? Number(order.buyer_user_id) : null;
  if (!buyerId || buyerId < 1) {
    return { ok: false, reason: "no_buyer" };
  }
  if (String(order.status) !== "completed") {
    return { ok: false, reason: "order_not_completed" };
  }
  const kinds = new Set((cfg.qualifyingOrderKinds || []).map((k) => String(k)));
  if (!kinds.has(String(order.kind))) {
    return { ok: false, reason: "order_kind_excluded" };
  }
  const amount = Number(order.amount_minor);
  if (!Number.isFinite(amount) || amount < Number(cfg.minQualifyingOrderAmountMinor)) {
    return { ok: false, reason: "below_min_amount" };
  }
  const sellerId = Number(order.seller_user_id);
  if (!cfg.allowBuyerIsSellerForQualification && buyerId === sellerId) {
    return { ok: false, reason: "buyer_is_seller" };
  }
  return { ok: true };
}

/**
 * @param {Date|string} attributedAt
 * @param {Date|string} orderCreatedAt
 * @param {number} windowDays
 */
function purchaseWithinAttributionWindow(attributedAt, orderCreatedAt, windowDays) {
  const a = attributedAt instanceof Date ? attributedAt.getTime() : Date.parse(String(attributedAt));
  const o = orderCreatedAt instanceof Date ? orderCreatedAt.getTime() : Date.parse(String(orderCreatedAt));
  if (!Number.isFinite(a) || !Number.isFinite(o)) {
    return false;
  }
  const ms = windowDays * 86_400_000;
  return o <= a + ms;
}

/**
 * @param {Date|string} orderCreatedAt
 * @param {number} holdHours
 * @returns {Date}
 */
function computeClearAfterAt(orderCreatedAt, holdHours) {
  const o = orderCreatedAt instanceof Date ? orderCreatedAt : new Date(orderCreatedAt);
  const h = Math.max(0, Number(holdHours) || 0);
  return new Date(o.getTime() + h * 3_600_000);
}

/**
 * @param {Date|string} now
 * @param {Date|string|null} clearAfterAt
 */
function isClearWindowSatisfied(now, clearAfterAt) {
  if (clearAfterAt == null) {
    return true;
  }
  const n = now instanceof Date ? now.getTime() : Date.parse(String(now));
  const c = clearAfterAt instanceof Date ? clearAfterAt.getTime() : Date.parse(String(clearAfterAt));
  if (!Number.isFinite(n) || !Number.isFinite(c)) {
    return false;
  }
  return n >= c;
}

module.exports = {
  orderQualifiesForReferral,
  purchaseWithinAttributionWindow,
  computeClearAfterAt,
  isClearWindowSatisfied
};
