"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FeedView } from "@/components/feed-view";
import { apiRequest } from "@/lib/api";
import { fetchSessionMe } from "@/lib/auth";

type MeForHome = {
  app_landing?: string | null;
  default_feed_tab?: "for_you" | "opportunities" | "marketplace" | null;
};

export default function HomeFeedPage() {
  const router = useRouter();
  const sessionQuery = useQuery({
    queryKey: ["home-session-me"],
    queryFn: () => fetchSessionMe()
  });
  const profileQuery = useQuery({
    queryKey: ["account-profile-me"],
    queryFn: () => apiRequest<MeForHome>("/users/me", { auth: true }),
    enabled: Boolean(sessionQuery.data?.id)
  });

  useEffect(() => {
    if (!profileQuery.data?.app_landing) {
      return;
    }
    if (profileQuery.data.app_landing === "marketplace") {
      router.replace("/marketplace");
    }
  }, [profileQuery.data?.app_landing, router]);

  const initialFeedTab = profileQuery.data?.default_feed_tab;
  const validTab =
    initialFeedTab === "for_you" ||
    initialFeedTab === "opportunities" ||
    initialFeedTab === "marketplace"
      ? initialFeedTab
      : undefined;

  return (
    <FeedView
      heading="Home"
      showStories
      homeStyle
      initialFeedTab={profileQuery.isSuccess ? validTab : undefined}
    />
  );
}
