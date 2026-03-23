import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { CompositeScreenProps } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { apiRequest } from "../../lib/api";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { colors } from "../../theme";
import type { AppTabParamList, RootStackParamList } from "../../navigation/AppNavigator";

type UserItem = {
  user_id: number;
  username: string;
  display_name: string;
};

type PostItem = {
  id: number;
  post_type: string;
  content: string;
  author_display_name: string;
};

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "SearchTab">,
  NativeStackScreenProps<RootStackParamList>
>;

export function SearchScreen({ navigation }: Props) {
  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");

  const usersQuery = useQuery({
    queryKey: ["mobile-search-users", submittedQ],
    queryFn: () =>
      apiRequest<{ items: UserItem[] }>(`/search/users?q=${encodeURIComponent(submittedQ)}&limit=10`, {
        auth: true
      }),
    enabled: submittedQ.length > 0
  });

  const postsQuery = useQuery({
    queryKey: ["mobile-search-posts", submittedQ],
    queryFn: () =>
      apiRequest<{ items: PostItem[] }>(`/search/posts?q=${encodeURIComponent(submittedQ)}&limit=10`, {
        auth: true
      }),
    enabled: submittedQ.length > 0
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Search</Text>
      <View style={styles.searchRow}>
        <TextInput
          style={[styles.input, styles.flex1]}
          placeholder="Search users or posts..."
          placeholderTextColor={colors.muted}
          value={q}
          onChangeText={setQ}
        />
        <Pressable style={styles.buttonSecondary} onPress={() => setSubmittedQ(q.trim())}>
          <Text style={styles.buttonText}>Go</Text>
        </Pressable>
      </View>

      {!submittedQ ? <EmptyState title="Search the platform" /> : null}
      {usersQuery.isLoading || postsQuery.isLoading ? <LoadingState label="Searching..." /> : null}
      {usersQuery.error ? <ErrorState message={(usersQuery.error as Error).message} /> : null}
      {postsQuery.error ? <ErrorState message={(postsQuery.error as Error).message} /> : null}

      {submittedQ ? (
        <>
          <View style={styles.card}>
            <Text style={styles.title}>Users</Text>
            {(usersQuery.data?.items || []).map((user) => (
              <Pressable key={user.user_id} onPress={() => navigation.navigate("UserProfile", { id: user.user_id })}>
                <Text style={styles.item}>{user.display_name} (@{user.username})</Text>
              </Pressable>
            ))}
            {(usersQuery.data?.items || []).length === 0 ? <EmptyState title="No users found" /> : null}
          </View>
          <View style={styles.card}>
            <Text style={styles.title}>Posts</Text>
            {(postsQuery.data?.items || []).map((post) => (
              <Pressable key={post.id} onPress={() => navigation.navigate("PostDetail", { id: post.id })}>
                <Text style={styles.item}>[{post.post_type}] {post.content}</Text>
                <Text style={styles.muted}>by {post.author_display_name}</Text>
              </Pressable>
            ))}
            {(postsQuery.data?.items || []).length === 0 ? <EmptyState title="No posts found" /> : null}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, gap: 12 },
  heading: { color: colors.text, fontSize: 24, fontWeight: "700" },
  searchRow: { flexDirection: "row", gap: 8 },
  flex1: { flex: 1 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8
  },
  title: { color: colors.text, fontWeight: "700" },
  item: { color: colors.text },
  muted: { color: colors.muted, fontSize: 12 },
  input: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    backgroundColor: colors.surface,
    padding: 10
  },
  buttonSecondary: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    justifyContent: "center"
  },
  buttonText: { color: colors.text, fontWeight: "600" }
});
