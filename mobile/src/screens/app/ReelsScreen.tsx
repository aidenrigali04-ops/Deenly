import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  ListRenderItem,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppVideoView } from "../../components/AppVideoView";
import { apiRequest } from "../../lib/api";
import { followUser, unfollowUser } from "../../lib/follows";
import { resolveMediaUrl } from "../../lib/media-url";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { radii, resolveFigmaMobile, spacing } from "../../theme";
import { useAppChrome } from "../../lib/use-app-chrome";
import type { FeedItem } from "../../types";
import type { AppTabParamList, RootStackParamList } from "../../navigation/AppNavigator";
import { usePoints, useReelWatchPoints } from "../../features/points";

type FeedResponse = {
  items: FeedItem[];
  nextCursor: string | null;
  hasMore?: boolean;
};

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "ReelsTab">,
  NativeStackScreenProps<RootStackParamList>
>;

const ICON = 22;
const RAIL_ICON = 26;
const SCRIM_HEIGHT_RATIO = 0.42;

function buildReelsStyles(fig: ReturnType<typeof resolveFigmaMobile>) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: fig.canvas
    },
    list: {
      flex: 1
    },
    topBar: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: spacing.pagePaddingH,
      gap: spacing.tight
    },
    iconWell: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: fig.glassSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: fig.glassBorderSoft,
      alignItems: "center",
      justifyContent: "center"
    },
    iconWellPressed: {
      opacity: 0.85
    },
    slide: {
      width: "100%",
      backgroundColor: fig.canvas
    },
    noVideo: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: fig.mediaSurface
    },
    noVideoText: {
      color: fig.textMuted,
      fontSize: 14
    },
    bottomScrim: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0
    },
    overlay: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: spacing.pagePaddingH,
      paddingTop: 40,
      backgroundColor: "transparent"
    },
    overlayRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: spacing.tight
    },
    captionBlock: {
      flex: 1,
      minWidth: 0
    },
    author: {
      color: fig.text,
      fontWeight: "700",
      fontSize: 15,
      textShadowColor: fig.gradientTop,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3
    },
    caption: {
      marginTop: 6,
      color: fig.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      textShadowColor: fig.gradientTop,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3
    },
    actions: {
      gap: 10
    },
    railBtn: {
      width: 48,
      height: 48,
      borderRadius: radii.pill,
      backgroundColor: fig.glassSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: fig.glassBorderSoft,
      alignItems: "center",
      justifyContent: "center"
    },
    railBtnPressed: {
      opacity: 0.88
    },
    emptyWrap: {
      flex: 1,
      padding: spacing.breathing,
      justifyContent: "center"
    }
  });
}

function ReelRow({
  item,
  active,
  height,
  bottomPad,
  onLike,
  onComment,
  onFollow,
  likeBusy,
  commentBusy,
  followBusy,
  muted,
  onToggleMute,
  onDoubleTapLike,
  rx,
  fm
}: {
  item: FeedItem;
  active: boolean;
  height: number;
  bottomPad: number;
  onLike: () => void;
  onComment: () => void;
  onFollow: () => void;
  likeBusy: boolean;
  commentBusy: boolean;
  followBusy: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onDoubleTapLike?: () => void;
  rx: ReturnType<typeof buildReelsStyles>;
  fm: ReturnType<typeof resolveFigmaMobile>;
}) {
  const uri = resolveMediaUrl(item.media_url) || undefined;
  const following = Boolean(item.is_following_author);
  const liked = Boolean(item.liked_by_viewer);
  const scrimH = Math.max(160, height * SCRIM_HEIGHT_RATIO);
  const lastTapTsRef = useRef(0);

  const handleSurfaceTap = useCallback(() => {
    if (!onDoubleTapLike) {
      return;
    }
    const now = Date.now();
    if (now - lastTapTsRef.current <= 280) {
      onDoubleTapLike?.();
      lastTapTsRef.current = 0;
      return;
    }
    lastTapTsRef.current = now;
  }, [onDoubleTapLike]);

  return (
    <View style={[rx.slide, { height }]}>
      <Pressable
        onPress={handleSurfaceTap}
        style={StyleSheet.absoluteFillObject}
        accessibilityRole="button"
        accessibilityLabel="Reel media"
      >
        {uri ? (
          <AppVideoView
            uri={uri}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            loop
            play={active}
            muted={muted}
          />
        ) : (
          <View style={rx.noVideo}>
            <Text style={rx.noVideoText}>No video</Text>
          </View>
        )}
      </Pressable>
      <LinearGradient
        pointerEvents="none"
        colors={["transparent", fm.gradientBottom]}
        locations={[0.15, 1]}
        style={[rx.bottomScrim, { height: scrimH }]}
      />
      <View style={[rx.overlay, { paddingBottom: bottomPad + spacing.tight }]} pointerEvents="box-none">
        <View style={rx.overlayRow}>
          <View style={rx.captionBlock}>
            <Text style={rx.author} numberOfLines={1}>
              {item.author_display_name}
            </Text>
            <Text style={rx.caption} numberOfLines={4}>
              {item.content}
            </Text>
          </View>
          <View style={rx.actions} accessibilityRole="toolbar">
            <Pressable
              style={({ pressed }) => [rx.railBtn, pressed && rx.railBtnPressed]}
              onPress={onLike}
              disabled={likeBusy}
              accessibilityRole="button"
              accessibilityLabel={liked ? "Unlike" : "Like"}
            >
              <Ionicons
                name={liked ? "heart" : "heart-outline"}
                size={RAIL_ICON}
                color={liked ? fm.accentGold : fm.text}
              />
            </Pressable>
            <Pressable
              style={({ pressed }) => [rx.railBtn, pressed && rx.railBtnPressed]}
              onPress={onComment}
              disabled={commentBusy}
              accessibilityRole="button"
              accessibilityLabel="Comment"
            >
              <Ionicons
                name="chatbubble-outline"
                size={RAIL_ICON}
                color={fm.text}
              />
            </Pressable>
            <Pressable
              style={({ pressed }) => [rx.railBtn, pressed && rx.railBtnPressed]}
              onPress={onFollow}
              disabled={followBusy}
              accessibilityRole="button"
              accessibilityLabel={following ? "Unfollow author" : "Follow author"}
            >
              <Ionicons
                name={following ? "checkmark-circle" : "person-add-outline"}
                size={RAIL_ICON}
                color={fm.text}
              />
            </Pressable>
            <Pressable
              style={({ pressed }) => [rx.railBtn, pressed && rx.railBtnPressed]}
              onPress={onToggleMute}
              accessibilityRole="button"
              accessibilityLabel={muted ? "Unmute" : "Mute"}
            >
              <Ionicons
                name={muted ? "volume-mute" : "volume-medium"}
                size={RAIL_ICON}
                color={fm.text}
              />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

export function ReelsScreen({ navigation }: Props) {
  const { figma: fm } = useAppChrome();
  const rx = useMemo(() => buildReelsStyles(fm), [fm]);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const queryClient = useQueryClient();
  const points = usePoints();
  const { onWatchProgress, onReelBecameInactive } = useReelWatchPoints();
  const feedQueryKey = ["mobile-feed-reels"] as const;
  const activeReelIdRef = useRef<number | null>(null);
  const watchTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const feedQuery = useInfiniteQuery({
    queryKey: feedQueryKey,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams();
      query.set("limit", "8");
      query.set("feedTab", "reels");
      if (pageParam) {
        query.set("cursor", String(pageParam));
      }
      return apiRequest<FeedResponse>(`/feed?${query.toString()}`, { auth: true });
    },
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined
  });

  const items = feedQuery.data?.pages.flatMap((p) => p.items) ?? [];

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
      void queryClient.invalidateQueries({ queryKey: feedQueryKey });
    },
    onSuccess: (_result, vars) => {
      if (vars.nextLiked) {
        void points.award("like", { surface: "reels", postId: vars.postId });
      }
    }
  });

  const commentMutation = useMutation({
    mutationFn: ({ postId }: { postId: number }) =>
      apiRequest("/interactions", {
        method: "POST",
        auth: true,
        body: { postId, interactionType: "comment", commentText: "Nice reel!" }
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: feedQueryKey });
    },
    onSuccess: (_result, vars) => {
      void points.award("comment", {
        surface: "reels",
        postId: vars.postId,
        commentText: "Nice reel!"
      });
    }
  });

  const followMutation = useMutation({
    mutationFn: ({ authorId, nextFollowing }: { authorId: number; nextFollowing: boolean }) =>
      nextFollowing ? followUser(authorId) : unfollowUser(authorId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: feedQueryKey });
    }
  });

  const onViewableItemsChanged = useCallback((info: { viewableItems: { index: number | null }[] }) => {
    const first = info.viewableItems[0];
    if (first && first.index != null) {
      setActiveIndex(first.index);
    }
  }, []);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 75 }).current;

  useEffect(() => {
    const active = items[activeIndex];
    if (!active) {
      if (watchTickRef.current) {
        clearInterval(watchTickRef.current);
        watchTickRef.current = null;
      }
      if (activeReelIdRef.current != null) {
        onReelBecameInactive(activeReelIdRef.current);
        activeReelIdRef.current = null;
      }
      return;
    }

    const prev = activeReelIdRef.current;
    if (prev != null && prev !== active.id) {
      onReelBecameInactive(prev);
    }
    activeReelIdRef.current = active.id;

    if (watchTickRef.current) {
      clearInterval(watchTickRef.current);
    }
    watchTickRef.current = setInterval(() => {
      onWatchProgress(active.id, 1000);
    }, 1000);

    return () => {
      if (watchTickRef.current) {
        clearInterval(watchTickRef.current);
        watchTickRef.current = null;
      }
    };
  }, [activeIndex, items, onReelBecameInactive, onWatchProgress]);

  const onEndReached = useCallback(() => {
    if (feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) {
      void feedQuery.fetchNextPage();
    }
  }, [feedQuery]);

  const renderItem: ListRenderItem<FeedItem> = useCallback(
    ({ item, index }) => (
      <ReelRow
        item={item}
        active={index === activeIndex}
        height={height}
        bottomPad={insets.bottom}
        muted={muted}
        onToggleMute={() => setMuted((m) => !m)}
        onLike={() => likeMutation.mutate({ postId: item.id, nextLiked: !item.liked_by_viewer })}
        onDoubleTapLike={() => {
          if (!item.liked_by_viewer) {
            likeMutation.mutate({ postId: item.id, nextLiked: true });
          }
        }}
        onComment={() => commentMutation.mutate({ postId: item.id })}
        onFollow={() =>
          followMutation.mutate({
            authorId: item.author_id,
            nextFollowing: !item.is_following_author
          })
        }
        likeBusy={likeMutation.isPending}
        commentBusy={commentMutation.isPending}
        followBusy={followMutation.isPending}
        rx={rx}
        fm={fm}
      />
    ),
    [activeIndex, height, insets.bottom, muted, likeMutation, commentMutation, followMutation, rx, fm]
  );

  useEffect(() => {
    return () => {
      if (watchTickRef.current) {
        clearInterval(watchTickRef.current);
        watchTickRef.current = null;
      }
      if (activeReelIdRef.current != null) {
        onReelBecameInactive(activeReelIdRef.current);
        activeReelIdRef.current = null;
      }
    };
  }, [onReelBecameInactive]);

  return (
    <View style={rx.root}>
      <View style={[rx.topBar, { paddingTop: insets.top + 4 }]}>
        <Pressable
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate("HomeTab");
            }
          }}
          style={({ pressed }) => [rx.iconWell, pressed && rx.iconWellPressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={ICON + 2} color={fm.text} />
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate("CreateFlow", { screen: "CreateHub" } as const)}
          style={({ pressed }) => [rx.iconWell, pressed && rx.iconWellPressed]}
          accessibilityRole="button"
          accessibilityLabel="New reel"
        >
          <Ionicons name="add-circle-outline" size={ICON} color={fm.text} />
        </Pressable>
      </View>

      {feedQuery.isLoading ? <LoadingState label="Loading reels..." surface="dark" /> : null}
      {feedQuery.error ? (
        <ErrorState
          message={(feedQuery.error as Error).message}
          onRetry={() => feedQuery.refetch()}
          surface="dark"
        />
      ) : null}

      {!feedQuery.isLoading && !feedQuery.error && items.length === 0 ? (
        <View style={rx.emptyWrap}>
          <EmptyState
            title="No reels yet"
            subtitle="Create a reel from the Upload + tab (choose Reel)."
            surface="dark"
          />
        </View>
      ) : null}

      {!feedQuery.isLoading && !feedQuery.error && items.length > 0 ? (
        <FlatList
          style={rx.list}
          data={items}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderItem}
          pagingEnabled
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          snapToInterval={height}
          snapToAlignment="start"
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          getItemLayout={(_, index) => ({
            length: height,
            offset: height * index,
            index
          })}
        />
      ) : null}
    </View>
  );
}

