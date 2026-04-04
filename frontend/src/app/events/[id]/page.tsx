"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
  setEventRsvp,
  unmuteEventChatUser
} from "@/lib/events";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";

function formatChatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const eventId = Number(params?.id);
  const queryClient = useQueryClient();
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

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
      queryClient.invalidateQueries({ queryKey: ["event-chat", eventId] });
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
  const unmuteMutation = useMutation({
    mutationFn: (userId: number) => unmuteEventChatUser(eventId, userId),
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

  const items = chatQuery.data?.items ?? [];
  useEffect(() => {
    if (!chatQuery.isSuccess || items.length === 0) return;
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatQuery.isSuccess, items.length, chatQuery.dataUpdatedAt]);

  const startsAtLabel = useMemo(() => {
    if (!eventQuery.data?.startsAt) return "";
    return new Date(eventQuery.data.startsAt).toLocaleString();
  }, [eventQuery.data?.startsAt]);

  const onSendChat = async (event: FormEvent) => {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message || chatMutation.isPending) return;
    try {
      await chatMutation.mutateAsync(message);
    } catch {
      /* mutation error surfaced via isError if we add toast later */
    }
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
  const myId = meQuery.data?.id;
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

      <div className="surface-card flex flex-col gap-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <h2 className="text-lg font-semibold">Event chat</h2>
          <p className="text-xs leading-snug text-muted sm:max-w-xs sm:text-right">
            {data.canJoinChat
              ? "Only attendees who RSVP’d Going can read and post here."
              : "Switch RSVP to Going to unlock chat."}
          </p>
        </div>
        {!data.canJoinChat ? (
          <EmptyState title="Chat locked" subtitle="Switch RSVP to Going to access this chat." />
        ) : (
          <>
            {chatQuery.isLoading ? <LoadingState label="Loading messages…" /> : null}
            {chatQuery.error ? <ErrorState message={(chatQuery.error as Error).message} /> : null}
            <div
              className="max-h-[min(52vh,26rem)] space-y-3 overflow-y-auto overscroll-contain rounded-control border border-black/10 bg-black/[0.03] p-3 scroll-smooth"
              role="log"
              aria-label="Event chat messages"
              aria-live="polite"
            >
              {items.length === 0 && !chatQuery.isLoading ? (
                <div className="rounded-control border border-dashed border-black/15 bg-surface/80 px-4 py-8 text-center">
                  <p className="text-sm font-semibold text-text">Start the conversation</p>
                  <p className="mt-1 text-sm text-muted">Say hello, share updates, or coordinate before the event.</p>
                </div>
              ) : null}
              {items.map((msg) => {
                const isOwn = myId != null && msg.senderUserId === myId;
                const isMsgHost = msg.senderUserId === data.hostUserId;
                return (
                  <div
                    key={msg.id}
                    className={`flex w-full flex-col gap-1 ${isOwn ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`max-w-[min(100%,28rem)] rounded-2xl px-3.5 py-2.5 ${
                        isOwn
                          ? "rounded-br-md bg-black text-white"
                          : "rounded-bl-md border border-black/10 bg-surface shadow-soft"
                      }`}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                        <span className={isOwn ? "text-white/90" : "text-muted"}>
                          {isOwn ? "You" : msg.senderDisplayName || "Member"}
                        </span>
                        {isMsgHost ? (
                          <span
                            className={`rounded-pill px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                              isOwn ? "bg-white/20 text-white" : "bg-black/[0.06] text-text"
                            }`}
                          >
                            Host
                          </span>
                        ) : null}
                        <span className={`ml-auto tabular-nums ${isOwn ? "text-white/70" : "text-muted"}`}>
                          {formatChatTime(msg.createdAt)}
                        </span>
                      </div>
                      <p className={`whitespace-pre-wrap text-sm leading-relaxed ${isOwn ? "text-white" : "text-text"}`}>
                        {msg.body}
                      </p>
                    </div>
                    {isHost && msg.senderUserId !== myId ? (
                      <details className="group text-xs">
                        <summary className="cursor-pointer select-none font-semibold text-muted underline decoration-black/20 underline-offset-2 hover:text-text">
                          Moderate attendee
                        </summary>
                        <div className="mt-2 flex flex-wrap gap-2 rounded-control border border-black/10 bg-surface p-2">
                          <button
                            type="button"
                            className="btn-secondary px-2 py-1.5 text-xs"
                            disabled={muteMutation.isPending || unmuteMutation.isPending}
                            onClick={() => {
                              if (mutedUserIds.has(msg.senderUserId)) {
                                unmuteMutation.mutate(msg.senderUserId);
                              } else {
                                const reason = window.prompt("Mute reason (optional)", "Host moderation");
                                muteMutation.mutate({ userId: msg.senderUserId, reason: reason || undefined });
                              }
                            }}
                          >
                            {mutedUserIds.has(msg.senderUserId) ? "Unmute from chat" : "Mute from chat"}
                          </button>
                          <button
                            type="button"
                            className="btn-secondary px-2 py-1.5 text-xs"
                            disabled={removeAttendeeMutation.isPending}
                            onClick={() => {
                              if (!window.confirm(`Remove ${msg.senderDisplayName || "this attendee"} from the event?`)) {
                                return;
                              }
                              const reason = window.prompt("Reason (optional)", "Host moderation");
                              removeAttendeeMutation.mutate({ userId: msg.senderUserId, reason: reason || undefined });
                            }}
                          >
                            Remove from event
                          </button>
                          <button
                            type="button"
                            className="btn-secondary px-2 py-1.5 text-xs"
                            disabled={reportMutation.isPending}
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
                      </details>
                    ) : null}
                  </div>
                );
              })}
              <div ref={chatEndRef} className="h-px w-full shrink-0" aria-hidden />
            </div>
            <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={onSendChat}>
              <label className="sr-only" htmlFor="event-chat-input">
                Message attendees
              </label>
              <textarea
                id="event-chat-input"
                className="input min-h-[44px] flex-1 resize-y py-2.5"
                rows={2}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Write a message to attendees…"
                maxLength={4000}
                disabled={chatMutation.isPending}
                aria-busy={chatMutation.isPending}
              />
              <button
                className="btn-primary h-11 shrink-0 px-5 sm:self-stretch"
                type="submit"
                disabled={chatMutation.isPending || chatInput.trim().length === 0}
                aria-label="Send chat message"
              >
                {chatMutation.isPending ? "Sending…" : "Send"}
              </button>
            </form>
            <p className="text-right text-[11px] text-muted tabular-nums">{chatInput.length} / 4000</p>
            {chatMutation.isError ? (
              <p className="text-sm text-rose-700" role="alert">
                {(chatMutation.error as Error).message || "Message could not be sent."}
              </p>
            ) : null}
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
              <div className="max-h-56 space-y-2 overflow-y-auto overscroll-contain rounded-control border border-black/10 bg-black/[0.03] p-3">
                {(moderationQuery.data?.actions || []).length === 0 ? (
                  <p className="text-sm text-muted">No moderation actions yet.</p>
                ) : null}
                {(moderationQuery.data?.actions || []).map((action) => (
                  <div key={action.id} className="rounded-control border border-black/10 bg-surface p-2.5 text-xs shadow-soft">
                    <p className="font-medium text-text">
                      {action.action_type} · {action.actor_display_name || "Host"} →{" "}
                      {action.target_display_name || "User"}
                    </p>
                    {action.reason ? <p className="mt-1 text-muted">{action.reason}</p> : null}
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
