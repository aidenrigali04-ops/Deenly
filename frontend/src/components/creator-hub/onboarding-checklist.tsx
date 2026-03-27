"use client";

import type { ReactNode } from "react";
import type { ConnectStatus } from "@/lib/monetization";
import type { CreatorHubTab } from "./creator-hub-constants";

function StripeConnectStepsGuide({ connect }: { connect: ConnectStatus | undefined }) {
  const connected = Boolean(connect?.connected);
  const chargesOk = Boolean(connect?.chargesEnabled);
  const detailsOk = Boolean(connect?.detailsSubmitted);
  const fullyReady = detailsOk && chargesOk;
  if (fullyReady) {
    return null;
  }

  return (
    <div className="rounded-control border border-sky-200/80 bg-sky-50/60 px-3 py-3">
      <p className="text-xs font-semibold text-text">Steps to connect Stripe</p>
      <ol className="mt-2 list-decimal space-y-2 pl-4 text-xs text-muted">
        <li className={!connected ? "font-medium text-text" : ""}>
          <span className="text-text">Connect Stripe account</span> — Press the button below. Deenly links a Stripe Express
          account so you can receive payouts (no separate Stripe signup before this step).
        </li>
        <li className={connected && !chargesOk ? "font-medium text-text" : ""}>
          <span className="text-text">Finish in Stripe</span> — Stripe will ask for business details, identity, and bank
          information. Use &quot;Continue setup in Stripe&quot; when you are ready.
        </li>
        <li>
          <span className="text-text">Come back here</span> — When Stripe enables charges and payouts, your status below
          will update. You can reopen setup anytime until it is complete.
        </li>
      </ol>
    </div>
  );
}

function CheckRow({
  done,
  title,
  description,
  children
}: {
  done: boolean;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <li className="flex gap-3 rounded-control border border-black/10 bg-surface px-3 py-3">
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          done ? "bg-emerald-600 text-white" : "border border-black/20 bg-white text-muted"
        }`}
        aria-hidden
      >
        {done ? "✓" : ""}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text">{title}</p>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
        {children ? <div className="mt-2 flex flex-wrap gap-2">{children}</div> : null}
      </div>
    </li>
  );
}

export function OnboardingChecklist({
  connect,
  productCount,
  publishedProductCount,
  onNavigateTab,
  onConnectStripe,
  onOpenOnboarding,
  connectStripePending,
  onboardingPending
}: {
  connect: ConnectStatus | undefined;
  productCount: number;
  publishedProductCount: number;
  onNavigateTab: (tab: CreatorHubTab) => void;
  onConnectStripe: () => void;
  onOpenOnboarding: () => void;
  connectStripePending: boolean;
  onboardingPending: boolean;
}) {
  const connected = Boolean(connect?.connected);
  const detailsOk = Boolean(connect?.detailsSubmitted);
  const chargesOk = Boolean(connect?.chargesEnabled);
  const onboardingComplete = detailsOk && chargesOk;

  return (
    <section className="space-y-3" aria-labelledby="creator-onboarding-heading">
      <h2 id="creator-onboarding-heading" className="section-title text-sm">
        Get set up
      </h2>
      <p className="text-xs text-muted">
        Complete these steps to accept payments and attach offers to posts.
      </p>
      <StripeConnectStepsGuide connect={connect} />
      <ul className="space-y-2">
        <CheckRow
          done={connected}
          title="Connect Stripe account"
          description="Link Stripe Express with Deenly so checkout payouts reach your bank."
        >
          {!connected ? (
            <button
              type="button"
              className="btn-primary px-3 py-1.5 text-xs"
              onClick={onConnectStripe}
              disabled={connectStripePending}
            >
              {connectStripePending ? "Connecting…" : "Connect Stripe account"}
            </button>
          ) : null}
        </CheckRow>
        <CheckRow
          done={onboardingComplete}
          title="Complete setup in Stripe"
          description="Verify your details and enable charges so buyers can pay you."
        >
          {connected && !onboardingComplete ? (
            <button
              type="button"
              className="btn-secondary px-3 py-1.5 text-xs"
              onClick={onOpenOnboarding}
              disabled={onboardingPending}
            >
              {onboardingPending ? "Opening…" : "Continue setup in Stripe"}
            </button>
          ) : null}
          {connected && onboardingComplete ? (
            <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => onNavigateTab("payouts")}>
              View payout status
            </button>
          ) : null}
        </CheckRow>
        <CheckRow
          done={productCount > 0}
          title="Add a product"
          description="Save a draft offer in your catalog."
        >
          {productCount === 0 ? (
            <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => onNavigateTab("products")}>
              Go to Products
            </button>
          ) : null}
        </CheckRow>
        <CheckRow
          done={publishedProductCount > 0}
          title="Publish a product"
          description="Published items can be attached when you create a post."
        >
          {productCount > 0 && publishedProductCount === 0 ? (
            <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => onNavigateTab("products")}>
              Publish in catalog
            </button>
          ) : null}
        </CheckRow>
      </ul>
    </section>
  );
}
