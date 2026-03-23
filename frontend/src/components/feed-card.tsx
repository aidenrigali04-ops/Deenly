import Link from "next/link";
import type { FeedItem } from "@/types";

export function FeedCard({ item }: { item: FeedItem }) {
  return (
    <article className="surface-card space-y-3">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>{item.author_display_name}</span>
        <span>{new Date(item.created_at).toLocaleString()}</span>
      </div>
      <h3 className="text-sm uppercase tracking-wide text-accent">{item.post_type}</h3>
      <p className="text-sm leading-relaxed">{item.content}</p>
      {item.media_url ? (
        <video controls className="w-full rounded-xl border border-white/10">
          <source src={item.media_url} />
        </video>
      ) : null}
      <div className="flex flex-wrap gap-3 text-xs text-muted">
        <span>Benefited: {item.benefited_count || 0}</span>
        <span>Comments: {item.comment_count || 0}</span>
        <span>Reflect later: {item.reflect_later_count || 0}</span>
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
