/**
 * Error hierarchy, modeled on Stripe's: a single `DarajaError` base with typed
 * subclasses so callers can branch on recoverable (e.g. insufficient funds,
 * user unreachable) vs fatal (auth) conditions.
 */

export interface DarajaErrorContext {
  /** Daraja `ResultCode` for an async/transaction failure. */
  resultCode?: number | undefined;
  /** Daraja `ResultDesc` — exposed verbatim, never reinterpreted. */
  resultDesc?: string | undefined;
  /** Daraja request/conversation id, for support correlation. */
  requestId?: string | undefined;
  /** Raw response payload, for debugging. */
  raw?: unknown;
}

/** Base class for every error thrown by the SDK. */
export class DarajaError extends Error {
  readonly requestId?: string | undefined;
  readonly raw?: unknown;

  constructor(message: string, context: Pick<DarajaErrorContext, 'requestId' | 'raw'> = {}) {
    super(message);
    this.name = new.target.name;
    this.requestId = context.requestId;
    this.raw = context.raw;
    // Restore prototype chain for transpiled/extends-Error correctness.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Client-side input validation failed before any request was sent. */
export class DarajaValidationError extends DarajaError {}

/** OAuth/credential failure — token request rejected, or HTTP 401. Fatal. */
export class DarajaAuthError extends DarajaError {}

/** Network-level failure: DNS, TLS, timeout, connection reset. Retryable. */
export class DarajaConnectionError extends DarajaError {}

/** Daraja accepted the request but reported a non-success `ResultCode`. */
export class DarajaAPIError extends DarajaError {
  readonly resultCode?: number | undefined;
  readonly resultDesc?: string | undefined;

  constructor(message: string, context: DarajaErrorContext = {}) {
    super(message, { requestId: context.requestId, raw: context.raw });
    this.resultCode = context.resultCode;
    this.resultDesc = context.resultDesc;
  }
}

/** ResultCode 1 — payer has insufficient funds (no Fuliza). Recoverable. */
export class DarajaInsufficientFundsError extends DarajaAPIError {}

/** ResultCode 1037 — DS timeout, payer unreachable. Most common in prod. */
export class DarajaUserUnreachableError extends DarajaAPIError {}

/** ResultCode 1032 — payer cancelled the STK prompt. */
export class DarajaCancelledError extends DarajaAPIError {}

const RESULT_CODE_MAP: Record<number, new (m: string, c?: DarajaErrorContext) => DarajaAPIError> = {
  1: DarajaInsufficientFundsError,
  1032: DarajaCancelledError,
  1037: DarajaUserUnreachableError,
};

/**
 * Build the most specific error for a Daraja result. Unmapped codes fall back
 * to a generic `DarajaAPIError` carrying the verbatim `ResultDesc`.
 */
export function errorFromResult(context: DarajaErrorContext): DarajaAPIError {
  const Ctor =
    (context.resultCode != null && RESULT_CODE_MAP[context.resultCode]) || DarajaAPIError;
  const message =
    context.resultDesc ?? `Daraja error (ResultCode ${context.resultCode ?? 'unknown'})`;
  return new Ctor(message, context);
}
