"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function CheckoutCancelContent() {
  const searchParams = useSearchParams();
  const kind = searchParams.get("kind");
  const isAdBoost = kind === "ad_boost";

  return (
    <div className="page-stack mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-text">Checkout canceled</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        {isAdBoost
          ? "No charge was made. You can return to Creator hub and try payment again when you are ready."
          : "No charge was made. You can return to the product or feed and try again whenever you are ready."}
      </p>
      <div className="mt-10 flex flex-col gap-2 sm:flex-row sm:justify-center">
        {isAdBoost ? (
          <Link
            href="/account/creator?tab=grow"
            className="btn-primary inline-flex justify-center px-4 py-2 text-sm"
          >
            Back to ad campaigns
          </Link>
        ) : (
          <Link href="/feed" className="btn-primary inline-flex justify-center px-4 py-2 text-sm">
            Back to feed
          </Link>
        )}
        <Link href="/account/purchases" className="btn-secondary inline-flex justify-center px-4 py-2 text-sm">
          Your purchases
        </Link>
      </div>
    </div>
  );
}

export default function CheckoutCancelPage() {
  return (
    <Suspense
      fallback={
        <div className="page-stack mx-auto max-w-md px-4 py-16 text-center text-sm text-muted">Loading…</div>
      }
    >
      <CheckoutCancelContent />
    </Suspense>
  );
}
