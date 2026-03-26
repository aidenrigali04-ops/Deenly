"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSessionMe } from "@/lib/auth";
import { apiRequest } from "@/lib/api";
import { resolveMediaUrl } from "@/lib/media-url";
import { ErrorState, LoadingState } from "@/components/states";
import { DeenStrip } from "@/components/profile/deen-strip";
import { fetchPrayerSettings, updatePrayerSettings } from "@/lib/prayer";
import {
  disconnectInstagram,
  fetchInstagramOAuthUrl,
  fetchInstagramStatus
} from "@/lib/instagram";
import {
  createAffiliateCode,
  createConnectAccount,
  createOnboardingLink,
  createProduct,
  createTier,
  fetchConnectStatus,
  fetchEarnings,
  fetchMyAffiliateCodes,
  fetchMyAffiliatePerformance,
  fetchMyProducts,
  fetchMyTiers,
  fetchCreatorRankings,
  formatMinorCurrency,
  publishProduct,
  publishTier
} from "@/lib/monetization";

type AccountProfile = {
  user_id: number;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
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
  post_type: "recitation" | "community" | "short_video";
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

export default function AccountPage() {
  const router = useRouter();
  const [igProfileTab, setIgProfileTab] = useState<"grid" | "reels" | "saved" | "tagged">("grid");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [profileEditSaving, setProfileEditSaving] = useState(false);
  const [profileEditMessage, setProfileEditMessage] = useState("");
  const [savingPrayer, setSavingPrayer] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [instagramBanner, setInstagramBanner] = useState("");
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
  const prayerSettingsQuery = useQuery({
    queryKey: ["account-prayer-settings"],
    queryFn: () => fetchPrayerSettings()
  });
  const connectStatusQuery = useQuery({
    queryKey: ["account-monetization-connect"],
    queryFn: () => fetchConnectStatus(),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const myProductsQuery = useQuery({
    queryKey: ["account-monetization-products"],
    queryFn: () => fetchMyProducts(),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const myTiersQuery = useQuery({
    queryKey: ["account-monetization-tiers"],
    queryFn: () => fetchMyTiers(),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const earningsQuery = useQuery({
    queryKey: ["account-monetization-earnings"],
    queryFn: () => fetchEarnings(),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const affiliateCodesQuery = useQuery({
    queryKey: ["account-monetization-affiliate-codes"],
    queryFn: () => fetchMyAffiliateCodes(),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const affiliatePerfQuery = useQuery({
    queryKey: ["account-monetization-affiliate-performance"],
    queryFn: () => fetchMyAffiliatePerformance(),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const rankingsQuery = useQuery({
    queryKey: ["public-creator-rankings"],
    queryFn: () => fetchCreatorRankings(10),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const instagramStatusQuery = useQuery({
    queryKey: ["instagram-status"],
    queryFn: () => fetchInstagramStatus(),
    enabled: Boolean(sessionQuery.data?.id),
    retry: false
  });
  const disconnectInstagramMutation = useMutation({
    mutationFn: () => disconnectInstagram(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["instagram-status"] });
    }
  });

  useEffect(() => {
    if (profileQuery.data) {
      setEditDisplayName(profileQuery.data.display_name);
      setEditBio(profileQuery.data.bio || "");
    }
  }, [profileQuery.data]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const err = params.get("instagram_error");
    const ok = params.get("instagram_connected");
    if (err) {
      setInstagramBanner(`Instagram: ${decodeURIComponent(err).slice(0, 400)}`);
    } else if (ok === "1") {
      setInstagramBanner("Instagram connected. You can cross-post when publishing media.");
    }
    if (err || ok) {
      window.history.replaceState({}, "", "/account");
      void queryClient.invalidateQueries({ queryKey: ["instagram-status"] });
    }
  }, [queryClient]);
  const connectAccountMutation = useMutation({
    mutationFn: () => createConnectAccount(),
    onSuccess: async () => {
      await connectStatusQuery.refetch();
    }
  });
  const onboardingMutation = useMutation({
    mutationFn: () => createOnboardingLink(),
    onSuccess: (result) => {
      if (typeof window !== "undefined" && result?.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
      }
    }
  });
  const createProductMutation = useMutation({
    mutationFn: () =>
      createProduct({
        title: "New digital product",
        description: "Creator digital download",
        priceMinor: 1500,
        currency: "usd",
        deliveryMediaKey: "uploads/products/digital-file.pdf"
      }),
    onSuccess: async () => {
      await myProductsQuery.refetch();
    }
  });
  const createTierMutation = useMutation({
    mutationFn: () =>
      createTier({
        title: "Supporter Tier",
        description: "Monthly supporter tier",
        monthlyPriceMinor: 500,
        currency: "usd"
      }),
    onSuccess: async () => {
      await myTiersQuery.refetch();
    }
  });
  const createAffiliateCodeMutation = useMutation({
    mutationFn: () => createAffiliateCode(),
    onSuccess: async () => {
      await affiliateCodesQuery.refetch();
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

  const profileItems = postsQuery.data?.items || [];
  const visibleItems =
    igProfileTab === "saved" || igProfileTab === "tagged"
      ? []
      : igProfileTab === "reels"
        ? profileItems.filter((item) => Boolean(item.media_url))
        : profileItems;

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
      // #region agent log
      fetch("http://127.0.0.1:7244/ingest/25316d93-ed82-40c8-b2f0-64204fe30501", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "29a8f0" },
        body: JSON.stringify({
          sessionId: "29a8f0",
          runId: "e2e-avatar-debug",
          hypothesisId: "H1",
          location: "frontend/src/app/account/page.tsx:231",
          message: "avatar_upload_start",
          data: { fileType: file.type || "unknown", fileSize: file.size || 0 },
          timestamp: Date.now()
        })
      }).catch(() => {});
      // #endregion
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
      // #region agent log
      fetch("http://127.0.0.1:7244/ingest/25316d93-ed82-40c8-b2f0-64204fe30501", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "29a8f0" },
        body: JSON.stringify({
          sessionId: "29a8f0",
          runId: "e2e-avatar-debug",
          hypothesisId: "H2",
          location: "frontend/src/app/account/page.tsx:247",
          message: "avatar_signature_received",
          data: { hasUploadUrl: Boolean(signature.uploadUrl), hasKey: Boolean(signature.key) },
          timestamp: Date.now()
        })
      }).catch(() => {});
      // #endregion
      const uploadResponse = await fetch(signature.uploadUrl, {
        method: "PUT",
        headers: signature.headers,
        body: file
      });
      // #region agent log
      fetch("http://127.0.0.1:7244/ingest/25316d93-ed82-40c8-b2f0-64204fe30501", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "29a8f0" },
        body: JSON.stringify({
          sessionId: "29a8f0",
          runId: "e2e-avatar-debug",
          hypothesisId: "H2",
          location: "frontend/src/app/account/page.tsx:259",
          message: "avatar_put_result",
          data: { ok: uploadResponse.ok, status: uploadResponse.status },
          timestamp: Date.now()
        })
      }).catch(() => {});
      // #endregion
      if (!uploadResponse.ok) {
        throw new Error("Unable to upload avatar.");
      }
      await apiRequest("/users/me", {
        method: "PUT",
        auth: true,
        body: {
          displayName: profile.display_name,
          bio: profile.bio,
          avatarUrl: signature.key
        }
      });
      // #region agent log
      fetch("http://127.0.0.1:7244/ingest/25316d93-ed82-40c8-b2f0-64204fe30501", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "29a8f0" },
        body: JSON.stringify({
          sessionId: "29a8f0",
          runId: "e2e-avatar-debug",
          hypothesisId: "H3",
          location: "frontend/src/app/account/page.tsx:283",
          message: "avatar_profile_update_success",
          data: { avatarKeySet: Boolean(signature.key) },
          timestamp: Date.now()
        })
      }).catch(() => {});
      // #endregion
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["account-profile-me"] }),
        queryClient.invalidateQueries({ queryKey: ["feed"] })
      ]);
    } finally {
      setAvatarUploading(false);
    }
  };

  return (
    <>
      <section className="mx-auto max-w-4xl">
        <article className="rounded-b-2xl bg-black px-4 pb-10 pt-4 text-white md:px-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start">
            <div className="flex shrink-0 justify-center md:block">
              <div className="relative">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt="Profile avatar"
                    className="profile-avatar ig-avatar-xl h-[96px] w-[96px] border-white/20 object-cover text-2xl md:h-[120px] md:w-[120px]"
                  />
                ) : (
                  <div className="profile-avatar ig-avatar-xl grid h-[96px] w-[96px] place-items-center border-white/20 text-2xl md:h-[120px] md:w-[120px]">
                    {initials}
                  </div>
                )}
                <button
                  type="button"
                  className="mt-3 w-full rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15 md:hidden"
                  disabled={avatarUploading}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  {avatarUploading ? "Uploading..." : "Change photo"}
                </button>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
                  @{user.username || "user"}
                </h1>
                <Link
                  href="#account-settings"
                  className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
                  aria-label="Account settings"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                  </svg>
                </Link>
                <div className="hidden md:block">
                  <button
                    type="button"
                    className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
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
              {avatarError ? <p className="mt-2 text-xs text-rose-300">{avatarError}</p> : null}

              <div className="mt-6 flex flex-wrap gap-8 text-sm">
                <div>
                  <p className="text-base font-semibold tabular-nums">{(profile?.posts_count ?? 0).toLocaleString()}</p>
                  <p className="text-xs text-white/50">posts</p>
                </div>
                <div>
                  <p className="text-base font-semibold tabular-nums">{(profile?.followers_count ?? 0).toLocaleString()}</p>
                  <p className="text-xs text-white/50">followers</p>
                </div>
                <div>
                  <p className="text-base font-semibold tabular-nums">{(profile?.following_count ?? 0).toLocaleString()}</p>
                  <p className="text-xs text-white/50">following</p>
                </div>
              </div>

              <DeenStrip />

              {profile?.display_name ? (
                <p className="mt-4 font-semibold text-white">{profile.display_name}</p>
              ) : null}
              {profile?.bio ? (
                <p className="mt-2 whitespace-pre-line text-sm text-white/75">{profile.bio}</p>
              ) : (
                <p className="mt-2 text-sm text-white/40">No bio yet. Edit profile to add one.</p>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                <a
                  href="#profile-edit"
                  className="min-w-[120px] flex-1 rounded-lg bg-white/10 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-white/15 sm:flex-none"
                >
                  Edit profile
                </a>
                <button
                  type="button"
                  disabled
                  className="min-w-[120px] flex-1 rounded-lg bg-white/5 px-4 py-2 text-sm font-semibold text-white/35 sm:flex-none"
                  title="Coming soon"
                >
                  View archive
                </button>
              </div>

              <div className="mt-6 flex gap-6 overflow-x-auto pb-1">
                <button type="button" className="story-chip min-w-[68px] text-white/80">
                  <span className="story-ring story-ring-own inline-flex rounded-full border border-dashed border-white/35 p-[2px]">
                    <span className="grid h-14 w-14 place-items-center rounded-full bg-white/10 text-lg font-light">+</span>
                  </span>
                  <span className="text-[11px] text-white/60">New</span>
                </button>
              </div>

              <div className="mt-2 border-t border-white/10 pt-2">
                <div className="flex justify-center gap-10 md:gap-14">
                  {(
                    [
                      { id: "grid" as const, label: "Posts" },
                      { id: "reels" as const, label: "Media" },
                      { id: "saved" as const, label: "Saved" },
                      { id: "tagged" as const, label: "Tagged" }
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setIgProfileTab(t.id)}
                      className={`relative pb-3 text-xs font-semibold uppercase tracking-wide transition ${
                        igProfileTab === t.id ? "text-white" : "text-white/40 hover:text-white/70"
                      }`}
                    >
                      {t.label}
                      {igProfileTab === t.id ? (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-6">
                {postsQuery.isLoading ? <LoadingState label="Loading your posts..." /> : null}
                {postsQuery.error ? <ErrorState message={(postsQuery.error as Error).message} /> : null}
                {!postsQuery.isLoading && !postsQuery.error && (igProfileTab === "saved" || igProfileTab === "tagged") ? (
                  <div className="py-16 text-center text-sm text-white/45">Coming soon.</div>
                ) : null}
                {!postsQuery.isLoading &&
                !postsQuery.error &&
                visibleItems.length === 0 &&
                igProfileTab !== "saved" &&
                igProfileTab !== "tagged" ? (
                  <div className="py-16 text-center">
                    <div className="mx-auto mb-4 grid h-24 w-24 place-items-center rounded-full border-2 border-white/25">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-white/50">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                    </div>
                    <p className="text-xl font-semibold text-white">Share photos</p>
                    <p className="mt-2 text-sm text-white/50">When you share photos, they will appear on your profile.</p>
                    <Link href="/create" className="mt-4 inline-block text-sm font-semibold text-sky-400 hover:underline">
                      Share your first photo
                    </Link>
                  </div>
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

      <section className="mx-auto max-w-4xl px-3 sm:px-5">
        <div id="profile-edit" className="surface-card mt-4 px-6 py-6">
          <h2 className="section-title text-base">Edit profile</h2>
          <p className="mt-1 text-xs text-muted">Update how your name and bio appear on your profile.</p>
          <form
            className="mt-4 grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!profile) return;
              setProfileEditSaving(true);
              setProfileEditMessage("");
              try {
                const dn = editDisplayName.trim();
                if (dn.length < 2) {
                  throw new Error("Display name must be at least 2 characters.");
                }
                await apiRequest("/users/me", {
                  method: "PUT",
                  auth: true,
                  body: {
                    displayName: dn,
                    bio: editBio.trim() || null,
                    avatarUrl: profile.avatar_url ?? null
                  }
                });
                await queryClient.invalidateQueries({ queryKey: ["account-profile-me"] });
                setProfileEditMessage("Saved.");
              } catch (err) {
                setProfileEditMessage((err as Error).message || "Unable to save.");
              } finally {
                setProfileEditSaving(false);
              }
            }}
          >
            <label className="space-y-1 text-sm">
              <span className="text-muted">Display name</span>
              <input
                className="input"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                maxLength={64}
                required
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted">Bio</span>
              <textarea className="input min-h-24" value={editBio} onChange={(e) => setEditBio(e.target.value)} maxLength={240} />
            </label>
            {profileEditMessage ? <p className="text-xs text-muted">{profileEditMessage}</p> : null}
            <button type="submit" className="btn-primary w-fit" disabled={profileEditSaving}>
              {profileEditSaving ? "Saving..." : "Save profile"}
            </button>
          </form>
        </div>
      </section>

      <section id="account-settings" className="profile-shell">
        <article className="surface-card px-6 py-6">
        <div className="mb-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-2">
          <div className="rounded-control border border-black/10 bg-surface px-3 py-2 text-muted">
            Likes received: <span className="font-semibold text-text">{profile?.likes_received_count ?? 0}</span>
          </div>
          <div className="rounded-control border border-black/10 bg-surface px-3 py-2 text-muted">
            Likes by you: <span className="font-semibold text-text">{profile?.likes_given_count ?? 0}</span>
          </div>
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-control border border-black/10 bg-surface px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-muted">Email</p>
            <p className="mt-1 font-medium text-text">{user.email}</p>
          </div>
          <div className="rounded-control border border-black/10 bg-surface px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-muted">Username</p>
            <p className="mt-1 font-medium text-text">@{user.username || "unknown"}</p>
          </div>
          <div className="rounded-control border border-black/10 bg-surface px-3 py-2 sm:col-span-2">
            <p className="text-xs uppercase tracking-wide text-muted">Role</p>
            <p className="mt-1 font-medium text-text">{user.role}</p>
          </div>
        </div>

        <div className="pt-4 flex flex-wrap gap-3">
          <Link href="/onboarding" className="btn-secondary">
            Interests
          </Link>
          <Link href="/sessions" className="btn-secondary">
            Sessions
          </Link>
          <Link href="/notifications" className="btn-secondary">
            Inbox
          </Link>
        </div>

        <div className="pt-5">
          <h2 className="section-title text-sm">Instagram (Business / Creator)</h2>
          <p className="mt-1 text-xs text-muted">
            Link a Facebook Page with an Instagram Professional account. Cross-post runs in the background and
            needs a public HTTPS media URL (CloudFront).
          </p>
          {instagramBanner ? (
            <p className="mt-2 rounded-panel border border-black/10 bg-surface px-3 py-2 text-sm text-text">
              {instagramBanner}
            </p>
          ) : null}
          <div className="mt-3 rounded-control border border-black/10 bg-surface px-3 py-2">
            {instagramStatusQuery.isError ? (
              <p className="text-sm text-muted">Instagram integration is not available on this server.</p>
            ) : instagramStatusQuery.data?.connected ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-text">
                  Connected
                  {instagramStatusQuery.data.igUsername
                    ? ` as @${instagramStatusQuery.data.igUsername}`
                    : instagramStatusQuery.data.igUserId
                      ? ` (IG ${instagramStatusQuery.data.igUserId})`
                      : ""}
                </p>
                <button
                  type="button"
                  className="btn-secondary px-3 py-1.5 text-xs"
                  onClick={() => disconnectInstagramMutation.mutate()}
                  disabled={disconnectInstagramMutation.isPending}
                >
                  {disconnectInstagramMutation.isPending ? "..." : "Disconnect"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn-secondary px-3 py-1.5 text-xs"
                onClick={async () => {
                  try {
                    const { url } = await fetchInstagramOAuthUrl();
                    window.location.assign(url);
                  } catch (e) {
                    setInstagramBanner((e as Error).message || "Could not start Instagram connect.");
                  }
                }}
              >
                Connect Instagram
              </button>
            )}
          </div>
        </div>

        <div className="pt-5">
          <h2 className="section-title text-sm">Creator Economy</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-control border border-black/10 bg-surface px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-muted">Stripe Connect</p>
              <p className="mt-1 text-sm text-text">
                {connectStatusQuery.data?.connected ? "Connected" : "Not connected"}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  className="btn-secondary px-3 py-1.5 text-xs"
                  onClick={() => connectAccountMutation.mutate()}
                  disabled={connectAccountMutation.isPending}
                >
                  {connectAccountMutation.isPending ? "Creating..." : "Create account"}
                </button>
                <button
                  className="btn-secondary px-3 py-1.5 text-xs"
                  onClick={() => onboardingMutation.mutate()}
                  disabled={onboardingMutation.isPending}
                >
                  {onboardingMutation.isPending ? "Opening..." : "Onboarding"}
                </button>
              </div>
            </div>
            <div className="rounded-control border border-black/10 bg-surface px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-muted">Earnings balance</p>
              <p className="mt-1 text-sm text-text">
                {formatMinorCurrency(earningsQuery.data?.totals?.balance_minor || 0, "usd")}
              </p>
              <p className="mt-1 text-xs text-muted">
                Affiliate commissions:{" "}
                {formatMinorCurrency(affiliatePerfQuery.data?.summary?.commission_earned_minor || 0, "usd")}
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <button className="btn-secondary" onClick={() => createProductMutation.mutate()}>
              {createProductMutation.isPending ? "Creating..." : "Create product"}
            </button>
            <button className="btn-secondary" onClick={() => createTierMutation.mutate()}>
              {createTierMutation.isPending ? "Creating..." : "Create tier"}
            </button>
            <button className="btn-secondary" onClick={() => createAffiliateCodeMutation.mutate()}>
              {createAffiliateCodeMutation.isPending ? "Creating..." : "Create affiliate code"}
            </button>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-control border border-black/10 bg-surface px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-muted">Products</p>
              <div className="mt-2 space-y-2">
                {(myProductsQuery.data?.items || []).slice(0, 4).map((product) => (
                  <div key={product.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">
                      {product.title} - {formatMinorCurrency(product.price_minor, product.currency)}
                    </span>
                    <button
                      className="btn-secondary px-2 py-1"
                      onClick={async () => {
                        await publishProduct(product.id);
                        await myProductsQuery.refetch();
                      }}
                    >
                      Publish
                    </button>
                  </div>
                ))}
                {myProductsQuery.data?.items?.length ? null : (
                  <p className="text-xs text-muted">No products yet.</p>
                )}
              </div>
            </div>
            <div className="rounded-control border border-black/10 bg-surface px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-muted">Subscription tiers</p>
              <div className="mt-2 space-y-2">
                {(myTiersQuery.data?.items || []).slice(0, 4).map((tier) => (
                  <div key={tier.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">
                      {tier.title} - {formatMinorCurrency(tier.monthly_price_minor, tier.currency)}/mo
                    </span>
                    <button
                      className="btn-secondary px-2 py-1"
                      onClick={async () => {
                        await publishTier(tier.id);
                        await myTiersQuery.refetch();
                      }}
                    >
                      Publish
                    </button>
                  </div>
                ))}
                {myTiersQuery.data?.items?.length ? null : (
                  <p className="text-xs text-muted">No tiers yet.</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-control border border-black/10 bg-surface px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-muted">Affiliate codes</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(affiliateCodesQuery.data?.items || []).map((code) => (
                <span key={code.id} className="rounded-pill border border-black/10 px-2 py-1 text-xs">
                  {code.code} ({code.uses_count})
                </span>
              ))}
              {affiliateCodesQuery.data?.items?.length ? null : (
                <p className="text-xs text-muted">No affiliate codes yet.</p>
              )}
            </div>
          </div>

          <div className="mt-3 rounded-control border border-black/10 bg-surface px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-muted">Creator rankings</p>
            <div className="mt-2 space-y-1">
              {(rankingsQuery.data?.items || []).slice(0, 5).map((row: any, index: number) => (
                <p key={`${row.creator_user_id}-${index}`} className="text-xs text-muted">
                  {index + 1}. {row.creator_display_name} - {formatMinorCurrency(row.gross_earnings_minor || 0, "usd")}
                </p>
              ))}
              {rankingsQuery.data?.items?.length ? null : (
                <p className="text-xs text-muted">No ranking data yet.</p>
              )}
            </div>
          </div>
        </div>

        <div id="salah-settings" className="pt-5">
          <h2 className="section-title text-sm">Salah notification settings</h2>
          {prayerSettingsQuery.isLoading ? (
            <p className="mt-2 text-sm text-muted">Loading Salah settings...</p>
          ) : prayerSettingsQuery.error ? (
            <p className="mt-2 text-sm text-muted">Unable to load Salah settings.</p>
          ) : prayerSettingsQuery.data ? (
            <form
              className="mt-3 grid gap-3 sm:grid-cols-2"
              onSubmit={async (event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                setSavingPrayer(true);
                await updatePrayerSettings({
                  quiet_mode: String(formData.get("quiet_mode") || "prayer_windows") as
                    | "off"
                    | "always"
                    | "prayer_windows",
                  calculation_method: String(
                    formData.get("calculation_method") || "muslim_world_league"
                  ),
                  timezone: String(formData.get("timezone") || "UTC"),
                  quiet_minutes_before: Number(formData.get("quiet_minutes_before") || 10),
                  quiet_minutes_after: Number(formData.get("quiet_minutes_after") || 20),
                  latitude: Number(formData.get("latitude") || 21.4225),
                  longitude: Number(formData.get("longitude") || 39.8262)
                });
                await prayerSettingsQuery.refetch();
                setSavingPrayer(false);
              }}
            >
              <label className="space-y-1 text-sm">
                <span className="text-muted">Quiet mode</span>
                <select
                  name="quiet_mode"
                  className="input"
                  defaultValue={prayerSettingsQuery.data.quiet_mode}
                >
                  <option value="prayer_windows">Prayer windows</option>
                  <option value="always">Always pause</option>
                  <option value="off">Off</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted">Calculation method</span>
                <select
                  name="calculation_method"
                  className="input"
                  defaultValue={prayerSettingsQuery.data.calculation_method}
                >
                  <option value="muslim_world_league">Muslim World League</option>
                  <option value="umm_al_qura">Umm al-Qura</option>
                  <option value="north_america">North America</option>
                  <option value="egyptian">Egyptian</option>
                  <option value="karachi">Karachi</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted">Timezone</span>
                <input
                  name="timezone"
                  className="input"
                  defaultValue={prayerSettingsQuery.data.timezone}
                  placeholder="UTC"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted">Quiet mins before</span>
                <input
                  name="quiet_minutes_before"
                  type="number"
                  className="input"
                  defaultValue={prayerSettingsQuery.data.quiet_minutes_before}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted">Quiet mins after</span>
                <input
                  name="quiet_minutes_after"
                  type="number"
                  className="input"
                  defaultValue={prayerSettingsQuery.data.quiet_minutes_after}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted">Latitude</span>
                <input
                  name="latitude"
                  type="number"
                  step="0.00001"
                  className="input"
                  defaultValue={prayerSettingsQuery.data.latitude}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted">Longitude</span>
                <input
                  name="longitude"
                  type="number"
                  step="0.00001"
                  className="input"
                  defaultValue={prayerSettingsQuery.data.longitude}
                />
              </label>
              <div className="sm:col-span-2">
                <button className="btn-primary" type="submit" disabled={savingPrayer}>
                  {savingPrayer ? "Saving..." : "Save Salah settings"}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </article>
    </section>
    </>
  );
}
