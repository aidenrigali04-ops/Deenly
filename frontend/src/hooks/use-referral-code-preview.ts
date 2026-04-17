import { useQuery } from "@tanstack/react-query";
import { fetchReferralCodePreview } from "@/lib/rewards-api";

export function referralCodePreviewQueryKey(code: string) {
  return ["referrals", "code-preview", code] as const;
}

export function useReferralCodePreviewQuery(rawCode: string | null | undefined) {
  const normalized = typeof rawCode === "string" ? rawCode.trim() : "";
  return useQuery({
    queryKey: referralCodePreviewQueryKey(normalized),
    queryFn: () => fetchReferralCodePreview(normalized),
    enabled: normalized.length > 0,
    staleTime: 60_000,
    retry: 1
  });
}
