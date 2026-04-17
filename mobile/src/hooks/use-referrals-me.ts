import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchReferralsMe, postReferralShareRecorded } from "../lib/rewards-api";

export const referralsMeQueryKey = ["referrals", "me"] as const;

export function useReferralsMeQuery(enabled = true) {
  return useQuery({
    queryKey: referralsMeQueryKey,
    queryFn: () => fetchReferralsMe(),
    enabled
  });
}

export function useReferralShareRecordedMutation() {
  return useMutation({
    mutationFn: (surface?: string) => postReferralShareRecorded(surface ? { surface } : {})
  });
}
