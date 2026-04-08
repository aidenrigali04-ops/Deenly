import Link from "next/link";

export default function AccountPaymentsHelpPage() {
  return (
    <div className="page-stack mx-auto w-full max-w-2xl">
      <header className="page-header">
        <p className="text-sm text-muted">
          <Link href="/account" className="text-sky-600 hover:underline">
            Back to profile
          </Link>
        </p>
        <h1 className="page-header-title mt-4 text-xl sm:text-2xl">Payments and checkout</h1>
        <p className="page-header-subtitle text-xs sm:text-sm">
          How buying on Deenly works and where to find your orders.
        </p>
      </header>

      <article className="surface-card space-y-6 px-4 py-5 text-sm leading-relaxed text-text sm:px-6">
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Checkout flow</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted">
            <li>Review the product on the listing or in the feed, then choose to continue to checkout.</li>
            <li>Complete payment on Stripe (card, Apple Pay, or Google Pay when supported).</li>
            <li>Return to Deenly; digital access and receipts are sent by email, with optional SMS if you opt in.</li>
          </ol>
        </section>
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Guest checkout</h2>
          <p className="mt-3 text-muted">
            You do not need an account to buy many digital products. You can still sign in later to attach purchases to
            your profile when we offer that from your receipt link.
          </p>
        </section>
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">After you pay</h2>
          <p className="mt-3 text-muted">
            Signed-in buyers can see orders on{" "}
            <Link href="/account/purchases" className="text-sky-700 underline-offset-2 hover:underline">
              Purchases
            </Link>
            . Always keep your email receipt as a backup.
          </p>
        </section>
        <p className="border-t border-black/10 pt-4 text-xs text-muted">
          <Link href="/terms" className="text-sky-700 underline-offset-2 hover:underline">
            Terms
          </Link>
          {" · "}
          <Link href="/privacy" className="text-sky-700 underline-offset-2 hover:underline">
            Privacy
          </Link>
        </p>
      </article>
    </div>
  );
}
