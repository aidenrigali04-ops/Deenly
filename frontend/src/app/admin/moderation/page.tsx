"use client";

import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export default function AdminModerationPage() {
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const [restrictionType, setRestrictionType] = useState("posting_suspended");
  const [appealId, setAppealId] = useState("");
  const [appealStatus, setAppealStatus] = useState("reviewing");
  const [message, setMessage] = useState("");

  const warnMutation = useMutation({
    mutationFn: () =>
      apiRequest("/admin/warnings", {
        method: "POST",
        auth: true,
        body: { userId: Number(userId), reason }
      }),
    onSuccess: () => setMessage("Warning issued.")
  });

  const restrictionMutation = useMutation({
    mutationFn: () =>
      apiRequest("/admin/restrictions", {
        method: "POST",
        auth: true,
        body: { userId: Number(userId), restrictionType, reason }
      }),
    onSuccess: () => setMessage("Restriction applied.")
  });

  const appealMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/admin/appeals/${appealId}/review`, {
        method: "POST",
        auth: true,
        body: { status: appealStatus }
      }),
    onSuccess: () => setMessage("Appeal reviewed.")
  });

  const submitWarning = (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    warnMutation.mutate();
  };
  const submitRestriction = (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    restrictionMutation.mutate();
  };
  const submitAppealReview = (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    appealMutation.mutate();
  };

  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <form className="surface-card space-y-2" onSubmit={submitWarning}>
        <h1 className="text-lg font-semibold">Issue Warning</h1>
        <input className="input" placeholder="User ID" value={userId} onChange={(event) => setUserId(event.target.value)} required />
        <input className="input" placeholder="Reason" value={reason} onChange={(event) => setReason(event.target.value)} required />
        <button className="btn-primary" type="submit">Send warning</button>
      </form>
      <form className="surface-card space-y-2" onSubmit={submitRestriction}>
        <h2 className="text-lg font-semibold">Apply Restriction</h2>
        <input className="input" placeholder="User ID" value={userId} onChange={(event) => setUserId(event.target.value)} required />
        <select className="input" value={restrictionType} onChange={(event) => setRestrictionType(event.target.value)}>
          <option value="posting_suspended">Posting suspended</option>
          <option value="comment_suspended">Comment suspended</option>
          <option value="account_suspended">Account suspended</option>
        </select>
        <input className="input" placeholder="Reason" value={reason} onChange={(event) => setReason(event.target.value)} required />
        <button className="btn-primary" type="submit">Apply restriction</button>
      </form>
      <form className="surface-card space-y-2" onSubmit={submitAppealReview}>
        <h2 className="text-lg font-semibold">Review Appeal</h2>
        <input className="input" placeholder="Appeal ID" value={appealId} onChange={(event) => setAppealId(event.target.value)} required />
        <select className="input" value={appealStatus} onChange={(event) => setAppealStatus(event.target.value)}>
          <option value="reviewing">Reviewing</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <button className="btn-primary" type="submit">Update appeal</button>
      </form>
      {message ? <p className="lg:col-span-3 text-sm text-accent">{message}</p> : null}
    </section>
  );
}
