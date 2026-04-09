"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const kind = searchParams.get("kind");
  const isAdBoost = kind === "ad_boost";

  return (
    <div className="page-stack mx-auto max-w-md px-4 py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-600/30 bg-emerald-50 text-2xl text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-950/50 dark:text-emerald-400">
        ✓
      </div>
      <h1 className="mt-6 text-xl font-semibold text-text">Payment successful</h1>
      {isAdBoost ? (
        <>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Your boost budget is recorded. If your creative is already approved, delivery can start; otherwise it stays in
            review until a moderator approves it.
          </p>
          <div className="mt-10 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link
              href="/account/creator?tab=grow"
              className="btn-primary inline-flex justify-center px-4 py-2 text-sm"
            >
              Back to ad campaigns
            </Link>
            <Link href="/feed" className="btn-secondary inline-flex justify-center px-4 py-2 text-sm">
              Back to feed
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Thank you. For product purchases, check your email for the secure access link (including spam). If you opted
            in, you will also receive a text with the same link. Subscription and support payments appear on your Deenly
            account when you paid while signed in.
          </p>
          <div className="mt-10 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href="/account/purchases" className="btn-primary inline-flex justify-center px-4 py-2 text-sm">
              View purchases
            </Link>
            <Link href="/feed" className="btn-secondary inline-flex justify-center px-4 py-2 text-sm">
              Back to feed
            </Link>
          </div>
          <p className="mt-6 text-xs text-muted">
            <Link href="/account/payments" className="text-sky-700 underline-offset-2 hover:underline">
              How payments work
            </Link>
          </p>
        </>
      )}
      {sessionId ? (
        <p className="mt-3 font-mono text-xs text-muted break-all" aria-label="Checkout session reference">
          Reference: {sessionId}
        </p>
      ) : null}
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
