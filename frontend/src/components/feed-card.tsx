import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import type { FeedItem } from "@/types";
import { apiRequest } from "@/lib/api";
import { resolveMediaUrl } from "@/lib/media-url";
import { PaymentHandoffDialog } from "@/components/payment/payment-handoff-dialog";
import { formatMinorCurrency } from "@/lib/monetization";
import { PostCommentsBlock } from "@/components/post-comments-block";
import { FigmaRasterIcon } from "@/components/social/figma-raster-icon";
import { figmaSocialIcons } from "@/lib/figma-social-icons";

function feedPostTypeLabel(postType: string) {
  if (postType === "marketplace") {
    return "Marketplace";
  }
  if (postType === "reel") {
    return "Reel";
  }
  return "Post";
}

function feedReflectionLabel(postType: string) {
  if (postType === "marketplace") {
    return "Marketplace listing";
  }
  if (postType === "reel") {
    return "Reel reflection";
  }
  return "Post reflection";
}

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
  onToggleFollow,
  followBusy = false,
  layout = "default"
}: {
  item: FeedItem;
  onToggleFollow?: (authorId: number, currentlyFollowing: boolean) => void;
  followBusy?: boolean;
  layout?: "default" | "home" | "social";
}) {
  const reducedMotion = useReducedMotion();
  const [mediaFailed, setMediaFailed] = useState(false);
  const [liked, setLiked] = useState(Boolean(item.liked_by_viewer));
  const [benefitedCount, setBenefitedCount] = useState(Number(item.benefited_count || 0));
  const [commentCount, setCommentCount] = useState(Number(item.comment_count || 0));
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [likeBounceKey, setLikeBounceKey] = useState(0);
  useEffect(() => {
    setMediaFailed(false);
    setLiked(Boolean(item.liked_by_viewer));
    setBenefitedCount(Number(item.benefited_count || 0));
    setCommentCount(Number(item.comment_count || 0));
  }, [item.id, item.media_url, item.comment_count, item.benefited_count, item.liked_by_viewer]);

  useEffect(() => {
    setLikeBounceKey(0);
  }, [item.id]);

  useEffect(() => {
    setCommentsOpen(false);
  }, [item.id]);

  const mediaUrl = resolveMediaUrl(item.media_url) || undefined;
  const canRenderMedia = Boolean(mediaUrl) && !mediaFailed;
  const initials = item.author_display_name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const authorAvatarUrl = resolveMediaUrl(item.author_avatar_url) || undefined;
  const isFollowing = Boolean(item.is_following_author);
  const [checkoutHandoff, setCheckoutHandoff] = useState<{
    productId: number;
    title: string;
    priceMinor: number;
    currency: string;
  } | null>(null);
  const hasAttachedProduct = Boolean(item.attached_product_id);
  const attachedProductType = item.attached_product_type || "digital";
  const likeMutation = useMutation({
    mutationFn: async (nextLiked: boolean) => {
      if (nextLiked) {
        return apiRequest("/interactions", {
          method: "POST",
          auth: true,
          body: {
            postId: item.id,
            interactionType: "benefited"
          }
        });
      }
      return apiRequest("/interactions", {
        method: "DELETE",
        auth: true,
        body: {
          postId: item.id,
          interactionType: "benefited"
        }
      });
    },
    onMutate: (nextLiked) => {
      setLiked(nextLiked);
      setBenefitedCount((value) => Math.max(0, value + (nextLiked ? 1 : -1)));
    },
    onError: (_error, nextLiked) => {
      setLiked(!nextLiked);
      setBenefitedCount((value) => Math.max(0, value + (nextLiked ? -1 : 1)));
    },
    onSuccess: (_data, nextLiked) => {
      if (nextLiked) {
        setLikeBounceKey((k) => k + 1);
      }
    }
  });

  const likeHeart = (
    <span aria-hidden="true" className="inline-flex min-w-[1em] items-center justify-center">
      {liked ? (
        reducedMotion ? (
          <span key={likeBounceKey} className="like-pop-once inline-block">
            ♥
          </span>
        ) : (
          <motion.span
            key={likeBounceKey}
            className="inline-block"
            initial={false}
            animate={
              likeBounceKey > 0 ? { scale: [1, 1.14, 1] } : { scale: 1 }
            }
            transition={{ duration: 0.34, ease: [0.34, 1.45, 0.64, 1] }}
          >
            ♥
          </motion.span>
        )
      ) : (
        "♡"
      )}
    </span>
  );

  const likeTapProps = reducedMotion
    ? {}
    : { whileTap: { scale: 0.92 }, transition: { type: "spring" as const, stiffness: 520, damping: 28 } };

  const openAttachedCheckout = () => {
    if (attachedProductType !== "digital" && item.attached_product_website_url) {
      window.open(item.attached_product_website_url, "_blank", "noopener,noreferrer");
      return;
    }
    if (!item.attached_product_id) return;
    setCheckoutHandoff({
      productId: item.attached_product_id,
      title: item.attached_product_title || "Creator product",
      priceMinor: Number(item.attached_product_price_minor || 0),
      currency: item.attached_product_currency || "usd"
    });
  };

  const handoffDialog = (
    <PaymentHandoffDialog
      open={checkoutHandoff != null}
      onClose={() => setCheckoutHandoff(null)}
      productId={checkoutHandoff?.productId ?? 0}
      title={checkoutHandoff?.title ?? ""}
      priceMinor={checkoutHandoff?.priceMinor ?? 0}
      currency={checkoutHandoff?.currency ?? "usd"}
    />
  );

  if (layout === "social") {
    return (
      <>
        <article className="feed-card-root group relative overflow-hidden rounded-[32px] bg-social-card text-white shadow-[0_12px_36px_rgba(0,0,0,0.35)]">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-32 bg-gradient-to-b from-black/40 to-transparent"
            aria-hidden
          />
          <div className="relative z-[2] flex items-center justify-between px-5 pt-[19px]">
            <div className="flex min-w-0 items-center gap-2 rounded-full border border-white/12 bg-white/[0.12] py-1.5 pl-2 pr-[18px] backdrop-blur-[5px]">
              <span className="grid h-[42px] w-[42px] shrink-0 place-items-center overflow-hidden rounded-full bg-white text-xs font-semibold text-black" aria-hidden>
                {authorAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={authorAvatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials || "U"
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium leading-4">{item.author_display_name}</p>
                <p className="truncate text-xs font-normal leading-4 text-white/90">
                  {item.sponsored ? `${item.sponsored_label || "Sponsored"} · ` : ""}
                  {new Date(item.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </div>
            </div>
            <Link
              href={`/posts/${item.id}`}
              className="grid h-[54px] w-[54px] shrink-0 place-items-center rounded-full border border-white/12 bg-white/10 text-white/90 shadow-[8px_4px_28px_rgba(0,0,0,0.12)]"
              aria-label="Post options"
            >
              <FigmaRasterIcon src={figmaSocialIcons.feedMore} size={20} className="opacity-95" />
            </Link>
          </div>

          <div className="relative z-[2] mt-3 min-h-[200px] px-5">
            {canRenderMedia ? (
              <div className="overflow-hidden rounded-2xl">
                {isImageMedia(item) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mediaUrl}
                    alt=""
                    className="feed-card-media-inner aspect-[4/5] w-full bg-black/30 object-cover"
                    onError={() => setMediaFailed(true)}
                  />
                ) : (
                  <video
                    controls
                    className="feed-card-media-inner aspect-[4/5] w-full bg-black/30 object-cover"
                    onError={() => setMediaFailed(true)}
                  >
                    <source src={mediaUrl} />
                  </video>
                )}
              </div>
            ) : (
              <div className="flex aspect-[4/5] items-center justify-center rounded-2xl bg-black/25 px-4 text-center text-sm text-white/60">
                {item.media_url ? "Media unavailable" : feedReflectionLabel(item.post_type)}
              </div>
            )}
          </div>

          <div className="relative z-[2] space-y-3 px-5 pb-5 pt-3">
            <p className="text-sm font-normal leading-[18px] text-white">{item.content}</p>
            <div className="flex items-center justify-between gap-2 text-white">
              <div className="flex items-center gap-[54px]">
                <motion.button
                  type="button"
                  className="flex items-center gap-1 border-none bg-transparent p-0 text-base font-medium leading-5 text-white"
                  onClick={() => likeMutation.mutate(!liked)}
                  disabled={likeMutation.isPending}
                  aria-label="Like post"
                  {...likeTapProps}
                >
                  <motion.span
                    className="grid h-7 w-7 place-items-center"
                    key={likeBounceKey}
                    initial={false}
                    animate={
                      reducedMotion || likeBounceKey === 0
                        ? { scale: 1 }
                        : { scale: [1, 1.12, 1] }
                    }
                    transition={{ duration: 0.34, ease: [0.34, 1.45, 0.64, 1] }}
                  >
                    <FigmaRasterIcon
                      src={figmaSocialIcons.feedLike}
                      size={28}
                      className={liked ? "opacity-100 drop-shadow-[0_0_6px_rgba(254,177,1,0.35)]" : "opacity-90"}
                    />
                  </motion.span>
                  <span>{benefitedCount >= 1000 ? `${(benefitedCount / 1000).toFixed(0)}K` : benefitedCount}</span>
                </motion.button>
                <motion.button
                  type="button"
                  className="flex items-center gap-1 border-none bg-transparent p-0 text-base font-medium leading-5 text-white"
                  aria-label={commentsOpen ? "Hide comments" : "Comments"}
                  aria-expanded={commentsOpen}
                  onClick={() => setCommentsOpen((open) => !open)}
                  {...likeTapProps}
                >
                  <span className="grid h-7 w-7 place-items-center">
                    <FigmaRasterIcon src={figmaSocialIcons.feedComment} size={28} />
                  </span>
                  <span>{commentCount >= 1000 ? `${(commentCount / 1000).toFixed(1)}K` : commentCount}</span>
                </motion.button>
                <span className="flex items-center gap-1 text-base font-medium leading-5 text-white">
                  <span className="grid h-7 w-7 place-items-center">
                    <FigmaRasterIcon src={figmaSocialIcons.feedSave} size={28} />
                  </span>
                  <span>{item.reflect_later_count || 0}</span>
                </span>
              </div>
            </div>
            {hasAttachedProduct ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs font-semibold text-white">{item.attached_product_title || "Creator product"}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-white/70">
                    {formatMinorCurrency(
                      Number(item.attached_product_price_minor || 0),
                      item.attached_product_currency || "usd"
                    )}
                  </p>
                  <button
                    type="button"
                    className="rounded-full border border-social-accent/60 bg-social-accent/15 px-3 py-1 text-xs font-semibold text-social-accent"
                    onClick={openAttachedCheckout}
                  >
                    {attachedProductType === "digital" ? "Buy" : "View"}
                  </button>
                </div>
              </div>
            ) : null}
            {commentsOpen ? (
              <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
                <PostCommentsBlock
                  postId={item.id}
                  compact
                  onCommentCountDelta={(delta) => setCommentCount((c) => Math.max(0, c + delta))}
                />
              </div>
            ) : null}
          </div>
        </article>
        {handoffDialog}
      </>
    );
  }

  if (layout === "home") {
    return (
      <>
      <article className="feed-card-root group surface-card overflow-hidden rounded-[1.45rem] p-0">
        <header className="flex items-center justify-between px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-black/10 bg-surface text-[10px] font-semibold"
              aria-hidden="true"
            >
              {authorAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={authorAvatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
              ) : (
                initials || "U"
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">{item.author_display_name}</p>
              <p className="truncate text-xs text-muted">
                {item.sponsored ? `${item.sponsored_label || "Sponsored"} - ` : ""}
                {feedPostTypeLabel(item.post_type)} -{" "}
                {new Date(item.created_at).toLocaleString()}
              </p>
            </div>
          </div>
          <button
            className="rounded-pill border border-black/10 px-3 py-1 text-xs font-medium text-muted transition hover:bg-black/[0.04] hover:text-text"
            onClick={() => onToggleFollow?.(item.author_id, isFollowing)}
            disabled={followBusy}
          >
            {followBusy ? "..." : isFollowing ? "Unfollow" : "Follow"}
          </button>
        </header>

        {canRenderMedia ? (
          <div className="overflow-hidden">
            {isImageMedia(item) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mediaUrl}
                alt={`${item.author_display_name} post media`}
                className="feed-card-media-inner feed-media-frame-home w-full"
                onError={() => setMediaFailed(true)}
              />
            ) : (
              <video
                controls
                className="feed-card-media-inner feed-media-frame-home w-full"
                onError={() => setMediaFailed(true)}
              >
                <source src={mediaUrl} />
              </video>
            )}
          </div>
        ) : (
          <div className="feed-media-frame-home flex items-center justify-center px-5 text-center text-sm text-muted">
            {item.media_url
              ? "Media unavailable right now"
              : feedReflectionLabel(item.post_type)}
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 text-muted">
            <motion.button
              type="button"
              className="feed-action h-8 w-8 border-none"
              onClick={() => likeMutation.mutate(!liked)}
              disabled={likeMutation.isPending}
              aria-label="Like post"
              {...likeTapProps}
            >
              {likeHeart}
            </motion.button>
            <motion.button
              type="button"
              className="feed-action h-8 w-8 border-none"
              aria-label={commentsOpen ? "Hide comments" : "Comment"}
              aria-expanded={commentsOpen}
              onClick={() => setCommentsOpen((open) => !open)}
              {...likeTapProps}
            >
              <span aria-hidden="true">◌</span>
            </motion.button>
            <button type="button" className="feed-action h-8 w-8 border-none" aria-label="Share">
              <span aria-hidden="true">➤</span>
            </button>
          </div>
          <button type="button" className="feed-action h-8 w-8 border-none" aria-label="Save">
            <span aria-hidden="true">⌑</span>
          </button>
        </div>

        <div className="space-y-1 px-4 pb-4">
          {hasAttachedProduct ? (
            <div className="rounded-control border border-black/10 bg-surface p-2">
              <p className="text-xs font-semibold text-text">{item.attached_product_title || "Creator product"}</p>
              <div className="mt-1 flex items-center justify-between">
                <p className="text-xs text-muted">
                  {formatMinorCurrency(
                    Number(item.attached_product_price_minor || 0),
                    item.attached_product_currency || "usd"
                  )}
                </p>
                <button
                  className="btn-secondary px-3 py-1 text-xs"
                  onClick={openAttachedCheckout}
                >
                  {attachedProductType === "digital" ? "Buy" : "View offer"}
                </button>
              </div>
            </div>
          ) : null}
          {item.cta_label && item.cta_url ? (
            <button
              className="btn-secondary w-full px-3 py-2 text-xs"
              onClick={async () => {
                await apiRequest("/interactions/cta-click", {
                  method: "POST",
                  auth: true,
                  body: { postId: item.id }
                }).catch(() => null);
                if (item.sponsored && item.ad_campaign_id) {
                  await apiRequest("/ads/events/click", {
                    method: "POST",
                    auth: true,
                    body: { campaignId: item.ad_campaign_id, destinationUrl: item.cta_url }
                  }).catch(() => null);
                }
                window.open(item.cta_url || "", "_blank", "noopener,noreferrer");
              }}
            >
              {item.cta_label}
            </button>
          ) : null}
          <p className="text-xs text-muted">
            {benefitedCount} likes · {commentCount} comments
          </p>
          {commentsOpen ? (
            <div className="rounded-control border border-black/10 bg-surface/60 p-3">
              <PostCommentsBlock
                postId={item.id}
                compact
                onCommentCountDelta={(delta) => setCommentCount((c) => Math.max(0, c + delta))}
              />
            </div>
          ) : null}
          {item.audience_target ? (
            <p className="text-[11px] text-muted">
              {item.audience_target === "b2b"
                ? "B2B"
                : item.audience_target === "b2c"
                  ? "B2C"
                  : "B2B/B2C"}
              {item.business_category ? ` - ${item.business_category.replace(/_/g, " ")}` : ""}
            </p>
          ) : null}
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
      {handoffDialog}
      </>
    );
  }

  return (
    <>
    <article className="feed-card-root group surface-card overflow-hidden rounded-[1.5rem] p-0">
      <header className="flex items-center justify-between gap-3 px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/10 bg-surface text-xs font-semibold"
            aria-hidden="true"
          >
            {authorAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={authorAvatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
            ) : (
              initials || "U"
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">{item.author_display_name}</p>
            <time className="text-xs text-muted" dateTime={item.created_at}>
              {item.sponsored ? `${item.sponsored_label || "Sponsored"} - ` : ""}
              {new Date(item.created_at).toLocaleString()}
            </time>
          </div>
        </div>
        <button
          className="rounded-pill border border-black/10 px-3 py-1 text-xs font-medium text-muted transition hover:bg-black/[0.04] hover:text-text"
          onClick={() => onToggleFollow?.(item.author_id, isFollowing)}
          disabled={followBusy}
        >
          {followBusy ? "Updating..." : isFollowing ? "Unfollow" : "Follow"}
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
              className="feed-card-media-inner feed-media-frame w-full"
              onError={() => setMediaFailed(true)}
            />
          ) : (
            <video
              controls
              className="feed-card-media-inner feed-media-frame w-full"
              onError={() => setMediaFailed(true)}
            >
              <source src={mediaUrl} />
            </video>
          )
        ) : (
          <div className="feed-media-frame flex items-center justify-center px-5 text-center text-sm text-muted">
            {item.media_url
              ? "Media unavailable right now"
              : feedReflectionLabel(item.post_type)}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-6 pb-3 text-muted">
        <motion.button
          type="button"
          className="feed-action"
          aria-label={liked ? "Unlike" : "Like"}
          onClick={() => likeMutation.mutate(!liked)}
          disabled={likeMutation.isPending}
          {...likeTapProps}
        >
          {likeHeart}
        </motion.button>
        <motion.button
          type="button"
          className="feed-action"
          aria-label={commentsOpen ? "Hide comments" : "Comment"}
          aria-expanded={commentsOpen}
          onClick={() => setCommentsOpen((open) => !open)}
          {...likeTapProps}
        >
          <span aria-hidden="true">◌</span>
        </motion.button>
        <button type="button" className="feed-action" aria-label="Share">
          <span aria-hidden="true">➤</span>
        </button>
        <button className="rounded-pill border border-black/10 px-3 py-1 text-xs font-medium text-muted transition hover:bg-black/[0.04] hover:text-text">
          Collab
        </button>
      </div>

      {hasAttachedProduct ? (
        <div className="mx-6 mb-3 rounded-control border border-black/10 bg-surface px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">{item.attached_product_title || "Creator product"}</p>
              <p className="text-xs text-muted">
                {formatMinorCurrency(
                  Number(item.attached_product_price_minor || 0),
                  item.attached_product_currency || "usd"
                )}
              </p>
            </div>
            <button className="btn-secondary px-3 py-1.5 text-xs" onClick={openAttachedCheckout}>
              {attachedProductType === "digital" ? "Buy now" : "View offer"}
            </button>
          </div>
        </div>
      ) : null}
      {item.cta_label && item.cta_url ? (
        <div className="mx-6 mb-3">
          <button
            className="btn-secondary w-full px-3 py-2 text-xs"
            onClick={async () => {
              await apiRequest("/interactions/cta-click", {
                method: "POST",
                auth: true,
                body: { postId: item.id }
              }).catch(() => null);
              if (item.sponsored && item.ad_campaign_id) {
                await apiRequest("/ads/events/click", {
                  method: "POST",
                  auth: true,
                  body: { campaignId: item.ad_campaign_id, destinationUrl: item.cta_url }
                }).catch(() => null);
              }
              window.open(item.cta_url || "", "_blank", "noopener,noreferrer");
            }}
          >
            {item.cta_label}
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 px-6 pb-4 text-xs text-muted">
        <span className="rounded-pill border border-black/10 px-2 py-1">
          Likes: {benefitedCount}
        </span>
        <span className="rounded-pill border border-black/10 px-2 py-1">
          Comments: {commentCount}
        </span>
        <span className="rounded-pill border border-black/10 px-2 py-1">
          Reflect later: {item.reflect_later_count || 0}
        </span>
        {item.tags?.length ? (
          <span className="rounded-pill border border-black/10 px-2 py-1">
            #{item.tags.slice(0, 3).join(" #")}
          </span>
        ) : null}
      </div>

      {commentsOpen ? (
        <div className="mx-6 mb-4 rounded-control border border-black/10 bg-surface/60 px-3 py-3">
          <PostCommentsBlock
            postId={item.id}
            onCommentCountDelta={(delta) => setCommentCount((c) => Math.max(0, c + delta))}
          />
        </div>
      ) : null}

      <footer className="flex items-center justify-between border-t border-black/10 px-6 py-3">
        <Link href={`/posts/${item.id}`} className="btn-secondary px-3 py-1.5 text-xs">
          Open post
        </Link>
        <Link href={`/users/${item.author_id}`} className="text-xs font-medium text-text hover:underline">
          View profile
        </Link>
      </footer>
    </article>
    {handoffDialog}
    </>
  );
}
