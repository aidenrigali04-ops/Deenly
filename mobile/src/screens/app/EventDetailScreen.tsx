import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api";
import { fetchSessionMe } from "../../lib/auth";
import {
  fetchEventChat,
  fetchEventChatModeration,
  fetchEventDetail,
  muteEventChatUser,
  removeEventAttendee,
  reportEventChatUser,
  sendEventChatMessage,
  setEventRsvp
} from "../../lib/events";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { colors, radii } from "../../theme";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "EventDetail">;

export function EventDetailScreen({ route }: Props) {
  const eventId = route.params.id;
  const queryClient = useQueryClient();
  const [chatInput, setChatInput] = useState("");

  const eventQuery = useQuery({
    queryKey: ["mobile-event-detail", eventId],
    queryFn: () => fetchEventDetail(eventId, "mobile_detail")
  });

  const chatQuery = useQuery({
    queryKey: ["mobile-event-chat", eventId],
    queryFn: () => fetchEventChat(eventId),
    enabled: Boolean(eventQuery.data?.canJoinChat)
  });
  const meQuery = useQuery({
    queryKey: ["mobile-event-me"],
    queryFn: () => fetchSessionMe()
  });
  const moderationQuery = useQuery({
    queryKey: ["mobile-event-moderation", eventId],
    queryFn: () => fetchEventChatModeration(eventId),
    enabled: Boolean(eventQuery.data?.hostUserId === meQuery.data?.id)
  });

  const rsvpMutation = useMutation({
    mutationFn: (status: "interested" | "going" | "none") => setEventRsvp(eventId, status, "mobile_detail"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-event-detail", eventId] });
      queryClient.invalidateQueries({ queryKey: ["mobile-event-chat", eventId] });
    }
  });

  const sendChatMutation = useMutation({
    mutationFn: (body: string) => sendEventChatMessage(eventId, body, "mobile_detail"),
    onSuccess: () => {
      setChatInput("");
      queryClient.invalidateQueries({ queryKey: ["mobile-event-chat", eventId] });
    }
  });
  const muteMutation = useMutation({
    mutationFn: (userId: number) => muteEventChatUser(eventId, userId, "Host moderation"),
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

  const startsLabel = useMemo(() => {
    if (!eventQuery.data?.startsAt) return "";
    return new Date(eventQuery.data.startsAt).toLocaleString();
  }, [eventQuery.data?.startsAt]);

  if (eventQuery.isLoading) return <LoadingState label="Loading event..." />;
  if (eventQuery.error) return <ErrorState message={(eventQuery.error as Error).message} />;
  const event = eventQuery.data;
  if (!event) return <EmptyState title="Event not found" />;
  const isHost = event.hostUserId === meQuery.data?.id;
  const mutedUserIds = new Set((moderationQuery.data?.mutes || []).map((m) => m.user_id));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.meta}>{event.visibility.toUpperCase()} EVENT</Text>
        <Text style={styles.title}>{event.title}</Text>
        <Text style={styles.subtle}>Hosted by {event.hostDisplayName || "Creator"} · {startsLabel}</Text>
        {event.description ? <Text style={styles.body}>{event.description}</Text> : null}
        {event.addressDisplay ? <Text style={styles.subtle}>Location: {event.addressDisplay}</Text> : null}
        <Text style={styles.subtle}>{event.rsvpGoingCount} going · {event.rsvpInterestedCount} interested</Text>
        <View style={styles.rsvpRow}>
          <Pressable style={styles.primaryBtn} onPress={() => rsvpMutation.mutate("going")}>
            <Text style={styles.primaryBtnText}>Going</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => rsvpMutation.mutate("interested")}>
            <Text style={styles.secondaryBtnText}>Interested</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => rsvpMutation.mutate("none")}>
            <Text style={styles.secondaryBtnText}>Clear</Text>
          </Pressable>
        </View>
        {rsvpMutation.error ? (
          <Text style={styles.error}>
            {rsvpMutation.error instanceof ApiError ? rsvpMutation.error.message : "Could not update RSVP."}
          </Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Event chat</Text>
        {!event.canJoinChat ? (
          <EmptyState title="Chat locked" subtitle="Set RSVP to Going to join this chat." />
        ) : (
          <>
            {chatQuery.isLoading ? <LoadingState label="Loading chat..." /> : null}
            {chatQuery.error ? <ErrorState message={(chatQuery.error as Error).message} /> : null}
            <View style={styles.chatBox}>
              {(chatQuery.data?.items || []).length === 0 ? <Text style={styles.subtle}>No messages yet.</Text> : null}
              {(chatQuery.data?.items || []).map((msg) => (
                <View key={msg.id} style={styles.chatMessage}>
                  <Text style={styles.chatAuthor}>{msg.senderDisplayName || "Member"}</Text>
                  <Text style={styles.chatBody}>{msg.body}</Text>
                  {isHost && msg.senderUserId !== meQuery.data?.id ? (
                    <View style={styles.hostRow}>
                      <Pressable style={styles.secondaryBtn} onPress={() => muteMutation.mutate(msg.senderUserId)}>
                        <Text style={styles.secondaryBtnText}>
                          {mutedUserIds.has(msg.senderUserId) ? "Muted" : "Mute"}
                        </Text>
                      </Pressable>
                      <Pressable style={styles.secondaryBtn} onPress={() => removeMutation.mutate(msg.senderUserId)}>
                        <Text style={styles.secondaryBtnText}>Remove</Text>
                      </Pressable>
                      <Pressable
                        style={styles.secondaryBtn}
                        onPress={() =>
                          Alert.alert("Report user", "Report this attendee for moderation?", [
                            { text: "Cancel", style: "cancel" },
                            { text: "Report", style: "destructive", onPress: () => reportMutation.mutate(msg.senderUserId) }
                          ])
                        }
                      >
                        <Text style={styles.secondaryBtnText}>Report</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
            <View style={styles.chatInputRow}>
              <TextInput
                style={[styles.input, styles.chatInput]}
                placeholder="Send a message..."
                placeholderTextColor={colors.muted}
                value={chatInput}
                onChangeText={setChatInput}
                maxLength={4000}
              />
              <Pressable
                style={styles.primaryBtn}
                onPress={() => sendChatMutation.mutate(chatInput.trim())}
                disabled={sendChatMutation.isPending || chatInput.trim().length === 0}
              >
                <Text style={styles.primaryBtnText}>Send</Text>
              </Pressable>
            </View>
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
                <View key={action.id} style={styles.chatMessage}>
                  <Text style={styles.chatAuthor}>
                    {action.action_type} · {action.actor_display_name || "Host"} {"->"}{" "}
                    {action.target_display_name || "User"}
                  </Text>
                  {action.reason ? <Text style={styles.chatBody}>{action.reason}</Text> : null}
                </View>
              ))}
            </>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, gap: 10, paddingBottom: 36 },
  card: {
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 12,
    gap: 8
  },
  meta: { color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.4 },
  title: { color: colors.text, fontSize: 22, fontWeight: "700" },
  subtle: { color: colors.muted, fontSize: 12 },
  body: { color: colors.text, fontSize: 14, lineHeight: 20 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  rsvpRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  input: {
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    padding: 10
  },
  primaryBtn: {
    borderRadius: radii.control,
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  primaryBtnText: { color: colors.onAccent, fontWeight: "700" },
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
  chatBox: {
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 8,
    gap: 6
  },
  chatMessage: {
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 8
  },
  chatAuthor: { color: colors.muted, fontSize: 11, marginBottom: 2 },
  chatBody: { color: colors.text, fontSize: 13 },
  chatInputRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  chatInput: { flex: 1 },
  hostRow: { marginTop: 6, flexDirection: "row", gap: 6, flexWrap: "wrap" }
});
