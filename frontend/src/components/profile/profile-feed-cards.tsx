"use client";

import { resolveMediaUrl } from "@/lib/media-url";

export type ProfileFeedCardItem = {
  id: number;
  content: string;
  media_url: string | null;
  media_mime_type: string | null;
  post_type: "post" | "marketplace" | "reel";
  benefited_count: number;
};

type ProfileFeedCardsProps = {
  items: ProfileFeedCardItem[];
  router: { push: (href: string) => void };
  onLike: (postId: number) => void;
  likePending?: boolean;
};

function captionOneLine(content: string, maxLen = 72) {
  const t = content.trim().replace(/\s+/g, " ");
  if (t.length <= maxLen) return t || "Post";
  return `${t.slice(0, maxLen - 1)}…`;
}

/** Two-column responsive cards (4:3 media), subtle like row — not a 3-up square grid. */
export function ProfileFeedCards({ items, router, onLike, likePending }: ProfileFeedCardsProps) {
  return (
    <div className="profile-feed-cards">
      {items.map((item) => {
        const mediaUrl = resolveMediaUrl(item.media_url) || undefined;
        const isImage = item.media_mime_type?.startsWith("image/");
        const isVideo = item.media_mime_type?.startsWith("video/");
        const caption = captionOneLine(item.content || "");
        return (
          <article key={item.id} className="profile-feed-card">
            <button
              type="button"
              className="profile-feed-card-media-wrap"
              onClick={() => router.push(`/posts/${item.id}`)}
              aria-label={`Open post ${item.id}`}
            >
              <div className="profile-feed-card-media-inner">
                {mediaUrl ? (
                  isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaUrl} alt="" className="profile-feed-card-img" />
                  ) : (
                    <div className="profile-feed-card-fallback profile-feed-card-fallback-video">
                      {isVideo ? "Video" : "Media"}
                    </div>
                  )
                ) : (
                  <div className="profile-feed-card-fallback">{caption}</div>
                )}
              </div>
              {isVideo ? <span className="profile-feed-card-badge">Video</span> : null}
              {item.post_type === "marketplace" ? (
                <span className="profile-feed-card-shop-badge">Shop</span>
              ) : null}
            </button>
            <div className="profile-feed-card-body">
              <p className="profile-feed-card-caption">{caption}</p>
              <div className="profile-feed-card-actions">
                <button
                  type="button"
                  className="profile-feed-card-like-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onLike(item.id);
                  }}
                  disabled={likePending}
                  aria-label={`Like post ${item.id}`}
                >
                  {likePending ? "…" : "Thank"}
                </button>
                <span className="profile-feed-card-like-count" aria-label="Thanks count">
                  {item.benefited_count || 0}
                </span>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
