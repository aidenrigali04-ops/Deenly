"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { fetchSessionMe } from "@/lib/auth";
import { clearTokens, getAccessToken } from "@/lib/storage";
import { ApiError } from "@/lib/api";
import { useSessionStore } from "@/store/session-store";
import { Nav } from "@/components/nav";
import { SocialBottomNav, SocialCreateFab } from "@/components/social/social-bottom-nav";
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
  const isAdminShell = Boolean(pathname?.startsWith("/admin"));
  const hideCreateFab = Boolean(pathname?.startsWith("/create") || pathname?.startsWith("/reels"));

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

  if (isAdminShell) {
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

  return (
    <div className="social-shell relative min-h-dvh bg-social-bg text-white">
      <div
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
        aria-hidden
      >
        <div className="social-atmosphere-blob absolute -left-[22%] -top-[28%] h-[min(120vw,520px)] w-[min(120vw,520px)] rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(120,30,40,0.55),transparent_62%)] blur-2xl" />
        <div className="social-atmosphere-blob absolute -right-[18%] top-[8%] h-[min(100vw,440px)] w-[min(100vw,440px)] rounded-full bg-[radial-gradient(circle_at_70%_40%,rgba(80,20,35,0.45),transparent_58%)] blur-2xl" />
      </div>
      <a
        href="#main-content"
        className="absolute left-[-9999px] top-0 z-[100] whitespace-nowrap rounded-control bg-white px-4 py-2 text-sm font-semibold text-black shadow-lg outline-none ring-2 ring-transparent transition focus:left-4 focus:top-4 focus:ring-social-accent"
      >
        Skip to main content
      </a>
      {prayerReminder ? (
        <div className="fixed left-1/2 top-4 z-30 w-[min(92vw,480px)] -translate-x-1/2 rounded-2xl border border-white/15 bg-black/70 px-4 py-3 text-white shadow-lg backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">
              Time for Salah {prayerReminder.reminderPrayer ? `(${prayerReminder.reminderPrayer})` : ""}
            </p>
            <button
              className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15"
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
      <main
        id="main-content"
        className="relative z-[1] mx-auto w-full max-w-[390px] px-5 pb-[calc(5.25rem+env(safe-area-inset-bottom))] pt-2 sm:pb-28"
        tabIndex={-1}
      >
        {children}
      </main>
      <SocialBottomNav />
      {hideCreateFab ? null : <SocialCreateFab />}
    </div>
  );
}
