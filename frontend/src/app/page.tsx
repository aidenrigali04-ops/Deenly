import Link from "next/link";

export default function HomePage() {
  return (
    <section className="mx-auto max-w-3xl space-y-6 py-12">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">Deenly</h1>
        <p className="text-muted">
          A Muslim-first platform for beneficial reminders, local businesses, and sincere community.
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
    </section>
  );
}
