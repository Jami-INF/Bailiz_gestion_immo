// Déclarations minimales pour Google Identity Services (script gsi/client),
// chargé dynamiquement par lib/gdrive.ts. Seul le flux « token client »
// (OAuth 2.0 implicite) est utilisé.

interface GisTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface GisTokenClient {
  requestAccessToken(config?: { prompt?: '' | 'consent' | 'select_account' }): void;
}

declare namespace google.accounts.oauth2 {
  function initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: GisTokenResponse) => void;
    error_callback?: (error: unknown) => void;
  }): GisTokenClient;
  function revoke(accessToken: string, callback?: () => void): void;
}
