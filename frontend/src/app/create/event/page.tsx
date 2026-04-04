"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { createEvent } from "@/lib/events";

export default function CreateEventPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [addressDisplay, setAddressDisplay] = useState("");
  const [onlineUrl, setOnlineUrl] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private" | "invite">("public");

  const createMutation = useMutation({
    mutationFn: async () =>
      createEvent({
        title,
        description: description || null,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        isOnline: Boolean(onlineUrl.trim()),
        onlineUrl: onlineUrl || null,
        addressDisplay: addressDisplay || null,
        visibility,
        source: "web_create"
      })
  });

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await createMutation.mutateAsync();
    setTitle("");
    setDescription("");
    setStartsAt("");
    setEndsAt("");
    setAddressDisplay("");
    setOnlineUrl("");
    setVisibility("public");
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
        {createMutation.error ? (
          <p className="text-sm text-rose-700">{createMutation.error instanceof ApiError ? createMutation.error.message : "Could not create event."}</p>
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
