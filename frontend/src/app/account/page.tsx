"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSessionMe } from "@/lib/auth";
import { apiRequest } from "@/lib/api";
import { resolveMediaUrl } from "@/lib/media-url";
import { ErrorState, LoadingState } from "@/components/states";
import { fetchPrayerSettings, updatePrayerSettings } from "@/lib/prayer";

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
  const [activeTab, setActiveTab] = useState<"posts" | "media">("posts");
  const [savingPrayer, setSavingPrayer] = useState(false);
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
    activeTab === "media" ? profileItems.filter((item) => Boolean(item.media_url)) : profileItems;

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
          avatarUrl: signature.key
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

  return (
    <section className="profile-shell">
      <article className="profile-top">
        <div className="profile-row">
          <div className="flex min-w-0 items-center gap-3">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="Profile avatar" className="profile-avatar object-cover" />
            ) : (
              <div className="profile-avatar">{initials}</div>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-[1.75rem] font-semibold tracking-tight">{user.username || "User_Profile"}</h1>
              <p className="text-sm text-muted">{user.email}</p>
            </div>
          </div>
          <div className="shrink-0">
            <button
              type="button"
              className="btn-secondary px-5"
              disabled={avatarUploading}
              onClick={() => avatarInputRef.current?.click()}
            >
              {avatarUploading ? "Uploading..." : "Upload Photo"}
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
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
        </div>
        {avatarError ? <p className="pt-2 text-xs text-rose-300">{avatarError}</p> : null}

        <div className="profile-stat-grid">
          <div>
            <p className="profile-stat-value">{profile?.posts_count ?? 0}</p>
            <p className="profile-stat-label">Posts</p>
          </div>
          <div>
            <p className="profile-stat-value">{profile?.followers_count ?? 0}</p>
            <p className="profile-stat-label">Followers</p>
          </div>
          <div>
            <p className="profile-stat-value">{profile?.following_count ?? 0}</p>
            <p className="profile-stat-label">Following</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
          <div className="rounded-control border border-black/10 bg-surface px-3 py-2">
            Likes received: {profile?.likes_received_count ?? 0}
          </div>
          <div className="rounded-control border border-black/10 bg-surface px-3 py-2">
            Likes by you: {profile?.likes_given_count ?? 0}
          </div>
        </div>

        <div className="mt-4 profile-tab-strip">
          <button
            className={`profile-tab ${activeTab === "posts" ? "profile-tab-active" : ""}`}
            onClick={() => setActiveTab("posts")}
            type="button"
          >
            Posts
          </button>
          <button
            className={`profile-tab ${activeTab === "media" ? "profile-tab-active" : ""}`}
            onClick={() => setActiveTab("media")}
            type="button"
          >
            Media
          </button>
        </div>

        <div className="pt-4">
          {postsQuery.isLoading ? <LoadingState label="Loading your posts..." /> : null}
          {postsQuery.error ? <ErrorState message={(postsQuery.error as Error).message} /> : null}
          {!postsQuery.isLoading && !postsQuery.error && visibleItems.length === 0 ? (
            <div className="rounded-panel border border-black/10 bg-surface px-4 py-10 text-center text-sm text-muted">
              {activeTab === "posts" ? "Your posts will appear here." : "Your media will appear here."}
            </div>
          ) : null}
          <div className="profile-post-grid">
            {visibleItems.map((item) => {
              const mediaUrl = resolveMediaUrl(item.media_url) || undefined;
              const isImage = item.media_mime_type?.startsWith("image/");
              const isVideo = item.media_mime_type?.startsWith("video/");
              const fallbackLabel = item.content?.trim().slice(0, 26) || "Post";
              return (
                <article key={item.id} className="profile-grid-tile">
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
                      <div className="profile-grid-fallback">{fallbackLabel}</div>
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
        </div>

        <div className="pt-4 grid gap-3 text-sm sm:grid-cols-2">
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
  );
}
