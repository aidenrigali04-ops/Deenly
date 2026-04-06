"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { logout } from "@/lib/auth";
import { apiRequest } from "@/lib/api";
import { useSessionStore } from "@/store/session-store";
import { useUnreadMessageCount } from "@/hooks/use-unread-message-count";

function Icon({
  kind
}: {
  kind: "home" | "video" | "marketplace" | "send" | "search" | "upload" | "user" | "admin" | "creator";
}) {
  const common = "h-5 w-5";
  if (kind === "home") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common} aria-hidden="true">
        <path d="M3 10.8L12 4l9 6.8" />
        <path d="M5.5 10.5V20h13V10.5" />
      </svg>
    );
  }
  if (kind === "video") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common} aria-hidden="true">
        <rect x="3.5" y="6" width="11.5" height="12" rx="2" />
        <path d="M15 10.5l5.5-2v7l-5.5-2z" />
      </svg>
    );
  }
  if (kind === "marketplace") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common} aria-hidden="true">
        <path d="M4 10V8a2 2 0 0 1 2-2h2" />
        <path d="M4 14v2a2 2 0 0 0 2 2h2" />
        <path d="M20 10V8a2 2 0 0 0-2-2h-2" />
        <path d="M20 14v2a2 2 0 0 1-2 2h-2" />
        <path d="M8 6V4h8v2" />
        <path d="M8 18v2h8v-2" />
        <path d="M9 10h6v4H9z" />
      </svg>
    );
  }
  if (kind === "send") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common} aria-hidden="true">
        <path d="M21 3L10 14" />
        <path d="M21 3l-7 18-4-7-7-4z" />
      </svg>
    );
  }
  if (kind === "search") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common} aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" />
        <path d="M20 20l-4-4" />
      </svg>
    );
  }
  if (kind === "upload") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className={common}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v8" />
        <path d="M8 12h8" />
      </svg>
    );
  }
  if (kind === "admin") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common} aria-hidden="true">
        <path d="M12 3l7 3v5c0 5.2-3.2 8.7-7 10-3.8-1.3-7-4.8-7-10V6z" />
      </svg>
    );
  }
  if (kind === "creator") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common} aria-hidden="true">
        <path d="M4 18V10" />
        <path d="M10 18V6" />
        <path d="M16 18v-5" />
        <path d="M22 18v-9" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common} aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

type RailIcon = "home" | "video" | "marketplace" | "send" | "search" | "upload" | "user" | "admin" | "creator";

type RailLink = {
  href: string;
  label: string;
  icon: RailIcon;
  /** Extra context for hover tooltip and sighted users */
  title?: string;
  /** Shown under the icon from md breakpoint (e.g. Creator hub) */
  subLabel?: string;
};

function NavLink({
  href,
  label,
  active,
  icon,
  title: titleAttr,
  subLabel,
  badge
}: {
  href: string;
  label: string;
  active: boolean;
  icon: RailIcon;
  title?: string;
  subLabel?: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      aria-label={badge ? `${label} (${badge} unread)` : label}
      title={titleAttr ?? label}
      className="group flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-pill p-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
    >
      <span
        className={`nav-rail-hit relative grid h-11 w-11 place-items-center rounded-full border ${
          active
            ? "border-black bg-black text-white"
            : "border-black/15 bg-surface text-muted group-hover:bg-black/[0.04] group-hover:text-text"
        }`}
      >
        <Icon kind={icon} />
        {badge && badge > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-black px-1 text-[10px] font-bold leading-none text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </span>
      {subLabel ? (
        <span className="hidden max-w-[76px] text-center text-[9px] leading-tight text-muted md:block">{subLabel}</span>
      ) : null}
      <span className="sr-only">{label}</span>
    </Link>
  );
}

const feedRailLinks: RailLink[] = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/marketplace", label: "Marketplace", icon: "marketplace" },
  { href: "/search", label: "Search", icon: "search" },
  { href: "/messages", label: "Messages", icon: "send" }
];

const youRailLinks: RailLink[] = [
  { href: "/create", label: "Upload", icon: "upload", title: "Create post" },
  {
    href: "/create/product",
    label: "Product",
    icon: "marketplace",
    title: "Create a product listing",
    subLabel: "Sell"
  },
  {
    href: "/account/creator",
    label: "Creator hub",
    icon: "creator",
    title: "Creator hub — products, payouts, and affiliates",
    subLabel: "Earn"
  },
  { href: "/account", label: "Account", icon: "user" }
];

type MeNavProfile = {
  profile_kind?: "consumer" | "professional" | "business_interest" | null;
  seller_checklist_completed_at?: string | null;
  persona_capabilities?: {
    can_access_creator_hub?: boolean;
    can_create_products?: boolean;
    can_use_business_directory_tools?: boolean;
  };
};

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useSessionStore((state) => state.user);
  const unreadMessageCount = useUnreadMessageCount();
  const setUser = useSessionStore((state) => state.setUser);
  const adminOwnerEmail = (process.env.NEXT_PUBLIC_ADMIN_OWNER_EMAIL || "")
    .trim()
    .toLowerCase();
  const canAccessAdmin =
    Boolean(user?.role === "admin" || user?.role === "moderator") &&
    Boolean(user?.email) &&
    Boolean(adminOwnerEmail) &&
    user?.email?.toLowerCase() === adminOwnerEmail;
  const meProfileQuery = useQuery({
    queryKey: ["nav-user-profile-kind"],
    queryFn: () => apiRequest<MeNavProfile>("/users/me", { auth: true }),
    enabled: Boolean(user),
    staleTime: 60_000
  });
  const caps = meProfileQuery.data?.persona_capabilities;
  const showProductTools = Boolean(
    caps?.can_create_products || pathname.startsWith("/create/product") || pathname.startsWith("/account/creator")
  );
  const showCreatorHub = Boolean(caps?.can_access_creator_hub || pathname.startsWith("/account/creator"));
  const visibleYouLinks = youRailLinks
    .filter((link) => (link.href === "/create/product" ? showProductTools : true))
    .filter((link) => (link.href === "/account/creator" ? showCreatorHub : true))
    .map((link) =>
      link.href === "/account/creator" && meProfileQuery.data?.profile_kind === "professional"
        ? {
            ...link,
            label: "Pro tools",
            title: "Professional tools — products, payouts, and client-ready offers",
            subLabel: "Pro"
          }
        : link
    );

  return (
    <aside className="glass-panel w-full shrink-0 p-3 md:sticky md:top-6 md:w-[76px] md:self-start">
      <div className="mb-4 flex items-center justify-between md:flex-col md:gap-4">
        <Link
          href="/home"
          aria-label="Deenly Home"
          className="nav-rail-hit grid h-11 w-11 place-items-center rounded-full border border-black/10 bg-surface text-base hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          ✦
        </Link>
        <span className="hidden text-[10px] uppercase tracking-[0.2em] text-muted md:block">Deenly</span>
      </div>

      <nav className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-1 md:gap-2.5" aria-label="Primary">
        <div className="contents md:contents">
          <p className="col-span-full hidden text-[10px] uppercase tracking-[0.18em] text-muted md:block">Discover</p>
          {feedRailLinks.map((link) => {
            const active =
              link.href === "/home"
                ? pathname === "/home" || pathname === "/"
                : link.href === "/search"
                  ? pathname.startsWith("/search") || pathname.startsWith("/businesses")
                  : pathname.startsWith(link.href);
            return (
              <NavLink
                key={link.href}
                href={link.href}
                label={link.label}
                icon={link.icon}
                active={active}
                title={link.title}
                subLabel={link.subLabel}
                badge={link.href === "/messages" ? unreadMessageCount : undefined}
              />
            );
          })}
        </div>
        <div
          className="col-span-full hidden border-t border-black/10 md:my-1 md:block"
          aria-hidden
        />
        <div className="contents md:contents">
          <p className="col-span-full hidden text-[10px] uppercase tracking-[0.18em] text-muted md:block">
            You &amp; create
          </p>
          {visibleYouLinks.map((link) => {
            const active =
              link.href === "/account"
                ? pathname.startsWith("/account") && !pathname.startsWith("/account/creator")
                : link.href === "/account/creator"
                  ? pathname.startsWith("/account/creator")
                  : link.href === "/create"
                    ? pathname === "/create"
                    : link.href === "/create/product"
                      ? pathname.startsWith("/create/product")
                      : pathname.startsWith(link.href);
            return (
              <NavLink
                key={link.href}
                href={link.href}
                label={link.label}
                icon={link.icon}
                active={active}
                title={link.title}
                subLabel={link.subLabel}
              />
            );
          })}
        </div>
        {canAccessAdmin ? (
          <NavLink
            href="/admin"
            label="Admin"
            icon="admin"
            active={pathname.startsWith("/admin")}
          />
        ) : null}
      </nav>

      <div className="mt-4 border-t border-black/10 pt-3">
        {user ? (
          <button
            className="min-h-11 w-full rounded-pill border border-black/10 bg-surface px-3 py-2.5 text-xs font-medium text-muted transition hover:bg-black/[0.04] hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            onClick={async () => {
              await logout();
              setUser(null);
              router.push("/auth/login");
            }}
          >
            Logout
          </button>
        ) : (
          <Link
            href="/auth/login"
            className="flex min-h-11 w-full items-center justify-center rounded-pill border border-black/10 bg-surface px-3 py-2.5 text-center text-xs font-medium text-muted transition hover:bg-black/[0.04] hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            Login
          </Link>
        )}
      </div>
    </aside>
  );
}
