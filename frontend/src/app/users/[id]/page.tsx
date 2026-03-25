"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { resolveMediaUrl } from "@/lib/media-url";
import { followUser, unfollowUser } from "@/lib/follows";

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
  const userId = Number(params.id);
  const [activeTab, setActiveTab] = useState<"posts" | "media">("posts");
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
    activeTab === "media" ? profileItems.filter((item) => Boolean(item.media_url)) : profileItems;

  return (
    <section className="profile-shell">
      <article className="profile-top">
        <div className="profile-row">
          <div className="flex min-w-0 items-center gap-3">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={`${user.display_name} avatar`} className="profile-avatar object-cover" />
            ) : (
              <div className="profile-avatar">{initials}</div>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-[1.75rem] font-semibold tracking-tight">{user.display_name}</h1>
              <p className="text-sm text-muted">@{user.username || "unknown"}</p>
            </div>
          </div>
          <div className="shrink-0">
            <button
              className="btn-secondary px-5"
              onClick={() =>
                user.is_following ? unfollowMutation.mutate() : followMutation.mutate()
              }
            >
              {followMutation.isPending || unfollowMutation.isPending
                ? "Updating..."
                : user.is_following
                  ? "Unfollow"
                  : "Follow"}
            </button>
          </div>
        </div>

        <div className="profile-stat-grid">
          <div>
            <p className="profile-stat-value">{user.posts_count}</p>
            <p className="profile-stat-label">Posts</p>
          </div>
          <div>
            <p className="profile-stat-value">{user.followers_count}</p>
            <p className="profile-stat-label">Followers</p>
          </div>
          <div>
            <p className="profile-stat-value">{user.following_count}</p>
            <p className="profile-stat-label">Following</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
          <div className="rounded-control border border-black/10 bg-surface px-3 py-2">
            Likes received: {user.likes_received_count}
          </div>
          <div className="rounded-control border border-black/10 bg-surface px-3 py-2">
            Likes by user: {user.likes_given_count}
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
          {postsQuery.isLoading ? <LoadingState label="Loading posts..." /> : null}
          {postsQuery.error ? <ErrorState message={(postsQuery.error as Error).message} /> : null}
          {!postsQuery.isLoading && !postsQuery.error && visibleItems.length === 0 ? (
            <div className="rounded-panel border border-black/10 bg-surface px-4 py-10 text-center text-sm text-muted">
              {activeTab === "posts" ? "No posts to show yet." : "No media to show yet."}
            </div>
          ) : null}
          <div className="space-y-3">
            {visibleItems.map((item) => {
              const mediaUrl = resolveMediaUrl(item.media_url) || undefined;
              const isImage = item.media_mime_type?.startsWith("image/");
              return (
                <article key={item.id} className="rounded-panel border border-black/10 bg-card p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{item.author_display_name}</p>
                    <time className="text-xs text-muted">{new Date(item.created_at).toLocaleString()}</time>
                  </div>
                  <p className="mt-2 text-sm text-text">{item.content}</p>
                  {mediaUrl ? (
                    <div className="mt-3 overflow-hidden rounded-control border border-black/10 bg-surface">
                      {isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={mediaUrl} alt="post media" className="feed-media-frame w-full" />
                      ) : (
                        <video controls className="feed-media-frame w-full">
                          <source src={mediaUrl} />
                        </video>
                      )}
                    </div>
                  ) : null}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-muted">Benefited: {item.benefited_count || 0}</span>
                    <button
                      className="btn-secondary px-3 py-1.5 text-xs"
                      onClick={() => likeMutation.mutate(item.id)}
                      disabled={likeMutation.isPending}
                    >
                      {likeMutation.isPending ? "Liking..." : "Like"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        {user.bio ? <p className="pt-4 text-sm text-muted">{user.bio}</p> : null}
        {followMutation.isSuccess ? <p className="pt-2 text-xs text-text">Followed successfully.</p> : null}
        {unfollowMutation.isSuccess ? (
          <p className="pt-2 text-xs text-text">Unfollowed successfully.</p>
        ) : null}
      </article>
    </section>
  );
}
