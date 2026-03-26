import { apiRequest } from "@/lib/api";

export type InstagramStatusResponse = {
  connected: boolean;
  igUserId?: string;
  igUsername?: string | null;
  connectedAt?: string;
};

export async function fetchInstagramStatus() {
  return apiRequest<InstagramStatusResponse>("/instagram/status", { auth: true });
}

export async function fetchInstagramOAuthUrl() {
  return apiRequest<{ url: string }>("/instagram/oauth/url", { auth: true });
}

export async function disconnectInstagram() {
  return apiRequest<{ disconnected: boolean }>("/instagram/connection", {
    method: "DELETE",
    auth: true
  });
}

export async function requestInstagramCrossPost(postId: number) {
  return apiRequest<{ accepted: boolean }>(`/instagram/cross-post/${postId}`, {
    method: "POST",
    auth: true
  });
}
