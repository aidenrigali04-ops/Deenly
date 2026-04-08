"use client";

import Link from "next/link";
import { CreatePostComposer } from "@/components/create-post-composer";

export default function CreatePage() {
  return (
    <div className="page-stack mx-auto w-full max-w-2xl">
      <header className="page-header">
        <p className="text-sm text-muted">
          <Link
            href="/home"
            className="rounded-sm text-sky-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Back to home
          </Link>
        </p>
        <h1 className="page-header-title mt-4">Create</h1>
        <p className="page-header-subtitle">
          Choose what you want to add. Post and reel composer is below; product and event have their own short flows.
        </p>
      </header>

      <div className="surface-card mb-6 grid gap-3 px-4 py-4 sm:grid-cols-3 sm:px-5">
        <Link
          href="#post-composer"
          className="rounded-control border border-black/10 bg-surface px-3 py-3 text-left transition hover:border-black/20"
        >
          <p className="text-sm font-semibold text-text">Post or reel</p>
          <p className="mt-1 text-xs text-muted">Photo, video, caption</p>
        </Link>
        <Link
          href="/create/product"
          className="rounded-control border border-black/10 bg-surface px-3 py-3 text-left transition hover:border-black/20"
        >
          <p className="text-sm font-semibold text-text">Product</p>
          <p className="mt-1 text-xs text-muted">Digital, service, or membership</p>
        </Link>
        <Link
          href="/create/event"
          className="rounded-control border border-black/10 bg-surface px-3 py-3 text-left transition hover:border-black/20"
        >
          <p className="text-sm font-semibold text-text">Event</p>
          <p className="mt-1 text-xs text-muted">Meetup or session</p>
        </Link>
      </div>

      <section id="post-composer" className="scroll-mt-24">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">New post</h2>
        <CreatePostComposer variant="page" redirectPathAfterInstagram="/create" />
      </section>
    </div>
  );
}
