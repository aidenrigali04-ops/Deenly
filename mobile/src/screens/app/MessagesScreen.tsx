import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api";
import { createOrOpenConversation, markConversationRead } from "../../lib/messages";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { colors } from "../../theme";
import type { AppTabParamList } from "../../navigation/AppNavigator";
import { useSessionStore } from "../../store/session-store";

type ConversationItem = {
  conversation_id: number;
  other_display_name: string;
  other_username: string;
  unread_count: number;
};

type MessageItem = {
  id: number;
  sender_id: number;
  sender_display_name: string;
  body: string;
  created_at: string;
};

type MessagesRoute = RouteProp<AppTabParamList, "MessagesTab">;

export function MessagesScreen() {
  const route = useRoute<MessagesRoute>();
  const queryClient = useQueryClient();
  const sessionUserId = useSessionStore((s) => s.user?.id ?? null);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [participantUserId, setParticipantUserId] = useState("");
  const [body, setBody] = useState("");

  const openUserId = route.params?.openUserId;

  useEffect(() => {
    if (!openUserId || !sessionUserId || openUserId === sessionUserId) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await createOrOpenConversation(openUserId);
        if (cancelled) return;
        setSelectedConversationId(result.conversationId);
      } catch {
        /* blocked or invalid */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openUserId, sessionUserId]);

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

  const orderedMessages = useMemo(() => {
    const list = messagesQuery.data?.items || [];
    return [...list].sort((a, b) => a.id - b.id);
  }, [messagesQuery.data?.items]);

  useEffect(() => {
    if (!selectedConversationId || !messagesQuery.data?.items?.length) return;
    const maxId = Math.max(...messagesQuery.data.items.map((m) => m.id));
    void markConversationRead(selectedConversationId, maxId).then(() => {
      queryClient.invalidateQueries({ queryKey: ["mobile-messages-conversations"] });
    });
  }, [selectedConversationId, messagesQuery.data?.items, queryClient]);

  const createConversation = useMutation({
    mutationFn: () => createOrOpenConversation(Number(participantUserId)),
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
        body: { body: body.trim() }
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
        <Pressable
          style={styles.buttonSecondary}
          onPress={() => {
            const n = Number(participantUserId);
            if (!Number.isFinite(n) || n <= 0) return;
            createConversation.mutate();
          }}
        >
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
          <Pressable
            key={item.conversation_id}
            style={[
              styles.card,
              selectedConversationId === item.conversation_id ? styles.cardActive : null
            ]}
            onPress={() => setSelectedConversationId(item.conversation_id)}
          >
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
            {orderedMessages.map((message) => {
              const mine = sessionUserId != null && message.sender_id === sessionUserId;
              return (
                <View
                  key={message.id}
                  style={[styles.message, mine ? styles.messageMine : null]}
                >
                  <Text style={styles.muted}>{message.sender_display_name}</Text>
                  <Text style={styles.body}>{message.body}</Text>
                </View>
              );
            })}
          </View>
          <TextInput
            style={styles.input}
            placeholder="Type your message..."
            placeholderTextColor={colors.muted}
            value={body}
            onChangeText={setBody}
          />
          <Pressable
            style={styles.buttonSecondary}
            onPress={() => {
              if (!selectedConversationId || !body.trim()) return;
              sendMessage.mutate();
            }}
            disabled={sendMessage.isPending || !body.trim()}
          >
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
  cardActive: {
    borderColor: colors.accent
  },
  title: { color: colors.text, fontWeight: "700" },
  muted: { color: colors.muted, fontSize: 12 },
  body: { color: colors.text },
  message: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    gap: 4,
    alignSelf: "flex-start",
    maxWidth: "92%"
  },
  messageMine: {
    alignSelf: "flex-end",
    backgroundColor: colors.surface
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
