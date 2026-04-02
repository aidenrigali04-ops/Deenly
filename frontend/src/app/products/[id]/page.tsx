"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { resolveMediaUrl } from "@/lib/media-url";
import {
  createGuestProductCheckout,
  createProductCheckout,
  fetchPublicProduct,
  formatMinorCurrency,
  type PublicCatalogProduct
} from "@/lib/monetization";
import { useSessionStore } from "@/store/session-store";

function productTypeLabel(t: PublicCatalogProduct["product_type"]) {
  if (t === "digital") return "Digital";
  if (t === "service") return "Service";
  return "Subscription";
}

export default function PublicProductPage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const productId = Number(params.id);
  const sessionUser = useSessionStore((state) => state.user);
  const loginNext = encodeURIComponent(pathname || `/products/${productId}`);

  const productQuery = useQuery({
    queryKey: ["public-product", productId],
    queryFn: () => fetchPublicProduct(productId),
    enabled: Number.isFinite(productId) && productId > 0
  });

  const [smsOptIn, setSmsOptIn] = useState(false);
  const [guestEmail, setGuestEmail] = useState("");
  const [guestExpanded, setGuestExpanded] = useState(false);

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

  if (!Number.isFinite(productId) || productId <= 0) {
    return <ErrorState message="Invalid product." />;
  }
  if (productQuery.isLoading) {
    return <LoadingState label="Loading product…" />;
  }
  if (productQuery.error) {
    return <ErrorState message={(productQuery.error as Error).message} onRetry={productQuery.refetch} />;
  }
  if (!productQuery.data) {
    return <EmptyState title="Product not found" />;
  }

  const p = productQuery.data;
  const avatarUrl = resolveMediaUrl(p.creator_avatar_url);
  const creatorName = p.creator_display_name?.trim() || p.creator_username || "Creator";
  const isOwner = sessionUser?.id === p.creator_user_id;

  const scrollToFullOffer = () => {
    if (typeof document === "undefined") return;
    document.getElementById("offer-details")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="page-stack mx-auto w-full max-w-3xl">
      <header className="page-header">
        <p className="text-sm text-muted">
          <Link href={`/users/${p.creator_user_id}`} className="text-sky-600 underline-offset-2 hover:underline">
            ← Back to {creatorName}
          </Link>
        </p>
        <h1 className="page-header-title mt-4">{p.title}</h1>
        <p className="page-header-subtitle mt-2">
          {formatMinorCurrency(p.price_minor, p.currency)} · {productTypeLabel(p.product_type)}
          {p.business_category ? ` · ${p.business_category.replace(/_/g, " ")}` : ""}
        </p>
      </header>

      <article className="surface-card section-stack px-6 py-6">
        <div className="flex flex-wrap items-center gap-3 border-b border-black/10 pb-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-black/10 bg-surface text-sm font-semibold">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              creatorName.slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text">{creatorName}</p>
            {p.creator_username ? (
              <p className="text-xs text-muted">@{p.creator_username}</p>
            ) : null}
            <Link href={`/users/${p.creator_user_id}`} className="text-xs text-sky-600 hover:underline">
              View profile
            </Link>
          </div>
        </div>

        {isOwner ? (
          <div className="mt-6">
            <Link href="/account/creator?tab=products" className="btn-secondary inline-flex px-4 py-2 text-sm">
              Manage in Creator hub
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-6 flex flex-wrap gap-2">
              <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={scrollToFullOffer}>
                View offer
              </button>
              {!sessionUser ? (
                <>
                  <Link href={`/auth/login?next=${loginNext}`} className="btn-primary inline-flex px-4 py-2 text-sm">
                    Log in to buy
                  </Link>
                  <button
                    type="button"
                    className="btn-secondary px-4 py-2 text-sm"
                    onClick={() => setGuestExpanded((v) => !v)}
                  >
                    {guestExpanded ? "Hide guest checkout" : "Buy now as guest"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-primary px-4 py-2 text-sm"
                  disabled={checkoutMutation.isPending}
                  onClick={() => checkoutMutation.mutate()}
                >
                  {checkoutMutation.isPending ? "Opening…" : "Buy now"}
                </button>
              )}
            </div>
            {!sessionUser && guestExpanded ? (
              <div className="surface-card mt-4 space-y-3 rounded-control border border-black/10 px-4 py-4 text-sm">
                <p className="text-muted">
                  Secure Stripe checkout. Optional email below; check the box if you want a text with your access link
                  (phone collected on Stripe if needed).
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
                  {guestCheckoutMutation.isPending ? "Opening Stripe…" : "Buy now"}
                </button>
              </div>
            ) : null}
            {sessionUser ? (
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-muted">
                <input type="checkbox" checked={smsOptIn} onChange={(e) => setSmsOptIn(e.target.checked)} />
                Also text me the access link (phone collected on Stripe if checked)
              </label>
            ) : null}
          </>
        )}

        <p className="mt-6 rounded-control border border-black/10 bg-surface px-3 py-2 text-xs text-muted">
          Secure checkout with Stripe. You will complete payment on Stripe, then return to Deenly.
        </p>

        <div id="offer-details" className="scroll-mt-24 space-y-6 border-t border-black/10 pt-8">
          <section>
            <h2 className="section-title text-sm">Full offer</h2>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">About this offer</h3>
            {p.description ? (
              <p className="mt-2 whitespace-pre-line text-sm text-text/90">{p.description}</p>
            ) : (
              <p className="mt-2 text-sm text-muted">No description provided.</p>
            )}
          </section>

          {p.service_details ? (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">What you get</h3>
              <p className="mt-2 whitespace-pre-line text-sm text-text/90">{p.service_details}</p>
            </section>
          ) : null}

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Delivery</h3>
            <p className="mt-2 text-sm text-muted">
              {p.delivery_method?.trim() || "Details are confirmed after checkout where applicable."}
            </p>
          </section>

          {p.website_url ? (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">More info</h3>
              <a
                href={p.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm text-sky-600 hover:underline"
              >
                Visit website
              </a>
            </section>
          ) : null}
        </div>
      </article>
    </div>
  );
}
