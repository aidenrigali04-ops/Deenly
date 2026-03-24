"use client";

import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ApiError, apiRequest } from "@/lib/api";

export default function AdminModerationPage() {
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const [restrictionType, setRestrictionType] = useState("posting_suspended");
  const [appealId, setAppealId] = useState("");
  const [appealStatus, setAppealStatus] = useState("reviewing");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const warnMutation = useMutation({
    mutationFn: () =>
      apiRequest("/admin/warnings", {
        method: "POST",
        auth: true,
        body: { userId: Number(userId), reason }
      }),
    onSuccess: () => setMessage("Warning issued."),
    onError: (mutationError) => {
      const detail =
        mutationError instanceof ApiError
          ? mutationError.message
          : "Unable to issue warning";
      setError(detail);
    }
  });

  const restrictionMutation = useMutation({
    mutationFn: () =>
      apiRequest("/admin/restrictions", {
        method: "POST",
        auth: true,
        body: { userId: Number(userId), restrictionType, reason }
      }),
    onSuccess: () => setMessage("Restriction applied."),
    onError: (mutationError) => {
      const detail =
        mutationError instanceof ApiError
          ? mutationError.message
          : "Unable to apply restriction";
      setError(detail);
    }
  });

  const appealMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/admin/appeals/${appealId}/review`, {
        method: "POST",
        auth: true,
        body: { status: appealStatus }
      }),
    onSuccess: () => setMessage("Appeal reviewed."),
    onError: (mutationError) => {
      const detail =
        mutationError instanceof ApiError
          ? mutationError.message
          : "Unable to review appeal";
      setError(detail);
    }
  });

  const submitWarning = (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");
    warnMutation.mutate();
  };
  const submitRestriction = (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");
    restrictionMutation.mutate();
  };
  const submitAppealReview = (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");
    appealMutation.mutate();
  };

  return (
    <section className="space-y-4">
      <header className="surface-card">
        <h1 className="section-title">Moderation Actions</h1>
        <p className="mt-1 text-sm text-muted">
          Issue warnings, apply restrictions, and review appeals with clear status updates.
        </p>
      </header>
      <div className="grid gap-4 lg:grid-cols-3">
      <form className="surface-card space-y-2" onSubmit={submitWarning}>
        <h1 className="text-lg font-semibold">Issue Warning</h1>
        <input className="input" aria-label="Warning user ID" placeholder="User ID" value={userId} onChange={(event) => setUserId(event.target.value)} required />
        <input className="input" aria-label="Warning reason" placeholder="Reason" value={reason} onChange={(event) => setReason(event.target.value)} required />
        <button className="btn-primary" type="submit" disabled={warnMutation.isPending}>
          {warnMutation.isPending ? "Sending..." : "Send warning"}
        </button>
      </form>
      <form className="surface-card space-y-2" onSubmit={submitRestriction}>
        <h2 className="text-lg font-semibold">Apply Restriction</h2>
        <input className="input" aria-label="Restriction user ID" placeholder="User ID" value={userId} onChange={(event) => setUserId(event.target.value)} required />
        <select className="input" aria-label="Restriction type" value={restrictionType} onChange={(event) => setRestrictionType(event.target.value)}>
          <option value="posting_suspended">Posting suspended</option>
          <option value="comment_suspended">Comment suspended</option>
          <option value="account_suspended">Account suspended</option>
        </select>
        <input className="input" aria-label="Restriction reason" placeholder="Reason" value={reason} onChange={(event) => setReason(event.target.value)} required />
        <button
          className="btn-primary"
          type="submit"
          disabled={restrictionMutation.isPending}
        >
          {restrictionMutation.isPending ? "Applying..." : "Apply restriction"}
        </button>
      </form>
      <form className="surface-card space-y-2" onSubmit={submitAppealReview}>
        <h2 className="text-lg font-semibold">Review Appeal</h2>
        <input className="input" aria-label="Appeal ID" placeholder="Appeal ID" value={appealId} onChange={(event) => setAppealId(event.target.value)} required />
        <select className="input" aria-label="Appeal status" value={appealStatus} onChange={(event) => setAppealStatus(event.target.value)}>
          <option value="reviewing">Reviewing</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <button className="btn-primary" type="submit" disabled={appealMutation.isPending}>
          {appealMutation.isPending ? "Updating..." : "Update appeal"}
        </button>
      </form>
      </div>
      {error ? <p className="lg:col-span-3 text-sm text-rose-300">{error}</p> : null}
      {message ? <p className="lg:col-span-3 text-sm text-accent">{message}</p> : null}
    </section>
  );
}
