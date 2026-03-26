"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  return (
    <div className="page-stack mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-text">Payment received</h1>
      <p className="mt-3 text-sm text-muted">
        Thank you. If you bought access to a product, you can open it again from the post or your library when that flow
        is available. Subscription and support payments are recorded on your account.
      </p>
      {sessionId ? (
        <p className="mt-2 font-mono text-xs text-muted break-all" aria-label="Checkout session reference">
          Ref: {sessionId}
        </p>
      ) : null}
      <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link href="/feed" className="btn-primary inline-flex justify-center px-4 py-2 text-sm">
          Back to feed
        </Link>
        <Link href="/account/creator" className="btn-secondary inline-flex justify-center px-4 py-2 text-sm">
          Creator hub
        </Link>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="page-stack mx-auto max-w-md px-4 py-16 text-center text-sm text-muted">Loading…</div>
      }
    >
      <CheckoutSuccessContent />
    </Suspense>
  );
}
