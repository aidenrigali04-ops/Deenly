import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { apiRequest } from "../../lib/api";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { colors } from "../../theme";

type NotificationItem = {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
  actor_display_name?: string | null;
};

type NotificationsResponse = {
  items: NotificationItem[];
};

function payloadNum(payload: Record<string, unknown>, key: string): number | null {
  const v = payload[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function payloadStr(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key];
  return typeof v === "string" ? v : null;
}

function notificationTitle(item: NotificationItem): string {
  const p = item.payload;
  const who =
    typeof item.actor_display_name === "string" && item.actor_display_name.trim()
      ? item.actor_display_name.trim()
      : "Someone";
  const postId = payloadNum(p, "postId");

  if (item.type === "direct_message") {
    const sender =
      typeof p.senderDisplayName === "string" && p.senderDisplayName.trim()
        ? p.senderDisplayName.trim()
        : who;
    return `Message from ${sender}`;
  }
  if (item.type === "post_benefited" && postId != null) {
    return `${who} appreciated your post`;
  }
  if (item.type === "post_comment" && postId != null) {
    return `${who} commented on your post`;
  }
  if (item.type === "post_reflect_later" && postId != null) {
    return `${who} saved your post to reflect later`;
  }
  if (item.type === "new_follower") {
    return `${who} started following you`;
  }
  return item.type.replace(/_/g, " ");
}

function notificationDetail(item: NotificationItem): string | null {
  const p = item.payload;
  if (item.type === "direct_message") {
    return typeof p.bodyPreview === "string" ? p.bodyPreview : "New message";
  }
  if (item.type === "post_benefited") {
    return "They marked it as benefited.";
  }
  if (item.type === "post_comment") {
    return payloadStr(p, "commentPreview");
  }
  return null;
}

export function NotificationsScreen() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["mobile-notifications"],
    queryFn: () => apiRequest<NotificationsResponse>("/notifications", { auth: true })
  });
  const markReadMutation = useMutation({
    mutationFn: (notificationId: number) =>
      apiRequest(`/notifications/${notificationId}/read`, {
        method: "POST",
        auth: true
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-notifications"] });
    }
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Inbox</Text>
      {query.isLoading ? <LoadingState label="Loading inbox..." /> : null}
      {query.error ? <ErrorState message={(query.error as Error).message} /> : null}
      {!query.isLoading && !query.error && (query.data?.items.length || 0) === 0 ? (
        <EmptyState title="No notifications yet." />
      ) : null}
      <View style={styles.stack}>
        {query.data?.items.map((item) => {
          const detail = notificationDetail(item);
          return (
            <View key={item.id} style={styles.card}>
              <Text style={styles.title}>
                {notificationTitle(item)}
                {!item.is_read ? <Text style={styles.newBadge}> · New</Text> : null}
              </Text>
              <Text style={styles.muted}>{new Date(item.created_at).toLocaleString()}</Text>
              {detail ? <Text style={styles.detail}>{detail}</Text> : null}
              {!item.is_read ? (
                <Pressable
                  style={styles.buttonSecondary}
                  onPress={() => markReadMutation.mutate(item.id)}
                >
                  <Text style={styles.buttonText}>Mark read</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
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
  heading: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700"
  },
  stack: {
    gap: 10
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 6
  },
  title: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 15
  },
  newBadge: {
    color: colors.accent,
    fontWeight: "600",
    fontSize: 12
  },
  detail: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.9
  },
  muted: {
    color: colors.muted,
    fontSize: 12
  },
  buttonSecondary: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: "flex-start",
    marginTop: 4
  },
  buttonText: {
    color: colors.text,
    fontWeight: "600"
  }
});
