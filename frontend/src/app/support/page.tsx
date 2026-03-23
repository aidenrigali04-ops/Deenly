"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

type Ticket = {
  id: number;
  subject: string;
  message: string;
  status: string;
  priority: string;
  created_at: string;
};

type MyTicketsResponse = {
  items: Ticket[];
};

export default function SupportPage() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");

  const ticketsQuery = useQuery({
    queryKey: ["my-support-tickets"],
    queryFn: () => apiRequest<MyTicketsResponse>("/support/my-tickets", { auth: true })
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("/support/tickets", {
        method: "POST",
        body: { subject, message, email }
      }),
    onSuccess: () => {
      setNotice("Ticket submitted.");
      setSubject("");
      setMessage("");
      ticketsQuery.refetch();
    }
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setNotice("");
    createMutation.mutate();
  };

  return (
    <section className="space-y-4">
      <form className="surface-card space-y-3" onSubmit={submit}>
        <h1 className="text-xl font-semibold">Support</h1>
        <input className="input" placeholder="Subject" value={subject} onChange={(event) => setSubject(event.target.value)} required />
        <textarea className="input min-h-28" placeholder="Describe your issue" value={message} onChange={(event) => setMessage(event.target.value)} required />
        <input className="input" type="email" placeholder="Reply email (optional)" value={email} onChange={(event) => setEmail(event.target.value)} />
        <button className="btn-primary" type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Submitting..." : "Submit ticket"}
        </button>
      </form>
      {notice ? <p className="text-sm text-accent">{notice}</p> : null}
      <div className="surface-card">
        <h2 className="text-lg font-medium">My Tickets</h2>
        <ul className="mt-3 space-y-3 text-sm">
          {ticketsQuery.data?.items?.map((ticket) => (
            <li key={ticket.id} className="rounded-lg border border-white/10 p-3">
              <p className="font-medium">{ticket.subject}</p>
              <p className="mt-1 text-muted">{ticket.message}</p>
              <p className="mt-1 text-xs text-muted">
                {ticket.status} / {ticket.priority}
              </p>
            </li>
          )) || <li className="text-muted">No tickets yet.</li>}
        </ul>
      </div>
    </section>
  );
}
