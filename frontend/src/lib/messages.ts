import { apiRequest } from "./api";

export async function createOrOpenConversation(participantUserId: number) {
  return apiRequest<{ conversationId: number; createdAt?: string }>("/messages/conversations", {
    method: "POST",
    auth: true,
    body: { participantUserId }
  });
}

export async function markConversationRead(conversationId: number, messageId: number) {
  return apiRequest<{ status: string }>(`/messages/conversations/${conversationId}/read`, {
    method: "POST",
    auth: true,
    body: { messageId }
  });
}

export async function editMessage(conversationId: number, messageId: number, body: string) {
  return apiRequest<{ id: number; body: string; edited_at: string }>(
    `/messages/conversations/${conversationId}/messages/${messageId}`,
    { method: "PATCH", auth: true, body: { body } }
  );
}

export async function deleteMessage(conversationId: number, messageId: number, mode: "unsend" | "delete_for_me") {
  return apiRequest<{ status: string }>(
    `/messages/conversations/${conversationId}/messages/${messageId}?mode=${mode}`,
    { method: "DELETE", auth: true }
  );
}

export async function archiveConversation(conversationId: number) {
  return apiRequest<{ status: string }>(`/messages/conversations/${conversationId}/archive`, {
    method: "POST",
    auth: true
  });
}

export async function unarchiveConversation(conversationId: number) {
  return apiRequest<{ status: string }>(`/messages/conversations/${conversationId}/unarchive`, {
    method: "POST",
    auth: true
  });
}

export async function getReadStatus(conversationId: number) {
  return apiRequest<{ lastReadMessageId: number | null; lastReadAt: string | null }>(
    `/messages/conversations/${conversationId}/read-status`,
    { auth: true }
  );
}
