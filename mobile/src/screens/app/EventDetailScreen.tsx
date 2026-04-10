import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api";
import { fetchSessionMe } from "../../lib/auth";
import { useSessionStore } from "../../store/session-store";
import { createEventTicketCheckout } from "../../lib/monetization";
import type { EventChatMessage } from "../../lib/events";
import {
  fetchEventChat,
  fetchEventChatModeration,
  fetchEventDetail,
  muteEventChatUser,
  removeEventAttendee,
  reportEventChatUser,
  sendEventChatMessage,
  setEventRsvp,
  unmuteEventChatUser
} from "../../lib/events";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { colors, primaryButtonOutline, radii, shadows } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "EventDetail">;

function formatChatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function EventDetailScreen({ route }: Props) {
  const eventId = route.params.id;
  const inviteToken = route.params.inviteToken?.trim() || undefined;
  const sessionUser = useSessionStore((s) => s.user);
  const queryClient = useQueryClient();
  const [chatInput, setChatInput] = useState("");
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const chatListMaxH = Math.min(Math.round(winH * 0.44), 340);
  const chatScrollRef = useRef<ScrollView>(null);
  const prevMsgCount = useRef(0);

  const eventQuery = useQuery({
    queryKey: ["mobile-event-detail", eventId, inviteToken ?? null],
    queryFn: () => fetchEventDetail(eventId, { source: "mobile_detail", inviteToken })
  });

  const chatQuery = useQuery({
    queryKey: ["mobile-event-chat", eventId, inviteToken ?? null],
    queryFn: () => fetchEventChat(eventId, { inviteToken }),
    enabled: Boolean(eventQuery.data?.canJoinChat)
  });
  const meQuery = useQuery({
    queryKey: ["mobile-event-me"],
    queryFn: () => fetchSessionMe(),
    enabled: Boolean(sessionUser)
  });
  const moderationQuery = useQuery({
    queryKey: ["mobile-event-moderation", eventId],
    queryFn: () => fetchEventChatModeration(eventId),
    enabled: Boolean(eventQuery.data?.hostUserId === meQuery.data?.id)
  });

  const payMutation = useMutation({
    mutationFn: () => createEventTicketCheckout(eventId),
    onSuccess: async (res) => {
      if (res.checkoutUrl) {
        const ok = await Linking.canOpenURL(res.checkoutUrl);
        if (ok) {
          await Linking.openURL(res.checkoutUrl);
        }
      }
    }
  });

  const rsvpMutation = useMutation({
    mutationFn: (status: "interested" | "going" | "none") =>
      setEventRsvp(eventId, status, { source: "mobile_detail", inviteToken }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-event-detail", eventId] });
      queryClient.invalidateQueries({ queryKey: ["mobile-event-chat", eventId] });
    }
  });

  const sendChatMutation = useMutation({
    mutationFn: (body: string) => sendEventChatMessage(eventId, body, { source: "mobile_detail", inviteToken }),
    onSuccess: () => {
      setChatInput("");
      queryClient.invalidateQueries({ queryKey: ["mobile-event-chat", eventId] });
    },
    onError: (e: Error) => {
      const msg = e instanceof ApiError ? e.message : "Message could not be sent.";
      Alert.alert("Could not send", msg);
    }
  });
  const muteMutation = useMutation({
    mutationFn: (userId: number) => muteEventChatUser(eventId, userId, "Host moderation"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-event-chat", eventId] });
      queryClient.invalidateQueries({ queryKey: ["mobile-event-moderation", eventId] });
    }
  });
  const unmuteMutation = useMutation({
    mutationFn: (userId: number) => unmuteEventChatUser(eventId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-event-chat", eventId] });
      queryClient.invalidateQueries({ queryKey: ["mobile-event-moderation", eventId] });
    }
  });
  const removeMutation = useMutation({
    mutationFn: (userId: number) => removeEventAttendee(eventId, userId, "Host moderation"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-event-chat", eventId] });
      queryClient.invalidateQueries({ queryKey: ["mobile-event-moderation", eventId] });
    }
  });
  const reportMutation = useMutation({
    mutationFn: (userId: number) =>
      reportEventChatUser(eventId, userId, "Abusive behavior", "Reported from mobile event detail")
  });

  const items = chatQuery.data?.items ?? [];
  useEffect(() => {
    const n = items.length;
    const grew = n > prevMsgCount.current;
    prevMsgCount.current = n;
    if (chatQuery.isSuccess && (grew || n === 0)) {
      requestAnimationFrame(() => {
        chatScrollRef.current?.scrollToEnd({ animated: grew });
      });
    }
  }, [chatQuery.isSuccess, items.length, chatQuery.dataUpdatedAt]);

  const startsLabel = useMemo(() => {
    if (!eventQuery.data?.startsAt) return "";
    return new Date(eventQuery.data.startsAt).toLocaleString();
  }, [eventQuery.data?.startsAt]);

  if (eventQuery.isLoading) return <LoadingState label="Loading event..." />;
  if (eventQuery.error) return <ErrorState message={(eventQuery.error as Error).message} />;
  const event = eventQuery.data;
  if (!event) return <EmptyState title="Event not found" />;
  const isHost = event.hostUserId === meQuery.data?.id;
  const myId = meQuery.data?.id;
  const mutedUserIds = new Set((moderationQuery.data?.mutes || []).map((m) => m.user_id));
  const admissionMinor = event.admissionPriceMinor != null ? Number(event.admissionPriceMinor) : null;
  const isPaidEvent = Boolean(admissionMinor != null && admissionMinor >= 50);
  const needsPayToGo =
    isPaidEvent &&
    !isHost &&
    Boolean(myId) &&
    !event.viewerHasTicket &&
    event.viewerRsvpStatus !== "going";

  const hostMenuForMessage = (msg: EventChatMessage) => {
    const name = msg.senderDisplayName || "Member";
    const muted = mutedUserIds.has(msg.senderUserId);
    Alert.alert(
      "Attendee options",
      name,
      [
        { text: "Cancel", style: "cancel" },
        muted
          ? {
              text: "Unmute from chat",
              onPress: () => unmuteMutation.mutate(msg.senderUserId)
            }
          : {
              text: "Mute from chat",
              style: "destructive",
              onPress: () => muteMutation.mutate(msg.senderUserId)
            },
        {
          text: "Remove from event",
          style: "destructive",
          onPress: () =>
            Alert.alert("Remove attendee", `Remove ${name} from this event?`, [
              { text: "Cancel", style: "cancel" },
              { text: "Remove", style: "destructive", onPress: () => removeMutation.mutate(msg.senderUserId) }
            ])
        },
        {
          text: "Report to moderation",
          style: "destructive",
          onPress: () =>
            Alert.alert("Report user", "Report this attendee for moderation?", [
              { text: "Cancel", style: "cancel" },
              { text: "Report", style: "destructive", onPress: () => reportMutation.mutate(msg.senderUserId) }
            ])
        }
      ],
      { cancelable: true }
    );
  };

  const sendDisabled = sendChatMutation.isPending || chatInput.trim().length === 0;

  return (
    <KeyboardAvoidingView
      style={styles.flex1}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <ScrollView
        style={styles.flex1}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 12) + 8 }
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.meta}>{event.visibility.toUpperCase()} EVENT</Text>
          {event.viewedWithInviteLink ? (
            <Text style={styles.inviteBanner}>
              You opened this with an invite link. Keep this screen or RSVP so you can return from your events list.
            </Text>
          ) : null}
          {event.viewerInvited ? <Text style={styles.inviteBannerMuted}>You were invited to this event.</Text> : null}
          <Text style={styles.title}>{event.title}</Text>
          <Text style={styles.subtle}>Hosted by {event.hostDisplayName || "Creator"} · {startsLabel}</Text>
          {event.description ? <Text style={styles.body}>{event.description}</Text> : null}
          {event.addressDisplay ? <Text style={styles.subtle}>Location: {event.addressDisplay}</Text> : null}
          <Text style={styles.subtle}>
            {event.rsvpGoingCount} going · {event.rsvpInterestedCount} interested
          </Text>
          {isPaidEvent ? (
            <Text style={styles.body}>
              Admission:{" "}
              {((admissionMinor || 0) / 100).toFixed(2)} {String(event.admissionCurrency || "usd").toUpperCase()}
            </Text>
          ) : null}
          {needsPayToGo ? (
            <View style={{ gap: 8, marginTop: 4 }}>
              <Text style={styles.subtle}>Pay admission to RSVP as Going and unlock chat.</Text>
              <Pressable
                style={styles.primaryBtn}
                onPress={() => payMutation.mutate()}
                disabled={payMutation.isPending}
                accessibilityRole="button"
                accessibilityLabel="Pay for event ticket"
              >
                <Text style={styles.primaryBtnText}>{payMutation.isPending ? "Opening checkout…" : "Pay & register"}</Text>
              </Pressable>
              {payMutation.error ? (
                <Text style={styles.error}>
                  {payMutation.error instanceof ApiError ? payMutation.error.message : "Could not start checkout."}
                </Text>
              ) : null}
            </View>
          ) : null}
          <View style={styles.rsvpRow}>
            <Pressable
              style={[styles.primaryBtn, needsPayToGo ? { opacity: 0.45 } : null]}
              onPress={() => rsvpMutation.mutate("going")}
              disabled={Boolean(needsPayToGo)}
              accessibilityRole="button"
              accessibilityLabel="RSVP going"
            >
              <Text style={styles.primaryBtnText}>Going</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => rsvpMutation.mutate("interested")}
              accessibilityRole="button"
              accessibilityLabel="RSVP interested"
            >
              <Text style={styles.secondaryBtnText}>Interested</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => rsvpMutation.mutate("none")}
              accessibilityRole="button"
              accessibilityLabel="Clear RSVP"
            >
              <Text style={styles.secondaryBtnText}>Clear</Text>
            </Pressable>
          </View>
          {rsvpMutation.error ? (
            <Text style={styles.error}>
              {rsvpMutation.error instanceof ApiError ? rsvpMutation.error.message : "Could not update RSVP."}
            </Text>
          ) : null}
        </View>

        <View style={[styles.card, styles.chatCard]}>
          <View style={styles.chatHeaderRow}>
            <Text style={styles.sectionTitle}>Event chat</Text>
            {event.canJoinChat ? (
              <Text style={styles.chatHint}>Only attendees who RSVP’d Going can post.</Text>
            ) : (
              <Text style={styles.chatHintMuted}>RSVP Going to unlock</Text>
            )}
          </View>
          {!event.canJoinChat ? (
            <EmptyState title="Chat locked" subtitle="Set RSVP to Going to join this chat." />
          ) : (
            <>
              {chatQuery.isLoading ? <LoadingState label="Loading messages…" /> : null}
              {chatQuery.error ? <ErrorState message={(chatQuery.error as Error).message} /> : null}
              <View style={[styles.chatListShell, { maxHeight: chatListMaxH }]}>
                <ScrollView
                  ref={chatScrollRef}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator
                  contentContainerStyle={styles.chatListContent}
                >
                  {items.length === 0 && !chatQuery.isLoading ? (
                    <View style={styles.emptyChat}>
                      <Text style={styles.emptyChatTitle}>Start the conversation</Text>
                      <Text style={styles.emptyChatSub}>Say hello, share updates, or coordinate before the event.</Text>
                    </View>
                  ) : null}
                  {items.map((msg) => {
                    const isOwn = myId != null && msg.senderUserId === myId;
                    const isMsgHost = msg.senderUserId === event.hostUserId;
                    return (
                      <View
                        key={msg.id}
                        style={[styles.msgRow, isOwn ? styles.msgRowOwn : styles.msgRowOther]}
                        accessibilityRole="text"
                      >
                        <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
                          <View style={styles.bubbleMeta}>
                            <View style={styles.bubbleMetaLeft}>
                              <Text style={[styles.bubbleAuthor, isOwn && styles.bubbleAuthorOwn]} numberOfLines={1}>
                                {isOwn ? "You" : msg.senderDisplayName || "Member"}
                              </Text>
                              {isMsgHost ? (
                                <View style={[styles.hostPill, isOwn && styles.hostPillOwn]}>
                                  <Text style={[styles.hostPillText, isOwn && styles.hostPillTextOwn]}>Host</Text>
                                </View>
                              ) : null}
                            </View>
                            <Text style={[styles.bubbleTime, isOwn && styles.bubbleTimeOwn]}>
                              {formatChatTime(msg.createdAt)}
                            </Text>
                          </View>
                          <Text style={[styles.bubbleBody, isOwn && styles.bubbleBodyOwn]}>{msg.body}</Text>
                        </View>
                        {isHost && msg.senderUserId !== myId ? (
                          <Pressable
                            style={styles.moderateLink}
                            onPress={() => hostMenuForMessage(msg)}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel={`Moderate ${msg.senderDisplayName || "attendee"}`}
                          >
                            <Text style={styles.moderateLinkText}>Moderate</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
              <View style={styles.composerWrap}>
                <TextInput
                  style={styles.composerInput}
                  placeholder="Write a message…"
                  placeholderTextColor={colors.muted}
                  value={chatInput}
                  onChangeText={setChatInput}
                  maxLength={4000}
                  multiline
                  editable={!sendChatMutation.isPending}
                  textAlignVertical="top"
                  accessibilityLabel="Event chat message"
                />
                <Pressable
                  style={[styles.sendBtn, sendDisabled && styles.sendBtnDisabled]}
                  onPress={() => {
                    const t = chatInput.trim();
                    if (t) sendChatMutation.mutate(t);
                  }}
                  disabled={sendDisabled}
                  accessibilityRole="button"
                  accessibilityLabel="Send message"
                  accessibilityState={{ disabled: sendDisabled }}
                >
                  <Text style={[styles.sendBtnText, sendDisabled && styles.sendBtnTextDisabled]}>
                    {sendChatMutation.isPending ? "Sending…" : "Send"}
                  </Text>
                </Pressable>
              </View>
              <Text style={styles.charHint}>{chatInput.length}/4000</Text>
            </>
          )}
        </View>
        {isHost ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Host moderation audit</Text>
            {moderationQuery.isLoading ? <LoadingState label="Loading moderation logs..." /> : null}
            {moderationQuery.error ? <ErrorState message={(moderationQuery.error as Error).message} /> : null}
            {!moderationQuery.isLoading && !moderationQuery.error ? (
              <>
                <Text style={styles.subtle}>Muted attendees: {moderationQuery.data?.mutes.length || 0}</Text>
                {(moderationQuery.data?.actions || []).slice(0, 8).map((action) => (
                  <View key={action.id} style={styles.auditRow}>
                    <Text style={styles.auditTitle}>
                      {action.action_type} · {action.actor_display_name || "Host"} →{" "}
                      {action.target_display_name || "User"}
                    </Text>
                    {action.reason ? <Text style={styles.auditReason}>{action.reason}</Text> : null}
                  </View>
                ))}
              </>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  content: { padding: 14, gap: 12 },
  card: {
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 14,
    gap: 8,
    ...shadows.card
  },
  chatCard: { gap: 10 },
  meta: { color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.4 },
  inviteBanner: {
    marginTop: 8,
    padding: 10,
    borderRadius: radii.control,
    backgroundColor: "rgba(14, 165, 233, 0.12)",
    color: colors.text,
    fontSize: 12,
    lineHeight: 16
  },
  inviteBannerMuted: {
    marginTop: 6,
    padding: 8,
    borderRadius: radii.control,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16
  },
  title: { color: colors.text, fontSize: 22, fontWeight: "700" },
  subtle: { color: colors.muted, fontSize: 12 },
  body: { color: colors.text, fontSize: 14, lineHeight: 20 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  chatHeaderRow: { gap: 4, marginBottom: 2 },
  chatHint: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  chatHintMuted: { color: colors.muted, fontSize: 12, opacity: 0.85 },
  rsvpRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  primaryBtn: {
    borderRadius: radii.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...primaryButtonOutline
  },
  primaryBtnText: { color: colors.accent, fontWeight: "700" },
  secondaryBtn: {
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  secondaryBtnText: { color: colors.text, fontWeight: "600" },
  error: { color: colors.danger, fontSize: 12 },
  chatListShell: {
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.subtleFill,
    overflow: "hidden"
  },
  chatListContent: { padding: 10, paddingBottom: 12, gap: 10 },
  emptyChat: { paddingVertical: 20, paddingHorizontal: 8, alignItems: "center" },
  emptyChatTitle: { fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: 4 },
  emptyChatSub: { fontSize: 13, color: colors.muted, textAlign: "center", lineHeight: 18 },
  msgRow: { maxWidth: "100%" },
  msgRowOwn: { alignSelf: "flex-end", alignItems: "flex-end" },
  msgRowOther: { alignSelf: "flex-start", alignItems: "flex-start" },
  bubble: {
    maxWidth: "88%",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  bubbleOwn: {
    backgroundColor: colors.accent,
    borderBottomRightRadius: 4
  },
  bubbleOther: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
    ...shadows.card
  },
  bubbleMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4
  },
  bubbleMetaLeft: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1, flexWrap: "wrap" },
  bubbleAuthor: { fontSize: 11, fontWeight: "700", color: colors.muted, flexShrink: 1 },
  bubbleAuthorOwn: { color: "rgba(255,255,255,0.85)" },
  hostPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.subtleFill
  },
  hostPillText: { fontSize: 10, fontWeight: "700", color: colors.text },
  hostPillOwn: { backgroundColor: "rgba(255,255,255,0.2)" },
  hostPillTextOwn: { color: colors.onAccent },
  bubbleTime: { fontSize: 10, color: colors.muted, flexShrink: 0 },
  bubbleTimeOwn: { color: "rgba(255,255,255,0.7)" },
  bubbleBody: { fontSize: 15, lineHeight: 21, color: colors.text },
  bubbleBodyOwn: { color: colors.onAccent },
  moderateLink: { marginTop: 4, paddingVertical: 4, paddingHorizontal: 2 },
  moderateLinkText: { fontSize: 12, fontWeight: "600", color: colors.muted },
  composerWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    marginTop: 4
  },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    lineHeight: 22
  },
  sendBtn: {
    borderRadius: radii.control,
    paddingHorizontal: 16,
    minHeight: 44,
    ...primaryButtonOutline
  },
  sendBtnDisabled: {
    opacity: 0.45
  },
  sendBtnText: { color: colors.accent, fontWeight: "700", fontSize: 15 },
  sendBtnTextDisabled: { color: colors.muted },
  charHint: { fontSize: 11, color: colors.muted, alignSelf: "flex-end" },
  auditRow: {
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    padding: 10,
    gap: 4
  },
  auditTitle: { fontSize: 12, fontWeight: "600", color: colors.text },
  auditReason: { fontSize: 12, color: colors.muted }
});
