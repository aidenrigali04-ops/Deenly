import AsyncStorage from "@react-native-async-storage/async-storage";
import { buildPurchaseDedupeKey } from "../domain/config/points-award-policy";
import { POINT_ACTION_RULES } from "../domain/config/points-action-rules";
import type { PointAction, PointTransaction, PointsEntity } from "../domain/models/points-entity";
import {
  pointTransactionFromJson,
  pointTransactionToJson,
  pointsEntityFromJson,
  pointsEntityToJson
} from "../domain/models/points-entity";

const STORAGE_KEY_PREFIX = "deenly/points/local-state-v1";
const HISTORY_LIMIT = 200;
const LEVEL_STEP_POINTS = 200;

export type ActionSnapshot = {
  todayCount: number;
  lastAt: string | null;
};

export type PointsState = {
  wallet: PointsEntity;
  actions: Record<PointAction, ActionSnapshot>;
  transactions: PointTransaction[];
  dayKey: string;
  purchaseAwardedOrderIds: string[];
};

let operationQueue: Promise<void> = Promise.resolve();

function storageKeyForUser(userId: string): string {
  return `${STORAGE_KEY_PREFIX}/${userId}`;
}

export type AwardResult =
  | {
      awarded: true;
      reason: "ok";
      points: number;
      wallet: PointsEntity;
      transaction: PointTransaction;
      actionSnapshot: ActionSnapshot;
    }
  | {
      awarded: false;
      reason: "daily_limit" | "cooldown" | "duplicate";
      wallet: PointsEntity;
      actionSnapshot: ActionSnapshot;
      retryAfterMs?: number;
    };

function dayKeyFor(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultActionSnapshot(): ActionSnapshot {
  return {
    todayCount: 0,
    lastAt: null
  };
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

function createDefaultState(userId: string, now: Date): PointsState {
  return {
    wallet: {
      userId,
      totalPoints: 0,
      todayPoints: 0,
      level: 1,
      badges: [],
      streak: 0,
      lastUpdated: now.toISOString()
    },
    actions: buildDefaultActions(),
    transactions: [],
    dayKey: dayKeyFor(now),
    purchaseAwardedOrderIds: []
  };
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseActionSnapshot(value: unknown): ActionSnapshot {
  if (!value || typeof value !== "object") {
    return defaultActionSnapshot();
  }
  const raw = value as Partial<ActionSnapshot>;
  return {
    todayCount: Math.max(0, toNumber(raw.todayCount)),
    lastAt: typeof raw.lastAt === "string" ? raw.lastAt : null
  };
}

function parseActions(value: unknown): Record<PointAction, ActionSnapshot> {
  const fallback = buildDefaultActions();
  if (!value || typeof value !== "object") {
    return fallback;
  }
  const raw = value as Partial<Record<PointAction, unknown>>;
  return {
    scroll: parseActionSnapshot(raw.scroll),
    like: parseActionSnapshot(raw.like),
    comment: parseActionSnapshot(raw.comment),
    purchase: parseActionSnapshot(raw.purchase),
    follow: parseActionSnapshot(raw.follow)
  };
}

function resetForNewDay(state: PointsState, now: Date): PointsState {
  const nextActions = buildDefaultActions();
  for (const key of Object.keys(state.actions) as PointAction[]) {
    nextActions[key].lastAt = state.actions[key].lastAt;
  }
  return {
    ...state,
    dayKey: dayKeyFor(now),
    wallet: {
      ...state.wallet,
      todayPoints: 0,
      lastUpdated: now.toISOString()
    },
    actions: nextActions
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

function parseState(raw: unknown, userId: string, now: Date): PointsState {
  if (!raw || typeof raw !== "object") {
    return createDefaultState(userId, now);
  }
  const source = raw as Record<string, unknown>;
  const wallet = pointsEntityFromJson(source.wallet) ?? createDefaultState(userId, now).wallet;
  const state: PointsState = {
    wallet: {
      ...wallet,
      userId
    },
    actions: parseActions(source.actions),
    transactions: Array.isArray(source.transactions)
      ? source.transactions
          .map((item) => pointTransactionFromJson(item))
          .filter((item): item is PointTransaction => Boolean(item))
      : [],
    dayKey: typeof source.dayKey === "string" ? source.dayKey : dayKeyFor(now),
    purchaseAwardedOrderIds: Array.isArray(source.purchaseAwardedOrderIds)
      ? source.purchaseAwardedOrderIds.filter((id): id is string => typeof id === "string")
      : []
  };
  if (state.dayKey !== dayKeyFor(now)) {
    return resetForNewDay(state, now);
  }
  return state;
}

function serializeState(state: PointsState): string {
  return JSON.stringify({
    wallet: pointsEntityToJson(state.wallet),
    actions: state.actions,
    transactions: state.transactions.map(pointTransactionToJson),
    dayKey: state.dayKey,
    purchaseAwardedOrderIds: state.purchaseAwardedOrderIds
  });
}

function computeStreak(previousDayKey: string, nextDayKey: string, currentStreak: number): number {
  if (!previousDayKey) {
    return currentStreak > 0 ? currentStreak : 1;
  }
  const prev = new Date(`${previousDayKey}T00:00:00.000Z`);
  const next = new Date(`${nextDayKey}T00:00:00.000Z`);
  const dayDiff = Math.round((next.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000));
  if (dayDiff === 1) {
    return Math.max(1, currentStreak + 1);
  }
  if (dayDiff <= 0) {
    return Math.max(1, currentStreak);
  }
  return 1;
}

function createTransactionId(now: Date): string {
  const suffix = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `ptx_${now.getTime()}_${suffix}`;
}

export async function loadPointsState(userId: string, now = new Date()): Promise<PointsState> {
  const storageKey = storageKeyForUser(userId);
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) {
      return createDefaultState(userId, now);
    }
    return parseState(JSON.parse(raw), userId, now);
  } catch {
    return createDefaultState(userId, now);
  }
}

export async function savePointsState(state: PointsState): Promise<void> {
  const storageKey = storageKeyForUser(state.wallet.userId);
  try {
    await AsyncStorage.setItem(storageKey, serializeState(state));
  } catch {
    /* ignore local persistence write errors */
  }
}

async function withState<T>(
  userId: string,
  mutate: (state: PointsState, now: Date) => T | Promise<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    operationQueue = operationQueue.then(async () => {
      const now = new Date();
      const state = await loadPointsState(userId, now);
      const normalized = state.dayKey === dayKeyFor(now) ? state : resetForNewDay(state, now);
      const result = await mutate(normalized, now);
      await savePointsState(normalized);
      resolve(result);
    });
    operationQueue = operationQueue.catch((error) => {
      reject(error);
    });
  });
}

export async function getPointsState(userId: string): Promise<PointsState> {
  return withState(userId, (state) => state);
}

export async function awardPointsForAction(
  userId: string,
  action: PointAction,
  options?: { dedupeKey?: string }
): Promise<AwardResult> {
  return withState(userId, (state, now) => {
    const rule = POINT_ACTION_RULES[action];
    const actionState = state.actions[action];
    const nowIso = now.toISOString();
    const lastAt = actionState.lastAt ? new Date(actionState.lastAt) : null;

    if (options?.dedupeKey) {
      if (state.purchaseAwardedOrderIds.includes(options.dedupeKey)) {
        return {
          awarded: false,
          reason: "duplicate",
          wallet: state.wallet,
          actionSnapshot: actionState
        };
      }
    }

    if (rule.cooldownMs != null && lastAt) {
      const elapsed = now.getTime() - lastAt.getTime();
      if (elapsed < rule.cooldownMs) {
        return {
          awarded: false,
          reason: "cooldown",
          wallet: state.wallet,
          actionSnapshot: actionState,
          retryAfterMs: Math.max(0, rule.cooldownMs - elapsed)
        };
      }
    }

    if (rule.dailyLimit != null && actionState.todayCount >= rule.dailyLimit) {
      return {
        awarded: false,
        reason: "daily_limit",
        wallet: state.wallet,
        actionSnapshot: actionState
      };
    }

    const previousDayKey = state.wallet.lastUpdated ? dayKeyFor(new Date(state.wallet.lastUpdated)) : state.dayKey;
    const nextDayKey = state.dayKey;
    const nextWallet: PointsEntity = {
      ...state.wallet,
      totalPoints: state.wallet.totalPoints + rule.points,
      todayPoints: state.wallet.todayPoints + rule.points,
      level: levelForTotalPoints(state.wallet.totalPoints + rule.points),
      badges: refreshBadges(state.wallet.totalPoints + rule.points),
      streak: computeStreak(previousDayKey, nextDayKey, state.wallet.streak),
      lastUpdated: nowIso
    };
    state.wallet = nextWallet;

    const nextActionSnapshot: ActionSnapshot = {
      todayCount: actionState.todayCount + 1,
      lastAt: nowIso
    };
    state.actions[action] = nextActionSnapshot;

    if (options?.dedupeKey) {
      state.purchaseAwardedOrderIds = [...state.purchaseAwardedOrderIds, options.dedupeKey].slice(-500);
    }

    const transaction: PointTransaction = {
      id: createTransactionId(now),
      action,
      points: rule.points,
      createdAt: nowIso
    };
    state.transactions = [transaction, ...state.transactions].slice(0, HISTORY_LIMIT);

    return {
      awarded: true,
      reason: "ok",
      points: rule.points,
      wallet: nextWallet,
      transaction,
      actionSnapshot: nextActionSnapshot
    };
  });
}

export async function syncCompletedOrdersToPoints(
  userId: string,
  orders: Array<{ order_id: number | string; status: string }>
): Promise<number> {
  let awardedCount = 0;
  for (const order of orders) {
    if (String(order.status).toLowerCase() !== "completed") {
      continue;
    }
    const dedupeKey = buildPurchaseDedupeKey(order.order_id);
    const result = await awardPointsForAction(userId, "purchase", { dedupeKey });
    if (result.awarded) {
      awardedCount += 1;
    }
  }
  return awardedCount;
}
