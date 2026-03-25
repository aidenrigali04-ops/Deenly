"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";

type UserProfile = {
  user_id: number;
  username?: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
};

export default function UserProfilePage() {
  const params = useParams<{ id: string }>();
  const userId = Number(params.id);
  const [activeTab, setActiveTab] = useState<"posts" | "media">("posts");

  const profileQuery = useQuery({
    queryKey: ["user-profile", userId],
    queryFn: () => apiRequest<UserProfile>(`/users/${userId}`),
    enabled: Number.isFinite(userId)
  });

  const followMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/follows/${userId}`, {
        method: "POST",
        auth: true
      })
  });

  const unfollowMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/follows/${userId}`, {
        method: "DELETE",
        auth: true
      })
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

  const placeholderStats = {
    posts: "0",
    followers: "0",
    following: "0"
  };

  return (
    <section className="profile-shell">
      <article className="profile-top">
        <div className="profile-row">
          <div className="flex min-w-0 items-center gap-3">
            <div className="profile-avatar">{initials}</div>
            <div className="min-w-0">
              <h1 className="truncate text-[1.75rem] font-semibold tracking-tight">{user.display_name}</h1>
              <p className="text-sm text-muted">@{user.username || "unknown"}</p>
            </div>
          </div>
          <div className="shrink-0">
            <button className="btn-secondary px-5" onClick={() => followMutation.mutate()}>
              {followMutation.isPending ? "Following..." : "Follow"}
            </button>
          </div>
        </div>

        <div className="profile-stat-grid">
          <div>
            <p className="profile-stat-value">{placeholderStats.posts}</p>
            <p className="profile-stat-label">Posts</p>
          </div>
          <div>
            <p className="profile-stat-value">{placeholderStats.followers}</p>
            <p className="profile-stat-label">Followers</p>
          </div>
          <div>
            <p className="profile-stat-value">{placeholderStats.following}</p>
            <p className="profile-stat-label">Following</p>
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
          {activeTab === "posts" ? (
            <div className="rounded-panel border border-black/10 bg-surface px-4 py-10 text-center text-sm text-muted">
              No posts to show yet.
            </div>
          ) : (
            <div className="rounded-panel border border-black/10 bg-surface px-4 py-10 text-center text-sm text-muted">
              No media to show yet.
            </div>
          )}
        </div>

        {user.bio ? <p className="pt-4 text-sm text-muted">{user.bio}</p> : null}
        {followMutation.isSuccess ? (
          <p className="pt-2 text-xs text-text">Followed successfully.</p>
        ) : null}
        {unfollowMutation.isSuccess ? (
          <p className="pt-2 text-xs text-text">Unfollowed successfully.</p>
        ) : null}

        <div className="pt-2">
          <button className="text-xs text-muted underline" onClick={() => unfollowMutation.mutate()}>
            {unfollowMutation.isPending ? "Updating..." : "Unfollow"}
          </button>
        </div>
      </article>
    </section>
  );
}
