import type { RewardsLedgerEntryDto } from "@deenly/rewards";
import { fetchRewardsLedgerPage, fetchRewardsWalletMe } from "../../../lib/rewards-api";
import type { PointAction, PointTransaction, PointsEntity } from "../domain/models/points-entity";
import type { ActionSnapshot, PointsState } from "./points-local-service";

const LEVEL_STEP_POINTS = 200;
const REMOTE_LEDGER_LIMIT = 100;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

const REMOTE_TRACKED_ACTIONS: ReadonlySet<PointAction> = new Set(["comment", "purchase"]);

export function isRemoteTrackedAction(action: PointAction): boolean {
  return REMOTE_TRACKED_ACTIONS.has(action);
}

function dayKeyFor(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultActionSnapshot(): ActionSnapshot {
  return { todayCount: 0, lastAt: null };
}

function buildDefaultActions(): Record<PointAction, ActionSnapshot> {
  return {
    scroll: defaultActionSnapshot(),
    like: defaultActionSnapshot(),
    comment: defaultActionSnapshot(),
    purchase: defaultActionSnapshot(),
    follow: defaultActionSnapshot()
  };
}

function levelForTotalPoints(totalPoints: number): number {
  return Math.max(1, Math.floor(Math.max(0, totalPoints) / LEVEL_STEP_POINTS) + 1);
}

function refreshBadges(totalPoints: number): string[] {
  const badges: string[] = [];
  if (totalPoints >= 100) badges.push("starter");
  if (totalPoints >= 500) badges.push("engaged");
  if (totalPoints >= 1000) badges.push("champion");
  return badges;
}

function parseBigInt(raw: string | number | bigint | null | undefined): bigint {
  try {
    return BigInt(String(raw ?? "0"));
  } catch {
    return 0n;
  }
}

function toSafeNumber(value: bigint): number {
  if (value > MAX_SAFE_BIGINT) {
    return Number.MAX_SAFE_INTEGER;
  }
  if (value < -MAX_SAFE_BIGINT) {
    return -Number.MAX_SAFE_INTEGER;
  }
  return Number(value);
}

function resolveAction(row: RewardsLedgerEntryDto): PointAction | null {
  const key = String(row.resolvedEarnAction || row.reason || "").trim();
  if (key === "qualified_comment") {
    return "comment";
  }
  if (key === "purchase_completed" || key === "first_product_order_completed") {
    return "purchase";
  }
  return null;
}

function mapEntryToTransaction(row: RewardsLedgerEntryDto): PointTransaction | null {
  const action = resolveAction(row);
  if (!action) {
    return null;
  }
  const delta = parseBigInt(row.deltaPoints);
  if (delta <= 0n) {
    return null;
  }
  return {
    id: `ledger_${row.id}`,
    action,
    points: toSafeNumber(delta),
    createdAt: row.createdAt
  };
}

function computeStreak(entries: readonly RewardsLedgerEntryDto[], todayKey: string): number {
  const earnDays = new Set<string>();
  for (const entry of entries) {
    if (parseBigInt(entry.deltaPoints) <= 0n) {
      continue;
    }
    earnDays.add(dayKeyFor(new Date(entry.createdAt)));
  }
  if (!earnDays.has(todayKey)) {
    return 0;
  }

  let streak = 0;
  let cursor = new Date(`${todayKey}T00:00:00.000Z`);
  while (earnDays.has(dayKeyFor(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }
  return streak;
}

export async function loadRemotePointsState(userId: string, now = new Date()): Promise<PointsState> {
  const walletResponse = await fetchRewardsWalletMe();
  let ledgerItems: readonly RewardsLedgerEntryDto[] = [];
  try {
    const ledger = await fetchRewardsLedgerPage({ limit: REMOTE_LEDGER_LIMIT });
    ledgerItems = ledger.items;
  } catch {
    ledgerItems = [];
  }

  const todayKey = dayKeyFor(now);
  const actions = buildDefaultActions();
  const transactions = ledgerItems
    .map(mapEntryToTransaction)
    .filter((tx): tx is PointTransaction => Boolean(tx));

  for (const tx of transactions) {
    if (dayKeyFor(new Date(tx.createdAt)) !== todayKey) {
      continue;
    }
    const snap = actions[tx.action];
    snap.todayCount += 1;
    if (!snap.lastAt || new Date(tx.createdAt).getTime() > new Date(snap.lastAt).getTime()) {
      snap.lastAt = tx.createdAt;
    }
  }

  let todayEarned = 0n;
  for (const row of ledgerItems) {
    const rowDay = dayKeyFor(new Date(row.createdAt));
    if (rowDay !== todayKey) {
      continue;
    }
    const delta = parseBigInt(row.deltaPoints);
    if (delta > 0n) {
      todayEarned += delta;
    }
  }

  const totalPoints = toSafeNumber(parseBigInt(walletResponse.balancePoints));
  const wallet: PointsEntity = {
    userId,
    totalPoints,
    todayPoints: toSafeNumber(todayEarned),
    level: levelForTotalPoints(totalPoints),
    badges: refreshBadges(totalPoints),
    streak: computeStreak(ledgerItems, todayKey),
    lastUpdated: now.toISOString()
  };

  return {
    wallet,
    actions,
    transactions,
    dayKey: todayKey,
    purchaseAwardedOrderIds: []
  };
}
