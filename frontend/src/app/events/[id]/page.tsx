"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { fetchSessionMe } from "@/lib/auth";
import {
  fetchEventChat,
  fetchEventChatModeration,
  fetchEventDetail,
  muteEventChatUser,
  removeEventAttendee,
  reportEventChatUser,
  sendEventChatMessage,
  setEventRsvp
} from "@/lib/events";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const eventId = Number(params?.id);
  const queryClient = useQueryClient();
  const [chatInput, setChatInput] = useState("");

  const eventQuery = useQuery({
    queryKey: ["event-detail", eventId],
    queryFn: () => fetchEventDetail(eventId, "web_detail"),
    enabled: Boolean(eventId)
  });

  const chatQuery = useQuery({
    queryKey: ["event-chat", eventId],
    queryFn: () => fetchEventChat(eventId),
    enabled: Boolean(eventId && eventQuery.data?.canJoinChat)
  });
  const meQuery = useQuery({
    queryKey: ["event-me"],
    queryFn: () => fetchSessionMe()
  });
  const moderationQuery = useQuery({
    queryKey: ["event-moderation", eventId],
    queryFn: () => fetchEventChatModeration(eventId),
    enabled: Boolean(eventId && eventQuery.data?.hostUserId === meQuery.data?.id)
  });

  const rsvpMutation = useMutation({
    mutationFn: (status: "interested" | "going" | "none") => setEventRsvp(eventId, status, "web_detail"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-detail", eventId] });
    }
  });

  const chatMutation = useMutation({
    mutationFn: (body: string) => sendEventChatMessage(eventId, body, "web_detail"),
    onSuccess: () => {
      setChatInput("");
      queryClient.invalidateQueries({ queryKey: ["event-chat", eventId] });
    }
  });
  const muteMutation = useMutation({
    mutationFn: ({ userId, reason }: { userId: number; reason?: string }) =>
      muteEventChatUser(eventId, userId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-moderation", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event-chat", eventId] });
    }
  });
  const removeAttendeeMutation = useMutation({
    mutationFn: ({ userId, reason }: { userId: number; reason?: string }) =>
      removeEventAttendee(eventId, userId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-moderation", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event-chat", eventId] });
    }
  });
  const reportMutation = useMutation({
    mutationFn: ({ userId, reason, note }: { userId: number; reason: string; note?: string }) =>
      reportEventChatUser(eventId, userId, reason, note)
  });

  const startsAtLabel = useMemo(() => {
    if (!eventQuery.data?.startsAt) return "";
    return new Date(eventQuery.data.startsAt).toLocaleString();
  }, [eventQuery.data?.startsAt]);

  const onSendChat = async (event: FormEvent) => {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message) return;
    await chatMutation.mutateAsync(message);
  };

  if (!eventId) {
    return <ErrorState message="Invalid event id." />;
  }
  if (eventQuery.isLoading) {
    return <LoadingState label="Loading event..." />;
  }
  if (eventQuery.error) {
    return <ErrorState message={(eventQuery.error as Error).message} />;
  }
  const data = eventQuery.data;
  if (!data) {
    return <EmptyState title="Event not found" />;
  }
  const isHost = data.hostUserId === meQuery.data?.id;
  const mutedUserIds = new Set((moderationQuery.data?.mutes || []).map((m) => m.user_id));

  return (
    <section className="space-y-4">
      <div className="surface-card space-y-3">
        <p className="text-xs uppercase tracking-wide text-muted">{data.visibility} event</p>
        <h1 className="text-2xl font-semibold leading-tight">{data.title}</h1>
        <p className="text-sm text-muted">Hosted by {data.hostDisplayName || "Creator"} · {startsAtLabel}</p>
        {data.description ? <p className="text-sm leading-relaxed text-text/90">{data.description}</p> : null}
        {data.addressDisplay ? <p className="text-sm text-text/80">Location: {data.addressDisplay}</p> : null}
        {data.onlineUrl ? (
          <a href={data.onlineUrl} target="_blank" rel="noreferrer" className="text-sm text-sky-600 hover:underline">
            Open event link
          </a>
        ) : null}
        <p className="text-xs text-muted">
          {data.rsvpGoingCount} going · {data.rsvpInterestedCount} interested
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => rsvpMutation.mutate("going")} disabled={rsvpMutation.isPending}>
            Going
          </button>
          <button className="btn-secondary" onClick={() => rsvpMutation.mutate("interested")} disabled={rsvpMutation.isPending}>
            Interested
          </button>
          <button className="btn-secondary" onClick={() => rsvpMutation.mutate("none")} disabled={rsvpMutation.isPending}>
            Clear RSVP
          </button>
        </div>
        {rsvpMutation.error ? (
          <p className="text-sm text-rose-700">
            {rsvpMutation.error instanceof ApiError ? rsvpMutation.error.message : "Could not update RSVP."}
          </p>
        ) : null}
      </div>

      <div className="surface-card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Event chat</h2>
          <p className="text-xs text-muted">{data.canJoinChat ? "RSVP-gated chat" : "Set RSVP to Going to join"}</p>
        </div>
        {!data.canJoinChat ? (
          <EmptyState title="Chat locked" subtitle="Switch RSVP to Going to access this chat." />
        ) : (
          <>
            {chatQuery.isLoading ? <LoadingState label="Loading chat..." /> : null}
            {chatQuery.error ? <ErrorState message={(chatQuery.error as Error).message} /> : null}
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-black/10 bg-surface/30 p-3">
              {(chatQuery.data?.items || []).length === 0 ? <p className="text-sm text-muted">No messages yet.</p> : null}
              {(chatQuery.data?.items || []).map((msg) => (
                <div key={msg.id} className="rounded-lg border border-black/10 bg-surface p-2">
                  <p className="text-xs text-muted">{msg.senderDisplayName || "Member"}</p>
                  <p className="text-sm">{msg.body}</p>
                  {isHost && msg.senderUserId !== meQuery.data?.id ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-secondary px-2 py-1 text-xs"
                        onClick={() => {
                          const reason = window.prompt("Mute reason (optional)", "Host moderation");
                          muteMutation.mutate({ userId: msg.senderUserId, reason: reason || undefined });
                        }}
                      >
                        {mutedUserIds.has(msg.senderUserId) ? "Muted" : "Mute"}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary px-2 py-1 text-xs"
                        onClick={() => {
                          const reason = window.prompt("Remove attendee reason (optional)", "Host moderation");
                          removeAttendeeMutation.mutate({ userId: msg.senderUserId, reason: reason || undefined });
                        }}
                      >
                        Remove attendee
                      </button>
                      <button
                        type="button"
                        className="btn-secondary px-2 py-1 text-xs"
                        onClick={() => {
                          const reason = window.prompt("Report reason", "Abusive behavior");
                          if (!reason) return;
                          const note = window.prompt("Extra note (optional)", "") || undefined;
                          reportMutation.mutate({ userId: msg.senderUserId, reason, note });
                        }}
                      >
                        Report
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <form className="flex gap-2" onSubmit={onSendChat}>
              <input
                className="input flex-1"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Message attendees..."
                maxLength={4000}
              />
              <button className="btn-primary" type="submit" disabled={chatMutation.isPending}>
                Send
              </button>
            </form>
          </>
        )}
      </div>
      {isHost ? (
        <div className="surface-card space-y-3">
          <h2 className="text-lg font-semibold">Host moderation audit</h2>
          {moderationQuery.isLoading ? <LoadingState label="Loading moderation logs..." /> : null}
          {moderationQuery.error ? <ErrorState message={(moderationQuery.error as Error).message} /> : null}
          {!moderationQuery.isLoading && !moderationQuery.error ? (
            <>
              <p className="text-xs text-muted">Muted attendees: {moderationQuery.data?.mutes.length || 0}</p>
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-black/10 bg-surface/30 p-3">
                {(moderationQuery.data?.actions || []).length === 0 ? (
                  <p className="text-sm text-muted">No moderation actions yet.</p>
                ) : null}
                {(moderationQuery.data?.actions || []).map((action) => (
                  <div key={action.id} className="rounded-lg border border-black/10 bg-surface p-2 text-xs">
                    <p className="font-medium">
                      {action.action_type} · {action.actor_display_name || "Host"} →{" "}
                      {action.target_display_name || "User"}
                    </p>
                    {action.reason ? <p className="text-muted">{action.reason}</p> : null}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
