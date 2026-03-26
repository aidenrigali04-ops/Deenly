"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchSessionMe } from "@/lib/auth";
import { apiRequest } from "@/lib/api";
import { ErrorState, LoadingState } from "@/components/states";

type MeProfile = {
  likes_received_count: number;
  likes_given_count: number;
};

export default function AccountSettingsPage() {
  const sessionQuery = useQuery({
    queryKey: ["account-settings-session-me"],
    queryFn: () => fetchSessionMe()
  });
  const profileQuery = useQuery({
    queryKey: ["account-profile-me"],
    queryFn: () => apiRequest<MeProfile>("/users/me", { auth: true }),
    enabled: Boolean(sessionQuery.data?.id)
  });

  if (sessionQuery.isLoading) {
    return <LoadingState label="Loading..." />;
  }
  if (sessionQuery.error || !sessionQuery.data) {
    return <ErrorState message="Sign in to view settings." />;
  }

  const user = sessionQuery.data;
  const likes = profileQuery.data;

  return (
    <div className="page-stack mx-auto w-full max-w-2xl">
      <header className="page-header">
        <p className="text-sm text-muted">
          <Link
            href="/account"
            className="rounded-sm text-sky-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Back to profile
          </Link>
        </p>
        <h1 className="page-header-title mt-4">Account</h1>
        <p className="page-header-subtitle">Preferences and account details for Deenly.</p>
      </header>

      <div className="section-stack">
        <div className="surface-card px-6 py-6">
          <h2 className="text-sm font-semibold text-text">Overview</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-control border border-black/10 bg-surface px-3 py-2 text-sm text-muted">
              Likes received:{" "}
              <span className="font-semibold text-text">{likes?.likes_received_count ?? "—"}</span>
            </div>
            <div className="rounded-control border border-black/10 bg-surface px-3 py-2 text-sm text-muted">
              Likes by you: <span className="font-semibold text-text">{likes?.likes_given_count ?? "—"}</span>
            </div>
            <div className="rounded-control border border-black/10 bg-surface px-3 py-2 sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-muted">Email</p>
              <p className="mt-1 font-medium text-text">{user.email}</p>
            </div>
            <div className="rounded-control border border-black/10 bg-surface px-3 py-2 sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-muted">Username</p>
              <p className="mt-1 font-medium text-text">@{user.username || "unknown"}</p>
            </div>
            <div className="rounded-control border border-black/10 bg-surface px-3 py-2 sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-muted">Role</p>
              <p className="mt-1 font-medium text-text">{user.role}</p>
            </div>
          </div>
        </div>

        <div className="surface-card px-6 py-6">
          <h2 className="text-sm font-semibold text-text">Navigate</h2>
          <p className="mt-1 text-xs text-muted">Jump to other areas of the app.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/account/edit" className="btn-secondary inline-flex">
              Edit profile
            </Link>
            <Link href="/account/creator" className="btn-secondary inline-flex">
              Creator hub
            </Link>
            <Link href="/onboarding" className="btn-secondary inline-flex">
              Interests
            </Link>
            <Link href="/sessions" className="btn-secondary inline-flex">
              Sessions
            </Link>
            <Link href="/notifications" className="btn-secondary inline-flex">
              Inbox
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
