"use client";

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

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <article className="surface-card space-y-3">
        <h1 className="text-2xl font-bold">{user.display_name}</h1>
        <p className="text-sm text-muted">@{user.username || "unknown"}</p>
        <p className="text-sm">{user.bio || "No bio provided yet."}</p>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => followMutation.mutate()}>
            {followMutation.isPending ? "Following..." : "Follow"}
          </button>
          <button className="btn-secondary" onClick={() => unfollowMutation.mutate()}>
            {unfollowMutation.isPending ? "Updating..." : "Unfollow"}
          </button>
        </div>
        {followMutation.isSuccess ? (
          <p className="text-xs text-accent">Followed successfully.</p>
        ) : null}
        {unfollowMutation.isSuccess ? (
          <p className="text-xs text-accent">Unfollowed successfully.</p>
        ) : null}
      </article>
    </section>
  );
}
