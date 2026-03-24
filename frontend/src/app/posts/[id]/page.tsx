"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import type { FeedItem } from "@/types";

type PostDetail = FeedItem & {
  view_count?: number;
  avg_watch_time_ms?: number;
  avg_completion_rate?: number;
};

export default function PostDetailPage() {
  const params = useParams<{ id: string }>();
  const postId = Number(params.id);
  const [comment, setComment] = useState("");
  const [reportReason, setReportReason] = useState("");

  const postQuery = useQuery({
    queryKey: ["post-detail", postId],
    queryFn: () => apiRequest<PostDetail>(`/posts/${postId}`),
    enabled: Number.isFinite(postId)
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

  const stats = useMemo(() => {
    const post = postQuery.data;
    if (!post) {
      return null;
    }
    return [
      `Benefited: ${post.benefited_count || 0}`,
      `Comments: ${post.comment_count || 0}`,
      `Views: ${post.view_count || 0}`,
      `Avg watch: ${post.avg_watch_time_ms || 0}ms`,
      `Completion: ${post.avg_completion_rate || 0}%`
    ];
  }, [postQuery.data]);

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

  return (
    <section className="space-y-4">
      <article className="surface-card space-y-3">
        <div className="flex items-center justify-between text-sm text-muted">
          <span>{post.author_display_name}</span>
          <time dateTime={post.created_at}>{new Date(post.created_at).toLocaleString()}</time>
        </div>
        <h1 className="section-title">{post.content}</h1>
        {post.media_url ? (
          <video controls className="w-full rounded-xl border border-white/10">
            <source src={post.media_url} />
          </video>
        ) : null}
        <div className="flex flex-wrap gap-2 text-xs text-muted">
          {stats?.map((value) => (
            <span key={value} className="rounded-full border border-white/10 px-2 py-1">
              {value}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-secondary"
            onClick={() => interact.mutate({ interactionType: "benefited" })}
          >
            Benefited
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
        </div>
      </article>

      <form
        className="surface-card space-y-2"
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
        className="surface-card space-y-2"
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
          <p className="text-xs text-accent">Report submitted.</p>
        ) : null}
      </form>
    </section>
  );
}
