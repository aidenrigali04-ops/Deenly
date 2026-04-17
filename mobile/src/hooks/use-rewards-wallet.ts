import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { fetchRewardsLedgerPage, fetchRewardsWalletMe } from "../lib/rewards-api";

const LEDGER_PAGE_SIZE = 25;

export const rewardsWalletQueryKey = ["rewards", "me"] as const;

export function useRewardsWalletMeQuery(enabled = true) {
  return useQuery({
    queryKey: rewardsWalletQueryKey,
    queryFn: () => fetchRewardsWalletMe(),
    enabled
  });
}

export function useRewardsLedgerInfiniteQuery(enabled = true) {
  return useInfiniteQuery({
    queryKey: ["rewards", "ledger", "infinite"] as const,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      fetchRewardsLedgerPage({ cursor: pageParam ?? undefined, limit: LEDGER_PAGE_SIZE }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled
  });
}
