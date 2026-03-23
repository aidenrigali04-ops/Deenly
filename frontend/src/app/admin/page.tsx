"use client";

import Link from "next/link";

const tableLinks = [
  "users",
  "profiles",
  "posts",
  "interactions",
  "follows",
  "post_views",
  "reports",
  "moderation_actions",
  "user_blocks",
  "user_mutes",
  "analytics_events",
  "refresh_tokens",
  "user_interests",
  "notifications",
  "user_warnings",
  "user_restrictions",
  "appeals",
  "waitlist_entries",
  "beta_invites",
  "support_tickets"
];

export default function AdminHomePage() {
  return (
    <section className="space-y-4">
      <div className="surface-card">
        <h1 className="text-2xl font-semibold">Admin Console</h1>
        <p className="mt-2 text-sm text-muted">
          Full table coverage for moderation, safety, sessions, analytics, beta, and support.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tableLinks.map((table) => (
          <Link
            key={table}
            href={`/admin/tables/${table}`}
            className="surface-card text-sm hover:border-accent/40"
          >
            {table}
          </Link>
        ))}
      </div>
      <div className="surface-card">
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/analytics" className="btn-primary inline-flex">
            Open Analytics Dashboard
          </Link>
          <Link href="/admin/moderation" className="btn-secondary inline-flex">
            Open Moderation Actions
          </Link>
          <Link href="/admin/operations" className="btn-secondary inline-flex">
            Open Operations Console
          </Link>
        </div>
      </div>
    </section>
  );
}
