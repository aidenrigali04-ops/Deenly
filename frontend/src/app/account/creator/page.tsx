"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
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
  const [newProductTitle, setNewProductTitle] = useState("");
  const [newProductDescription, setNewProductDescription] = useState("");
  const [newProductPriceMinor, setNewProductPriceMinor] = useState("");
  const [newProductType, setNewProductType] = useState<"digital" | "service" | "subscription">("digital");
  const [newProductServiceDetails, setNewProductServiceDetails] = useState("");
  const [newProductDeliveryMethod, setNewProductDeliveryMethod] = useState("");
  const [newProductWebsiteUrl, setNewProductWebsiteUrl] = useState("");
  const [newProductDeliveryFile, setNewProductDeliveryFile] = useState<File | null>(null);
  const [newProductFormError, setNewProductFormError] = useState("");

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
    const priceMinor = Number.parseInt(newProductPriceMinor.replace(/\D/g, ""), 10);
    if (!Number.isFinite(priceMinor) || priceMinor <= 0) {
      setNewProductFormError("Enter price in minor units (e.g. 499 for $4.99).");
      return;
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
        websiteUrl: newProductWebsiteUrl.trim() || undefined
      });

      setNewProductTitle("");
      setNewProductDescription("");
      setNewProductPriceMinor("");
      setNewProductType("digital");
      setNewProductServiceDetails("");
      setNewProductDeliveryMethod("");
      setNewProductWebsiteUrl("");
      setNewProductDeliveryFile(null);
    } catch (err) {
      setNewProductFormError((err as Error).message || "Could not create product.");
    }
  };
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
                <input
                  className="input bg-white"
                  placeholder="e.g. 499 for $4.99"
                  value={newProductPriceMinor}
                  onChange={(e) => setNewProductPriceMinor(e.target.value)}
                  inputMode="numeric"
                  aria-label="Price in minor units"
                />
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
            <h2 className="section-title text-sm">Shortcuts</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
  );
}
