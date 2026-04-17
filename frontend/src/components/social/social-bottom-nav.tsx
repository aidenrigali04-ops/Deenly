"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FigmaRasterIcon } from "@/components/social/figma-raster-icon";
import { figmaSocialIcons } from "@/lib/figma-social-icons";

const navItems: Array<{
  href: string;
  label: string;
  match: (p: string) => boolean;
  src: string;
}> = [
  { href: "/home", label: "Home", match: (p) => p === "/home" || p === "/", src: figmaSocialIcons.navHome },
  {
    href: "/search",
    label: "Search",
    match: (p) => p.startsWith("/search") || p.startsWith("/businesses"),
    src: figmaSocialIcons.discoverSearch
  },
  {
    href: "/marketplace",
    label: "Market",
    match: (p) => p.startsWith("/marketplace"),
    src: figmaSocialIcons.navMarket
  },
  { href: "/reels", label: "Reels", match: (p) => p.startsWith("/reels"), src: figmaSocialIcons.navReels },
  {
    href: "/messages",
    label: "Chat",
    match: (p) => p.startsWith("/messages"),
    src: figmaSocialIcons.headerMessage
  },
  {
    href: "/account",
    label: "Profile",
    match: (p) => p.startsWith("/account") && !p.startsWith("/account/creator"),
    src: figmaSocialIcons.navProfile
  }
];

export function SocialBottomNav() {
  const pathname = usePathname() || "";

  return (
    <nav
      className="social-bottom-nav pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
      aria-label="Primary"
    >
      <div className="pointer-events-auto flex max-w-full items-center gap-3 rounded-[50px] border border-white/12 bg-black/[0.12] px-[14px] py-2 shadow-[0_-12px_36px_rgba(0,0,0,0.06)] backdrop-blur-[18px]">
        {navItems.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              title={item.label}
              className={`flex min-h-[44px] min-w-[40px] flex-col items-center justify-center rounded-[50px] px-[10px] py-1 transition sm:min-w-[44px] ${
                active ? "text-social-accent" : "text-white/85 hover:bg-white/5"
              }`}
            >
              <span
                className={`grid place-items-center ${active ? "drop-shadow-[0_0_10px_rgba(254,177,1,0.5)]" : ""}`}
              >
                <FigmaRasterIcon
                  src={item.src}
                  size={24}
                  className={active ? "opacity-100" : "opacity-[0.88]"}
                />
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function SocialCreateFab() {
  return (
    <Link
      href="/create"
      className="social-create-fab fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-40 flex h-[42px] w-[42px] items-center justify-center rounded-full bg-white text-[#000001] shadow-[8px_4px_28px_rgba(0,0,0,0.12)] ring-1 ring-white/25 transition hover:scale-[1.03] hover:bg-white/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-social-accent focus-visible:ring-offset-2 focus-visible:ring-offset-black"
      aria-label="Create post"
      title="Create"
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
      </svg>
    </Link>
  );
}
