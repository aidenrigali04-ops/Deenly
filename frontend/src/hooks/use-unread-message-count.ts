import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useSessionStore } from "@/store/session-store";
import { usePageVisibility } from "./use-page-visibility";

export function useUnreadMessageCount(): number {
  const user = useSessionStore((s) => s.user);
  const visible = usePageVisibility();

  const { data } = useQuery({
    queryKey: ["messages-unread-count"],
    queryFn: () => apiRequest<{ unreadConversationCount: number }>("/messages/unread-count", { auth: true }),
    enabled: Boolean(user),
    refetchInterval: visible ? 15_000 : false,
    staleTime: 10_000,
  });

  return data?.unreadConversationCount ?? 0;
}
