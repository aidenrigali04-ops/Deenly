"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createGuestProductCheckout,
  createProductCheckout,
  fetchProductCheckoutRewardsPreview,
  formatMinorCurrency,
  type PublicCatalogProduct
} from "@/lib/monetization";
import { useSessionStore } from "@/store/session-store";

export function CheckoutExplainer({ variant = "full" }: { variant?: "full" | "compact" }) {
  const stepWrap =
    variant === "compact"
      ? "rounded-md border border-black/10 bg-surface/80 px-2 py-1.5 text-center"
      : "rounded-control border border-black/10 bg-surface/80 px-2 py-2 text-center";
  const stepTitle = variant === "compact" ? "text-[11px] font-semibold text-text" : "text-xs font-semibold text-text";
  const stepDesc = variant === "compact" ? "text-[10px] leading-snug text-muted" : "text-[11px] leading-snug text-muted";
  const list = variant === "compact" ? "text-[11px] leading-relaxed" : "text-xs leading-relaxed";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          { n: "1", t: "Review", d: "Confirm item" },
          { n: "2", t: "Pay", d: "Stripe (3D Secure if needed)" },
          { n: "3", t: "Access", d: "Email & optional SMS" }
        ].map((s) => (
          <div key={s.n} className={stepWrap}>
            <p className={stepTitle}>
              {s.n}. {s.t}
            </p>
            <p className={stepDesc}>{s.d}</p>
          </div>
        ))}
      </div>
      <ul className={`list-disc space-y-1 pl-4 text-muted ${list}`}>
        <li>Card, Apple Pay, or Google Pay when your device and browser support them.</li>
        <li>Payment runs on Stripe; Deenly does not store your full card details.</li>
        <li>After payment you return to Deenly; receipts and digital access go to your email (and SMS if you opt in).</li>
      </ul>
    </div>
  );
}

type ProductCheckoutPanelProps = {
  productId: number;
  title: string;
  priceMinor: number;
  currency: string;
  productType: PublicCatalogProduct["product_type"];
  websiteUrl: string | null;
  loginNextEncoded: string;
  onScrollToOffer: () => void;
};

export function ProductCheckoutPanel({
  productId,
  title,
  priceMinor,
  currency,
  productType,
  websiteUrl,
  loginNextEncoded,
  onScrollToOffer
}: ProductCheckoutPanelProps) {
  const sessionUser = useSessionStore((state) => state.user);
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [guestEmail, setGuestEmail] = useState("");
  const [guestExpanded, setGuestExpanded] = useState(false);
  const [useMaxPoints, setUseMaxPoints] = useState(false);
  const [redeemClientRequestId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `rq_${Date.now()}`
  );

  const rewardsPreviewQuery = useQuery({
    queryKey: ["rewards-checkout-preview", productId, useMaxPoints],
    queryFn: () =>
      fetchProductCheckoutRewardsPreview(productId, {
        redeemEnabled: useMaxPoints,
        redeemPointsMinor: useMaxPoints ? undefined : undefined
      }),
    enabled: Boolean(sessionUser && useMaxPoints)
  });

  const checkoutMutation = useMutation({
    mutationFn: () =>
      createProductCheckout(productId, {
        smsOptIn,
        ...(useMaxPoints
          ? { redeemMaxPoints: true, redeemClientRequestId }
          : {})
      }),
    onSuccess: (result) => {
      if (result?.checkoutUrl && typeof window !== "undefined") {
        window.location.assign(result.checkoutUrl);
      }
    }
  });

  const guestCheckoutMutation = useMutation({
    mutationFn: () =>
      createGuestProductCheckout(productId, {
        guestEmail: guestEmail.trim() || undefined,
        smsOptIn
      }),
    onSuccess: (result) => {
      if (result?.checkoutUrl && typeof window !== "undefined") {
        window.location.assign(result.checkoutUrl);
      }
    }
  });

  const priceLabel = formatMinorCurrency(priceMinor, currency);
  const openWebsite =
    productType !== "digital" && websiteUrl
      ? () => {
          window.open(websiteUrl, "_blank", "noopener,noreferrer");
        }
      : null;

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-control border border-black/10 bg-surface/60 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">How checkout works</p>
        <div className="mt-3">
          <CheckoutExplainer variant="full" />
        </div>
      </div>

      <div className="rounded-control border border-sky-600/20 bg-sky-50/80 px-4 py-3 dark:border-sky-500/30 dark:bg-sky-950/40">
        <p className="text-sm font-semibold text-text">{title}</p>
        <p className="mt-1 text-sm text-muted">{priceLabel}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={onScrollToOffer}>
          View full offer
        </button>
        {openWebsite ? (
          <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={openWebsite}>
            Visit seller site
          </button>
        ) : null}
        {!sessionUser ? (
          <>
            <Link href={`/auth/login?next=${loginNextEncoded}`} className="btn-primary inline-flex px-4 py-2 text-sm">
              Log in to buy
            </Link>
            <button
              type="button"
              className="btn-secondary px-4 py-2 text-sm"
              onClick={() => setGuestExpanded((v) => !v)}
            >
              {guestExpanded ? "Hide guest checkout" : "Continue as guest"}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn-primary px-4 py-2 text-sm"
            disabled={
              checkoutMutation.isPending ||
              (useMaxPoints &&
                (!rewardsPreviewQuery.data?.eligible || rewardsPreviewQuery.isLoading || rewardsPreviewQuery.isError))
            }
            onClick={() => checkoutMutation.mutate()}
          >
            {checkoutMutation.isPending ? "Opening secure checkout…" : "Continue to secure checkout"}
          </button>
        )}
      </div>

      {!sessionUser && guestExpanded ? (
        <div className="surface-card space-y-3 rounded-control border border-black/10 px-4 py-4 text-sm">
          <p className="text-muted">
            You will finish payment on Stripe. Add an optional email for the receipt; check the box if you want a text with
            your access link (phone is collected on Stripe when needed).
          </p>
          <input
            className="input w-full bg-white"
            placeholder="Email (optional)"
            type="email"
            autoComplete="email"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
          />
          <label className="flex cursor-pointer items-center gap-2 text-muted">
            <input type="checkbox" checked={smsOptIn} onChange={(e) => setSmsOptIn(e.target.checked)} />
            Text me the access link (optional)
          </label>
          <button
            type="button"
            className="btn-primary px-4 py-2 text-sm"
            disabled={guestCheckoutMutation.isPending}
            onClick={() => guestCheckoutMutation.mutate()}
          >
            {guestCheckoutMutation.isPending ? "Opening secure checkout…" : "Continue to secure checkout"}
          </button>
        </div>
      ) : null}

      {sessionUser ? (
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={smsOptIn} onChange={(e) => setSmsOptIn(e.target.checked)} />
          Also text me the access link (phone collected on Stripe if checked)
        </label>
      ) : null}

      {sessionUser ? (
        <div className="rounded-control border border-black/10 bg-surface/60 px-3 py-3 text-sm">
          <label className="flex cursor-pointer items-center gap-2 font-medium text-text">
            <input
              type="checkbox"
              checked={useMaxPoints}
              onChange={(e) => setUseMaxPoints(e.target.checked)}
            />
            Apply reward points (max eligible)
          </label>
          {useMaxPoints ? (
            rewardsPreviewQuery.isLoading ? (
              <p className="mt-2 text-xs text-muted">Checking points…</p>
            ) : rewardsPreviewQuery.data ? (
              <div className="mt-2 space-y-1 text-xs text-muted">
                <p>
                  Balance: {rewardsPreviewQuery.data.balanceMinor.toLocaleString()} pts
                  {rewardsPreviewQuery.data.eligible
                    ? ` · −${formatMinorCurrency(rewardsPreviewQuery.data.discountMinor, currency)}`
                    : null}
                </p>
                {!rewardsPreviewQuery.data.eligible && rewardsPreviewQuery.data.denyReasons?.length ? (
                  <p className="text-amber-700 dark:text-amber-400" role="status">
                    Points cannot be applied ({rewardsPreviewQuery.data.denyReasons.join(", ")}).
                  </p>
                ) : null}
              </div>
            ) : null
          ) : null}
        </div>
      ) : null}

      {(checkoutMutation.isError || guestCheckoutMutation.isError) && (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {(checkoutMutation.error || guestCheckoutMutation.error)?.message ?? "Checkout could not be started. Try again."}
        </p>
      )}

      <p className="rounded-control border border-black/10 bg-surface px-3 py-2 text-xs text-muted">
        By continuing you agree to our{" "}
        <Link href="/terms" className="text-sky-700 underline-offset-2 hover:underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="text-sky-700 underline-offset-2 hover:underline">
          Privacy
        </Link>
        .
      </p>
    </div>
  );
}
