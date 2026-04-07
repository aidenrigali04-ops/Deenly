"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiRequest } from "@/lib/api";
import { assistPostText } from "@/lib/ai-assist";
import {
  createProduct,
  publishProduct,
  fetchConnectStatus,
  fetchStripeProductImportList,
  importProductDraftFromStripe,
  importProductDraftFromStripeProductId,
  estimateCreatorNet,
  formatMinorCurrency,
  type BoostTier,
  type CreatorProduct,
  type ProductImportDraft,
  type StripeProductImportRow
} from "@/lib/monetization";
import {
  growthExperiments,
  resolveVariant,
  shouldShowExperimentPrompt,
  trackClientExperimentEvent
} from "@/lib/experiments";

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

export type CreateProductComposerProps = {
  variant: "page" | "embedded";
  /** Called after successful draft save (embedded: Creator hub). */
  onCreated?: (product: CreatorProduct) => void;
};

type MePersonaProfile = {
  profile_kind?: "consumer" | "professional" | "business_interest" | null;
  persona_capabilities?: {
    can_create_products?: boolean;
  };
};

function applyImportedDraft(
  draft: ProductImportDraft,
  setters: {
    setTitle: (v: string) => void;
    setDescription: (v: string) => void;
    setCurrency: (v: string) => void;
    setShowAdvanced: (v: boolean) => void;
    setPriceUsd: (v: string) => void;
    setPriceMinorRaw: (v: string) => void;
    setProductType: (v: "digital" | "service") => void;
    setWebsiteUrl: (v: string) => void;
    setServiceDetails: (v: string) => void;
    setDeliveryMethod: (v: string) => void;
    setAudienceTarget: (v: "b2b" | "b2c" | "both") => void;
    setBusinessCategory: (v: string) => void;
  }
) {
  setters.setTitle(draft.title);
  setters.setDescription(draft.description || "");
  const cur = (draft.currency || "usd").toLowerCase().slice(0, 3);
  setters.setCurrency(cur);
  if (cur === "usd") {
    setters.setShowAdvanced(false);
    setters.setPriceUsd((draft.priceMinor / 100).toFixed(2));
    setters.setPriceMinorRaw("");
  } else {
    setters.setShowAdvanced(true);
    setters.setPriceMinorRaw(String(draft.priceMinor));
    setters.setPriceUsd("");
  }
  setters.setProductType(draft.productType === "digital" ? "digital" : "service");
  setters.setWebsiteUrl(draft.websiteUrl || "");
  setters.setServiceDetails(draft.serviceDetails || "");
  setters.setDeliveryMethod(draft.deliveryMethod || "");
  setters.setAudienceTarget(
    draft.audienceTarget === "b2b" || draft.audienceTarget === "b2c" || draft.audienceTarget === "both"
      ? draft.audienceTarget
      : "both"
  );
  setters.setBusinessCategory(draft.businessCategory || "");
}

export function CreateProductComposer({ variant, onCreated }: CreateProductComposerProps) {
  const queryClient = useQueryClient();
  const [newProductTitle, setNewProductTitle] = useState("");
  const [newProductDescription, setNewProductDescription] = useState("");
  const [newProductPriceUsd, setNewProductPriceUsd] = useState("");
  const [showPriceMinorAdvanced, setShowPriceMinorAdvanced] = useState(false);
  const [newProductPriceMinorRaw, setNewProductPriceMinorRaw] = useState("");
  const [newProductCurrency, setNewProductCurrency] = useState("usd");
  const [newProductType, setNewProductType] = useState<"digital" | "service">("digital");
  const [newProductAudienceTarget, setNewProductAudienceTarget] = useState<"b2b" | "b2c" | "both">("both");
  const [newProductBusinessCategory, setNewProductBusinessCategory] = useState("");
  const [newProductServiceDetails, setNewProductServiceDetails] = useState("");
  const [newProductDeliveryMethod, setNewProductDeliveryMethod] = useState("");
  const [newProductWebsiteUrl, setNewProductWebsiteUrl] = useState("");
  const [newProductDeliveryFile, setNewProductDeliveryFile] = useState<File | null>(null);
  const [newProductBoostTier, setNewProductBoostTier] = useState<BoostTier>("standard");
  const [newProductFormError, setNewProductFormError] = useState("");
  const [assistError, setAssistError] = useState("");
  const [assistPending, setAssistPending] = useState(false);
  const [newProductServiceKeyPoints, setNewProductServiceKeyPoints] = useState("");
  const [serviceAssistError, setServiceAssistError] = useState("");
  const [serviceAssistPending, setServiceAssistPending] = useState(false);
  const [productAiPreview, setProductAiPreview] = useState<string | null>(null);
  const [serviceAiPreview, setServiceAiPreview] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<CreatorProduct | null>(null);
  const [publishError, setPublishError] = useState("");
  const [stripeImportItems, setStripeImportItems] = useState<StripeProductImportRow[]>([]);
  const [stripeImportBusy, setStripeImportBusy] = useState(false);
  const [stripePickBusy, setStripePickBusy] = useState(false);
  const [stripeProductIdInput, setStripeProductIdInput] = useState("");
  const [importError, setImportError] = useState("");
  const connectStatusQuery = useQuery({
    queryKey: ["creator-product-composer-connect-status"],
    queryFn: () => fetchConnectStatus()
  });
  const meProfileQuery = useQuery({
    queryKey: ["creator-product-composer-me-profile"],
    queryFn: () => apiRequest<MePersonaProfile>("/users/me", { auth: true })
  });
  const canCreateProducts = Boolean(meProfileQuery.data?.persona_capabilities?.can_create_products);
  const persona = meProfileQuery.data?.profile_kind || null;
  const financialVariant = resolveVariant(`${variant}:${persona || "anon"}`, growthExperiments.financialPrompt);
  const timeVariant = resolveVariant(`${variant}:${persona || "anon"}`, growthExperiments.timeCopy);
  const boostTierBps: Record<BoostTier, number> = {
    standard: 350,
    boosted: 2000,
    aggressive: 3500
  };
  const activeBoostTiers =
    connectStatusQuery.data?.feePolicy?.tiers?.filter((tier) => tier.enabled) ||
    [
      { key: "standard" as const, label: "Standard", platformFeeBps: 350, description: "Default placement." },
      { key: "boosted" as const, label: "Boosted", platformFeeBps: 2000, description: "Higher-priority placement." }
    ];
  const previewPriceMinor = (() => {
    const curLower = newProductCurrency.toLowerCase();
    if (showPriceMinorAdvanced || curLower !== "usd") {
      const raw = newProductPriceMinorRaw.replace(/\D/g, "");
      const parsed = raw ? Number.parseInt(raw, 10) : NaN;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    return parseUsdToMinor(newProductPriceUsd);
  })();
  const previewFeeBps = boostTierBps[newProductBoostTier] ?? 350;
  const previewNet =
    previewPriceMinor && previewPriceMinor > 0 ? estimateCreatorNet(previewPriceMinor, previewFeeBps, 700, true) : null;

  const createProductMutation = useMutation({
    mutationFn: (input: {
      title: string;
      description?: string;
      priceMinor: number;
      currency?: string;
      productType: "digital" | "service";
      deliveryMediaKey?: string;
      serviceDetails?: string;
      deliveryMethod?: string;
      websiteUrl?: string;
      audienceTarget?: "b2b" | "b2c" | "both";
      businessCategory?: string;
      boostTier?: BoostTier;
    }) => createProduct({ ...input, currency: input.currency || "usd" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["account-monetization-products"] });
    }
  });

  const publishMutation = useMutation({
    mutationFn: (id: number) => publishProduct(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["account-monetization-products"] });
    }
  });

  const resetForm = () => {
    setNewProductTitle("");
    setNewProductDescription("");
    setNewProductPriceUsd("");
    setNewProductPriceMinorRaw("");
    setShowPriceMinorAdvanced(false);
    setNewProductCurrency("usd");
    setNewProductType("digital");
    setNewProductAudienceTarget("both");
    setNewProductBusinessCategory("");
    setNewProductServiceDetails("");
    setNewProductServiceKeyPoints("");
    setServiceAssistError("");
    setNewProductDeliveryMethod("");
    setNewProductWebsiteUrl("");
    setNewProductDeliveryFile(null);
    setNewProductBoostTier("standard");
    setNewProductFormError("");
    setStripeImportItems([]);
    setImportError("");
    setProductAiPreview(null);
    setServiceAiPreview(null);
    setAssistError("");
  };

  useEffect(() => {
    if (!canCreateProducts) {
      return;
    }
    if (!shouldShowExperimentPrompt({ experimentId: growthExperiments.financialPrompt, persona })) {
      return;
    }
    void trackClientExperimentEvent({
      eventName: "offer_attach_prompt_shown",
      persona,
      source: "web",
      surface: "create_product",
      experimentId: growthExperiments.financialPrompt,
      variantId: financialVariant,
      properties: { variant: financialVariant }
    });
  }, [canCreateProducts, persona, financialVariant]);

  const onCreateProductSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreateProducts) {
      setNewProductFormError("Switch to Professional or Business in Account settings to create product listings.");
      return;
    }
    setNewProductFormError("");
    const title = newProductTitle.trim();
    if (title.length < 3) {
      setNewProductFormError("Title must be at least 3 characters.");
      return;
    }
    let priceMinor: number | null = null;
    const curLower = newProductCurrency.toLowerCase();
    if (showPriceMinorAdvanced || curLower !== "usd") {
      const raw = newProductPriceMinorRaw.replace(/\D/g, "");
      const parsed = raw ? Number.parseInt(raw, 10) : NaN;
      priceMinor = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      if (priceMinor === null) {
        setNewProductFormError("Enter a valid price in minor units for the selected currency, greater than zero.");
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

      const product = await createProductMutation.mutateAsync({
        title,
        description: newProductDescription.trim() || undefined,
        priceMinor,
        currency: newProductCurrency,
        productType: newProductType,
        deliveryMediaKey,
        serviceDetails: newProductServiceDetails.trim() || undefined,
        deliveryMethod: newProductDeliveryMethod.trim() || undefined,
        websiteUrl: newProductWebsiteUrl.trim() || undefined,
        audienceTarget: newProductAudienceTarget,
        businessCategory: newProductBusinessCategory.trim() || undefined,
        boostTier: newProductBoostTier
      });

      onCreated?.(product);
      if (variant === "page") {
        setLastCreated(product);
        resetForm();
      } else {
        resetForm();
      }
      void trackClientExperimentEvent({
        eventName: "task_completed",
        persona,
        source: "web",
        surface: "create_product",
        experimentId: growthExperiments.timeCopy,
        variantId: timeVariant,
        properties: {
          productId: product.id,
          productType: newProductType
        }
      });
    } catch (err) {
      setNewProductFormError((err as Error).message || "Could not create product.");
    }
  };

  const onImproveDescription = async () => {
    const draft = newProductDescription.trim() || newProductTitle.trim();
    if (draft.length < 3) {
      setAssistError("Add a title or description to improve.");
      return;
    }
    setAssistError("");
    setAssistPending(true);
    try {
      const res = await assistPostText(draft, "product_listing");
      setProductAiPreview(res.suggestion);
    } catch (e) {
      setAssistError(e instanceof ApiError ? e.message : "Could not improve text.");
    } finally {
      setAssistPending(false);
    }
  };

  const onGenerateServiceDescription = async () => {
    const keyPoints = newProductServiceKeyPoints.trim();
    if (keyPoints.length < 5) {
      setServiceAssistError("Add key points about your service (bullets or short notes).");
      return;
    }
    setServiceAssistError("");
    setServiceAssistPending(true);
    try {
      const lines = [
        newProductTitle.trim() ? `Product title: ${newProductTitle.trim()}` : null,
        `Product type: ${newProductType}`,
        "",
        "Key points from creator:",
        keyPoints
      ].filter(Boolean) as string[];
      const res = await assistPostText(lines.join("\n"), "service_details_generate");
      setServiceAiPreview(res.suggestion);
    } catch (e) {
      setServiceAssistError(e instanceof ApiError ? e.message : "Could not generate service description.");
    } finally {
      setServiceAssistPending(false);
    }
  };

  if (variant === "page" && lastCreated) {
    return (
      <div className="surface-card section-stack rounded-control border border-black/10 px-6 py-6">
        <p className="text-sm font-semibold text-text">Product saved as draft</p>
        <p className="mt-1 text-sm text-muted">
          Publish when you are ready for it to appear on your profile and in checkout.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary px-3 py-1.5 text-sm"
            disabled={publishMutation.isPending}
            onClick={async () => {
              setPublishError("");
              try {
                await publishMutation.mutateAsync(lastCreated.id);
                setLastCreated(null);
              } catch (e) {
                setPublishError((e as Error).message || "Could not publish.");
              }
            }}
          >
            {publishMutation.isPending ? "Publishing…" : "Publish now"}
          </button>
          <Link href="/create" className="btn-secondary inline-flex px-3 py-1.5 text-sm">
            Attach to a post
          </Link>
          <Link href="/account/creator?tab=products" className="btn-secondary inline-flex px-3 py-1.5 text-sm">
            Creator hub
          </Link>
          <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => setLastCreated(null)}>
            Create another
          </button>
        </div>
        {publishError ? (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {publishError}
          </p>
        ) : null}
      </div>
    );
  }

  if (!meProfileQuery.isLoading && !canCreateProducts) {
    return (
      <div className="rounded-control border border-black/10 bg-surface px-4 py-3 text-sm text-muted">
        Product creation is available for Professional and Business profiles.{" "}
        <Link
          href="/account/settings"
          className="text-sky-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25"
        >
          Change your profile mode
        </Link>
        .
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={onCreateProductSubmit}>
      <div className="space-y-3 rounded-control border border-black/10 bg-black/[0.02] px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Import</p>
        <p className="text-xs text-muted">
          After payout setup is complete, you can pull prices from your linked Stripe catalog by Product ID and auto-fill
          fields here.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary px-3 py-1.5 text-xs"
            disabled={stripeImportBusy}
            onClick={() => {
              setImportError("");
              setStripeImportBusy(true);
              void (async () => {
                try {
                  const r = await fetchStripeProductImportList({ limit: 50 });
                  setStripeImportItems(r.items);
                  if (r.items.length === 0) {
                    setImportError("No active Stripe prices found on your connected account.");
                  }
                } catch (err) {
                  setImportError(err instanceof ApiError ? err.message : "Could not load Stripe catalog.");
                } finally {
                  setStripeImportBusy(false);
                }
              })();
            }}
          >
            {stripeImportBusy ? "Loading Stripe…" : "Load Stripe prices"}
          </button>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1">
            <label className="text-xs text-muted" htmlFor="cp-import-stripe-product-id">
              Stripe Product ID
            </label>
            <input
              id="cp-import-stripe-product-id"
              className="input bg-white text-sm"
              placeholder="prod_..."
              value={stripeProductIdInput}
              onChange={(e) => setStripeProductIdInput(e.target.value)}
              autoCapitalize="off"
            />
          </div>
          <button
            type="button"
            className="btn-secondary shrink-0 px-3 py-2 text-sm"
            disabled={stripePickBusy}
            onClick={() => {
              const stripeProductId = stripeProductIdInput.trim();
              if (!stripeProductId) {
                setImportError("Enter a Stripe Product ID (prod_...).");
                return;
              }
              setImportError("");
              setStripePickBusy(true);
              void (async () => {
                try {
                  const r = await importProductDraftFromStripeProductId(stripeProductId);
                  if ("needsPriceSelection" in r && r.needsPriceSelection) {
                    setStripeImportItems(r.items || []);
                    setImportError(r.message || "Multiple prices found. Pick one below.");
                    return;
                  }
                  if (!("draft" in r)) {
                    setImportError("Could not import from Stripe Product ID.");
                    return;
                  }
                  applyImportedDraft(r.draft, {
                    setTitle: setNewProductTitle,
                    setDescription: setNewProductDescription,
                    setCurrency: setNewProductCurrency,
                    setShowAdvanced: setShowPriceMinorAdvanced,
                    setPriceUsd: setNewProductPriceUsd,
                    setPriceMinorRaw: setNewProductPriceMinorRaw,
                    setProductType: setNewProductType,
                    setWebsiteUrl: setNewProductWebsiteUrl,
                    setServiceDetails: setNewProductServiceDetails,
                    setDeliveryMethod: setNewProductDeliveryMethod,
                    setAudienceTarget: setNewProductAudienceTarget,
                    setBusinessCategory: setNewProductBusinessCategory
                  });
                } catch (err) {
                  setImportError(err instanceof ApiError ? err.message : "Could not import from Stripe Product ID.");
                } finally {
                  setStripePickBusy(false);
                }
              })();
            }}
          >
            {stripePickBusy ? "Importing…" : "Import from Product ID"}
          </button>
        </div>
        {stripeImportItems.length > 0 ? (
          <div className="space-y-1">
            <label className="text-xs text-muted" htmlFor="cp-stripe-import-select">
              Choose a price to fill the form
            </label>
            <select
              id="cp-stripe-import-select"
              className="input bg-white text-sm"
              defaultValue=""
              disabled={stripePickBusy}
              onChange={(e) => {
                const id = e.target.value;
                if (!id) {
                  return;
                }
                const item = stripeImportItems.find((row) => row.stripePriceId === id);
                if (!item) {
                  return;
                }
                setImportError("");
                setStripePickBusy(true);
                void (async () => {
                  try {
                    const r = await importProductDraftFromStripe({
                      stripeProductId: item.stripeProductId,
                      stripePriceId: item.stripePriceId
                    });
                    applyImportedDraft(r.draft, {
                      setTitle: setNewProductTitle,
                      setDescription: setNewProductDescription,
                      setCurrency: setNewProductCurrency,
                      setShowAdvanced: setShowPriceMinorAdvanced,
                      setPriceUsd: setNewProductPriceUsd,
                      setPriceMinorRaw: setNewProductPriceMinorRaw,
                      setProductType: setNewProductType,
                      setWebsiteUrl: setNewProductWebsiteUrl,
                      setServiceDetails: setNewProductServiceDetails,
                      setDeliveryMethod: setNewProductDeliveryMethod,
                      setAudienceTarget: setNewProductAudienceTarget,
                      setBusinessCategory: setNewProductBusinessCategory
                    });
                  } catch (err) {
                    setImportError(err instanceof ApiError ? err.message : "Could not import from Stripe.");
                  } finally {
                    setStripePickBusy(false);
                    e.target.value = "";
                  }
                })();
              }}
            >
              <option value="">Select…</option>
              {stripeImportItems.map((row) => (
                <option key={row.stripePriceId} value={row.stripePriceId}>
                  {row.title} — {formatMinorCurrency(row.priceMinor, row.currency)}
                  {row.recurring ? ` / ${row.recurring.interval}` : ""}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {importError ? (
          <p className="text-xs text-amber-800 dark:text-amber-200" role="status">
            {importError}
          </p>
        ) : null}
      </div>

      <div className="space-y-3 border-t border-black/10 pt-4 first:border-t-0 first:pt-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Pricing and type</p>
        {!showPriceMinorAdvanced && newProductCurrency.toLowerCase() === "usd" ? (
          <div className="space-y-1">
            <label className="text-xs text-muted" htmlFor="cp-product-price-usd">
              Price (USD)
            </label>
            <input
              id="cp-product-price-usd"
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
            <label className="text-xs text-muted" htmlFor="cp-product-price-minor">
              Price in minor units (smallest currency unit)
            </label>
            <input
              id="cp-product-price-minor"
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
          Advanced: enter minor units directly
        </label>
        <div className="space-y-1">
          <label className="text-xs text-muted" htmlFor="cp-product-currency">
            Currency (ISO)
          </label>
          <input
            id="cp-product-currency"
            className="input max-w-[8rem] bg-white"
            value={newProductCurrency}
            onChange={(e) => setNewProductCurrency(e.target.value.trim().toLowerCase().slice(0, 3) || "usd")}
            maxLength={3}
            aria-label="Currency code"
          />
        </div>
        <select
          className="input bg-white"
          value={newProductType}
          onChange={(e) => setNewProductType(e.target.value as "digital" | "service")}
          aria-label="Product type"
        >
          <option value="digital">Digital</option>
          <option value="service">Service</option>
        </select>
        <p className="text-xs text-muted">Recurring offers are managed as Membership plans in Creator hub.</p>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Marketplace boost fee</p>
          <p className="text-xs text-muted">
            Higher platform % can increase visibility in marketplace feeds. Separate from Stripe processing.
          </p>
          <select
            className="input bg-white"
            value={newProductBoostTier}
            onChange={(e) => setNewProductBoostTier(e.target.value as BoostTier)}
            aria-label="Boost tier"
          >
            {activeBoostTiers.map((tier) => (
              <option key={tier.key} value={tier.key}>
                {tier.label} ({(tier.platformFeeBps / 100).toFixed(1)}%)
              </option>
            ))}
          </select>
          <div className="rounded-control border border-black/10 bg-white px-3 py-2 text-xs text-muted">
            <p className="font-semibold text-text">Payout preview</p>
            <p>Buyer pays: {previewPriceMinor ? formatMinorCurrency(previewPriceMinor, newProductCurrency) : "—"}</p>
            <p>
              Platform fee ({(previewFeeBps / 100).toFixed(1)}%):{" "}
              {previewNet ? formatMinorCurrency(previewNet.platformFeeMinor, newProductCurrency) : "—"}
            </p>
            <p>
              Affiliate impact (up to 7.0%):{" "}
              {previewNet ? formatMinorCurrency(previewNet.affiliateMinor, newProductCurrency) : "—"}
            </p>
            <p className="font-semibold text-text">
              You receive (estimated):{" "}
              {previewNet ? formatMinorCurrency(previewNet.creatorNetMinor, newProductCurrency) : "Enter valid price"}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t border-black/10 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Who it is for</p>
        <select
          className="input bg-white"
          value={newProductAudienceTarget}
          onChange={(e) => setNewProductAudienceTarget(e.target.value as "b2b" | "b2c" | "both")}
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
        {productAiPreview ? (
          <div className="rounded-control border border-sky-200/80 bg-sky-50/60 px-3 py-2 text-xs">
            <p className="font-medium text-text">Suggested short blurb</p>
            <p className="mt-1 whitespace-pre-line text-text/90">{productAiPreview}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary px-3 py-1 text-xs"
                onClick={() => {
                  setNewProductDescription(productAiPreview);
                  setProductAiPreview(null);
                }}
              >
                Use this
              </button>
              <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => setProductAiPreview(null)}>
                Dismiss
              </button>
            </div>
          </div>
        ) : null}
        <textarea
          className="input min-h-24 resize-y bg-white"
          placeholder="Product or offer details"
          value={newProductDescription}
          onChange={(e) => setNewProductDescription(e.target.value)}
          aria-label="Product description"
        />
        <p className="text-[11px] text-muted">{newProductDescription.length} characters · keep it skimmable</p>
        <button
          type="button"
          className="btn-secondary px-3 py-1.5 text-xs"
          onClick={() => void onImproveDescription()}
          disabled={assistPending}
        >
          {assistPending ? "Working…" : "Short value blurb"}
        </button>
        {assistError ? (
          <p className="text-xs text-red-600" role="alert">
            {assistError}
          </p>
        ) : null}
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
          <div className="space-y-2">
            <textarea
              className="input min-h-20 resize-y bg-white"
              placeholder="Key points — what you offer, who it is for, format (e.g. 1:1 calls), length of engagement…"
              value={newProductServiceKeyPoints}
              onChange={(e) => setNewProductServiceKeyPoints(e.target.value)}
              aria-label="Service key points for AI"
            />
            <button
              type="button"
              className="btn-secondary px-3 py-1.5 text-xs"
              onClick={() => void onGenerateServiceDescription()}
              disabled={serviceAssistPending}
            >
              {serviceAssistPending ? "Working…" : "Short value blurb from key points"}
            </button>
            {serviceAssistError ? (
              <p className="text-xs text-red-600" role="alert">
                {serviceAssistError}
              </p>
            ) : null}
            <p className="text-xs text-muted">You’ll get a short suggestion — use it only if it fits your offer.</p>
            {serviceAiPreview ? (
              <div className="rounded-control border border-sky-200/80 bg-sky-50/60 px-3 py-2 text-xs">
                <p className="font-medium text-text">Suggested service blurb</p>
                <p className="mt-1 whitespace-pre-line text-text/90">{serviceAiPreview}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-primary px-3 py-1 text-xs"
                    onClick={() => {
                      setNewProductServiceDetails(serviceAiPreview);
                      setServiceAiPreview(null);
                    }}
                  >
                    Use this
                  </button>
                  <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => setServiceAiPreview(null)}>
                    Dismiss
                  </button>
                </div>
              </div>
            ) : null}
            <textarea
              className="input min-h-28 resize-y bg-white"
              placeholder="Service description (write your own or use a suggestion above)"
              value={newProductServiceDetails}
              onChange={(e) => setNewProductServiceDetails(e.target.value)}
              aria-label="Service details"
            />
            <p className="text-[11px] text-muted">{newProductServiceDetails.length} characters</p>
          </div>
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
        {createProductMutation.isPending
          ? "Saving..."
          : timeVariant === "value_copy"
            ? "Save draft and start earning"
            : timeVariant === "fast_path"
              ? "Save draft (fast)"
              : "Save product (draft)"}
      </button>
    </form>
  );
}
