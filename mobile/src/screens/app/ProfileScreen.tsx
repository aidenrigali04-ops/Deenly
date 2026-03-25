import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { CompositeScreenProps } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { fetchSessionMe, logout } from "../../lib/auth";
import { apiRequest } from "../../lib/api";
import { useSessionStore } from "../../store/session-store";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { PostCard } from "../../components/PostCard";
import { colors } from "../../theme";
import type { FeedItem } from "../../types";
import type { AppTabParamList, RootStackParamList } from "../../navigation/AppNavigator";

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "AccountTab">,
  NativeStackScreenProps<RootStackParamList>
>;

export function ProfileScreen({ navigation }: Props) {
  const [activeTab, setActiveTab] = useState<"posts" | "media">("posts");
  const setUser = useSessionStore((state) => state.setUser);
  const queryClient = useQueryClient();
  const adminOwnerEmail = String(process.env.EXPO_PUBLIC_ADMIN_OWNER_EMAIL || "").toLowerCase();
  const sessionQuery = useQuery({
    queryKey: ["mobile-session-me"],
    queryFn: () => fetchSessionMe()
  });
  const interestsQuery = useQuery({
    queryKey: ["mobile-my-interests"],
    queryFn: () => apiRequest<{ items: string[] }>("/users/me/interests", { auth: true })
  });
  const profileQuery = useQuery({
    queryKey: ["mobile-account-profile"],
    queryFn: () =>
      apiRequest<{
        user_id: number;
        posts_count: number;
        followers_count: number;
        following_count: number;
        likes_received_count: number;
        likes_given_count: number;
      }>("/users/me", { auth: true }),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const postsQuery = useQuery({
    queryKey: ["mobile-account-posts", sessionQuery.data?.id],
    queryFn: () =>
      apiRequest<{ items: FeedItem[] }>(`/feed?authorId=${sessionQuery.data?.id}&limit=40`, {
        auth: true
      }),
    enabled: Boolean(sessionQuery.data?.id)
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
        queryClient.invalidateQueries({ queryKey: ["mobile-account-posts", sessionQuery.data?.id] }),
        queryClient.invalidateQueries({ queryKey: ["mobile-account-profile"] })
      ]);
    }
  });

  const handleLogout = async () => {
    await logout();
    setUser(null);
  };

  const isOwnerAdmin =
    !!sessionQuery.data &&
    ["admin", "moderator"].includes(sessionQuery.data.role) &&
    String(sessionQuery.data.email || "").toLowerCase() === adminOwnerEmail;

  const items = postsQuery.data?.items || [];
  const visibleItems = activeTab === "media" ? items.filter((item) => Boolean(item.media_url)) : items;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Profile</Text>
      {sessionQuery.isLoading ? <LoadingState label="Loading profile..." /> : null}
      {sessionQuery.error ? <ErrorState message={(sessionQuery.error as Error).message} /> : null}
      {!sessionQuery.isLoading && !sessionQuery.error && !sessionQuery.data ? (
        <EmptyState title="Profile unavailable" />
      ) : null}
      {sessionQuery.data ? (
        <View style={styles.card}>
          <Text style={styles.title}>{sessionQuery.data.email}</Text>
          <Text style={styles.muted}>@{sessionQuery.data.username || "unknown"}</Text>
          <Text style={styles.muted}>Role: {sessionQuery.data.role}</Text>
        </View>
      ) : null}
      <View style={styles.card}>
        <Text style={styles.title}>Stats</Text>
        <View style={styles.row}>
          <Text style={styles.muted}>Posts: {profileQuery.data?.posts_count || 0}</Text>
          <Text style={styles.muted}>Followers: {profileQuery.data?.followers_count || 0}</Text>
          <Text style={styles.muted}>Following: {profileQuery.data?.following_count || 0}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.muted}>Likes received: {profileQuery.data?.likes_received_count || 0}</Text>
          <Text style={styles.muted}>Likes by you: {profileQuery.data?.likes_given_count || 0}</Text>
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
      <View style={styles.card}>
        <Text style={styles.title}>Interests</Text>
        <Text style={styles.muted}>
          {(interestsQuery.data?.items || []).join(", ") || "No interests selected"}
        </Text>
        <Pressable
          style={styles.buttonSecondary}
          onPress={() => navigation.navigate("Onboarding")}
        >
          <Text style={styles.buttonText}>Edit interests</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <Pressable
          style={styles.buttonSecondary}
          onPress={() => navigation.navigate("Sessions")}
        >
          <Text style={styles.buttonText}>Sessions</Text>
        </Pressable>
        <Pressable style={styles.buttonSecondary} onPress={handleLogout}>
          <Text style={styles.buttonText}>Logout</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <Pressable style={styles.buttonSecondary} onPress={() => navigation.navigate("Dhikr")}>
          <Text style={styles.buttonText}>Dhikr</Text>
        </Pressable>
        <Pressable style={styles.buttonSecondary} onPress={() => navigation.navigate("QuranReader")}>
          <Text style={styles.buttonText}>Quran</Text>
        </Pressable>
        <Pressable style={styles.buttonSecondary} onPress={() => navigation.navigate("SalahSettings")}>
          <Text style={styles.buttonText}>Salah</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <Pressable style={styles.buttonSecondary} onPress={() => navigation.navigate("Beta")}>
          <Text style={styles.buttonText}>Beta</Text>
        </Pressable>
        <Pressable style={styles.buttonSecondary} onPress={() => navigation.navigate("Support")}>
          <Text style={styles.buttonText}>Support</Text>
        </Pressable>
        <Pressable style={styles.buttonSecondary} onPress={() => navigation.navigate("Guidelines")}>
          <Text style={styles.buttonText}>Guidelines</Text>
        </Pressable>
      </View>
      {isOwnerAdmin ? (
        <>
          <View style={styles.row}>
            <Pressable
              style={styles.buttonSecondary}
              onPress={() => navigation.navigate("AdminModeration")}
            >
              <Text style={styles.buttonText}>Admin moderation</Text>
            </Pressable>
            <Pressable
              style={styles.buttonSecondary}
              onPress={() => navigation.navigate("AdminOperations")}
            >
              <Text style={styles.buttonText}>Admin operations</Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            <Pressable
              style={styles.buttonSecondary}
              onPress={() => navigation.navigate("AdminAnalytics")}
            >
              <Text style={styles.buttonText}>Admin analytics</Text>
            </Pressable>
            <Pressable
              style={styles.buttonSecondary}
              onPress={() => navigation.navigate("AdminTables")}
            >
              <Text style={styles.buttonText}>Admin tables</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    padding: 14,
    gap: 12
  },
  heading: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700"
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 6
  },
  title: {
    color: colors.text,
    fontWeight: "700"
  },
  muted: {
    color: colors.muted
  },
  row: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap"
  },
  stack: {
    gap: 10
  },
  buttonSecondary: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  buttonActive: {
    backgroundColor: colors.surface
  },
  buttonText: {
    color: colors.text,
    fontWeight: "600"
  }
});
