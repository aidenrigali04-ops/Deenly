"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout } from "@/lib/auth";
import { useSessionStore } from "@/store/session-store";

const links = [
  { href: "/feed", label: "Feed" },
  { href: "/create", label: "Create" },
  { href: "/reflect-later", label: "Reflect Later" },
  { href: "/notifications", label: "Inbox" },
  { href: "/onboarding", label: "Interests" },
  { href: "/sessions", label: "Sessions" },
  { href: "/beta", label: "Beta" },
  { href: "/support", label: "Support" },
  { href: "/guidelines", label: "Guidelines" }
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
    <header className="sticky top-0 z-40 border-b border-white/10 bg-background/80 backdrop-blur">
      <div className="container-shell flex items-center justify-between py-3">
        <Link href="/feed" className="text-lg font-bold tracking-tight text-accent">
          Deenly
        </Link>
        <nav className="flex items-center gap-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-3 py-2 text-sm ${
                pathname.startsWith(link.href) ? "bg-card text-text" : "text-muted hover:text-text"
              }`}
            >
              {link.label}
            </Link>
          ))}
          {canAccessAdmin ? (
            <Link
              href="/admin"
              className={`rounded-lg px-3 py-2 text-sm ${
                pathname.startsWith("/admin") ? "bg-card text-text" : "text-muted hover:text-text"
              }`}
            >
              Admin
            </Link>
          ) : null}
          {user ? (
            <button
              className="btn-secondary"
              onClick={async () => {
                await logout();
                setUser(null);
                router.push("/auth/login");
              }}
            >
              Logout
            </button>
          ) : (
            <Link href="/auth/login" className="btn-secondary">
              Login
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
