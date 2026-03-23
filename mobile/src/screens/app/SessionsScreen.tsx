import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { apiRequest } from "../../lib/api";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { colors } from "../../theme";

type SessionItem = {
  id: number;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};

type SessionsResponse = {
  items: SessionItem[];
};

export function SessionsScreen() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["mobile-sessions"],
    queryFn: () => apiRequest<SessionsResponse>("/users/me/sessions", { auth: true })
  });
  const revokeMutation = useMutation({
    mutationFn: (sessionId: number) =>
      apiRequest(`/users/me/sessions/${sessionId}/revoke`, {
        method: "POST",
        auth: true
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-sessions"] })
  });

  if (query.isLoading) return <LoadingState label="Loading sessions..." />;
  if (query.error) return <ErrorState message={(query.error as Error).message} />;
  if (!query.data || query.data.items.length === 0) {
    return <EmptyState title="No sessions found." />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Sessions</Text>
      {query.data.items.map((session) => (
        <View key={session.id} style={styles.card}>
          <Text style={styles.title}>Session #{session.id}</Text>
          <Text style={styles.muted}>Created: {new Date(session.created_at).toLocaleString()}</Text>
          <Text style={styles.muted}>Expires: {new Date(session.expires_at).toLocaleString()}</Text>
          {!session.revoked_at ? (
            <Pressable
              style={styles.buttonSecondary}
              onPress={() => revokeMutation.mutate(session.id)}
            >
              <Text style={styles.buttonText}>Revoke</Text>
            </Pressable>
          ) : (
            <Text style={styles.muted}>Revoked</Text>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, gap: 10 },
  heading: { color: colors.text, fontSize: 24, fontWeight: "700" },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 6
  },
  title: { color: colors.text, fontWeight: "700" },
  muted: { color: colors.muted, fontSize: 12 },
  buttonSecondary: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: "flex-start"
  },
  buttonText: { color: colors.text, fontWeight: "600" }
});
