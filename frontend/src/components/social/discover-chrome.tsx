"use client";

import { useState } from "react";
import { FigmaRasterIcon } from "@/components/social/figma-raster-icon";
import { figmaSocialIcons } from "@/lib/figma-social-icons";

const CATEGORIES = ["Popular", "Latest", "Sports", "Traveling", "News"] as const;

/**
 * Figma “Discover screen” chrome (categories + preview tiles). Functional search UI continues below on `/search`.
 */
export function DiscoverChrome() {
  const [active, setActive] = useState<(typeof CATEGORIES)[number]>("Popular");

  return (
    <div className="space-y-4 pb-2">
      <header className="flex items-start justify-between gap-3 px-0.5 pb-2 pt-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-6 tracking-tight text-white">Discover</h1>
          <p className="mt-0.5 max-w-[14rem] text-xs font-normal leading-4 text-white/80">Find your favorite content</p>
        </div>
        <a
          href="#search-tools"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-[32px] border border-white/[0.08] bg-white/[0.08] text-white shadow-[8px_4px_28px_rgba(0,0,0,0.06)]"
          aria-label="Jump to search tools"
        >
          <FigmaRasterIcon src={figmaSocialIcons.discoverSearch} size={20} />
        </a>
      </header>

      <div className="flex gap-x-[22px] overflow-x-auto border-b border-white/10 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActive(cat)}
            className={`shrink-0 border-b-2 pb-2 text-sm font-medium leading-5 transition ${
              active === cat
                ? "border-social-accent text-social-accent"
                : "border-transparent text-white/90 hover:text-white"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        {["1.2 M", "12 M", "6.8 M"].map((label) => (
          <div
            key={label}
            className="relative h-[211px] flex-1 overflow-hidden rounded-[20px] bg-social-card"
          >
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[74px] bg-gradient-to-t from-black/65 to-transparent"
              aria-hidden
            />
            <p className="absolute bottom-[11px] left-0 right-0 text-center text-xs font-normal leading-4 text-white">
              {label} views
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-3 border-t border-white/10 pt-4">
        <h2 className="text-lg font-semibold leading-6 tracking-tight text-white">Recommended For You</h2>
        <p className="text-xs font-normal leading-4 text-white/60">
          Trending previews match the Figma file layout. Use search and map tools below for live results on Deenly.
        </p>
      </div>
    </div>
  );
}
