import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiRequest } from "../../lib/api";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { colors } from "../../theme";

type ReportItem = {
  id: number;
  target_type: string;
  target_id: string;
  reason: string;
  category: string;
  status: string;
  created_at: string;
};

export function AdminModerationScreen() {
  const queryClient = useQueryClient();
  const [actionType, setActionType] = useState("hide_post");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");

  const queueQuery = useQuery({
    queryKey: ["mobile-admin-report-queue"],
    queryFn: () => apiRequest<{ items: ReportItem[] }>("/reports/queue?status=open", { auth: true })
  });

  const actionMutation = useMutation({
    mutationFn: (reportId: number) =>
      apiRequest(`/reports/${reportId}/actions`, {
        method: "POST",
        auth: true,
        body: {
          actionType,
          note
        }
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-admin-report-queue"] });
    }
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Admin Moderation</Text>
      <View style={styles.card}>
        <Text style={styles.title}>Action type</Text>
        <TextInput
          style={styles.input}
          value={actionType}
          onChangeText={setActionType}
          placeholder="hide_post | remove_post | suspend_user | restore_post"
          placeholderTextColor={colors.muted}
        />
        <TextInput
          style={styles.input}
          value={note}
          onChangeText={setNote}
          placeholder="Note (optional)"
          placeholderTextColor={colors.muted}
        />
      </View>
      {queueQuery.isLoading ? <LoadingState label="Loading moderation queue..." /> : null}
      {queueQuery.error ? <ErrorState message={(queueQuery.error as Error).message} /> : null}
      {!queueQuery.isLoading && !queueQuery.error && (queueQuery.data?.items.length || 0) === 0 ? (
        <EmptyState title="No open reports." />
      ) : null}
      <View style={styles.stack}>
        {queueQuery.data?.items.map((report) => (
          <View key={report.id} style={styles.card}>
            <Text style={styles.title}>Report #{report.id}</Text>
            <Text style={styles.muted}>
              {report.target_type}:{report.target_id} | {report.category}
            </Text>
            <Text style={styles.muted}>{report.reason}</Text>
            <Text style={styles.muted}>{new Date(report.created_at).toLocaleString()}</Text>
            <Pressable
              style={styles.buttonSecondary}
              onPress={async () => {
                try {
                  await actionMutation.mutateAsync(report.id);
                  setMessage(`Action applied to report #${report.id}.`);
                } catch (error) {
                  setMessage(error instanceof ApiError ? error.message : "Unable to apply action.");
                }
              }}
            >
              <Text style={styles.buttonText}>
                {actionMutation.isPending ? "Applying..." : "Apply action"}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
      {message ? <Text style={styles.muted}>{message}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, gap: 12 },
  heading: { color: colors.text, fontSize: 24, fontWeight: "700" },
  stack: { gap: 10 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8
  },
  title: { color: colors.text, fontWeight: "700" },
  muted: { color: colors.muted },
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
    paddingVertical: 8,
    alignSelf: "flex-start"
  },
  buttonText: { color: colors.text, fontWeight: "600" }
});
