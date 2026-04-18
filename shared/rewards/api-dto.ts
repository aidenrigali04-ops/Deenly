import type { ReferralAttributionAdminReviewAction, ReferralCodeStatus, TrustReviewFlagDomain, TrustReviewFlagSeverity, TrustReviewFlagStatus } from "./types";

/** Values stored on `referral_attributions.status` (buyer-facing read model). */
export type ReferralAttributionApiStatus =
  | "pending_purchase"
  | "pending_clear"
  | "qualified"
  | "rejected"
  | "voided"
  | "expired";

/** Stable i18n keys for wallet chrome (server-provided; clients map to copy). */
export interface RewardsWalletDisplayDto {
  readonly balanceTitleKey: string;
  readonly ledgerSectionTitleKey: string;
  readonly historyHintKey: string;
}

/** GET /api/v1/rewards/me */
export interface RewardsWalletMeResponse {
  readonly balancePoints: string;
  readonly currencyCode: string;
  readonly pointsDecimals: 0 | 2 | 3;
  readonly lastCatalogCheckoutRedemptionAt: string | null;
  /** Presentation keys for balance / history sections (additive). */
  readonly display: RewardsWalletDisplayDto;
}

export type RewardsLedgerUiVariant = "earn" | "spend" | "reversal";

/** Normalized source hints derived from `metadata` (additive). */
export interface RewardsLedgerSourceDto {
  readonly kind: "order" | "attribution" | "checkout" | "post" | "comment";
  readonly orderId?: number;
  readonly orderKind?: string;
  readonly attributionId?: number;
  readonly productId?: number;
  readonly postId?: number;
  readonly commentId?: number;
}

export interface RewardsLedgerDisplayDto {
  readonly variant: RewardsLedgerUiVariant;
  /** i18n lookup key for the primary line title. */
  readonly titleKey: string;
  readonly subtitleKey?: string;
  /** Suggested icon token for clients that support it (optional). */
  readonly iconKey?: string;
}

export interface RewardsLedgerReversalOfDto {
  readonly originalLedgerEntryId: number;
}

/** Checkout redemption spend row enrichment (subset of `metadata`). */
export interface RewardsLedgerRedemptionDto {
  readonly surface?: string;
  readonly productId?: number;
  readonly redeemClientRequestId?: string;
  readonly discountMinor?: number;
  readonly listPriceMinor?: number;
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
  /** Taxonomy key for the stored `reason` (trimmed); use with `entryKind` for display. */
  readonly ledgerReasonKey: string;
  /** Rules engine action when present on earn metadata (e.g. `qualified_comment` vs ledger `qualified_engagement`). */
  readonly resolvedEarnAction: string | null;
  readonly source: RewardsLedgerSourceDto | null;
  readonly display: RewardsLedgerDisplayDto;
  /** Present when this row reverses another ledger entry. */
  readonly reversalOf: RewardsLedgerReversalOfDto | null;
  /** Present for catalog checkout spend rows. */
  readonly redemption: RewardsLedgerRedemptionDto | null;
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
  /** ISO timestamp when the referee was attributed; null if missing in storage. */
  readonly attributedAt: string | null;
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

/** GET /api/v1/referrals/code-preview?code= */
export interface ReferralCodePeekResponse {
  readonly valid: boolean;
  readonly exhausted?: boolean;
  readonly reason?: string;
}

/** POST `/api/v1/admin/rewards/referrals/attributions/:id/review` body (subset). */
export interface AdminReferralAttributionReviewRequest {
  readonly action: ReferralAttributionAdminReviewAction;
}

/** POST `/api/v1/admin/rewards/fraud-flags/records/:id/review` body. */
export type AdminRewardFraudFlagReviewAction = "dismiss" | "confirm" | "triage";

export interface AdminRewardFraudFlagReviewRequest {
  readonly action: AdminRewardFraudFlagReviewAction;
  readonly notes?: string;
}

/** GET `/api/v1/admin/rewards/fraud-flags/records/:id` and queue items (camelCase). */
export interface RewardFraudFlagQueueItemDto {
  readonly id: number;
  readonly flagType: string;
  readonly severity: string;
  readonly status: string;
  readonly subjectUserId: number | null;
  readonly relatedEntityType: string | null;
  readonly relatedEntityId: string | null;
  readonly rewardLedgerEntryId: number | null;
  readonly referralAttributionId: number | null;
  readonly sellerBoostPurchaseId: number | null;
  readonly reviewerUserId: number | null;
  readonly reviewedAt: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** GET `/api/v1/creator/analytics/listings` row. */
export interface SellerListingPerformanceItemDto {
  readonly productId: number;
  readonly title: string;
  readonly productStatus: string;
  readonly priceMinor: number;
  readonly currency: string;
  readonly viewCount: number;
  readonly completedOrderCount: number;
  readonly grossMinor: number;
  /** Impressions recorded on posts linked to this product while seller boosts were active. */
  readonly boostImpressionCount: number;
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
