"use client";

import Link from "next/link";
import type { FeedEventCardItem } from "@/types";

function formatStart(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  } catch {
    return iso;
  }
}

export function FeedEventInlineCard({ item }: { item: FeedEventCardItem }) {
  const ev = item.event;
  return (
    <article
      className={`surface-card overflow-hidden rounded-[1.45rem] border border-black/10 ${
        item.sponsored ? "ring-1 ring-black/10" : ""
      }`}
    >
      <div className="px-4 py-3">
        {item.sponsored ? (
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
            {item.sponsored_label || "Sponsored"}
          </p>
        ) : null}
        <Link href={`/events/${ev.id}`} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25">
          <h3 className="text-base font-semibold text-text">{ev.title}</h3>
          <p className="mt-1 text-sm text-muted">{formatStart(ev.starts_at)}</p>
          {ev.address_display ? (
            <p className="mt-1 text-sm text-muted line-clamp-2">{ev.address_display}</p>
          ) : ev.is_online ? (
            <p className="mt-1 text-sm text-muted">Online event</p>
          ) : null}
          <p className="mt-3 text-sm font-medium text-accent">View event →</p>
        </Link>
        {ev.rsvp_going_count > 0 ? (
          <p className="mt-2 text-xs text-muted">
            {ev.rsvp_going_count} going · {ev.rsvp_interested_count} interested
          </p>
        ) : null}
      </div>
    </article>
  );
}
