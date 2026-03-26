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
