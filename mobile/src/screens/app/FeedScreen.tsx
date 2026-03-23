import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { CompositeScreenProps } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { apiRequest } from "../../lib/api";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { PostCard } from "../../components/PostCard";
import { colors } from "../../theme";
import type { FeedItem } from "../../types";
import type { AppTabParamList, RootStackParamList } from "../../navigation/AppNavigator";

type FeedResponse = {
  items: FeedItem[];
  nextCursor: string | null;
};

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "FeedTab">,
  NativeStackScreenProps<RootStackParamList>
>;

export function FeedScreen({ navigation }: Props) {
  const [postType, setPostType] = useState<"" | "recitation" | "community" | "short_video">("");
  const [followingOnly, setFollowingOnly] = useState(false);
  const feedQueryKey = useMemo(
    () => ["mobile-feed", postType, followingOnly] as const,
    [postType, followingOnly]
  );

  const feedQuery = useInfiniteQuery({
    queryKey: feedQueryKey,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams();
      query.set("limit", "10");
      if (pageParam) {
        query.set("cursor", String(pageParam));
      }
      if (postType) {
        query.set("postType", postType);
      }
      if (followingOnly) {
        query.set("followingOnly", "true");
      }
      return apiRequest<FeedResponse>(`/feed?${query.toString()}`, { auth: true });
    },
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined
  });

  const items = feedQuery.data?.pages.flatMap((page) => page.items) || [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Feed</Text>
      <View style={styles.filters}>
        {(["", "recitation", "community", "short_video"] as const).map((type) => {
          const active = postType === type;
          return (
            <Pressable
              key={type || "all"}
              style={[styles.chip, active ? styles.chipActive : null]}
              onPress={() => setPostType(type)}
            >
              <Text style={styles.chipText}>{type || "all"}</Text>
            </Pressable>
          );
        })}
        <Pressable
          style={[styles.chip, followingOnly ? styles.chipActive : null]}
          onPress={() => setFollowingOnly((value) => !value)}
        >
          <Text style={styles.chipText}>following</Text>
        </Pressable>
      </View>

      {feedQuery.isLoading ? <LoadingState label="Loading feed..." /> : null}
      {feedQuery.error ? (
        <ErrorState
          message={(feedQuery.error as Error).message}
          onRetry={() => feedQuery.refetch()}
        />
      ) : null}
      {!feedQuery.isLoading && !feedQuery.error && items.length === 0 ? (
        <EmptyState title="No posts yet" subtitle="Create the first beneficial post." />
      ) : null}

      <View style={styles.stack}>
        {items.map((item) => (
          <PostCard
            key={item.id}
            item={item}
            onOpen={() => navigation.navigate("PostDetail", { id: item.id })}
            onAuthor={() => navigation.navigate("UserProfile", { id: item.author_id })}
          />
        ))}
      </View>

      {feedQuery.hasNextPage ? (
        <Pressable
          style={styles.buttonSecondary}
          disabled={feedQuery.isFetchingNextPage}
          onPress={() => feedQuery.fetchNextPage()}
        >
          <Text style={styles.buttonText}>
            {feedQuery.isFetchingNextPage ? "Loading..." : "Load more"}
          </Text>
        </Pressable>
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
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  chip: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  chipActive: {
    backgroundColor: colors.accent
  },
  chipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700"
  },
  stack: {
    gap: 10
  },
  buttonSecondary: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center"
  },
  buttonText: {
    color: colors.text,
    fontWeight: "600"
  }
});
