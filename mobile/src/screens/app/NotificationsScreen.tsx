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
};

type NotificationsResponse = {
  items: NotificationItem[];
};

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
        {query.data?.items.map((item) => (
          <View key={item.id} style={styles.card}>
            <Text style={styles.title}>{item.type}</Text>
            <Text style={styles.muted}>{new Date(item.created_at).toLocaleString()}</Text>
            <Text style={styles.payload}>{JSON.stringify(item.payload)}</Text>
            {!item.is_read ? (
              <Pressable
                style={styles.buttonSecondary}
                onPress={() => markReadMutation.mutate(item.id)}
              >
                <Text style={styles.buttonText}>Mark read</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
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
    borderRadius: 10,
    padding: 12,
    gap: 6
  },
  title: {
    color: colors.text,
    fontWeight: "700"
  },
  muted: {
    color: colors.muted,
    fontSize: 12
  },
  payload: {
    color: colors.muted,
    fontSize: 12
  },
  buttonSecondary: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: "flex-start"
  },
  buttonText: {
    color: colors.text,
    fontWeight: "600"
  }
});
