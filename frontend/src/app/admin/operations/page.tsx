"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError, apiRequest } from "@/lib/api";

export default function AdminOperationsPage() {
  const [inviteEmail, setInviteEmail] = useState("");
  const [maxUses, setMaxUses] = useState("1");
  const [ticketId, setTicketId] = useState("");
  const [status, setStatus] = useState("in_progress");
  const [priority, setPriority] = useState("normal");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const inviteMutation = useMutation({
    mutationFn: () =>
      apiRequest("/admin/invites", {
        method: "POST",
        auth: true,
        body: { email: inviteEmail || null, maxUses: Number(maxUses) }
      }),
    onSuccess: (data: any) => setMessage(`Invite created: ${data.code}`),
    onError: (mutationError) => {
      const detail =
        mutationError instanceof ApiError
          ? mutationError.message
          : "Unable to create invite";
      setError(detail);
    }
  });

  const supportMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/admin/support/${ticketId}`, {
        method: "POST",
        auth: true,
        body: { status, priority }
      }),
    onSuccess: () => setMessage("Support ticket updated."),
    onError: (mutationError) => {
      const detail =
        mutationError instanceof ApiError
          ? mutationError.message
          : "Unable to update support ticket";
      setError(detail);
    }
  });
  const monetizationSummaryQuery = useQuery({
    queryKey: ["admin-monetization-summary"],
    queryFn: () => apiRequest("/admin/monetization/summary", { auth: true })
  });

  const submitInvite = (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");
    inviteMutation.mutate();
  };
  const submitSupport = (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");
    supportMutation.mutate();
  };

  return (
    <section className="space-y-4">
      <header className="surface-card">
        <h1 className="section-title">Operations Console</h1>
        <p className="mt-1 text-sm text-muted">
          Create beta invites and triage support tickets with clear operational states.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
      <form className="surface-card space-y-2" onSubmit={submitInvite}>
        <h1 className="text-lg font-semibold">Create Beta Invite</h1>
        <input className="input" aria-label="Invite email" type="email" placeholder="Optional email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
        <input className="input" aria-label="Invite max uses" type="number" min={1} max={1000} value={maxUses} onChange={(event) => setMaxUses(event.target.value)} />
        <button className="btn-primary" type="submit" disabled={inviteMutation.isPending}>
          {inviteMutation.isPending ? "Creating..." : "Create invite"}
        </button>
      </form>
      <form className="surface-card space-y-2" onSubmit={submitSupport}>
        <h2 className="text-lg font-semibold">Support Triage</h2>
        <input className="input" aria-label="Support ticket ID" placeholder="Ticket ID" value={ticketId} onChange={(event) => setTicketId(event.target.value)} required />
        <select className="input" aria-label="Support ticket status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select className="input" aria-label="Support ticket priority" value={priority} onChange={(event) => setPriority(event.target.value)}>
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
        <button className="btn-primary" type="submit" disabled={supportMutation.isPending}>
          {supportMutation.isPending ? "Updating..." : "Update ticket"}
        </button>
      </form>
      </div>
      <section className="surface-card space-y-2">
        <h2 className="text-lg font-semibold">Monetization telemetry</h2>
        {monetizationSummaryQuery.isLoading ? (
          <p className="text-sm text-muted">Loading monetization metrics...</p>
        ) : monetizationSummaryQuery.error ? (
          <p className="text-sm text-rose-300">
            {(monetizationSummaryQuery.error as Error).message}
          </p>
        ) : (
          <div className="grid gap-2 text-sm md:grid-cols-3">
            <p>Gross volume: {(monetizationSummaryQuery.data as any)?.totals?.gross_volume_minor ?? 0}</p>
            <p>Platform fees: {(monetizationSummaryQuery.data as any)?.totals?.total_platform_fees_minor ?? 0}</p>
            <p>Product orders: {(monetizationSummaryQuery.data as any)?.totals?.product_orders_count ?? 0}</p>
            <p>Support orders: {(monetizationSummaryQuery.data as any)?.totals?.support_orders_count ?? 0}</p>
            <p>Subscription orders: {(monetizationSummaryQuery.data as any)?.totals?.subscription_orders_count ?? 0}</p>
            <p>Active subscriptions: {(monetizationSummaryQuery.data as any)?.subscriptions?.active_count ?? 0}</p>
            <p>Canceled subscriptions: {(monetizationSummaryQuery.data as any)?.subscriptions?.canceled_count ?? 0}</p>
            <p>Past due subscriptions: {(monetizationSummaryQuery.data as any)?.subscriptions?.past_due_count ?? 0}</p>
            <p>Affiliate conversions: {(monetizationSummaryQuery.data as any)?.affiliates?.conversions_count ?? 0}</p>
          </div>
        )}
      </section>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {message ? <p className="text-sm text-accent">{message}</p> : null}
    </section>
  );
}
