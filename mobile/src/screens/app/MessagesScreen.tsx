import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CompositeScreenProps, useRoute, type RouteProp } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api";
import { createOrOpenConversation, markConversationRead } from "../../lib/messages";
import { ErrorState, LoadingState } from "../../components/States";
import { SectionCard, TabScreenRoot } from "../../components/TabScreenChrome";
import { colors, radii, resolveFigmaMobile, spacing } from "../../theme";
import { useAppChrome } from "../../lib/use-app-chrome";
import { useTabSceneBottomPadding, useTabSceneTopPadding } from "../../hooks/useTabSceneInsets";
import type { AppTabParamList, RootStackParamList } from "../../navigation/AppNavigator";
import { useSessionStore } from "../../store/session-store";

type ConversationItem = {
  conversation_id: number;
  other_display_name: string;
  other_username: string;
  unread_count: number;
  last_message_body?: string | null;
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
  const { figma } = useAppChrome();
  const styles = useMemo(() => buildMessagesStyles(figma), [figma]);
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
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Messages</Text>
          <Text style={styles.heroSubtitle}>Direct messages with other members.</Text>
          <TextInput
            style={styles.chromeSearch}
            placeholder="Search"
            placeholderTextColor={figma.messagesChromePlaceholder}
            autoCapitalize="none"
            autoCorrect={false}
            value={usernameLookupInput}
            onChangeText={setUsernameLookupInput}
            onSubmitEditing={() => usernameLookupMutation.mutate(usernameLookupInput)}
            returnKeyType="search"
          />
          <Pressable
            style={styles.findPeopleChrome}
            onPress={() => {
              const parent = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
              parent?.navigate("Discover", { focusSearch: true });
            }}
            accessibilityRole="button"
            accessibilityLabel="Find people"
          >
            <Text style={styles.findPeopleChromeText}>Find people</Text>
          </Pressable>
          {usernameLookupMutation.isError ? (
            <Text style={styles.lookupError}>{(usernameLookupMutation.error as Error).message}</Text>
          ) : null}
          {usernameLookupMutation.isSuccess ? (
            usernameLookupRows.length === 0 ? (
              <Text style={styles.searchHelper}>No users match that search.</Text>
            ) : (
              <View style={styles.lookupList}>
                {usernameLookupRows.map((row) => (
                  <Pressable
                    key={row.user_id}
                    style={({ pressed }) => [styles.lookupRow, pressed && styles.rowPressed]}
                    onPress={() => createConversation.mutate(row.user_id)}
                    disabled={createConversation.isPending}
                    android_ripple={{ color: "rgba(255,255,255,0.08)" }}
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
        </View>

        <View style={styles.sectionDivider} />

        {conversationsQuery.isLoading ? <LoadingState label="Loading conversations..." surface="dark" /> : null}
        {conversationsQuery.error ? (
          <ErrorState message={(conversationsQuery.error as Error).message} surface="dark" />
        ) : null}

        <View style={styles.inboxSection}>
          {inboxEmpty ? (
            <View style={styles.emptyInbox}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="chatbubbles-outline" size={28} color={figma.accentGold} />
              </View>
              <Text style={styles.emptyInboxTitle}>No conversations yet</Text>
              <Text style={styles.emptyInboxText}>Start a chat from Discover, or open Marketplace on Home.</Text>
              <Pressable
                style={styles.findPeopleBtn}
                onPress={() => {
                  const parent = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
                  parent?.navigate("Discover", { focusSearch: true });
                }}
              >
                <Text style={styles.findPeopleBtnText}>Find people</Text>
              </Pressable>
              <Pressable style={styles.browseMarketLink} onPress={() => navigation.navigate("HomeTab", { openMarketplace: true })}>
                <Text style={styles.browseMarketLinkText}>Browse Marketplace</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.inboxList}>
              {conversations.map((item) => {
                const preview =
                  typeof item.last_message_body === "string" && item.last_message_body.trim()
                    ? item.last_message_body.trim()
                    : "Start the conversation";
                return (
                  <Pressable
                    key={item.conversation_id}
                    style={({ pressed }) => [
                      styles.inboxRow,
                      selectedConversationId === item.conversation_id ? styles.inboxRowActive : null,
                      pressed && styles.rowPressed
                    ]}
                    onPress={() => setSelectedConversationId(item.conversation_id)}
                    android_ripple={{ color: "rgba(255,255,255,0.06)" }}
                  >
                    <View style={styles.inboxRowAvatar} />
                    <View style={styles.inboxRowMain}>
                      <View style={styles.inboxRowTitleLine}>
                        <Text style={styles.inboxRowName} numberOfLines={1}>
                          {item.other_display_name || item.other_username}
                        </Text>
                        {item.unread_count > 0 ? (
                          <View style={styles.unreadBadge}>
                            <Text style={styles.unreadBadgeText}>
                              {item.unread_count > 99 ? "99+" : item.unread_count}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.inboxRowPreview} numberOfLines={1}>
                        {preview}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {selectedConversation ? (
          <SectionCard title={`Chat · ${selectedConversation.other_display_name}`}>
            {messagesQuery.isLoading ? <LoadingState label="Loading messages..." surface="dark" /> : null}
            {messagesQuery.error ? <ErrorState message={(messagesQuery.error as Error).message} surface="dark" /> : null}
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
              placeholderTextColor={figma.textMuted}
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

function buildMessagesStyles(fig: ReturnType<typeof resolveFigmaMobile>) {
  return StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { gap: spacing.tight },
  hero: {
    marginHorizontal: spacing.pagePaddingH,
    gap: 14,
    paddingBottom: 4
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: "700",
    color: fig.text,
    letterSpacing: -0.6,
    lineHeight: 36
  },
  heroSubtitle: {
    fontSize: 15,
    lineHeight: 21,
    color: fig.textMuted,
    fontWeight: "400",
    letterSpacing: -0.2
  },
  chromeSearch: {
    backgroundColor: fig.messagesChrome,
    borderRadius: radii.pill,
    minHeight: 52,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 16,
    color: fig.messagesChromeText,
    fontWeight: "400"
  },
  findPeopleChrome: {
    backgroundColor: fig.messagesChrome,
    borderRadius: radii.pill,
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center"
  },
  findPeopleChromeText: {
    color: fig.messagesChromeText,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: fig.glassBorder,
    marginTop: 8,
    marginBottom: 4,
    marginHorizontal: spacing.pagePaddingH
  },
  inboxSection: {
    marginHorizontal: spacing.pagePaddingH,
    paddingBottom: 8
  },
  searchHelper: {
    fontSize: 13,
    color: fig.textMuted,
    lineHeight: 18
  },
  lookupError: { color: colors.danger, fontSize: 13, marginTop: 8 },
  lookupList: {
    marginTop: 10,
    gap: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: fig.glassBorder,
    borderRadius: radii.feedCard,
    overflow: "hidden",
    backgroundColor: fig.card
  },
  lookupRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: fig.glassBorder,
    backgroundColor: fig.card
  },
  rowPressed: { backgroundColor: "rgba(255,255,255,0.06)" },
  lookupRowName: { fontSize: 15, fontWeight: "700", color: fig.text },
  lookupRowSub: { fontSize: 12, color: fig.textMuted2, marginTop: 2 },
  input: {
    borderColor: fig.glassBorder,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    color: fig.text,
    backgroundColor: fig.glassSoft,
    padding: 14,
    fontSize: 16
  },
  buttonSecondary: {
    borderColor: fig.glassBorder,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: "flex-start",
    backgroundColor: fig.glassSoft
  },
  buttonText: { color: fig.text, fontWeight: "600" },
  emptyInbox: { gap: 12, alignItems: "center", paddingVertical: 8 },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: fig.glassSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4
  },
  emptyInboxTitle: { fontSize: 18, fontWeight: "600", color: fig.text },
  emptyInboxText: { color: fig.textMuted, fontSize: 14, lineHeight: 21, textAlign: "center" },
  findPeopleBtn: {
    alignSelf: "stretch",
    marginTop: 4,
    backgroundColor: fig.messagesChrome,
    borderRadius: radii.pill,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20
  },
  findPeopleBtnText: {
    color: fig.messagesChromeText,
    fontWeight: "700",
    fontSize: 16
  },
  browseMarketLink: { paddingVertical: 8 },
  browseMarketLinkText: { fontSize: 15, fontWeight: "500", color: fig.textMuted },
  inboxList: { gap: 0 },
  inboxRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: fig.glassBorder,
    gap: 12
  },
  inboxRowActive: {
    backgroundColor: fig.glassSoft
  },
  inboxRowAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: fig.messagesChrome
  },
  inboxRowMain: { flex: 1, minWidth: 0 },
  inboxRowTitleLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  inboxRowName: {
    fontSize: 15,
    fontWeight: "400",
    color: fig.textMuted,
    flex: 1
  },
  inboxRowPreview: {
    fontSize: 15,
    fontWeight: "600",
    color: fig.text,
    marginTop: 4
  },
  unreadBadge: {
    backgroundColor: fig.brandTeal,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center"
  },
  unreadBadgeText: { color: colors.onAccent, fontSize: 11, fontWeight: "800" },
  threadStack: { gap: 8 },
  message: {
    borderWidth: 0,
    borderRadius: radii.control + 2,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 4,
    alignSelf: "flex-start",
    maxWidth: "92%",
    backgroundColor: fig.glassSoft
  },
  messageMine: {
    alignSelf: "flex-end",
    backgroundColor: fig.glass
  },
  muted: { color: fig.textMuted, fontSize: 12 },
  body: { color: fig.text }
  });
}
