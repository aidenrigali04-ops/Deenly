import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { colors } from "../../theme";

type ConversationItem = {
  conversation_id: number;
  other_display_name: string;
  other_username: string;
  unread_count: number;
};

type MessageItem = {
  id: number;
  sender_display_name: string;
  body: string;
  created_at: string;
};

export function MessagesScreen() {
  const queryClient = useQueryClient();
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [participantUserId, setParticipantUserId] = useState("");
  const [body, setBody] = useState("");

  const conversationsQuery = useQuery({
    queryKey: ["mobile-messages-conversations"],
    queryFn: () => apiRequest<{ items: ConversationItem[] }>("/messages/conversations?limit=25", { auth: true })
  });

  const selectedConversation = useMemo(
    () => conversationsQuery.data?.items.find((item) => item.conversation_id === selectedConversationId) || null,
    [conversationsQuery.data, selectedConversationId]
  );

  const messagesQuery = useQuery({
    queryKey: ["mobile-messages-thread", selectedConversationId],
    queryFn: () =>
      apiRequest<{ items: MessageItem[] }>(
        `/messages/conversations/${selectedConversationId}/messages?limit=50`,
        {
          auth: true
        }
      ),
    enabled: Boolean(selectedConversationId)
  });

  const createConversation = useMutation({
    mutationFn: () =>
      apiRequest<{ conversationId: number }>("/messages/conversations", {
        method: "POST",
        auth: true,
        body: {
          participantUserId: Number(participantUserId)
        }
      }),
    onSuccess: (result) => {
      setSelectedConversationId(result.conversationId);
      setParticipantUserId("");
      queryClient.invalidateQueries({ queryKey: ["mobile-messages-conversations"] });
    }
  });

  const sendMessage = useMutation({
    mutationFn: () =>
      apiRequest(`/messages/conversations/${selectedConversationId}/messages`, {
        method: "POST",
        auth: true,
        body: { body }
      }),
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["mobile-messages-thread", selectedConversationId] });
      queryClient.invalidateQueries({ queryKey: ["mobile-messages-conversations"] });
    }
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Messages</Text>
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          placeholder="Start chat by User ID"
          placeholderTextColor={colors.muted}
          value={participantUserId}
          keyboardType="number-pad"
          onChangeText={setParticipantUserId}
        />
        <Pressable style={styles.buttonSecondary} onPress={() => createConversation.mutate()}>
          <Text style={styles.buttonText}>
            {createConversation.isPending ? "Starting..." : "Start conversation"}
          </Text>
        </Pressable>
      </View>

      {conversationsQuery.isLoading ? <LoadingState label="Loading conversations..." /> : null}
      {conversationsQuery.error ? (
        <ErrorState message={(conversationsQuery.error as Error).message} />
      ) : null}
      <View style={styles.stack}>
        {(conversationsQuery.data?.items || []).map((item) => (
          <Pressable key={item.conversation_id} style={styles.card} onPress={() => setSelectedConversationId(item.conversation_id)}>
            <Text style={styles.title}>{item.other_display_name}</Text>
            <Text style={styles.muted}>@{item.other_username}</Text>
            {item.unread_count > 0 ? <Text style={styles.muted}>{item.unread_count} unread</Text> : null}
          </Pressable>
        ))}
      </View>
      {!conversationsQuery.isLoading && (conversationsQuery.data?.items || []).length === 0 ? (
        <EmptyState title="No conversations yet" />
      ) : null}

      {selectedConversation ? (
        <View style={styles.card}>
          <Text style={styles.title}>Chat with {selectedConversation.other_display_name}</Text>
          {messagesQuery.isLoading ? <LoadingState label="Loading messages..." /> : null}
          {messagesQuery.error ? <ErrorState message={(messagesQuery.error as Error).message} /> : null}
          <View style={styles.stack}>
            {(messagesQuery.data?.items || []).map((message) => (
              <View key={message.id} style={styles.message}>
                <Text style={styles.muted}>{message.sender_display_name}</Text>
                <Text style={styles.body}>{message.body}</Text>
              </View>
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder="Type your message..."
            placeholderTextColor={colors.muted}
            value={body}
            onChangeText={setBody}
          />
          <Pressable style={styles.buttonSecondary} onPress={() => sendMessage.mutate()}>
            <Text style={styles.buttonText}>{sendMessage.isPending ? "Sending..." : "Send"}</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, gap: 12 },
  heading: { color: colors.text, fontSize: 24, fontWeight: "700" },
  stack: { gap: 8 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8
  },
  title: { color: colors.text, fontWeight: "700" },
  muted: { color: colors.muted, fontSize: 12 },
  body: { color: colors.text },
  message: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    gap: 4
  },
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
