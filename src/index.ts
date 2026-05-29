/**
 * daraja-js — type-safe Node.js/TypeScript SDK for Safaricom Daraja (M-Pesa).
 *
 * @packageDocumentation
 */

/** Package version, replaced at build time. */
export const VERSION = '0.0.0';

// Client
export { Daraja, type DarajaConfig } from './client.js';
// Error hierarchy
export {
  DarajaAPIError,
  DarajaAuthError,
  DarajaCancelledError,
  DarajaConnectionError,
  DarajaError,
  type DarajaErrorContext,
  DarajaInsufficientFundsError,
  DarajaSignatureError,
  DarajaUserUnreachableError,
  DarajaValidationError,
  errorFromResult,
} from './errors.js';
export {
  parseStkCallback,
  type StkCallbackResult,
  type StkPushInput,
  type StkPushResult,
} from './resources/stk-push.js';
export { validateAmount } from './validation/amount.js';
export { generatePassword } from './validation/password.js';
// Validation + request primitives (the gotcha-defeating layer)
export { normalizePhone, phoneToNumber } from './validation/phone.js';
export { makeTimestamp } from './validation/timestamp.js';
// Webhook signing + verification (Stripe-compatible)
export {
  type SignParams as WebhookSignParams,
  type VerifyParams as WebhookVerifyParams,
  webhooks,
} from './webhooks.js';
