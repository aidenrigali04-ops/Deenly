const {
  toRewardLedgerEntryListItemDto,
  toReferralAttributionQueueItemDto,
  toRewardFraudFlagQueueItemDto
} = require("../src/modules/admin/rewards-admin-dto");

describe("rewards-admin-dto", () => {
  it("maps ledger row to DTO", () => {
    const dto = toRewardLedgerEntryListItemDto({
      id: 1,
      user_id: 9,
      delta_points: "-50",
      entry_kind: "spend",
      reason: "redemption_catalog",
      idempotency_key: "k1",
      metadata: { a: 1 },
      reverses_ledger_entry_id: null,
      created_at: new Date("2024-01-02T00:00:00.000Z")
    });
    expect(dto).toEqual({
      id: 1,
      userId: 9,
      deltaPoints: "-50",
      entryKind: "spend",
      reason: "redemption_catalog",
      idempotencyKey: "k1",
      metadata: { a: 1 },
      reversesLedgerEntryId: null,
      createdAt: "2024-01-02T00:00:00.000Z"
    });
  });

  it("maps referral attribution row", () => {
    const dto = toReferralAttributionQueueItemDto({
      id: 3,
      referral_code_id: 1,
      referrer_user_id: 10,
      referee_user_id: 20,
      status: "pending_clear",
      attributed_at: new Date("2024-01-01T00:00:00.000Z"),
      first_qualified_order_id: 55,
      clear_after_at: new Date("2024-01-03T00:00:00.000Z"),
      referrer_ledger_entry_id: null,
      referee_ledger_entry_id: null,
      qualified_at: null,
      void_reason: null,
      metadata: {},
      created_at: new Date("2024-01-01T00:00:00.000Z")
    });
    expect(dto.id).toBe(3);
    expect(dto.firstQualifiedOrderId).toBe(55);
    expect(dto.status).toBe("pending_clear");
  });

  it("maps reward_fraud_flags row", () => {
    const dto = toRewardFraudFlagQueueItemDto({
      id: 9,
      flag_type: "ledger_velocity",
      severity: "high",
      status: "open",
      subject_user_id: 3,
      related_entity_type: "post",
      related_entity_id: "12",
      reward_ledger_entry_id: null,
      referral_attribution_id: null,
      seller_boost_purchase_id: null,
      reviewer_user_id: null,
      reviewed_at: null,
      metadata: {},
      created_at: new Date("2025-01-01T00:00:00.000Z"),
      updated_at: new Date("2025-01-01T00:00:00.000Z")
    });
    expect(dto.id).toBe(9);
    expect(dto.flagType).toBe("ledger_velocity");
    expect(dto.relatedEntityId).toBe("12");
  });
});
