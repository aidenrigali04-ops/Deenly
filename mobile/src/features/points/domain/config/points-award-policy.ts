import type { PointAction } from "../models/points-entity";

export type PointAwardSurface =
  | "legacy"
  | "reels"
  | "home_feed"
  | "marketplace_feed"
  | "post_detail"
  | "user_profile"
  | "purchases_sync"
  | "profile_sync";

export const POINT_SURFACE_ACTION_POLICY: Record<PointAwardSurface, readonly PointAction[]> = {
  legacy: ["scroll", "like", "comment", "purchase", "follow"],
  reels: ["scroll", "like", "comment"],
  home_feed: ["like", "comment"],
  marketplace_feed: ["like", "comment"],
  post_detail: ["like", "comment"],
  user_profile: ["like", "follow"],
  purchases_sync: ["purchase"],
  profile_sync: ["purchase"]
};

function dayKeyFor(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function normalizeToken(value: string, fallback: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9:_-]/g, "");
  return cleaned.length > 0 ? cleaned : fallback;
}

function normalizeEntityId(value: number | string): string {
  return normalizeToken(String(value), "unknown");
}

function normalizeCommentSnippet(text: string): string {
  return normalizeToken(text, "empty").slice(0, 24);
}

export function canSurfaceAwardAction(surface: PointAwardSurface, action: PointAction): boolean {
  return POINT_SURFACE_ACTION_POLICY[surface].includes(action);
}

export function buildLikeDedupeKey(postId: number | string, now = new Date()): string {
  return `like:d:${dayKeyFor(now)}:post:${normalizeEntityId(postId)}`;
}

export function buildCommentDedupeKey(
  postId: number | string,
  commentText: string,
  now = new Date()
): string {
  return `comment:d:${dayKeyFor(now)}:post:${normalizeEntityId(postId)}:txt:${normalizeCommentSnippet(
    commentText
  )}`;
}

export function buildFollowDedupeKey(targetUserId: number | string): string {
  return `follow:user:${normalizeEntityId(targetUserId)}`;
}

export function buildPurchaseDedupeKey(orderId: number | string): string {
  return `order:${normalizeEntityId(orderId)}`;
}
