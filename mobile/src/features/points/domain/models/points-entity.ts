export type PointAction = "scroll" | "like" | "comment" | "purchase" | "follow";

export type PointsEntity = {
  userId: string;
  totalPoints: number;
  todayPoints: number;
  level: number;
  badges: string[];
  streak: number;
  lastUpdated: string;
};

export type PointTransaction = {
  id: string;
  action: PointAction;
  points: number;
  createdAt: string;
};

export function copyPointsEntity(entity: PointsEntity, patch: Partial<PointsEntity>): PointsEntity {
  return {
    ...entity,
    ...patch,
    badges: patch.badges ? [...patch.badges] : [...entity.badges]
  };
}

function parseString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function parseNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePointAction(value: unknown): PointAction | null {
  if (value === "scroll" || value === "like" || value === "comment" || value === "purchase" || value === "follow") {
    return value;
  }
  return null;
}

export function pointsEntityFromJson(value: unknown): PointsEntity | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Partial<Record<keyof PointsEntity, unknown>>;
  return {
    userId: parseString(raw.userId),
    totalPoints: parseNumber(raw.totalPoints),
    todayPoints: parseNumber(raw.todayPoints),
    level: Math.max(1, parseNumber(raw.level, 1)),
    badges: Array.isArray(raw.badges) ? raw.badges.filter((b): b is string => typeof b === "string") : [],
    streak: Math.max(0, parseNumber(raw.streak)),
    lastUpdated: parseString(raw.lastUpdated)
  };
}

export function pointsEntityToJson(entity: PointsEntity): Record<string, unknown> {
  return {
    userId: entity.userId,
    totalPoints: entity.totalPoints,
    todayPoints: entity.todayPoints,
    level: entity.level,
    badges: [...entity.badges],
    streak: entity.streak,
    lastUpdated: entity.lastUpdated
  };
}

export function pointTransactionFromJson(value: unknown): PointTransaction | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Partial<Record<keyof PointTransaction, unknown>>;
  const action = parsePointAction(raw.action);
  if (!action) {
    return null;
  }
  return {
    id: parseString(raw.id),
    action,
    points: parseNumber(raw.points),
    createdAt: parseString(raw.createdAt)
  };
}

export function pointTransactionToJson(entity: PointTransaction): Record<string, unknown> {
  return {
    id: entity.id,
    action: entity.action,
    points: entity.points,
    createdAt: entity.createdAt
  };
}
