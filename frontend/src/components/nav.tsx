"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout } from "@/lib/auth";
import { useSessionStore } from "@/store/session-store";

const links = [
  { href: "/home", label: "Home" },
  { href: "/recitation", label: "Recitation" },
  { href: "/messages", label: "Messages" },
  { href: "/search", label: "Search" },
  { href: "/account", label: "Account" }
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
    <aside className="w-full shrink-0 rounded-2xl border border-white/10 bg-card/40 p-4 md:sticky md:top-4 md:w-64 md:self-start">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/home" className="text-lg font-bold tracking-tight text-accent">
          Deenly
        </Link>
        {user ? (
          <span className="rounded-full border border-white/10 px-2 py-1 text-xs text-muted">
            @{user.username || "user"}
          </span>
        ) : null}
      </div>
      <nav className="grid grid-cols-2 gap-1 md:grid-cols-1" aria-label="Primary">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-lg px-3 py-2 text-sm ${
              pathname.startsWith(link.href)
                ? "bg-background text-text ring-1 ring-white/10"
                : "text-muted hover:bg-background/60 hover:text-text"
            }`}
          >
            {link.label}
          </Link>
        ))}
        {canAccessAdmin ? (
          <Link
            href="/admin"
            className={`rounded-lg px-3 py-2 text-sm ${
              pathname.startsWith("/admin")
                ? "bg-background text-text ring-1 ring-white/10"
                : "text-muted hover:bg-background/60 hover:text-text"
            }`}
          >
            Admin
          </Link>
        ) : null}
      </nav>
      <div className="mt-4 border-t border-white/10 pt-4">
        {user ? (
          <button
            className="btn-secondary w-full"
            onClick={async () => {
              await logout();
              setUser(null);
              router.push("/auth/login");
            }}
          >
            Logout
          </button>
        ) : (
          <Link href="/auth/login" className="btn-secondary block w-full text-center">
            Login
          </Link>
        )}
      </div>
    </aside>
  );
}
