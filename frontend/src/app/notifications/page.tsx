"use client";

import Link from "next/link";
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

function notificationSummary(item: NotificationItem): { title: string; detail?: string } {
  if (item.type === "direct_message") {
    const p = item.payload as {
      senderDisplayName?: string;
      bodyPreview?: string;
      conversationId?: number;
    };
    const who = typeof p.senderDisplayName === "string" ? p.senderDisplayName : "Someone";
    const preview = typeof p.bodyPreview === "string" ? p.bodyPreview : "New message";
    return {
      title: `Message from ${who}`,
      detail: preview
    };
  }
  return { title: item.type.replace(/_/g, " ") };
}

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
      {query.data.items.map((item) => {
        const summary = notificationSummary(item);
        return (
        <article key={item.id} className="surface-card space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {summary.title} {!item.is_read ? <span className="text-accent">(new)</span> : null}
            </p>
            <time className="text-xs text-muted" dateTime={item.created_at}>
              {new Date(item.created_at).toLocaleString()}
            </time>
          </div>
          {summary.detail ? <p className="text-sm text-text/90">{summary.detail}</p> : null}
          {item.type === "direct_message" &&
          typeof (item.payload as { conversationId?: unknown }).conversationId === "number" ? (
            <Link
              href={`/messages?conversation=${(item.payload as { conversationId: number }).conversationId}`}
              className="inline-flex text-sm text-sky-600 underline-offset-2 hover:underline"
            >
              Open in messages
            </Link>
          ) : null}
          {item.type === "direct_message" ? null : (
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-surface/50 p-3 text-xs text-muted">
              {JSON.stringify(item.payload, null, 2)}
            </pre>
          )}
          {!item.is_read ? (
            <button
              className="btn-secondary mt-3"
              onClick={() => markReadMutation.mutate(item.id)}
            >
              Mark read
            </button>
          ) : null}
        </article>
      );
      })}
    </section>
  );
}
