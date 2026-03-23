"use client";

import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { fetchSessionMe } from "@/lib/auth";
import { getAccessToken } from "@/lib/storage";
import { FeedCard } from "@/components/feed-card";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { useSessionStore } from "@/store/session-store";
import type { FeedItem } from "@/types";

type FeedResponse = {
  items: FeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

export default function FeedPage() {
  const setUser = useSessionStore((state) => state.setUser);
  const [postType, setPostType] = useState("");
  const [followingOnly, setFollowingOnly] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      return;
    }
    fetchSessionMe()
      .then((user) => setUser(user))
      .catch(() => undefined);
  }, [setUser]);

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

  const sessionQuery = useQuery({
    queryKey: ["session-me"],
    queryFn: () => fetchSessionMe(),
    enabled: Boolean(getAccessToken()),
    retry: false
  });

  const items = feedQuery.data?.pages.flatMap((page) => page.items) || [];

  return (
    <section className="space-y-4">
      <div className="surface-card flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-semibold">Feed</h1>
        <select
          className="input max-w-44"
          value={postType}
          onChange={(event) => setPostType(event.target.value)}
        >
          <option value="">All types</option>
          <option value="recitation">Recitation</option>
          <option value="community">Community</option>
          <option value="short_video">Short video</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={followingOnly}
            onChange={(event) => setFollowingOnly(event.target.checked)}
          />
          Following only
        </label>
      </div>

      {sessionQuery.error ? (
        <ErrorState message="Session check failed. You can still browse public feed." />
      ) : null}

      {feedQuery.isLoading ? <LoadingState label="Loading feed..." /> : null}
      {feedQuery.error ? (
        <ErrorState
          message={(feedQuery.error as Error).message}
          onRetry={() => feedQuery.refetch()}
        />
      ) : null}
      {!feedQuery.isLoading && !feedQuery.error && items.length === 0 ? (
        <EmptyState
          title="No posts yet"
          subtitle="Try changing filters or be the first to share a beneficial post."
        />
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
