import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiRequest } from "../../lib/api";
import { colors } from "../../theme";

export function AdminOperationsScreen() {
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState("");
  const [maxUses, setMaxUses] = useState("1");
  const [ticketId, setTicketId] = useState("");
  const [status, setStatus] = useState("in_progress");
  const [priority, setPriority] = useState("normal");
  const [message, setMessage] = useState("");

  const createInviteMutation = useMutation({
    mutationFn: () =>
      apiRequest("/admin/invites", {
        method: "POST",
        auth: true,
        body: {
          email: inviteEmail || undefined,
          maxUses: Number(maxUses) || 1
        }
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-admin-table-beta_invites"] });
    }
  });

  const triageTicketMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/admin/support/${ticketId}`, {
        method: "POST",
        auth: true,
        body: {
          status,
          priority
        }
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-admin-table-support_tickets"] });
    }
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Admin Operations</Text>
      <View style={styles.card}>
        <Text style={styles.title}>Create beta invite</Text>
        <TextInput
          style={styles.input}
          placeholder="Email (optional)"
          placeholderTextColor={colors.muted}
          value={inviteEmail}
          onChangeText={setInviteEmail}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Max uses"
          placeholderTextColor={colors.muted}
          value={maxUses}
          onChangeText={setMaxUses}
          keyboardType="number-pad"
        />
        <Pressable
          style={styles.buttonSecondary}
          onPress={async () => {
            try {
              const result = await createInviteMutation.mutateAsync();
              setMessage(`Invite created: ${(result as { code?: string }).code || "success"}`);
            } catch (error) {
              setMessage(error instanceof ApiError ? error.message : "Unable to create invite.");
            }
          }}
        >
          <Text style={styles.buttonText}>
            {createInviteMutation.isPending ? "Creating..." : "Create invite"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Triage support ticket</Text>
        <TextInput
          style={styles.input}
          placeholder="Ticket ID"
          placeholderTextColor={colors.muted}
          value={ticketId}
          onChangeText={setTicketId}
          keyboardType="number-pad"
        />
        <TextInput
          style={styles.input}
          placeholder="Status"
          placeholderTextColor={colors.muted}
          value={status}
          onChangeText={setStatus}
        />
        <TextInput
          style={styles.input}
          placeholder="Priority"
          placeholderTextColor={colors.muted}
          value={priority}
          onChangeText={setPriority}
        />
        <Pressable
          style={styles.buttonSecondary}
          onPress={async () => {
            try {
              await triageTicketMutation.mutateAsync();
              setMessage("Support ticket updated.");
            } catch (error) {
              setMessage(
                error instanceof ApiError ? error.message : "Unable to update support ticket."
              );
            }
          }}
        >
          <Text style={styles.buttonText}>
            {triageTicketMutation.isPending ? "Updating..." : "Update ticket"}
          </Text>
        </Pressable>
      </View>
      {message ? <Text style={styles.muted}>{message}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, gap: 12 },
  heading: { color: colors.text, fontSize: 24, fontWeight: "700" },
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
