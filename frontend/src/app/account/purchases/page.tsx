"use client";

import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchSessionMe } from "@/lib/auth";
import {
  fetchMyPurchases,
  formatMinorCurrency,
  requestProductDownloadLink,
  type MyPurchaseRow
} from "@/lib/monetization";
import { ErrorState, LoadingState } from "@/components/states";

function purchaseLabel(row: MyPurchaseRow): string {
  if (row.kind === "support") return "Support";
  if (row.kind === "subscription") {
    return row.tier_title ? `${row.tier_title} (membership)` : "Membership";
  }
  return row.product_title || "Product";
}

export default function AccountPurchasesPage() {
  const sessionQuery = useQuery({
    queryKey: ["account-purchases-session-me"],
    queryFn: () => fetchSessionMe()
  });
  const purchasesQuery = useQuery({
    queryKey: ["monetization-purchases-me"],
    queryFn: () => fetchMyPurchases({ limit: 50 }),
    enabled: Boolean(sessionQuery.data?.id)
  });

  const downloadMutation = useMutation({
    mutationFn: (productId: number) => requestProductDownloadLink(productId),
    onSuccess: (data) => {
      if (data.downloadUrl && typeof window !== "undefined") {
        window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
      }
    }
  });

  if (sessionQuery.isLoading || purchasesQuery.isLoading) {
    return <LoadingState label="Loading purchases..." />;
  }
  if (sessionQuery.error || !sessionQuery.data) {
    return <ErrorState message="Sign in to view your purchases." />;
  }
  if (purchasesQuery.error) {
    return <ErrorState message={(purchasesQuery.error as Error).message} onRetry={purchasesQuery.refetch} />;
  }

  const items = purchasesQuery.data?.items ?? [];

  return (
    <div className="page-stack mx-auto w-full max-w-2xl">
      <header className="page-header">
        <p className="text-sm text-muted">
          <Link
            href="/account"
            className="rounded-sm text-sky-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Back to profile
          </Link>
        </p>
        <h1 className="page-header-title mt-4 text-xl sm:text-2xl">Purchases</h1>
        <p className="page-header-subtitle text-xs sm:text-sm">
          Orders you&apos;ve completed. Open a seller&apos;s profile or message them anytime.{" "}
          <Link href="/account/payments" className="text-sky-600 underline-offset-2 hover:underline">
            How checkout works
          </Link>
        </p>
      </header>

      <div className="surface-card px-4 py-5 sm:px-6">
        {items.length === 0 ? (
          <p className="text-sm text-muted">
            No purchases yet. When you buy a product, tip a creator, or subscribe, it will show up here.
          </p>
        ) : (
          <ul className="divide-y divide-black/10">
            {items.map((row) => {
              const canDownload =
                row.kind === "product" &&
                row.status === "completed" &&
                row.product_type === "digital" &&
                row.product_id != null;
              return (
                <li key={row.order_id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-text">{purchaseLabel(row)}</p>
                    <p className="mt-1 text-sm text-muted">
                      {formatMinorCurrency(row.amount_minor, row.currency)} ·{" "}
                      {new Date(row.created_at).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short"
                      })}
                    </p>
                    <p className="mt-1 text-sm">
                      <span className="text-muted">From </span>
                      <Link
                        href={`/users/${row.seller_user_id}`}
                        className="text-sky-700 underline decoration-sky-700/30 underline-offset-2 hover:text-sky-800"
                      >
                        @{row.seller_username}
                      </Link>
                      <span className="text-muted"> · {row.seller_display_name}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canDownload ? (
                      <button
                        type="button"
                        className="btn-primary text-sm"
                        disabled={downloadMutation.isPending}
                        onClick={() => {
                          if (row.product_id != null) {
                            downloadMutation.mutate(row.product_id);
                          }
                        }}
                      >
                        {downloadMutation.isPending ? "…" : "Download"}
                      </button>
                    ) : null}
                    <Link
                      href={`/messages?with=${row.seller_user_id}`}
                      className="btn-secondary text-sm no-underline"
                    >
                      Message seller
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
