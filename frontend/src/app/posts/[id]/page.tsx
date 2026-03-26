"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { resolveMediaUrl } from "@/lib/media-url";
import type { FeedItem } from "@/types";
import {
  createProductCheckout,
  fetchPostDistribution,
  fetchProductAccess,
  formatMinorCurrency,
  requestProductDownloadLink
} from "@/lib/monetization";
import { useSessionStore } from "@/store/session-store";

type PostDetail = FeedItem & {
  view_count?: number;
  avg_watch_time_ms?: number;
  avg_completion_rate?: number;
};

function isImageMedia(post: PostDetail) {
  if (post.media_mime_type?.startsWith("image/")) {
    return true;
  }
  if (!post.media_url) {
    return false;
  }
  return /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(post.media_url);
}

export default function PostDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const postId = Number(params.id);
  const sessionUser = useSessionStore((state) => state.user);
  const [comment, setComment] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [mediaFailed, setMediaFailed] = useState(false);
  const [liked, setLiked] = useState(false);
  const [benefitedCount, setBenefitedCount] = useState(0);

  const postQuery = useQuery({
    queryKey: ["post-detail", postId],
    queryFn: () => apiRequest<PostDetail>(`/posts/${postId}`),
    enabled: Number.isFinite(postId)
  });

  const distributionQuery = useQuery({
    queryKey: ["post-distribution", postId],
    queryFn: () => fetchPostDistribution(postId),
    enabled:
      Number.isFinite(postId) &&
      Boolean(sessionUser?.id) &&
      Boolean(postQuery.data && postQuery.data.author_id === sessionUser?.id)
  });

  const viewMutation = useMutation({
    mutationFn: (completionRate: number) =>
      apiRequest("/interactions/view", {
        method: "POST",
        auth: true,
        body: {
          postId,
          watchTimeMs: 12000,
          completionRate
        }
      })
  });

  useEffect(() => {
    if (!postQuery.data) {
      return;
    }
    viewMutation.mutate(80);
  }, [postQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setMediaFailed(false);
  }, [postId, postQuery.data?.media_url]);
  useEffect(() => {
    setLiked(Boolean(postQuery.data?.liked_by_viewer));
    setBenefitedCount(Number(postQuery.data?.benefited_count || 0));
  }, [postQuery.data?.liked_by_viewer, postQuery.data?.benefited_count]);

  const interact = useMutation({
    mutationFn: (payload: { interactionType: string; commentText?: string }) =>
      apiRequest("/interactions", {
        method: "POST",
        auth: true,
        body: { postId, ...payload }
      }),
    onSuccess: () => postQuery.refetch()
  });

  const reportMutation = useMutation({
    mutationFn: () =>
      apiRequest("/reports", {
        method: "POST",
        auth: true,
        body: {
          targetType: "post",
          targetId: String(postId),
          reason: reportReason,
          notes: ""
        }
      })
  });
  const likeToggleMutation = useMutation({
    mutationFn: (nextLiked: boolean) =>
      nextLiked
        ? apiRequest("/interactions", {
            method: "POST",
            auth: true,
            body: { postId, interactionType: "benefited" }
          })
        : apiRequest("/interactions", {
            method: "DELETE",
            auth: true,
            body: { postId, interactionType: "benefited" }
          }),
    onMutate: (nextLiked) => {
      setLiked(nextLiked);
      setBenefitedCount((value) => Math.max(0, value + (nextLiked ? 1 : -1)));
    },
    onError: (_error, nextLiked) => {
      setLiked(!nextLiked);
      setBenefitedCount((value) => Math.max(0, value + (nextLiked ? -1 : 1)));
    }
  });
  const deletePostMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/posts/${postId}`, {
        method: "DELETE",
        auth: true
      }),
    onSuccess: () => {
      router.push("/");
    }
  });

  const stats = useMemo(() => {
    const post = postQuery.data;
    if (!post) {
      return null;
    }
    return [
      `Benefited: ${benefitedCount}`,
      `Comments: ${post.comment_count || 0}`,
      `Views: ${post.view_count || 0}`,
      `Avg watch: ${post.avg_watch_time_ms || 0}ms`,
      `Completion: ${post.avg_completion_rate || 0}%`
    ];
  }, [postQuery.data, benefitedCount]);
  const productId = Number(postQuery.data?.attached_product_id || 0) || null;
  const productAccessQuery = useQuery({
    queryKey: ["post-product-access", productId],
    queryFn: () => fetchProductAccess(productId as number),
    enabled: Boolean(productId) && Boolean(postQuery.data)
  });
  const productCheckoutMutation = useMutation({
    mutationFn: () => createProductCheckout(productId as number),
    onSuccess: (result) => {
      if (result?.checkoutUrl && typeof window !== "undefined") {
        window.location.assign(result.checkoutUrl);
      }
    }
  });
  const attachedProductType = postQuery.data?.attached_product_type || "digital";
  const attachedProductWebsiteUrl = postQuery.data?.attached_product_website_url || null;
  const downloadMutation = useMutation({
    mutationFn: () => requestProductDownloadLink(productId as number),
    onSuccess: (result) => {
      if (result?.downloadUrl && typeof window !== "undefined") {
        window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
      }
    }
  });

  if (!Number.isFinite(postId)) {
    return <ErrorState message="Invalid post id." />;
  }
  if (postQuery.isLoading) {
    return <LoadingState label="Loading post..." />;
  }
  if (postQuery.error) {
    return <ErrorState message={(postQuery.error as Error).message} onRetry={postQuery.refetch} />;
  }
  if (!postQuery.data) {
    return <EmptyState title="Post not found" />;
  }

  const post = postQuery.data;
  const mediaUrl = resolveMediaUrl(post.media_url) || undefined;
  const canRenderMedia = Boolean(mediaUrl) && !mediaFailed;

  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <article className="surface-card space-y-4">
        <div className="flex items-center justify-between text-sm text-muted">
          <span>{post.author_display_name}</span>
          <time dateTime={post.created_at}>{new Date(post.created_at).toLocaleString()}</time>
        </div>
        <h1 className="section-title">{post.content}</h1>
        {canRenderMedia ? (
          isImageMedia(post) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaUrl}
              alt={`${post.author_display_name} post media`}
              className="w-full rounded-panel border border-black/10 object-cover"
              onError={() => setMediaFailed(true)}
            />
          ) : (
            <video
              controls
              className="w-full rounded-panel border border-black/10"
              onError={() => setMediaFailed(true)}
            >
              <source src={mediaUrl} />
            </video>
          )
        ) : post.media_url ? (
          <p className="text-xs text-muted">Media unavailable right now.</p>
        ) : null}
        <div className="flex flex-wrap gap-2 text-xs text-muted">
          {stats?.map((value) => (
            <span key={value} className="rounded-pill border border-black/10 px-2 py-1">
              {value}
            </span>
          ))}
        </div>
        {distributionQuery.data ? (
          <div className="rounded-panel border border-black/10 bg-surface p-3 text-xs">
            <p className="font-semibold text-text">Distribution (author only)</p>
            <p className="mt-1 text-muted">
              Views: {distributionQuery.data.viewCount} · Avg watch: {distributionQuery.data.avgWatchTimeMs} ms ·
              Completion: {distributionQuery.data.avgCompletionRate}%
            </p>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-secondary"
            onClick={() => likeToggleMutation.mutate(!liked)}
            disabled={likeToggleMutation.isPending}
          >
            {liked ? "Unlike" : "Like"}
          </button>
          <button
            className="btn-secondary"
            onClick={() => interact.mutate({ interactionType: "reflect_later" })}
          >
            Reflect Later
          </button>
          <Link className="btn-secondary" href={`/users/${post.author_id}`}>
            Author Profile
          </Link>
          {sessionUser?.id === post.author_id ? (
            <button
              className="btn-secondary"
              onClick={() => deletePostMutation.mutate()}
              disabled={deletePostMutation.isPending}
            >
              {deletePostMutation.isPending ? "Deleting..." : "Delete post"}
            </button>
          ) : null}
        </div>
        {post.cta_label && post.cta_url ? (
          <button
            className="btn-secondary w-full"
            onClick={async () => {
              await apiRequest("/interactions/cta-click", {
                method: "POST",
                auth: true,
                body: { postId }
              }).catch(() => null);
              window.open(post.cta_url || "", "_blank", "noopener,noreferrer");
            }}
          >
            {post.cta_label}
          </button>
        ) : null}
        {productId ? (
          <div className="rounded-panel border border-black/10 bg-surface p-3">
            <p className="text-xs font-semibold text-text">{post.attached_product_title || "Creator product"}</p>
            <p className="mt-1 text-xs text-muted">
              {formatMinorCurrency(
                Number(post.attached_product_price_minor || 0),
                post.attached_product_currency || "usd"
              )}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {productAccessQuery.data?.canAccess ? (
                <button
                  className="btn-primary"
                  onClick={() => downloadMutation.mutate()}
                  disabled={downloadMutation.isPending}
                >
                  {downloadMutation.isPending ? "Preparing..." : "Download"}
                </button>
              ) : (
                <button
                  className="btn-secondary"
                  onClick={() => {
                    if (attachedProductType !== "digital" && attachedProductWebsiteUrl) {
                      window.open(attachedProductWebsiteUrl, "_blank", "noopener,noreferrer");
                      return;
                    }
                    productCheckoutMutation.mutate();
                  }}
                  disabled={productCheckoutMutation.isPending}
                >
                  {productCheckoutMutation.isPending
                    ? "Opening..."
                    : attachedProductType === "digital"
                      ? "Buy product"
                      : "View offer"}
                </button>
              )}
            </div>
          </div>
        ) : null}
      </article>

      <form
        className="surface-card space-y-3"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (!comment.trim()) {
            return;
          }
          interact.mutate({ interactionType: "comment", commentText: comment });
          setComment("");
        }}
      >
        <label className="text-sm font-medium">Add comment</label>
        <textarea
          className="input min-h-24"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Write a respectful comment..."
        />
        <button className="btn-primary" type="submit" disabled={interact.isPending}>
          {interact.isPending ? "Posting..." : "Post comment"}
        </button>
      </form>

      <form
        className="surface-card space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!reportReason.trim()) {
            return;
          }
          reportMutation.mutate();
        }}
      >
        <label className="text-sm font-medium">Report post</label>
        <input
          className="input"
          value={reportReason}
          onChange={(event) => setReportReason(event.target.value)}
          placeholder="Reason"
        />
        <button className="btn-secondary" type="submit" disabled={reportMutation.isPending}>
          {reportMutation.isPending ? "Submitting..." : "Submit report"}
        </button>
        {reportMutation.isSuccess ? (
          <p className="text-xs text-text">Report submitted.</p>
        ) : null}
      </form>
    </section>
  );
}
