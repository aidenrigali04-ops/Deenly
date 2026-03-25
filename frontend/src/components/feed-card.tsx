import Link from "next/link";
import { useEffect, useState } from "react";
import type { FeedItem } from "@/types";
import { resolveMediaUrl } from "@/lib/media-url";

function isImageMedia(item: FeedItem) {
  if (item.media_mime_type?.startsWith("image/")) {
    return true;
  }
  if (!item.media_url) {
    return false;
  }
  return /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(item.media_url);
}

export function FeedCard({
  item,
  layout = "default"
}: {
  item: FeedItem;
  layout?: "default" | "home";
}) {
  const [mediaFailed, setMediaFailed] = useState(false);
  useEffect(() => {
    setMediaFailed(false);
  }, [item.id, item.media_url]);

  const mediaUrl = resolveMediaUrl(item.media_url) || undefined;
  const canRenderMedia = Boolean(mediaUrl) && !mediaFailed;
  const initials = item.author_display_name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  if (layout === "home") {
    return (
      <article className="surface-card overflow-hidden rounded-[1.45rem] p-0">
        <header className="flex items-center justify-between px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-black/10 bg-surface text-[10px] font-semibold"
              aria-hidden="true"
            >
              {initials || "U"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">{item.author_display_name}</p>
              <p className="truncate text-xs text-muted">
                {item.post_type === "recitation" ? "Original audio" : "Community post"} -{" "}
                {new Date(item.created_at).toLocaleString()}
              </p>
            </div>
          </div>
          <button className="grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-black/[0.04] hover:text-text">
            ...
          </button>
        </header>

        {canRenderMedia ? (
          isImageMedia(item) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaUrl}
              alt={`${item.author_display_name} post media`}
              className="feed-media-frame-home w-full"
              onError={() => setMediaFailed(true)}
            />
          ) : (
            <video controls className="feed-media-frame-home w-full" onError={() => setMediaFailed(true)}>
              <source src={mediaUrl} />
            </video>
          )
        ) : (
          <div className="feed-media-frame-home flex items-center justify-center px-5 text-center text-sm text-muted">
            {item.media_url
              ? "Media unavailable right now"
              : `${item.post_type.replace("_", " ")} reflection`}
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 text-muted">
            <button className="feed-action h-8 w-8 border-none">
              <span aria-hidden="true">♡</span>
            </button>
            <button className="feed-action h-8 w-8 border-none">
              <span aria-hidden="true">◌</span>
            </button>
            <button className="feed-action h-8 w-8 border-none">
              <span aria-hidden="true">➤</span>
            </button>
          </div>
          <button className="feed-action h-8 w-8 border-none">
            <span aria-hidden="true">⌑</span>
          </button>
        </div>

        <div className="space-y-1 px-4 pb-4">
          <p className="text-xs text-muted">
            {item.benefited_count || 0} benefited - {item.comment_count || 0} comments
          </p>
          <p className="text-sm leading-relaxed">
            <span className="font-semibold">{item.author_display_name}</span>{" "}
            <span className="text-text">{item.content}</span>
          </p>
          <div className="flex items-center justify-between pt-1">
            <Link href={`/posts/${item.id}`} className="text-xs text-muted hover:text-text">
              View discussion
            </Link>
            <Link href={`/users/${item.author_id}`} className="text-xs text-muted hover:text-text">
              View profile
            </Link>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="surface-card overflow-hidden rounded-[1.5rem] p-0">
      <header className="flex items-center justify-between gap-3 px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/10 bg-surface text-xs font-semibold"
            aria-hidden="true"
          >
            {initials || "U"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">{item.author_display_name}</p>
            <time className="text-xs text-muted" dateTime={item.created_at}>
              {new Date(item.created_at).toLocaleString()}
            </time>
          </div>
        </div>
        <button className="rounded-pill border border-black/10 px-3 py-1 text-xs font-medium text-muted transition hover:bg-black/[0.04] hover:text-text">
          Follow
        </button>
      </header>

      <div className="px-6 pb-3">
        <p className="text-sm leading-relaxed text-text">{item.content}</p>
      </div>

      <div className="mx-6 mb-3 overflow-hidden rounded-[1.35rem] border border-black/10 bg-surface">
        {canRenderMedia ? (
          isImageMedia(item) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaUrl}
              alt={`${item.author_display_name} post media`}
              className="feed-media-frame w-full"
              onError={() => setMediaFailed(true)}
            />
          ) : (
            <video controls className="feed-media-frame w-full" onError={() => setMediaFailed(true)}>
              <source src={mediaUrl} />
            </video>
          )
        ) : (
          <div className="feed-media-frame flex items-center justify-center px-5 text-center text-sm text-muted">
            {item.media_url
              ? "Media unavailable right now"
              : `${item.post_type.replace("_", " ")} reflection`}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-6 pb-3 text-muted">
        <button className="feed-action" aria-label="Benefited">
          <span aria-hidden="true">♡</span>
        </button>
        <button className="feed-action" aria-label="Comment">
          <span aria-hidden="true">◌</span>
        </button>
        <button className="feed-action" aria-label="Share">
          <span aria-hidden="true">➤</span>
        </button>
        <button className="rounded-pill border border-black/10 px-3 py-1 text-xs font-medium text-muted transition hover:bg-black/[0.04] hover:text-text">
          Collab
        </button>
      </div>

      <div className="flex flex-wrap gap-2 px-6 pb-4 text-xs text-muted">
        <span className="rounded-pill border border-black/10 px-2 py-1">
          Benefited: {item.benefited_count || 0}
        </span>
        <span className="rounded-pill border border-black/10 px-2 py-1">
          Comments: {item.comment_count || 0}
        </span>
        <span className="rounded-pill border border-black/10 px-2 py-1">
          Reflect later: {item.reflect_later_count || 0}
        </span>
      </div>

      <footer className="flex items-center justify-between border-t border-black/10 px-6 py-3">
        <Link href={`/posts/${item.id}`} className="btn-secondary px-3 py-1.5 text-xs">
          Open post
        </Link>
        <Link href={`/users/${item.author_id}`} className="text-xs font-medium text-text hover:underline">
          View profile
        </Link>
      </footer>
    </article>
  );
}
