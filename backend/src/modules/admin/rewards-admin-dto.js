/**
 * @typedef {object} RewardLedgerEntryListItemDto
 * @property {number} id
 * @property {number} userId
 * @property {string} deltaPoints
 * @property {string} entryKind
 * @property {string} reason
 * @property {string} idempotencyKey
 * @property {object} metadata
 * @property {number | null} reversesLedgerEntryId
 * @property {string} createdAt
 */

/**
 * @typedef {object} RewardLedgerEntryDetailDto
 * @property {RewardLedgerEntryListItemDto} entry
 * @property {RewardLedgerEntryListItemDto | null} reversalOf
 */

/**
 * @typedef {object} ReferralAttributionQueueItemDto
 * @property {number} id
 * @property {number} referralCodeId
 * @property {number} referrerUserId
 * @property {number} refereeUserId
 * @property {string} status
 * @property {string} attributedAt
 * @property {number | null} firstQualifiedOrderId
 * @property {string | null} clearAfterAt
 * @property {number | null} referrerLedgerEntryId
 * @property {number | null} refereeLedgerEntryId
 * @property {string | null} qualifiedAt
 * @property {string | null} voidReason
 * @property {object} metadata
 * @property {string} createdAt
 */

/**
 * @typedef {object} FraudFlagItemDto
 * @property {string} flagType
 * @property {string} severity
 * @property {string} entityType
 * @property {string} entityId
 * @property {string} summary
 * @property {string} detectedAt
 * @property {object} metadata
 */

/**
 * @typedef {object} CheckoutRewardRedemptionListItemDto
 * @property {number} id
 * @property {string} stripeCheckoutSessionId
 * @property {number} buyerUserId
 * @property {number} productId
 * @property {number} pointsSpent
 * @property {number} discountMinor
 * @property {string} status
 * @property {string} createdAt
 */

function iso(d) {
  if (!d) {
    return "";
  }
  return d instanceof Date ? d.toISOString() : String(d);
}

/** @param {object} row */
function toRewardLedgerEntryListItemDto(row) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    deltaPoints: String(row.delta_points),
    entryKind: String(row.entry_kind),
    reason: String(row.reason),
    idempotencyKey: String(row.idempotency_key),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    reversesLedgerEntryId: row.reverses_ledger_entry_id != null ? Number(row.reverses_ledger_entry_id) : null,
    createdAt: iso(row.created_at)
  };
}

/** @param {object} row */
function toReferralAttributionQueueItemDto(row) {
  return {
    id: Number(row.id),
    referralCodeId: Number(row.referral_code_id),
    referrerUserId: Number(row.referrer_user_id),
    refereeUserId: Number(row.referee_user_id),
    status: String(row.status),
    attributedAt: iso(row.attributed_at),
    firstQualifiedOrderId:
      row.first_qualified_order_id != null ? Number(row.first_qualified_order_id) : null,
    clearAfterAt: row.clear_after_at ? iso(row.clear_after_at) : null,
    referrerLedgerEntryId:
      row.referrer_ledger_entry_id != null ? Number(row.referrer_ledger_entry_id) : null,
    refereeLedgerEntryId:
      row.referee_ledger_entry_id != null ? Number(row.referee_ledger_entry_id) : null,
    qualifiedAt: row.qualified_at ? iso(row.qualified_at) : null,
    voidReason: row.void_reason != null ? String(row.void_reason) : null,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    createdAt: iso(row.created_at)
  };
}

/** @param {object} row */
function toFraudFlagItemDto(row) {
  return {
    flagType: String(row.flag_type),
    severity: String(row.severity),
    entityType: String(row.entity_type),
    entityId: String(row.entity_id),
    summary: String(row.summary || ""),
    detectedAt: iso(row.detected_at),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {}
  };
}

/** @param {object} row */
function toCheckoutRewardRedemptionListItemDto(row) {
  return {
    id: Number(row.id),
    stripeCheckoutSessionId: String(row.stripe_checkout_session_id),
    buyerUserId: Number(row.buyer_user_id),
    productId: Number(row.product_id),
    pointsSpent: Number(row.points_spent),
    discountMinor: Number(row.discount_minor),
    status: String(row.status),
    createdAt: iso(row.created_at)
  };
}

module.exports = {
  toRewardLedgerEntryListItemDto,
  toReferralAttributionQueueItemDto,
  toFraudFlagItemDto,
  toCheckoutRewardRedemptionListItemDto
};
