"use client";

import type { ReactNode } from "react";
import type { ConnectStatus } from "@/lib/monetization";
import { getPayoutSetupCopy, isPayoutSetupComplete } from "@/lib/payout-setup";
import type { CreatorHubTab } from "./creator-hub-constants";

function PayoutSetupStepsGuide({ connect }: { connect: ConnectStatus | undefined }) {
  if (isPayoutSetupComplete(connect)) {
    return null;
  }
  const copy = getPayoutSetupCopy(connect);
  const connected = Boolean(connect?.connected);
  const step2Active = connected && !isPayoutSetupComplete(connect);

  return (
    <div className="rounded-control border border-sky-200/80 bg-sky-50/60 px-3 py-3">
      <p className="text-xs font-semibold text-text">{copy.headline}</p>
      <p className="mt-1 text-xs text-muted">{copy.subline}</p>
      <ol className="mt-3 list-decimal space-y-2 pl-4 text-xs text-muted">
        <li className={!connected ? "font-medium text-text" : ""}>
          <span className="text-text">{copy.step1Label}</span> — {copy.step1Body}
        </li>
        <li className={step2Active ? "font-medium text-text" : ""}>
          <span className="text-text">{copy.step2Label}</span> — {copy.step2Body}
        </li>
      </ol>
      <p className="mt-2 text-xs text-muted">
        Back from the form? Status updates in a few seconds—refresh this page if it still looks old.
      </p>
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
      <PayoutSetupStepsGuide connect={connect} />
      <ul className="space-y-2">
        <CheckRow
          done={connected}
          title="Start payout setup"
          description="One tap creates your secure payout profile so money from sales can reach you."
        >
          {!connected ? (
            <button
              type="button"
              className="btn-primary px-3 py-1.5 text-xs"
              onClick={onConnectStripe}
              disabled={connectStripePending}
            >
              {connectStripePending ? "Starting…" : "Start getting paid"}
            </button>
          ) : null}
        </CheckRow>
        <CheckRow
          done={onboardingComplete}
          title="Bank account & verify"
          description="Finish on a short secure form (identity + bank). Required once for card payments."
        >
          {connected && !onboardingComplete ? (
            <button
              type="button"
              className="btn-secondary px-3 py-1.5 text-xs"
              onClick={onOpenOnboarding}
              disabled={onboardingPending}
            >
              {onboardingPending ? "Opening…" : "Continue secure setup (~5 min)"}
            </button>
          ) : null}
          {connected && onboardingComplete ? (
            <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => onNavigateTab("payouts")}>
              Payout details
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
