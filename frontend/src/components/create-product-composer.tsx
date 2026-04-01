"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiRequest } from "@/lib/api";
import { assistPostText } from "@/lib/ai-assist";
import {
  createProduct,
  publishProduct,
  type BoostTier,
  type CreatorProduct
} from "@/lib/monetization";

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

export function CreateProductComposer({ variant, onCreated }: CreateProductComposerProps) {
  const queryClient = useQueryClient();
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
  const [assistError, setAssistError] = useState("");
  const [assistPending, setAssistPending] = useState(false);
  const [lastCreated, setLastCreated] = useState<CreatorProduct | null>(null);
  const [publishError, setPublishError] = useState("");

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
    setNewProductType("digital");
    setNewProductAudienceTarget("both");
    setNewProductBusinessCategory("");
    setNewProductServiceDetails("");
    setNewProductDeliveryMethod("");
    setNewProductWebsiteUrl("");
    setNewProductDeliveryFile(null);
    setNewProductBoostTier("standard");
    setNewProductFormError("");
  };

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

      const product = await createProductMutation.mutateAsync({
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

      onCreated?.(product);
      if (variant === "page") {
        setLastCreated(product);
        resetForm();
      } else {
        resetForm();
      }
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
      setNewProductDescription(res.suggestion);
    } catch (e) {
      setAssistError(e instanceof ApiError ? e.message : "Could not improve text.");
    } finally {
      setAssistPending(false);
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

  return (
    <form className="space-y-4" onSubmit={onCreateProductSubmit}>
      <div className="space-y-3 border-t border-black/10 pt-4 first:border-t-0 first:pt-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Pricing and type</p>
        {!showPriceMinorAdvanced ? (
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
              Price in cents (minor units)
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
          Advanced: enter minor units (cents) directly
        </label>
        <select
          className="input bg-white"
          value={newProductType}
          onChange={(e) => setNewProductType(e.target.value as "digital" | "service" | "subscription")}
          aria-label="Product type"
        >
          <option value="digital">Digital</option>
          <option value="service">Service</option>
          <option value="subscription">Subscription</option>
        </select>
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
        <textarea
          className="input min-h-24 resize-y bg-white"
          placeholder="Product or offer details"
          value={newProductDescription}
          onChange={(e) => setNewProductDescription(e.target.value)}
          aria-label="Product description"
        />
        <button
          type="button"
          className="btn-secondary px-3 py-1.5 text-xs"
          onClick={() => void onImproveDescription()}
          disabled={assistPending}
        >
          {assistPending ? "Improving…" : "Improve description (AI)"}
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
  );
}
