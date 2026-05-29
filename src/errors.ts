/**
 * Error hierarchy, modeled on Stripe's: a single `DarajaError` base with typed
 * subclasses so callers can branch on recoverable (e.g. insufficient funds,
 * user unreachable) vs fatal (auth) conditions.
 */

import { type DarajaScope, lookup } from './result-codes.js';

export interface DarajaErrorContext {
  /** Daraja `ResultCode` for an async/transaction failure. */
  resultCode?: number | undefined;
  /** Daraja `ResultDesc` — exposed verbatim, never reinterpreted. */
  resultDesc?: string | undefined;
  /** Daraja request/conversation id, for support correlation. */
  requestId?: string | undefined;
  /** Which API produced this — selects the proven per-scope catalog entry. */
  scope?: DarajaScope | undefined;
  /** Raw response payload, for debugging. */
  raw?: unknown;
}

/** Base class for every error thrown by the SDK. */
export class DarajaError extends Error {
  readonly requestId?: string | undefined;
  /**
   * Raw response payload, for explicit debugging. **Non-enumerable** so it is
   * not dumped into logs by `JSON.stringify`/`console.log`/error serializers —
   * Daraja responses can carry customer PII (MSISDN, receipts). Access via
   * `err.raw` when you actually need it.
   */
  declare readonly raw?: unknown;

  constructor(message: string, context: Pick<DarajaErrorContext, 'requestId' | 'raw'> = {}) {
    super(message);
    this.name = new.target.name;
    this.requestId = context.requestId;
    Object.defineProperty(this, 'raw', {
      value: context.raw,
      enumerable: false,
      writable: false,
      configurable: true,
    });
    // Restore prototype chain for transpiled/extends-Error correctness.
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /** Safe, raw-free serialization (used by `JSON.stringify`). */
  toJSON(): Record<string, unknown> {
    return { name: this.name, message: this.message, requestId: this.requestId };
  }
}

/** Client-side input validation failed before any request was sent. */
export class DarajaValidationError extends DarajaError {}

/** OAuth/credential failure — token request rejected, or HTTP 401. Fatal. */
export class DarajaAuthError extends DarajaError {}

/** Network-level failure: DNS, TLS, timeout, connection reset. Retryable. */
export class DarajaConnectionError extends DarajaError {}

/** Webhook signature missing, malformed, mismatched, or outside the replay window. */
export class DarajaSignatureError extends DarajaError {}

/** Daraja accepted the request but reported a non-success `ResultCode`. */
export class DarajaAPIError extends DarajaError {
  readonly resultCode?: number | undefined;
  readonly resultDesc?: string | undefined;

  constructor(message: string, context: DarajaErrorContext = {}) {
    super(message, { requestId: context.requestId, raw: context.raw });
    this.resultCode = context.resultCode;
    this.resultDesc = context.resultDesc;
  }

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), resultCode: this.resultCode, resultDesc: this.resultDesc };
  }
}

/** ResultCode 1 — payer has insufficient funds (no Fuliza). Recoverable. */
export class DarajaInsufficientFundsError extends DarajaAPIError {}

/** ResultCode 1037 — DS timeout, payer unreachable. Most common in prod. */
export class DarajaUserUnreachableError extends DarajaAPIError {}

/** ResultCode 1032 — payer cancelled the STK prompt. */
export class DarajaCancelledError extends DarajaAPIError {}

const CLASS_BY_NAME: Record<string, new (m: string, c?: DarajaErrorContext) => DarajaAPIError> = {
  DarajaAPIError,
  DarajaInsufficientFundsError,
  DarajaCancelledError,
  DarajaUserUnreachableError,
};

/**
 * Build the most specific error for a Daraja async result, enriched from the
 * proven code catalog. The thrown `message` is the catalog's authored,
 * actionable text WHEN the code is proven for this scope; otherwise it is
 * Safaricom's verbatim `resultDesc`. `resultCode`/`resultDesc`/`raw` are never
 * altered. `scope` defaults to `'stk'` for backward compatibility.
 */
export function errorFromResult(context: DarajaErrorContext): DarajaAPIError {
  const scope = context.scope ?? 'stk';
  const entry =
    context.resultCode != null ? lookup(scope, 'resultCode', context.resultCode) : undefined;
  const Ctor = (entry?.errorClass && CLASS_BY_NAME[entry.errorClass]) || DarajaAPIError;
  const message =
    entry?.authoredMessage ??
    context.resultDesc ??
    `Daraja error (ResultCode ${context.resultCode ?? 'unknown'})`;
  return new Ctor(message, context);
}

/**
 * Build an error for a SYNCHRONOUS rejection (a non-success `ResponseCode` /
 * dotted `errorCode`). Enriches the message from the catalog when the code is
 * proven for this scope; otherwise uses Safaricom's `errorMessage` verbatim.
 */
export function errorFromResponse(context: {
  scope: DarajaScope;
  responseCode?: string | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  requestId?: string | undefined;
  raw?: unknown;
}): DarajaAPIError {
  const codeValue = context.errorCode ?? context.responseCode;
  const entry = codeValue != null ? lookup(context.scope, 'responseCode', codeValue) : undefined;
  const message =
    entry?.authoredMessage ??
    context.errorMessage ??
    `${context.scope.toUpperCase()} request was not accepted`;
  return new DarajaAPIError(message, { requestId: context.requestId, raw: context.raw });
}
