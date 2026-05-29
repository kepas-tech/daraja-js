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

/**
 * Cross-process token cache (e.g. Redis). Values are opaque JSON strings the
 * manager serializes; you only wire `get`/`set` over your backend. The SDK has
 * no Redis dependency.
 */
export interface TokenStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export interface TokenManagerOptions {
  /** Performs the actual OAuth request. Injected so the manager stays pure. */
  fetchToken: () => Promise<TokenResponse>;
  /** Clock, in ms. Injectable for tests. Defaults to `Date.now`. */
  now?: () => number;
  /** Refresh this many seconds before the stated expiry. Default 30. */
  safetyMarginSec?: number;
  /** Optional cross-process cache. Requires `cacheKey`. */
  store?: TokenStore | undefined;
  /** Cache key — must be unique per environment + consumer key (gotcha #12). */
  cacheKey?: string | undefined;
}

const DEFAULT_TTL_SEC = 3599;

export class TokenManager {
  private readonly fetchToken: () => Promise<TokenResponse>;
  private readonly now: () => number;
  private readonly safetyMarginMs: number;
  private readonly store: TokenStore | undefined;
  private readonly cacheKey: string | undefined;

  private token: string | null = null;
  private expiresAtMs = 0;
  private inflight: Promise<string> | null = null;

  constructor(options: TokenManagerOptions) {
    this.fetchToken = options.fetchToken;
    this.now = options.now ?? Date.now;
    this.safetyMarginMs = (options.safetyMarginSec ?? 30) * 1000;
    this.store = options.store;
    this.cacheKey = options.cacheKey;
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
    // Cross-process: another instance may already hold a valid token.
    if (this.store && this.cacheKey) {
      const cached = await this.store.get(this.cacheKey);
      const adopted = this.adoptCached(cached);
      if (adopted !== null) {
        return adopted;
      }
    }

    const res = await this.fetchToken();
    const ttlSec = res.expires_in ?? DEFAULT_TTL_SEC;
    this.token = res.access_token;
    this.expiresAtMs = this.now() + ttlSec * 1000 - this.safetyMarginMs;

    if (this.store && this.cacheKey) {
      await this.store.set(
        this.cacheKey,
        JSON.stringify({ token: this.token, expiresAtMs: this.expiresAtMs }),
        ttlSec,
      );
    }
    return this.token;
  }

  /** Adopt a still-valid token from the store, or return null. */
  private adoptCached(cached: string | null): string | null {
    if (!cached) {
      return null;
    }
    try {
      const parsed = JSON.parse(cached) as { token?: unknown; expiresAtMs?: unknown };
      if (typeof parsed.token === 'string' && typeof parsed.expiresAtMs === 'number') {
        if (this.now() < parsed.expiresAtMs) {
          this.token = parsed.token;
          this.expiresAtMs = parsed.expiresAtMs;
          return parsed.token;
        }
      }
    } catch {
      // corrupt entry — fall through to a fresh fetch
    }
    return null;
  }
}
