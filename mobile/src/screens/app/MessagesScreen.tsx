import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api";
import { createOrOpenConversation, markConversationRead } from "../../lib/messages";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { UserSearchInput } from "../../components/UserSearchInput";
import { useAppActive } from "../../hooks/use-app-active";
import { colors, radii } from "../../theme";
import type { AppTabParamList } from "../../navigation/AppNavigator";
import { useSessionStore } from "../../store/session-store";

type ConversationItem = {
  conversation_id: number;
  other_user_id: number;
  other_display_name: string;
  other_username: string;
  other_avatar_url: string | null;
  unread_count: number;
  last_message_body: string | null;
};

type MessageItem = {
  id: number;
  sender_id: number;
  sender_display_name: string;
  body: string;
  created_at: string;
};

type MessagesRoute = RouteProp<AppTabParamList, "MessagesTab">;

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffMs = today.getTime() - messageDay.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function getDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function MessagesScreen() {
  const route = useRoute<MessagesRoute>();
  const queryClient = useQueryClient();
  const sessionUserId = useSessionStore((s) => s.user?.id ?? null);
  const appActive = useAppActive();
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [body, setBody] = useState("");
  const scrollRef = useRef<ScrollView>(null);

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
    queryFn: () => apiRequest<{ items: ConversationItem[] }>("/messages/conversations?limit=25", { auth: true }),
    refetchInterval: appActive ? 10_000 : false,
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
        { auth: true }
      ),
    enabled: Boolean(selectedConversationId),
    refetchInterval: appActive && selectedConversationId ? 3_000 : false,
  });

  const orderedMessages = useMemo(() => {
    const list = messagesQuery.data?.items || [];
    return [...list].sort((a, b) => a.id - b.id);
  }, [messagesQuery.data?.items]);

  // Build messages with date separators
  const messagesWithSeparators = useMemo(() => {
    const result: Array<
      | { type: "message"; message: MessageItem }
      | { type: "date"; label: string; key: string }
    > = [];
    let lastDateKey = "";
    for (const msg of orderedMessages) {
      const dk = getDateKey(msg.created_at);
      if (dk !== lastDateKey) {
        result.push({ type: "date", label: formatDateSeparator(msg.created_at), key: dk });
        lastDateKey = dk;
      }
      result.push({ type: "message", message: msg });
    }
    return result;
  }, [orderedMessages]);

  useEffect(() => {
    if (!selectedConversationId || !messagesQuery.data?.items?.length) return;
    const maxId = Math.max(...messagesQuery.data.items.map((m) => m.id));
    void markConversationRead(selectedConversationId, maxId).then(() => {
      queryClient.invalidateQueries({ queryKey: ["mobile-messages-conversations"] });
    });
  }, [selectedConversationId, messagesQuery.data?.items, queryClient]);

  useEffect(() => {
    if (orderedMessages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [orderedMessages.length]);

  const createConversation = useMutation({
    mutationFn: (userId: number) => createOrOpenConversation(userId),
    onSuccess: (result) => {
      setSelectedConversationId(result.conversationId);
      queryClient.invalidateQueries({ queryKey: ["mobile-messages-conversations"] });
    }
  });

  const sendMessage = useMutation({
    mutationFn: (payload: { conversationId: number; body: string }) =>
      apiRequest<MessageItem>(`/messages/conversations/${payload.conversationId}/messages`, {
        method: "POST",
        auth: true,
        body: { body: payload.body }
      }),
    onMutate: async (payload) => {
      const queryKey = ["mobile-messages-thread", payload.conversationId] as const;
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<{ items: MessageItem[] }>(queryKey);
      const optimisticMessage: MessageItem = {
        id: -Date.now(),
        sender_id: sessionUserId!,
        sender_display_name: "You",
        body: payload.body,
        created_at: new Date().toISOString()
      };
      queryClient.setQueryData<{ items: MessageItem[] }>(queryKey, (old) => ({
        items: [...(old?.items || []), optimisticMessage]
      }));
      setBody("");
      return { previous, queryKey };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
    },
    onSettled: (_data, _error, payload) => {
      queryClient.invalidateQueries({ queryKey: ["mobile-messages-thread", payload.conversationId] });
      queryClient.invalidateQueries({ queryKey: ["mobile-messages-conversations"] });
    }
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Messages</Text>

      <View style={styles.card}>
        <UserSearchInput
          onSelectUser={(userId) => createConversation.mutate(userId)}
          isPending={createConversation.isPending}
        />
      </View>

      {conversationsQuery.isLoading ? <LoadingState label="Loading conversations..." /> : null}
      {conversationsQuery.error ? (
        <ErrorState message={(conversationsQuery.error as Error).message} />
      ) : null}
      <View style={styles.stack}>
        {(conversationsQuery.data?.items || []).map((item) => {
          const initials = item.other_display_name
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((w) => w[0]?.toUpperCase())
            .join("") || "U";
          return (
            <Pressable
              key={item.conversation_id}
              style={[
                styles.conversationItem,
                selectedConversationId === item.conversation_id ? styles.conversationItemActive : null
              ]}
              onPress={() => setSelectedConversationId(item.conversation_id)}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <View style={styles.conversationText}>
                <Text style={styles.title} numberOfLines={1}>{item.other_display_name}</Text>
                <Text style={styles.preview} numberOfLines={1}>
                  {item.last_message_body || `@${item.other_username}`}
                </Text>
              </View>
              {item.unread_count > 0 ? <View style={styles.unreadDot} /> : null}
            </Pressable>
          );
        })}
      </View>
      {!conversationsQuery.isLoading && (conversationsQuery.data?.items || []).length === 0 ? (
        <EmptyState title="No conversations yet" />
      ) : null}

      {selectedConversation ? (
        <View style={styles.card}>
          <Text style={styles.threadHeader}>{selectedConversation.other_display_name}</Text>
          <Text style={styles.threadSubheader}>@{selectedConversation.other_username}</Text>

          {messagesQuery.isLoading ? <LoadingState label="Loading messages..." /> : null}
          {messagesQuery.error ? <ErrorState message={(messagesQuery.error as Error).message} /> : null}

          <ScrollView
            ref={scrollRef}
            style={styles.threadBody}
            contentContainerStyle={styles.threadContent}
          >
            {messagesWithSeparators.map((entry) => {
              if (entry.type === "date") {
                return (
                  <View key={`date-${entry.key}`} style={styles.dateSeparator}>
                    <View style={styles.dateLine} />
                    <Text style={styles.dateLabel}>{entry.label}</Text>
                    <View style={styles.dateLine} />
                  </View>
                );
              }
              const message = entry.message;
              const mine = sessionUserId != null && message.sender_id === sessionUserId;
              const isOptimistic = message.id < 0;
              return (
                <View
                  key={message.id}
                  style={[
                    styles.message,
                    mine ? styles.messageMine : null,
                    isOptimistic ? styles.messageOptimistic : null,
                  ]}
                >
                  <Text style={styles.messageAuthor}>{message.sender_display_name}</Text>
                  <Text style={[styles.messageBody, mine ? styles.messageBodyMine : null]}>
                    {message.body}
                  </Text>
                  <Text style={[styles.messageTime, mine ? styles.messageTimeMine : null]}>
                    {formatMessageTime(message.created_at)}
                  </Text>
                </View>
              );
            })}
            {!messagesQuery.isLoading && !messagesQuery.error && orderedMessages.length === 0 ? (
              <EmptyState title="No messages yet" />
            ) : null}
          </ScrollView>

          <View style={styles.composerRow}>
            <TextInput
              style={styles.composeInput}
              placeholder="Message..."
              placeholderTextColor={colors.muted}
              value={body}
              onChangeText={setBody}
              multiline
            />
            <Pressable
              style={[styles.sendButton, (!body.trim() || sendMessage.isPending) ? styles.sendButtonDisabled : null]}
              onPress={() => {
                if (!selectedConversationId || !body.trim()) return;
                sendMessage.mutate({ conversationId: selectedConversationId, body: body.trim() });
              }}
              disabled={sendMessage.isPending || !body.trim()}
            >
              <Text style={styles.sendButtonText}>Send</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.atmosphere },
  content: { padding: 14, gap: 12 },
  heading: { color: colors.text, fontSize: 24, fontWeight: "700" },
  stack: { gap: 6 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.panel,
    padding: 12,
    gap: 8,
  },
  // Conversation list items
  conversationItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.control,
    padding: 10,
  },
  conversationItemActive: {
    borderColor: colors.accent,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  conversationText: {
    flex: 1,
    minWidth: 0,
  },
  title: { color: colors.text, fontWeight: "700", fontSize: 14 },
  preview: { color: colors.muted, fontSize: 12, marginTop: 1 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  // Thread
  threadHeader: { color: colors.text, fontWeight: "700", fontSize: 16 },
  threadSubheader: { color: colors.muted, fontSize: 12, marginTop: -4 },
  threadBody: {
    maxHeight: 380,
    marginTop: 8,
  },
  threadContent: {
    gap: 8,
    paddingBottom: 4,
  },
  // Date separators
  dateSeparator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  dateLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  dateLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "500",
  },
  // Messages
  message: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.control,
    padding: 10,
    gap: 2,
    alignSelf: "flex-start",
    maxWidth: "85%",
  },
  messageMine: {
    alignSelf: "flex-end",
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  messageOptimistic: {
    opacity: 0.6,
  },
  messageAuthor: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  messageBody: { color: colors.text, fontSize: 14, lineHeight: 20 },
  messageBodyMine: { color: colors.onAccent },
  messageTime: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 2,
  },
  messageTimeMine: {
    color: "rgba(255, 255, 255, 0.5)",
  },
  // Composer
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginTop: 8,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  composeInput: {
    flex: 1,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 20,
    color: colors.text,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: colors.accent,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    color: colors.onAccent,
    fontWeight: "600",
    fontSize: 14,
  },
});
