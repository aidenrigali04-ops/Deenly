"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiRequest } from "@/lib/api";
import { assistCommentTone } from "@/lib/ai-assist";
import { resolveMediaUrl } from "@/lib/media-url";
import { useSessionStore } from "@/store/session-store";
import type { PostComment, PostCommentsResponse } from "@/types";

type PostCommentsBlockProps = {
  postId: number;
  /** Tighter typography and spacing for feed cards */
  compact?: boolean;
  /** Called with +1 after a successful post, -1 after delete */
  onCommentCountDelta?: (delta: number) => void;
};

export function PostCommentsBlock({ postId, compact = false, onCommentCountDelta }: PostCommentsBlockProps) {
  const queryClient = useQueryClient();
  const sessionUser = useSessionStore((s) => s.user);
  const [draft, setDraft] = useState("");
  const [tonePreview, setTonePreview] = useState<string | null>(null);
  const [toneError, setToneError] = useState("");

  const commentsQuery = useQuery({
    queryKey: ["post-comments", postId],
    queryFn: () =>
      apiRequest<PostCommentsResponse>(`/interactions/post/${postId}/comments?limit=${compact ? 8 : 25}`),
    enabled: Number.isFinite(postId) && postId > 0
  });

  const postMutation = useMutation({
    mutationFn: (text: string) =>
      apiRequest("/interactions", {
        method: "POST",
        auth: true,
        body: { postId, interactionType: "comment", commentText: text }
      }),
    onSuccess: () => {
      setDraft("");
      onCommentCountDelta?.(1);
      queryClient.invalidateQueries({ queryKey: ["post-comments", postId] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["post-detail", postId] });
    }
  });

  const toneMutation = useMutation({
    mutationFn: () => assistCommentTone(draft.trim()),
    onSuccess: (data) => {
      setToneError("");
      setTonePreview(data.suggestion);
    },
    onError: (err: unknown) => {
      const status = err instanceof ApiError ? err.status : 0;
      setToneError(
        status === 503 ? "Writing help is not enabled on this server." : err instanceof Error ? err.message : "Could not suggest."
      );
      setTonePreview(null);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (interactionId: number) =>
      apiRequest(`/interactions/comments/${interactionId}`, {
        method: "DELETE",
        auth: true
      }),
    onSuccess: () => {
      onCommentCountDelta?.(-1);
      queryClient.invalidateQueries({ queryKey: ["post-comments", postId] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["post-detail", postId] });
    }
  });

  const sorted = useMemo(() => {
    const list = commentsQuery.data?.items || [];
    return [...list].reverse();
  }, [commentsQuery.data?.items]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || postMutation.isPending) {
      return;
    }
    postMutation.mutate(text);
  };

  const gap = compact ? "gap-2" : "gap-3";
  const textSize = compact ? "text-xs" : "text-sm";
  const labelCls = compact ? "text-xs font-semibold text-text" : "text-sm font-medium text-text";

  return (
    <div className={`flex flex-col ${gap}`}>
      <form onSubmit={onSubmit} className={`flex flex-col ${gap}`}>
        <label htmlFor={`comment-draft-${postId}`} className={labelCls}>
          Add a comment
        </label>
        <textarea
          id={`comment-draft-${postId}`}
          className={`input min-h-[4.5rem] ${compact ? "py-2 text-xs" : ""}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write something respectful…"
          maxLength={2000}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className={compact ? "btn-primary px-3 py-1.5 text-xs" : "btn-primary"}
            disabled={postMutation.isPending || !draft.trim()}
          >
            {postMutation.isPending ? "Posting…" : "Post"}
          </button>
          <button
            type="button"
            className={compact ? "btn-secondary px-3 py-1.5 text-xs" : "btn-secondary"}
            disabled={toneMutation.isPending || !draft.trim()}
            onClick={() => toneMutation.mutate()}
          >
            {toneMutation.isPending ? "…" : "Softer wording"}
          </button>
        </div>
        {toneError ? <p className="text-xs text-red-600 dark:text-red-400">{toneError}</p> : null}
        {tonePreview ? (
          <div className={`rounded-control border border-black/10 bg-surface/80 ${compact ? "p-2" : "p-3"}`}>
            <p className={`font-medium text-text ${compact ? "text-xs" : "text-sm"}`}>Alternative (AI)</p>
            <p className={`mt-1 whitespace-pre-wrap text-muted ${compact ? "text-xs" : "text-sm"}`}>{tonePreview}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className={compact ? "btn-primary px-2 py-1 text-xs" : "btn-primary px-3 py-1.5 text-xs"}
                onClick={() => {
                  setDraft(tonePreview);
                  setTonePreview(null);
                }}
              >
                Use this
              </button>
              <button
                type="button"
                className={compact ? "btn-secondary px-2 py-1 text-xs" : "btn-secondary px-3 py-1.5 text-xs"}
                onClick={() => setTonePreview(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}
        {postMutation.isError ? (
          <p className="text-xs text-red-600 dark:text-red-400">Could not post. Try again.</p>
        ) : null}
      </form>

      {commentsQuery.isLoading ? (
        <p className={`${textSize} text-muted`}>Loading comments…</p>
      ) : commentsQuery.isError ? (
        <p className={`${textSize} text-muted`}>Comments unavailable.</p>
      ) : sorted.length === 0 ? (
        <p className={`${textSize} text-muted`}>No comments yet. Start the thread.</p>
      ) : (
        <ul className={`flex flex-col ${compact ? "gap-2" : "gap-3"}`}>
          {sorted.map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              compact={compact}
              canDelete={Boolean(sessionUser?.id === c.user_id)}
              onDelete={() => deleteMutation.mutate(c.id)}
              deleteBusy={deleteMutation.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CommentRow({
  comment,
  compact,
  canDelete,
  onDelete,
  deleteBusy
}: {
  comment: PostComment;
  compact: boolean;
  canDelete: boolean;
  onDelete: () => void;
  deleteBusy: boolean;
}) {
  const avatar = resolveMediaUrl(comment.commenter_avatar_url) || undefined;
  const initials = comment.commenter_display_name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <li
      className={`flex gap-2 rounded-control border border-black/10 bg-surface/80 ${
        compact ? "px-2 py-2" : "px-3 py-2.5"
      }`}
    >
      <span
        className={`grid shrink-0 place-items-center rounded-full border border-black/10 bg-surface ${
          compact ? "h-7 w-7 text-[9px] font-semibold" : "h-9 w-9 text-[10px] font-semibold"
        }`}
        aria-hidden
      >
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" className="h-full w-full rounded-full object-cover" />
        ) : (
          initials || "?"
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={`font-semibold ${compact ? "text-xs" : "text-sm"}`}>
            {comment.commenter_display_name}
          </span>
          <time
            className={`text-muted ${compact ? "text-[10px]" : "text-xs"}`}
            dateTime={comment.created_at}
          >
            {new Date(comment.created_at).toLocaleString()}
          </time>
        </div>
        <p className={`mt-0.5 whitespace-pre-wrap text-text/95 ${compact ? "text-xs leading-relaxed" : "text-sm leading-relaxed"}`}>
          {comment.comment_text}
        </p>
        {canDelete ? (
          <button
            type="button"
            className={`mt-1 text-muted underline-offset-2 hover:text-text hover:underline ${
              compact ? "text-[10px]" : "text-xs"
            }`}
            onClick={onDelete}
            disabled={deleteBusy}
          >
            {deleteBusy ? "Removing…" : "Remove"}
          </button>
        ) : null}
      </div>
    </li>
  );
}
