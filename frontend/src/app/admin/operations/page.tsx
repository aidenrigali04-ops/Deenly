"use client";

import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export default function AdminOperationsPage() {
  const [inviteEmail, setInviteEmail] = useState("");
  const [maxUses, setMaxUses] = useState("1");
  const [ticketId, setTicketId] = useState("");
  const [status, setStatus] = useState("in_progress");
  const [priority, setPriority] = useState("normal");
  const [message, setMessage] = useState("");

  const inviteMutation = useMutation({
    mutationFn: () =>
      apiRequest("/admin/invites", {
        method: "POST",
        auth: true,
        body: { email: inviteEmail || null, maxUses: Number(maxUses) }
      }),
    onSuccess: (data: any) => setMessage(`Invite created: ${data.code}`)
  });

  const supportMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/admin/support/${ticketId}`, {
        method: "POST",
        auth: true,
        body: { status, priority }
      }),
    onSuccess: () => setMessage("Support ticket updated.")
  });

  const submitInvite = (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    inviteMutation.mutate();
  };
  const submitSupport = (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    supportMutation.mutate();
  };

  return (
    <section className="grid gap-4 md:grid-cols-2">
      <form className="surface-card space-y-2" onSubmit={submitInvite}>
        <h1 className="text-lg font-semibold">Create Beta Invite</h1>
        <input className="input" type="email" placeholder="Optional email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
        <input className="input" type="number" min={1} max={1000} value={maxUses} onChange={(event) => setMaxUses(event.target.value)} />
        <button className="btn-primary" type="submit">Create invite</button>
      </form>
      <form className="surface-card space-y-2" onSubmit={submitSupport}>
        <h2 className="text-lg font-semibold">Support Triage</h2>
        <input className="input" placeholder="Ticket ID" value={ticketId} onChange={(event) => setTicketId(event.target.value)} required />
        <select className="input" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select className="input" value={priority} onChange={(event) => setPriority(event.target.value)}>
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
        <button className="btn-primary" type="submit">Update ticket</button>
      </form>
      {message ? <p className="md:col-span-2 text-sm text-accent">{message}</p> : null}
    </section>
  );
}
