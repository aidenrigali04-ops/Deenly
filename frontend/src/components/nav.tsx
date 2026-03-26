"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout } from "@/lib/auth";
import { useSessionStore } from "@/store/session-store";

function Icon({
  kind
}: {
  kind: "home" | "video" | "send" | "search" | "upload" | "user" | "admin" | "dhikr" | "creator";
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
  if (kind === "dhikr") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common} aria-hidden="true">
        <circle cx="12" cy="7" r="2.5" />
        <path d="M12 9.5v8.5" />
        <circle cx="12" cy="20" r="1.5" />
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

function NavLink({
  href,
  label,
  active,
  icon
}: {
  href: string;
  label: string;
  active: boolean;
  icon: "home" | "video" | "send" | "search" | "upload" | "user" | "admin" | "dhikr" | "creator";
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="group flex min-h-[44px] min-w-[44px] items-center justify-center rounded-pill p-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
    >
      <span
        className={`grid h-11 w-11 place-items-center rounded-full border transition ${
          active
            ? "border-black bg-black text-white"
            : "border-black/15 bg-surface text-muted group-hover:bg-black/[0.04] group-hover:text-text"
        }`}
      >
        <Icon kind={icon} />
      </span>
      <span className="sr-only">{label}</span>
    </Link>
  );
}

const railLinks = [
  { href: "/home", label: "Home", icon: "home" as const },
  { href: "/recitation", label: "Recitation", icon: "video" as const },
  { href: "/messages", label: "Messages", icon: "send" as const },
  { href: "/search", label: "Search", icon: "search" as const },
  { href: "/dhikr", label: "Dhikr", icon: "dhikr" as const },
  { href: "/create", label: "Upload", icon: "upload" as const },
  { href: "/account/creator", label: "Creator", icon: "creator" as const },
  { href: "/account", label: "Account", icon: "user" as const }
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useSessionStore((state) => state.user);
  const setUser = useSessionStore((state) => state.setUser);
  const adminOwnerEmail = (process.env.NEXT_PUBLIC_ADMIN_OWNER_EMAIL || "")
    .trim()
    .toLowerCase();
  const canAccessAdmin =
    Boolean(user?.role === "admin" || user?.role === "moderator") &&
    Boolean(user?.email) &&
    Boolean(adminOwnerEmail) &&
    user?.email?.toLowerCase() === adminOwnerEmail;

  return (
    <aside className="w-full shrink-0 rounded-panel border border-black/10 bg-card p-3 md:sticky md:top-6 md:w-[76px] md:self-start">
      <div className="mb-4 flex items-center justify-between md:flex-col md:gap-4">
        <Link
          href="/home"
          aria-label="Deenly Home"
          className="grid h-11 w-11 place-items-center rounded-full border border-black/10 bg-surface text-base transition hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          ✦
        </Link>
        <span className="hidden text-[10px] uppercase tracking-[0.2em] text-muted md:block">Deenly</span>
      </div>

      <nav className="grid grid-cols-3 gap-2 sm:grid-cols-7 md:grid-cols-1 md:gap-2.5" aria-label="Primary">
        {railLinks.map((link) => {
          const active =
            link.href === "/account"
              ? pathname.startsWith("/account") && !pathname.startsWith("/account/creator")
              : pathname.startsWith(link.href);
          return (
            <NavLink
              key={link.href}
              href={link.href}
              label={link.label}
              icon={link.icon}
              active={active}
            />
          );
        })}
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
