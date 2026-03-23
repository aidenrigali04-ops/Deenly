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
  { href: "/admin", label: "Admin" },
  { href: "/guidelines", label: "Guidelines" }
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useSessionStore((state) => state.user);
  const setUser = useSessionStore((state) => state.setUser);

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
