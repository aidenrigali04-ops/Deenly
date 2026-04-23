import type { RewardsLedgerEntryDto } from "@deenly/rewards";

jest.mock("../src/lib/rewards-api", () => ({
  fetchRewardsWalletMe: jest.fn(),
  fetchRewardsLedgerPage: jest.fn()
}));

import { fetchRewardsLedgerPage, fetchRewardsWalletMe } from "../src/lib/rewards-api";
import { isRemoteTrackedAction, loadRemotePointsState } from "../src/features/points/services/points-remote-service";

function buildLedgerEntry(
  id: number,
  deltaPoints: string,
  createdAt: string,
  reason: string,
  resolvedEarnAction: string | null
): RewardsLedgerEntryDto {
  return {
    id,
    rewardAccountId: 1,
    deltaPoints,
    entryKind: BigInt(deltaPoints) >= 0n ? "earn" : "spend",
    reason,
    idempotencyKey: `idem:${id}`,
    metadata: {},
    reversesLedgerEntryId: null,
    createdAt,
    ledgerReasonKey: reason,
    resolvedEarnAction,
    source: null,
    display: {
      variant: BigInt(deltaPoints) >= 0n ? "earn" : "spend",
      titleKey: "rewards.ledger.test"
    },
    reversalOf: null,
    redemption: null
  };
}

describe("points-remote-service", () => {
  const walletMock = fetchRewardsWalletMe as jest.MockedFunction<typeof fetchRewardsWalletMe>;
  const ledgerMock = fetchRewardsLedgerPage as jest.MockedFunction<typeof fetchRewardsLedgerPage>;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("maps wallet + ledger into points state", async () => {
    walletMock.mockResolvedValue({
      balancePoints: "320",
      currencyCode: "DEEN_PTS",
      pointsDecimals: 0,
      lastCatalogCheckoutRedemptionAt: null,
      display: {
        balanceTitleKey: "rewards.wallet.balance_title",
        ledgerSectionTitleKey: "rewards.wallet.ledger_section_title",
        historyHintKey: "rewards.wallet.history_hint"
      }
    });
    ledgerMock.mockResolvedValue({
      items: [
        buildLedgerEntry(1, "100", "2026-04-23T08:00:00.000Z", "purchase_completed", "purchase_completed"),
        buildLedgerEntry(2, "40", "2026-04-23T09:00:00.000Z", "qualified_engagement", "qualified_comment"),
        buildLedgerEntry(3, "-20", "2026-04-23T10:00:00.000Z", "redemption_catalog", null),
        buildLedgerEntry(4, "180", "2026-04-22T07:00:00.000Z", "purchase_completed", "purchase_completed")
      ],
      nextCursor: null
    });

    const now = new Date("2026-04-23T12:00:00.000Z");
    const state = await loadRemotePointsState("55", now);

    expect(state.wallet.userId).toBe("55");
    expect(state.wallet.totalPoints).toBe(320);
    expect(state.wallet.todayPoints).toBe(140);
    expect(state.wallet.level).toBe(2);
    expect(state.wallet.badges).toContain("starter");
    expect(state.actions.purchase.todayCount).toBe(1);
    expect(state.actions.comment.todayCount).toBe(1);
    expect(state.transactions.length).toBe(3);
    expect(state.transactions[0].action).toBe("purchase");
    expect(state.transactions[1].action).toBe("comment");
  });

  it("returns empty ledger-derived data if ledger endpoint fails", async () => {
    walletMock.mockResolvedValue({
      balancePoints: "0",
      currencyCode: "DEEN_PTS",
      pointsDecimals: 0,
      lastCatalogCheckoutRedemptionAt: null,
      display: {
        balanceTitleKey: "rewards.wallet.balance_title",
        ledgerSectionTitleKey: "rewards.wallet.ledger_section_title",
        historyHintKey: "rewards.wallet.history_hint"
      }
    });
    ledgerMock.mockRejectedValue(new Error("ledger unavailable"));

    const state = await loadRemotePointsState("9", new Date("2026-04-23T00:00:00.000Z"));
    expect(state.wallet.totalPoints).toBe(0);
    expect(state.wallet.todayPoints).toBe(0);
    expect(state.transactions).toEqual([]);
  });

  it("exposes only server-verified tracked actions", () => {
    expect(isRemoteTrackedAction("comment")).toBe(true);
    expect(isRemoteTrackedAction("purchase")).toBe(true);
    expect(isRemoteTrackedAction("like")).toBe(false);
    expect(isRemoteTrackedAction("scroll")).toBe(false);
    expect(isRemoteTrackedAction("follow")).toBe(false);
  });
});
