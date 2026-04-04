import Link from "next/link";

export default function HomePage() {
  return (
    <section className="mx-auto max-w-3xl space-y-6 py-12">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">Deenly</h1>
        <p className="text-muted">
          A Muslim-first platform for community, local businesses, and everyday connection.
        </p>
      </div>
      <div className="surface-card space-y-4">
        <p className="text-sm text-muted">
          Sign in to access Home, Marketplace, Messages, Search, Create, and your Account.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/auth/login" className="btn-primary">
            Login
          </Link>
          <Link href="/auth/signup" className="btn-secondary">
            Create account
          </Link>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="surface-card space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Financial benefit</p>
          <p className="text-sm text-text">Attach offers to posts and move buyers into fast checkout flows.</p>
        </div>
        <div className="surface-card space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Save time</p>
          <p className="text-sm text-text">Use concise AI drafts and reusable setup defaults to publish faster.</p>
        </div>
        <div className="surface-card space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Convenience</p>
          <p className="text-sm text-text">Resume drafts and launch quick actions from existing surfaces.</p>
        </div>
      </div>
    </section>
  );
}
