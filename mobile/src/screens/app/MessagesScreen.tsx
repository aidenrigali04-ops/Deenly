import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { CompositeScreenProps, useRoute, type RouteProp } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api";
import { createOrOpenConversation, markConversationRead } from "../../lib/messages";
import { ErrorState, LoadingState } from "../../components/States";
import { SectionCard, TabScreenHeader, TabScreenRoot } from "../../components/TabScreenChrome";
import { colors, radii } from "../../theme";
import { useTabSceneBottomPadding, useTabSceneTopPadding } from "../../hooks/useTabSceneInsets";
import type { AppTabParamList, RootStackParamList } from "../../navigation/AppNavigator";
import { useSessionStore } from "../../store/session-store";

type ConversationItem = {
  conversation_id: number;
  other_display_name: string;
  other_username: string;
  unread_count: number;
};

type SearchUserRow = {
  user_id: number;
  username: string;
  display_name: string;
};

type MessageItem = {
  id: number;
  sender_id: number;
  sender_display_name: string;
  body: string;
  created_at: string;
};

type MessagesRoute = RouteProp<AppTabParamList, "MessagesTab">;

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "MessagesTab">,
  NativeStackScreenProps<RootStackParamList>
>;

export function MessagesScreen({ navigation }: Props) {
  const route = useRoute<MessagesRoute>();
  const topPad = useTabSceneTopPadding(12);
  const bottomPad = useTabSceneBottomPadding(20);
  const queryClient = useQueryClient();
  const sessionUserId = useSessionStore((s) => s.user?.id ?? null);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [usernameLookupInput, setUsernameLookupInput] = useState("");
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

  const usernameLookupMutation = useMutation({
    mutationFn: (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) {
        return Promise.reject(new Error("Enter at least 2 characters."));
      }
      return apiRequest<{ items: SearchUserRow[] }>(
        `/search/users?q=${encodeURIComponent(trimmed)}&limit=8`,
        { auth: true }
      );
    }
  });

  const usernameLookupRows = useMemo(() => {
    const items = usernameLookupMutation.data?.items || [];
    if (!sessionUserId) return items;
    return items.filter((row) => row.user_id !== sessionUserId);
  }, [usernameLookupMutation.data?.items, sessionUserId]);

  const createConversation = useMutation({
    mutationFn: (userId: number) => createOrOpenConversation(userId),
    onSuccess: (result) => {
      setSelectedConversationId(result.conversationId);
      setUsernameLookupInput("");
      usernameLookupMutation.reset();
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

  const conversations = conversationsQuery.data?.items || [];
  const inboxEmpty = !conversationsQuery.isLoading && conversations.length === 0;

  return (
    <TabScreenRoot>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: topPad, paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        <TabScreenHeader
          title="Messages"
          subtitle="Direct conversations with people on Deenly."
        />

        <SectionCard title="New message">
          <Text style={styles.helper}>
            Search by name or @username—the same people index as Search—or open a chat from someone&apos;s profile.
          </Text>
          <Text style={styles.miniLabel}>Find by name or username</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. ahmad or @username"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            value={usernameLookupInput}
            onChangeText={setUsernameLookupInput}
          />
          <Pressable
            style={styles.buttonSecondary}
            onPress={() => usernameLookupMutation.mutate(usernameLookupInput)}
            disabled={usernameLookupMutation.isPending}
          >
            <Text style={styles.buttonText}>
              {usernameLookupMutation.isPending ? "Searching..." : "Search people"}
            </Text>
          </Pressable>
          {usernameLookupMutation.isError ? (
            <Text style={styles.lookupError}>{(usernameLookupMutation.error as Error).message}</Text>
          ) : null}
          {usernameLookupMutation.isSuccess ? (
            usernameLookupRows.length === 0 ? (
              <Text style={styles.helper}>No users match that search.</Text>
            ) : (
              <View style={styles.lookupList}>
                {usernameLookupRows.map((row) => (
                  <Pressable
                    key={row.user_id}
                    style={styles.lookupRow}
                    onPress={() => createConversation.mutate(row.user_id)}
                    disabled={createConversation.isPending}
                  >
                    <Text style={styles.lookupRowName} numberOfLines={1}>
                      {row.display_name}
                    </Text>
                    <Text style={styles.lookupRowSub} numberOfLines={1}>
                      @{row.username}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )
          ) : null}
        </SectionCard>

        {conversationsQuery.isLoading ? <LoadingState label="Loading conversations..." /> : null}
        {conversationsQuery.error ? (
          <ErrorState message={(conversationsQuery.error as Error).message} />
        ) : null}

        <SectionCard title="Inbox">
          {inboxEmpty ? (
            <View style={styles.emptyInbox}>
              <Text style={styles.emptyInboxText}>No conversations yet. Start one above, or find people to message from Search.</Text>
              <Pressable style={styles.findPeopleBtn} onPress={() => navigation.navigate("Search")}>
                <Text style={styles.findPeopleBtnText}>Find people</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.inboxList}>
              {conversations.map((item) => (
                <Pressable
                  key={item.conversation_id}
                  style={[styles.inboxRow, selectedConversationId === item.conversation_id ? styles.inboxRowActive : null]}
                  onPress={() => setSelectedConversationId(item.conversation_id)}
                >
                  <View style={styles.inboxRowAvatar}>
                    <Text style={styles.inboxRowAvatarText}>
                      {(item.other_display_name || item.other_username).slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.inboxRowMain}>
                    <View style={styles.inboxRowTitleLine}>
                      <Text style={styles.inboxRowName} numberOfLines={1}>
                        {item.other_display_name}
                      </Text>
                      {item.unread_count > 0 ? (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadBadgeText}>{item.unread_count > 99 ? "99+" : item.unread_count}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.inboxRowSub} numberOfLines={1}>
                      @{item.other_username}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))}
            </View>
          )}
        </SectionCard>

        {selectedConversation ? (
          <SectionCard title={`Chat · ${selectedConversation.other_display_name}`}>
            {messagesQuery.isLoading ? <LoadingState label="Loading messages..." /> : null}
            {messagesQuery.error ? <ErrorState message={(messagesQuery.error as Error).message} /> : null}
            <View style={styles.threadStack}>
              {orderedMessages.map((message) => {
                const mine = sessionUserId != null && message.sender_id === sessionUserId;
                return (
                  <View key={message.id} style={[styles.message, mine ? styles.messageMine : null]}>
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
          </SectionCard>
        ) : null}
      </ScrollView>
    </TabScreenRoot>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { gap: 14 },
  helper: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  miniLabel: { fontSize: 12, fontWeight: "700", color: colors.text, marginBottom: 6 },
  lookupError: { color: colors.danger, fontSize: 13, marginTop: 8 },
  lookupList: { marginTop: 10, gap: 0, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderSubtle, borderRadius: radii.control, overflow: "hidden" },
  lookupRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.surface
  },
  lookupRowName: { fontSize: 15, fontWeight: "700", color: colors.text },
  lookupRowSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  input: {
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    color: colors.text,
    backgroundColor: colors.surface,
    padding: 12
  },
  buttonSecondary: {
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: "flex-start",
    backgroundColor: colors.surface
  },
  buttonText: { color: colors.text, fontWeight: "600" },
  emptyInbox: { gap: 12 },
  emptyInboxText: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  findPeopleBtn: {
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.control
  },
  findPeopleBtnText: { color: colors.onAccent, fontWeight: "700", fontSize: 14 },
  inboxList: { gap: 0 },
  inboxRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
    gap: 12
  },
  inboxRowActive: {
    backgroundColor: colors.subtleFill,
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: radii.control
  },
  inboxRowAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.subtleFill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle
  },
  inboxRowAvatarText: { fontSize: 18, fontWeight: "700", color: colors.text },
  inboxRowMain: { flex: 1, minWidth: 0 },
  inboxRowTitleLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  inboxRowName: { fontSize: 16, fontWeight: "700", color: colors.text, flex: 1 },
  inboxRowSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  unreadBadge: {
    backgroundColor: colors.accent,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center"
  },
  unreadBadgeText: { color: colors.onAccent, fontSize: 11, fontWeight: "800" },
  chevron: { fontSize: 22, color: colors.muted, fontWeight: "300" },
  threadStack: { gap: 8 },
  message: {
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    padding: 10,
    gap: 4,
    alignSelf: "flex-start",
    maxWidth: "92%"
  },
  messageMine: {
    alignSelf: "flex-end",
    backgroundColor: colors.surface
  },
  muted: { color: colors.muted, fontSize: 12 },
  body: { color: colors.text }
});
