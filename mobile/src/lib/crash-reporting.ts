/**
 * Optional crash reporting. Set EXPO_PUBLIC_SENTRY_DSN when you add @sentry/react-native
 * (or your chosen SDK) and call Sentry.init here per vendor docs.
 */
export function initCrashReporting(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn) {
    return;
  }
  if (__DEV__) {
    return;
  }
  // Example after installing Sentry:
  // Sentry.init({ dsn, enableNative: true });
}
