import { apiRequest } from "@/lib/api";

export type PostAssistIntent = "polish" | "marketplace_listing";

export type PostAssistResponse = {
  suggestion: string;
  intent: string;
  disclaimer: string;
};

export type CommentToneResponse = {
  suggestion: string;
  disclaimer: string;
};

export async function assistPostText(draft: string, intent: PostAssistIntent) {
  return apiRequest<PostAssistResponse>("/ai/assist/post-text", {
    method: "POST",
    auth: true,
    body: { draft, intent },
    timeoutMs: 35000,
    retries: 0
  });
}

export async function assistCommentTone(draft: string) {
  return apiRequest<CommentToneResponse>("/ai/assist/comment-tone", {
    method: "POST",
    auth: true,
    body: { draft },
    timeoutMs: 35000,
    retries: 0
  });
}
