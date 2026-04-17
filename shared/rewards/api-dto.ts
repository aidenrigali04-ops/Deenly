import type { ReferralAttributionAdminReviewAction, ReferralCodeStatus, TrustReviewFlagDomain, TrustReviewFlagSeverity, TrustReviewFlagStatus } from "./types";

/** Values stored on `referral_attributions.status` (buyer-facing read model). */
export type ReferralAttributionApiStatus =
  | "pending_purchase"
  | "pending_clear"
  | "qualified"
  | "rejected"
  | "voided"
  | "expired";

/** GET /api/v1/rewards/me */
export interface RewardsWalletMeResponse {
  readonly balancePoints: string;
  readonly currencyCode: string;
  readonly pointsDecimals: 0 | 2 | 3;
  readonly lastCatalogCheckoutRedemptionAt: string | null;
}

/** Single ledger line (camelCase; matches server serialization). */
export interface RewardsLedgerEntryDto {
  readonly id: number;
  readonly rewardAccountId: number;
  readonly deltaPoints: string;
  readonly entryKind: "earn" | "spend" | "reversal";
  readonly reason: string;
  readonly idempotencyKey: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly reversesLedgerEntryId: number | null;
  readonly createdAt: string;
}

/** GET /api/v1/rewards/ledger */
export interface RewardsLedgerPageResponse {
  readonly items: readonly RewardsLedgerEntryDto[];
  readonly nextCursor: string | null;
}

export interface ReferralCodeSummaryDto {
  readonly code: string;
  readonly status: ReferralCodeStatus;
  readonly maxRedemptions: number;
  readonly attributableSignupsCount: number;
  /** Suggested web signup URL with ref query (client may still use deep links). */
  readonly suggestedShareUrl: string | null;
}

export interface ReferralAttributionSummaryDto {
  readonly id: number;
  readonly status: ReferralAttributionApiStatus;
  readonly attributedAt: string;
  readonly firstQualifiedOrderId: number | null;
  readonly clearAfterAt: string | null;
  readonly qualifiedAt: string | null;
  readonly voidReason: string | null;
}

/** GET /api/v1/referrals/me */
export interface ReferralsMeResponse {
  readonly code: ReferralCodeSummaryDto | null;
  readonly attributionAsReferee: ReferralAttributionSummaryDto | null;
  readonly qualifiedReferralsCount: number;
}

/** POST /api/v1/referrals/me/share (body optional) */
export interface ReferralShareRecordedResponse {
  readonly ok: true;
}

/** POST `/api/v1/admin/rewards/referrals/attributions/:id/review` body (subset). */
export interface AdminReferralAttributionReviewRequest {
  readonly action: ReferralAttributionAdminReviewAction;
}

/** Admin table browse / trust queue row (camelCase; aligns with `trust_review_flags`). */
export interface TrustReviewFlagAdminListItemDto {
  readonly id: number;
  readonly domain: TrustReviewFlagDomain;
  readonly flag_type: string;
  readonly severity: TrustReviewFlagSeverity;
  readonly subject_user_id: number | null;
  readonly related_entity_type: string | null;
  readonly related_entity_id: string | null;
  readonly status: TrustReviewFlagStatus;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly created_at: string;
  readonly updated_at: string;
}
