"use client";

import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export default function BetaPage() {
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [message, setMessage] = useState("");

  const waitlistMutation = useMutation({
    mutationFn: () =>
      apiRequest("/beta/waitlist", {
        method: "POST",
        body: { email: waitlistEmail, source: "frontend" }
      }),
    onSuccess: () => setMessage("Added to waitlist.")
  });

  const redeemMutation = useMutation({
    mutationFn: () =>
      apiRequest("/beta/invite/redeem", {
        method: "POST",
        auth: true,
        body: { code: inviteCode }
      }),
    onSuccess: () => setMessage("Invite redeemed.")
  });

  const submitWaitlist = (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    waitlistMutation.mutate();
  };

  const submitRedeem = (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    redeemMutation.mutate();
  };

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <form className="surface-card space-y-3" onSubmit={submitWaitlist}>
        <h1 className="text-xl font-semibold">Join Waitlist</h1>
        <input
          className="input"
          type="email"
          placeholder="you@example.com"
          value={waitlistEmail}
          onChange={(event) => setWaitlistEmail(event.target.value)}
          required
        />
        <button className="btn-primary" type="submit" disabled={waitlistMutation.isPending}>
          {waitlistMutation.isPending ? "Submitting..." : "Join waitlist"}
        </button>
      </form>
      <form className="surface-card space-y-3" onSubmit={submitRedeem}>
        <h2 className="text-xl font-semibold">Redeem Invite</h2>
        <input
          className="input"
          value={inviteCode}
          onChange={(event) => setInviteCode(event.target.value)}
          placeholder="Invite code"
          required
        />
        <button className="btn-primary" type="submit" disabled={redeemMutation.isPending}>
          {redeemMutation.isPending ? "Redeeming..." : "Redeem code"}
        </button>
      </form>
      {message ? <p className="text-sm text-accent lg:col-span-2">{message}</p> : null}
    </section>
  );
}
