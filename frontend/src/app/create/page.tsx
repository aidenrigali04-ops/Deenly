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
        <h1 className="page-header-title mt-4">Create a post</h1>
        <p className="page-header-subtitle">
          Add a photo or video, write a caption, and optionally promote your offer or cross-post to Instagram.
        </p>
        <p className="mt-2 text-sm text-muted">
          Selling a standalone offer?{" "}
          <Link
            href="/create/product"
            className="text-sky-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25"
          >
            Create a product
          </Link>{" "}
          instead.
        </p>
      </header>

      <CreatePostComposer variant="page" redirectPathAfterInstagram="/create" />
    </div>
  );
}
