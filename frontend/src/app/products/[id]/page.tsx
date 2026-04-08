"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { ProductCheckoutPanel } from "@/components/payment/product-checkout-panel";
import { resolveMediaUrl } from "@/lib/media-url";
import { fetchPublicProduct, formatMinorCurrency, type PublicCatalogProduct } from "@/lib/monetization";
import { useSessionStore } from "@/store/session-store";
import { ApiError, apiRequest } from "@/lib/api";

function productTypeLabel(t: PublicCatalogProduct["product_type"]) {
  if (t === "digital") return "Digital";
  if (t === "service") return "Service";
  return "Subscription";
}

export default function PublicProductPage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const productId = Number(params.id);
  const sessionUser = useSessionStore((state) => state.user);
  const loginNext = encodeURIComponent(pathname || `/products/${productId}`);
  const [archiveError, setArchiveError] = useState("");

  const productQuery = useQuery({
    queryKey: ["public-product", productId],
    queryFn: () => fetchPublicProduct(productId),
    enabled: Number.isFinite(productId) && productId > 0
  });

  const archiveProductMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/monetization/products/${productId}`, {
        method: "PATCH",
        auth: true,
        body: { status: "archived" }
      }),
    onMutate: () => {
      setArchiveError("");
    },
    onSuccess: async () => {
      const row = queryClient.getQueryData<PublicCatalogProduct>(["public-product", productId]);
      const creatorId = row?.creator_user_id;
      await queryClient.invalidateQueries({ queryKey: ["public-product", productId] });
      await queryClient.invalidateQueries({ queryKey: ["account-monetization-products"] });
      if (creatorId != null) {
        await queryClient.invalidateQueries({ queryKey: ["creator-products-public", creatorId] });
      }
      router.push("/account/creator?tab=products");
    },
    onError: (error) => {
      setArchiveError(error instanceof ApiError ? error.message : "Could not archive listing.");
    }
  });

  if (!Number.isFinite(productId) || productId <= 0) {
    return <ErrorState message="Invalid product." />;
  }
  if (productQuery.isLoading) {
    return <LoadingState label="Loading product…" />;
  }
  if (productQuery.error) {
    return <ErrorState message={(productQuery.error as Error).message} onRetry={productQuery.refetch} />;
  }
  if (!productQuery.data) {
    return <EmptyState title="Product not found" />;
  }

  const p = productQuery.data;
  const avatarUrl = resolveMediaUrl(p.creator_avatar_url);
  const creatorName = p.creator_display_name?.trim() || p.creator_username || "Creator";
  const isOwner = sessionUser?.id === p.creator_user_id;

  const scrollToFullOffer = () => {
    if (typeof document === "undefined") return;
    document.getElementById("offer-details")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="page-stack mx-auto w-full max-w-3xl">
      <header className="page-header">
        <p className="text-sm text-muted">
          <Link href={`/users/${p.creator_user_id}`} className="text-sky-600 underline-offset-2 hover:underline">
            ← Back to {creatorName}
          </Link>
        </p>
        <h1 className="page-header-title mt-4">{p.title}</h1>
        <p className="page-header-subtitle mt-2">
          {formatMinorCurrency(p.price_minor, p.currency)} · {productTypeLabel(p.product_type)}
          {p.business_category ? ` · ${p.business_category.replace(/_/g, " ")}` : ""}
        </p>
      </header>

      <article className="surface-card section-stack px-6 py-6">
        <div className="flex flex-wrap items-center gap-3 border-b border-black/10 pb-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-black/10 bg-surface text-sm font-semibold">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              creatorName.slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text">{creatorName}</p>
            {p.creator_username ? (
              <p className="text-xs text-muted">@{p.creator_username}</p>
            ) : null}
            <Link href={`/users/${p.creator_user_id}`} className="text-xs text-sky-600 hover:underline">
              View profile
            </Link>
          </div>
        </div>

        {isOwner ? (
          <div className="mt-6 flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <Link href="/account/creator?tab=products" className="btn-secondary inline-flex px-4 py-2 text-sm">
                Manage in Creator hub
              </Link>
              {p.status === "published" ? (
                <button
                  type="button"
                  className="inline-flex border border-red-600 bg-surface px-4 py-2 text-sm font-semibold text-red-600 dark:border-red-500 dark:text-red-400"
                  disabled={archiveProductMutation.isPending}
                  onClick={() => {
                    if (
                      typeof window !== "undefined" &&
                      window.confirm(
                        "Archive this listing? Buyers will no longer see it in your catalog. You can republish from Creator hub."
                      )
                    ) {
                      archiveProductMutation.mutate();
                    }
                  }}
                >
                  {archiveProductMutation.isPending ? "Archiving…" : "Archive listing"}
                </button>
              ) : null}
            </div>
            {archiveError ? <p className="text-xs text-red-600 dark:text-red-400">{archiveError}</p> : null}
          </div>
        ) : (
          <ProductCheckoutPanel
            productId={productId}
            title={p.title}
            priceMinor={p.price_minor}
            currency={p.currency}
            productType={p.product_type}
            websiteUrl={p.website_url ?? null}
            loginNextEncoded={loginNext}
            onScrollToOffer={scrollToFullOffer}
          />
        )}

        <div id="offer-details" className="scroll-mt-24 space-y-6 border-t border-black/10 pt-8">
          <section>
            <h2 className="section-title text-sm">Full offer</h2>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">About this offer</h3>
            {p.description ? (
              <p className="mt-2 whitespace-pre-line text-sm text-text/90">{p.description}</p>
            ) : (
              <p className="mt-2 text-sm text-muted">No description provided.</p>
            )}
          </section>

          {p.service_details ? (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">What you get</h3>
              <p className="mt-2 whitespace-pre-line text-sm text-text/90">{p.service_details}</p>
            </section>
          ) : null}

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Delivery</h3>
            <p className="mt-2 text-sm text-muted">
              {p.delivery_method?.trim() || "Details are confirmed after checkout where applicable."}
            </p>
          </section>

          {p.website_url ? (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">More info</h3>
              <a
                href={p.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm text-sky-600 hover:underline"
              >
                Visit website
              </a>
            </section>
          ) : null}

          <p className="border-t border-black/10 pt-4 text-xs text-muted">
            Purchases are processed by our payment partner. See{" "}
            <Link href="/terms" className="text-sky-700 underline-offset-2 hover:underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-sky-700 underline-offset-2 hover:underline">
              Privacy
            </Link>
            .
          </p>
        </div>
      </article>
    </div>
  );
}
