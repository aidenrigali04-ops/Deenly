import * as Sentry from "@sentry/react-native";

let initialized = false;

function ensureSentryInit(): void {
  if (initialized) {
    return;
  }
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn) {
    return;
  }
  const sendInDev = process.env.EXPO_PUBLIC_SENTRY_SEND_IN_DEV === "1";
  if (__DEV__ && !sendInDev) {
    return;
  }

  Sentry.init({
    dsn,
    debug: __DEV__ && sendInDev,
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    enableAutoSessionTracking: true,
    sendDefaultPii: false
  });
  initialized = true;
}

ensureSentryInit();

/**
 * Optional crash reporting via Sentry. Set `EXPO_PUBLIC_SENTRY_DSN` for release builds.
 * In development, set `EXPO_PUBLIC_SENTRY_SEND_IN_DEV=1` to verify the integration.
 */
export function initCrashReporting(): void {
  ensureSentryInit();
}
