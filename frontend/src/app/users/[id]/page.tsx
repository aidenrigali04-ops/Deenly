"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { resolveMediaUrl } from "@/lib/media-url";
import { followUser, unfollowUser } from "@/lib/follows";
import {
  createSupportCheckout,
  createTierCheckout,
  fetchCreatorSubscriptionAccess,
  fetchCreatorTiers,
  formatMinorCurrency
} from "@/lib/monetization";

type UserProfile = {
  user_id: number;
  username?: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  posts_count: number;
  followers_count: number;
  following_count: number;
  likes_received_count: number;
  likes_given_count: number;
  is_following: boolean;
};

type ProfileFeedItem = {
  id: number;
  author_id: number;
  author_display_name: string;
  content: string;
  media_url: string | null;
  media_mime_type: string | null;
  post_type: "recitation" | "community" | "short_video";
  created_at: string;
  benefited_count: number;
};

type FeedResponse = {
  items: ProfileFeedItem[];
};

export default function UserProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const userId = Number(params.id);
  const [igProfileTab, setIgProfileTab] = useState<"grid" | "reels" | "saved" | "tagged">("grid");
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ["user-profile", userId],
    queryFn: () => apiRequest<UserProfile>(`/users/${userId}`, { auth: true }),
    enabled: Number.isFinite(userId)
  });

  const followMutation = useMutation({
    mutationFn: () => followUser(userId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["user-profile", userId] });
      const previous = queryClient.getQueryData<UserProfile>(["user-profile", userId]);
      if (previous) {
        queryClient.setQueryData<UserProfile>(["user-profile", userId], {
          ...previous,
          is_following: true,
          followers_count: previous.followers_count + (previous.is_following ? 0 : 1)
        });
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["user-profile", userId], context.previous);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["user-profile", userId] }),
        queryClient.invalidateQueries({ queryKey: ["account-profile-me"] })
      ]);
    }
  });

  const unfollowMutation = useMutation({
    mutationFn: () => unfollowUser(userId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["user-profile", userId] });
      const previous = queryClient.getQueryData<UserProfile>(["user-profile", userId]);
      if (previous) {
        queryClient.setQueryData<UserProfile>(["user-profile", userId], {
          ...previous,
          is_following: false,
          followers_count: Math.max(0, previous.followers_count - (previous.is_following ? 1 : 0))
        });
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["user-profile", userId], context.previous);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["user-profile", userId] }),
        queryClient.invalidateQueries({ queryKey: ["account-profile-me"] })
      ]);
    }
  });

  const postsQuery = useQuery({
    queryKey: ["user-profile-posts", userId],
    queryFn: () => apiRequest<FeedResponse>(`/feed?authorId=${userId}&limit=40`, { auth: true }),
    enabled: Number.isFinite(userId)
  });
  const tiersQuery = useQuery({
    queryKey: ["creator-tiers", userId],
    queryFn: () => fetchCreatorTiers(userId),
    enabled: Number.isFinite(userId)
  });
  const subscriptionAccessQuery = useQuery({
    queryKey: ["creator-subscription-access", userId],
    queryFn: () => fetchCreatorSubscriptionAccess(userId),
    enabled: Number.isFinite(userId)
  });

  const likeMutation = useMutation({
    mutationFn: (postId: number) =>
      apiRequest("/interactions", {
        method: "POST",
        auth: true,
        body: {
          postId,
          interactionType: "benefited"
        }
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["user-profile-posts", userId] }),
        queryClient.invalidateQueries({ queryKey: ["user-profile", userId] })
      ]);
    }
  });
  const supportCheckoutMutation = useMutation({
    mutationFn: () => createSupportCheckout(userId, 500),
    onSuccess: (result) => {
      if (result?.checkoutUrl && typeof window !== "undefined") {
        window.location.assign(result.checkoutUrl);
      }
    }
  });
  const tierCheckoutMutation = useMutation({
    mutationFn: (tierId: number) => createTierCheckout(tierId),
    onSuccess: (result) => {
      if (result?.checkoutUrl && typeof window !== "undefined") {
        window.location.assign(result.checkoutUrl);
      }
    }
  });

  if (!Number.isFinite(userId)) {
    return <ErrorState message="Invalid user id." />;
  }
  if (profileQuery.isLoading) {
    return <LoadingState label="Loading user profile..." />;
  }
  if (profileQuery.error) {
    return (
      <ErrorState message={(profileQuery.error as Error).message} onRetry={profileQuery.refetch} />
    );
  }
  if (!profileQuery.data) {
    return <EmptyState title="User not found" />;
  }

  const user = profileQuery.data;
  const initials =
    user.display_name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U";
  const avatarUrl = resolveMediaUrl(user.avatar_url);

  const profileItems = postsQuery.data?.items || [];
  const visibleItems =
    igProfileTab === "saved" || igProfileTab === "tagged"
      ? []
      : igProfileTab === "reels"
        ? profileItems.filter((item) => Boolean(item.media_url))
        : profileItems;

  return (
    <>
      <section className="mx-auto max-w-4xl">
        <article className="rounded-b-2xl bg-black px-4 pb-6 pt-4 text-white md:px-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start">
            <div className="flex shrink-0 justify-center md:block">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={`${user.display_name} avatar`}
                  className="profile-avatar ig-avatar-xl h-[96px] w-[96px] border-white/20 object-cover md:h-[120px] md:w-[120px]"
                />
              ) : (
                <div className="profile-avatar ig-avatar-xl grid h-[96px] w-[96px] place-items-center border-white/20 md:h-[120px] md:w-[120px]">
                  {initials}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-xl font-semibold tracking-tight md:text-2xl">@{user.username || "user"}</h1>
                <button
                  type="button"
                  className="rounded-lg bg-sky-500 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-600"
                  onClick={() => (user.is_following ? unfollowMutation.mutate() : followMutation.mutate())}
                >
                  {followMutation.isPending || unfollowMutation.isPending
                    ? "..."
                    : user.is_following
                      ? "Unfollow"
                      : "Follow"}
                </button>
              </div>
              <div className="mt-6 flex flex-wrap gap-8 text-sm">
                <div>
                  <p className="text-base font-semibold tabular-nums">{user.posts_count.toLocaleString()}</p>
                  <p className="text-xs text-white/50">posts</p>
                </div>
                <div>
                  <p className="text-base font-semibold tabular-nums">{user.followers_count.toLocaleString()}</p>
                  <p className="text-xs text-white/50">followers</p>
                </div>
                <div>
                  <p className="text-base font-semibold tabular-nums">{user.following_count.toLocaleString()}</p>
                  <p className="text-xs text-white/50">following</p>
                </div>
              </div>
              <p className="mt-4 text-xs text-white/45">
                Worship activity (Dhikr / Salah) is private and not shown on profiles.
              </p>
              <p className="mt-3 font-semibold text-white">{user.display_name}</p>
              {user.bio ? <p className="mt-2 whitespace-pre-line text-sm text-white/75">{user.bio}</p> : null}
              {followMutation.isSuccess ? <p className="mt-2 text-xs text-sky-300">Followed successfully.</p> : null}
              {unfollowMutation.isSuccess ? <p className="mt-2 text-xs text-white/60">Unfollowed.</p> : null}
              <div className="mt-6 border-t border-white/10 pt-4">
                <div className="flex justify-center gap-10 md:gap-14">
                  {(
                    [
                      { id: "grid" as const, label: "Posts" },
                      { id: "reels" as const, label: "Media" },
                      { id: "saved" as const, label: "Saved" },
                      { id: "tagged" as const, label: "Tagged" }
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setIgProfileTab(tab.id)}
                      className={`relative pb-3 text-xs font-semibold uppercase tracking-wide transition ${
                        igProfileTab === tab.id ? "text-white" : "text-white/40 hover:text-white/70"
                      }`}
                    >
                      {tab.label}
                      {igProfileTab === tab.id ? (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pt-6">
                {postsQuery.isLoading ? <LoadingState label="Loading posts..." /> : null}
                {postsQuery.error ? <ErrorState message={(postsQuery.error as Error).message} /> : null}
                {!postsQuery.isLoading && !postsQuery.error && (igProfileTab === "saved" || igProfileTab === "tagged") ? (
                  <div className="py-16 text-center text-sm text-white/45">Coming soon.</div>
                ) : null}
                {!postsQuery.isLoading &&
                !postsQuery.error &&
                visibleItems.length === 0 &&
                igProfileTab !== "saved" &&
                igProfileTab !== "tagged" ? (
                  <div className="py-16 text-center text-sm text-white/50">No posts to show yet.</div>
                ) : null}
                {visibleItems.length > 0 ? (
                  <div className="profile-post-grid ig-grid-tight">
                    {visibleItems.map((item) => {
                      const mediaUrl = resolveMediaUrl(item.media_url) || undefined;
                      const isImage = item.media_mime_type?.startsWith("image/");
                      const isVideo = item.media_mime_type?.startsWith("video/");
                      const fallbackLabel = item.content?.trim().slice(0, 26) || "Post";
                      return (
                        <article key={item.id} className="profile-grid-tile border-white/10 bg-white/5">
                          <button
                            type="button"
                            className="profile-grid-open"
                            onClick={() => router.push(`/posts/${item.id}`)}
                            aria-label={`Open post ${item.id}`}
                          >
                            {mediaUrl ? (
                              isImage ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={mediaUrl} alt="post media" className="profile-grid-media" />
                              ) : (
                                <div className="profile-grid-fallback profile-grid-fallback-video">Video</div>
                              )
                            ) : (
                              <div className="profile-grid-fallback bg-black/40 text-white/60">{fallbackLabel}</div>
                            )}
                            {isVideo ? <span className="profile-grid-badge">Video</span> : null}
                          </button>
                          <button
                            className="profile-grid-like"
                            onClick={() => likeMutation.mutate(item.id)}
                            disabled={likeMutation.isPending}
                            type="button"
                          >
                            {likeMutation.isPending ? "..." : "Like"}
                          </button>
                          <span className="profile-grid-count">{item.benefited_count || 0}</span>
                        </article>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </article>
      </section>
      <section className="profile-shell mx-auto max-w-4xl">
        <article className="surface-card px-6 py-6">
          <div className="grid grid-cols-2 gap-2 text-xs text-muted">
            <div className="rounded-control border border-black/10 bg-surface px-3 py-2">
              Likes received: <span className="font-semibold text-text">{user.likes_received_count}</span>
            </div>
            <div className="rounded-control border border-black/10 bg-surface px-3 py-2">
              Likes given: <span className="font-semibold text-text">{user.likes_given_count}</span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => supportCheckoutMutation.mutate()}>
              {supportCheckoutMutation.isPending ? "Opening..." : "Support $5"}
            </button>
            <span className="rounded-control border border-black/10 bg-surface px-3 py-2 text-xs text-muted">
              Membership: {subscriptionAccessQuery.data?.subscribed ? "Active" : "Not subscribed"}
            </span>
          </div>
          {tiersQuery.data?.items?.length ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {tiersQuery.data.items.map((tier) => (
                <div key={tier.id} className="rounded-control border border-black/10 bg-surface p-3">
                  <p className="text-xs font-semibold text-text">{tier.title}</p>
                  <p className="mt-1 text-xs text-muted">
                    {formatMinorCurrency(Number(tier.monthly_price_minor || 0), tier.currency || "usd")} / month
                  </p>
                  {tier.description ? <p className="mt-1 text-xs text-muted">{tier.description}</p> : null}
                  <button
                    className="btn-secondary mt-2 w-full"
                    onClick={() => tierCheckoutMutation.mutate(tier.id)}
                    disabled={tierCheckoutMutation.isPending}
                  >
                    {tierCheckoutMutation.isPending ? "Opening..." : "Subscribe"}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <p className="mt-4 text-center text-xs text-muted">
            <Link href="/account" className="text-sky-600 hover:underline">
              Back to your profile
            </Link>
          </p>
        </article>
      </section>
    </>
  );
}
