/**
 * daraja-js — type-safe Node.js/TypeScript SDK for Safaricom Daraja (M-Pesa).
 *
 * @packageDocumentation
 */

declare const __DARAJA_VERSION__: string;

/** Package version, injected from package.json at build time. */
export const VERSION: string =
  typeof __DARAJA_VERSION__ === 'undefined' ? '0.0.0-dev' : __DARAJA_VERSION__;

// Cross-process token cache
export type { TokenStore } from './auth.js';
// Client
export { Daraja, type DarajaConfig } from './client.js';
// SecurityCredential generation (initiator-authed APIs)
export {
  generateSecurityCredential,
  type SecurityCredentialInput,
} from './crypto/security-credential.js';
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
  errorFromResponse,
  errorFromResult,
} from './errors.js';
// B2B — pay another business + float transfers
export {
  type B2bAck,
  type B2bCommandId,
  type B2bPayInput,
  type B2bResult,
  type FloatTransferInput,
  parseB2bResult,
} from './resources/b2b.js';
// B2C — disbursement + result parsing
export {
  type B2cCommandId,
  type B2cResult,
  type B2cSendInput,
  type B2cSendResult,
  parseB2cResult,
} from './resources/b2c.js';
// Balance — query + pipe-delimited parser (gotcha #6)
export {
  type AccountBalanceEntry,
  type BalanceQueryInput,
  type BalanceQueryResult,
  type BalanceResult,
  parseAccountBalance,
  parseBalanceResult,
} from './resources/balance.js';
// C2B — registration + callback parsing + validation responses
export {
  type C2bConfirmation,
  type C2bPayment,
  type C2bResponseType,
  c2bAccept,
  c2bReject,
  parseC2bConfirmation,
  parseC2bValidation,
  type RegisterUrlsInput,
  type RegisterUrlsResult,
} from './resources/c2b.js';
// Pull Transactions — recon backfill (Daraja 3.0)
export type {
  PullQueryInput,
  PullQueryResult,
  PullRegisterInput,
  PullRegisterResult,
} from './resources/pull.js';
// QR — dynamic QR generation
export type { QrGenerateInput, QrGenerateResult, QrTrxCode } from './resources/qr.js';
// Reversal — request + result parsing + recipient-spend classifier
export {
  isSettledByRecipientSpend,
  parseReversalResult,
  type ReversalAck,
  type ReversalInput,
  type ReversalResult,
} from './resources/reversal.js';
// Transaction status — STK (sync) + transaction (async)
export {
  parseStatusResult,
  type StatusAck,
  type StatusResult,
  type StkStatusInput,
  type StkStatusResult,
  type TransactionStatusInput,
} from './resources/status.js';
export {
  parseStkCallback,
  type StkCallbackResult,
  type StkPushInput,
  type StkPushResult,
} from './resources/stk-push.js';
// Proven result-code catalog (meaningful messages)
export {
  applyClassification,
  CATALOG,
  type CatalogEntry,
  type Classification,
  type CodeClassificationFields,
  type CodeType,
  classify,
  type DarajaErrorClassName,
  type DarajaScope,
  lookup,
  type ProofRef,
} from './result-codes.js';
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
