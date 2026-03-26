"use client";

import Link from "next/link";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { fetchSessionMe } from "@/lib/auth";
import {
  disconnectInstagram,
  fetchInstagramOAuthUrl,
  fetchInstagramStatus,
  requestInstagramCrossPost
} from "@/lib/instagram";
import { resolveMediaUrl } from "@/lib/media-url";
import { ErrorState } from "@/components/states";
import { attachProductToPost, fetchMyProducts, formatMinorCurrency } from "@/lib/monetization";

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
  const queryClient = useQueryClient();
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
  const myProductsQuery = useQuery({
    queryKey: ["create-my-products"],
    queryFn: () => fetchMyProducts(),
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sellThis, setSellThis] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [audienceTarget, setAudienceTarget] = useState<"b2b" | "b2c" | "both">("both");
  const [businessCategory, setBusinessCategory] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [instagramBanner, setInstagramBanner] = useState("");

  const disconnectInstagramMutation = useMutation({
    mutationFn: () => disconnectInstagram(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["instagram-status"] });
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const err = params.get("instagram_error");
    const ok = params.get("instagram_connected");
    if (err) {
      setInstagramBanner(`Instagram: ${decodeURIComponent(err).slice(0, 400)}`);
    } else if (ok === "1") {
      setInstagramBanner("Instagram connected. You can enable “Also share to Instagram” when you publish.");
    }
    if (err || ok) {
      window.history.replaceState({}, "", "/create");
      void queryClient.invalidateQueries({ queryKey: ["instagram-status"] });
    }
  }, [queryClient]);

  useEffect(() => {
    if (!mediaFile) {
      setMediaPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(mediaFile);
    setMediaPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [mediaFile]);

  useEffect(() => {
    if (!sellThis) {
      setSelectedProductId("");
    }
  }, [sellThis]);

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

    try {
      if (crossPostToInstagram && (!file || file.size <= 0)) {
        throw new Error("Add image or video media to cross-post to Instagram.");
      }

      if (sellThis) {
        const pid = Number(selectedProductId);
        if (!pid) {
          throw new Error("Choose a product from your catalog, or create one in Creator hub.");
        }
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
          sellThis: false,
          audienceTarget: sellThis ? audienceTarget : "both",
          businessCategory: sellThis && businessCategory ? businessCategory : undefined
        }
      });

      if (sellThis && selectedProductId) {
        await attachProductToPost(post.id, Number(selectedProductId));
      }

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

  const openMediaPicker = () => mediaInputRef.current?.click();
  const onMediaZoneKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openMediaPicker();
    }
  };

  return (
    <div className="page-stack mx-auto w-full max-w-2xl">
      <header className="page-header">
        <p className="text-sm text-muted">
          <Link
            href="/home"
            className="rounded-sm text-sky-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Back to home
          </Link>
        </p>
        <h1 className="page-header-title mt-4">Create a post</h1>
        <p className="page-header-subtitle">
          Add a photo or video, write a caption, and optionally promote your offer or cross-post to Instagram.
        </p>
      </header>

      <form className="section-stack" onSubmit={onSubmit}>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Media</p>
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
            className="media-upload-zone min-h-[220px]"
            aria-label="Add photo or video for this post"
            onClick={openMediaPicker}
            onKeyDown={onMediaZoneKeyDown}
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
              <span className="px-6 text-sm font-medium text-text">Tap to add photo or video</span>
            ) : null}
          </button>
          <p className="mt-2 text-center text-xs text-muted">Optional for text-only posts. JPEG, PNG, GIF, or MP4.</p>
        </div>

        <div className="surface-card space-y-4">
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
                  <p className="text-xs text-muted">Attach a catalog product and tune how it shows in feed</p>
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
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Choose product</p>
                <p className="text-xs text-muted">
                  Products are created in{" "}
                  <Link
                    href="/account/creator"
                    className="text-sky-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25"
                  >
                    Creator hub
                  </Link>
                  . Publish there before buyers can check out.
                </p>
                <select
                  className="input bg-white"
                  value={selectedProductId}
                  onChange={(event) => setSelectedProductId(event.target.value)}
                  aria-label="Product to attach"
                >
                  <option value="">Select a product</option>
                  {(myProductsQuery.data?.items || [])
                    .slice()
                    .sort((a, b) => {
                      const rank = (s: string) => (s === "published" ? 0 : s === "draft" ? 1 : 2);
                      const d = rank(a.status) - rank(b.status);
                      if (d !== 0) {
                        return d;
                      }
                      return b.id - a.id;
                    })
                    .map((product) => (
                      <option key={product.id} value={String(product.id)}>
                        {product.title} — {formatMinorCurrency(product.price_minor, product.currency)}
                        {product.status === "published" ? "" : ` (${product.status})`}
                      </option>
                    ))}
                </select>
                {myProductsQuery.isFetching ? (
                  <p className="text-xs text-muted">Loading your products…</p>
                ) : (myProductsQuery.data?.items?.length ?? 0) === 0 ? (
                  <p className="text-xs text-muted">No products yet. Add one in Creator hub first.</p>
                ) : null}

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

        <div className="surface-card space-y-3 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Instagram (optional)</p>
            <p className="text-xs text-muted">
              Link a Facebook Page with an Instagram Professional account here. Cross-post runs after you publish; media
              must be reachable over public HTTPS (CDN).
            </p>
            {instagramBanner ? (
              <p className="rounded-panel border border-black/10 bg-surface px-3 py-2 text-sm text-text">{instagramBanner}</p>
            ) : null}
            {instagramQuery.isError ? (
              <p className="text-sm text-muted">Instagram integration is not available on this server.</p>
            ) : instagramQuery.data?.connected ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-black/10 bg-surface px-3 py-2">
                <p className="text-sm text-text">
                  Connected
                  {instagramQuery.data.igUsername
                    ? ` as @${instagramQuery.data.igUsername}`
                    : instagramQuery.data.igUserId
                      ? ` (IG ${instagramQuery.data.igUserId})`
                      : ""}
                </p>
                <button
                  type="button"
                  className="btn-secondary px-3 py-1.5 text-xs"
                  onClick={() => disconnectInstagramMutation.mutate()}
                  disabled={disconnectInstagramMutation.isPending}
                >
                  {disconnectInstagramMutation.isPending ? "..." : "Disconnect"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn-secondary px-3 py-2 text-sm"
                onClick={async () => {
                  try {
                    const { url } = await fetchInstagramOAuthUrl();
                    window.location.assign(url);
                  } catch (e) {
                    setInstagramBanner((e as Error).message || "Could not start Instagram connect.");
                  }
                }}
              >
                Connect Instagram
              </button>
            )}

            <div className="border-t border-black/10 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Post type</p>
              <select
                className="input mt-2"
                value={postType}
                onChange={(event) => setPostType(event.target.value)}
                aria-label="Post type"
              >
                <option value="community">Community</option>
                <option value="recitation">Recitation</option>
                <option value="short_video">Short video</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={crossPostToInstagram}
                disabled={!igConnected}
                onChange={(event) => setCrossPostToInstagram(event.target.checked)}
              />
              Also share this post to Instagram
            </label>
            {igConnected ? (
              <p className="text-xs text-muted">Requires image or video. Publishing runs in the background after upload.</p>
            ) : null}
          </div>

        {error ? <ErrorState message={error} /> : null}
        <button className="btn-primary w-full" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Publishing..." : "Publish"}
        </button>
      </form>
    </div>
  );
}
