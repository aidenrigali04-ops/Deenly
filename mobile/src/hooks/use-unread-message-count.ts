import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import { useSessionStore } from "../store/session-store";
import { useAppActive } from "./use-app-active";

export function useUnreadMessageCount(): number {
  const user = useSessionStore((s) => s.user);
  const active = useAppActive();

  const { data } = useQuery({
    queryKey: ["mobile-messages-unread-count"],
    queryFn: () => apiRequest<{ unreadConversationCount: number }>("/messages/unread-count", { auth: true }),
    enabled: Boolean(user),
    refetchInterval: active ? 15_000 : false,
    staleTime: 10_000,
  });

  return data?.unreadConversationCount ?? 0;
}
