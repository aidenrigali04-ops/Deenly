"use client";

import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchSessionMe } from "@/lib/auth";
import {
  createAffiliateCode,
  createConnectAccount,
  createOnboardingLink,
  createProduct,
  createTier,
  fetchConnectStatus,
  fetchEarnings,
  fetchMyAffiliateCodes,
  fetchMyAffiliatePerformance,
  fetchMyProducts,
  fetchMyTiers,
  fetchCreatorRankings,
  formatMinorCurrency,
  publishProduct,
  publishTier
} from "@/lib/monetization";
import { ErrorState, LoadingState } from "@/components/states";

export default function AccountCreatorPage() {
  const sessionQuery = useQuery({
    queryKey: ["creator-hub-session-me"],
    queryFn: () => fetchSessionMe()
  });
  const connectStatusQuery = useQuery({
    queryKey: ["account-monetization-connect"],
    queryFn: () => fetchConnectStatus(),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const myProductsQuery = useQuery({
    queryKey: ["account-monetization-products"],
    queryFn: () => fetchMyProducts(),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const myTiersQuery = useQuery({
    queryKey: ["account-monetization-tiers"],
    queryFn: () => fetchMyTiers(),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const earningsQuery = useQuery({
    queryKey: ["account-monetization-earnings"],
    queryFn: () => fetchEarnings(),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const affiliateCodesQuery = useQuery({
    queryKey: ["account-monetization-affiliate-codes"],
    queryFn: () => fetchMyAffiliateCodes(),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const affiliatePerfQuery = useQuery({
    queryKey: ["account-monetization-affiliate-performance"],
    queryFn: () => fetchMyAffiliatePerformance(),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const rankingsQuery = useQuery({
    queryKey: ["public-creator-rankings"],
    queryFn: () => fetchCreatorRankings(10),
    enabled: Boolean(sessionQuery.data?.id)
  });

  const connectAccountMutation = useMutation({
    mutationFn: () => createConnectAccount(),
    onSuccess: async () => {
      await connectStatusQuery.refetch();
    }
  });
  const onboardingMutation = useMutation({
    mutationFn: () => createOnboardingLink(),
    onSuccess: (result) => {
      if (typeof window !== "undefined" && result?.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
      }
    }
  });
  const createProductMutation = useMutation({
    mutationFn: () =>
      createProduct({
        title: "New digital product",
        description: "Creator digital download",
        priceMinor: 1500,
        currency: "usd",
        deliveryMediaKey: "uploads/products/digital-file.pdf"
      }),
    onSuccess: async () => {
      await myProductsQuery.refetch();
    }
  });
  const createTierMutation = useMutation({
    mutationFn: () =>
      createTier({
        title: "Supporter Tier",
        description: "Monthly supporter tier",
        monthlyPriceMinor: 500,
        currency: "usd"
      }),
    onSuccess: async () => {
      await myTiersQuery.refetch();
    }
  });
  const createAffiliateCodeMutation = useMutation({
    mutationFn: () => createAffiliateCode(),
    onSuccess: async () => {
      await affiliateCodesQuery.refetch();
    }
  });

  if (sessionQuery.isLoading) {
    return <LoadingState label="Loading..." />;
  }
  if (sessionQuery.error || !sessionQuery.data) {
    return <ErrorState message="Sign in to open Creator hub." />;
  }

  return (
    <div className="container-shell py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <p className="text-sm text-muted">
          <Link href="/account" className="text-sky-600 hover:underline">
            Back to profile
          </Link>{" "}
          ·{" "}
          <Link href="/account/settings" className="text-sky-600 hover:underline">
            Account settings
          </Link>
        </p>

        <header>
          <h1 className="section-title text-2xl">Creator hub</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Stripe Connect, products, subscription tiers, and affiliate tools. This space is separate from your public
            profile so you can focus when you are ready to earn on Deenly.
          </p>
        </header>

        <article className="surface-card space-y-8 px-6 py-6">
          <section>
            <h2 className="section-title text-sm">Stripe & balance</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-control border border-black/10 bg-surface px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-muted">Stripe Connect</p>
                <p className="mt-1 text-sm text-text">
                  {connectStatusQuery.data?.connected ? "Connected" : "Not connected"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    className="btn-secondary px-3 py-1.5 text-xs"
                    type="button"
                    onClick={() => connectAccountMutation.mutate()}
                    disabled={connectAccountMutation.isPending}
                  >
                    {connectAccountMutation.isPending ? "Creating..." : "Create account"}
                  </button>
                  <button
                    className="btn-secondary px-3 py-1.5 text-xs"
                    type="button"
                    onClick={() => onboardingMutation.mutate()}
                    disabled={onboardingMutation.isPending}
                  >
                    {onboardingMutation.isPending ? "Opening..." : "Onboarding"}
                  </button>
                </div>
              </div>
              <div className="rounded-control border border-black/10 bg-surface px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-muted">Earnings balance</p>
                <p className="mt-1 text-sm text-text">
                  {formatMinorCurrency(earningsQuery.data?.totals?.balance_minor || 0, "usd")}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Affiliate commissions:{" "}
                  {formatMinorCurrency(affiliatePerfQuery.data?.summary?.commission_earned_minor || 0, "usd")}
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="section-title text-sm">Create</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <button className="btn-secondary" type="button" onClick={() => createProductMutation.mutate()}>
                {createProductMutation.isPending ? "Creating..." : "Create product"}
              </button>
              <button className="btn-secondary" type="button" onClick={() => createTierMutation.mutate()}>
                {createTierMutation.isPending ? "Creating..." : "Create tier"}
              </button>
              <button className="btn-secondary" type="button" onClick={() => createAffiliateCodeMutation.mutate()}>
                {createAffiliateCodeMutation.isPending ? "Creating..." : "Create affiliate code"}
              </button>
            </div>
          </section>

          <section>
            <h2 className="section-title text-sm">Catalog</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-control border border-black/10 bg-surface px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-muted">Products</p>
                <div className="mt-2 space-y-2">
                  {(myProductsQuery.data?.items || []).slice(0, 4).map((product) => (
                    <div key={product.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">
                        {product.title} - {formatMinorCurrency(product.price_minor, product.currency)}
                      </span>
                      <button
                        className="btn-secondary px-2 py-1"
                        type="button"
                        onClick={async () => {
                          await publishProduct(product.id);
                          await myProductsQuery.refetch();
                        }}
                      >
                        Publish
                      </button>
                    </div>
                  ))}
                  {myProductsQuery.data?.items?.length ? null : (
                    <p className="text-xs text-muted">No products yet.</p>
                  )}
                </div>
              </div>
              <div className="rounded-control border border-black/10 bg-surface px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-muted">Subscription tiers</p>
                <div className="mt-2 space-y-2">
                  {(myTiersQuery.data?.items || []).slice(0, 4).map((tier) => (
                    <div key={tier.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">
                        {tier.title} - {formatMinorCurrency(tier.monthly_price_minor, tier.currency)}/mo
                      </span>
                      <button
                        className="btn-secondary px-2 py-1"
                        type="button"
                        onClick={async () => {
                          await publishTier(tier.id);
                          await myTiersQuery.refetch();
                        }}
                      >
                        Publish
                      </button>
                    </div>
                  ))}
                  {myTiersQuery.data?.items?.length ? null : (
                    <p className="text-xs text-muted">No tiers yet.</p>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="section-title text-sm">Affiliate codes</h2>
            <div className="mt-3 rounded-control border border-black/10 bg-surface px-3 py-2">
              <div className="mt-2 flex flex-wrap gap-2">
                {(affiliateCodesQuery.data?.items || []).map((code) => (
                  <span key={code.id} className="rounded-pill border border-black/10 px-2 py-1 text-xs">
                    {code.code} ({code.uses_count})
                  </span>
                ))}
                {affiliateCodesQuery.data?.items?.length ? null : (
                  <p className="text-xs text-muted">No affiliate codes yet.</p>
                )}
              </div>
            </div>
          </section>

          <section>
            <h2 className="section-title text-sm">Creator rankings</h2>
            <div className="mt-3 rounded-control border border-black/10 bg-surface px-3 py-2">
              <div className="mt-2 space-y-1">
                {(rankingsQuery.data?.items || []).slice(0, 5).map((row: any, index: number) => (
                  <p key={`${row.creator_user_id}-${index}`} className="text-xs text-muted">
                    {index + 1}. {row.creator_display_name} - {formatMinorCurrency(row.gross_earnings_minor || 0, "usd")}
                  </p>
                ))}
                {rankingsQuery.data?.items?.length ? null : (
                  <p className="text-xs text-muted">No ranking data yet.</p>
                )}
              </div>
            </div>
          </section>
        </article>
      </div>
    </div>
  );
}
