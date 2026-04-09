import * as Sentry from "@sentry/react";

let initialized = false;

export function initSentryBrowser(): void {
  if (typeof window === "undefined" || initialized) {
    return;
  }
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn) {
    return;
  }
  if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_SENTRY_SEND_IN_DEV !== "1") {
    return;
  }
  Sentry.init({
    dsn,
    tracesSampleRate: 0.15,
    sendDefaultPii: false
  });
  initialized = true;
}

export function captureException(error: unknown): void {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn) {
    return;
  }
  if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_SENTRY_SEND_IN_DEV !== "1") {
    return;
  }
  if (!initialized) {
    initSentryBrowser();
  }
  Sentry.captureException(error);
}
