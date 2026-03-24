import Link from "next/link";
import type { FeedItem } from "@/types";

export function FeedCard({ item }: { item: FeedItem }) {
  return (
    <article className="surface-card space-y-4">
      <div className="flex items-center justify-between text-sm text-muted">
        <span className="truncate">{item.author_display_name}</span>
        <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
      </div>
      <h3 className="text-xs uppercase tracking-[0.14em] text-accent">{item.post_type}</h3>
      <p className="text-sm leading-relaxed">{item.content}</p>
      {item.media_url ? (
        <video controls className="w-full rounded-xl border border-white/10">
          <source src={item.media_url} />
        </video>
      ) : null}
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
