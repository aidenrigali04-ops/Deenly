"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSessionMe } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { ErrorState, LoadingState } from "@/components/states";
import { useReferralShareRecordedMutation, useReferralsMeQuery } from "@/hooks/use-referrals-me";

function attributionHeadline(status: string): string {
  switch (status) {
    case "pending_purchase":
      return "Waiting for your first qualifying purchase";
    case "pending_clear":
      return "Reward pending — clearing period";
    case "qualified":
      return "Referral completed";
    case "rejected":
      return "Not eligible";
    case "voided":
      return "Voided";
    case "expired":
      return "Expired";
    default:
      return status.replace(/_/g, " ");
  }
}

export default function AccountReferralsPage() {
  const sessionQuery = useQuery({
    queryKey: ["account-referrals-session-me"],
    queryFn: () => fetchSessionMe()
  });
  const signedIn = Boolean(sessionQuery.data?.id);
  const referralsQuery = useReferralsMeQuery(signedIn);
  const shareMutation = useReferralShareRecordedMutation();
  const [copyHint, setCopyHint] = useState("");

  const shareUrl = referralsQuery.data?.code?.suggestedShareUrl ?? "";

  const recordShare = useCallback(
    async (surface: string) => {
      try {
        await shareMutation.mutateAsync(surface);
      } catch {
        /* analytics best-effort */
      }
    },
    [shareMutation]
  );

  const handleCopyLink = useCallback(async () => {
    if (!shareUrl || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setCopyHint("Copy is not available in this browser.");
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyHint("Link copied.");
      void recordShare("copy_link");
    } catch {
      setCopyHint("Could not copy. Select the link manually.");
    }
  }, [recordShare, shareUrl]);

  const handleNativeShare = useCallback(async () => {
    if (!shareUrl) return;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Join me on Deenly", text: "Sign up with my referral link.", url: shareUrl });
        void recordShare("native_share");
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          return;
        }
      }
    }
    await handleCopyLink();
  }, [handleCopyLink, recordShare, shareUrl]);

  if (sessionQuery.isLoading) {
    return <LoadingState label="Loading…" />;
  }
  if (sessionQuery.error || !sessionQuery.data) {
    return <ErrorState message="Sign in to view referrals." />;
  }

  const refErr = referralsQuery.error;
  if (refErr instanceof ApiError && refErr.status === 404) {
    return (
      <div className="page-stack mx-auto w-full max-w-2xl">
        <header className="page-header">
          <p className="text-sm text-muted">
            <Link href="/account/settings" className="text-sky-600 hover:underline">
              Back to settings
            </Link>
          </p>
          <h1 className="page-header-title mt-4">Referrals</h1>
        </header>
        <ErrorState message="Referrals are not enabled on this server." />
      </div>
    );
  }
  if (referralsQuery.isLoading) {
    return <LoadingState label="Loading referrals…" />;
  }
  if (referralsQuery.error) {
    return (
      <ErrorState
        message={(referralsQuery.error as Error).message}
        onRetry={() => {
          void referralsQuery.refetch();
        }}
      />
    );
  }

  const data = referralsQuery.data;
  if (!data) {
    return <ErrorState message="Could not load referrals." />;
  }

  const code = data.code;

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
          <Link href="/account/rewards" className="text-sky-600 hover:underline">
            Rewards wallet
          </Link>
        </p>
        <h1 className="page-header-title mt-4 text-xl sm:text-2xl">Referrals</h1>
        <p className="page-header-subtitle text-xs sm:text-sm">
          Share your code with friends. Rewards follow program rules when referrals qualify.
        </p>
      </header>

      <div className="surface-card px-4 py-5 sm:px-6">
        <h2 className="text-sm font-semibold text-text">Your code</h2>
        {code ? (
          <>
            <p className="mt-3 font-mono text-lg font-semibold tracking-wide text-text">{code.code}</p>
            <p className="mt-2 text-xs text-muted">
              Status: {code.status} · Signups attributed: {code.attributableSignupsCount} · Cap:{" "}
              {code.maxRedemptions}
            </p>
            {shareUrl ? (
              <div className="mt-4 space-y-2">
                <p className="break-all text-sm text-muted">{shareUrl}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-primary px-4 py-2 text-sm" onClick={() => void handleCopyLink()}>
                    Copy link
                  </button>
                  {typeof navigator !== "undefined" && typeof navigator.share === "function" ? (
                    <button
                      type="button"
                      className="btn-secondary px-4 py-2 text-sm"
                      onClick={() => void handleNativeShare()}
                    >
                      Share…
                    </button>
                  ) : null}
                </div>
                {copyHint ? <p className="text-xs text-muted">{copyHint}</p> : null}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">A share link will appear when the app URL is configured.</p>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm text-muted">No referral code is available for your account yet.</p>
        )}
      </div>

      <div className="surface-card px-4 py-5 sm:px-6">
        <h2 className="text-sm font-semibold text-text">Your progress as a referrer</h2>
        <p className="mt-2 text-sm text-muted">
          Qualified referrals:{" "}
          <span className="font-semibold text-text">{data.qualifiedReferralsCount}</span>
        </p>
      </div>

      {data.attributionAsReferee ? (
        <div className="surface-card px-4 py-5 sm:px-6">
          <h2 className="text-sm font-semibold text-text">Someone invited you</h2>
          <p className="mt-2 text-sm font-medium text-text">{attributionHeadline(data.attributionAsReferee.status)}</p>
          <p className="mt-1 text-xs text-muted">
            Updated {new Date(data.attributionAsReferee.attributedAt).toLocaleString()}
          </p>
        </div>
      ) : null}
    </div>
  );
}
