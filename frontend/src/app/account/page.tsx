"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSessionMe } from "@/lib/auth";
import { ErrorState, LoadingState } from "@/components/states";

export default function AccountPage() {
  const [activeTab, setActiveTab] = useState<"posts" | "media">("posts");
  const sessionQuery = useQuery({
    queryKey: ["account-session-me"],
    queryFn: () => fetchSessionMe()
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
  const initials =
    (user.username || user.email || "U")
      .split(/[.@_\s-]/)
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
              <h1 className="truncate text-[1.75rem] font-semibold tracking-tight">{user.username || "User_Profile"}</h1>
              <p className="text-sm text-muted">{user.email}</p>
            </div>
          </div>
          <div className="shrink-0">
            <button type="button" className="btn-secondary px-5">
              Edit Profile
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
              Your posts will appear here.
            </div>
          ) : (
            <div className="rounded-panel border border-black/10 bg-surface px-4 py-10 text-center text-sm text-muted">
              Your media will appear here.
            </div>
          )}
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
      </article>
    </section>
  );
}
