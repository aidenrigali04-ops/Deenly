"use client";

import Link from "next/link";
import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ApiError, apiRequest } from "@/lib/api";
import { fetchSessionMe } from "@/lib/auth";
import { CreatorHubTabBar } from "@/components/creator-hub/creator-hub-tab-bar";
import {
  parseCreatorHubTab,
  type CreatorHubTab
} from "@/components/creator-hub/creator-hub-constants";
import { OnboardingChecklist } from "@/components/creator-hub/onboarding-checklist";
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
  publishTier,
  updateProduct,
  type BoostTier,
  type ConnectStatus
} from "@/lib/monetization";
import { ErrorState, LoadingState } from "@/components/states";

type UploadSignatureResponse = {
  uploadUrl: string;
  headers: Record<string, string>;
  key: string;
};

function deriveMediaType(mimeType: string): "image" | "video" | null {
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType.startsWith("video/")) {
    return "video";
  }
  return null;
}

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
  const tab = useMemo(() => parseCreatorHubTab(searchParams.get("tab")), [searchParams]);

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

  const sessionQuery = useQuery({
    queryKey: ["creator-hub-session-me"],
    queryFn: () => fetchSessionMe()
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
          "Stripe account linked. Next, click “Continue setup in Stripe” (Payouts tab or checklist) to add bank and business details—you will leave Deenly briefly and return when done."
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
            : "Could not open Stripe setup.";
      setStripeNotice({ variant: "error", message });
    }
  });
  const [newProductTitle, setNewProductTitle] = useState("");
  const [newProductDescription, setNewProductDescription] = useState("");
  const [newProductPriceUsd, setNewProductPriceUsd] = useState("");
  const [showPriceMinorAdvanced, setShowPriceMinorAdvanced] = useState(false);
  const [newProductPriceMinorRaw, setNewProductPriceMinorRaw] = useState("");
  const [newProductType, setNewProductType] = useState<"digital" | "service" | "subscription">("digital");
  const [newProductAudienceTarget, setNewProductAudienceTarget] = useState<"b2b" | "b2c" | "both">("both");
  const [newProductBusinessCategory, setNewProductBusinessCategory] = useState("");
  const [newProductServiceDetails, setNewProductServiceDetails] = useState("");
  const [newProductDeliveryMethod, setNewProductDeliveryMethod] = useState("");
  const [newProductWebsiteUrl, setNewProductWebsiteUrl] = useState("");
  const [newProductDeliveryFile, setNewProductDeliveryFile] = useState<File | null>(null);
  const [newProductBoostTier, setNewProductBoostTier] = useState<BoostTier>("standard");
  const [newProductFormError, setNewProductFormError] = useState("");
  const [newTierMonthlyUsd, setNewTierMonthlyUsd] = useState("5.00");

  const createProductMutation = useMutation({
    mutationFn: (input: {
      title: string;
      description?: string;
      priceMinor: number;
      productType: "digital" | "service" | "subscription";
      deliveryMediaKey?: string;
      serviceDetails?: string;
      deliveryMethod?: string;
      websiteUrl?: string;
      audienceTarget?: "b2b" | "b2c" | "both";
      businessCategory?: string;
      boostTier?: BoostTier;
    }) => createProduct({ ...input, currency: "usd" }),
    onSuccess: async () => {
      await myProductsQuery.refetch();
    }
  });

  const onCreateProductSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNewProductFormError("");
    const title = newProductTitle.trim();
    if (title.length < 3) {
      setNewProductFormError("Title must be at least 3 characters.");
      return;
    }
    let priceMinor: number | null = null;
    if (showPriceMinorAdvanced) {
      const raw = newProductPriceMinorRaw.replace(/\D/g, "");
      const parsed = raw ? Number.parseInt(raw, 10) : NaN;
      priceMinor = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      if (priceMinor === null) {
        setNewProductFormError("Enter a valid price in minor units (cents), greater than zero.");
        return;
      }
    } else {
      priceMinor = parseUsdToMinor(newProductPriceUsd);
      if (priceMinor === null) {
        setNewProductFormError("Enter a valid USD amount (e.g. 4.99).");
        return;
      }
    }

    try {
      let deliveryMediaKey: string | undefined;
      if (newProductType === "digital") {
        const file = newProductDeliveryFile;
        if (!file || file.size <= 0) {
          setNewProductFormError("Upload a delivery file for digital products (image or video).");
          return;
        }
        const mimeType = file.type || "application/octet-stream";
        const mediaType = deriveMediaType(mimeType);
        if (!mediaType) {
          setNewProductFormError("Delivery file must be an image or video.");
          return;
        }
        const signature = await apiRequest<UploadSignatureResponse>("/media/upload-signature", {
          method: "POST",
          auth: true,
          body: {
            mediaType,
            mimeType,
            originalFilename: file.name,
            fileSizeBytes: file.size
          }
        });
        const uploaded = await fetch(signature.uploadUrl, {
          method: "PUT",
          headers: signature.headers,
          body: file
        });
        if (!uploaded.ok) {
          throw new Error("Unable to upload delivery file.");
        }
        deliveryMediaKey = signature.key;
      }

      await createProductMutation.mutateAsync({
        title,
        description: newProductDescription.trim() || undefined,
        priceMinor,
        productType: newProductType,
        deliveryMediaKey,
        serviceDetails: newProductServiceDetails.trim() || undefined,
        deliveryMethod: newProductDeliveryMethod.trim() || undefined,
        websiteUrl: newProductWebsiteUrl.trim() || undefined,
        audienceTarget: newProductAudienceTarget,
        businessCategory: newProductBusinessCategory.trim() || undefined,
        boostTier: newProductBoostTier
      });

      setNewProductTitle("");
      setNewProductDescription("");
      setNewProductPriceUsd("");
      setNewProductPriceMinorRaw("");
      setShowPriceMinorAdvanced(false);
      setNewProductType("digital");
      setNewProductAudienceTarget("both");
      setNewProductBusinessCategory("");
      setNewProductServiceDetails("");
      setNewProductDeliveryMethod("");
      setNewProductWebsiteUrl("");
      setNewProductDeliveryFile(null);
      setNewProductBoostTier("standard");
    } catch (err) {
      setNewProductFormError((err as Error).message || "Could not create product.");
    }
  };

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

  const payoutsPanel = (c: ConnectStatus | undefined) => {
    const stripeSetupComplete = Boolean(c?.detailsSubmitted) && Boolean(c?.chargesEnabled);
    return (
    <div className="space-y-6">
      <section>
        <h2 className="section-title text-sm">Stripe Connect</h2>
        {!connectLoading && c && !stripeSetupComplete ? (
          <div className="mt-3 rounded-control border border-sky-200/80 bg-sky-50/60 px-3 py-3 text-xs text-muted">
            <p className="font-semibold text-text">Steps to connect</p>
            <ol className="mt-2 list-decimal space-y-2 pl-4">
              <li className={!c.connected ? "font-medium text-text" : ""}>
                <span className="text-text">Connect Stripe account</span> — Creates your linked Express account for payouts.
              </li>
              <li className={c.connected && !c.chargesEnabled ? "font-medium text-text" : ""}>
                <span className="text-text">Continue setup in Stripe</span> — Add business details and bank info on
                Stripe&apos;s secure page.
              </li>
              <li>
                <span className="text-text">Return to Deenly</span> — Status below updates when Stripe enables charges and
                payouts.
              </li>
            </ol>
          </div>
        ) : null}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-control border border-black/10 bg-surface px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-muted">Account</p>
            <p className="mt-1 text-sm text-text">{c?.connected ? "Connected" : "Not connected"}</p>
            <dl className="mt-2 space-y-1 text-xs text-muted">
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
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className="btn-primary px-3 py-1.5 text-xs"
                type="button"
                onClick={() => connectAccountMutation.mutate()}
                disabled={connectAccountMutation.isPending}
              >
                {connectAccountMutation.isPending ? "Connecting…" : "Connect Stripe account"}
              </button>
              <button
                className="btn-secondary px-3 py-1.5 text-xs"
                type="button"
                onClick={() => onboardingMutation.mutate()}
                disabled={onboardingMutation.isPending || !c?.connected}
                title={!c?.connected ? "Connect your Stripe account first" : undefined}
              >
                {onboardingMutation.isPending ? "Opening…" : "Continue setup in Stripe"}
              </button>
              {c?.dashboardUrl ? (
                <a
                  href={c.dashboardUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary inline-flex items-center px-3 py-1.5 text-xs"
                >
                  Open Stripe dashboard
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
          </Link>
          .
        </p>
        <form className="mt-4 space-y-4" onSubmit={onCreateProductSubmit}>
          <div className="space-y-3 border-t border-black/10 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Pricing and type</p>
            {!showPriceMinorAdvanced ? (
              <div className="space-y-1">
                <label className="text-xs text-muted" htmlFor="product-price-usd">
                  Price (USD)
                </label>
                <input
                  id="product-price-usd"
                  className="input bg-white"
                  placeholder="e.g. 4.99"
                  value={newProductPriceUsd}
                  onChange={(e) => setNewProductPriceUsd(e.target.value)}
                  inputMode="decimal"
                  aria-label="Price in US dollars"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs text-muted" htmlFor="product-price-minor">
                  Price in cents (minor units)
                </label>
                <input
                  id="product-price-minor"
                  className="input bg-white"
                  placeholder="e.g. 499 for $4.99"
                  value={newProductPriceMinorRaw}
                  onChange={(e) => setNewProductPriceMinorRaw(e.target.value)}
                  inputMode="numeric"
                  aria-label="Price in minor units"
                />
              </div>
            )}
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={showPriceMinorAdvanced}
                onChange={(e) => setShowPriceMinorAdvanced(e.target.checked)}
              />
              Advanced: enter minor units (cents) directly
            </label>
            <select
              className="input bg-white"
              value={newProductType}
              onChange={(e) =>
                setNewProductType(e.target.value as "digital" | "service" | "subscription")
              }
              aria-label="Product type"
            >
              <option value="digital">Digital</option>
              <option value="service">Service</option>
              <option value="subscription">Subscription</option>
            </select>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Marketplace boost fee</p>
              <p className="text-xs text-muted">
                Higher platform % can increase visibility in marketplace feeds. This is separate from Stripe processing.
              </p>
              <select
                className="input bg-white"
                value={newProductBoostTier}
                onChange={(e) => setNewProductBoostTier(e.target.value as BoostTier)}
                aria-label="Boost tier"
              >
                <option value="standard">Standard (3.5%)</option>
                <option value="boosted">Boosted (20%)</option>
                <option value="aggressive">Aggressive (35%)</option>
              </select>
            </div>
          </div>

          <div className="space-y-3 border-t border-black/10 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Who it is for</p>
            <select
              className="input bg-white"
              value={newProductAudienceTarget}
              onChange={(e) =>
                setNewProductAudienceTarget(e.target.value as "b2b" | "b2c" | "both")
              }
              aria-label="Product audience"
            >
              <option value="b2c">Consumers (B2C)</option>
              <option value="b2b">Businesses (B2B)</option>
              <option value="both">Both</option>
            </select>
          </div>

          <div className="space-y-3 border-t border-black/10 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Category</p>
            <select
              className="input bg-white"
              value={newProductBusinessCategory}
              onChange={(e) => setNewProductBusinessCategory(e.target.value)}
              aria-label="Business category"
            >
              <option value="">Select category</option>
              <option value="tools_growth">Tools & Growth</option>
              <option value="professional_services">Professional Services</option>
              <option value="digital_products">Digital Products</option>
              <option value="education_coaching">Education & Coaching</option>
              <option value="lifestyle_inspiration">Lifestyle & Inspiration</option>
            </select>
          </div>

          <div className="space-y-3 border-t border-black/10 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Offer copy</p>
            <input
              className="input bg-white"
              placeholder="Product title"
              value={newProductTitle}
              onChange={(e) => setNewProductTitle(e.target.value)}
              maxLength={180}
              aria-label="Product title"
            />
            <textarea
              className="input min-h-24 resize-y bg-white"
              placeholder="Product or offer details"
              value={newProductDescription}
              onChange={(e) => setNewProductDescription(e.target.value)}
              aria-label="Product description"
            />
          </div>

          <div className="space-y-3 border-t border-black/10 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Delivery</p>
            {newProductType === "digital" ? (
              <input
                type="file"
                accept="image/*,video/*"
                className="input cursor-pointer bg-white"
                onChange={(e) => setNewProductDeliveryFile(e.target.files?.[0] ?? null)}
                aria-label="Digital delivery file"
              />
            ) : (
              <textarea
                className="input min-h-24 resize-y bg-white"
                placeholder="Service details / what buyer receives"
                value={newProductServiceDetails}
                onChange={(e) => setNewProductServiceDetails(e.target.value)}
                aria-label="Service details"
              />
            )}
            <input
              className="input bg-white"
              placeholder="Delivery method (email, DM, booking call, etc.)"
              value={newProductDeliveryMethod}
              onChange={(e) => setNewProductDeliveryMethod(e.target.value)}
              aria-label="Delivery method"
            />
            <input
              className="input bg-white"
              placeholder="Website URL (https://...)"
              value={newProductWebsiteUrl}
              onChange={(e) => setNewProductWebsiteUrl(e.target.value)}
              aria-label="Website URL"
            />
          </div>

          {newProductFormError ? (
            <p className="text-sm text-red-600" role="alert">
              {newProductFormError}
            </p>
          ) : null}
          <button className="btn-primary" type="submit" disabled={createProductMutation.isPending}>
            {createProductMutation.isPending ? "Saving..." : "Save product (draft)"}
          </button>
        </form>
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
                    <option value="standard">Standard (3.5%)</option>
                    <option value="boosted">Boosted (20%)</option>
                    <option value="aggressive">Aggressive (35%)</option>
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
                New tier monthly (USD)
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
              {createTierMutation.isPending ? "Creating..." : "Create tier"}
            </button>
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
        <h2 className="section-title text-sm">Subscription tiers</h2>
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
              <p className="text-xs text-muted">No tiers yet.</p>
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

  const insightsPanel = (
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
        <h1 className="page-header-title mt-4">Creator hub</h1>
        <p className="page-header-subtitle">
          Stripe Connect, products, subscription tiers, and affiliate tools. Separate from your public profile so you can
          focus when you are ready to earn on Deenly.
        </p>
      </header>

      <article className="surface-card section-stack px-6 py-6">
        <CreatorHubTabBar activeTab={tab} onTabChange={setTab} />

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

        {process.env.NODE_ENV === "development" ? (
          <p className="mt-3 text-xs text-muted">
            API base:{" "}
            <code className="rounded bg-black/[0.06] px-1 py-0.5 text-[11px]">
              {process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000/api/v1 (Next default)"}
            </code>
            . Must point at your Node backend (set{" "}
            <code className="rounded bg-black/[0.06] px-1 py-0.5 text-[11px]">NEXT_PUBLIC_API_BASE_URL</code> in{" "}
            <code className="rounded bg-black/[0.06] px-1 py-0.5 text-[11px]">.env.local</code>, e.g.{" "}
            <code className="text-[11px]">http://localhost:8080/api/v1</code>).
          </p>
        ) : null}

        <div role="tabpanel" id={`creator-hub-panel-${tab}`} aria-labelledby={`creator-hub-tab-${tab}`}>
          {tab === "overview" ? (
            <div className="space-y-8">
              <section>
                <h2 className="section-title text-sm">Welcome</h2>
                <p className="mt-2 text-sm text-muted">
                  Use the tabs above to manage payouts, build your catalog, grow subscribers and affiliates, and see how you
                  rank. When you are ready to sell in the feed, open{" "}
                  <Link href="/create" className="text-sky-600 underline-offset-2 hover:underline">
                    Create post
                  </Link>{" "}
                  and attach a published product.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setTab("payouts")}>
                    Payouts
                  </button>
                  <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setTab("products")}>
                    Products
                  </button>
                  <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setTab("grow")}>
                    Grow
                  </button>
                </div>
              </section>
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
            </div>
          ) : null}

          {tab === "payouts" ? payoutsPanel(connect) : null}
          {tab === "products" ? productFormAndCatalog : null}
          {tab === "grow" ? growPanel : null}
          {tab === "insights" ? insightsPanel : null}
        </div>
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
