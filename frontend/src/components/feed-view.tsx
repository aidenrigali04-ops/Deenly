"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { apiRequest } from "@/lib/api";
import { FeedCard } from "@/components/feed-card";
import { HomeStoriesRow } from "@/components/home-stories-row";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { useSessionStore } from "@/store/session-store";
import type { FeedItem } from "@/types";
import { followUser, unfollowUser } from "@/lib/follows";

type FeedResponse = {
  items: FeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

type FeedTabId = "for_you" | "opportunities" | "marketplace";

const FEED_STAGGER_FIRST = 14;

const feedListContainerVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.055, delayChildren: 0.02 }
  }
};

const feedListItemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }
  }
};

const feedListItemInstant = {
  hidden: { opacity: 1, y: 0 },
  show: { opacity: 1, y: 0 }
};

type FeedViewProps = {
  heading: string;
  /** When set, feed only loads this post type. */
  fixedPostType?: "" | "post" | "marketplace" | "reel";
  /** When set, feed is locked to this tab and tab pills are hidden (e.g. /marketplace). */
  fixedFeedTab?: FeedTabId;
  /** Shown under the heading when provided. */
  feedSubtitle?: string;
  showStories?: boolean;
  homeStyle?: boolean;
  /** Applied once when the home feed loads (from saved profile preference). */
  initialFeedTab?: FeedTabId;
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
  fixedFeedTab,
  feedSubtitle,
  showStories = false,
  homeStyle = false,
  initialFeedTab
}: FeedViewProps) {
  const [postType, setPostType] = useState(fixedPostType);
  const [feedTab, setFeedTab] = useState<FeedTabId>(fixedFeedTab ?? "for_you");
  const appliedProfileDefaultTab = useRef(false);
  const [followingOnly, setFollowingOnly] = useState(false);
  const [busyAuthorId, setBusyAuthorId] = useState<number | null>(null);
  const user = useSessionStore((state) => state.user);
  const queryClient = useQueryClient();

  const feedQueryKey = useMemo(
    () => ["feed", postType, followingOnly, feedTab] as const,
    [postType, followingOnly, feedTab]
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
      query.set("feedTab", feedTab);
      return apiRequest<FeedResponse>(`/feed?${query.toString()}`, {
        auth: true
      });
    },
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined
  });

  const followMutation = useMutation({
    mutationFn: (authorId: number) => followUser(authorId),
    onMutate: async (authorId: number) => {
      setBusyAuthorId(authorId);
      await queryClient.cancelQueries({ queryKey: feedQueryKey });
      const previous = queryClient.getQueryData(feedQueryKey);
      queryClient.setQueryData(feedQueryKey, (current: typeof feedQuery.data) => {
        if (!current) return current;
        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            items: page.items.map((item) =>
              item.author_id === authorId ? { ...item, is_following_author: true } : item
            )
          }))
        };
      });
      return { previous };
    },
    onError: (_error, _authorId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(feedQueryKey, context.previous);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["account-profile-me"] }),
        queryClient.invalidateQueries({ queryKey: ["feed"] })
      ]);
    },
    onSettled: () => {
      setBusyAuthorId(null);
    }
  });

  const unfollowMutation = useMutation({
    mutationFn: (authorId: number) => unfollowUser(authorId),
    onMutate: async (authorId: number) => {
      setBusyAuthorId(authorId);
      await queryClient.cancelQueries({ queryKey: feedQueryKey });
      const previous = queryClient.getQueryData(feedQueryKey);
      queryClient.setQueryData(feedQueryKey, (current: typeof feedQuery.data) => {
        if (!current) return current;
        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            items: page.items.map((item) =>
              item.author_id === authorId ? { ...item, is_following_author: false } : item
            )
          }))
        };
      });
      return { previous };
    },
    onError: (_error, _authorId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(feedQueryKey, context.previous);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["account-profile-me"] }),
        queryClient.invalidateQueries({ queryKey: ["feed"] })
      ]);
    },
    onSettled: () => {
      setBusyAuthorId(null);
    }
  });

  const items = useMemo(
    () => feedQuery.data?.pages.flatMap((page) => page.items) || [],
    [feedQuery.data?.pages]
  );
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const sponsoredIds = items
      .filter((item) => item.sponsored && item.ad_campaign_id)
      .map((item) => Number(item.ad_campaign_id))
      .filter((id) => Number.isFinite(id));
    if (!sponsoredIds.length) {
      return;
    }
    sponsoredIds.forEach((campaignId) => {
      apiRequest("/ads/events/impression", {
        method: "POST",
        auth: true,
        body: { campaignId }
      }).catch(() => null);
    });
  }, [items]);

  const toggleFollow = (authorId: number, currentlyFollowing: boolean) => {
    if (currentlyFollowing) {
      unfollowMutation.mutate(authorId);
      return;
    }
    followMutation.mutate(authorId);
  };

  useEffect(() => {
    if (fixedFeedTab) {
      setFeedTab(fixedFeedTab);
    }
  }, [fixedFeedTab]);

  useEffect(() => {
    if (fixedFeedTab || appliedProfileDefaultTab.current || !initialFeedTab) {
      return;
    }
    setFeedTab(initialFeedTab);
    appliedProfileDefaultTab.current = true;
  }, [fixedFeedTab, initialFeedTab]);

  const emptySubtitle =
    feedTab === "marketplace"
      ? "Publish a marketplace post with an attached product, or browse Home for general updates."
      : feedTab === "opportunities"
        ? "No B2B-style listings match this feed yet."
        : "Try changing filters or be the first to share.";

  return (
    <section
      className={`flex w-full flex-col gap-4 md:gap-5 ${homeStyle ? "mx-auto max-w-[680px]" : "mx-auto max-w-[1100px]"}`}
    >
      <header className="surface-card sticky top-4 z-10 space-y-3 px-4 py-4 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="section-title text-base sm:text-lg">{heading}</h1>
            {feedSubtitle ? <p className="mt-1 text-xs text-muted">{feedSubtitle}</p> : null}
          </div>
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
            <Link href="/reels" className="btn-secondary px-3 py-2 text-xs" aria-label="Open reels">
              Reels
            </Link>
          </div>
        </div>
        {fixedFeedTab ? null : (
          <div className="flex flex-wrap gap-2">
            {[
              { id: "for_you" as const, label: "For You" },
              { id: "opportunities" as const, label: "Opportunities" },
              { id: "marketplace" as const, label: "Marketplace" }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`rounded-pill border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  feedTab === tab.id
                    ? "border-text bg-text text-background"
                    : "border-black/10 text-muted hover:bg-black/[0.04] hover:text-text"
                }`}
                onClick={() => setFeedTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
        <div className={`subtle-divider pt-3 ${homeStyle ? "hidden" : ""}`}>
          <div className="flex flex-wrap items-center gap-3">
            {!fixedPostType ? (
              <select
                className="input max-w-44 py-2 text-xs"
                value={postType}
                onChange={(event) =>
                  setPostType(event.target.value as "" | "post" | "marketplace" | "reel")
                }
              >
                <option value="">All types</option>
                <option value="post">Post</option>
                <option value="marketplace">Marketplace</option>
                <option value="reel">Reel</option>
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
            <EmptyState title="No posts yet" subtitle={emptySubtitle} />
          ) : null}

          {reducedMotion ? (
            <div className={homeStyle ? "space-y-3" : "space-y-5"}>
              {items.map((item) => (
                <FeedCard
                  key={item.id}
                  item={item}
                  layout={homeStyle ? "home" : "default"}
                  onToggleFollow={toggleFollow}
                  followBusy={busyAuthorId === item.author_id}
                />
              ))}
            </div>
          ) : (
            <motion.div
              className={homeStyle ? "flex flex-col gap-3" : "flex flex-col gap-5"}
              variants={feedListContainerVariants}
              initial="hidden"
              animate="show"
            >
              {items.map((item, index) => (
                <motion.div
                  key={item.id}
                  variants={index < FEED_STAGGER_FIRST ? feedListItemVariants : feedListItemInstant}
                >
                  <FeedCard
                    item={item}
                    layout={homeStyle ? "home" : "default"}
                    onToggleFollow={toggleFollow}
                    followBusy={busyAuthorId === item.author_id}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}

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
