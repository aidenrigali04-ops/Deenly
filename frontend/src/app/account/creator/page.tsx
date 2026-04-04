"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ApiError, apiRequest } from "@/lib/api";
import { fetchSessionMe } from "@/lib/auth";
import { CreateProductComposer } from "@/components/create-product-composer";
import { CreatorHubTabBar } from "@/components/creator-hub/creator-hub-tab-bar";
import {
  CREATOR_HUB_TABS,
  parseCreatorHubTab,
  type CreatorHubTab
} from "@/components/creator-hub/creator-hub-constants";
import { OnboardingChecklist } from "@/components/creator-hub/onboarding-checklist";
import {
  createAffiliateCode,
  createConnectAccount,
  createOnboardingLink,
  createTier,
  fetchConnectStatus,
  fetchEarnings,
  fetchMyAffiliateCodes,
  fetchMyAffiliatePerformance,
  fetchMyProducts,
  fetchMyTiers,
  fetchCreatorRankings,
  estimateCreatorNet,
  formatMinorCurrency,
  publishProduct,
  publishTier,
  updateProduct,
  type BoostTier,
  type ConnectStatus
} from "@/lib/monetization";
import { ErrorState, LoadingState } from "@/components/states";
import { getPayoutSetupCopy, isPayoutSetupComplete } from "@/lib/payout-setup";

function parseUsdToMinor(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) {
    return null;
  }
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  const minor = Math.round(n * 100);
  return minor > 0 ? minor : null;
}

function triState(v: boolean | undefined, loading: boolean): string {
  if (loading) {
    return "…";
  }
  if (v === true) {
    return "Yes";
  }
  if (v === false) {
    return "No";
  }
  return "—";
}

function AccountCreatorPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = useMemo(() => parseCreatorHubTab(searchParams.get("tab")), [searchParams]);

  const setTab = useCallback(
    (next: CreatorHubTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "overview") {
        params.delete("tab");
      } else {
        params.set("tab", next);
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    if (searchParams.get("tab") !== "insights") {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tab");
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [pathname, router, searchParams]);

  const sessionQuery = useQuery({
    queryKey: ["creator-hub-session-me"],
    queryFn: () => fetchSessionMe()
  });
  const profileQuery = useQuery({
    queryKey: ["creator-hub-profile-me"],
    queryFn: () =>
      apiRequest<{
        profile_kind?: "consumer" | "professional" | "business_interest" | null;
        persona_capabilities?: {
          can_access_creator_hub?: boolean;
          can_manage_memberships?: boolean;
        };
      }>("/users/me", { auth: true }),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const connectStatusQuery = useQuery({
    queryKey: ["account-monetization-connect"],
    queryFn: () => fetchConnectStatus(),
    enabled: Boolean(sessionQuery.data?.id)
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const connect = params.get("connect");
    if (connect !== "return" && connect !== "refresh") {
      return;
    }
    void connectStatusQuery.refetch();
    params.delete("connect");
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", next);
  }, [connectStatusQuery]);
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

  const connectLoading = connectStatusQuery.isLoading || connectStatusQuery.isFetching;
  const connect = connectStatusQuery.data;
  const profileKind = profileQuery.data?.profile_kind || "consumer";
  const canAccessCreatorHub = Boolean(profileQuery.data?.persona_capabilities?.can_access_creator_hub);
  const canManageMemberships = Boolean(profileQuery.data?.persona_capabilities?.can_manage_memberships);
  const visibleTabs = useMemo<CreatorHubTab[]>(
    () => (canManageMemberships ? [...CREATOR_HUB_TABS] : ["overview", "payouts", "products"]),
    [canManageMemberships]
  );
  const activeTab: CreatorHubTab = visibleTabs.includes(requestedTab) ? requestedTab : "overview";

  const [stripeNotice, setStripeNotice] = useState<{
    variant: "success" | "error";
    message: string;
  } | null>(null);

  const connectAccountMutation = useMutation({
    mutationFn: () => createConnectAccount(),
    onMutate: () => {
      setStripeNotice(null);
    },
    onSuccess: async () => {
      await connectStatusQuery.refetch();
      setStripeNotice({
        variant: "success",
        message:
          "Payout profile created. Next: open “Continue secure setup” to add your bank and verify your identity (~5 min). You’ll leave Deenly briefly, then return here."
      });
    },
    onError: (err: unknown) => {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not connect Stripe.";
      setStripeNotice({ variant: "error", message });
    }
  });
  const onboardingMutation = useMutation({
    mutationFn: () => createOnboardingLink(),
    onMutate: () => {
      setStripeNotice(null);
    },
    onSuccess: (result) => {
      if (typeof window !== "undefined" && result?.url) {
        // Use full navigation so the browser does not block a new tab (async onSuccess is not a user gesture).
        window.location.assign(result.url);
      }
    },
    onError: (err: unknown) => {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not open secure payout form.";
      setStripeNotice({ variant: "error", message });
    }
  });
  const [newTierMonthlyUsd, setNewTierMonthlyUsd] = useState("5.00");
  const newTierMinor = parseUsdToMinor(newTierMonthlyUsd);
  const tierPlatformFeeBps =
    connectStatusQuery.data?.feePolicy?.tiers?.find((tier) => tier.key === "standard")?.platformFeeBps || 350;
  const tierPreview = newTierMinor ? estimateCreatorNet(newTierMinor, tierPlatformFeeBps, 700, true) : null;

  const createTierMutation = useMutation({
    mutationFn: (monthlyPriceMinor: number) =>
      createTier({
        title: "Supporter Tier",
        description: "Monthly supporter tier",
        monthlyPriceMinor,
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

  const products = myProductsQuery.data?.items ?? [];
  const productCount = products.length;
  const publishedProductCount = products.filter((p) => p.status === "published").length;
  const productBoostTierOptions =
    connectStatusQuery.data?.feePolicy?.tiers?.filter((tier) => tier.enabled) ||
    [
      { key: "standard" as const, label: "Standard", platformFeeBps: 350 },
      { key: "boosted" as const, label: "Boosted", platformFeeBps: 2000 }
    ];

  const payoutsPanel = (c: ConnectStatus | undefined) => {
    const payoutCopy = getPayoutSetupCopy(c);
    const setupComplete = isPayoutSetupComplete(c);
    return (
    <div className="space-y-6">
      <section>
        <h2 className="section-title text-sm">Get paid</h2>
        <p className="mt-1 max-w-xl text-xs text-muted">
          Secured by Stripe. You only do this once; after that, sales can reach your bank.
        </p>
        {!connectLoading && c && !setupComplete ? (
          <div className="mt-3 rounded-control border border-sky-200/80 bg-sky-50/60 px-3 py-3 text-xs text-muted">
            <p className="font-semibold text-text">{payoutCopy.headline}</p>
            <p className="mt-1">{payoutCopy.subline}</p>
            <ol className="mt-2 list-decimal space-y-2 pl-4">
              <li className={!c.connected ? "font-medium text-text" : ""}>
                <span className="text-text">{payoutCopy.step1Label}</span> — {payoutCopy.step1Body}
              </li>
              <li className={c.connected && !setupComplete ? "font-medium text-text" : ""}>
                <span className="text-text">{payoutCopy.step2Label}</span> — {payoutCopy.step2Body}
              </li>
            </ol>
            <p className="mt-2 text-muted">
              Returned from the form? Give it a few seconds, then refresh if your status looks outdated.
            </p>
          </div>
        ) : null}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-control border border-black/10 bg-surface px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-muted">Payout status</p>
            <p className="mt-1 text-sm font-medium text-text">
              {connectLoading ? "Checking…" : setupComplete ? "Ready to receive payouts" : "Setup not finished yet"}
            </p>
            <details className="mt-2 text-xs text-muted">
              <summary className="cursor-pointer text-text underline-offset-2 hover:underline">
                Technical details
              </summary>
              <dl className="mt-2 space-y-1 border-t border-black/10 pt-2">
                <div className="flex justify-between gap-2">
                  <dt>Profile linked</dt>
                  <dd className="text-text">{triState(c?.connected, connectLoading)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Details submitted</dt>
                  <dd className="text-text">{triState(c?.detailsSubmitted, connectLoading)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Charges enabled</dt>
                  <dd className="text-text">{triState(c?.chargesEnabled, connectLoading)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Payouts enabled</dt>
                  <dd className="text-text">{triState(c?.payoutsEnabled, connectLoading)}</dd>
                </div>
              </dl>
            </details>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className="btn-primary px-3 py-1.5 text-xs"
                type="button"
                onClick={() => connectAccountMutation.mutate()}
                disabled={connectAccountMutation.isPending}
              >
                {connectAccountMutation.isPending ? "Starting…" : "Start getting paid"}
              </button>
              <button
                className="btn-secondary px-3 py-1.5 text-xs"
                type="button"
                onClick={() => onboardingMutation.mutate()}
                disabled={onboardingMutation.isPending || !c?.connected}
                title={!c?.connected ? "Start payout setup first" : undefined}
              >
                {onboardingMutation.isPending ? "Opening…" : "Continue secure setup (~5 min)"}
              </button>
              {c?.dashboardUrl ? (
                <a
                  href={c.dashboardUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary inline-flex items-center px-3 py-1.5 text-xs"
                >
                  Update bank or tax info
                </a>
              ) : null}
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
    </div>
    );
  };

  const productFormAndCatalog = (
    <>
      <section>
        <h2 className="section-title text-sm">Create product</h2>
        <p className="mt-1 text-xs text-muted">
          Save offers here as drafts, publish when ready, then attach them from{" "}
          <Link href="/create" className="text-sky-600 underline-offset-2 hover:underline">
            Create post
          </Link>{" "}
          or{" "}
          <Link href="/create/product" className="text-sky-600 underline-offset-2 hover:underline">
            Create product
          </Link>
          .
        </p>
        <div className="mt-4">
          <CreateProductComposer
            variant="embedded"
            onCreated={async () => {
              await myProductsQuery.refetch();
            }}
          />
        </div>
      </section>

      <section>
        <h2 className="section-title text-sm">Your products</h2>
        <div className="mt-3 rounded-control border border-black/10 bg-surface px-3 py-2">
          <div className="mt-2 space-y-2">
            {products.slice(0, 20).map((product) => {
              const tierSelectValue =
                product.boost_tier ||
                (product.platform_fee_bps === 350
                  ? "standard"
                  : product.platform_fee_bps === 2000
                    ? "boosted"
                    : product.platform_fee_bps === 3500
                      ? "aggressive"
                      : "custom");
              return (
                <div key={product.id} className="space-y-1 border-b border-black/5 pb-2 last:border-0">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">
                      {product.title} - {formatMinorCurrency(product.price_minor, product.currency)} ·{" "}
                      {(product.platform_fee_bps / 100).toFixed(1)}% platform · {product.status}
                    </span>
                    <button
                      className="btn-secondary shrink-0 px-2 py-1"
                      type="button"
                      onClick={async () => {
                        await publishProduct(product.id);
                        await myProductsQuery.refetch();
                      }}
                    >
                      Publish
                    </button>
                  </div>
                  <select
                    className="input bg-white py-1 text-xs"
                    value={tierSelectValue}
                    onChange={async (e) => {
                      const v = e.target.value;
                      if (v === "custom") return;
                      await updateProduct(product.id, { boostTier: v as BoostTier });
                      await myProductsQuery.refetch();
                    }}
                    aria-label={`Boost tier for ${product.title}`}
                  >
                    {productBoostTierOptions.map((tier) => (
                      <option key={tier.key} value={tier.key}>
                        {tier.label} ({(tier.platformFeeBps / 100).toFixed(1)}%)
                      </option>
                    ))}
                    <option value="custom" disabled>
                      Custom ({(product.platform_fee_bps / 100).toFixed(1)}%)
                    </option>
                  </select>
                </div>
              );
            })}
            {products.length ? null : <p className="text-xs text-muted">No products yet.</p>}
          </div>
        </div>
      </section>
    </>
  );

  const growPanel = (
    <div className="space-y-6">
      <section>
        <h2 className="section-title text-sm">Shortcuts</h2>
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[120px] flex-1">
              <label className="text-xs text-muted" htmlFor="tier-monthly-usd">
                New membership plan monthly (USD)
              </label>
              <input
                id="tier-monthly-usd"
                className="input mt-1 bg-white"
                value={newTierMonthlyUsd}
                onChange={(e) => setNewTierMonthlyUsd(e.target.value)}
                inputMode="decimal"
                aria-label="Monthly tier price in USD"
              />
            </div>
            <button
              className="btn-secondary shrink-0"
              type="button"
              onClick={() => {
                const minor = parseUsdToMinor(newTierMonthlyUsd);
                if (minor !== null) {
                  createTierMutation.mutate(minor);
                }
              }}
              disabled={createTierMutation.isPending || parseUsdToMinor(newTierMonthlyUsd) === null}
            >
              {createTierMutation.isPending ? "Creating..." : "Create plan"}
            </button>
          </div>
            <div className="rounded-control border border-black/10 bg-white px-3 py-2 text-xs text-muted">
              <p className="font-semibold text-text">Tier payout preview</p>
              <p>Member pays: {newTierMinor ? formatMinorCurrency(newTierMinor, "usd") : "—"}/mo</p>
              <p>
                Platform fee ({(tierPlatformFeeBps / 100).toFixed(1)}%):{" "}
                {tierPreview ? formatMinorCurrency(tierPreview.platformFeeMinor, "usd") : "—"}
              </p>
              <p>
                Affiliate impact (up to 7.0%):{" "}
                {tierPreview ? formatMinorCurrency(tierPreview.affiliateMinor, "usd") : "—"}
              </p>
              <p className="font-semibold text-text">
                You receive (estimated):{" "}
                {tierPreview ? formatMinorCurrency(tierPreview.creatorNetMinor, "usd") : "Enter valid amount"}
              </p>
            </div>
          <button
            className="btn-secondary"
            type="button"
            onClick={() => createAffiliateCodeMutation.mutate()}
          >
            {createAffiliateCodeMutation.isPending ? "Creating..." : "Create affiliate code"}
          </button>
        </div>
      </section>

      <section>
        <h2 className="section-title text-sm">Membership plans</h2>
        <div className="mt-3 rounded-control border border-black/10 bg-surface px-3 py-2">
          <div className="mt-2 space-y-2">
            {(myTiersQuery.data?.items || []).slice(0, 20).map((tier) => (
              <div key={tier.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">
                  {tier.title} - {formatMinorCurrency(tier.monthly_price_minor, tier.currency)}/mo · {tier.status}
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
              <p className="text-xs text-muted">No plans yet.</p>
            )}
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
    </div>
  );

  if (sessionQuery.isLoading) {
    return <LoadingState label="Loading..." />;
  }
  if (sessionQuery.error || !sessionQuery.data) {
    return <ErrorState message="Sign in to open Creator hub." />;
  }

  return (
    <div className="page-stack mx-auto w-full max-w-4xl">
      <header className="page-header">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <Link
            href="/account"
            className="rounded-sm text-sky-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Back to profile
          </Link>
          <span aria-hidden className="text-black/20">
            ·
          </span>
          <Link
            href="/account/settings"
            className="rounded-sm text-sky-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Account settings
          </Link>
        </p>
        <h1 className="page-header-title mt-4">{profileKind === "business_interest" ? "Creator hub" : "Pro tools"}</h1>
        <p className="page-header-subtitle">
          {profileKind === "business_interest"
            ? "Payouts, catalog, and growth tools — separate from your public profile."
            : "Payouts and product offers for your professional profile."}{" "}
          Attach published products from{" "}
          <Link href="/create" className="text-sky-600 underline-offset-2 hover:underline">
            Create post
          </Link>
          .
        </p>
      </header>

      <article className="surface-card section-stack px-6 py-6">
        {!canAccessCreatorHub ? (
          <div className="rounded-control border border-black/10 bg-surface px-4 py-3 text-sm text-muted">
            Creator tools are available for Professional and Business profiles. Switch mode in{" "}
            <Link href="/account/settings" className="text-sky-600 underline-offset-2 hover:underline">
              Account settings
            </Link>
            .
          </div>
        ) : null}
        {canAccessCreatorHub ? <CreatorHubTabBar activeTab={activeTab} onTabChange={setTab} tabs={visibleTabs} /> : null}

        {stripeNotice ? (
          <div
            className={`mt-4 rounded-control border px-3 py-2 text-sm ${
              stripeNotice.variant === "error"
                ? "border-rose-200 bg-rose-50 text-rose-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-950"
            }`}
            role="alert"
          >
            {stripeNotice.message}
            {stripeNotice.variant === "success" ? (
              <button
                type="button"
                className="ml-2 text-xs underline underline-offset-2"
                onClick={() => setStripeNotice(null)}
              >
                Dismiss
              </button>
            ) : null}
          </div>
        ) : null}

        {canAccessCreatorHub ? (
        <div role="tabpanel" id={`creator-hub-panel-${activeTab}`} aria-labelledby={`creator-hub-tab-${activeTab}`}>
          {activeTab === "overview" ? (
            <div className="space-y-8">
              <OnboardingChecklist
                connect={connect}
                productCount={productCount}
                publishedProductCount={publishedProductCount}
                onNavigateTab={setTab}
                onConnectStripe={() => connectAccountMutation.mutate()}
                onOpenOnboarding={() => onboardingMutation.mutate()}
                connectStripePending={connectAccountMutation.isPending}
                onboardingPending={onboardingMutation.isPending}
              />
              <section>
                <h2 className="section-title text-sm">Creator rankings</h2>
                <p className="mt-1 text-xs text-muted">Public leaderboard by gross earnings on the platform.</p>
                <div className="mt-3 rounded-control border border-black/10 bg-surface px-3 py-2">
                  <div className="mt-2 space-y-1">
                    {(rankingsQuery.data?.items || []).slice(0, 10).map((row, index) => {
                      const r = row as {
                        creator_user_id: number;
                        creator_display_name: string;
                        gross_earnings_minor?: number;
                      };
                      return (
                        <p key={`${r.creator_user_id}-${index}`} className="text-xs text-muted">
                          {index + 1}. {r.creator_display_name} - {formatMinorCurrency(r.gross_earnings_minor || 0, "usd")}
                        </p>
                      );
                    })}
                    {rankingsQuery.data?.items?.length ? null : (
                      <p className="text-xs text-muted">No ranking data yet.</p>
                    )}
                  </div>
                </div>
              </section>
            </div>
          ) : null}

          {activeTab === "payouts" ? payoutsPanel(connect) : null}
          {activeTab === "products" ? productFormAndCatalog : null}
          {activeTab === "grow" && canManageMemberships ? growPanel : null}
        </div>
        ) : null}
      </article>
    </div>
  );
}

export default function AccountCreatorPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading..." />}>
      <AccountCreatorPageInner />
    </Suspense>
  );
}
