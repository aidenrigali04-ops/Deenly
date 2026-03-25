type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
};

type GoogleOAuth2 = {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
  }) => GoogleTokenClient;
};

type GoogleIdentity = {
  oauth2: GoogleOAuth2;
};

declare global {
  interface Window {
    google?: {
      accounts: GoogleIdentity;
    };
  }
}

export {};
