let scriptPromise: Promise<void> | null = null;

function loadGoogleScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google OAuth is only available in the browser"));
  }
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google script")), {
        once: true
      });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google script"));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export async function requestGoogleAccessToken(clientId: string): Promise<string> {
  if (!clientId) {
    throw new Error("Google sign-in is not configured.");
  }
  await loadGoogleScript();
  if (!window.google?.accounts?.oauth2) {
    throw new Error("Google OAuth is unavailable.");
  }
  const google = window.google;

  return new Promise((resolve, reject) => {
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "openid email profile",
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        if (!response.access_token) {
          reject(new Error("Google did not return an access token."));
          return;
        }
        resolve(response.access_token);
      }
    });

    tokenClient.requestAccessToken({ prompt: "select_account" });
  });
}
