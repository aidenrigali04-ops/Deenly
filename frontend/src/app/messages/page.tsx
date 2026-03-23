"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";

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
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [newParticipantUserId, setNewParticipantUserId] = useState("");
  const [messageBody, setMessageBody] = useState("");

  const conversationsQuery = useQuery({
    queryKey: ["messages-conversations"],
    queryFn: () => apiRequest<{ items: ConversationItem[] }>("/messages/conversations?limit=25", { auth: true })
  });

  const selectedConversation = useMemo(
    () => conversationsQuery.data?.items.find((item) => item.conversation_id === selectedConversationId) || null,
    [conversationsQuery.data, selectedConversationId]
  );

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
    <section className="grid gap-4 md:grid-cols-[320px,1fr]">
      <aside className="surface-card space-y-3">
        <h1 className="text-xl font-semibold">Messages</h1>
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
            className="input flex-1"
            placeholder="User ID"
            value={newParticipantUserId}
            onChange={(event) => setNewParticipantUserId(event.target.value)}
          />
          <button className="btn-secondary" type="submit">
            Start
          </button>
        </form>
        {conversationsQuery.isLoading ? <LoadingState label="Loading conversations..." /> : null}
        {conversationsQuery.error ? (
          <ErrorState message={(conversationsQuery.error as Error).message} />
        ) : null}
        {(conversationsQuery.data?.items || []).map((conversation) => (
          <button
            key={conversation.conversation_id}
            className={`w-full rounded-lg border p-3 text-left ${
              selectedConversationId === conversation.conversation_id
                ? "border-accent bg-background"
                : "border-white/10"
            }`}
            onClick={() => setSelectedConversationId(conversation.conversation_id)}
          >
            <p className="font-medium">{conversation.other_display_name}</p>
            <p className="text-xs text-muted">@{conversation.other_username}</p>
            {conversation.last_message_body ? (
              <p className="mt-2 line-clamp-2 text-sm text-muted">{conversation.last_message_body}</p>
            ) : null}
            {conversation.unread_count > 0 ? (
              <p className="mt-1 text-xs text-accent">{conversation.unread_count} unread</p>
            ) : null}
          </button>
        ))}
        {!conversationsQuery.isLoading && (conversationsQuery.data?.items || []).length === 0 ? (
          <EmptyState title="No conversations yet" />
        ) : null}
      </aside>

      <div className="surface-card space-y-3">
        {selectedConversation ? (
          <>
            <div>
              <h2 className="text-lg font-semibold">{selectedConversation.other_display_name}</h2>
              <p className="text-sm text-muted">@{selectedConversation.other_username}</p>
            </div>
            {messagesQuery.isLoading ? <LoadingState label="Loading messages..." /> : null}
            {messagesQuery.error ? <ErrorState message={(messagesQuery.error as Error).message} /> : null}
            <div className="max-h-[50vh] space-y-2 overflow-y-auto rounded-lg border border-white/10 p-3">
              {(messagesQuery.data?.items || []).map((message) => (
                <div key={message.id} className="rounded-lg border border-white/10 p-2">
                  <p className="text-xs text-muted">{message.sender_display_name}</p>
                  <p>{message.body}</p>
                </div>
              ))}
              {(messagesQuery.data?.items || []).length === 0 ? <EmptyState title="No messages yet" /> : null}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                if (!selectedConversationId || !messageBody.trim()) return;
                sendMessage.mutate({ conversationId: selectedConversationId, body: messageBody.trim() });
              }}
            >
              <input
                className="input flex-1"
                placeholder="Type a message..."
                value={messageBody}
                onChange={(event) => setMessageBody(event.target.value)}
              />
              <button className="btn-primary" type="submit" disabled={sendMessage.isPending}>
                Send
              </button>
            </form>
          </>
        ) : (
          <EmptyState title="Select a conversation" subtitle="Choose one from the left to start messaging." />
        )}
      </div>
    </section>
  );
}
