"use client";

import Link from "next/link";
import type { EventRecord } from "@/lib/events";

function formatEventWhen(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

function eventLocationLine(ev: EventRecord): string {
  if (ev.isOnline && ev.onlineUrl) return "Online";
  if (ev.isOnline) return "Online";
  if (ev.addressDisplay) return ev.addressDisplay;
  return "";
}

function statusLabel(status: EventRecord["status"]) {
  if (status === "canceled") return "Canceled";
  if (status === "completed") return "Completed";
  return null;
}

type ProfileEventsListProps = {
  items: EventRecord[];
  emptyTitle: string;
  emptyHint?: string;
  createEventHref?: string;
  createEventLabel?: string;
};

/** Hosted events on profile — matches product row styling (rounded-control cards). */
export function ProfileEventsList({
  items,
  emptyTitle,
  emptyHint,
  createEventHref,
  createEventLabel
}: ProfileEventsListProps) {
  if (items.length === 0) {
    return (
      <div className="py-14 text-center">
        <p className="text-sm font-medium text-text">{emptyTitle}</p>
        {emptyHint ? <p className="mt-2 text-sm text-muted">{emptyHint}</p> : null}
        {createEventHref ? (
          <Link
            href={createEventHref}
            className="mt-4 inline-block text-sm font-semibold text-sky-600 underline-offset-2 hover:underline"
          >
            {createEventLabel ?? "Create an event"}
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((ev) => {
        const status = statusLabel(ev.status);
        const when = formatEventWhen(ev.startsAt);
        const where = eventLocationLine(ev);
        return (
          <li key={ev.id} className="rounded-control border border-black/10 bg-surface px-4 py-3 text-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <Link href={`/events/${ev.id}`} className="font-semibold text-text hover:underline">
                  {ev.title}
                </Link>
                {when ? <p className="mt-1 text-xs text-muted">{when}</p> : null}
                {where ? <p className="mt-0.5 text-xs text-muted">{where}</p> : null}
                {ev.description ? (
                  <p className="mt-2 line-clamp-2 text-xs text-text/90">{ev.description}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  {ev.visibility !== "public" ? (
                    <span className="rounded-pill border border-black/10 px-2 py-0.5 capitalize">{ev.visibility}</span>
                  ) : null}
                  {status ? (
                    <span className="rounded-pill border border-black/10 px-2 py-0.5 text-text/80">{status}</span>
                  ) : null}
                  <span>
                    {ev.rsvpGoingCount} going · {ev.rsvpInterestedCount} interested
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                <Link href={`/events/${ev.id}`} className="btn-secondary inline-flex px-3 py-1.5 text-xs">
                  View event
                </Link>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
