import type { QueryClient } from "@tanstack/react-query";

/**
 * PATCH /users/me/preferences returns the same payload as GET /users/me.
 * Seed every client cache that reads /users/me so persona, caps, and feed defaults update immediately.
 */
export async function applyWebMeProfileAfterPreferencesPatch(queryClient: QueryClient, me: unknown) {
  queryClient.setQueryData(["account-profile-me"], me);
  queryClient.setQueryData(["creator-hub-profile-me"], me);
  queryClient.setQueryData(["nav-user-profile-kind"], me);
  queryClient.setQueryData(["creator-product-composer-me-profile"], me);
  queryClient.setQueryData(["web-user-me-onboarding"], me);
  queryClient.setQueriesData({ queryKey: ["create-post-composer-profile"] }, () => me);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["account-monetization-connect"] }),
    queryClient.invalidateQueries({ queryKey: ["account-monetization-products"] }),
    queryClient.invalidateQueries({ queryKey: ["account-monetization-tiers"] }),
    queryClient.invalidateQueries({ queryKey: ["account-monetization-earnings"] }),
    queryClient.invalidateQueries({ queryKey: ["account-monetization-affiliate-codes"] }),
    queryClient.invalidateQueries({ queryKey: ["account-monetization-affiliate-performance"] })
  ]);
}
