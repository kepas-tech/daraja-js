/**
 * daraja-js — type-safe Node.js/TypeScript SDK for Safaricom Daraja (M-Pesa).
 *
 * @packageDocumentation
 */

/** Package version, replaced at build time. */
export const VERSION = '0.0.0';

// Client
export { Daraja, type DarajaConfig } from './client.js';
export type { StkPushInput, StkPushResult } from './resources/stk-push.js';

// Error hierarchy
export {
  DarajaError,
  DarajaValidationError,
  DarajaAuthError,
  DarajaConnectionError,
  DarajaAPIError,
  DarajaInsufficientFundsError,
  DarajaUserUnreachableError,
  DarajaCancelledError,
  errorFromResult,
  type DarajaErrorContext,
} from './errors.js';

// Validation + request primitives (the gotcha-defeating layer)
export { normalizePhone, phoneToNumber } from './validation/phone.js';
export { makeTimestamp } from './validation/timestamp.js';
export { generatePassword } from './validation/password.js';
export { validateAmount } from './validation/amount.js';
