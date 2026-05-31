/**
 * B2B Express Checkout (USSD Push to Till).
 *
 * A vendor (paybill) triggers a USSD push to a fellow merchant's till; the
 * merchant enters their Operator ID + M-Pesa PIN to pay the vendor's paybill.
 *
 * Structural outlier vs the rest of Daraja: OAuth-only, camelCase body, a
 * `code`/`status` sync ack (NOT `ResponseCode`), and a FLAT async callback
 * (top-level `resultCode`, no `Result{}` envelope).
 *
 * Proof: docs/specs/b2b-express-checkout.md (official Safaricom portal spec).
 */

import { randomUUID } from 'node:crypto';
import { DarajaValidationError, errorFromResponse } from '../errors.js';
import type { HttpClient } from '../http.js';
import { applyClassification, type CodeClassificationFields } from '../result-codes.js';

const ENDPOINT = '/v1/ussdpush/get-msisdn';

export interface ExpressCheckoutInput {
  /** Debit party: the MERCHANT's till/shortcode (money sender). */
  primaryShortCode: string;
  /** Credit party: the VENDOR's paybill (receives money). */
  receiverShortCode: string;
  amount: number | string;
  /** Reference shown in the merchant's prompt text. */
  paymentRef: string;
  callbackUrl: string;
  /** Vendor friendly name as known by the merchant. */
  partnerName: string;
  /** Unique per request. Generated (UUID) if omitted. Sent as `RequestRefID`. */
  requestRefId?: string;
}

export interface ExpressCheckoutAck {
  /** `'0'` = USSD push initiated (non-0 throws). */
  code: string;
  status: string;
  requestRefId: string;
}

interface AckRaw {
  code?: string;
  status?: string;
}

export async function checkout(
  http: HttpClient,
  input: ExpressCheckoutInput,
): Promise<ExpressCheckoutAck> {
  const requestRefId = input.requestRefId ?? randomUUID();
  const raw = await http.post<AckRaw>(ENDPOINT, {
    primaryShortCode: input.primaryShortCode,
    receiverShortCode: input.receiverShortCode,
    amount: input.amount,
    paymentRef: input.paymentRef,
    callbackUrl: input.callbackUrl,
    partnerName: input.partnerName,
    RequestRefID: requestRefId, // wire casing: capital ID
  });
  if (raw.code !== '0') {
    throw errorFromResponse({
      scope: 'b2bexpress',
      responseCode: raw.code,
      errorMessage: raw.status,
      raw,
    });
  }
  return { code: raw.code, status: raw.status ?? '', requestRefId };
}

export interface ExpressCallback extends CodeClassificationFields {
  resultCode: string;
  resultDesc: string;
  requestId: string;
  amount: string;
  success: boolean;
  paymentReference?: string | undefined;
  resultType?: string | undefined;
  conversationId?: string | undefined;
  transactionId?: string | undefined;
  status?: string | undefined;
}

interface CallbackRaw {
  resultCode?: string;
  resultDesc?: string;
  requestId?: string;
  amount?: string;
  paymentReference?: string;
  resultType?: string;
  conversationID?: string;
  transactionId?: string;
  status?: string;
}

/**
 * Parse the FLAT B2B Express callback (top-level fields, no `Result{}` envelope).
 * Accepts object or JSON string.
 */
export function parseExpressCallback(body: unknown): ExpressCallback {
  const o = (typeof body === 'string' ? JSON.parse(body) : body) as CallbackRaw | null;
  if (!o || o.resultCode == null) {
    throw new DarajaValidationError('not a B2B Express callback (missing resultCode)');
  }
  const out: ExpressCallback = {
    resultCode: o.resultCode,
    resultDesc: o.resultDesc ?? '',
    requestId: o.requestId ?? '',
    amount: o.amount ?? '',
    success: o.resultCode === '0',
    paymentReference: o.paymentReference,
    resultType: o.resultType,
    conversationId: o.conversationID,
    transactionId: o.transactionId,
    status: o.status,
  };
  return applyClassification(out, 'b2bexpress', out.resultCode, out.resultDesc);
}
