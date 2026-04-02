"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { claimPurchaseAttach, fetchPurchaseAccess } from "@/lib/monetization";
import { useSessionStore } from "@/store/session-store";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000/api/v1";

function PurchaseAccessContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const sessionUser = useSessionStore((state) => state.user);
  const [claimMsg, setClaimMsg] = useState("");

  const accessQuery = useQuery({
    queryKey: ["purchase-access", token],
    queryFn: () => fetchPurchaseAccess(token),
    enabled: token.length >= 20,
    retry: false
  });

  const claimMutation = useMutation({
    mutationFn: () => claimPurchaseAttach(token),
    onSuccess: (r) => {
      setClaimMsg(r.alreadyYours ? "Already saved to your account." : "Saved to your Deenly account.");
    },
    onError: (e) => {
      setClaimMsg(e instanceof ApiError ? e.message : "Could not save to account.");
    }
  });

  if (!token || token.length < 20) {
    return (
      <div className="page-stack mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-lg font-semibold text-text">Missing access link</h1>
        <p className="mt-2 text-sm text-muted">Open the link from your email or text message.</p>
        <Link href="/feed" className="btn-primary mt-6 inline-flex px-4 py-2 text-sm">
          Home
        </Link>
      </div>
    );
  }

  if (accessQuery.isLoading) {
    return (
      <div className="page-stack mx-auto max-w-md px-4 py-16 text-center text-sm text-muted">Loading…</div>
    );
  }

  if (accessQuery.error) {
    return (
      <div className="page-stack mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-lg font-semibold text-text">Could not load access</h1>
        <p className="mt-2 text-sm text-muted">{(accessQuery.error as Error).message}</p>
        <Link href="/feed" className="btn-secondary mt-6 inline-flex px-4 py-2 text-sm">
          Home
        </Link>
      </div>
    );
  }

  const data = accessQuery.data;
  if (!data) {
    return null;
  }

  const downloadHref = `${API_BASE}/monetization/purchase/download?token=${encodeURIComponent(token)}`;

  return (
    <div className="page-stack mx-auto max-w-md px-4 py-12">
      <h1 className="text-xl font-semibold text-text">Your purchase</h1>
      <p className="mt-2 text-sm text-muted">Thank you. Here is what you unlocked.</p>
      <div className="surface-card mt-6 space-y-3 rounded-control border border-black/10 px-5 py-4">
        <p className="text-sm font-semibold text-text">{data.title}</p>
        <p className="text-xs uppercase tracking-wide text-muted">{data.productType}</p>
        {data.websiteUrl ? (
          <a
            href={data.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary inline-flex px-3 py-2 text-sm"
          >
            Open service link
          </a>
        ) : null}
        {data.hasDigitalDelivery ? (
          <a href={downloadHref} className="btn-primary inline-flex px-3 py-2 text-sm">
            Download / open file
          </a>
        ) : null}
        {!data.hasDigitalDelivery && !data.websiteUrl ? (
          <p className="text-sm text-muted">No digital file or URL on this listing. Contact the creator if you need help.</p>
        ) : null}
      </div>

      {sessionUser ? (
        <div className="mt-6 space-y-2">
          <button
            type="button"
            className="btn-secondary px-3 py-2 text-sm"
            disabled={claimMutation.isPending}
            onClick={() => claimMutation.mutate()}
          >
            {claimMutation.isPending ? "Saving…" : "Save to my Deenly account"}
          </button>
          {claimMsg ? <p className="text-xs text-muted">{claimMsg}</p> : null}
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted">
          <Link href="/auth/login" className="text-sky-600 hover:underline">
            Log in
          </Link>{" "}
          to save this purchase to your account for later.
        </p>
      )}

      <Link href="/feed" className="btn-secondary mt-8 inline-flex px-4 py-2 text-sm">
        Back to feed
      </Link>
    </div>
  );
}

export default function PurchaseAccessPage() {
  return (
    <Suspense
      fallback={
        <div className="page-stack mx-auto max-w-md px-4 py-16 text-center text-sm text-muted">Loading…</div>
      }
    >
      <PurchaseAccessContent />
    </Suspense>
  );
}
