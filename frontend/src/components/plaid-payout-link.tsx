"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePlaidLink } from "react-plaid-link";
import { ApiError } from "@/lib/api";
import {
  attachPlaidStripePayout,
  createPlaidLinkToken,
  exchangePlaidPublicToken,
  fetchPlaidStatus,
  type PlaidExchangeResponse
} from "@/lib/monetization";

type Props = {
  onAttached?: () => void;
};

/**
 * Plaid Link → exchange → attach bank token to Stripe Connect (seller payouts).
 * Hidden when Plaid is not configured (API returns configured: false).
 */
export function PlaidPayoutLinkSection({ onAttached }: Props) {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: ["plaid-status"],
    queryFn: () => fetchPlaidStatus()
  });
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [exchangeResult, setExchangeResult] = useState<PlaidExchangeResponse | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [message, setMessage] = useState<{ variant: "error" | "success"; text: string } | null>(null);

  const exchangeMutation = useMutation({
    mutationFn: (publicToken: string) => exchangePlaidPublicToken(publicToken),
    onSuccess: (data) => {
      setExchangeResult(data);
      const first = data.accounts[0]?.id || "";
      setSelectedAccountId(first);
      setMessage(null);
    },
    onError: (err: unknown) => {
      setMessage({
        variant: "error",
        text: err instanceof ApiError ? err.message : "Could not complete bank link."
      });
    }
  });

  const attachMutation = useMutation({
    mutationFn: (accountId: string) => attachPlaidStripePayout(accountId),
    onSuccess: async () => {
      setExchangeResult(null);
      setLinkToken(null);
      setMessage({ variant: "success", text: "Bank account attached for Stripe payouts." });
      await queryClient.invalidateQueries({ queryKey: ["plaid-status"] });
      await queryClient.invalidateQueries({ queryKey: ["account-monetization-connect"] });
      onAttached?.();
    },
    onError: (err: unknown) => {
      setMessage({
        variant: "error",
        text: err instanceof ApiError ? err.message : "Could not attach bank to Stripe."
      });
    }
  });

  const onPlaidSuccess = useCallback(
    (publicToken: string) => {
      exchangeMutation.mutate(publicToken);
    },
    [exchangeMutation]
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess
  });

  useEffect(() => {
    if (linkToken && ready) {
      open();
    }
  }, [linkToken, ready, open]);

  const startPlaid = async () => {
    setMessage(null);
    try {
      const { linkToken: next } = await createPlaidLinkToken();
      setLinkToken(next);
    } catch (err: unknown) {
      setMessage({
        variant: "error",
        text: err instanceof ApiError ? err.message : "Could not start Plaid."
      });
    }
  };

  if (statusQuery.isLoading || !statusQuery.data?.configured) {
    return null;
  }

  const linked = Boolean(statusQuery.data.linked);

  return (
    <div className="mt-4 rounded-control border border-black/10 bg-surface px-3 py-3 text-xs">
      <p className="font-semibold text-text">Bank via Plaid (US)</p>
      <p className="mt-1 text-muted">
        Link a checking account through Plaid, then attach it to your Stripe Connect payout profile for ACH
        payouts. You still complete Stripe identity onboarding separately.
      </p>
      {linked ? (
        <p className="mt-2 text-text">
          Plaid linked{statusQuery.data.institutionName ? ` · ${statusQuery.data.institutionName}` : ""}. You can
          re-link to refresh.
        </p>
      ) : null}
      {message ? (
        <p className={`mt-2 ${message.variant === "error" ? "text-red-600" : "text-emerald-700"}`}>{message.text}</p>
      ) : null}
      {!exchangeResult ? (
        <button type="button" className="btn-secondary mt-2 px-3 py-1.5 text-xs" onClick={() => void startPlaid()}>
          {linked ? "Re-link bank with Plaid" : "Link bank with Plaid"}
        </button>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-muted">Choose the account for payouts:</p>
          <select
            className="input bg-white py-1 text-xs"
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            aria-label="Plaid account for payouts"
          >
            {exchangeResult.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {(a.name || "Account") + (a.mask ? ` ·•••${a.mask}` : "")}
                {a.subtype ? ` (${a.subtype})` : ""}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary px-3 py-1.5 text-xs"
              disabled={!selectedAccountId || attachMutation.isPending}
              onClick={() => attachMutation.mutate(selectedAccountId)}
            >
              {attachMutation.isPending ? "Attaching…" : "Attach to Stripe payouts"}
            </button>
            <button
              type="button"
              className="btn-secondary px-3 py-1.5 text-xs"
              onClick={() => {
                setExchangeResult(null);
                setLinkToken(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
