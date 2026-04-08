"use client";

import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState, Suspense } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { createOrOpenConversation, markConversationRead } from "@/lib/messages";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { useSessionStore } from "@/store/session-store";

type ConversationItem = {
  conversation_id: number;
  other_user_id: number;
  other_display_name: string;
  other_username: string;
  last_message_body: string | null;
  unread_count: number;
};

type MessageItem = {
  id: number;
  sender_id: number;
  sender_display_name: string;
  body: string;
  created_at: string;
};

function MessagesPageInner() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUserId = useSessionStore((state) => state.user?.id || null);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const withUserIdRaw = searchParams.get("with");
  const withUserId = withUserIdRaw ? Number(withUserIdRaw) : NaN;
  const openConversationParam = searchParams.get("conversation");
  const openConversationId = openConversationParam ? Number(openConversationParam) : NaN;

  useEffect(() => {
    if (!Number.isFinite(openConversationId) || openConversationId <= 0) return;
    setSelectedConversationId(openConversationId);
    router.replace("/messages", { scroll: false });
  }, [openConversationId, router]);

  useEffect(() => {
    if (!currentUserId) return;
    if (!Number.isFinite(withUserId) || withUserId <= 0) return;
    if (withUserId === currentUserId) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await createOrOpenConversation(withUserId);
        if (cancelled) return;
        setSelectedConversationId(result.conversationId);
        router.replace("/messages", { scroll: false });
      } catch {
        /* user may be blocked or invalid id */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [withUserId, currentUserId, router]);

  const conversationsQuery = useQuery({
    queryKey: ["messages-conversations"],
    queryFn: () => apiRequest<{ items: ConversationItem[] }>("/messages/conversations?limit=25", { auth: true })
  });

  const selectedConversation = useMemo(
    () => conversationsQuery.data?.items.find((item) => item.conversation_id === selectedConversationId) || null,
    [conversationsQuery.data, selectedConversationId]
  );
  const visibleConversations = useMemo(() => {
    const items = conversationsQuery.data?.items || [];
    const q = searchTerm.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      return (
        item.other_display_name.toLowerCase().includes(q) ||
        item.other_username.toLowerCase().includes(q) ||
        (item.last_message_body || "").toLowerCase().includes(q)
      );
    });
  }, [conversationsQuery.data, searchTerm]);

  const messagesQuery = useQuery({
    queryKey: ["messages-thread", selectedConversationId],
    queryFn: () =>
      apiRequest<{ items: MessageItem[] }>(
        `/messages/conversations/${selectedConversationId}/messages?limit=50`,
        { auth: true }
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
      queryClient.invalidateQueries({ queryKey: ["messages-conversations"] });
    });
  }, [selectedConversationId, messagesQuery.data?.items, queryClient]);

  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedConversationId, orderedMessages.length]);

  const sendMessage = useMutation({
    mutationFn: (payload: { conversationId: number; body: string }) =>
      apiRequest(`/messages/conversations/${payload.conversationId}/messages`, {
        method: "POST",
        auth: true,
        body: { body: payload.body }
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages-thread", selectedConversationId] });
      queryClient.invalidateQueries({ queryKey: ["messages-conversations"] });
      setMessageBody("");
    }
  });

  return (
    <section className="messages-shell">
      <aside className="messages-sidebar">
        <header className="messages-sidebar-header">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-semibold">Messages</h1>
          </div>
          <p className="text-xs text-muted">Direct messages with other members.</p>
          <input
            className="messages-search"
            placeholder="Search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            aria-label="Search conversations"
          />
          <Link
            href="/search"
            className="inline-flex w-full items-center justify-center rounded-control border border-black/10 bg-surface px-3 py-2 text-sm font-semibold text-text hover:bg-black/[0.02]"
          >
            Find people
          </Link>
        </header>

        <div className="messages-conversation-list">
          {conversationsQuery.isLoading ? <LoadingState label="Loading conversations..." /> : null}
          {conversationsQuery.error ? <ErrorState message={(conversationsQuery.error as Error).message} /> : null}
          {visibleConversations.map((conversation) => {
            const initials =
              conversation.other_display_name
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((entry) => entry[0]?.toUpperCase())
                .join("") || "U";

            return (
              <button
                key={conversation.conversation_id}
                type="button"
                className={`messages-conversation-item ${
                  selectedConversationId === conversation.conversation_id ? "messages-conversation-item-active" : ""
                }`}
                onClick={() => setSelectedConversationId(conversation.conversation_id)}
              >
                <span className="messages-avatar">{initials}</span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="messages-conversation-name">{conversation.other_display_name}</span>
                  <span className="messages-conversation-preview">
                    {conversation.last_message_body || `@${conversation.other_username}`}
                  </span>
                </span>
                {conversation.unread_count > 0 ? (
                  <span className="messages-unread-dot" aria-label={`${conversation.unread_count} unread messages`} />
                ) : null}
              </button>
            );
          })}
          {!conversationsQuery.isLoading && !conversationsQuery.error && visibleConversations.length === 0 ? (
            <EmptyState title="No conversations yet" />
          ) : null}
        </div>
      </aside>

      <article className="messages-thread-shell">
        {selectedConversation ? (
          <>
            <header className="messages-thread-header">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold">{selectedConversation.other_display_name}</h2>
                <p className="truncate text-xs text-muted">@{selectedConversation.other_username}</p>
              </div>
            </header>

            <div className="messages-thread-body">
              {messagesQuery.isLoading ? <LoadingState label="Loading messages..." /> : null}
              {messagesQuery.error ? <ErrorState message={(messagesQuery.error as Error).message} /> : null}
              {orderedMessages.map((message) => {
                const isMine = currentUserId ? message.sender_id === currentUserId : false;
                return (
                  <div
                    key={message.id}
                    className={`messages-bubble-wrap ${isMine ? "messages-bubble-wrap-mine" : ""}`}
                  >
                    <div className={`messages-bubble ${isMine ? "messages-bubble-mine" : ""}`}>
                      <p className="messages-bubble-author">{message.sender_display_name}</p>
                      <p className="messages-bubble-text">{message.body}</p>
                    </div>
                  </div>
                );
              })}
              {!messagesQuery.isLoading && !messagesQuery.error && orderedMessages.length === 0 ? (
                <EmptyState title="No messages yet" />
              ) : null}
              <div ref={bottomRef} />
            </div>

            <footer className="messages-composer">
              <form
                className="flex gap-2"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  if (!selectedConversationId || !messageBody.trim()) return;
                  sendMessage.mutate({ conversationId: selectedConversationId, body: messageBody.trim() });
                }}
              >
                <input
                  className="messages-compose-input"
                  placeholder="Message..."
                  value={messageBody}
                  onChange={(event) => setMessageBody(event.target.value)}
                  aria-label="Type message"
                />
                <button className="messages-icon-btn" type="submit" disabled={sendMessage.isPending}>
                  {sendMessage.isPending ? "..." : "Send"}
                </button>
              </form>
            </footer>
          </>
        ) : (
          <div className="messages-thread-empty">
            <EmptyState
              title="Select a conversation"
              subtitle="Choose one from the list, open a chat from a profile, or find someone in Search."
            />
          </div>
        )}
      </article>
    </section>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading messages…" />}>
      <MessagesPageInner />
    </Suspense>
  );
}
