import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { apiRequest } from "../../lib/api";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { colors, radii, resolveFigmaMobile } from "../../theme";
import { useAppChrome } from "../../lib/use-app-chrome";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { useSessionStore } from "../../store/session-store";
import type { FeedItem } from "../../types";
import { followUser, unfollowUser } from "../../lib/follows";
import { resolveMediaUrl } from "../../lib/media-url";
import {
  createSupportCheckout,
  createTierCheckout,
  fetchCreatorProducts,
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
  const { figma, mode } = useAppChrome();
  const styles = useMemo(() => buildUserProfileStyles(figma), [figma]);
  const statusBarStyle = mode === "light" ? "dark" : "light";
  const [activeTab, setActiveTab] = useState<"posts" | "products">("posts");
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
  const creatorProductsQuery = useQuery({
    queryKey: ["mobile-creator-catalog", userId],
    queryFn: () => fetchCreatorProducts(userId)
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

  if (profileQuery.isLoading) {
    return (
      <View style={styles.screenRoot}>
        <StatusBar style={statusBarStyle} />
        <LoadingState label="Loading user profile..." surface="dark" />
      </View>
    );
  }
  if (profileQuery.error) {
    return (
      <View style={styles.screenRoot}>
        <StatusBar style={statusBarStyle} />
        <ErrorState message={(profileQuery.error as Error).message} surface="dark" />
      </View>
    );
  }
  if (!profileQuery.data) {
    return (
      <View style={styles.screenRoot}>
        <StatusBar style={statusBarStyle} />
        <EmptyState title="User not found" surface="dark" />
      </View>
    );
  }

  const user = profileQuery.data;
  const avatarUri = resolveMediaUrl(user.avatar_url);
  const items = postsQuery.data?.items || [];
  const catalogProducts = creatorProductsQuery.data?.items || [];
  const tileSize = Math.floor((width - 32 - 8) / 3);
  return (
    <>
      <StatusBar style={statusBarStyle} />
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
            style={user.is_following ? styles.buttonSecondary : styles.buttonFollow}
            onPress={() => (user.is_following ? unfollowMutation.mutate() : followMutation.mutate())}
          >
            <Text style={user.is_following ? styles.buttonText : styles.buttonFollowText}>
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
          <Pressable style={styles.buttonSupport} onPress={() => supportMutation.mutate()}>
            <Text style={styles.buttonSupportText}>
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
                style={styles.buttonSubscribe}
                onPress={() => tierMutation.mutate(tier.id)}
                disabled={tierMutation.isPending}
              >
                <Text style={styles.buttonSubscribeText}>
                  {tierMutation.isPending ? "Opening..." : "Subscribe"}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tabItem, activeTab === "posts" ? styles.tabItemActive : null]}
          onPress={() => setActiveTab("posts")}
        >
          <Text style={[styles.tabLabel, activeTab === "posts" ? styles.tabLabelActive : null]}>Posts</Text>
        </Pressable>
        <Pressable
          style={[styles.tabItem, activeTab === "products" ? styles.tabItemActive : null]}
          onPress={() => setActiveTab("products")}
        >
          <Text style={[styles.tabLabel, activeTab === "products" ? styles.tabLabelActive : null]}>Products</Text>
        </Pressable>
      </View>
      {activeTab === "posts" ? (
        <>
          {postsQuery.isLoading ? <LoadingState label="Loading posts..." surface="dark" /> : null}
          {postsQuery.error ? (
            <ErrorState message={(postsQuery.error as Error).message} surface="dark" />
          ) : null}
          {!postsQuery.isLoading && !postsQuery.error && items.length === 0 ? (
            <EmptyState title="No posts yet" surface="dark" />
          ) : null}
          <View style={styles.grid}>
            {items.map((item) => {
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
                    style={({ pressed }) => [styles.tileLike, pressed && styles.tileLikePressed]}
                    onPress={() => likeMutation.mutate(item.id)}
                    disabled={likeMutation.isPending}
                  >
                    <Text style={styles.tileLikeText}>{likeMutation.isPending ? "..." : "Like"}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </>
      ) : (
        <>
          {creatorProductsQuery.isLoading ? (
            <LoadingState label="Loading products..." surface="dark" />
          ) : null}
          {creatorProductsQuery.error ? (
            <ErrorState message={(creatorProductsQuery.error as Error).message} surface="dark" />
          ) : null}
          {!creatorProductsQuery.isLoading &&
          !creatorProductsQuery.error &&
          catalogProducts.length === 0 ? (
            <EmptyState title="No products listed" surface="dark" />
          ) : null}
          <View style={styles.grid}>
            {catalogProducts.map((prod) => (
              <Pressable
                key={prod.id}
                style={[styles.productTile, { width: tileSize, minHeight: tileSize }]}
                onPress={() => navigation.navigate("ProductDetail", { productId: prod.id })}
              >
                <Text style={styles.productTileTitle} numberOfLines={3}>
                  {prod.title}
                </Text>
                <Text style={styles.productTilePrice}>
                  {formatMinorCurrency(Number(prod.price_minor || 0), prod.currency || "usd")}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      </ScrollView>
    </>
  );
}

function buildUserProfileStyles(fig: ReturnType<typeof resolveFigmaMobile>) {
  return StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: fig.canvas,
    padding: 16,
    justifyContent: "center"
  },
  container: { flex: 1, backgroundColor: fig.canvas },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  card: {
    backgroundColor: fig.card,
    borderColor: fig.glassBorder,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.feedCard,
    padding: 16,
    gap: 8
  },
  title: { color: fig.text, fontSize: 22, fontWeight: "700", letterSpacing: -0.3 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: fig.glassBorder
  },
  muted: { color: fig.textMuted, fontSize: 14 },
  text: { color: fig.text, fontSize: 15, lineHeight: 22 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" },
  tabBar: {
    flexDirection: "row",
    marginTop: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: fig.glassBorder
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: "transparent"
  },
  tabItemActive: {
    borderBottomColor: fig.accentGold
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: fig.textMuted
  },
  tabLabelActive: {
    color: fig.accentGold,
    fontWeight: "600"
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 1,
    backgroundColor: fig.glassBorder
  },
  tile: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: fig.card
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
    backgroundColor: fig.card,
    paddingHorizontal: 6
  },
  tileFallbackVideo: {
    backgroundColor: "#1f2937"
  },
  tileFallbackText: {
    color: fig.textMuted,
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
    borderColor: fig.glassBorder,
    backgroundColor: "rgba(0,0,0,0.45)"
  },
  tileBadgeText: {
    color: fig.text,
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
    borderColor: fig.glassBorder,
    backgroundColor: "rgba(0,0,0,0.45)"
  },
  tileLikePressed: {
    opacity: 0.85
  },
  tileLikeText: {
    color: fig.text,
    fontSize: 10,
    fontWeight: "700"
  },
  buttonSecondary: {
    borderColor: fig.glassBorder,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: fig.glassSoft
  },
  buttonFollow: {
    borderRadius: radii.button,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: fig.brandTeal
  },
  buttonFollowText: {
    color: colors.onAccent,
    fontWeight: "600",
    fontSize: 14
  },
  buttonSupport: {
    borderRadius: radii.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "transparent",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: fig.accentGold
  },
  buttonSupportText: {
    color: fig.accentGold,
    fontWeight: "600",
    fontSize: 14
  },
  buttonSubscribe: {
    borderRadius: radii.button,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: fig.brandTeal
  },
  buttonSubscribeText: {
    color: colors.onAccent,
    fontWeight: "600",
    fontSize: 13
  },
  buttonText: { color: fig.text, fontWeight: "600", fontSize: 14 },
  productTile: {
    padding: 8,
    justifyContent: "center",
    backgroundColor: fig.card,
    alignItems: "stretch"
  },
  productTileTitle: { fontSize: 12, fontWeight: "700", color: fig.text },
  productTilePrice: { fontSize: 11, fontWeight: "600", color: fig.accentGold, marginTop: 6 }
  });
}
