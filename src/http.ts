/**
 * HTTP transport for Daraja.
 *
 * A thin wrapper over native `fetch`: injects the bearer token, enforces a
 * timeout, and maps responses onto the error hierarchy. Retries are deliberately
 * limited to 5xx responses — Safaricom's explicit "try again" signal. A timeout
 * or network error is NOT retried, because re-sending a payment POST that may
 * have already been processed risks a double charge.
 */

import { DarajaAPIError, DarajaAuthError, DarajaConnectionError } from './errors.js';

interface HttpClientOptions {
  /** Base URL, e.g. `https://api.safaricom.co.ke`. */
  baseUrl: string;
  /** Supplies a valid OAuth token (from the TokenManager). */
  getToken: () => Promise<string>;
  /** `fetch` implementation. Defaults to the global. Injectable for tests. */
  fetchImpl?: typeof fetch | undefined;
  /** Per-request timeout in ms. Default 30000. */
  timeoutMs?: number | undefined;
  /** Max retries on 5xx. Default 2. */
  maxRetries?: number | undefined;
  /** Backoff sleep. Injectable so tests run instantly. */
  sleep?: (ms: number) => Promise<void>;
}

interface DarajaErrorBody {
  requestId?: string;
  errorMessage?: string;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class HttpClient {
  private readonly baseUrl: string;
  private readonly getToken: () => Promise<string>;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.getToken = options.getToken;
    this.fetchImpl = options.fetchImpl;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.sleep = options.sleep ?? defaultSleep;
  }

  /**
   * POST a JSON body and return the parsed JSON response.
   *
   * `retryable` gates 5xx retries and defaults to **false** — payment-safe: a 5xx
   * returned after Safaricom queued a money-moving request must NOT be re-sent
   * (duplicate disbursement risk). Only idempotent calls (queries, registrations)
   * pass `retryable: true`. Timeouts/network errors are never retried regardless.
   */
  async post<T = unknown>(
    path: string,
    body: unknown,
    opts: { retryable?: boolean } = {},
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      if (attempt > 0) {
        await this.sleep(200 * 2 ** (attempt - 1));
      }
      try {
        return await this.attempt<T>(path, body);
      } catch (err) {
        lastError = err;
        if (!opts.retryable || !isRetryable(err)) {
          throw err;
        }
      }
    }
    throw lastError;
  }

  private async attempt<T>(path: string, body: unknown): Promise<T> {
    const token = await this.getToken();
    const fetchFn = this.fetchImpl ?? globalThis.fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await fetchFn(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      const timedOut = controller.signal.aborted;
      throw new DarajaConnectionError(
        timedOut ? `request timed out after ${this.timeoutMs}ms` : 'network error reaching Daraja',
        { raw: err },
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    const json = text ? safeParse(text) : undefined;

    if (!res.ok) {
      const errBody = (json ?? {}) as DarajaErrorBody;
      const ctx = { raw: json ?? text, requestId: errBody.requestId };
      if (res.status === 401) {
        throw new DarajaAuthError('authentication failed (HTTP 401)', ctx);
      }
      const message = errBody.errorMessage ?? `Daraja request failed (HTTP ${res.status})`;
      throw new DarajaHttpError(res.status, message, ctx);
    }

    return json as T;
  }
}

/** Internal: a DarajaAPIError that remembers its HTTP status for retry logic. */
class DarajaHttpError extends DarajaAPIError {
  readonly httpStatus: number;
  constructor(
    httpStatus: number,
    message: string,
    ctx: { raw?: unknown; requestId?: string | undefined },
  ) {
    super(message, ctx);
    this.httpStatus = httpStatus;
  }
}

function isRetryable(err: unknown): boolean {
  return err instanceof DarajaHttpError && err.httpStatus >= 500;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
