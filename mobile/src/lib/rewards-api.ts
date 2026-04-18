import type {
  ReferralCodePeekResponse,
  ReferralsMeResponse,
  ReferralShareRecordedResponse,
  RewardsLedgerPageResponse,
  RewardsWalletMeResponse
} from "@deenly/rewards";
import { apiRequest } from "./api";

export async function fetchRewardsWalletMe(): Promise<RewardsWalletMeResponse> {
  return apiRequest<RewardsWalletMeResponse>("/rewards/me", { auth: true });
}

export async function fetchRewardsLedgerPage(params?: {
  cursor?: string | null;
  limit?: number;
}): Promise<RewardsLedgerPageResponse> {
  const sp = new URLSearchParams();
  if (params?.cursor) {
    sp.set("cursor", params.cursor);
  }
  if (params?.limit != null) {
    sp.set("limit", String(params.limit));
  }
  const q = sp.toString();
  return apiRequest<RewardsLedgerPageResponse>(`/rewards/ledger${q ? `?${q}` : ""}`, { auth: true });
}

export async function fetchReferralsMe(): Promise<ReferralsMeResponse> {
  return apiRequest<ReferralsMeResponse>("/referrals/me", { auth: true });
}

export async function fetchReferralCodePreview(code: string): Promise<ReferralCodePeekResponse> {
  const sp = new URLSearchParams();
  sp.set("code", code);
  return apiRequest<ReferralCodePeekResponse>(`/referrals/code-preview?${sp.toString()}`, { auth: false });
}

export async function postReferralShareRecorded(body?: { surface?: string }): Promise<ReferralShareRecordedResponse> {
  return apiRequest<ReferralShareRecordedResponse>("/referrals/me/share", {
    method: "POST",
    auth: true,
    body: body ?? {}
  });
}
