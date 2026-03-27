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
import {
  attachProductToPost,
  fetchConnectStatus,
  fetchMyProducts,
  formatMinorCurrency
} from "@/lib/monetization";

const CREATE_DRAFT_VERSION = 1 as const;

type CreatePostDraftV1 = {
  v: typeof CREATE_DRAFT_VERSION;
  content: string;
  tagsInput: string;
  sellThis: boolean;
  selectedProductId: string;
  audienceTarget: "b2b" | "b2c" | "both";
  businessCategory: string;
  ctaLabel: string;
  ctaUrl: string;
  postType: string;
  crossPostToInstagram: boolean;
};

type CreateDraftState = { kind: "loading" } | { kind: "offer"; payload: CreatePostDraftV1 } | { kind: "ready" };

function parseCreateDraft(raw: string): CreatePostDraftV1 | null {
  try {
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object") {
      return null;
    }
    const o = p as Record<string, unknown>;
    if (o.v !== CREATE_DRAFT_VERSION) {
      return null;
    }
    return {
      v: CREATE_DRAFT_VERSION,
      content: typeof o.content === "string" ? o.content : "",
      tagsInput: typeof o.tagsInput === "string" ? o.tagsInput : "",
      sellThis: Boolean(o.sellThis),
      selectedProductId: typeof o.selectedProductId === "string" ? o.selectedProductId : "",
      audienceTarget:
        o.audienceTarget === "b2b" || o.audienceTarget === "b2c" || o.audienceTarget === "both"
          ? o.audienceTarget
          : "both",
      businessCategory: typeof o.businessCategory === "string" ? o.businessCategory : "",
      ctaLabel: typeof o.ctaLabel === "string" ? o.ctaLabel : "",
      ctaUrl: typeof o.ctaUrl === "string" ? o.ctaUrl : "",
      postType: typeof o.postType === "string" ? o.postType : "post",
      crossPostToInstagram: Boolean(o.crossPostToInstagram)
    };
  } catch {
    return null;
  }
}

function isDraftEmpty(d: CreatePostDraftV1): boolean {
  return (
    !d.content.trim() &&
    !d.tagsInput.trim() &&
    !d.sellThis &&
    !d.selectedProductId &&
    !d.businessCategory &&
    !d.ctaLabel.trim() &&
    !d.ctaUrl.trim() &&
    d.postType === "post" &&
    !d.crossPostToInstagram
  );
}

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

export type CreatePostComposerProps = {
  /** When true, reset the form and call onPublished instead of navigating to the new post */
  stayOnPage?: boolean;
  onPublished?: (postId: number) => void;
  variant?: "page" | "inline";
  /** Path to replace URL with after Instagram OAuth return */
  redirectPathAfterInstagram?: string;
  className?: string;
};

export function CreatePostComposer({
  stayOnPage = false,
  onPublished,
  variant = "page",
  redirectPathAfterInstagram,
  className = ""
}: CreatePostComposerProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const igRedirectPath = redirectPathAfterInstagram ?? (variant === "inline" ? "/account" : "/create");
  const fieldId = variant === "inline" ? "profile-create" : "create";

  const sessionQuery = useQuery({
    queryKey: ["create-post-composer-session", variant],
    queryFn: () => fetchSessionMe()
  });
  const profileQuery = useQuery({
    queryKey: ["create-post-composer-profile", variant],
    queryFn: () => apiRequest<MeProfile>("/users/me", { auth: true }),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const myProductsQuery = useQuery({
    queryKey: ["create-post-composer-products", variant],
    queryFn: () => fetchMyProducts(),
    enabled: Boolean(sessionQuery.data?.id)
  });
  const connectQuery = useQuery({
    queryKey: ["create-post-composer-connect", variant],
    queryFn: () => fetchConnectStatus(),
    enabled: Boolean(sessionQuery.data?.id)
  });

  const instagramQuery = useQuery({
    queryKey: ["instagram-status", variant],
    queryFn: () => fetchInstagramStatus(),
    retry: false
  });
  const igConnected = Boolean(instagramQuery.data?.connected);

  const [crossPostToInstagram, setCrossPostToInstagram] = useState(false);
  const [postType, setPostType] = useState("post");
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
  const [draftState, setDraftState] = useState<CreateDraftState>({ kind: "loading" });

  const userId = sessionQuery.data?.id;
  const draftStorageKey = userId ? `deenly-create-draft-${userId}` : null;

  useEffect(() => {
    if (!draftStorageKey || typeof window === "undefined") {
      setDraftState({ kind: "ready" });
      return;
    }
    const raw = localStorage.getItem(draftStorageKey);
    if (!raw) {
      setDraftState({ kind: "ready" });
      return;
    }
    const parsed = parseCreateDraft(raw);
    if (parsed && !isDraftEmpty(parsed)) {
      setDraftState({ kind: "offer", payload: parsed });
    } else {
      setDraftState({ kind: "ready" });
    }
  }, [draftStorageKey]);

  useEffect(() => {
    if (draftState.kind !== "ready" || !draftStorageKey || typeof window === "undefined") {
      return;
    }
    const payload: CreatePostDraftV1 = {
      v: CREATE_DRAFT_VERSION,
      content,
      tagsInput,
      sellThis,
      selectedProductId,
      audienceTarget,
      businessCategory,
      ctaLabel,
      ctaUrl,
      postType,
      crossPostToInstagram
    };
    if (isDraftEmpty(payload)) {
      return;
    }
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(draftStorageKey, JSON.stringify(payload));
      } catch {
        /* ignore quota */
      }
    }, 500);
    return () => window.clearTimeout(t);
  }, [
    draftState.kind,
    draftStorageKey,
    content,
    tagsInput,
    sellThis,
    selectedProductId,
    audienceTarget,
    businessCategory,
    ctaLabel,
    ctaUrl,
    postType,
    crossPostToInstagram
  ]);

  const disconnectInstagramMutation = useMutation({
    mutationFn: () => disconnectInstagram(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["instagram-status", variant] });
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
      window.history.replaceState({}, "", igRedirectPath);
      void queryClient.invalidateQueries({ queryKey: ["instagram-status", variant] });
    }
  }, [queryClient, igRedirectPath, variant]);

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

  useEffect(() => {
    if (sellThis) {
      setPostType("marketplace");
    }
  }, [sellThis]);

  useEffect(() => {
    if (!sellThis || !selectedProductId) {
      return;
    }
    const items = myProductsQuery.data?.items ?? [];
    const product = items.find((p) => String(p.id) === selectedProductId);
    if (!product) {
      return;
    }
    setAudienceTarget(product.audience_target ?? "both");
    setBusinessCategory(product.business_category ?? "");
  }, [sellThis, selectedProductId, myProductsQuery.data?.items]);

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

  function resetForm() {
    setContent("");
    setTagsInput("");
    setMediaFile(null);
    setSellThis(false);
    setSelectedProductId("");
    setAudienceTarget("both");
    setBusinessCategory("");
    setCtaLabel("");
    setCtaUrl("");
    setPostType("post");
    setCrossPostToInstagram(false);
    setError("");
  }

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
            /* background job may still run */
          }
        }
      }

      if (draftStorageKey && typeof window !== "undefined") {
        try {
          localStorage.removeItem(draftStorageKey);
        } catch {
          /* ignore */
        }
      }

      if (stayOnPage) {
        onPublished?.(post.id);
        resetForm();
      } else {
        router.push(`/posts/${post.id}`);
      }
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

  const mediaZoneClass =
    variant === "inline" ? "media-upload-zone min-h-[160px]" : "media-upload-zone min-h-[220px]";

  return (
    <form className={`section-stack ${className}`.trim()} onSubmit={onSubmit}>
      {draftState.kind === "offer" ? (
        <div
          className="flex flex-col gap-2 rounded-panel border border-black/15 bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <p className="text-sm text-text">Restore your unsaved draft from this device?</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary px-3 py-1.5 text-xs"
              onClick={() => {
                if (draftState.kind !== "offer") {
                  return;
                }
                const p = draftState.payload;
                setContent(p.content);
                setTagsInput(p.tagsInput);
                setSellThis(p.sellThis);
                setSelectedProductId(p.selectedProductId);
                setAudienceTarget(p.audienceTarget);
                setBusinessCategory(p.businessCategory);
                setCtaLabel(p.ctaLabel);
                setCtaUrl(p.ctaUrl);
                setPostType(p.postType);
                setCrossPostToInstagram(p.crossPostToInstagram);
                setDraftState({ kind: "ready" });
              }}
            >
              Restore
            </button>
            <button
              type="button"
              className="btn-secondary px-3 py-1.5 text-xs"
              onClick={() => {
                if (draftStorageKey && typeof window !== "undefined") {
                  localStorage.removeItem(draftStorageKey);
                }
                setDraftState({ kind: "ready" });
              }}
            >
              Discard
            </button>
          </div>
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Media</p>
        <input
          ref={mediaInputRef}
          id={`${fieldId}-media-file`}
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
          className={mediaZoneClass}
          aria-label="Add photo or video for this post"
          onClick={openMediaPicker}
          onKeyDown={onMediaZoneKeyDown}
        >
          {mediaPreviewUrl && previewKind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaPreviewUrl} alt="" className="max-h-[280px] w-full object-contain" />
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
            <img src={avatarUrl} alt="" className="h-10 w-10 rounded-full border border-black/10 object-cover" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white text-sm font-bold text-text">
              {composerName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <span className="truncate font-semibold text-text">{composerName}</span>
        </div>
        <label className="sr-only" htmlFor={`${fieldId}-caption`}>
          Post caption
        </label>
        <textarea
          id={`${fieldId}-caption`}
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
              id={`${fieldId}-promote-switch`}
            />
            <label
              htmlFor={`${fieldId}-promote-switch`}
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
            <div className="rounded-control border border-black/10 bg-surface px-3 py-2 text-xs text-muted">
              <p className="font-medium text-text">Payouts</p>
              {connectQuery.isLoading ? (
                <p className="mt-1">Checking Stripe Connect…</p>
              ) : connectQuery.error ? (
                <p className="mt-1">Could not load Connect status.</p>
              ) : (
                <p className="mt-1">
                  {connectQuery.data?.connected
                    ? "Stripe Connect: linked."
                    : "Connect your Stripe account in Creator hub to get paid."}{" "}
                  {connectQuery.data?.chargesEnabled
                    ? "Charges on."
                    : connectQuery.data?.connected
                      ? "Finish setup in Stripe if charges are still pending."
                      : null}{" "}
                  <Link
                    href="/account/creator?tab=payouts"
                    className="text-sky-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25"
                  >
                    Stripe Connect
                  </Link>
                </p>
              )}
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Choose product</p>
            <p className="text-xs text-muted">
              Products are created in{" "}
              <Link
                href="/account/creator?tab=products"
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
              <p className="text-xs text-muted">
                No products yet.{" "}
                <Link
                  href="/account/creator?tab=products"
                  className="font-medium text-sky-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25"
                >
                  Create a product
                </Link>{" "}
                in Creator hub first.
              </p>
            ) : null}

            <p className="text-xs text-muted">
              Audience and category load from the product; change below if this post should differ in the feed.
            </p>

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
          Link a Facebook Page with an Instagram Professional account here. Cross-post runs after you publish; media must
          be reachable over public HTTPS (CDN).
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
            disabled={sellThis}
          >
            <option value="post">Post</option>
            <option value="recitation">Recitation</option>
            <option value="marketplace">Marketplace</option>
          </select>
          {sellThis ? <p className="mt-1 text-xs text-muted">Promoted posts use the Marketplace type.</p> : null}
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
      {variant === "inline" ? (
        <p className="text-center text-xs text-muted">
          <Link href="/create" className="text-sky-600 underline-offset-2 hover:underline">
            Open full composer
          </Link>{" "}
          in a dedicated page if you prefer.
        </p>
      ) : null}
    </form>
  );
}
