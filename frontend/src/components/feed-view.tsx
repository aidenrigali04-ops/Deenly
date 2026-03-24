"use client";

import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { FeedCard } from "@/components/feed-card";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import type { FeedItem } from "@/types";

type FeedResponse = {
  items: FeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

type FeedViewProps = {
  heading: string;
  fixedPostType?: "" | "recitation" | "community" | "short_video";
};

export function FeedView({ heading, fixedPostType = "" }: FeedViewProps) {
  const [postType, setPostType] = useState(fixedPostType);
  const [followingOnly, setFollowingOnly] = useState(false);

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
    <section className="space-y-4">
      <div className="surface-card flex flex-wrap items-center gap-3">
        <h1 className="mr-auto section-title">{heading}</h1>
        {!fixedPostType ? (
          <select
            className="input max-w-44"
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
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={followingOnly}
            onChange={(event) => setFollowingOnly(event.target.checked)}
            aria-label="Following only"
          />
          Following only
        </label>
      </div>

      {feedQuery.isLoading ? <LoadingState label="Loading feed..." /> : null}
      {feedQuery.error ? (
        <ErrorState message={(feedQuery.error as Error).message} onRetry={() => feedQuery.refetch()} />
      ) : null}
      {!feedQuery.isLoading && !feedQuery.error && items.length === 0 ? (
        <EmptyState title="No posts yet" subtitle="Try changing filters or be the first to share." />
      ) : null}

      <div className="space-y-4">
        {items.map((item) => (
          <FeedCard key={item.id} item={item} />
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
    </section>
  );
}
