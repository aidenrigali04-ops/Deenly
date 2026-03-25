"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchSessionMe } from "@/lib/auth";
import { ErrorState, LoadingState } from "@/components/states";

export default function AccountPage() {
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
  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <div className="surface-card space-y-4">
        <h1 className="section-title">Account</h1>
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
      </div>
      <div className="surface-card flex flex-wrap gap-3">
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
    </section>
  );
}
