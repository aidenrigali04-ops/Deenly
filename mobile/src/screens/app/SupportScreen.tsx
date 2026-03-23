import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiRequest } from "../../lib/api";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { colors } from "../../theme";

type SupportTicket = {
  id: number;
  subject: string;
  message: string;
  status: string;
  priority: string;
  created_at: string;
};

export function SupportScreen() {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [resultMessage, setResultMessage] = useState("");

  const ticketsQuery = useQuery({
    queryKey: ["mobile-support-tickets"],
    queryFn: () => apiRequest<{ items: SupportTicket[] }>("/support/my-tickets", { auth: true })
  });

  const createTicketMutation = useMutation({
    mutationFn: () =>
      apiRequest("/support/tickets", {
        method: "POST",
        body: {
          subject,
          message
        }
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-support-tickets"] });
    }
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Support</Text>
      <View style={styles.card}>
        <Text style={styles.title}>Open ticket</Text>
        <TextInput
          style={styles.input}
          placeholder="Subject"
          placeholderTextColor={colors.muted}
          value={subject}
          onChangeText={setSubject}
        />
        <TextInput
          style={styles.inputMultiline}
          multiline
          placeholder="Describe your issue..."
          placeholderTextColor={colors.muted}
          value={message}
          onChangeText={setMessage}
        />
        <Pressable
          style={styles.buttonSecondary}
          onPress={async () => {
            try {
              await createTicketMutation.mutateAsync();
              setSubject("");
              setMessage("");
              setResultMessage("Support ticket submitted.");
            } catch (error) {
              setResultMessage(
                error instanceof ApiError ? error.message : "Unable to submit support ticket."
              );
            }
          }}
        >
          <Text style={styles.buttonText}>
            {createTicketMutation.isPending ? "Submitting..." : "Submit ticket"}
          </Text>
        </Pressable>
      </View>

      {ticketsQuery.isLoading ? <LoadingState label="Loading tickets..." /> : null}
      {ticketsQuery.error ? <ErrorState message={(ticketsQuery.error as Error).message} /> : null}
      {!ticketsQuery.isLoading && !ticketsQuery.error && (ticketsQuery.data?.items.length || 0) === 0 ? (
        <EmptyState title="No support tickets yet." />
      ) : null}
      <View style={styles.stack}>
        {ticketsQuery.data?.items.map((item) => (
          <View key={item.id} style={styles.card}>
            <Text style={styles.title}>{item.subject}</Text>
            <Text style={styles.muted}>{item.message}</Text>
            <Text style={styles.muted}>
              {item.status} | {item.priority} | {new Date(item.created_at).toLocaleString()}
            </Text>
          </View>
        ))}
      </View>
      {resultMessage ? <Text style={styles.muted}>{resultMessage}</Text> : null}
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
  inputMultiline: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 100,
    color: colors.text,
    backgroundColor: colors.surface,
    padding: 10,
    textAlignVertical: "top"
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
