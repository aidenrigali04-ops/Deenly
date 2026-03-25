import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { apiRequest } from "../../lib/api";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { PostCard } from "../../components/PostCard";
import { colors } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import type { FeedItem } from "../../types";

type UserProfile = {
  user_id: number;
  username?: string;
  display_name: string;
  bio: string | null;
  posts_count: number;
  followers_count: number;
  following_count: number;
  likes_received_count: number;
  likes_given_count: number;
  is_following: boolean;
};

type Props = NativeStackScreenProps<RootStackParamList, "UserProfile">;

export function UserProfileScreen({ route, navigation }: Props) {
  const userId = route.params.id;
  const [activeTab, setActiveTab] = useState<"posts" | "media">("posts");
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["mobile-user-profile", userId],
    queryFn: () => apiRequest<UserProfile>(`/users/${userId}`, { auth: true })
  });
  const followMutation = useMutation({
    mutationFn: () => apiRequest(`/follows/${userId}`, { method: "POST", auth: true }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mobile-user-profile", userId] });
    }
  });
  const unfollowMutation = useMutation({
    mutationFn: () => apiRequest(`/follows/${userId}`, { method: "DELETE", auth: true }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mobile-user-profile", userId] });
    }
  });
  const postsQuery = useQuery({
    queryKey: ["mobile-user-posts", userId],
    queryFn: () =>
      apiRequest<{ items: FeedItem[] }>(`/feed?authorId=${userId}&limit=40`, { auth: true })
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

  if (profileQuery.isLoading) return <LoadingState label="Loading user profile..." />;
  if (profileQuery.error) return <ErrorState message={(profileQuery.error as Error).message} />;
  if (!profileQuery.data) return <EmptyState title="User not found" />;

  const user = profileQuery.data;
  const items = postsQuery.data?.items || [];
  const visibleItems = activeTab === "media" ? items.filter((item) => Boolean(item.media_url)) : items;
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
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
        </View>
      </View>
      <View style={styles.row}>
        <Pressable
          style={[styles.buttonSecondary, activeTab === "posts" ? styles.buttonActive : null]}
          onPress={() => setActiveTab("posts")}
        >
          <Text style={styles.buttonText}>Posts</Text>
        </Pressable>
        <Pressable
          style={[styles.buttonSecondary, activeTab === "media" ? styles.buttonActive : null]}
          onPress={() => setActiveTab("media")}
        >
          <Text style={styles.buttonText}>Media</Text>
        </Pressable>
      </View>
      {postsQuery.isLoading ? <LoadingState label="Loading posts..." /> : null}
      {postsQuery.error ? <ErrorState message={(postsQuery.error as Error).message} /> : null}
      {!postsQuery.isLoading && !postsQuery.error && visibleItems.length === 0 ? (
        <EmptyState title={activeTab === "posts" ? "No posts yet" : "No media yet"} />
      ) : null}
      <View style={styles.stack}>
        {visibleItems.map((item) => (
          <PostCard
            key={item.id}
            item={item}
            onOpen={() => navigation.navigate("PostDetail", { id: item.id })}
            onAuthor={() => navigation.navigate("UserProfile", { id: item.author_id })}
            onLike={() => likeMutation.mutate(item.id)}
            liking={likeMutation.isPending}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8
  },
  title: { color: colors.text, fontSize: 22, fontWeight: "700" },
  muted: { color: colors.muted },
  text: { color: colors.text },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  stack: { gap: 10 },
  buttonSecondary: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  buttonActive: { backgroundColor: colors.surface },
  buttonText: { color: colors.text, fontWeight: "600" }
});
