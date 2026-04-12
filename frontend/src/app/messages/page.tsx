"use client";

import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState, Suspense } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import {
  createOrOpenConversation,
  markConversationRead,
  editMessage,
  deleteMessage,
  archiveConversation,
  unarchiveConversation,
  getReadStatus
} from "@/lib/messages";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { UserSearchInput } from "@/components/UserSearchInput";
import { useSessionStore } from "@/store/session-store";
import { usePageVisibility } from "@/hooks/use-page-visibility";

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
  body: string | null;
  created_at: string;
  edited_at?: string | null;
  is_unsent?: boolean;
};

const EDIT_WINDOW_MS = 15 * 60 * 1000;
const UNSEND_WINDOW_MS = 5 * 60 * 1000;

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

function canEdit(msg: MessageItem): boolean {
  return Date.now() - new Date(msg.created_at).getTime() < EDIT_WINDOW_MS;
}

function canUnsend(msg: MessageItem): boolean {
  return Date.now() - new Date(msg.created_at).getTime() < UNSEND_WINDOW_MS;
}

function MessagesPageInner() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUserId = useSessionStore((state) => state.user?.id || null);
  const pageVisible = usePageVisibility();
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");
  const [contextMenuId, setContextMenuId] = useState<number | null>(null);
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
    queryKey: ["messages-conversations", showArchived],
    queryFn: () => apiRequest<{ items: ConversationItem[] }>(
      `/messages/conversations?limit=25${showArchived ? "&archived=true" : ""}`,
      { auth: true }
    ),
    refetchInterval: pageVisible ? 10_000 : false,
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
    enabled: Boolean(selectedConversationId),
    refetchInterval: pageVisible && selectedConversationId ? 3_000 : false,
  });

  const readStatusQuery = useQuery({
    queryKey: ["messages-read-status", selectedConversationId],
    queryFn: () => getReadStatus(selectedConversationId!),
    enabled: Boolean(selectedConversationId),
    refetchInterval: pageVisible && selectedConversationId ? 5_000 : false,
  });

  const peerLastReadId = readStatusQuery.data?.lastReadMessageId ?? null;

  const orderedMessages = useMemo(() => {
    const list = messagesQuery.data?.items || [];
    return [...list].sort((a, b) => a.id - b.id);
  }, [messagesQuery.data?.items]);

  useEffect(() => {
    if (!selectedConversationId || !messagesQuery.data?.items?.length) return;
    const maxId = Math.max(...messagesQuery.data.items.map((m) => m.id));
    void markConversationRead(selectedConversationId, maxId).then(() => {
      queryClient.invalidateQueries({ queryKey: ["messages-conversations", false] });
    });
  }, [selectedConversationId, messagesQuery.data?.items, queryClient]);

  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedConversationId, orderedMessages.length]);

  const createConversation = useMutation({
    mutationFn: (participantUserId: number) => createOrOpenConversation(participantUserId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["messages-conversations", false] });
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
      queryClient.invalidateQueries({ queryKey: ["messages-conversations", false] });
    }
  });

  const editMutation = useMutation({
    mutationFn: (p: { conversationId: number; messageId: number; body: string }) =>
      editMessage(p.conversationId, p.messageId, p.body),
    onSuccess: () => {
      setEditingMessageId(null);
      setEditBody("");
      queryClient.invalidateQueries({ queryKey: ["messages-thread", selectedConversationId] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (p: { conversationId: number; messageId: number; mode: "unsend" | "delete_for_me" }) =>
      deleteMessage(p.conversationId, p.messageId, p.mode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages-thread", selectedConversationId] });
      queryClient.invalidateQueries({ queryKey: ["messages-conversations", false] });
    }
  });

  const archiveMutation = useMutation({
    mutationFn: (conversationId: number) =>
      showArchived ? unarchiveConversation(conversationId) : archiveConversation(conversationId),
    onSuccess: () => {
      setSelectedConversationId(null);
      queryClient.invalidateQueries({ queryKey: ["messages-conversations"] });
    }
  });

  // Find last message sent by current user for read receipt display
  const lastSentMessageId = useMemo(() => {
    for (let i = orderedMessages.length - 1; i >= 0; i--) {
      if (orderedMessages[i].sender_id === currentUserId && orderedMessages[i].id > 0) {
        return orderedMessages[i].id;
      }
    }
    return null;
  }, [orderedMessages, currentUserId]);

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
    <section className="messages-shell" onClick={() => setContextMenuId(null)}>
      <aside className="messages-sidebar">
        <header className="messages-sidebar-header">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-semibold">Messages</h1>
            <button
              className="text-xs text-muted hover:text-text transition"
              onClick={() => { setShowArchived(!showArchived); setSelectedConversationId(null); }}
            >
              {showArchived ? "Inbox" : "Archived"}
            </button>
          </div>
          <p className="text-xs text-muted">
            {showArchived ? "Archived conversations." : "Direct messages with other members."}
          </p>
          <input
            className="messages-search"
            placeholder="Search conversations"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            aria-label="Search conversations"
          />
          {!showArchived && (
            <UserSearchInput
              onSelectUser={(userId) => createConversation.mutate(userId)}
              isPending={createConversation.isPending}
            />
          )}
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
            <EmptyState title={showArchived ? "No archived conversations" : "No conversations yet"} />
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
              <button
                className="shrink-0 rounded-control border border-black/10 px-3 py-1.5 text-xs text-muted hover:text-text transition"
                onClick={() => archiveMutation.mutate(selectedConversation.conversation_id)}
                disabled={archiveMutation.isPending}
              >
                {showArchived ? "Unarchive" : "Archive"}
              </button>
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
                const isEditing = editingMessageId === message.id;
                const showReadReceipt = isMine && message.id === lastSentMessageId && peerLastReadId !== null && peerLastReadId >= message.id;

                if (message.is_unsent) {
                  return (
                    <div key={message.id} className={`messages-bubble-wrap ${isMine ? "messages-bubble-wrap-mine" : ""}`}>
                      <div className="messages-bubble border-dashed opacity-50">
                        <p className="messages-bubble-text italic text-muted">This message was unsent</p>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={message.id}
                    className={`messages-bubble-wrap ${isMine ? "messages-bubble-wrap-mine" : ""}`}
                  >
                    <div
                      className={`messages-bubble ${isMine ? "messages-bubble-mine" : ""} ${isOptimistic ? "opacity-70" : ""} relative group`}
                      onContextMenu={(e) => {
                        if (isMine && !isOptimistic) {
                          e.preventDefault();
                          setContextMenuId(contextMenuId === message.id ? null : message.id);
                        }
                      }}
                    >
                      <p className="messages-bubble-author">{message.sender_display_name}</p>

                      {isEditing ? (
                        <form
                          className="mt-1 flex gap-1"
                          onSubmit={(e: FormEvent) => {
                            e.preventDefault();
                            if (!editBody.trim() || !selectedConversationId) return;
                            editMutation.mutate({ conversationId: selectedConversationId, messageId: message.id, body: editBody.trim() });
                          }}
                        >
                          <input
                            className="flex-1 rounded border border-white/30 bg-white/10 px-2 py-1 text-sm"
                            value={editBody}
                            onChange={(e) => setEditBody(e.target.value)}
                            autoFocus
                          />
                          <button type="submit" className="text-xs font-semibold" disabled={editMutation.isPending}>
                            {editMutation.isPending ? "..." : "Save"}
                          </button>
                          <button type="button" className="text-xs" onClick={() => setEditingMessageId(null)}>
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <p className="messages-bubble-text">{message.body}</p>
                      )}

                      <p className="messages-bubble-time">
                        {formatMessageTime(message.created_at)}
                        {message.edited_at ? <span className="ml-1 italic">(edited)</span> : null}
                      </p>

                      {showReadReceipt && (
                        <p className="messages-bubble-time font-medium">Read</p>
                      )}

                      {/* Context menu for own messages */}
                      {isMine && !isOptimistic && contextMenuId === message.id && (
                        <div
                          className="absolute right-0 top-full z-30 mt-1 min-w-[140px] rounded-control border border-black/10 bg-card py-1 shadow-soft"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {canEdit(message) && (
                            <button
                              className="block w-full px-3 py-1.5 text-left text-xs hover:bg-black/[0.04]"
                              onClick={() => {
                                setEditingMessageId(message.id);
                                setEditBody(message.body || "");
                                setContextMenuId(null);
                              }}
                            >
                              Edit
                            </button>
                          )}
                          {canUnsend(message) && (
                            <button
                              className="block w-full px-3 py-1.5 text-left text-xs text-rose-600 hover:bg-black/[0.04]"
                              onClick={() => {
                                if (selectedConversationId) {
                                  deleteMutation.mutate({ conversationId: selectedConversationId, messageId: message.id, mode: "unsend" });
                                }
                                setContextMenuId(null);
                              }}
                            >
                              Unsend
                            </button>
                          )}
                          <button
                            className="block w-full px-3 py-1.5 text-left text-xs hover:bg-black/[0.04]"
                            onClick={() => {
                              if (selectedConversationId) {
                                deleteMutation.mutate({ conversationId: selectedConversationId, messageId: message.id, mode: "delete_for_me" });
                              }
                              setContextMenuId(null);
                            }}
                          >
                            Delete for me
                          </button>
                        </div>
                      )}
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
