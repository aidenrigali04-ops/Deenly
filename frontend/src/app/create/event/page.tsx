"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { assistPostText } from "@/lib/ai-assist";
import { datetimeLocalToIso } from "@/lib/datetime-local";
import { createEvent } from "@/lib/events";

function buildEventAssistDraft(
  title: string,
  description: string,
  startsAt: string,
  endsAt: string,
  addressDisplay: string,
  onlineUrl: string
) {
  const lines = [`Title: ${title.trim()}`];
  if (startsAt.trim()) {
    lines.push(`Start (as entered): ${startsAt.trim()}`);
  }
  if (endsAt.trim()) {
    lines.push(`End (as entered): ${endsAt.trim()}`);
  }
  if (addressDisplay.trim()) {
    lines.push(`Location: ${addressDisplay.trim()}`);
  }
  if (onlineUrl.trim()) {
    lines.push(`Online: ${onlineUrl.trim()}`);
  }
  if (description.trim()) {
    lines.push(`Notes: ${description.trim()}`);
  }
  return lines.join("\n");
}

export default function CreateEventPage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [addressDisplay, setAddressDisplay] = useState("");
  const [onlineUrl, setOnlineUrl] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private" | "invite">("public");
  const [admissionDollars, setAdmissionDollars] = useState("");

  const assistMutation = useMutation({
    mutationFn: async () => {
      const draft = buildEventAssistDraft(title, description, startsAt, endsAt, addressDisplay, onlineUrl);
      const res = await assistPostText(draft, "event_listing");
      return res.suggestion;
    },
    onSuccess: (suggestion) => {
      setDescription(suggestion);
    }
  });

  const canPolishDescription =
    title.trim().length >= 3 &&
    Boolean(description.trim() || startsAt.trim() || endsAt.trim() || addressDisplay.trim() || onlineUrl.trim());

  const createMutation = useMutation({
    mutationFn: async () => {
      const t = title.trim();
      if (t.length < 3) {
        throw new Error("Title must be at least 3 characters.");
      }
      const startsIso = datetimeLocalToIso(startsAt);
      const endsIso = endsAt.trim() ? datetimeLocalToIso(endsAt) : null;
      if (endsIso && new Date(endsIso).getTime() < new Date(startsIso).getTime()) {
        throw new Error("End time must be after start time.");
      }
      const rawPrice = admissionDollars.trim();
      let admissionPriceMinor: number | undefined;
      if (rawPrice) {
        const n = Number.parseFloat(rawPrice);
        if (!Number.isFinite(n) || n < 0.5) {
          throw new Error("Ticket price must be at least $0.50, or leave blank for a free event.");
        }
        admissionPriceMinor = Math.round(n * 100);
      }
      return createEvent({
        title: t,
        description: description.trim() || null,
        startsAt: startsIso,
        endsAt: endsIso,
        isOnline: Boolean(onlineUrl.trim()),
        onlineUrl: onlineUrl.trim() || null,
        addressDisplay: addressDisplay.trim() || null,
        visibility,
        source: "web_create",
        ...(admissionPriceMinor != null ? { admissionPriceMinor, admissionCurrency: "usd" } : {})
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["account-hosted-events"] });
      void queryClient.invalidateQueries({ queryKey: ["user-profile-hosted-events"] });
      setTitle("");
      setDescription("");
      setStartsAt("");
      setEndsAt("");
      setAddressDisplay("");
      setOnlineUrl("");
      setVisibility("public");
      setAdmissionDollars("");
    }
  });

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await createMutation.mutateAsync();
    } catch {
      /* error shown via createMutation.error */
    }
  };

  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <p className="text-sm text-muted">
          <Link href="/create" className="text-sky-600 hover:underline">
            Back to create
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Create an event</h1>
        <p className="text-sm text-muted">
          Keep it lightweight: title, time, and location/link. Extra actions are inside event details after publish.
        </p>
      </header>

      <form className="surface-card space-y-3" onSubmit={onSubmit}>
        <input
          className="input"
          placeholder="Event title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={3}
          maxLength={180}
        />
        <textarea
          className="input min-h-28"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={4000}
        />
        <button
          type="button"
          className="btn-secondary w-full text-sm"
          disabled={!canPolishDescription || assistMutation.isPending}
          onClick={() => assistMutation.mutate()}
        >
          {assistMutation.isPending ? "Polishing…" : "Polish description"}
        </button>
        {assistMutation.error ? (
          <p className="text-sm text-rose-700">
            {assistMutation.error instanceof ApiError ? assistMutation.error.message : "Could not polish. Try again."}
          </p>
        ) : null}
        <p className="text-xs text-muted">
          Add title plus time, place, link, or rough notes—then polish into a clear description.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted">Starts</span>
            <input
              className="input"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Ends (optional)</span>
            <input className="input" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </label>
        </div>
        <input
          className="input"
          placeholder="Address (optional)"
          value={addressDisplay}
          onChange={(e) => setAddressDisplay(e.target.value)}
          maxLength={500}
        />
        <input
          className="input"
          placeholder="Online URL (optional)"
          value={onlineUrl}
          onChange={(e) => setOnlineUrl(e.target.value)}
          maxLength={2000}
        />
        <label className="space-y-1 text-sm">
          <span className="text-muted">Visibility</span>
          <select className="input" value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)}>
            <option value="public">Public</option>
            <option value="private">Private</option>
            <option value="invite">Invite only</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted">Ticket price (optional)</span>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            min={0.5}
            step="0.01"
            placeholder="Leave blank for free — e.g. 15.00 for $15 USD"
            value={admissionDollars}
            onChange={(e) => setAdmissionDollars(e.target.value)}
          />
          <span className="text-xs text-muted">
            Requires the host&apos;s Stripe Connect account. Guests pay here before they can RSVP as Going.
          </span>
        </label>
        {createMutation.error ? (
          <p className="text-sm text-rose-700">
            {createMutation.error instanceof ApiError
              ? createMutation.error.message
              : createMutation.error instanceof Error
                ? createMutation.error.message
                : "Could not create event."}
          </p>
        ) : null}
        {createMutation.isSuccess ? (
          <p className="text-sm text-emerald-700">
            Event created.{" "}
            <Link href={`/events/${createMutation.data.id}`} className="underline">
              View details
            </Link>
          </p>
        ) : null}
        <button className="btn-primary" type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Creating..." : "Create event"}
        </button>
      </form>
    </section>
  );
}
