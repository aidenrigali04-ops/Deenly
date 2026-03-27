import { useCallback, useRef, useState } from "react";
import {
  FlatList,
  ListRenderItem,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Video, ResizeMode } from "expo-av";
import { apiRequest } from "../../lib/api";
import { followUser, unfollowUser } from "../../lib/follows";
import { resolveMediaUrl } from "../../lib/media-url";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import type { FeedItem } from "../../types";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type FeedResponse = {
  items: FeedItem[];
  nextCursor: string | null;
  hasMore?: boolean;
};

type Props = NativeStackScreenProps<RootStackParamList, "Reels">;

function ReelRow({
  item,
  active,
  height,
  bottomPad,
  onLike,
  onFollow,
  likeBusy,
  followBusy,
  muted,
  onToggleMute
}: {
  item: FeedItem;
  active: boolean;
  height: number;
  bottomPad: number;
  onLike: () => void;
  onFollow: () => void;
  likeBusy: boolean;
  followBusy: boolean;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const uri = resolveMediaUrl(item.media_url) || undefined;
  const following = Boolean(item.is_following_author);
  const liked = Boolean(item.liked_by_viewer);

  return (
    <View style={[styles.slide, { height }]}>
      {uri ? (
        <Video
          style={StyleSheet.absoluteFillObject}
          source={{ uri }}
          resizeMode={ResizeMode.CONTAIN}
          isLooping
          shouldPlay={active}
          isMuted={muted}
          useNativeControls={false}
        />
      ) : (
        <View style={styles.noVideo}>
          <Text style={styles.noVideoText}>No video</Text>
        </View>
      )}
      <View style={[styles.overlay, { paddingBottom: bottomPad + 16 }]}>
        <View style={styles.overlayRow}>
          <View style={styles.captionBlock}>
            <Text style={styles.author} numberOfLines={1}>
              {item.author_display_name}
            </Text>
            <Text style={styles.caption} numberOfLines={4}>
              {item.content}
            </Text>
          </View>
          <View style={styles.actions}>
            <Pressable
              style={styles.actionBtn}
              onPress={onLike}
              disabled={likeBusy}
            >
              <Text style={styles.actionBtnText}>{liked ? "Liked" : "Like"}</Text>
            </Pressable>
            <Pressable
              style={styles.actionBtn}
              onPress={onFollow}
              disabled={followBusy}
            >
              <Text style={styles.actionBtnText}>{following ? "Following" : "Follow"}</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={onToggleMute}>
              <Text style={styles.actionBtnText}>{muted ? "Unmute" : "Mute"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

export function ReelsScreen({ navigation }: Props) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const queryClient = useQueryClient();
  const feedQueryKey = ["mobile-feed-reels"] as const;

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
        onFollow={() =>
          followMutation.mutate({
            authorId: item.author_id,
            nextFollowing: !item.is_following_author
          })
        }
        likeBusy={likeMutation.isPending}
        followBusy={followMutation.isPending}
      />
    ),
    [activeIndex, height, insets.bottom, muted, likeMutation, followMutation]
  );

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.topBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.topBtnText}>Back</Text>
        </Pressable>
        <Pressable style={styles.topBtn} onPress={() => navigation.navigate("AppTabs", { screen: "CreateTab" })}>
          <Text style={styles.topBtnText}>New reel</Text>
        </Pressable>
      </View>

      {feedQuery.isLoading ? <LoadingState label="Loading reels..." /> : null}
      {feedQuery.error ? (
        <ErrorState
          message={(feedQuery.error as Error).message}
          onRetry={() => feedQuery.refetch()}
        />
      ) : null}

      {!feedQuery.isLoading && !feedQuery.error && items.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState title="No reels yet" subtitle="Create a reel from the Upload + tab (choose Reel)." />
        </View>
      ) : null}

      {!feedQuery.isLoading && !feedQuery.error && items.length > 0 ? (
        <FlatList
          style={styles.list}
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000"
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
    paddingHorizontal: 12,
    gap: 8
  },
  topBtn: {
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999
  },
  topBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600"
  },
  slide: {
    width: "100%",
    backgroundColor: "#000"
  },
  noVideo: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  noVideoText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14
  },
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 48,
    backgroundColor: "transparent"
  },
  overlayRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12
  },
  captionBlock: {
    flex: 1,
    minWidth: 0
  },
  author: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2
  },
  caption: {
    marginTop: 6,
    color: "rgba(255,255,255,0.92)",
    fontSize: 13,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2
  },
  actions: {
    gap: 8
  },
  actionBtn: {
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999
  },
  actionBtnText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600"
  },
  emptyWrap: {
    flex: 1,
    padding: 24,
    justifyContent: "center"
  }
});
