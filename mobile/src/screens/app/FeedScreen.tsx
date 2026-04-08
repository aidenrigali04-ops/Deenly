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
import { BottomTabScreenProps, useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CompositeScreenProps } from "@react-navigation/native";
import { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import { apiRequest } from "../../lib/api";
import { ackPrayerReminder, fetchPrayerStatus } from "../../lib/prayer";
import { followUser, unfollowUser } from "../../lib/follows";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { isImageMedia, PostCard } from "../../components/PostCard";
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
        .filter((v) => v.isViewable && v.item != null && typeof (v.item as FeedItem).id === "number")
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

      let next: number | null = null;
      for (const v of ordered) {
        const row = v.item as FeedItem;
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
            <Text style={[styles.marketHeroTitle, compact && styles.marketHeroTitleCompact]}>Market</Text>
            <Text style={[styles.marketHeroSubtitle, compact && styles.marketHeroSubtitleCompact]}>
              Creator offers and businesses you can buy from or visit.
            </Text>
            <View style={styles.marketplaceFilterStack}>
              <View style={styles.marketplaceTopRow}>
                <Text style={[styles.marketplaceHint, compact && styles.marketplaceHintCompact]}>
                  Filter listings and open businesses near you.
                </Text>
                <Pressable
                  style={[styles.nearMePill, compact && styles.nearMePillCompact]}
                  onPress={() => navigation.navigate("BusinessesNearMe")}
                >
                  <Text style={styles.nearMePillText}>Near me</Text>
                </Pressable>
              </View>
              <View style={styles.marketplaceActionsRow}>
                <Pressable
                  style={[styles.chip, compact && styles.chipCompact, followingOnly ? styles.chipActive : null]}
                  onPress={() => setFollowingOnly((value) => !value)}
                >
                  <Text style={[styles.chipText, compact && styles.chipTextCompact, followingOnly ? styles.chipTextActive : null]}>
                    {followingOnly ? "Following only" : "All posts"}
                  </Text>
                </Pressable>
                {canCreateProducts ? (
                  <Pressable style={styles.marketCta} onPress={() => navigation.navigate("CreatorEconomy")}>
                    <Text style={styles.marketCtaText}>Creator hub</Text>
                  </Pressable>
                ) : null}
              </View>
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
    items.length,
    navigation,
    visibleReminder,
    compact,
    canCreateProducts
  ]);

  const renderItem: ListRenderItem<FeedItem> = useCallback(
    ({ item }) => {
      const isVideoPost = Boolean(item.media_url) && !isImageMedia(item);
      const mediaPlaybackActive = !isVideoPost || item.id === activeVideoPostId;
      return (
        <View style={[styles.cardWrap, compact && styles.cardWrapCompact]}>
          <PostCard
            item={item}
            layout="home"
            mediaPlaybackActive={mediaPlaybackActive}
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
      );
    },
    [
      activeVideoPostId,
      buyHandoffProductId,
      buyProductMutation,
      followMutation,
      likeMutation,
      navigation,
      compact
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
  marketHeroTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.4
  },
  marketHeroTitleCompact: {
    fontSize: 20
  },
  marketHeroSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    fontWeight: "500"
  },
  marketHeroSubtitleCompact: {
    fontSize: 12,
    lineHeight: 17
  },
  marketplaceFilterStack: {
    width: "100%",
    gap: 10
  },
  marketplaceActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center"
  },
  marketCta: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.surface
  },
  marketCtaText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "700"
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
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.control
  },
  marketEmptyBtnText: {
    color: colors.onAccent,
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
