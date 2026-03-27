import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { CompositeScreenProps } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { apiRequest } from "../../lib/api";
import { ackPrayerReminder, fetchPrayerStatus } from "../../lib/prayer";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { PostCard } from "../../components/PostCard";
import { colors } from "../../theme";
import type { FeedItem } from "../../types";
import type { AppTabParamList, RootStackParamList } from "../../navigation/AppNavigator";

type FeedResponse = {
  items: FeedItem[];
  nextCursor: string | null;
};

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList>,
  NativeStackScreenProps<RootStackParamList>
> & {
  feedVariant?: "home" | "marketplace";
};

export function FeedScreen({ navigation, feedVariant = "home" }: Props) {
  const [followingOnly, setFollowingOnly] = useState(false);
  const [feedTab, setFeedTab] = useState<"for_you" | "opportunities" | "marketplace">(
    feedVariant === "marketplace" ? "marketplace" : "for_you"
  );
  const feedQueryKey = useMemo(
    () => ["mobile-feed", followingOnly, feedTab] as const,
    [followingOnly, feedTab]
  );
  const queryClient = useQueryClient();

  const feedQuery = useInfiniteQuery({
    queryKey: feedQueryKey,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams();
      query.set("limit", "10");
      if (pageParam) {
        query.set("cursor", String(pageParam));
      }
      if (followingOnly) {
        query.set("followingOnly", "true");
      }
      query.set("feedTab", feedTab);
      return apiRequest<FeedResponse>(`/feed?${query.toString()}`, { auth: true });
    },
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined
  });
  const prayerStatusQuery = useQuery({
    queryKey: ["mobile-prayer-status"],
    queryFn: () => fetchPrayerStatus(),
    refetchInterval: 60_000
  });
  const hasReminder = Boolean(
    prayerStatusQuery.data?.shouldRemind &&
      prayerStatusQuery.data?.reminderText &&
      prayerStatusQuery.data?.reminderKey
  );
  const [ackedReminderKey, setAckedReminderKey] = useState<string | null>(null);
  const visibleReminder = hasReminder && ackedReminderKey !== prayerStatusQuery.data?.reminderKey;

  const acknowledgeReminder = async () => {
    const reminderKey = prayerStatusQuery.data?.reminderKey;
    if (!reminderKey) return;
    await ackPrayerReminder(reminderKey);
    setAckedReminderKey(reminderKey);
  };

  const items = feedQuery.data?.pages.flatMap((page) => page.items) || [];
  useEffect(() => {
    const sponsoredCampaignIds = items
      .filter((item) => item.sponsored && item.ad_campaign_id)
      .map((item) => Number(item.ad_campaign_id))
      .filter((id) => Number.isFinite(id));
    sponsoredCampaignIds.forEach((campaignId) => {
      apiRequest("/ads/events/impression", {
        method: "POST",
        auth: true,
        body: { campaignId }
      }).catch(() => null);
    });
  }, [items]);
  const likeMutation = useMutation({
    mutationFn: ({ postId, nextLiked }: { postId: number; nextLiked: boolean }) =>
      nextLiked
        ? apiRequest("/interactions", {
            method: "POST",
            auth: true,
            body: { postId, interactionType: "benefited" }
          })
        : apiRequest("/interactions", {
            method: "DELETE",
            auth: true,
            body: { postId, interactionType: "benefited" }
          }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: feedQueryKey });
    }
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>{feedVariant === "marketplace" ? "Marketplace" : "Home"}</Text>
        <View style={styles.topPills}>
          <Pressable style={styles.topPill} onPress={() => navigation.navigate("Dhikr")}>
            <Text style={styles.topPillText}>Dhikr</Text>
          </Pressable>
          <Pressable style={styles.topPill} onPress={() => navigation.navigate("Reels")}>
            <Text style={styles.topPillText}>Reels</Text>
          </Pressable>
        </View>
      </View>
      {visibleReminder ? (
        <View style={styles.reminderBanner}>
          <View style={styles.reminderRow}>
            <Text style={styles.reminderText}>Time for Salah</Text>
            <Pressable onPress={acknowledgeReminder}>
              <Text style={styles.reminderDismiss}>Dismiss</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      <View style={styles.filters}>
        {feedVariant === "marketplace" ? (
          <Text style={styles.marketplaceHint}>Creator offers and promotions.</Text>
        ) : (
          <>
            <Pressable
              style={[styles.chip, feedTab === "for_you" ? styles.chipActive : null]}
              onPress={() => setFeedTab("for_you")}
            >
              <Text style={styles.chipText}>For You</Text>
            </Pressable>
            <Pressable
              style={[styles.chip, feedTab === "opportunities" ? styles.chipActive : null]}
              onPress={() => setFeedTab("opportunities")}
            >
              <Text style={styles.chipText}>Opportunities</Text>
            </Pressable>
            <Pressable
              style={[styles.chip, feedTab === "marketplace" ? styles.chipActive : null]}
              onPress={() => setFeedTab("marketplace")}
            >
              <Text style={styles.chipText}>Marketplace</Text>
            </Pressable>
          </>
        )}
        <Pressable
          style={[styles.chip, followingOnly ? styles.chipActive : null]}
          onPress={() => setFollowingOnly((value) => !value)}
        >
          <Text style={styles.chipText}>{followingOnly ? "Following only" : "All posts"}</Text>
        </Pressable>
      </View>

      {feedQuery.isLoading ? <LoadingState label="Loading feed..." /> : null}
      {feedQuery.error ? (
        <ErrorState
          message={(feedQuery.error as Error).message}
          onRetry={() => feedQuery.refetch()}
        />
      ) : null}
      {!feedQuery.isLoading && !feedQuery.error && items.length === 0 ? (
        <EmptyState
          title="No posts yet"
          subtitle={
            feedVariant === "marketplace"
              ? "Add a marketplace post with a product from Creator hub."
              : "Create the first beneficial post."
          }
        />
      ) : null}

      <View style={styles.stack}>
        {items.map((item) => (
          <PostCard
            key={item.id}
            item={item}
            layout="home"
            onOpen={() => navigation.navigate("PostDetail", { id: item.id })}
            onAuthor={() => navigation.navigate("UserProfile", { id: item.author_id })}
            onLike={() => likeMutation.mutate({ postId: item.id, nextLiked: !item.liked_by_viewer })}
            liking={likeMutation.isPending}
          />
        ))}
      </View>

      {feedQuery.hasNextPage ? (
        <Pressable
          style={styles.buttonSecondary}
          disabled={feedQuery.isFetchingNextPage}
          onPress={() => feedQuery.fetchNextPage()}
        >
          <Text style={styles.buttonText}>
            {feedQuery.isFetchingNextPage ? "Loading..." : "Load more"}
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  heading: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700"
  },
  topPills: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  topPill: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  topPillText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600"
  },
  filters: {
    flexDirection: "row",
    gap: 8
  },
  reminderBanner: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.card
  },
  reminderText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700"
  },
  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  reminderDismiss: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600"
  },
  chip: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  chipActive: {
    backgroundColor: colors.accent
  },
  chipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700"
  },
  marketplaceHint: {
    flex: 1,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    paddingVertical: 4
  },
  stack: {
    gap: 12
  },
  buttonSecondary: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center"
  },
  buttonText: {
    color: colors.text,
    fontWeight: "600"
  }
});
