"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSessionMe } from "@/lib/auth";
import { apiRequest } from "@/lib/api";
import { resolveMediaUrl } from "@/lib/media-url";
import { CreatePostComposer } from "@/components/create-post-composer";
import { ErrorState, LoadingState } from "@/components/states";
import { DeenStrip } from "@/components/profile/deen-strip";
import { ProfileCompactStats } from "@/components/profile/profile-compact-stats";
import { ProfileFeedCards } from "@/components/profile/profile-feed-cards";
import { ProfileEventsList } from "@/components/profile/profile-events-list";
import { ProfileLayoutColumns, ProfilePageShell } from "@/components/profile/profile-page-shell";
import { ProfilePillTabs } from "@/components/profile/profile-pill-tabs";
import { fetchEventsByHost } from "@/lib/events";

type AccountProfile = {
  user_id: number;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  business_offering: string | null;
  website_url: string | null;
  posts_count: number;
  followers_count: number;
  following_count: number;
  likes_received_count: number;
  likes_given_count: number;
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

type UploadSignatureResponse = {
  uploadUrl: string;
  headers: Record<string, string>;
  key: string;
};

function deriveMediaType(mimeType: string): "image" | "video" | null {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return null;
}

const ACCOUNT_TABS = [
  { id: "grid" as const, label: "Posts" },
  { id: "events" as const, label: "Events" },
  { id: "reels" as const, label: "Media" }
];

export default function AccountPage() {
  const router = useRouter();
  const [profileSectionTab, setProfileSectionTab] = useState<"grid" | "reels" | "events">("grid");
  const [showProfileComposer, setShowProfileComposer] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: ["account-session-me"],
    queryFn: () => fetchSessionMe()
  });
  const profileQuery = useQuery({
    queryKey: ["account-profile-me"],
    queryFn: () => apiRequest<AccountProfile>("/users/me", { auth: true }),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const postsQuery = useQuery({
    queryKey: ["account-posts", sessionQuery.data?.id],
    queryFn: () => apiRequest<FeedResponse>(`/feed?authorId=${sessionQuery.data?.id}&limit=40`, { auth: true }),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const hostedEventsQuery = useQuery({
    queryKey: ["account-hosted-events", sessionQuery.data?.id],
    queryFn: () => fetchEventsByHost(sessionQuery.data!.id, { limit: 40 }),
    enabled: Boolean(sessionQuery.data?.id) && profileSectionTab === "events"
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
        queryClient.invalidateQueries({ queryKey: ["account-posts", sessionQuery.data?.id] }),
        queryClient.invalidateQueries({ queryKey: ["account-profile-me"] })
      ]);
    }
  });
  if (sessionQuery.isLoading) {
    return <LoadingState label="Loading account..." />;
  }
  if (sessionQuery.error) {
    return <ErrorState message={(sessionQuery.error as Error).message} />;
  }
  if (!sessionQuery.data) {
    return <ErrorState message="Unable to load account." />;
  }

  const user = sessionQuery.data;
  const profile = profileQuery.data;
  const initials =
    (user.username || user.email || "U")
      .split(/[.@_\s-]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U";
  const avatarUrl = resolveMediaUrl(profile?.avatar_url || null);
  const displayTitle = profile?.display_name?.trim() || `@${user.username || "user"}`;
  const usernameLine = profile?.display_name?.trim()
    ? `@${user.username || "user"}`
    : null;

  const profileItems = postsQuery.data?.items || [];
  const visibleItems =
    profileSectionTab === "reels"
      ? profileItems.filter((item) => Boolean(item.media_url))
      : profileSectionTab === "grid"
        ? profileItems
        : [];

  const onProfilePostPublished = () => {
    setShowProfileComposer(false);
    void queryClient.invalidateQueries({ queryKey: ["account-posts", sessionQuery.data?.id] });
    void queryClient.invalidateQueries({ queryKey: ["account-profile-me"] });
    void queryClient.invalidateQueries({ queryKey: ["feed"] });
  };

  const profileInlineComposer = (withBottomMargin: boolean) => (
    <div
      className={`rounded-panel border border-black/10 bg-surface p-4 shadow-soft${withBottomMargin ? " mb-6" : ""}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-text">Create a post</p>
        <button
          type="button"
          className="text-xs text-muted transition hover:text-text"
          onClick={() => setShowProfileComposer(false)}
        >
          Cancel
        </button>
      </div>
      <CreatePostComposer
        variant="inline"
        stayOnPage
        redirectPathAfterInstagram="/account"
        onPublished={onProfilePostPublished}
      />
    </div>
  );

  const uploadAvatar = async (file: File) => {
    if (!profile) {
      return;
    }
    setAvatarError("");
    const mediaType = deriveMediaType(file.type || "");
    if (mediaType !== "image") {
      throw new Error("Please choose an image file.");
    }
    setAvatarUploading(true);
    try {
      const signature = await apiRequest<UploadSignatureResponse>("/media/upload-signature", {
        method: "POST",
        auth: true,
        body: {
          mediaType: "image",
          mimeType: file.type || "image/jpeg",
          originalFilename: file.name,
          fileSizeBytes: file.size || 1
        }
      });
      const uploadResponse = await fetch(signature.uploadUrl, {
        method: "PUT",
        headers: signature.headers,
        body: file
      });
      if (!uploadResponse.ok) {
        throw new Error("Unable to upload avatar.");
      }
      await apiRequest("/users/me", {
        method: "PUT",
        auth: true,
        body: {
          displayName: profile.display_name,
          bio: profile.bio,
          avatarUrl: signature.key,
          businessOffering: profile.business_offering,
          websiteUrl: profile.website_url
        }
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["account-profile-me"] }),
        queryClient.invalidateQueries({ queryKey: ["feed"] })
      ]);
    } finally {
      setAvatarUploading(false);
    }
  };

  const avatarBlock = (
    <div className="relative">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt="Profile avatar"
          className="profile-avatar profile-hero-avatar h-[96px] w-[96px] border-black/15 object-cover text-2xl md:h-[120px] md:w-[120px]"
        />
      ) : (
        <div className="profile-avatar profile-hero-avatar grid h-[96px] w-[96px] place-items-center border-black/15 text-2xl md:h-[120px] md:w-[120px]">
          {initials}
        </div>
      )}
      <button
        type="button"
        className="btn-secondary mt-3 w-full px-3 py-2 text-xs md:hidden"
        disabled={avatarUploading}
        onClick={() => avatarInputRef.current?.click()}
      >
        {avatarUploading ? "Uploading..." : "Change photo"}
      </button>
    </div>
  );

  return (
    <div className="page-stack">
      <ProfilePageShell>
        <ProfileLayoutColumns
          avatar={avatarBlock}
          main={
            <>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h1 className="text-xl font-semibold tracking-tight text-text md:text-2xl">{displayTitle}</h1>
                  {usernameLine ? <p className="mt-0.5 text-sm text-muted">{usernameLine}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href="/account/settings"
                    className="rounded-lg p-1.5 text-muted transition hover:bg-black/[0.04] hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                    aria-label="Account settings"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                    </svg>
                  </Link>
                  <button
                    type="button"
                    className="btn-secondary hidden px-4 py-2 text-sm md:inline-flex"
                    disabled={avatarUploading}
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    {avatarUploading ? "Uploading..." : "Change photo"}
                  </button>
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    try {
                      await uploadAvatar(file);
                    } catch (error) {
                      setAvatarError(error instanceof Error ? error.message : "Unable to upload photo.");
                    } finally {
                      event.target.value = "";
                    }
                  }}
                />
              </div>
              {avatarError ? <p className="mt-2 text-xs text-rose-600">{avatarError}</p> : null}

              <div className="mt-3">
                <Link
                  href="/businesses/new"
                  className="text-sm font-medium text-sky-700 underline-offset-2 hover:underline"
                  title="List your business for Near me and Search"
                >
                  Add your business
                </Link>
              </div>

              <ProfileCompactStats
                className="mt-4"
                postsCount={profile?.posts_count ?? 0}
                followersCount={profile?.followers_count ?? 0}
                followingCount={profile?.following_count ?? 0}
              />

              <DeenStrip />

              {profile?.bio ? (
                <p className="mt-4 whitespace-pre-line text-sm text-text/90">{profile.bio}</p>
              ) : (
                <p className="mt-4 text-sm text-muted">Add a short bio so friends know you on Deenly.</p>
              )}
              {profile?.business_offering ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-muted">Offering</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-text/90">{profile.business_offering}</p>
                </div>
              ) : null}
              {profile?.website_url ? (
                <p className="mt-3 text-sm">
                  <a
                    href={profile.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-700 underline decoration-sky-700/40 underline-offset-2 hover:text-sky-800"
                  >
                    Website
                  </a>
                </p>
              ) : null}

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <Link href="/account/edit" className="btn-primary min-w-[120px] flex-1 text-center sm:flex-none">
                  Edit profile
                </Link>
                <Link href="/account/settings" className="btn-secondary min-w-[120px] flex-1 text-center sm:flex-none">
                  Settings
                </Link>
              </div>
              <p className="mt-2 max-w-md text-xs text-muted">
                Purchases, Creator hub, sessions, and inbox live under Settings.
              </p>

              <ProfilePillTabs tabs={ACCOUNT_TABS} active={profileSectionTab} onChange={setProfileSectionTab} />

              <div className="pt-6">
                {profileSectionTab === "events" ? (
                  <>
                    {hostedEventsQuery.isLoading ? <LoadingState label="Loading your events…" /> : null}
                    {hostedEventsQuery.error ? (
                      <ErrorState message={(hostedEventsQuery.error as Error).message} />
                    ) : null}
                    {!hostedEventsQuery.isLoading && !hostedEventsQuery.error ? (
                      <>
                        <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
                          <Link href="/create/event" className="btn-secondary px-3 py-1.5 text-sm">
                            New event
                          </Link>
                        </div>
                        <ProfileEventsList
                          items={hostedEventsQuery.data?.items ?? []}
                          emptyTitle="No events yet"
                          emptyHint="Events you host appear here for your followers."
                          createEventHref="/create/event"
                          createEventLabel="Create an event"
                        />
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    {postsQuery.isLoading ? <LoadingState label="Loading your posts..." /> : null}
                    {postsQuery.error ? <ErrorState message={(postsQuery.error as Error).message} /> : null}
                    {!postsQuery.isLoading &&
                    !postsQuery.error &&
                    (profileSectionTab === "grid" || profileSectionTab === "reels") &&
                    visibleItems.length > 0 &&
                    !showProfileComposer ? (
                      <div className="mb-4 flex justify-end">
                        <button
                          type="button"
                          className="btn-secondary px-3 py-1.5 text-sm"
                          onClick={() => setShowProfileComposer(true)}
                        >
                          New post
                        </button>
                      </div>
                    ) : null}
                    {!postsQuery.isLoading &&
                    !postsQuery.error &&
                    showProfileComposer &&
                    (profileSectionTab === "grid" || profileSectionTab === "reels") &&
                    visibleItems.length > 0
                      ? profileInlineComposer(true)
                      : null}
                    {!postsQuery.isLoading &&
                    !postsQuery.error &&
                    visibleItems.length === 0 ? (
                      showProfileComposer ? (
                        profileInlineComposer(false)
                      ) : (
                        <div className="py-16 text-center">
                          <div className="mx-auto mb-4 grid h-24 w-24 place-items-center rounded-full border-2 border-dashed border-black/15 bg-surface">
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-muted">
                              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                              <circle cx="12" cy="13" r="4" />
                            </svg>
                          </div>
                          <p className="text-xl font-semibold text-text">Your posts live here</p>
                          <p className="mt-2 text-sm text-muted">Share reminders, marketplace listings, or clips — they show up on your Deenly profile.</p>
                          <button
                            type="button"
                            className="mt-4 inline-block text-sm font-semibold text-sky-600 underline-offset-2 hover:underline"
                            onClick={() => setShowProfileComposer(true)}
                          >
                            Create a post
                          </button>
                        </div>
                      )
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
    </div>
  );
}
