"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { FeedCard } from "@/components/feed-card";
import { HomeStoriesRow } from "@/components/home-stories-row";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { useSessionStore } from "@/store/session-store";
import type { FeedItem } from "@/types";

type FeedResponse = {
  items: FeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

type FeedViewProps = {
  heading: string;
  fixedPostType?: "" | "recitation" | "community" | "short_video";
  showStories?: boolean;
  homeStyle?: boolean;
};

function FeedSkeletonList({ homeStyle = false }: { homeStyle?: boolean }) {
  if (homeStyle) {
    return (
      <div className="space-y-3" aria-hidden="true">
        {[0, 1].map((key) => (
          <article key={key} className="surface-card overflow-hidden rounded-[1.45rem] p-0">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="skeleton h-8 w-8 rounded-full" />
                <div className="space-y-1.5">
                  <div className="skeleton h-3 w-24" />
                  <div className="skeleton h-2.5 w-36" />
                </div>
              </div>
              <div className="skeleton h-6 w-6 rounded-full" />
            </div>
            <div className="skeleton feed-media-frame-home w-full rounded-none" />
            <div className="px-4 py-3">
              <div className="skeleton h-3 w-40" />
              <div className="mt-2 skeleton h-3 w-full" />
            </div>
          </article>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4" aria-hidden="true">
      {[0, 1].map((key) => (
        <article key={key} className="surface-card space-y-4">
          <div className="flex items-center gap-3">
            <div className="skeleton h-9 w-9 rounded-full" />
            <div className="space-y-2">
              <div className="skeleton h-3 w-28" />
              <div className="skeleton h-3 w-40" />
            </div>
          </div>
          <div className="skeleton h-3 w-20" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-44 w-full" />
          <div className="grid grid-cols-2 gap-2">
            <div className="skeleton h-9 w-full" />
            <div className="skeleton h-9 w-full" />
          </div>
        </article>
      ))}
    </div>
  );
}

export function FeedView({
  heading,
  fixedPostType = "",
  showStories = false,
  homeStyle = false
}: FeedViewProps) {
  const [postType, setPostType] = useState(fixedPostType);
  const [followingOnly, setFollowingOnly] = useState(false);
  const user = useSessionStore((state) => state.user);

  const feedQueryKey = useMemo(
    () => ["feed", postType, followingOnly] as const,
    [postType, followingOnly]
  );

  const feedQuery = useInfiniteQuery({
    queryKey: feedQueryKey,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams();
      query.set("limit", "10");
      if (pageParam) {
        query.set("cursor", String(pageParam));
      }
      if (postType) {
        query.set("postType", postType);
      }
      if (followingOnly) {
        query.set("followingOnly", "true");
      }
      return apiRequest<FeedResponse>(`/feed?${query.toString()}`, {
        auth: true
      });
    },
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined
  });

  const items = feedQuery.data?.pages.flatMap((page) => page.items) || [];

  return (
    <section className={`space-y-3 md:space-y-4 ${homeStyle ? "mx-auto max-w-[680px]" : ""}`}>
      <header className="surface-card sticky top-4 z-10 space-y-3 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="section-title text-base sm:text-lg">{heading}</h1>
          <div className="flex items-center gap-2">
            <Link href="/search" className="btn-secondary px-3 py-2 text-xs" aria-label="Quick search">
              Search
            </Link>
            <Link
              href="/notifications"
              className="btn-secondary px-3 py-2 text-xs"
              aria-label="Open notifications"
            >
              Alerts
            </Link>
            <Link href="/dhikr" className="btn-secondary px-3 py-2 text-xs" aria-label="Open Dhikr mode">
              Dhikr
            </Link>
          </div>
        </div>
        <div className={`subtle-divider pt-3 ${homeStyle ? "hidden" : ""}`}>
          <div className="flex flex-wrap items-center gap-3">
            {!fixedPostType ? (
              <select
                className="input max-w-44 py-2 text-xs"
                value={postType}
                onChange={(event) =>
                  setPostType(event.target.value as "" | "recitation" | "community" | "short_video")
                }
              >
                <option value="">All types</option>
                <option value="recitation">Recitation</option>
                <option value="community">Community</option>
                <option value="short_video">Short video</option>
              </select>
            ) : null}
            <label className="flex items-center gap-2 text-xs sm:text-sm text-muted">
              <input
                type="checkbox"
                checked={followingOnly}
                onChange={(event) => setFollowingOnly(event.target.checked)}
                aria-label="Following only"
              />
              Following only
            </label>
          </div>
        </div>
      </header>

      {showStories ? <HomeStoriesRow /> : null}

      <div className={`grid gap-3 ${homeStyle ? "" : "xl:grid-cols-[minmax(0,620px)_240px] xl:justify-center xl:gap-6"}`}>
        <div className="space-y-4 md:space-y-5">
          {feedQuery.isLoading ? (
            <>
              <LoadingState label="Loading feed..." />
              <FeedSkeletonList homeStyle={homeStyle} />
            </>
          ) : null}
          {feedQuery.error ? (
            <ErrorState message={(feedQuery.error as Error).message} onRetry={() => feedQuery.refetch()} />
          ) : null}
          {!feedQuery.isLoading && !feedQuery.error && items.length === 0 ? (
            <EmptyState title="No posts yet" subtitle="Try changing filters or be the first to share." />
          ) : null}

          <div className={homeStyle ? "space-y-3" : "space-y-5"}>
            {items.map((item) => (
              <FeedCard key={item.id} item={item} layout={homeStyle ? "home" : "default"} />
            ))}
          </div>

          {feedQuery.hasNextPage ? (
            <button
              className="btn-secondary w-full"
              disabled={feedQuery.isFetchingNextPage}
              onClick={() => feedQuery.fetchNextPage()}
            >
              {feedQuery.isFetchingNextPage ? "Loading more..." : "Load more"}
            </button>
          ) : null}
        </div>

        <aside className={`hidden space-y-3 xl:block ${homeStyle ? "xl:hidden" : ""}`}>
          <div className="surface-card space-y-2">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Signed in as</p>
            <p className="text-sm font-medium">{user?.email || "Guest"}</p>
            <p className="text-xs text-muted">@{user?.username || "user"}</p>
          </div>
          <div className="surface-card space-y-2">
            <h2 className="text-sm font-semibold">Reflective prompt</h2>
            <p className="text-sm text-muted">
              Pause before you scroll: what is one thing you want to benefit from today?
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
