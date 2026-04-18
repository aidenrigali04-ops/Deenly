"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { fetchSessionMe } from "@/lib/auth";
import { clearTokens, getAccessToken } from "@/lib/storage";
import { ApiError } from "@/lib/api";
import { useSessionStore } from "@/store/session-store";
import { Nav } from "@/components/nav";
import { BusinessPersonalizerDialog } from "@/components/business-personalizer-dialog";
import { ackPrayerReminder, fetchPrayerStatus, type PrayerStatus } from "@/lib/prayer";

const PUBLIC_PATHS = new Set(["/", "/auth/login", "/auth/signup", "/terms", "/privacy", "/guidelines"]);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useSessionStore((state) => state.user);
  const setUser = useSessionStore((state) => state.setUser);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [prayerReminder, setPrayerReminder] = useState<PrayerStatus | null>(null);

  const isPublicPath = useMemo(() => PUBLIC_PATHS.has(pathname), [pathname]);
  const isAuthPath = useMemo(
    () => pathname === "/auth/login" || pathname === "/auth/signup",
    [pathname]
  );

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
      .catch((error: unknown) => {
        if (!mounted) return;
        // Only clear auth state when backend explicitly says token is invalid.
        if (error instanceof ApiError && error.status === 401) {
          clearTokens();
          setUser(null);
        }
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

  useEffect(() => {
    if (isPublicPath || !user) {
      setPrayerReminder(null);
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const status = await fetchPrayerStatus();
        if (!active) {
          return;
        }
        if (status.shouldRemind && status.reminderText) {
          setPrayerReminder(status);
        }
      } catch {
        // best-effort polling only
      } finally {
        if (active) {
          timer = setTimeout(poll, 60_000);
        }
      }
    };

    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [isPublicPath, user]);

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

  if (isAuthPath) {
    return (
      <main id="main-content" className="min-h-screen">
        {children}
      </main>
    );
  }

  if (isPublicPath) {
    return (
      <main id="main-content" className="container-shell py-6">
        {children}
      </main>
    );
  }

  return (
    <div className="relative min-h-screen">
      <div className="app-shell-atmosphere" aria-hidden />
      <a
        href="#main-content"
        className="absolute left-[-9999px] top-0 z-[100] whitespace-nowrap rounded-control bg-card px-4 py-2 text-sm font-semibold text-text shadow-lg outline-none ring-2 ring-transparent transition focus:left-4 focus:top-4 focus:ring-black/25"
      >
        Skip to main content
      </a>
      <div className="container-shell flex min-h-screen flex-col gap-4 py-4 md:flex-row md:items-start md:gap-6 md:py-6">
      {prayerReminder ? (
        <div className="fixed left-1/2 top-4 z-30 w-[min(92vw,480px)] -translate-x-1/2 glass-panel-subtle px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">
              Time for Salah {prayerReminder.reminderPrayer ? `(${prayerReminder.reminderPrayer})` : ""}
            </p>
            <button
              className="btn-secondary px-3 py-1.5 text-xs"
              onClick={async () => {
                const reminderKey = prayerReminder.reminderKey;
                setPrayerReminder(null);
                if (reminderKey) {
                  await ackPrayerReminder(reminderKey);
                }
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      <BusinessPersonalizerDialog />
      <Nav />
      <main
        id="main-content"
        className="min-w-0 flex-1 px-1 pb-12 pt-2 sm:px-3 md:px-4 md:pb-14 md:pt-1"
        tabIndex={-1}
      >
        {children}
      </main>
      </div>
    </div>
  );
}
