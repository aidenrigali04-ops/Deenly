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
  useWindowDimensions,
  type ViewToken
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { MarketplaceTopBar } from "../../components/MarketplaceTopBar";
import { MarketplaceFeedPanel } from "../../components/MarketplaceFeedPanel";
import { BottomTabScreenProps, useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CompositeScreenProps } from "@react-navigation/native";
import { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import { apiRequest } from "../../lib/api";
import { ackPrayerReminder, fetchPrayerStatus } from "../../lib/prayer";
import { followUser, unfollowUser } from "../../lib/follows";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { FeedEventCard } from "../../components/FeedEventCard";
import { MarketListingCard } from "../../components/MarketListingCard";
import { isImageMedia, PostCard } from "../../components/PostCard";
import { HomeTopBar } from "../../components/HomeTopBar";
import { HomeStoriesRow } from "../../components/HomeStoriesRow";
import { colors, primaryButtonOutline, radii, spacing } from "../../theme";
import type { FeedItem, FeedListItem } from "../../types";
import type { AppTabParamList, RootStackParamList } from "../../navigation/AppNavigator";
import { createGuestProductCheckout, createProductCheckout } from "../../lib/monetization";
import { hapticSuccess } from "../../lib/haptics";
import { useSessionStore } from "../../store/session-store";

type FeedResponse = {
  items: FeedListItem[];
  nextCursor: string | null;
};

function isFeedPostItem(item: FeedListItem): item is FeedItem {
  return typeof item.id === "number";
}

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

  const marketplaceCapsQuery = useQuery({
    queryKey: ["mobile-marketplace-me-caps"],
    queryFn: () =>
      apiRequest<{ persona_capabilities?: { can_create_products?: boolean } }>("/users/me", { auth: true }),
    enabled: feedVariant === "marketplace"
  });
  const canCreateProducts = Boolean(marketplaceCapsQuery.data?.persona_capabilities?.can_create_products);

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

  const items = useMemo(
    () => feedQuery.data?.pages.flatMap((page) => page.items) || [],
    [feedQuery.data?.pages]
  );

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

  const [activeVideoPostId, setActiveVideoPostId] = useState<number | null>(null);
  const activeVideoPostIdRef = useRef<number | null>(null);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const ordered = [...viewableItems]
        .filter((v) => v.isViewable && v.item != null)
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

      let next: number | null = null;
      for (const v of ordered) {
        const row = v.item as FeedListItem;
        if (!isFeedPostItem(row)) {
          continue;
        }
        if (row.media_url && !isImageMedia(row)) {
          next = row.id;
          break;
        }
      }

      if (activeVideoPostIdRef.current !== next) {
        activeVideoPostIdRef.current = next;
        setActiveVideoPostId(next);
      }
    }
  );

  const viewabilityConfig = useMemo(
    () => ({
      itemVisiblePercentThreshold: 55,
      minimumViewTime: 160,
      waitForInteraction: false
    }),
    []
  );

  useEffect(() => {
    const sponsoredCampaignIds = items
      .filter((item) => Boolean(item.sponsored && item.ad_campaign_id))
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

  const openSearch = useCallback(() => {
    const parent = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
    parent?.navigate("Search");
  }, [navigation]);

  const openReels = useCallback(() => {
    const parent = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
    parent?.navigate("Reels");
  }, [navigation]);

  const listHeader = useMemo(() => {
    return (
      <View style={[styles.headerBlock, compact && styles.headerBlockCompact]}>
        {feedVariant === "home" && visibleReminder ? (
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
          <MarketplaceFeedPanel
            onPressSearch={openSearch}
            followingOnly={followingOnly}
            onSetFollowingOnly={setFollowingOnly}
            onPressNearMe={() => navigation.navigate("BusinessesNearMe")}
            onPressEvents={openSearch}
            showCreatorHub={canCreateProducts}
            onPressCreatorHub={() => navigation.navigate("CreatorEconomy")}
          />
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
          feedVariant === "marketplace" ? (
            <View style={[styles.marketEmptyPanel, compact && styles.marketEmptyPanelCompact]}>
              <Text style={styles.marketEmptyTitle}>No marketplace posts yet</Text>
              <Text style={styles.marketEmptySub}>
                Listings from creators you follow appear here. Widen the feed or check the home tab for more activity.
              </Text>
              {followingOnly ? (
                <Pressable style={styles.marketEmptyBtn} onPress={() => setFollowingOnly(false)}>
                  <Text style={styles.marketEmptyBtnText}>Show all posts</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.marketEmptyBtn} onPress={() => navigation.navigate("HomeTab")}>
                  <Text style={styles.marketEmptyBtnText}>Go to Home</Text>
                </Pressable>
              )}
              {canCreateProducts ? (
                <Pressable style={styles.marketEmptyTertiary} onPress={() => navigation.navigate("CreatorEconomy")}>
                  <Text style={styles.marketEmptyTertiaryText}>Open Creator hub</Text>
                </Pressable>
              ) : null}
              {followingOnly ? (
                <Pressable style={styles.marketEmptyTertiary} onPress={() => navigation.navigate("HomeTab")}>
                  <Text style={styles.marketEmptyTertiaryText}>Go to Home</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <EmptyState title="No posts yet" subtitle="Create the first post." />
          )
        ) : null}
      </View>
    );
  }, [
    acknowledgeReminder,
    feedQuery,
    feedVariant,
    followingOnly,
    items.length,
    navigation,
    openSearch,
    visibleReminder,
    compact,
    canCreateProducts
  ]);

  const renderItem: ListRenderItem<FeedListItem> = useCallback(
    ({ item }) => {
      if ("card_type" in item && item.card_type === "event") {
        return (
          <View style={[styles.cardWrap, compact && styles.cardWrapCompact]}>
            <FeedEventCard
              item={item}
              compact={compact}
              onOpen={() => navigation.navigate("EventDetail", { id: item.event.id })}
            />
          </View>
        );
      }
      if (!isFeedPostItem(item)) {
        return <View style={[styles.cardWrap, compact && styles.cardWrapCompact]} />;
      }
      const post = item;
      const isVideoPost = Boolean(post.media_url) && !isImageMedia(post);
      const mediaPlaybackActive = !isVideoPost || post.id === activeVideoPostId;
      if (feedVariant === "marketplace") {
        return (
          <View style={[styles.cardWrap, compact && styles.cardWrapCompact]}>
            <MarketListingCard
              item={post}
              viewerUserId={sessionUser?.id ?? null}
              mediaPlaybackActive={mediaPlaybackActive}
              onOpenSeller={() => navigation.navigate("UserProfile", { id: post.author_id })}
              onViewListing={() =>
                post.attached_product_id
                  ? navigation.navigate("ProductDetail", { productId: post.attached_product_id })
                  : navigation.navigate("PostDetail", { id: post.id })
              }
              onMessageSeller={() =>
                navigation.navigate("MessagesTab", { openUserId: post.author_id })
              }
              onOpenPost={() => navigation.navigate("PostDetail", { id: post.id })}
              onToggleFollow={(authorId, currentlyFollowing) =>
                followMutation.mutate({ authorId, currentlyFollowing })
              }
              followBusy={
                followMutation.isPending && followMutation.variables?.authorId === post.author_id
              }
              onLike={() =>
                likeMutation.mutate({ postId: post.id, nextLiked: !post.liked_by_viewer })
              }
              liking={likeMutation.isPending && likeMutation.variables?.postId === post.id}
            />
          </View>
        );
      }
      return (
        <View style={[styles.cardWrap, compact && styles.cardWrapCompact]}>
          <PostCard
            item={post}
            layout="home"
            mediaPlaybackActive={mediaPlaybackActive}
            onOpenPost={() => navigation.navigate("PostDetail", { id: post.id })}
            onViewOffer={(productId) => navigation.navigate("ProductDetail", { productId })}
            onBuyNow={(productId) => buyProductMutation.mutate(productId)}
            buyBusy={buyProductMutation.isPending}
            buyHandoffProductId={buyHandoffProductId}
            onLike={() => likeMutation.mutate({ postId: post.id, nextLiked: !post.liked_by_viewer })}
            liking={likeMutation.isPending}
            onToggleFollow={(authorId, currentlyFollowing) =>
              followMutation.mutate({ authorId, currentlyFollowing })
            }
            followBusy={
              followMutation.isPending &&
              followMutation.variables?.authorId === post.author_id
            }
          />
        </View>
      );
    },
    [
      activeVideoPostId,
      buyHandoffProductId,
      buyProductMutation,
      feedVariant,
      followMutation,
      likeMutation,
      navigation,
      compact,
      sessionUser?.id
    ]
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

  /** Tab bar is a floating pill — extra scroll inset so last cards clear it */
  const listBottomPad =
    tabBarHeight + Math.max(insets.bottom, 8) + (compact ? 16 : 20) + 32;

  return (
    <View style={[styles.root, feedVariant === "marketplace" && styles.rootMarketplace]}>
      {feedVariant === "home" || feedVariant === "marketplace" ? <StatusBar style="dark" /> : null}
      {feedVariant === "home" ? (
        <HomeTopBar
          onPressCreate={() => navigation.navigate("CreateTab", { screen: "CreateHub" })}
          onPressAlerts={openNotifications}
          onPressSearch={openSearch}
        />
      ) : null}
      {feedVariant === "marketplace" ? (
        <MarketplaceTopBar
          onPressReels={openReels}
          onPressSearch={openSearch}
          onPressNotifications={openNotifications}
        />
      ) : null}
      <FlatList
        style={[styles.list, feedVariant === "marketplace" && styles.listMarketplace]}
        contentContainerStyle={[
          styles.listContent,
          compact && styles.listContentCompact,
          feedVariant === "marketplace" && styles.listContentMarketplace,
          { paddingBottom: listBottomPad }
        ]}
        data={items}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.35}
        keyboardShouldPersistTaps="handled"
        onViewableItemsChanged={onViewableItemsChanged.current}
        viewabilityConfig={viewabilityConfig}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.atmosphere
  },
  rootMarketplace: {
    backgroundColor: "#FFFFFF"
  },
  list: {
    flex: 1
  },
  listMarketplace: {
    backgroundColor: "#FFFFFF"
  },
  listContent: {
    paddingHorizontal: spacing.pagePaddingH,
    paddingBottom: 24,
    gap: 16
  },
  listContentCompact: {
    paddingHorizontal: 12,
    paddingBottom: 18,
    gap: 12
  },
  listContentMarketplace: {
    paddingTop: 12,
    gap: 18
  },
  headerBlock: {
    gap: 8,
    marginBottom: 2
  },
  headerBlockCompact: {
    gap: 6
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
  marketEmptyPanel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: "#0A0A0A",
    padding: spacing.cardPaddingLg,
    gap: 12,
    marginHorizontal: 2
  },
  marketEmptyPanelCompact: {
    padding: 14,
    gap: 10
  },
  marketEmptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text
  },
  marketEmptySub: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted
  },
  marketEmptyBtn: {
    alignSelf: "stretch",
    ...primaryButtonOutline
  },
  marketEmptyBtnText: {
    color: colors.onAccent,
    fontWeight: "600",
    fontSize: 15
  },
  marketEmptyTertiary: {
    alignSelf: "center",
    paddingVertical: 6
  },
  marketEmptyTertiaryText: {
    color: colors.muted,
    fontWeight: "500",
    fontSize: 15
  },
  storiesWrap: {
    marginTop: 16,
    marginHorizontal: 0
  },
  storiesWrapCompact: {
    marginTop: 12
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
