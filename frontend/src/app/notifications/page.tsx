"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { apiRequest } from "@/lib/api";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";

type NotificationItem = {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
  actor_display_name?: string | null;
};

type NotificationsResponse = {
  items: NotificationItem[];
};

function payloadNum(payload: Record<string, unknown>, key: string): number | null {
  const v = payload[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function payloadStr(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key];
  return typeof v === "string" ? v : null;
}

function notificationPresentation(item: NotificationItem): {
  title: string;
  detail?: string;
  href?: string;
  cta?: string;
} {
  const p = item.payload;
  const who =
    typeof item.actor_display_name === "string" && item.actor_display_name.trim()
      ? item.actor_display_name.trim()
      : "Someone";
  const postId = payloadNum(p, "postId");

  if (item.type === "direct_message") {
    const sender =
      typeof p.senderDisplayName === "string" && p.senderDisplayName.trim()
        ? p.senderDisplayName.trim()
        : who;
    const preview = typeof p.bodyPreview === "string" ? p.bodyPreview : "New message";
    const conversationId = payloadNum(p, "conversationId");
    return {
      title: `Message from ${sender}`,
      detail: preview,
      href: conversationId != null ? `/messages?conversation=${conversationId}` : undefined,
      cta: conversationId != null ? "Open in messages" : undefined
    };
  }

  if (item.type === "post_benefited" && postId != null) {
    return {
      title: `${who} appreciated your post`,
      detail: "They liked your post.",
      href: `/posts/${postId}`,
      cta: "View post"
    };
  }

  if (item.type === "post_comment" && postId != null) {
    const preview = payloadStr(p, "commentPreview");
    return {
      title: `${who} commented on your post`,
      detail: preview || undefined,
      href: `/posts/${postId}`,
      cta: "View post"
    };
  }

  if (item.type === "post_reflect_later" && postId != null) {
    return {
      title: `${who} saved your post to reflect later`,
      href: `/posts/${postId}`,
      cta: "View post"
    };
  }

  if (item.type === "new_follower") {
    const actorId = payloadNum(p, "actorUserId");
    return {
      title: `${who} started following you`,
      href: actorId != null ? `/users/${actorId}` : undefined,
      cta: actorId != null ? "View profile" : undefined
    };
  }

  return {
    title: item.type.replace(/_/g, " "),
    detail: undefined
  };
}

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } }
};

const rowVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] } }
};

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const reducedMotion = useReducedMotion();
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

  const items = query.data.items;

  function NotificationCard({ item }: { item: NotificationItem }) {
    const pres = notificationPresentation(item);
    const inner = (
      <>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-semibold leading-snug text-text">
              {pres.title}{" "}
              {!item.is_read ? (
                <span className="text-[11px] font-medium text-accent">· New</span>
              ) : null}
            </p>
            {pres.detail ? <p className="text-sm leading-relaxed text-muted">{pres.detail}</p> : null}
          </div>
          <time className="shrink-0 text-[11px] text-muted" dateTime={item.created_at}>
            {new Date(item.created_at).toLocaleString()}
          </time>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {pres.href && pres.cta ? (
            <Link href={pres.href} className="btn-secondary px-3 py-1.5 text-xs">
              {pres.cta}
            </Link>
          ) : null}
          {!item.is_read ? (
            <button
              type="button"
              className="btn-secondary px-3 py-1.5 text-xs"
              onClick={() => markReadMutation.mutate(item.id)}
              disabled={markReadMutation.isPending}
            >
              Mark read
            </button>
          ) : null}
        </div>
      </>
    );
    const cardClass =
      "surface-card overflow-hidden rounded-[1.35rem] border border-black/10 p-4 shadow-soft";
    if (reducedMotion) {
      return <article className={cardClass}>{inner}</article>;
    }
    return (
      <motion.article variants={rowVariants} className={cardClass}>
        {inner}
      </motion.article>
    );
  }

  const listBody = items.map((item) => <NotificationCard key={item.id} item={item} />);

  return (
    <section className="mx-auto max-w-[640px] space-y-4">
      <h1 className="section-title text-lg">Inbox</h1>
      {reducedMotion ? (
        <div className="flex flex-col gap-3">{listBody}</div>
      ) : (
        <motion.div className="flex flex-col gap-3" variants={listVariants} initial="hidden" animate="show">
          {listBody}
        </motion.div>
      )}
    </section>
  );
}
