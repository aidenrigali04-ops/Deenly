import { apiRequest } from "@/lib/api";

export type AccountDataExport = {
  exportedAt: string;
  user: Record<string, unknown>;
  profile: Record<string, unknown> | null;
  posts: unknown[];
  purchases: unknown[];
  disclaimer?: string;
};

export async function fetchAccountDataExport() {
  return apiRequest<AccountDataExport>("/users/me/data-export", {
    auth: true,
    timeoutMs: 60_000,
    retries: 1
  });
}

export async function deleteMyAccount() {
  return apiRequest<Record<string, never>>("/users/me", {
    method: "DELETE",
    auth: true,
    body: { confirm: "DELETE" as const },
    timeoutMs: 30_000,
    retries: 0
  });
}
