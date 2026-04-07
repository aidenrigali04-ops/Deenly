import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  ListRenderItem,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { BottomTabScreenProps, useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { createGuestProductCheckout, createProductCheckout } from "../../lib/monetization";
import { hapticSuccess } from "../../lib/haptics";
import { useSessionStore } from "../../store/session-store";

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

function resolveCheckoutVariant(seed: number): "trust_first" | "speed_first" {
  return seed % 2 === 0 ? "trust_first" : "speed_first";
}

export function FeedScreen({ navigation, feedVariant = "home" }: Props) {
  const { height: viewportHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const compact = viewportHeight <= 700;
  const sessionUser = useSessionStore((s) => s.user);
  const [buyHandoffProductId, setBuyHandoffProductId] = useState<number | null>(null);
  const [followingOnly, setFollowingOnly] = useState(false);
  const [feedTab, setFeedTab] = useState<"for_you" | "opportunities" | "marketplace">(
    feedVariant === "marketplace" ? "marketplace" : "for_you"
  );
  const lastServerDefaultFeedTab = useRef<"for_you" | "opportunities" | "marketplace" | undefined>(undefined);
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
    if (feedVariant !== "home") {
      return;
    }
    const t = profileQuery.data?.default_feed_tab;
    if (t !== "for_you" && t !== "opportunities" && t !== "marketplace") {
      return;
    }
    if (lastServerDefaultFeedTab.current === undefined) {
      setFeedTab(t);
      lastServerDefaultFeedTab.current = t;
      return;
    }
    if (lastServerDefaultFeedTab.current !== t) {
      setFeedTab(t);
      lastServerDefaultFeedTab.current = t;
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
  const buyProductMutation = useMutation({
    mutationFn: async (productId: number) => {
      const checkoutVariant = resolveCheckoutVariant(productId);
      if (sessionUser) {
        return createProductCheckout(productId, { checkoutVariant });
      }
      return createGuestProductCheckout(productId, { smsOptIn: false, checkoutVariant });
    },
    onSuccess: async (result, productId) => {
      if (result?.checkoutUrl) {
        setBuyHandoffProductId(productId);
        await hapticSuccess();
        await new Promise((resolve) => setTimeout(resolve, 220));
        await Linking.openURL(result.checkoutUrl);
        setBuyHandoffProductId(null);
      }
    },
    onError: () => {
      setBuyHandoffProductId(null);
    }
  });

  const openNotifications = useCallback(() => {
    const parent = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
    parent?.navigate("Notifications");
  }, [navigation]);

  const listHeader = useMemo(() => {
    return (
      <View style={[styles.headerBlock, compact && styles.headerBlockCompact]}>
        {visibleReminder ? (
          <View style={[styles.reminderBanner, compact && styles.reminderBannerCompact]}>
            <View style={styles.reminderRow}>
              <Text style={styles.reminderText}>Time for Salah</Text>
              <Pressable onPress={acknowledgeReminder} hitSlop={8}>
                <Text style={styles.reminderDismiss}>Dismiss</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {feedVariant === "marketplace" ? (
          <View style={[styles.headerCard, compact && styles.headerCardCompact]}>
            <View style={styles.filters}>
              <View style={styles.marketplaceTopRow}>
                <Text style={[styles.marketplaceHint, compact && styles.marketplaceHintCompact]}>
                  Creator offers and local businesses.
                </Text>
                <Pressable
                  style={[styles.nearMePill, compact && styles.nearMePillCompact]}
                  onPress={() => navigation.navigate("BusinessesNearMe")}
                >
                  <Text style={styles.nearMePillText}>Near me</Text>
                </Pressable>
              </View>
              <Pressable
                style={[styles.chip, compact && styles.chipCompact, followingOnly ? styles.chipActive : null]}
                onPress={() => setFollowingOnly((value) => !value)}
              >
                <Text style={[styles.chipText, compact && styles.chipTextCompact, followingOnly ? styles.chipTextActive : null]}>
                  {followingOnly ? "Following only" : "All posts"}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {feedVariant === "home" ? (
          <View style={[styles.storiesWrap, compact && styles.storiesWrapCompact]}>
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
    visibleReminder,
    compact
  ]);

  const renderItem: ListRenderItem<FeedItem> = useCallback(
    ({ item }) => (
      <View style={[styles.cardWrap, compact && styles.cardWrapCompact]}>
        <PostCard
          item={item}
          layout="home"
          onViewOffer={(productId) => navigation.navigate("ProductDetail", { productId })}
          onBuyNow={(productId) => buyProductMutation.mutate(productId)}
          buyBusy={buyProductMutation.isPending}
          buyHandoffProductId={buyHandoffProductId}
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
    [buyHandoffProductId, buyProductMutation, followMutation, likeMutation, navigation, compact]
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
        contentContainerStyle={[
          styles.listContent,
          compact && styles.listContentCompact,
          feedVariant === "marketplace" ? { paddingTop: insets.top + 10 } : null,
          {
            paddingBottom:
              tabBarHeight + Math.max(insets.bottom, 8) + (compact ? 16 : 20)
          }
        ]}
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
    backgroundColor: colors.atmosphere
  },
  list: {
    flex: 1
  },
  listContent: {
    paddingHorizontal: 10,
    paddingBottom: 24,
    gap: 10
  },
  listContentCompact: {
    paddingHorizontal: 8,
    paddingBottom: 18,
    gap: 8
  },
  headerBlock: {
    gap: 8,
    marginBottom: 2
  },
  headerBlockCompact: {
    gap: 6
  },
  headerCard: {
    backgroundColor: colors.glassFillStrong,
    borderColor: colors.borderSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.panel,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    ...Platform.select({
      ios: {
        shadowColor: colors.shadow,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 1,
        shadowRadius: 18
      },
      android: { elevation: 3 }
    })
  },
  headerCardCompact: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8
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
  reminderBannerCompact: {
    paddingHorizontal: 12,
    paddingVertical: 9
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
    borderColor: colors.borderSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.pill,
    paddingHorizontal: 11,
    paddingVertical: 6,
    backgroundColor: colors.surface
  },
  chipCompact: {
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  chipText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "700"
  },
  chipTextCompact: {
    fontSize: 10
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
    fontSize: 11,
    fontWeight: "500",
    paddingVertical: 4
  },
  marketplaceHintCompact: {
    fontSize: 10
  },
  nearMePill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderRadius: radii.pill,
    paddingHorizontal: 11,
    paddingVertical: 6,
    backgroundColor: colors.surface
  },
  nearMePillCompact: {
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  nearMePillText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700"
  },
  storiesWrap: {
    marginTop: 4
  },
  storiesWrapCompact: {
    marginTop: 2
  },
  cardWrap: {
    marginBottom: 2
  },
  cardWrapCompact: {
    marginBottom: 1
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
