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
  BottomTabScreenProps<AppTabParamList, "RecitationTab">,
  NativeStackScreenProps<RootStackParamList>
>;

export function RecitationScreen({ navigation }: Props) {
  const feedQuery = useInfiniteQuery({
    queryKey: ["mobile-recitation-feed"],
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams();
      query.set("limit", "10");
      query.set("postType", "recitation");
      if (pageParam) {
        query.set("cursor", String(pageParam));
      }
      return apiRequest<FeedResponse>(`/feed?${query.toString()}`, { auth: true });
    },
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined
  });

  const items = feedQuery.data?.pages.flatMap((page) => page.items) || [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Recitation</Text>
      {feedQuery.isLoading ? <LoadingState label="Loading recitations..." /> : null}
      {feedQuery.error ? (
        <ErrorState message={(feedQuery.error as Error).message} onRetry={() => feedQuery.refetch()} />
      ) : null}
      {!feedQuery.isLoading && !feedQuery.error && items.length === 0 ? (
        <EmptyState title="No recitations yet" subtitle="Follow creators to personalize this reel." />
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
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, gap: 12 },
  heading: { color: colors.text, fontSize: 24, fontWeight: "700" },
  stack: { gap: 10 },
  buttonSecondary: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center"
  },
  buttonText: { color: colors.text, fontWeight: "600" }
});
