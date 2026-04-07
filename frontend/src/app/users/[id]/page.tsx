"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchProductOverview } from "@/lib/ai-assist";
import { apiRequest } from "@/lib/api";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { resolveMediaUrl } from "@/lib/media-url";
import { ProfileCompactStats } from "@/components/profile/profile-compact-stats";
import { ProfileFeedCards } from "@/components/profile/profile-feed-cards";
import { ProfileLayoutColumns, ProfilePageShell } from "@/components/profile/profile-page-shell";
import { ProfilePillTabs } from "@/components/profile/profile-pill-tabs";
import { followUser, unfollowUser } from "@/lib/follows";
import {
  createProductCheckout,
  createSupportCheckout,
  createTierCheckout,
  fetchCreatorProducts,
  fetchCreatorSubscriptionAccess,
  fetchCreatorTiers,
  formatMinorCurrency,
  type PublicCreatorProduct
} from "@/lib/monetization";
import { useSessionStore } from "@/store/session-store";

function ProfileVerifiedBadge() {
  return (
    <span
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white shadow-sm"
      title="This account is verified by Deenly."
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="sr-only">Verified account</span>
    </span>
  );
}

function productTypeLabel(t: PublicCreatorProduct["product_type"]) {
  if (t === "digital") return "Digital";
  if (t === "service") return "Service";
  return "Subscription";
}

/** Split AI summary into short lines for scannable UI. */
function splitAiSummaryLines(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  const byNl = t.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (byNl.length > 1) return byNl;
  return t
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function ProfileProductAiOverview({
  productId,
  loginNextEncoded
}: {
  productId: number;
  loginNextEncoded: string;
}) {
  const sessionUser = useSessionStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const overviewMutation = useMutation({
    mutationFn: () => fetchProductOverview(productId)
  });

  if (!sessionUser) {
    return (
      <p className="mt-2 text-[11px] text-muted">
        <Link href={`/auth/login?next=${loginNextEncoded}`} className="text-sky-600 hover:underline">
          Log in for quick summary
        </Link>
      </p>
    );
  }

  return (
    <div className="mt-2 border-t border-black/5 pt-2">
      <button
        type="button"
        className="text-xs font-medium text-sky-600 hover:underline"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && !overviewMutation.data && !overviewMutation.isPending && !overviewMutation.isError) {
            overviewMutation.mutate();
          }
        }}
      >
        {open ? "Hide quick summary" : "Quick summary"}
      </button>
      {open ? (
        <div className="mt-2 text-xs leading-snug text-text/90">
          {overviewMutation.isPending ? (
            <p className="text-muted">Generating quick summary…</p>
          ) : overviewMutation.isError ? (
            <p className="text-red-600">{(overviewMutation.error as Error).message}</p>
          ) : overviewMutation.data ? (
            <ul className="list-disc space-y-1 pl-4 marker:text-muted">
              {splitAiSummaryLines(overviewMutation.data.summary).map((line, i) => (
                <li key={`${i}-${line.slice(0, 24)}`}>{line}</li>
              ))}
            </ul>
          ) : null}
          <p className="mt-1.5 text-[10px] text-muted">From listing facts only — quick guide, not advice.</p>
        </div>
      ) : null}
    </div>
  );
}

type UserProfile = {
  user_id: number;
  username?: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  business_offering: string | null;
  website_url: string | null;
  is_verified?: boolean;
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
  post_type: "post" | "marketplace" | "reel";
  created_at: string;
  benefited_count: number;
};

type FeedResponse = {
  items: ProfileFeedItem[];
};

type ProfileSectionTab = "grid" | "reels" | "products" | "listings";

const PUBLIC_PROFILE_TABS = [
  { id: "grid" as const, label: "Posts" },
  { id: "products" as const, label: "Products" },
  { id: "reels" as const, label: "Media" },
  { id: "listings" as const, label: "Listings" }
];

export default function UserProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionUser = useSessionStore((state) => state.user);
  const userId = Number(params.id);
  const [profileSectionTab, setProfileSectionTab] = useState<ProfileSectionTab>("grid");
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
  const creatorProductsQuery = useQuery({
    queryKey: ["creator-products-public", userId],
    queryFn: () => fetchCreatorProducts(userId),
    enabled: Number.isFinite(userId) && profileSectionTab === "products"
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
  const productCheckoutMutation = useMutation({
    mutationFn: (productId: number) => createProductCheckout(productId),
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
    profileSectionTab === "products"
      ? []
      : profileSectionTab === "reels"
        ? profileItems.filter((item) => Boolean(item.media_url))
        : profileSectionTab === "listings"
          ? profileItems.filter((item) => item.post_type === "marketplace")
          : profileItems;

  const loginNext = encodeURIComponent(`/users/${userId}`);

  const displayTitle = user.display_name?.trim() || `@${user.username || "user"}`;
  const usernameLine = user.display_name?.trim() ? `@${user.username || "user"}` : null;

  const avatarBlock =
    avatarUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={`${user.display_name} avatar`}
        className="profile-avatar profile-hero-avatar h-[96px] w-[96px] border-black/15 object-cover md:h-[120px] md:w-[120px]"
      />
    ) : (
      <div className="profile-avatar profile-hero-avatar grid h-[96px] w-[96px] place-items-center border-black/15 md:h-[120px] md:w-[120px]">
        {initials}
      </div>
    );

  return (
    <div className="page-stack">
      <ProfilePageShell variant="compactFooter">
        <ProfileLayoutColumns
          avatar={avatarBlock}
          main={
            <>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-semibold tracking-tight text-text md:text-2xl">{displayTitle}</h1>
                    {user.is_verified ? <ProfileVerifiedBadge /> : null}
                  </div>
                  {usernameLine ? <p className="mt-0.5 text-sm text-muted">{usernameLine}</p> : null}
                </div>
                <button
                  type="button"
                  className={user.is_following ? "btn-secondary px-5 py-2 text-sm" : "btn-primary px-5 py-2 text-sm"}
                  onClick={() => (user.is_following ? unfollowMutation.mutate() : followMutation.mutate())}
                >
                  {followMutation.isPending || unfollowMutation.isPending
                    ? "..."
                    : user.is_following
                      ? "Unfollow"
                      : "Follow"}
                </button>
                {sessionUser && sessionUser.id !== userId ? (
                  <Link
                    href={`/messages?with=${userId}`}
                    className="btn-secondary px-5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25"
                  >
                    Message
                  </Link>
                ) : null}
              </div>

              <ProfileCompactStats
                className="mt-4"
                postsCount={user.posts_count}
                followersCount={user.followers_count}
                followingCount={user.following_count}
              />
              <p className="mt-3 text-xs text-muted">
                Salah tracking stays on your own account — not shown on someone else&apos;s profile.
              </p>
              {user.bio ? <p className="mt-3 whitespace-pre-line text-sm text-text/90">{user.bio}</p> : null}
              {user.business_offering ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-muted">Offering</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-text/90">{user.business_offering}</p>
                </div>
              ) : null}
              {user.website_url ? (
                <p className="mt-3 text-sm">
                  <a
                    href={user.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-700 underline decoration-sky-700/40 underline-offset-2 hover:text-sky-800"
                  >
                    Website
                  </a>
                </p>
              ) : null}
              {followMutation.isSuccess ? <p className="mt-2 text-xs text-emerald-700">You&apos;re now following {user.display_name}.</p> : null}
              {unfollowMutation.isSuccess ? <p className="mt-2 text-xs text-muted">Unfollowed.</p> : null}

              <ProfilePillTabs tabs={PUBLIC_PROFILE_TABS} active={profileSectionTab} onChange={setProfileSectionTab} />

              <div className="pt-6">
                {profileSectionTab === "products" ? (
                  <>
                    {creatorProductsQuery.isLoading ? <LoadingState label="Loading products…" /> : null}
                    {creatorProductsQuery.error ? (
                      <ErrorState message={(creatorProductsQuery.error as Error).message} />
                    ) : null}
                    {!creatorProductsQuery.isLoading &&
                    !creatorProductsQuery.error &&
                    (creatorProductsQuery.data?.items?.length ?? 0) === 0 ? (
                      <div className="py-16 text-center text-sm text-muted">
                        No published products yet. Offers attached to posts may still appear in the feed.
                      </div>
                    ) : null}
                    {!creatorProductsQuery.isLoading && (creatorProductsQuery.data?.items?.length ?? 0) > 0 ? (
                      <ul className="space-y-3">
                        {creatorProductsQuery.data!.items.map((product) => {
                          const isOwner = sessionUser?.id === userId;
                          return (
                            <li
                              key={product.id}
                              className="rounded-control border border-black/10 bg-surface px-4 py-3 text-sm"
                            >
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <p className="font-semibold text-text">{product.title}</p>
                                  <p className="mt-1 text-xs text-muted">
                                    {formatMinorCurrency(product.price_minor, product.currency)} ·{" "}
                                    {productTypeLabel(product.product_type)}
                                    {product.business_category
                                      ? ` · ${product.business_category.replace(/_/g, " ")}`
                                      : ""}
                                  </p>
                                  {product.description ? (
                                    <p className="mt-2 line-clamp-3 text-xs text-text/90">{product.description}</p>
                                  ) : null}
                                  <Link
                                    href={`/products/${product.id}`}
                                    className="mt-2 inline-block text-xs font-medium text-sky-600 hover:underline"
                                  >
                                    See more
                                  </Link>
                                  <ProfileProductAiOverview
                                    productId={product.id}
                                    loginNextEncoded={loginNext}
                                  />
                                </div>
                                <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                                  <div className="flex flex-wrap gap-2">
                                    <Link
                                      href={`/products/${product.id}#offer-details`}
                                      className="btn-secondary inline-flex px-3 py-1.5 text-xs"
                                    >
                                      View offer
                                    </Link>
                                    {isOwner ? (
                                      <Link
                                        href="/account/creator?tab=products"
                                        className="btn-secondary inline-flex px-3 py-1.5 text-xs"
                                      >
                                        Manage
                                      </Link>
                                    ) : !sessionUser ? (
                                      <Link
                                        href={`/auth/login?next=${encodeURIComponent(`/products/${product.id}`)}`}
                                        className="btn-primary inline-flex px-3 py-1.5 text-xs"
                                      >
                                        Buy now
                                      </Link>
                                    ) : (
                                      <button
                                        type="button"
                                        className="btn-primary px-3 py-1.5 text-xs"
                                        disabled={
                                          productCheckoutMutation.isPending &&
                                          productCheckoutMutation.variables === product.id
                                        }
                                        onClick={() => productCheckoutMutation.mutate(product.id)}
                                      >
                                        {productCheckoutMutation.isPending &&
                                        productCheckoutMutation.variables === product.id
                                          ? "Opening..."
                                          : "Buy now"}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </>
                ) : (
                  <>
                    {postsQuery.isLoading ? <LoadingState label="Loading posts..." /> : null}
                    {postsQuery.error ? <ErrorState message={(postsQuery.error as Error).message} /> : null}
                    {!postsQuery.isLoading && !postsQuery.error && visibleItems.length === 0 ? (
                      <div className="py-16 text-center text-sm text-muted">
                        {profileSectionTab === "listings"
                          ? "No marketplace listings from this member yet."
                          : "No posts from this member yet."}
                      </div>
                    ) : null}
                    {visibleItems.length > 0 ? (
                      <ProfileFeedCards
                        items={visibleItems}
                        router={router}
                        onLike={(id) => likeMutation.mutate(id)}
                        likePending={likeMutation.isPending}
                      />
                    ) : null}
                  </>
                )}
              </div>
            </>
          }
        />
      </ProfilePageShell>
      <section className="profile-shell mx-auto w-full max-w-4xl">
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
            <Link
              href="/account"
              className="rounded-sm text-sky-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Back to your profile
            </Link>
          </p>
        </article>
      </section>
    </div>
  );
}
