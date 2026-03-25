"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
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

export default function MessagesPage() {
  const queryClient = useQueryClient();
  const currentUserId = useSessionStore((state) => state.user?.id || null);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [newParticipantUserId, setNewParticipantUserId] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

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

  const createConversation = useMutation({
    mutationFn: (participantUserId: number) =>
      apiRequest<{ conversationId: number }>("/messages/conversations", {
        method: "POST",
        auth: true,
        body: { participantUserId }
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["messages-conversations"] });
      setSelectedConversationId(result.conversationId);
      setNewParticipantUserId("");
    }
  });

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
            <button className="messages-icon-btn" aria-label="Compose message">
              +
            </button>
          </div>
          <nav className="messages-tab-row">
            <button className="messages-tab messages-tab-active" type="button">
              Primary
            </button>
            <button className="messages-tab" type="button">
              General
            </button>
            <button className="messages-tab" type="button">
              Requests
            </button>
          </nav>
          <input
            className="messages-search"
            placeholder="Search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            aria-label="Search conversations"
          />
          <form
            className="flex gap-2"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              const participantUserId = Number(newParticipantUserId);
              if (!participantUserId) return;
              createConversation.mutate(participantUserId);
            }}
          >
            <input
              className="messages-search"
              placeholder="Start chat by User ID"
              value={newParticipantUserId}
              onChange={(event) => setNewParticipantUserId(event.target.value)}
              aria-label="Participant user ID"
            />
            <button className="messages-icon-btn shrink-0" type="submit" aria-label="Start conversation">
              {createConversation.isPending ? "..." : "+"}
            </button>
          </form>
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
              <div className="flex items-center gap-2">
                <button className="messages-icon-btn" aria-label="Call">Call</button>
                <button className="messages-icon-btn" aria-label="Info">Info</button>
              </div>
            </header>

            <div className="messages-thread-body">
              {messagesQuery.isLoading ? <LoadingState label="Loading messages..." /> : null}
              {messagesQuery.error ? <ErrorState message={(messagesQuery.error as Error).message} /> : null}
              {(messagesQuery.data?.items || []).map((message) => {
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
              {!messagesQuery.isLoading && !messagesQuery.error && (messagesQuery.data?.items || []).length === 0 ? (
                <EmptyState title="No messages yet" />
              ) : null}
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
            <EmptyState title="Select a conversation" subtitle="Choose one from the left to start messaging." />
          </div>
        )}
      </article>
    </section>
  );
}
