import type { QueryClient } from "@tanstack/react-query";

/**
 * PATCH /users/me/preferences returns the same payload as GET /users/me.
 * Seed every mobile cache that reads /users/me so persona switches update Create, Feed, Profile, and nav-related UI.
 */
export async function applyMobileMeProfileAfterPreferencesPatch(queryClient: QueryClient, me: unknown) {
  queryClient.setQueryData(["mobile-account-profile"], me);
  queryClient.setQueryData(["mobile-create-profile"], me);
  queryClient.setQueryData(["mobile-feed-profile-me"], me);
  queryClient.setQueryData(["mobile-user-me-onboarding"], me);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["mobile-search-profile-capabilities"] }),
    queryClient.invalidateQueries({ queryKey: ["mobile-creator-connect-status"] }),
    queryClient.invalidateQueries({ queryKey: ["mobile-creator-earnings"] }),
    queryClient.invalidateQueries({ queryKey: ["mobile-creator-products"] }),
    queryClient.invalidateQueries({ queryKey: ["mobile-creator-tiers"] }),
    queryClient.invalidateQueries({ queryKey: ["mobile-creator-affiliate-codes"] }),
    queryClient.invalidateQueries({ queryKey: ["mobile-creator-profile-capabilities"] }),
    queryClient.invalidateQueries({ queryKey: ["mobile-create-my-products"] }),
    queryClient.invalidateQueries({ queryKey: ["mobile-create-connect-status"] }),
    queryClient.invalidateQueries({ queryKey: ["mobile-businesses-mine"] })
  ]);
}
