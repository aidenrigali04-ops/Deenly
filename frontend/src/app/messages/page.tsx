"use client";

import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState, Suspense } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { createOrOpenConversation, markConversationRead } from "@/lib/messages";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { UserSearchInput } from "@/components/UserSearchInput";
import { useSessionStore } from "@/store/session-store";

type ConversationItem = {
  conversation_id: number;
  other_user_id: number;
  other_display_name: string;
  other_username: string;
  other_avatar_url: string | null;
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
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

function getDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

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

  const createConversation = useMutation({
    mutationFn: (participantUserId: number) => createOrOpenConversation(participantUserId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["messages-conversations"] });
      setSelectedConversationId(result.conversationId);
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
      const queryKey = ["messages-thread", payload.conversationId] as const;
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<{ items: MessageItem[] }>(queryKey);
      const optimisticMessage: MessageItem = {
        id: -Date.now(),
        sender_id: currentUserId!,
        sender_display_name: "You",
        body: payload.body,
        created_at: new Date().toISOString()
      };
      queryClient.setQueryData<{ items: MessageItem[] }>(queryKey, (old) => ({
        items: [...(old?.items || []), optimisticMessage]
      }));
      setMessageBody("");
      return { previous, queryKey };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
    },
    onSettled: (_data, _error, payload) => {
      queryClient.invalidateQueries({ queryKey: ["messages-thread", payload.conversationId] });
      queryClient.invalidateQueries({ queryKey: ["messages-conversations"] });
    }
  });

  // Build messages with date separators interspersed
  const messagesWithSeparators = useMemo(() => {
    const result: Array<{ type: "message"; message: MessageItem } | { type: "date"; label: string; key: string }> = [];
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
            placeholder="Search conversations"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            aria-label="Search conversations"
          />
          <UserSearchInput
            onSelectUser={(userId) => createConversation.mutate(userId)}
            isPending={createConversation.isPending}
          />
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
                {conversation.other_avatar_url ? (
                  <img
                    src={conversation.other_avatar_url}
                    alt=""
                    className="messages-avatar rounded-full object-cover"
                  />
                ) : (
                  <span className="messages-avatar">{initials}</span>
                )}
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
              {messagesWithSeparators.map((entry) => {
                if (entry.type === "date") {
                  return (
                    <div key={`date-${entry.key}`} className="messages-date-separator">
                      <span>{entry.label}</span>
                    </div>
                  );
                }
                const message = entry.message;
                const isMine = currentUserId ? message.sender_id === currentUserId : false;
                const isOptimistic = message.id < 0;
                return (
                  <div
                    key={message.id}
                    className={`messages-bubble-wrap ${isMine ? "messages-bubble-wrap-mine" : ""}`}
                  >
                    <div className={`messages-bubble ${isMine ? "messages-bubble-mine" : ""} ${isOptimistic ? "opacity-70" : ""}`}>
                      <p className="messages-bubble-author">{message.sender_display_name}</p>
                      <p className="messages-bubble-text">{message.body}</p>
                      <p className="messages-bubble-time">{formatMessageTime(message.created_at)}</p>
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
                  Send
                </button>
              </form>
            </footer>
          </>
        ) : (
          <div className="messages-thread-empty">
            <EmptyState title="Select a conversation" subtitle="Choose one from the left or search for someone to message." />
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
