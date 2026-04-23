import type { PointAction } from "../models/points-entity";

export type PointActionRule = {
  action: PointAction;
  points: number;
  /** null => unlimited */
  dailyLimit: number | null;
  /** null => no cooldown */
  cooldownMs: number | null;
};

const SECOND = 1000;

export const POINT_ACTION_RULES: Record<PointAction, PointActionRule> = {
  scroll: {
    action: "scroll",
    points: 1,
    dailyLimit: 20,
    cooldownMs: 30 * SECOND
  },
  like: {
    action: "like",
    points: 5,
    dailyLimit: 50,
    cooldownMs: 1 * SECOND
  },
  comment: {
    action: "comment",
    points: 10,
    dailyLimit: 30,
    cooldownMs: 5 * SECOND
  },
  purchase: {
    action: "purchase",
    points: 100,
    dailyLimit: null,
    cooldownMs: null
  },
  follow: {
    action: "follow",
    points: 15,
    dailyLimit: 20,
    cooldownMs: 2 * SECOND
  }
};

export const POINT_RULE_LIST: PointActionRule[] = [
  POINT_ACTION_RULES.scroll,
  POINT_ACTION_RULES.like,
  POINT_ACTION_RULES.comment,
  POINT_ACTION_RULES.purchase,
  POINT_ACTION_RULES.follow
];

export function formatRuleCooldown(cooldownMs: number | null): string {
  if (!cooldownMs) {
    return "none";
  }
  if (cooldownMs % 1000 !== 0) {
    return `${cooldownMs}ms`;
  }
  const seconds = cooldownMs / 1000;
  return `${seconds} sec`;
}

export function formatRuleDailyLimit(limit: number | null): string {
  if (limit == null) {
    return "unlimited";
  }
  return `${limit}`;
}
