import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ResizeMode, Video } from "expo-av";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError, apiRequest } from "../../lib/api";
import { resolveMediaUrl } from "../../lib/media-url";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { enqueueMutation } from "../../lib/mutation-queue";
import { colors } from "../../theme";
import type { FeedItem } from "../../types";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type PostDetail = FeedItem & {
  view_count?: number;
  avg_watch_time_ms?: number;
  avg_completion_rate?: number;
};

type Props = NativeStackScreenProps<RootStackParamList, "PostDetail">;

function isImageMedia(post: PostDetail) {
  if (post.media_mime_type?.startsWith("image/")) {
    return true;
  }
  if (!post.media_url) {
    return false;
  }
  return /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(post.media_url);
}

export function PostDetailScreen({ route, navigation }: Props) {
  const { id: postId } = route.params;
  const [comment, setComment] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [reportCategory, setReportCategory] = useState("other");
  const [reportEvidenceUrl, setReportEvidenceUrl] = useState("");
  const [message, setMessage] = useState("");
  const [mediaFailed, setMediaFailed] = useState(false);

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

  useEffect(() => {
    setMediaFailed(false);
  }, [postId, postQuery.data?.media_url]);

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
          category: reportCategory,
          evidenceUrl: reportEvidenceUrl || undefined,
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
      `Views: ${post.view_count || 0}`,
      `Avg watch: ${post.avg_watch_time_ms || 0}ms`,
      `Completion: ${post.avg_completion_rate || 0}%`
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
  const mediaUri = resolveMediaUrl(post.media_url) || undefined;
  const canRenderMedia = Boolean(mediaUri) && !mediaFailed;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>{post.content}</Text>
        <Text style={styles.muted}>{post.author_display_name}</Text>
        {canRenderMedia ? (
          isImageMedia(post) ? (
            <Image
              source={{ uri: mediaUri }}
              style={styles.video}
              resizeMode="cover"
              onError={() => setMediaFailed(true)}
            />
          ) : (
            <Video
              source={{ uri: mediaUri }}
              style={styles.video}
              useNativeControls
              resizeMode={ResizeMode.COVER}
              isLooping={false}
              onError={() => setMediaFailed(true)}
            />
          )
        ) : post.media_url ? (
          <Text style={styles.muted}>Media unavailable right now.</Text>
        ) : null}
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
            onPress={async () => {
              try {
                await interact.mutateAsync({ interactionType: "benefited" });
                setMessage("Marked as benefited.");
              } catch (error) {
                if (error instanceof ApiError && error.status === 0) {
                  await enqueueMutation({
                    path: "/interactions",
                    method: "POST",
                    auth: true,
                    body: { postId, interactionType: "benefited" }
                  });
                  setMessage("Offline: benefited action queued.");
                  return;
                }
                setMessage((error as Error).message || "Unable to apply interaction.");
              }
            }}
          >
            <Text style={styles.buttonText}>Benefited</Text>
          </Pressable>
          <Pressable
            style={styles.buttonSecondary}
            onPress={async () => {
              try {
                await interact.mutateAsync({ interactionType: "reflect_later" });
                setMessage("Saved to reflect later.");
              } catch (error) {
                if (error instanceof ApiError && error.status === 0) {
                  await enqueueMutation({
                    path: "/interactions",
                    method: "POST",
                    auth: true,
                    body: { postId, interactionType: "reflect_later" }
                  });
                  setMessage("Offline: reflect-later action queued.");
                  return;
                }
                setMessage((error as Error).message || "Unable to apply interaction.");
              }
            }}
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
          onPress={async () => {
            if (!comment.trim()) return;
            try {
              await interact.mutateAsync({ interactionType: "comment", commentText: comment });
              setComment("");
              setMessage("Comment posted.");
            } catch (error) {
              if (error instanceof ApiError && error.status === 0) {
                await enqueueMutation({
                  path: "/interactions",
                  method: "POST",
                  auth: true,
                  body: { postId, interactionType: "comment", commentText: comment }
                });
                setComment("");
                setMessage("Offline: comment queued for sync.");
                return;
              }
              setMessage((error as Error).message || "Unable to post comment.");
            }
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
        <TextInput
          style={styles.inputSingle}
          placeholder="Category (haram_content, misinformation, harassment, spam, other)"
          placeholderTextColor={colors.muted}
          value={reportCategory}
          onChangeText={setReportCategory}
        />
        <TextInput
          style={styles.inputSingle}
          placeholder="Evidence URL (optional)"
          placeholderTextColor={colors.muted}
          value={reportEvidenceUrl}
          onChangeText={setReportEvidenceUrl}
        />
        <Pressable
          style={styles.buttonSecondary}
          onPress={async () => {
            try {
              await reportMutation.mutateAsync();
              setMessage("Report submitted.");
            } catch (error) {
              if (error instanceof ApiError && error.status === 0) {
                await enqueueMutation({
                  path: "/reports",
                  method: "POST",
                  auth: true,
                  body: {
                    targetType: "post",
                    targetId: String(postId),
                    reason: reportReason,
                    category: reportCategory,
                    evidenceUrl: reportEvidenceUrl || undefined,
                    notes: ""
                  }
                });
                setMessage("Offline: report queued for sync.");
                return;
              }
              setMessage((error as Error).message || "Unable to report post.");
            }
          }}
        >
          <Text style={styles.buttonText}>Submit report</Text>
        </Pressable>
      </View>
      {message ? <Text style={styles.muted}>{message}</Text> : null}
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
  video: {
    width: "100%",
    height: 240,
    borderRadius: 10,
    backgroundColor: colors.surface
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
