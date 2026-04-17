"use client";

import Link from "next/link";
import { FigmaRasterIcon } from "@/components/social/figma-raster-icon";
import { figmaSocialIcons } from "@/lib/figma-social-icons";
import { useSessionStore } from "@/store/session-store";
export function SocialHomeHeader() {
  const user = useSessionStore((s) => s.user);
  const display = user?.username || user?.email?.split("@")[0] || "You";
  const handle = user?.username ? `@${user.username}` : user?.email || "";

  return (
    <header className="mb-3 flex items-center justify-between gap-3 px-0.5 pb-2 pt-2">
      <div className="flex min-w-0 items-center gap-[10px]">
        <Link
          href="/account"
          className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[32px] border border-white/10 bg-white shadow-[5px_6px_20px_rgba(0,0,0,0.12)]"
          aria-label="Open profile"
        >
          <span className="text-[15px] font-semibold leading-none text-black">{display.slice(0, 1).toUpperCase()}</span>
        </Link>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold leading-6 tracking-tight text-white">{display}</p>
          {handle ? <p className="truncate text-xs font-normal leading-4 text-white/80">{handle}</p> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Link
          href="/messages"
          className="grid h-12 w-12 place-items-center rounded-[32px] border border-white/[0.08] bg-white/[0.08] text-white shadow-[8px_4px_28px_rgba(0,0,0,0.06)] transition hover:bg-white/12"
          aria-label="Messages"
        >
          <FigmaRasterIcon src={figmaSocialIcons.headerMessage} size={20} />
        </Link>
        <Link
          href="/notifications"
          className="grid h-12 w-12 place-items-center rounded-[32px] border border-white/[0.08] bg-white/[0.08] text-white shadow-[8px_4px_28px_rgba(0,0,0,0.06)] transition hover:bg-white/12"
          aria-label="Notifications"
        >
          <FigmaRasterIcon src={figmaSocialIcons.headerHeart} size={20} />
        </Link>
      </div>
    </header>
  );
}
