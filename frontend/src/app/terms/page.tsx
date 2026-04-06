import Link from "next/link";

export default function TermsPage() {
  return (
    <section className="mx-auto max-w-2xl space-y-4 py-8">
      <p className="text-sm text-muted">
        <Link href="/" className="text-sky-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25">
          Home
        </Link>
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        <strong>Template.</strong> Replace this page with counsel-reviewed terms before a public launch. It exists so
        signup, settings, and stores can link to a stable URL.
      </p>
      <div className="prose prose-sm max-w-none text-text">
        <p>
          By using Deenly, you agree to follow our{" "}
          <Link href="/guidelines" className="text-sky-700 underline-offset-2 hover:underline">
            Community Guidelines
          </Link>{" "}
          and to use the service lawfully and respectfully.
        </p>
        <p>
          Deenly may change features, suspend accounts for violations, or update these terms with reasonable notice where
          required.
        </p>
        <p>For commerce and payouts, additional Stripe and seller obligations apply when you use monetization tools.</p>
        <p>
          Questions: use in-app Support or your published support contact. Effective date: see your deployment records.
        </p>
      </div>
    </section>
  );
}
