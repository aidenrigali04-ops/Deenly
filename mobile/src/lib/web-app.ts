/**
 * Public web app origin for opening Terms, Privacy, etc. in the device browser.
 * Override in mobile/.env with EXPO_PUBLIC_WEB_APP_URL (no trailing slash).
 */
export function getWebAppBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_WEB_APP_URL?.trim().replace(/\/$/, "");
  if (raw) {
    return raw;
  }
  return "https://deenly.app";
}

export function webTermsUrl() {
  return `${getWebAppBaseUrl()}/terms`;
}

export function webPrivacyUrl() {
  return `${getWebAppBaseUrl()}/privacy`;
}
