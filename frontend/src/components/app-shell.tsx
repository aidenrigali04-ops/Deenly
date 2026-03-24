"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { fetchSessionMe } from "@/lib/auth";
import { clearTokens, getAccessToken } from "@/lib/storage";
import { useSessionStore } from "@/store/session-store";
import { Nav } from "@/components/nav";

const PUBLIC_PATHS = new Set(["/", "/auth/login", "/auth/signup"]);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useSessionStore((state) => state.user);
  const setUser = useSessionStore((state) => state.setUser);
  const [bootstrapping, setBootstrapping] = useState(true);

  const isPublicPath = useMemo(() => PUBLIC_PATHS.has(pathname), [pathname]);

  useEffect(() => {
    let mounted = true;
    const token = getAccessToken();
    if (!token) {
      if (mounted) {
        setBootstrapping(false);
      }
      return () => {
        mounted = false;
      };
    }

    fetchSessionMe()
      .then((sessionUser) => {
        if (!mounted) return;
        setUser(sessionUser);
      })
      .catch(() => {
        if (!mounted) return;
        clearTokens();
        setUser(null);
      })
      .finally(() => {
        if (mounted) {
          setBootstrapping(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [setUser]);

  useEffect(() => {
    if (bootstrapping) return;
    const token = getAccessToken();
    if (!isPublicPath && !token) {
      const next = encodeURIComponent(pathname || "/home");
      router.replace(`/auth/login?next=${next}`);
      return;
    }

    if ((pathname === "/auth/login" || pathname === "/auth/signup") && user) {
      router.replace("/home");
    }
    if (pathname === "/" && user) {
      router.replace("/home");
    }
  }, [bootstrapping, isPublicPath, pathname, router, user]);

  if (!isPublicPath && bootstrapping) {
    return (
      <main className="container-shell py-10" role="status" aria-live="polite">
        <div className="surface-card space-y-3">
          <p className="text-sm text-muted">Restoring your session...</p>
          <div className="skeleton h-3 w-2/5" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-3/4" />
        </div>
      </main>
    );
  }

  if (isPublicPath) {
    return <main className="container-shell py-6">{children}</main>;
  }

  return (
    <div className="container-shell flex flex-col gap-4 py-6 md:flex-row md:gap-6">
      <Nav />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
