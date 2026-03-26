"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { ErrorState } from "@/components/states";

type CreatePostResponse = {
  id: number;
};

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

export default function CreatePage() {
  const router = useRouter();
  const [postType, setPostType] = useState("community");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sellThis, setSellThis] = useState(false);
  const [productType, setProductType] = useState<"digital" | "service" | "subscription">("digital");
  const [priceMinor, setPriceMinor] = useState("");
  const [productTitle, setProductTitle] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [serviceDetails, setServiceDetails] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [audienceTarget, setAudienceTarget] = useState<"b2b" | "b2c" | "both">("both");
  const [businessCategory, setBusinessCategory] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const file = form.get("mediaFile") as File | null;
    const productFile = form.get("productFile") as File | null;

    try {
      let deliveryMediaKey: string | undefined;
      if (sellThis && productType === "digital") {
        if (!productFile || productFile.size <= 0) {
          throw new Error("Upload a delivery file for digital product.");
        }
        const productMimeType = productFile.type || "application/octet-stream";
        const productMediaType = deriveMediaType(productMimeType);
        if (!productMediaType) {
          throw new Error("Digital delivery file must be image or video.");
        }
        const signature = await apiRequest<UploadSignatureResponse>("/media/upload-signature", {
          method: "POST",
          auth: true,
          body: {
            mediaType: productMediaType,
            mimeType: productMimeType,
            originalFilename: productFile.name,
            fileSizeBytes: productFile.size
          }
        });
        const uploaded = await fetch(signature.uploadUrl, {
          method: "PUT",
          headers: signature.headers,
          body: productFile
        });
        if (!uploaded.ok) {
          throw new Error("Unable to upload product delivery file.");
        }
        deliveryMediaKey = signature.key;
      }
      const post = await apiRequest<CreatePostResponse>("/posts", {
        method: "POST",
        auth: true,
        body: {
          postType,
          content,
          tags: tagsInput
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          isBusinessPost: sellThis,
          ctaLabel: sellThis && ctaLabel.trim() ? ctaLabel.trim() : undefined,
          ctaUrl: sellThis && ctaUrl.trim() ? ctaUrl.trim() : undefined,
          sellThis,
          audienceTarget: sellThis ? audienceTarget : "both",
          businessCategory: sellThis && businessCategory ? businessCategory : undefined,
          productType,
          priceMinor: sellThis ? Number(priceMinor) : undefined,
          productTitle: sellThis && productTitle.trim() ? productTitle.trim() : undefined,
          productDescription: sellThis && productDescription.trim() ? productDescription.trim() : undefined,
          serviceDetails: sellThis && serviceDetails.trim() ? serviceDetails.trim() : undefined,
          deliveryMethod: sellThis && deliveryMethod.trim() ? deliveryMethod.trim() : undefined,
          websiteUrl: sellThis && websiteUrl.trim() ? websiteUrl.trim() : undefined,
          deliveryMediaKey
        }
      });

      if (file && file.size > 0) {
        const mimeType = file.type || "application/octet-stream";
        const mediaType = deriveMediaType(mimeType);
        if (!mediaType) {
          throw new Error("Only image and video uploads are supported.");
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

        const uploadResponse = await fetch(signature.uploadUrl, {
          method: "PUT",
          headers: signature.headers,
          body: file
        });
        if (!uploadResponse.ok) {
          throw new Error("Unable to upload media file.");
        }

        await apiRequest(`/media/posts/${post.id}/attach`, {
          method: "POST",
          auth: true,
          body: {
            mediaKey: signature.key,
            mediaUrl: signature.key,
            mimeType,
            fileSizeBytes: file.size
          }
        });
      }

      router.push(`/posts/${post.id}`);
    } catch (err) {
      setError((err as Error).message || "Unable to create post");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="section-title">Create post</h1>
        <p className="mt-1 text-sm text-muted">Share beneficial recitations and reminders.</p>
      </header>
      <form className="surface-card space-y-4" onSubmit={onSubmit}>
        <label className="text-xs uppercase tracking-wide text-muted">Post type</label>
        <select
          className="input"
          value={postType}
          onChange={(event) => setPostType(event.target.value)}
          aria-label="Post type"
        >
          <option value="community">Community</option>
          <option value="recitation">Recitation</option>
          <option value="short_video">Short video</option>
        </select>
        <label className="text-xs uppercase tracking-wide text-muted">Message</label>
        <textarea
          className="input min-h-32"
          placeholder="Share your message..."
          value={content}
          onChange={(event) => setContent(event.target.value)}
          required
        />
        <label className="text-xs uppercase tracking-wide text-muted">Tags</label>
        <input
          className="input"
          placeholder="deen, productivity, muslim-business"
          value={tagsInput}
          onChange={(event) => setTagsInput(event.target.value)}
        />
        <label className="text-xs uppercase tracking-wide text-muted">Optional media</label>
        <input name="mediaFile" type="file" accept="image/*,video/*" className="input cursor-pointer" />
        <p className="text-xs text-muted">
          Upload image or video from your device. Uploads are attached after post creation.
        </p>
        <div className="rounded-panel border border-black/10 p-3">
          <label className="flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={sellThis}
              onChange={(event) => setSellThis(event.target.checked)}
            />
            Sell This
          </label>
          {sellThis ? (
            <div className="mt-3 grid gap-2">
              <label className="text-xs uppercase tracking-wide text-muted">Price (minor units)</label>
              <input
                className="input"
                placeholder="e.g. 499 for $4.99"
                value={priceMinor}
                onChange={(event) => setPriceMinor(event.target.value)}
                inputMode="numeric"
              />
              <label className="text-xs uppercase tracking-wide text-muted">Product Type</label>
              <select
                className="input"
                value={productType}
                onChange={(event) =>
                  setProductType(event.target.value as "digital" | "service" | "subscription")
                }
              >
                <option value="digital">Digital</option>
                <option value="service">Service</option>
                <option value="subscription">Subscription</option>
              </select>
              <label className="text-xs uppercase tracking-wide text-muted">Audience</label>
              <select
                className="input"
                value={audienceTarget}
                onChange={(event) => setAudienceTarget(event.target.value as "b2b" | "b2c" | "both")}
              >
                <option value="b2c">Consumers (B2C)</option>
                <option value="b2b">Businesses (B2B)</option>
                <option value="both">Both</option>
              </select>
              <label className="text-xs uppercase tracking-wide text-muted">Category</label>
              <select
                className="input"
                value={businessCategory}
                onChange={(event) => setBusinessCategory(event.target.value)}
              >
                <option value="">Select category</option>
                <option value="tools_growth">Tools & Growth</option>
                <option value="professional_services">Professional Services</option>
                <option value="digital_products">Digital Products</option>
                <option value="education_coaching">Education & Coaching</option>
                <option value="lifestyle_inspiration">Lifestyle & Inspiration</option>
              </select>
              <input
                className="input"
                placeholder="Product title"
                value={productTitle}
                onChange={(event) => setProductTitle(event.target.value)}
                maxLength={180}
              />
              <textarea
                className="input min-h-24"
                placeholder="Product or offer details"
                value={productDescription}
                onChange={(event) => setProductDescription(event.target.value)}
              />
              {productType === "digital" ? (
                <>
                  <label className="text-xs uppercase tracking-wide text-muted">Delivery file</label>
                  <input
                    name="productFile"
                    type="file"
                    className="input cursor-pointer"
                    accept="image/*,video/*"
                  />
                </>
              ) : (
                <textarea
                  className="input min-h-24"
                  placeholder="Service details / what buyer receives"
                  value={serviceDetails}
                  onChange={(event) => setServiceDetails(event.target.value)}
                />
              )}
              <input
                className="input"
                placeholder="Delivery method (email, DM, booking call, etc.)"
                value={deliveryMethod}
                onChange={(event) => setDeliveryMethod(event.target.value)}
              />
              <input
                className="input"
                placeholder="Website URL (https://...)"
                value={websiteUrl}
                onChange={(event) => setWebsiteUrl(event.target.value)}
              />
              <input
                className="input"
                placeholder="CTA label (e.g., Learn more)"
                value={ctaLabel}
                onChange={(event) => setCtaLabel(event.target.value)}
                maxLength={80}
              />
              <input
                className="input"
                placeholder="CTA URL (https://...)"
                value={ctaUrl}
                onChange={(event) => setCtaUrl(event.target.value)}
              />
              <p className="text-xs text-muted">Add both fields or leave both empty.</p>
            </div>
          ) : null}
        </div>
        {error ? <ErrorState message={error} /> : null}
        <button className="btn-primary w-full" disabled={isSubmitting}>
          {isSubmitting ? "Publishing..." : "Publish"}
        </button>
      </form>
    </section>
  );
}
