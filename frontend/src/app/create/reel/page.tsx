"use client";

import Link from "next/link";
import { CreatePostComposer } from "@/components/create-post-composer";

export default function CreateReelPage() {
  return (
    <div className="page-stack mx-auto w-full max-w-2xl">
      <header className="page-header">
        <p className="text-sm text-muted">
          <Link href="/reels" className="text-sky-600 underline-offset-2 hover:underline">
            Back to reels
          </Link>
        </p>
        <h1 className="page-header-title mt-4">Create a reel</h1>
        <p className="page-header-subtitle">
          Upload a vertical video and caption. Reels appear in the full-screen Reels feed.
        </p>
      </header>

      <CreatePostComposer variant="page" reelMode redirectPathAfterInstagram="/create/reel" />
    </div>
  );
}
