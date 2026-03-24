import Link from "next/link";
import type { FeedItem } from "@/types";

function isImageMedia(item: FeedItem) {
  if (item.media_mime_type?.startsWith("image/")) {
    return true;
  }
  if (!item.media_url) {
    return false;
  }
  return /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(item.media_url);
}

export function FeedCard({ item }: { item: FeedItem }) {
  const initials = item.author_display_name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <article className="surface-card overflow-hidden p-0">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-surface text-xs font-semibold"
            aria-hidden="true"
          >
            {initials || "U"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{item.author_display_name}</p>
            <time className="text-xs text-muted" dateTime={item.created_at}>
              {new Date(item.created_at).toLocaleString()}
            </time>
          </div>
        </div>
        <button className="rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-muted hover:text-text">
          Follow
        </button>
      </header>

      <div className="px-4 pb-3">
        <p className="text-sm leading-relaxed">{item.content}</p>
      </div>

      <div className="mx-4 mb-3 overflow-hidden rounded-[1.4rem] border border-white/10 bg-surface">
        {item.media_url ? (
          isImageMedia(item) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.media_url}
              alt={`${item.author_display_name} post media`}
              className="feed-media-frame w-full object-cover"
            />
          ) : (
            <video controls className="feed-media-frame w-full">
              <source src={item.media_url} />
            </video>
          )
        ) : (
          <div className="feed-media-frame flex items-center justify-center px-5 text-center text-sm text-muted">
            {item.post_type.replace("_", " ")} reflection
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 px-4 pb-2 text-muted">
        <button className="feed-action" aria-label="Benefited">
          ♡
        </button>
        <button className="feed-action" aria-label="Comment">
          ◌
        </button>
        <button className="feed-action" aria-label="Share">
          ➤
        </button>
        <button className="rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-muted hover:text-text">
          Collab
        </button>
      </div>

      <div className="flex flex-wrap gap-2 px-4 pb-3 text-xs text-muted">
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

      <footer className="flex items-center justify-between border-t border-white/10 px-4 py-3">
        <Link href={`/posts/${item.id}`} className="btn-secondary px-3 py-1.5 text-xs">
          Open post
        </Link>
        <Link href={`/users/${item.author_id}`} className="text-xs font-medium text-accent hover:underline">
          View profile
        </Link>
      </footer>
    </article>
  );
}
