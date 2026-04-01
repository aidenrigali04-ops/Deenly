import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  FlatList,
  ListRenderItem,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { CompositeScreenProps } from "@react-navigation/native";
import { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import { apiRequest } from "../../lib/api";
import { ackPrayerReminder, fetchPrayerStatus } from "../../lib/prayer";
import { followUser, unfollowUser } from "../../lib/follows";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { PostCard } from "../../components/PostCard";
import { HomeTopBar } from "../../components/HomeTopBar";
import { HomeStoriesRow } from "../../components/HomeStoriesRow";
import { colors, radii } from "../../theme";
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
  const appliedProfileDefaultTab = useRef(false);
  const feedQueryKey = useMemo(
    () => ["mobile-feed", followingOnly, feedTab] as const,
    [followingOnly, feedTab]
  );
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ["mobile-feed-profile-me"],
    queryFn: () =>
      apiRequest<{ default_feed_tab?: "for_you" | "opportunities" | "marketplace" | null }>(
        "/users/me",
        { auth: true }
      ),
    enabled: feedVariant === "home"
  });

  useEffect(() => {
    if (appliedProfileDefaultTab.current || feedVariant !== "home") {
      return;
    }
    const t = profileQuery.data?.default_feed_tab;
    if (t === "for_you" || t === "opportunities" || t === "marketplace") {
      setFeedTab(t);
      appliedProfileDefaultTab.current = true;
    }
  }, [feedVariant, profileQuery.data?.default_feed_tab]);

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

  const acknowledgeReminder = useCallback(async () => {
    const reminderKey = prayerStatusQuery.data?.reminderKey;
    if (!reminderKey) return;
    await ackPrayerReminder(reminderKey);
    setAckedReminderKey(reminderKey);
  }, [prayerStatusQuery.data?.reminderKey]);

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

  const followMutation = useMutation({
    mutationFn: ({
      authorId,
      currentlyFollowing
    }: {
      authorId: number;
      currentlyFollowing: boolean;
    }) => (currentlyFollowing ? unfollowUser(authorId) : followUser(authorId)),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: feedQueryKey });
    }
  });

  const openNotifications = useCallback(() => {
    const parent = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
    parent?.navigate("Notifications");
  }, [navigation]);

  const listHeader = useMemo(() => {
    return (
      <View style={styles.headerBlock}>
        {visibleReminder ? (
          <View style={styles.reminderBanner}>
            <View style={styles.reminderRow}>
              <Text style={styles.reminderText}>Time for Salah</Text>
              <Pressable onPress={acknowledgeReminder} hitSlop={8}>
                <Text style={styles.reminderDismiss}>Dismiss</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {feedVariant === "marketplace" ? (
          <View style={styles.headerCard}>
            <View style={styles.filters}>
              <View style={styles.marketplaceTopRow}>
                <Text style={styles.marketplaceHint}>Creator offers and local businesses.</Text>
                <Pressable
                  style={styles.nearMePill}
                  onPress={() => navigation.navigate("BusinessesNearMe")}
                >
                  <Text style={styles.nearMePillText}>Near me</Text>
                </Pressable>
              </View>
              <Pressable
                style={[styles.chip, followingOnly ? styles.chipActive : null]}
                onPress={() => setFollowingOnly((value) => !value)}
              >
                <Text style={[styles.chipText, followingOnly ? styles.chipTextActive : null]}>
                  {followingOnly ? "Following only" : "All posts"}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {feedVariant === "home" ? (
          <View style={styles.storiesWrap}>
            <HomeStoriesRow />
          </View>
        ) : null}

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
                : "Create the first post."
            }
          />
        ) : null}
      </View>
    );
  }, [
    acknowledgeReminder,
    feedQuery.error,
    feedQuery.isLoading,
    feedQuery.refetch,
    feedVariant,
    followingOnly,
    items.length,
    navigation,
    visibleReminder
  ]);

  const renderItem: ListRenderItem<FeedItem> = useCallback(
    ({ item }) => (
      <View style={styles.cardWrap}>
        <PostCard
          item={item}
          layout="home"
          onOpen={() => navigation.navigate("PostDetail", { id: item.id })}
          onAuthor={() => navigation.navigate("UserProfile", { id: item.author_id })}
          onLike={() => likeMutation.mutate({ postId: item.id, nextLiked: !item.liked_by_viewer })}
          liking={likeMutation.isPending}
          onToggleFollow={(authorId, currentlyFollowing) =>
            followMutation.mutate({ authorId, currentlyFollowing })
          }
          followBusy={
            followMutation.isPending &&
            followMutation.variables?.authorId === item.author_id
          }
        />
      </View>
    ),
    [followMutation, likeMutation, navigation]
  );

  const onEndReached = useCallback(() => {
    if (feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) {
      void feedQuery.fetchNextPage();
    }
  }, [feedQuery]);

  const listFooter = useMemo(() => {
    if (!feedQuery.hasNextPage) {
      return null;
    }
    return (
      <View style={styles.footer}>
        {feedQuery.isFetchingNextPage ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Pressable style={styles.buttonSecondary} onPress={() => feedQuery.fetchNextPage()}>
            <Text style={styles.buttonText}>Load more</Text>
          </Pressable>
        )}
      </View>
    );
  }, [feedQuery]);

  return (
    <View style={styles.root}>
      {feedVariant === "home" ? <StatusBar style="dark" /> : null}
      {feedVariant === "home" ? (
        <HomeTopBar
          onPressCreate={() => navigation.navigate("CreateTab")}
          onPressAlerts={openNotifications}
        />
      ) : null}
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={items}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.35}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background
  },
  list: {
    flex: 1
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 24,
    gap: 12
  },
  headerBlock: {
    gap: 10,
    marginBottom: 4
  },
  headerCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.panel,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: colors.shadow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 1,
        shadowRadius: 24
      },
      android: { elevation: 3 }
    })
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center"
  },
  reminderBanner: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    ...Platform.select({
      ios: {
        shadowColor: colors.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 12
      },
      android: { elevation: 2 }
    })
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
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.surface
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  chipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700"
  },
  chipTextActive: {
    color: colors.onAccent
  },
  marketplaceTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    width: "100%"
  },
  marketplaceHint: {
    flex: 1,
    minWidth: 120,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    paddingVertical: 4
  },
  nearMePill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.surface
  },
  nearMePillText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700"
  },
  storiesWrap: {
    marginTop: 2
  },
  cardWrap: {
    marginBottom: 4
  },
  footer: {
    paddingVertical: 16,
    alignItems: "center"
  },
  buttonSecondary: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
    alignSelf: "stretch"
  },
  buttonText: {
    color: colors.text,
    fontWeight: "600"
  }
});
