"use client";

import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { createGuestProductCheckout, createProductCheckout, formatMinorCurrency } from "@/lib/monetization";
import { useSessionStore } from "@/store/session-store";
import { CheckoutExplainer } from "./product-checkout-panel";

type Props = {
  open: boolean;
  onClose: () => void;
  productId: number;
  title: string;
  priceMinor: number;
  currency: string;
};

export function PaymentHandoffDialog({ open, onClose, productId, title, priceMinor, currency }: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const sessionUser = useSessionStore((state) => state.user);
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [guestEmail, setGuestEmail] = useState("");
  const [guestExpanded, setGuestExpanded] = useState(false);
  const loginNext = encodeURIComponent(`/products/${productId}`);
  const priceLabel = formatMinorCurrency(priceMinor, currency);

  const checkoutMutation = useMutation({
    mutationFn: () => createProductCheckout(productId, { smsOptIn }),
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

  const busy = checkoutMutation.isPending || guestCheckoutMutation.isPending;

  useEffect(() => {
    if (!open) {
      setGuestExpanded(false);
      setGuestEmail("");
      setSmsOptIn(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, busy, onClose]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => panelRef.current?.querySelector<HTMLElement>("button, a")?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) return null;

  const err = checkoutMutation.error || guestCheckoutMutation.error;
  const trimmedGuest = guestEmail.trim();
  const guestEmailInvalid =
    !sessionUser && guestExpanded && trimmedGuest.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedGuest);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
        aria-label="Close"
        onClick={() => !busy && onClose()}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[81] w-full max-w-md rounded-t-2xl border border-black/10 bg-background shadow-lg sm:rounded-2xl"
      >
        <div className="max-h-[min(90vh,640px)] overflow-y-auto px-4 pb-6 pt-5 sm:px-6">
          <h2 id={titleId} className="text-lg font-semibold text-text">
            Secure checkout
          </h2>
          <p className="mt-1 truncate text-sm font-medium text-text" title={title}>
            {title}
          </p>
          <p className="mt-0.5 text-sm text-muted">{priceLabel}</p>

          <div className="mt-4 rounded-control border border-black/10 bg-surface/60 px-3 py-3">
            <CheckoutExplainer variant="compact" />
          </div>

          {sessionUser ? (
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={smsOptIn} onChange={(e) => setSmsOptIn(e.target.checked)} />
              Text me the access link (optional)
            </label>
          ) : (
            <div className="mt-4 space-y-2">
              <Link
                href={`/auth/login?next=${loginNext}`}
                className="btn-primary flex w-full justify-center px-4 py-2.5 text-sm"
              >
                Log in to buy
              </Link>
              <button
                type="button"
                className="btn-secondary w-full px-4 py-2 text-sm"
                onClick={() => setGuestExpanded((v) => !v)}
              >
                {guestExpanded ? "Hide guest checkout" : "Continue as guest"}
              </button>
              {guestExpanded ? (
                <div className="space-y-2 rounded-control border border-black/10 bg-surface px-3 py-3 text-sm">
                  <input
                    className="input w-full bg-white text-sm"
                    placeholder="Email (optional)"
                    type="email"
                    autoComplete="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                  />
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                    <input type="checkbox" checked={smsOptIn} onChange={(e) => setSmsOptIn(e.target.checked)} />
                    Text me the access link (optional)
                  </label>
                </div>
              ) : null}
            </div>
          )}

          {err ? (
            <p className="mt-3 text-xs text-red-600 dark:text-red-400" role="alert">
              {err instanceof Error ? err.message : "Checkout could not be started."}
            </p>
          ) : null}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn-secondary px-4 py-2 text-sm" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            {sessionUser || guestExpanded ? (
              <button
                type="button"
                className="btn-primary px-4 py-2 text-sm"
                disabled={busy || guestEmailInvalid}
                onClick={() => {
                  if (sessionUser) checkoutMutation.mutate();
                  else guestCheckoutMutation.mutate();
                }}
              >
                {busy ? "Opening…" : "Continue to Stripe"}
              </button>
            ) : null}
          </div>

          <p className="mt-4 text-center text-[11px] text-muted">
            <Link href={`/products/${productId}`} className="text-sky-700 underline-offset-2 hover:underline">
              Open full product page
            </Link>{" "}
            for details.
          </p>
        </div>
      </div>
    </div>
  );
}
