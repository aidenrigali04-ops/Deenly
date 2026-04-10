import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  ListRenderItem,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ViewToken
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
          <View style={styles.marketHeader}>
            <Text style={styles.marketPageTitle}>Market</Text>
            <Text style={styles.marketOneLiner}>Browse creator offers and local businesses.</Text>
            <Pressable style={styles.marketSearchBar} onPress={openSearch} accessibilityRole="search">
              <Text style={styles.marketSearchPlaceholder}>Search products, people, and places</Text>
            </Pressable>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.marketChipRow}
            >
              <Pressable
                style={[styles.marketChip, !followingOnly && styles.marketChipOn]}
                onPress={() => setFollowingOnly(false)}
              >
                <Text style={[styles.marketChipText, !followingOnly && styles.marketChipTextOn]}>All</Text>
              </Pressable>
              <Pressable
                style={[styles.marketChip, followingOnly && styles.marketChipOn]}
                onPress={() => setFollowingOnly(true)}
              >
                <Text style={[styles.marketChipText, followingOnly && styles.marketChipTextOn]}>Following</Text>
              </Pressable>
              <Pressable style={styles.marketChip} onPress={() => navigation.navigate("BusinessesNearMe")}>
                <Text style={styles.marketChipText}>Near me</Text>
              </Pressable>
              <Pressable style={styles.marketChip} onPress={openSearch}>
                <Text style={styles.marketChipText}>Services</Text>
              </Pressable>
              <Pressable style={styles.marketChip} onPress={() => setFeedTab("marketplace")}>
                <Text style={styles.marketChipText}>Products</Text>
              </Pressable>
              <Pressable style={styles.marketChip} onPress={() => navigation.navigate("Search")}>
                <Text style={styles.marketChipText}>Events</Text>
              </Pressable>
              <Pressable style={styles.marketChip} onPress={openSearch}>
                <Text style={styles.marketChipText}>Food</Text>
              </Pressable>
            </ScrollView>
            {canCreateProducts ? (
              <Pressable style={styles.marketSellerCue} onPress={() => navigation.navigate("CreatorEconomy")}>
                <Text style={styles.marketSellerCueText}>Creator hub · sell on Deenly</Text>
              </Pressable>
            ) : null}
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
              ) : null}
              <Pressable style={styles.marketEmptyBtnSecondary} onPress={() => navigation.navigate("HomeTab")}>
                <Text style={styles.marketEmptyBtnSecondaryText}>Go to Home</Text>
              </Pressable>
              {canCreateProducts ? (
                <Pressable style={styles.marketEmptyBtnSecondary} onPress={() => navigation.navigate("CreatorEconomy")}>
                  <Text style={styles.marketEmptyBtnSecondaryText}>Open Creator hub</Text>
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
    setFeedTab,
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

  return (
    <View style={styles.root}>
      {feedVariant === "home" ? <StatusBar style="dark" /> : null}
      {feedVariant === "home" ? (
        <HomeTopBar
          onPressCreate={() => navigation.navigate("CreateTab", { screen: "CreateHub" })}
          onPressAlerts={openNotifications}
          onPressSearch={openSearch}
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
  list: {
    flex: 1
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
  marketHeader: {
    paddingHorizontal: spacing.pagePaddingH,
    paddingBottom: spacing.sectionGap,
    gap: 12
  },
  marketPageTitle: {
    fontSize: 32,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.6
  },
  marketOneLiner: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20
  },
  marketSearchBar: {
    minHeight: 46,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    justifyContent: "center"
  },
  marketSearchPlaceholder: {
    fontSize: 15,
    color: colors.mutedLight
  },
  marketChipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4
  },
  marketChip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  marketChipOn: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent
  },
  marketChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text
  },
  marketChipTextOn: {
    color: colors.accent
  },
  marketSellerCue: {
    alignSelf: "flex-start",
    paddingVertical: 4
  },
  marketSellerCueText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.accent
  },
  marketEmptyPanel: {
    backgroundColor: colors.surface,
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    padding: 16,
    gap: 12,
    marginHorizontal: 4,
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
  marketEmptyPanelCompact: {
    padding: 14,
    gap: 10
  },
  marketEmptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text
  },
  marketEmptySub: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted
  },
  marketEmptyBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.control,
    ...primaryButtonOutline
  },
  marketEmptyBtnText: {
    color: colors.accent,
    fontWeight: "700",
    fontSize: 14
  },
  marketEmptyBtnSecondary: {
    alignSelf: "flex-start",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.control,
    backgroundColor: colors.card
  },
  marketEmptyBtnSecondaryText: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 14
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
