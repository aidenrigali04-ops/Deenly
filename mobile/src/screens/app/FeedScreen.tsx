import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  ListRenderItem,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ViewToken
} from "react-native";
import { StatusBar } from "expo-status-bar";

import { BottomTabScreenProps, useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CompositeScreenProps, useRoute, type RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import { apiRequest } from "../../lib/api";
import { ackPrayerReminder, fetchPrayerStatus } from "../../lib/prayer";
import { followUser, unfollowUser } from "../../lib/follows";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { FeedEventCard } from "../../components/FeedEventCard";
import { MarketListingCard } from "../../components/MarketListingCard";
import { isImageMedia, PostCard } from "../../components/PostCard";
import { HomeFeedHeader } from "../../components/HomeFeedHeader";
import { HomeStoriesRow } from "../../components/HomeStoriesRow";
import { radii } from "../../theme";
import { useAppChrome } from "../../lib/use-app-chrome";
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
  BottomTabScreenProps<AppTabParamList, "HomeTab">,
  NativeStackScreenProps<RootStackParamList>
>;

function resolveCheckoutVariant(seed: number): "trust_first" | "speed_first" {
  return seed % 2 === 0 ? "trust_first" : "speed_first";
}

export function FeedScreen({ navigation }: Props) {
  const route = useRoute<RouteProp<AppTabParamList, "HomeTab">>();
  const chrome = useAppChrome();
  const { height: viewportHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const compact = viewportHeight <= 700;
  const sessionUser = useSessionStore((s) => s.user);
  const [buyHandoffProductId, setBuyHandoffProductId] = useState<number | null>(null);
  const [followingOnly, setFollowingOnly] = useState(false);
  const [feedTab, setFeedTab] = useState<"for_you" | "marketplace">("for_you");
  const lastServerDefaultFeedTab = useRef<"for_you" | "marketplace" | undefined>(undefined);
  const feedQueryKey = useMemo(
    () => ["mobile-feed", followingOnly, feedTab] as const,
    [followingOnly, feedTab]
  );
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ["mobile-feed-profile-me"],
    queryFn: () =>
      apiRequest<{
        /** Legacy `opportunities` may exist until preferences are re-saved. */
        default_feed_tab?: string | null;
        display_name?: string;
        avatar_url?: string | null;
      }>("/users/me", { auth: true }),
    enabled: true
  });

  useEffect(() => {
    if (route.params?.openMarketplace) {
      setFeedTab("marketplace");
      navigation.setParams({ openMarketplace: undefined });
    }
  }, [route.params?.openMarketplace, navigation]);

  useEffect(() => {
    const raw = profileQuery.data?.default_feed_tab;
    const t = raw === "opportunities" ? "for_you" : raw;
    if (t !== "for_you" && t !== "marketplace") {
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
  }, [profileQuery.data?.default_feed_tab]);

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
    navigation.navigate("SearchTab", { focusSearch: true });
  }, [navigation]);

  const openReels = useCallback(() => {
    navigation.navigate("ReelsTab");
  }, [navigation]);

  const openAccountTab = useCallback(() => {
    navigation.navigate("AccountTab");
  }, [navigation]);

  const openMessagesTab = useCallback(() => {
    navigation.navigate("MessagesTab", {});
  }, [navigation]);

  const listHeader = useMemo(() => {
    return (
      <View style={[styles.headerBlock, compact && styles.headerBlockCompact]}>
        {visibleReminder ? (
          <View
            style={[
              styles.reminderBanner,
              compact && styles.reminderBannerCompact,
              { borderColor: chrome.figma.glassBorder, backgroundColor: chrome.figma.glassSoft }
            ]}
          >
            <View style={styles.reminderRow}>
              <Text style={[styles.reminderText, { color: chrome.figma.text }]}>Time for Salah</Text>
              <Pressable onPress={acknowledgeReminder} hitSlop={8}>
                <Text style={[styles.reminderDismiss, { color: chrome.figma.textMuted }]}>Dismiss</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={[styles.feedTabBar, compact && styles.feedTabBarCompact]}>
            {(
              [
                { key: "for_you" as const, label: "For You" },
                { key: "marketplace" as const, label: "Marketplace" }
              ] as const
            ).map(({ key, label }) => {
              const on = feedTab === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setFeedTab(key)}
                  style={styles.feedTabHit}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                >
                  <Text
                    style={[
                      styles.feedTabLabel,
                      { color: chrome.figma.textMuted2 },
                      on && { color: chrome.figma.accentGold }
                    ]}
                  >
                    {label}
                  </Text>
                  <View
                    style={[styles.feedTabRule, on && { backgroundColor: chrome.figma.accentGold }]}
                  />
                </Pressable>
              );
            })}
          </View>

        <View style={[styles.storiesWrap, compact && styles.storiesWrapCompact]}>
          <HomeStoriesRow />
        </View>

        {feedQuery.isLoading ? <LoadingState label="Loading feed..." surface="dark" /> : null}
        {feedQuery.error ? (
          <ErrorState
            message={(feedQuery.error as Error).message}
            onRetry={() => feedQuery.refetch()}
            surface="dark"
          />
        ) : null}
        {!feedQuery.isLoading && !feedQuery.error && items.length === 0 ? (
          <EmptyState title="No posts yet" subtitle="Create the first post." surface="dark" />
        ) : null}
      </View>
    );
  }, [acknowledgeReminder, chrome, feedQuery, items.length, visibleReminder, compact, feedTab]);

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
      if (feedTab === "marketplace") {
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
            onPostMenu={() => {
              Alert.alert(
                post.author_display_name,
                undefined,
                [
                  {
                    text: post.is_following_author ? "Unfollow" : "Follow",
                    onPress: () =>
                      followMutation.mutate({
                        authorId: post.author_id,
                        currentlyFollowing: Boolean(post.is_following_author)
                      })
                  },
                  {
                    text: "Share",
                    onPress: () =>
                      void Share.share({
                        message: `${post.author_display_name} on Deenly\n${(post.content || "").slice(0, 280)}`
                      })
                  },
                  { text: "Cancel", style: "cancel" }
                ]
              );
            }}
          />
        </View>
      );
    },
    [
      activeVideoPostId,
      buyHandoffProductId,
      buyProductMutation,
      feedTab,
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
          <ActivityIndicator color={chrome.figma.accentGold} />
        ) : (
          <Pressable
            style={[
              styles.buttonSecondary,
              { borderColor: chrome.figma.glassBorder, backgroundColor: chrome.figma.glassSoft }
            ]}
            onPress={() => feedQuery.fetchNextPage()}
          >
            <Text style={[styles.buttonText, { color: chrome.figma.text }]}>Load more</Text>
          </Pressable>
        )}
      </View>
    );
  }, [chrome.figma, feedQuery]);

  /** Tab bar is a floating pill — extra scroll inset so last cards clear it */
  const listBottomPad =
    tabBarHeight + Math.max(insets.bottom, 8) + (compact ? 16 : 20) + 32;

  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View
            style={[
              styles.homeOrb,
              {
                backgroundColor: chrome.figmaHome.accentOrb,
                width: chrome.figmaHome.accentOrbSize,
                height: chrome.figmaHome.accentOrbSize,
                borderRadius: chrome.figmaHome.accentOrbSize / 2,
                top: chrome.figmaHome.accentOrbTop,
                left: chrome.figmaHome.accentOrbLeft
              }
            ]}
          />
        </View>
      <StatusBar style={chrome.mode === "light" ? "dark" : "light"} />
      <HomeFeedHeader
        displayName={
          profileQuery.data?.display_name?.trim() ||
          sessionUser?.email?.split("@")[0] ||
          "You"
        }
        username={sessionUser?.username || "you"}
        avatarUrl={profileQuery.data?.avatar_url}
        onPressProfile={openAccountTab}
        onPressMessages={openMessagesTab}
        onPressActivity={openNotifications}
        onPressSearch={openSearch}
      />
      <FlatList
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingHorizontal: chrome.figmaHome.pagePadH,
            gap: chrome.figmaHome.feedListGap
          },
          compact && styles.listContentCompact,
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
    backgroundColor: "transparent",
    overflow: "hidden"
  },
  homeOrb: {
    position: "absolute"
  },
  rootMarketplace: {
    backgroundColor: "transparent"
  },
  list: {
    flex: 1
  },
  listMarketplace: {
    backgroundColor: "transparent"
  },
  listContent: {
    paddingBottom: 24
  },
  listContentCompact: {
    paddingHorizontal: 16,
    paddingBottom: 18,
    gap: 12
  },
  listContentMarketplace: {
    paddingTop: 8
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
    borderRadius: radii.feedCard,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
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
    fontSize: 13,
    fontWeight: "700"
  },
  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  reminderDismiss: {
    fontSize: 12,
    fontWeight: "600"
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
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
    alignSelf: "stretch"
  },
  buttonText: {
    fontWeight: "600"
  },
  feedTabBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 4,
    marginBottom: 4,
    paddingHorizontal: 2
  },
  feedTabBarCompact: {
    marginTop: 2,
    marginBottom: 2
  },
  feedTabHit: {
    flex: 1,
    alignItems: "center",
    paddingBottom: 6
  },
  feedTabLabel: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: -0.15
  },
  feedTabRule: {
    marginTop: 6,
    height: 3,
    width: "72%",
    borderRadius: 2,
    backgroundColor: "transparent"
  }
});
