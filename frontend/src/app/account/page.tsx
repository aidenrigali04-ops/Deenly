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
    <section className="space-y-4">
      <div className="surface-card space-y-2">
        <h1 className="text-xl font-semibold">Account</h1>
        <p className="text-sm text-muted">{user.email}</p>
        <p className="text-sm text-muted">@{user.username || "unknown"}</p>
        <p className="text-sm text-muted">Role: {user.role}</p>
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
