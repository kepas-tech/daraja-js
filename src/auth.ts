/**
 * OAuth token management.
 *
 * Daraja access tokens live for 3599s (gotcha #12). We cache aggressively and
 * refresh only when the token is within a safety margin of expiry. Concurrent
 * callers during a refresh share a single in-flight request rather than
 * stampeding the OAuth endpoint. A failed refresh is not cached — the next call
 * retries cleanly.
 */

/** Shape returned by the OAuth endpoint. */
export interface TokenResponse {
  access_token: string;
  /** Seconds until expiry. Daraja sends 3599. */
  expires_in?: number;
}

export interface TokenManagerOptions {
  /** Performs the actual OAuth request. Injected so the manager stays pure. */
  fetchToken: () => Promise<TokenResponse>;
  /** Clock, in ms. Injectable for tests. Defaults to `Date.now`. */
  now?: () => number;
  /** Refresh this many seconds before the stated expiry. Default 30. */
  safetyMarginSec?: number;
}

const DEFAULT_TTL_SEC = 3599;

export class TokenManager {
  private readonly fetchToken: () => Promise<TokenResponse>;
  private readonly now: () => number;
  private readonly safetyMarginMs: number;

  private token: string | null = null;
  private expiresAtMs = 0;
  private inflight: Promise<string> | null = null;

  constructor(options: TokenManagerOptions) {
    this.fetchToken = options.fetchToken;
    this.now = options.now ?? Date.now;
    this.safetyMarginMs = (options.safetyMarginSec ?? 30) * 1000;
  }

  /** Return a valid access token, fetching or refreshing as needed. */
  async getToken(): Promise<string> {
    if (this.token !== null && this.now() < this.expiresAtMs) {
      return this.token;
    }
    if (this.inflight !== null) {
      return this.inflight;
    }
    this.inflight = this.refresh();
    try {
      return await this.inflight;
    } finally {
      this.inflight = null;
    }
  }

  private async refresh(): Promise<string> {
    const res = await this.fetchToken();
    const ttlSec = res.expires_in ?? DEFAULT_TTL_SEC;
    this.token = res.access_token;
    this.expiresAtMs = this.now() + ttlSec * 1000 - this.safetyMarginMs;
    return this.token;
  }
}
