import Link from "next/link";

export default function PrivacyPage() {
  return (
    <section className="mx-auto max-w-2xl space-y-4 py-8">
      <p className="text-sm text-muted">
        <Link href="/" className="text-sky-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25">
          Home
        </Link>
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        <strong>Template.</strong> Replace with counsel-reviewed privacy disclosures (data collected, legal bases,
        retention, subprocessors, regional rights) before a public launch.
      </p>
      <div className="prose prose-sm max-w-none text-text">
        <p>Deenly processes account, content, and usage data to run the service, keep it safe, and improve features.</p>
        <p>
          You can request a machine-readable export of data we hold for your account from Account settings, and you may
          close your account from the same place (standard user accounts).
        </p>
        <p>Location, notifications, and third-party integrations (e.g. payments) are used only as needed for those features.</p>
        <p>
          See also{" "}
          <Link href="/guidelines" className="text-sky-700 underline-offset-2 hover:underline">
            Community Guidelines
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
