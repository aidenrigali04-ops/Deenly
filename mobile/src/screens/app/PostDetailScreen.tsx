import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { colors } from "../../theme";
import type { FeedItem } from "../../types";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type PostDetail = FeedItem & {
  view_count?: number;
  avg_watch_time_ms?: number;
  avg_completion_rate?: number;
};

type Props = NativeStackScreenProps<RootStackParamList, "PostDetail">;

export function PostDetailScreen({ route, navigation }: Props) {
  const { id: postId } = route.params;
  const [comment, setComment] = useState("");
  const [reportReason, setReportReason] = useState("");

  const postQuery = useQuery({
    queryKey: ["mobile-post-detail", postId],
    queryFn: () => apiRequest<PostDetail>(`/posts/${postId}`)
  });

  const viewMutation = useMutation({
    mutationFn: (completionRate: number) =>
      apiRequest("/interactions/view", {
        method: "POST",
        auth: true,
        body: {
          postId,
          watchTimeMs: 12000,
          completionRate
        }
      })
  });

  useEffect(() => {
    if (postQuery.data) {
      viewMutation.mutate(80);
    }
  }, [postQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const interact = useMutation({
    mutationFn: (payload: { interactionType: string; commentText?: string }) =>
      apiRequest("/interactions", {
        method: "POST",
        auth: true,
        body: { postId, ...payload }
      }),
    onSuccess: () => postQuery.refetch()
  });

  const reportMutation = useMutation({
    mutationFn: () =>
      apiRequest("/reports", {
        method: "POST",
        auth: true,
        body: {
          targetType: "post",
          targetId: String(postId),
          reason: reportReason,
          notes: ""
        }
      })
  });

  const stats = useMemo(() => {
    const post = postQuery.data;
    if (!post) {
      return null;
    }
    return [
      `Benefited: ${post.benefited_count || 0}`,
      `Comments: ${post.comment_count || 0}`,
      `Views: ${post.view_count || 0}`
    ];
  }, [postQuery.data]);

  if (postQuery.isLoading) {
    return <LoadingState label="Loading post..." />;
  }
  if (postQuery.error) {
    return <ErrorState message={(postQuery.error as Error).message} onRetry={postQuery.refetch} />;
  }
  if (!postQuery.data) {
    return <EmptyState title="Post not found" />;
  }

  const post = postQuery.data;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>{post.content}</Text>
        <Text style={styles.muted}>{post.author_display_name}</Text>
        <View style={styles.metrics}>
          {stats?.map((value) => (
            <Text key={value} style={styles.muted}>
              {value}
            </Text>
          ))}
        </View>
        <View style={styles.row}>
          <Pressable
            style={styles.buttonSecondary}
            onPress={() => interact.mutate({ interactionType: "benefited" })}
          >
            <Text style={styles.buttonText}>Benefited</Text>
          </Pressable>
          <Pressable
            style={styles.buttonSecondary}
            onPress={() => interact.mutate({ interactionType: "reflect_later" })}
          >
            <Text style={styles.buttonText}>Reflect Later</Text>
          </Pressable>
          <Pressable
            style={styles.buttonSecondary}
            onPress={() => navigation.navigate("UserProfile", { id: post.author_id })}
          >
            <Text style={styles.buttonText}>Author</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Add comment</Text>
        <TextInput
          style={styles.input}
          multiline
          placeholder="Write a respectful comment..."
          placeholderTextColor={colors.muted}
          value={comment}
          onChangeText={setComment}
        />
        <Pressable
          style={styles.button}
          onPress={() => {
            if (!comment.trim()) return;
            interact.mutate({ interactionType: "comment", commentText: comment });
            setComment("");
          }}
        >
          <Text style={styles.buttonText}>Post comment</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Report post</Text>
        <TextInput
          style={styles.inputSingle}
          placeholder="Reason"
          placeholderTextColor={colors.muted}
          value={reportReason}
          onChangeText={setReportReason}
        />
        <Pressable style={styles.buttonSecondary} onPress={() => reportMutation.mutate()}>
          <Text style={styles.buttonText}>Submit report</Text>
        </Pressable>
      </View>
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
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700"
  },
  muted: {
    color: colors.muted
  },
  metrics: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap"
  },
  row: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap"
  },
  label: {
    color: colors.text,
    fontWeight: "700"
  },
  input: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 100,
    color: colors.text,
    backgroundColor: colors.surface,
    padding: 10,
    textAlignVertical: "top"
  },
  inputSingle: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    backgroundColor: colors.surface,
    padding: 10
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center"
  },
  buttonSecondary: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  buttonText: {
    color: colors.text,
    fontWeight: "600"
  }
});
