"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSessionMe } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import type { RewardsLedgerEntryDto } from "@deenly/rewards";
import { ErrorState, LoadingState } from "@/components/states";
import { useRewardsLedgerInfiniteQuery, useRewardsWalletMeQuery } from "@/hooks/use-rewards-wallet";

function formatPointsDisplay(raw: string): string {
  try {
    return BigInt(raw).toLocaleString("en-US");
  } catch {
    return raw;
  }
}

function formatLedgerWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function deltaTone(deltaPoints: string): "earn" | "spend" | "neutral" {
  try {
    const n = BigInt(deltaPoints);
    const zero = BigInt(0);
    if (n > zero) return "earn";
    if (n < zero) return "spend";
  } catch {
    /* ignore */
  }
  return "neutral";
}

function LedgerRow({ row }: { row: RewardsLedgerEntryDto }) {
  const tone = deltaTone(row.deltaPoints);
  const deltaClass =
    tone === "earn"
      ? "text-emerald-800"
      : tone === "spend"
        ? "text-rose-800"
        : "text-text";
  const prefix = tone === "earn" ? "+" : "";
  const toneBg =
    tone === "earn" ? "bg-emerald-500/90" : tone === "spend" ? "bg-rose-500/90" : "bg-black/20";
  return (
    <li className="rounded-control border border-transparent px-3 py-3 transition hover:border-black/[0.06] hover:bg-black/[0.02]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`mt-1.5 h-2 w-2 shrink-0 rounded-pill ${toneBg}`}
            aria-hidden
            title={row.entryKind}
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-text">
              <span className="text-muted">{row.entryKind}</span>
              {row.reason ? (
                <>
                  <span className="text-muted"> · </span>
                  <span>{row.reason}</span>
                </>
              ) : null}
            </p>
            <p className="mt-1 text-xs text-muted">{formatLedgerWhen(row.createdAt)}</p>
          </div>
        </div>
        <span className={`shrink-0 text-right text-base font-semibold tabular-nums tracking-tight ${deltaClass}`}>
          {prefix}
          {formatPointsDisplay(row.deltaPoints)}
        </span>
      </div>
    </li>
  );
}

export default function AccountRewardsPage() {
  const sessionQuery = useQuery({
    queryKey: ["account-rewards-session-me"],
    queryFn: () => fetchSessionMe()
  });
  const signedIn = Boolean(sessionQuery.data?.id);
  const walletQuery = useRewardsWalletMeQuery(signedIn);
  const ledgerInfinite = useRewardsLedgerInfiniteQuery(signedIn);

  const ledgerRows = useMemo(
    () => ledgerInfinite.data?.pages.flatMap((p) => [...p.items]) ?? [],
    [ledgerInfinite.data?.pages]
  );

  if (sessionQuery.isLoading) {
    return <LoadingState label="Loading…" />;
  }
  if (sessionQuery.error || !sessionQuery.data) {
    return <ErrorState message="Sign in to view your rewards." />;
  }

  const walletErr = walletQuery.error;
  if (walletErr instanceof ApiError && walletErr.status === 404) {
    return (
      <div className="page-stack mx-auto w-full max-w-2xl">
        <header className="page-header">
          <p className="text-sm text-muted">
            <Link href="/account/settings" className="text-sky-600 hover:underline">
              Back to settings
            </Link>
          </p>
          <h1 className="page-header-title mt-4">Rewards</h1>
        </header>
        <ErrorState message="Rewards are not available on this server yet." />
      </div>
    );
  }
  if (walletQuery.isLoading) {
    return <LoadingState label="Loading rewards…" />;
  }
  if (walletQuery.error) {
    return (
      <ErrorState
        message={(walletQuery.error as Error).message}
        onRetry={() => {
          void walletQuery.refetch();
        }}
      />
    );
  }

  const wallet = walletQuery.data;
  if (!wallet) {
    return <ErrorState message="Could not load rewards." />;
  }

  const ledgerError = ledgerInfinite.error;
  const ledgerIs404 = ledgerError instanceof ApiError && ledgerError.status === 404;
  const showLedgerError = Boolean(ledgerError) && !ledgerIs404;

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
          {" · "}
          <Link href="/account/referrals" className="text-sky-600 hover:underline">
            Referrals
          </Link>
        </p>
        <h1 className="page-header-title mt-4 text-xl sm:text-2xl">Rewards</h1>
        <p className="page-header-subtitle text-xs sm:text-sm">
          Points balance and activity. Eligible products may let you earn or redeem at checkout.
        </p>
      </header>

      <div className="surface-card overflow-hidden p-0 shadow-soft">
        <div className="h-1 bg-gradient-to-r from-sky-500 via-violet-500 to-emerald-500 opacity-[0.85]" aria-hidden />
        <div className="grid gap-6 px-4 py-5 sm:grid-cols-[1fr_auto] sm:items-end sm:px-6 sm:py-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Available balance</p>
            <p className="mt-2 text-4xl font-semibold tabular-nums tracking-tight text-text sm:text-[2.75rem]">
              {formatPointsDisplay(wallet.balancePoints)}
            </p>
            <p className="mt-1 text-sm font-medium text-muted">{wallet.currencyCode}</p>
          </div>
          <div className="rounded-control border border-black/[0.06] bg-black/[0.02] px-4 py-3 sm:min-w-[200px]">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Last redemption</p>
            {wallet.lastCatalogCheckoutRedemptionAt ? (
              <p className="mt-2 text-sm font-medium leading-snug text-text">
                {formatLedgerWhen(wallet.lastCatalogCheckoutRedemptionAt)}
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted">None yet</p>
            )}
          </div>
        </div>
      </div>

      <div className="surface-card px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-sm font-semibold text-text">Activity</h2>
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Ledger</span>
        </div>
        {ledgerInfinite.isLoading ? <p className="mt-3 text-sm text-muted">Loading history…</p> : null}
        {showLedgerError ? (
          <p className="mt-3 text-sm text-rose-700">{(ledgerError as Error).message}</p>
        ) : null}
        {ledgerIs404 ? (
          <p className="mt-3 text-sm text-muted">History is not available on this server.</p>
        ) : null}
        {!ledgerInfinite.isLoading && !showLedgerError && !ledgerIs404 && ledgerRows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No ledger entries yet.</p>
        ) : null}
        {ledgerRows.length > 0 ? (
          <ul className="mt-4 space-y-1 rounded-panel border border-black/[0.06] bg-surface/60 p-2">
            {ledgerRows.map((row) => (
              <LedgerRow key={row.id} row={row} />
            ))}
          </ul>
        ) : null}
        {ledgerInfinite.hasNextPage ? (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              className="btn-secondary px-4 py-2 text-sm"
              disabled={ledgerInfinite.isFetchingNextPage}
              onClick={() => void ledgerInfinite.fetchNextPage()}
            >
              {ledgerInfinite.isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
