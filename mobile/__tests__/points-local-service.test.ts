/* eslint-disable import/first -- local storage mock must be loaded before service imports */

const mockStorage: Record<string, string> = {};

jest.mock("@react-native-async-storage/async-storage", () => {
  const mock = {
    getItem: jest.fn(async (key: string) => (key in mockStorage ? mockStorage[key] : null)),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStorage[key] = value;
    }),
    removeItem: jest.fn(async (key: string) => {
      delete mockStorage[key];
    }),
    clear: jest.fn(async () => {
      for (const key of Object.keys(mockStorage)) {
        delete mockStorage[key];
      }
    })
  };
  return {
    __esModule: true,
    default: mock
  };
});

import {
  awardPointsForAction,
  getPointsState,
  syncCompletedOrdersToPoints
} from "../src/features/points/services/points-local-service";

describe("points-local-service", () => {
  const userId = "42";
  const AsyncStorage = require("@react-native-async-storage/async-storage").default as {
    clear: () => Promise<void>;
  };

  beforeEach(() => {
    AsyncStorage.clear();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-04-23T10:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("awards points for like and updates wallet totals", async () => {
    const result = await awardPointsForAction(userId, "like");
    expect(result.awarded).toBe(true);
    if (!result.awarded) {
      throw new Error("expected award to succeed");
    }
    expect(result.points).toBe(5);
    expect(result.wallet.totalPoints).toBe(5);
    expect(result.wallet.todayPoints).toBe(5);

    const state = await getPointsState(userId);
    expect(state.wallet.totalPoints).toBe(5);
    expect(state.actions.like.todayCount).toBe(1);
    expect(state.transactions[0].action).toBe("like");
  });

  it("enforces cooldown for scroll", async () => {
    const first = await awardPointsForAction(userId, "scroll");
    expect(first.awarded).toBe(true);
    const second = await awardPointsForAction(userId, "scroll");
    expect(second.awarded).toBe(false);
    if (second.awarded) {
      throw new Error("expected cooldown block");
    }
    expect(second.reason).toBe("cooldown");
    expect(second.retryAfterMs).toBeGreaterThan(0);
  });

  it("enforces daily limit for follow", async () => {
    for (let i = 0; i < 20; i += 1) {
      const awarded = await awardPointsForAction(userId, "follow");
      expect(awarded.awarded).toBe(true);
      jest.advanceTimersByTime(2100);
    }
    const blocked = await awardPointsForAction(userId, "follow");
    expect(blocked.awarded).toBe(false);
    if (blocked.awarded) {
      throw new Error("expected daily limit block");
    }
    expect(blocked.reason).toBe("daily_limit");
  });

  it("resets today points on next day", async () => {
    await awardPointsForAction(userId, "comment");
    const dayOne = await getPointsState(userId);
    expect(dayOne.wallet.todayPoints).toBe(10);

    jest.setSystemTime(new Date("2026-04-24T10:00:00.000Z"));
    const dayTwo = await getPointsState(userId);
    expect(dayTwo.wallet.todayPoints).toBe(0);
    expect(dayTwo.wallet.totalPoints).toBe(10);
  });

  it("dedupes purchase order IDs", async () => {
    const first = await awardPointsForAction(userId, "purchase", { dedupeKey: "order:100" });
    expect(first.awarded).toBe(true);
    const second = await awardPointsForAction(userId, "purchase", { dedupeKey: "order:100" });
    expect(second.awarded).toBe(false);
    if (second.awarded) {
      throw new Error("expected duplicate block");
    }
    expect(second.reason).toBe("duplicate");
  });

  it("syncs only completed orders and dedupes repeats", async () => {
    const awardedFirst = await syncCompletedOrdersToPoints(userId, [
      { order_id: 1, status: "completed" },
      { order_id: 2, status: "pending" },
      { order_id: 3, status: "completed" }
    ]);
    expect(awardedFirst).toBe(2);

    const awardedSecond = await syncCompletedOrdersToPoints(userId, [
      { order_id: 1, status: "completed" },
      { order_id: 3, status: "completed" },
      { order_id: 4, status: "completed" }
    ]);
    expect(awardedSecond).toBe(1);

    const state = await getPointsState(userId);
    expect(state.actions.purchase.todayCount).toBe(3);
    expect(state.wallet.totalPoints).toBe(300);
  });

  it("dedupes like awards when dedupe key is reused", async () => {
    const first = await awardPointsForAction(userId, "like", { dedupeKey: "like:d:2026-04-23:post:77" });
    expect(first.awarded).toBe(true);
    const second = await awardPointsForAction(userId, "like", { dedupeKey: "like:d:2026-04-23:post:77" });
    expect(second.awarded).toBe(false);
    if (second.awarded) {
      throw new Error("expected duplicate block");
    }
    expect(second.reason).toBe("duplicate");
  });
});
