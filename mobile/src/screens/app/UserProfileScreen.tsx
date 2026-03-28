import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { apiRequest } from "../../lib/api";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { colors, radii } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { useSessionStore } from "../../store/session-store";
import type { FeedItem } from "../../types";
import { followUser, unfollowUser } from "../../lib/follows";
import { resolveMediaUrl } from "../../lib/media-url";
import {
  createSupportCheckout,
  createTierCheckout,
  fetchCreatorTiers,
  fetchSubscriptionAccess,
  formatMinorCurrency
} from "../../lib/monetization";

type UserProfile = {
  user_id: number;
  username?: string;
  display_name: string;
  bio: string | null;
  avatar_url?: string | null;
  posts_count: number;
  followers_count: number;
  following_count: number;
  likes_received_count: number;
  likes_given_count: number;
  is_following: boolean;
};

type Props = NativeStackScreenProps<RootStackParamList, "UserProfile">;

export function UserProfileScreen({ route, navigation }: Props) {
  const { width } = useWindowDimensions();
  const userId = route.params.id;
  const sessionUser = useSessionStore((s) => s.user);
  const [activeTab, setActiveTab] = useState<"posts" | "media">("posts");
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["mobile-user-profile", userId],
    queryFn: () => apiRequest<UserProfile>(`/users/${userId}`, { auth: true })
  });
  const followMutation = useMutation({
    mutationFn: () => followUser(userId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["mobile-user-profile", userId] });
      const previous = queryClient.getQueryData<UserProfile>(["mobile-user-profile", userId]);
      if (previous) {
        queryClient.setQueryData<UserProfile>(["mobile-user-profile", userId], {
          ...previous,
          is_following: true,
          followers_count: previous.followers_count + (previous.is_following ? 0 : 1)
        });
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["mobile-user-profile", userId], context.previous);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile-user-profile", userId] }),
        queryClient.invalidateQueries({ queryKey: ["mobile-account-profile"] })
      ]);
    }
  });
  const unfollowMutation = useMutation({
    mutationFn: () => unfollowUser(userId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["mobile-user-profile", userId] });
      const previous = queryClient.getQueryData<UserProfile>(["mobile-user-profile", userId]);
      if (previous) {
        queryClient.setQueryData<UserProfile>(["mobile-user-profile", userId], {
          ...previous,
          is_following: false,
          followers_count: Math.max(0, previous.followers_count - (previous.is_following ? 1 : 0))
        });
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["mobile-user-profile", userId], context.previous);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile-user-profile", userId] }),
        queryClient.invalidateQueries({ queryKey: ["mobile-account-profile"] })
      ]);
    }
  });
  const postsQuery = useQuery({
    queryKey: ["mobile-user-posts", userId],
    queryFn: () =>
      apiRequest<{ items: FeedItem[] }>(`/feed?authorId=${userId}&limit=40`, { auth: true })
  });
  const tiersQuery = useQuery({
    queryKey: ["mobile-user-tiers", userId],
    queryFn: () => fetchCreatorTiers(userId)
  });
  const subscriptionAccessQuery = useQuery({
    queryKey: ["mobile-subscription-access", userId],
    queryFn: () => fetchSubscriptionAccess(userId)
  });
  const likeMutation = useMutation({
    mutationFn: (postId: number) =>
      apiRequest("/interactions", {
        method: "POST",
        auth: true,
        body: {
          postId,
          interactionType: "benefited"
        }
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile-user-posts", userId] }),
        queryClient.invalidateQueries({ queryKey: ["mobile-user-profile", userId] })
      ]);
    }
  });
  const supportMutation = useMutation({
    mutationFn: () => createSupportCheckout(userId, 500),
    onSuccess: async (result) => {
      if (result?.checkoutUrl) {
        await Linking.openURL(result.checkoutUrl);
      }
    }
  });
  const tierMutation = useMutation({
    mutationFn: (tierId: number) => createTierCheckout(tierId),
    onSuccess: async (result) => {
      if (result?.checkoutUrl) {
        await Linking.openURL(result.checkoutUrl);
      }
    }
  });

  if (profileQuery.isLoading) return <LoadingState label="Loading user profile..." />;
  if (profileQuery.error) return <ErrorState message={(profileQuery.error as Error).message} />;
  if (!profileQuery.data) return <EmptyState title="User not found" />;

  const user = profileQuery.data;
  const avatarUri = resolveMediaUrl(user.avatar_url);
  const items = postsQuery.data?.items || [];
  const visibleItems = activeTab === "media" ? items.filter((item) => Boolean(item.media_url)) : items;
  const tileSize = Math.floor((width - 32 - 8) / 3);
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        {avatarUri ? <Image source={{ uri: avatarUri }} style={styles.avatar} resizeMode="cover" /> : null}
        <Text style={styles.title}>{user.display_name}</Text>
        <Text style={styles.muted}>@{user.username || "unknown"}</Text>
        <Text style={styles.text}>{user.bio || "No bio yet."}</Text>
        <View style={styles.row}>
          <Text style={styles.muted}>Posts: {user.posts_count}</Text>
          <Text style={styles.muted}>Followers: {user.followers_count}</Text>
          <Text style={styles.muted}>Following: {user.following_count}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.muted}>Likes received: {user.likes_received_count}</Text>
          <Text style={styles.muted}>Likes by user: {user.likes_given_count}</Text>
        </View>
        <View style={styles.row}>
          <Pressable
            style={styles.buttonSecondary}
            onPress={() => (user.is_following ? unfollowMutation.mutate() : followMutation.mutate())}
          >
            <Text style={styles.buttonText}>
              {followMutation.isPending || unfollowMutation.isPending
                ? "Updating..."
                : user.is_following
                  ? "Unfollow"
                  : "Follow"}
            </Text>
          </Pressable>
          {sessionUser && sessionUser.id !== userId ? (
            <Pressable
              style={styles.buttonSecondary}
              onPress={() =>
                navigation.navigate("AppTabs", {
                  screen: "MessagesTab",
                  params: { openUserId: userId }
                })
              }
            >
              <Text style={styles.buttonText}>Message</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.buttonSecondary} onPress={() => supportMutation.mutate()}>
            <Text style={styles.buttonText}>
              {supportMutation.isPending ? "Opening..." : "Support $5"}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.muted}>
          Membership: {subscriptionAccessQuery.data?.subscribed ? "Active" : "Not subscribed"}
        </Text>
      </View>
      {(tiersQuery.data?.items || []).length ? (
        <View style={styles.card}>
          <Text style={styles.title}>Membership Tiers</Text>
          {tiersQuery.data?.items.map((tier) => (
            <View key={tier.id} style={styles.row}>
              <Text style={styles.muted}>
                {tier.title} - {formatMinorCurrency(tier.monthly_price_minor, tier.currency)}/mo
              </Text>
              <Pressable
                style={styles.buttonSecondary}
                onPress={() => tierMutation.mutate(tier.id)}
                disabled={tierMutation.isPending}
              >
                <Text style={styles.buttonText}>{tierMutation.isPending ? "Opening..." : "Subscribe"}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.row}>
        <Pressable
          style={[styles.buttonSecondary, activeTab === "posts" ? styles.buttonActive : null]}
          onPress={() => setActiveTab("posts")}
        >
          <Text style={[styles.buttonText, activeTab === "posts" ? styles.buttonTextActive : null]}>Posts</Text>
        </Pressable>
        <Pressable
          style={[styles.buttonSecondary, activeTab === "media" ? styles.buttonActive : null]}
          onPress={() => setActiveTab("media")}
        >
          <Text style={[styles.buttonText, activeTab === "media" ? styles.buttonTextActive : null]}>Media</Text>
        </Pressable>
      </View>
      {postsQuery.isLoading ? <LoadingState label="Loading posts..." /> : null}
      {postsQuery.error ? <ErrorState message={(postsQuery.error as Error).message} /> : null}
      {!postsQuery.isLoading && !postsQuery.error && visibleItems.length === 0 ? (
        <EmptyState title={activeTab === "posts" ? "No posts yet" : "No media yet"} />
      ) : null}
      <View style={styles.grid}>
        {visibleItems.map((item) => {
          const mediaUrl = resolveMediaUrl(item.media_url);
          const isImage = Boolean(item.media_mime_type?.startsWith("image/"));
          const isVideo = Boolean(item.media_mime_type?.startsWith("video/"));
          const fallbackLabel = item.content?.trim().slice(0, 20) || "Post";
          return (
            <View key={item.id} style={[styles.tile, { width: tileSize, height: tileSize }]}>
              <Pressable
                style={styles.tileOpen}
                onPress={() => navigation.navigate("PostDetail", { id: item.id })}
              >
                {mediaUrl && isImage ? (
                  <Image source={{ uri: mediaUrl }} style={styles.tileImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.tileFallback, isVideo ? styles.tileFallbackVideo : null]}>
                    <Text style={styles.tileFallbackText}>{isVideo ? "Video" : fallbackLabel}</Text>
                  </View>
                )}
                {isVideo ? (
                  <View style={styles.tileBadge}>
                    <Text style={styles.tileBadgeText}>Video</Text>
                  </View>
                ) : null}
              </Pressable>
              <Pressable
                style={styles.tileLike}
                onPress={() => likeMutation.mutate(item.id)}
                disabled={likeMutation.isPending}
              >
                <Text style={styles.tileLikeText}>{likeMutation.isPending ? "..." : "Like"}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 14 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.panel,
    padding: 16,
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: colors.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 16
      },
      android: { elevation: 2 }
    })
  },
  title: { color: colors.text, fontSize: 22, fontWeight: "700" },
  avatar: { width: 64, height: 64, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  muted: { color: colors.muted },
  text: { color: colors.text },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4
  },
  tile: {
    position: "relative",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: "hidden",
    borderRadius: radii.control
  },
  tileOpen: {
    flex: 1
  },
  tileImage: {
    height: "100%",
    width: "100%"
  },
  tileFallback: {
    height: "100%",
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    paddingHorizontal: 6
  },
  tileFallbackVideo: {
    backgroundColor: "#1f2937"
  },
  tileFallbackText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center"
  },
  tileBadge: {
    position: "absolute",
    right: 6,
    top: 6,
    borderRadius: radii.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.12)",
    backgroundColor: "rgba(255,255,255,0.88)"
  },
  tileBadgeText: {
    color: colors.text,
    fontSize: 9,
    fontWeight: "700"
  },
  tileLike: {
    position: "absolute",
    left: 6,
    top: 6,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.12)",
    backgroundColor: "rgba(255,255,255,0.88)"
  },
  tileLikeText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: "700"
  },
  buttonSecondary: {
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface
  },
  buttonActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  buttonText: { color: colors.text, fontWeight: "600" },
  buttonTextActive: { color: colors.onAccent }
});
