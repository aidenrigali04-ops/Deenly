"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";

type NotificationItem = {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
};

type NotificationsResponse = {
  items: NotificationItem[];
};

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiRequest<NotificationsResponse>("/notifications", { auth: true })
  });

  const markReadMutation = useMutation({
    mutationFn: (notificationId: number) =>
      apiRequest(`/notifications/${notificationId}/read`, {
        method: "POST",
        auth: true
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  });

  if (query.isLoading) return <LoadingState label="Loading inbox..." />;
  if (query.error) return <ErrorState message="Could not load notifications." />;
  if (!query.data || query.data.items.length === 0) return <EmptyState title="No notifications yet." />;

  return (
    <section className="space-y-3">
      <h1 className="section-title">Inbox</h1>
      {query.data.items.map((item) => (
        <article key={item.id} className="surface-card space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {item.type} {!item.is_read ? <span className="text-accent">(new)</span> : null}
            </p>
            <time className="text-xs text-muted" dateTime={item.created_at}>
              {new Date(item.created_at).toLocaleString()}
            </time>
          </div>
          <pre className="overflow-x-auto rounded-xl border border-white/10 bg-surface/50 p-3 text-xs text-muted">
            {JSON.stringify(item.payload, null, 2)}
          </pre>
          {!item.is_read ? (
            <button
              className="btn-secondary mt-3"
              onClick={() => markReadMutation.mutate(item.id)}
            >
              Mark read
            </button>
          ) : null}
        </article>
      ))}
    </section>
  );
}
