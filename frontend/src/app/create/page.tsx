"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { fetchSessionMe } from "@/lib/auth";
import { fetchInstagramStatus, requestInstagramCrossPost } from "@/lib/instagram";
import { resolveMediaUrl } from "@/lib/media-url";
import { ErrorState } from "@/components/states";

type CreatePostResponse = {
  id: number;
};

type UploadSignatureResponse = {
  uploadUrl: string;
  headers: Record<string, string>;
  key: string;
};

type MeProfile = {
  display_name: string;
  username: string;
  avatar_url: string | null;
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
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const sessionQuery = useQuery({
    queryKey: ["create-session-me"],
    queryFn: () => fetchSessionMe()
  });
  const profileQuery = useQuery({
    queryKey: ["create-profile-me"],
    queryFn: () => apiRequest<MeProfile>("/users/me", { auth: true }),
    enabled: Boolean(sessionQuery.data?.id)
  });

  const instagramQuery = useQuery({
    queryKey: ["instagram-status"],
    queryFn: () => fetchInstagramStatus(),
    retry: false
  });
  const igConnected = Boolean(instagramQuery.data?.connected);

  const [crossPostToInstagram, setCrossPostToInstagram] = useState(false);
  const [postType, setPostType] = useState("community");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [productDeliveryFile, setProductDeliveryFile] = useState<File | null>(null);
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

  useEffect(() => {
    if (!mediaFile) {
      setMediaPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(mediaFile);
    setMediaPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [mediaFile]);

  const composerName =
    profileQuery.data?.display_name?.trim() ||
    profileQuery.data?.username?.trim() ||
    sessionQuery.data?.username?.trim() ||
    sessionQuery.data?.email?.split("@")[0] ||
    "You";
  const avatarUrl = resolveMediaUrl(profileQuery.data?.avatar_url ?? null);
  const previewKind = mediaFile
    ? deriveMediaType(mediaFile.type || "application/octet-stream")
    : null;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    const file = mediaFile;
    const productFile = productDeliveryFile;

    try {
      if (crossPostToInstagram && (!file || file.size <= 0)) {
        throw new Error("Add image or video media to cross-post to Instagram.");
      }

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

        if (crossPostToInstagram) {
          try {
            await requestInstagramCrossPost(post.id);
          } catch {
            /* background job may still run; avoid blocking navigation */
          }
        }
      }

      router.push(`/posts/${post.id}`);
    } catch (err) {
      setError((err as Error).message || "Unable to create post");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-10">
      <header className="bg-black px-4 py-4 text-center text-white">
        <h1 className="text-lg font-semibold tracking-tight">Create New Post</h1>
      </header>

      <div className="mx-auto max-w-2xl px-4 pt-6">
        <form className="space-y-5" onSubmit={onSubmit}>
          <div>
            <input
              ref={mediaInputRef}
              id="create-media-file"
              name="mediaFile"
              type="file"
              accept="image/*,video/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setMediaFile(f ?? null);
              }}
            />
            <button
              type="button"
              className="flex min-h-[220px] w-full cursor-pointer flex-col items-center justify-center rounded-panel border border-black/15 bg-white text-center shadow-sm transition hover:border-black/25"
              onClick={() => mediaInputRef.current?.click()}
            >
              {mediaPreviewUrl && previewKind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mediaPreviewUrl}
                  alt=""
                  className="max-h-[280px] w-full object-contain"
                />
              ) : null}
              {mediaPreviewUrl && previewKind === "video" ? (
                <video
                  src={mediaPreviewUrl}
                  className="max-h-[280px] w-full object-contain"
                  controls
                  muted
                  playsInline
                />
              ) : null}
              {!mediaPreviewUrl ? (
                <span className="px-6 text-sm text-muted">Tap to add photo or video</span>
              ) : null}
            </button>
          </div>

          <div className="surface-card space-y-3 bg-[#E8EDF5] !shadow-none">
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-10 w-10 rounded-full border border-black/10 object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white text-sm font-bold text-text">
                  {composerName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <span className="truncate font-semibold text-text">{composerName}</span>
            </div>
            <label className="sr-only" htmlFor="create-caption">
              Post caption
            </label>
            <textarea
              id="create-caption"
              className="input min-h-32 bg-white"
              placeholder="What's on your mind?"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              required
              aria-label="Post caption"
            />
            <input
              className="input bg-white"
              placeholder="Tags (comma separated)"
              value={tagsInput}
              onChange={(event) => setTagsInput(event.target.value)}
              aria-label="Tags"
            />

            <div className="border-t border-black/10 pt-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-text">Promote</p>
                  <p className="text-xs text-muted">Add pricing and offer details</p>
                </div>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="Promote this post"
                  checked={sellThis}
                  onChange={(event) => setSellThis(event.target.checked)}
                  className="sr-only"
                  id="promote-switch"
                />
                <label
                  htmlFor="promote-switch"
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border p-0.5 transition focus-within:ring-2 focus-within:ring-accent ${
                    sellThis ? "border-accent bg-accent" : "border-black/15 bg-black/10"
                  }`}
                >
                  <span
                    className={`block size-6 rounded-full bg-white shadow transition-transform ${
                      sellThis ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </label>
              </div>
            </div>

            {sellThis ? (
              <div className="space-y-3 border-t border-black/10 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Pricing and type</p>
                <input
                  className="input bg-white"
                  placeholder="e.g. 499 for $4.99"
                  value={priceMinor}
                  onChange={(event) => setPriceMinor(event.target.value)}
                  inputMode="numeric"
                />
                <select
                  className="input bg-white"
                  value={productType}
                  onChange={(event) =>
                    setProductType(event.target.value as "digital" | "service" | "subscription")
                  }
                  aria-label="Product type"
                >
                  <option value="digital">Digital</option>
                  <option value="service">Service</option>
                  <option value="subscription">Subscription</option>
                </select>

                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Who it is for</p>
                <select
                  className="input bg-white"
                  value={audienceTarget}
                  onChange={(event) => setAudienceTarget(event.target.value as "b2b" | "b2c" | "both")}
                  aria-label="Audience"
                >
                  <option value="b2c">Consumers (B2C)</option>
                  <option value="b2b">Businesses (B2B)</option>
                  <option value="both">Both</option>
                </select>

                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Category</p>
                <select
                  className="input bg-white"
                  value={businessCategory}
                  onChange={(event) => setBusinessCategory(event.target.value)}
                  aria-label="Business category"
                >
                  <option value="">Select category</option>
                  <option value="tools_growth">Tools & Growth</option>
                  <option value="professional_services">Professional Services</option>
                  <option value="digital_products">Digital Products</option>
                  <option value="education_coaching">Education & Coaching</option>
                  <option value="lifestyle_inspiration">Lifestyle & Inspiration</option>
                </select>

                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Offer copy</p>
                <input
                  className="input bg-white"
                  placeholder="Product title"
                  value={productTitle}
                  onChange={(event) => setProductTitle(event.target.value)}
                  maxLength={180}
                />
                <textarea
                  className="input min-h-24 bg-white"
                  placeholder="Product or offer details"
                  value={productDescription}
                  onChange={(event) => setProductDescription(event.target.value)}
                />

                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Delivery</p>
                {productType === "digital" ? (
                  <input
                    name="productFile"
                    type="file"
                    accept="image/*,video/*"
                    className="input cursor-pointer bg-white"
                    onChange={(e) => setProductDeliveryFile(e.target.files?.[0] ?? null)}
                  />
                ) : (
                  <textarea
                    className="input min-h-24 bg-white"
                    placeholder="Service details / what buyer receives"
                    value={serviceDetails}
                    onChange={(event) => setServiceDetails(event.target.value)}
                  />
                )}
                <input
                  className="input bg-white"
                  placeholder="Delivery method (email, DM, booking call, etc.)"
                  value={deliveryMethod}
                  onChange={(event) => setDeliveryMethod(event.target.value)}
                />
                <input
                  className="input bg-white"
                  placeholder="Website URL (https://...)"
                  value={websiteUrl}
                  onChange={(event) => setWebsiteUrl(event.target.value)}
                />

                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Call to action</p>
                <input
                  className="input bg-white"
                  placeholder="CTA label (e.g., Learn more)"
                  value={ctaLabel}
                  onChange={(event) => setCtaLabel(event.target.value)}
                  maxLength={80}
                />
                <input
                  className="input bg-white"
                  placeholder="CTA URL (https://...)"
                  value={ctaUrl}
                  onChange={(event) => setCtaUrl(event.target.value)}
                />
                <p className="text-xs text-muted">Add both CTA fields or leave both empty.</p>
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Post type</p>
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

            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={crossPostToInstagram}
                disabled={!igConnected}
                onChange={(event) => setCrossPostToInstagram(event.target.checked)}
              />
              Also share to Instagram
            </label>
            {!igConnected ? (
              <p className="text-xs text-muted">
                Connect an Instagram Business/Creator account on Account to enable cross-posting.
              </p>
            ) : (
              <p className="text-xs text-muted">
                Requires public HTTPS media (configure CDN). Publishing runs in the background after upload.
              </p>
            )}
          </div>

          {error ? <ErrorState message={error} /> : null}
          <button className="btn-primary w-full" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Publishing..." : "Publish"}
          </button>
        </form>
      </div>
    </div>
  );
}
