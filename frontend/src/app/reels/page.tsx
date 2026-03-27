"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { followUser, unfollowUser } from "@/lib/follows";
import { resolveMediaUrl } from "@/lib/media-url";
import type { FeedItem } from "@/types";

type FeedResponse = {
  items: FeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

function ReelSlide({
  item,
  active,
  muted,
  onToggleMute,
  onToggleFollow,
  onLike,
  followBusy,
  likeBusy
}: {
  item: FeedItem;
  active: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onToggleFollow: () => void;
  onLike: () => void;
  followBusy: boolean;
  likeBusy: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (active) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [active]);

  useEffect(() => {
    const el = videoRef.current;
    if (el) {
      el.muted = muted;
    }
  }, [muted]);

  const src = resolveMediaUrl(item.media_url) || undefined;
  const following = Boolean(item.is_following_author);
  const liked = Boolean(item.liked_by_viewer);

  return (
    <div className="relative flex h-dvh w-full shrink-0 snap-start snap-always flex-col bg-black">
      {src ? (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-contain"
          src={src}
          playsInline
          loop
          muted={muted}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-white/70">No video</div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] bg-gradient-to-t from-black/80 via-black/20 to-transparent pb-10 pt-24">
        <div className="pointer-events-auto mx-auto flex max-w-lg flex-col gap-3 px-4">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Link
                href={`/users/${item.author_id}`}
                className="text-sm font-semibold text-white drop-shadow"
              >
                {item.author_display_name}
              </Link>
              <p className="mt-1 line-clamp-3 text-sm text-white/90 drop-shadow">{item.content}</p>
            </div>
            <div className="flex shrink-0 flex-col items-center gap-2">
              <button
                type="button"
                className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white backdrop-blur"
                disabled={likeBusy}
                onClick={onLike}
              >
                {liked ? "Liked" : "Like"}
              </button>
              <button
                type="button"
                className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white backdrop-blur"
                disabled={followBusy}
                onClick={onToggleFollow}
              >
                {following ? "Following" : "Follow"}
              </button>
              <button
                type="button"
                className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white backdrop-blur"
                aria-label={muted ? "Unmute" : "Mute"}
                onClick={onToggleMute}
              >
                {muted ? "Unmute" : "Mute"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReelsPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const queryClient = useQueryClient();
  const feedQueryKey = ["feed", "reels-surface"] as const;

  const feedQuery = useInfiniteQuery({
    queryKey: feedQueryKey,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams();
      query.set("limit", "8");
      query.set("feedTab", "reels");
      if (pageParam) {
        query.set("cursor", String(pageParam));
      }
      return apiRequest<FeedResponse>(`/feed?${query.toString()}`, { auth: true });
    },
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined
  });

  const items = feedQuery.data?.pages.flatMap((p) => p.items) ?? [];

  const followMutation = useMutation({
    mutationFn: ({ authorId, nextFollowing }: { authorId: number; nextFollowing: boolean }) =>
      nextFollowing ? followUser(authorId) : unfollowUser(authorId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: feedQueryKey });
    }
  });

  const likeMutation = useMutation({
    mutationFn: ({ postId, nextLiked }: { postId: number; nextLiked: boolean }) =>
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: feedQueryKey });
    }
  });

  const updateActiveFromScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const h = el.clientHeight || 1;
    const idx = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / h)));
    setActiveIndex(idx);
  }, [items.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateActiveFromScroll, { passive: true });
    return () => el.removeEventListener("scroll", updateActiveFromScroll);
  }, [updateActiveFromScroll]);

  useEffect(() => {
    if (activeIndex >= items.length - 2 && feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) {
      void feedQuery.fetchNextPage();
    }
  }, [activeIndex, items.length, feedQuery]);

  return (
    <div className="fixed inset-0 z-50 bg-black text-white">
      <div className="absolute left-3 top-3 z-[3] flex gap-2">
        <Link
          href="/home"
          className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white backdrop-blur"
        >
          Back
        </Link>
        <Link
          href="/create/reel"
          className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white backdrop-blur"
        >
          New reel
        </Link>
      </div>

      {feedQuery.isLoading ? (
        <div className="flex h-full items-center justify-center">
          <LoadingState label="Loading reels..." />
        </div>
      ) : null}
      {feedQuery.error ? (
        <div className="flex h-full items-center justify-center px-4">
          <ErrorState
            message={(feedQuery.error as Error).message}
            onRetry={() => feedQuery.refetch()}
          />
        </div>
      ) : null}

      {!feedQuery.isLoading && !feedQuery.error && items.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
          <EmptyState title="No reels yet" subtitle="Be the first to post a vertical video reel." />
          <Link href="/create/reel" className="btn-primary text-sm">
            Create a reel
          </Link>
        </div>
      ) : null}

      {!feedQuery.isLoading && !feedQuery.error && items.length > 0 ? (
        <div
          ref={scrollRef}
          className="h-dvh snap-y snap-mandatory overflow-y-scroll overscroll-y-contain"
          style={{ scrollBehavior: "smooth" }}
        >
          {items.map((item, index) => (
            <ReelSlide
              key={item.id}
              item={item}
              active={index === activeIndex}
              muted={muted}
              onToggleMute={() => setMuted((m) => !m)}
              onToggleFollow={() => {
                const next = !item.is_following_author;
                followMutation.mutate({ authorId: item.author_id, nextFollowing: next });
              }}
              onLike={() =>
                likeMutation.mutate({ postId: item.id, nextLiked: !item.liked_by_viewer })
              }
              followBusy={followMutation.isPending}
              likeBusy={likeMutation.isPending}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
