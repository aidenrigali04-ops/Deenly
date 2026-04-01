"use client";

import Link from "next/link";
import { CreateProductComposer } from "@/components/create-product-composer";

export default function CreateProductPage() {
  return (
    <div className="page-stack mx-auto w-full max-w-2xl">
      <header className="page-header">
        <p className="text-sm text-muted">
          <Link
            href="/create"
            className="rounded-sm text-sky-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Create a post instead
          </Link>
          <span className="mx-2 text-black/20" aria-hidden>
            ·
          </span>
          <Link
            href="/home"
            className="rounded-sm text-sky-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Back to home
          </Link>
        </p>
        <h1 className="page-header-title mt-4">Create a product</h1>
        <p className="page-header-subtitle">
          List what you sell: price, delivery, and optional AI help on your description. Publish when ready, then attach
          it from Create post or your Creator hub.
        </p>
      </header>

      <article className="surface-card section-stack px-6 py-6">
        <CreateProductComposer variant="page" />
      </article>
    </div>
  );
}
