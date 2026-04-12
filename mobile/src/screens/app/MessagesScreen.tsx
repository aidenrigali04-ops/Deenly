import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api";
import {
  createOrOpenConversation,
  markConversationRead,
  editMessage,
  deleteMessage,
  archiveConversation,
  unarchiveConversation,
  getReadStatus,
} from "../../lib/messages";
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
  body: string | null;
  created_at: string;
  edited_at?: string | null;
  is_unsent?: boolean;
};

type MessagesRoute = RouteProp<AppTabParamList, "MessagesTab">;

const EDIT_WINDOW_MS = 15 * 60 * 1000;
const UNSEND_WINDOW_MS = 5 * 60 * 1000;

function canEdit(msg: MessageItem): boolean {
  return Date.now() - new Date(msg.created_at).getTime() < EDIT_WINDOW_MS;
}

function canUnsend(msg: MessageItem): boolean {
  return Date.now() - new Date(msg.created_at).getTime() < UNSEND_WINDOW_MS;
}

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
  const [showArchived, setShowArchived] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");
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
    queryKey: ["mobile-messages-conversations", showArchived],
    queryFn: () =>
      apiRequest<{ items: ConversationItem[] }>(
        `/messages/conversations?limit=25${showArchived ? "&archived=true" : ""}`,
        { auth: true }
      ),
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

  const readStatusQuery = useQuery({
    queryKey: ["mobile-messages-read-status", selectedConversationId],
    queryFn: () => getReadStatus(selectedConversationId!),
    enabled: Boolean(selectedConversationId),
    refetchInterval: appActive && selectedConversationId ? 5_000 : false,
  });

  const peerLastReadId = readStatusQuery.data?.lastReadMessageId ?? null;

  const orderedMessages = useMemo(() => {
    const list = messagesQuery.data?.items || [];
    return [...list].sort((a, b) => a.id - b.id);
  }, [messagesQuery.data?.items]);

  const lastSentMessageId = useMemo(() => {
    for (let i = orderedMessages.length - 1; i >= 0; i--) {
      if (orderedMessages[i].sender_id === sessionUserId && orderedMessages[i].id > 0) {
        return orderedMessages[i].id;
      }
    }
    return null;
  }, [orderedMessages, sessionUserId]);

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
      queryClient.invalidateQueries({ queryKey: ["mobile-messages-conversations", false] });
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
      queryClient.invalidateQueries({ queryKey: ["mobile-messages-conversations", false] });
    },
  });

  const sendMessage = useMutation({
    mutationFn: (payload: { conversationId: number; body: string }) =>
      apiRequest<MessageItem>(`/messages/conversations/${payload.conversationId}/messages`, {
        method: "POST",
        auth: true,
        body: { body: payload.body },
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
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData<{ items: MessageItem[] }>(queryKey, (old) => ({
        items: [...(old?.items || []), optimisticMessage],
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
      queryClient.invalidateQueries({ queryKey: ["mobile-messages-conversations", false] });
    },
  });

  const editMutation = useMutation({
    mutationFn: (p: { conversationId: number; messageId: number; body: string }) =>
      editMessage(p.conversationId, p.messageId, p.body),
    onSuccess: () => {
      setEditingMessageId(null);
      setEditBody("");
      queryClient.invalidateQueries({ queryKey: ["mobile-messages-thread", selectedConversationId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (p: { conversationId: number; messageId: number; mode: "unsend" | "delete_for_me" }) =>
      deleteMessage(p.conversationId, p.messageId, p.mode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-messages-thread", selectedConversationId] });
      queryClient.invalidateQueries({ queryKey: ["mobile-messages-conversations", false] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (conversationId: number) =>
      showArchived ? unarchiveConversation(conversationId) : archiveConversation(conversationId),
    onSuccess: () => {
      setSelectedConversationId(null);
      queryClient.invalidateQueries({ queryKey: ["mobile-messages-conversations"] });
    },
  });

  function handleLongPress(message: MessageItem) {
    if (!selectedConversationId) return;
    const convId = selectedConversationId;

    const buttons: Array<{ text: string; onPress?: () => void; style?: "cancel" | "destructive" }> = [];

    if (canEdit(message)) {
      buttons.push({
        text: "Edit",
        onPress: () => {
          setEditingMessageId(message.id);
          setEditBody(message.body || "");
        },
      });
    }
    if (canUnsend(message)) {
      buttons.push({
        text: "Unsend",
        style: "destructive",
        onPress: () => deleteMutation.mutate({ conversationId: convId, messageId: message.id, mode: "unsend" }),
      });
    }
    buttons.push({
      text: "Delete for me",
      onPress: () => deleteMutation.mutate({ conversationId: convId, messageId: message.id, mode: "delete_for_me" }),
    });
    buttons.push({ text: "Cancel", style: "cancel" });

    Alert.alert("Message", undefined, buttons);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Messages</Text>
        <Pressable onPress={() => { setShowArchived(!showArchived); setSelectedConversationId(null); }}>
          <Text style={styles.archiveToggle}>{showArchived ? "Inbox" : "Archived"}</Text>
        </Pressable>
      </View>

      {!showArchived && (
        <View style={styles.card}>
          <UserSearchInput
            onSelectUser={(userId) => createConversation.mutate(userId)}
            isPending={createConversation.isPending}
          />
        </View>
      )}

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
                selectedConversationId === item.conversation_id ? styles.conversationItemActive : null,
              ]}
              onPress={() => setSelectedConversationId(item.conversation_id)}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <View style={styles.conversationText}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.other_display_name}
                </Text>
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
        <EmptyState title={showArchived ? "No archived conversations" : "No conversations yet"} />
      ) : null}

      {selectedConversation ? (
        <View style={styles.card}>
          <View style={styles.threadHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.threadHeader}>{selectedConversation.other_display_name}</Text>
              <Text style={styles.threadSubheader}>@{selectedConversation.other_username}</Text>
            </View>
            <Pressable
              style={styles.archiveButton}
              onPress={() => archiveMutation.mutate(selectedConversation.conversation_id)}
              disabled={archiveMutation.isPending}
            >
              <Text style={styles.archiveButtonText}>{showArchived ? "Unarchive" : "Archive"}</Text>
            </Pressable>
          </View>

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
              const isEditing = editingMessageId === message.id;
              const showReadReceipt =
                mine && message.id === lastSentMessageId && peerLastReadId !== null && peerLastReadId >= message.id;

              if (message.is_unsent) {
                return (
                  <View
                    key={message.id}
                    style={[styles.message, mine ? styles.messageMine : null, styles.messageUnsent]}
                  >
                    <Text style={[styles.messageBody, { fontStyle: "italic", color: colors.muted }]}>
                      This message was unsent
                    </Text>
                  </View>
                );
              }

              return (
                <Pressable
                  key={message.id}
                  style={[
                    styles.message,
                    mine ? styles.messageMine : null,
                    isOptimistic ? styles.messageOptimistic : null,
                  ]}
                  onLongPress={() => {
                    if (mine && !isOptimistic) handleLongPress(message);
                  }}
                >
                  <Text style={styles.messageAuthor}>{message.sender_display_name}</Text>

                  {isEditing ? (
                    <View style={styles.editRow}>
                      <TextInput
                        style={styles.editInput}
                        value={editBody}
                        onChangeText={setEditBody}
                        autoFocus
                        multiline
                      />
                      <Pressable
                        onPress={() => {
                          if (!editBody.trim() || !selectedConversationId) return;
                          editMutation.mutate({
                            conversationId: selectedConversationId,
                            messageId: message.id,
                            body: editBody.trim(),
                          });
                        }}
                        disabled={editMutation.isPending}
                      >
                        <Text style={styles.editAction}>{editMutation.isPending ? "..." : "Save"}</Text>
                      </Pressable>
                      <Pressable onPress={() => setEditingMessageId(null)}>
                        <Text style={[styles.editAction, { color: colors.muted }]}>Cancel</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Text style={[styles.messageBody, mine ? styles.messageBodyMine : null]}>
                      {message.body}
                    </Text>
                  )}

                  <Text style={[styles.messageTime, mine ? styles.messageTimeMine : null]}>
                    {formatMessageTime(message.created_at)}
                    {message.edited_at ? " (edited)" : ""}
                  </Text>

                  {showReadReceipt && (
                    <Text style={[styles.messageTime, mine ? styles.messageTimeMine : null, { fontWeight: "600" }]}>
                      Read
                    </Text>
                  )}
                </Pressable>
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
              style={[styles.sendButton, !body.trim() || sendMessage.isPending ? styles.sendButtonDisabled : null]}
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
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { color: colors.text, fontSize: 24, fontWeight: "700" },
  archiveToggle: { color: colors.muted, fontSize: 12 },
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
  threadHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  threadHeader: { color: colors.text, fontWeight: "700", fontSize: 16 },
  threadSubheader: { color: colors.muted, fontSize: 12, marginTop: -4 },
  archiveButton: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.control,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  archiveButtonText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "500",
  },
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
  messageUnsent: {
    borderStyle: "dashed",
    opacity: 0.5,
    backgroundColor: "transparent",
    borderColor: colors.border,
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
  // Edit inline
  editRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  editInput: {
    flex: 1,
    borderColor: "rgba(255,255,255,0.3)",
    borderWidth: 1,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    color: colors.text,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
  },
  editAction: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: "600",
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
