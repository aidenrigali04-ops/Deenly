import Link from "next/link";
import type { FeedItem } from "@/types";

export function FeedCard({ item }: { item: FeedItem }) {
  const initials = item.author_display_name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <article className="surface-card space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-surface text-xs font-semibold"
            aria-hidden="true"
          >
            {initials || "U"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{item.author_display_name}</p>
            <time className="text-xs text-muted" dateTime={item.created_at}>
              {new Date(item.created_at).toLocaleString()}
            </time>
          </div>
        </div>
        <button className="btn-secondary px-3 py-1.5 text-xs" aria-label="Post options">
          More
        </button>
      </header>
      <div>
        <h3 className="text-xs uppercase tracking-[0.14em] text-accent">{item.post_type}</h3>
        <p className="mt-2 text-sm leading-relaxed">{item.content}</p>
      </div>
      {item.media_url ? (
        <video controls className="w-full rounded-xl border border-white/10">
          <source src={item.media_url} />
        </video>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <button className="btn-secondary justify-center text-xs">Benefited</button>
        <button className="btn-secondary justify-center text-xs">Comment</button>
        <button className="btn-secondary justify-center text-xs">Reflect Later</button>
        <button className="btn-secondary justify-center text-xs">Share</button>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-muted">
        <span className="rounded-full border border-white/10 px-2 py-1">
          Benefited: {item.benefited_count || 0}
        </span>
        <span className="rounded-full border border-white/10 px-2 py-1">
          Comments: {item.comment_count || 0}
        </span>
        <span className="rounded-full border border-white/10 px-2 py-1">
          Reflect later: {item.reflect_later_count || 0}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <Link href={`/posts/${item.id}`} className="btn-secondary">
          Open post
        </Link>
        <Link href={`/users/${item.author_id}`} className="text-xs text-accent hover:underline">
          View profile
        </Link>
      </div>
    </article>
  );
}
