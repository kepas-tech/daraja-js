/**
 * STK Push (Lipa na M-Pesa Online) — prompt a customer to authorize a payment
 * on their phone.
 *
 * Composes the validation primitives so the caller can't trip the gotchas:
 * `PartyA`/`PhoneNumber` go out as JSON numbers (#1), the timestamp is UTC (#3),
 * and the password is derived in the right order (#4).
 */

import type { DarajaConfig } from '../client.js';
import { DarajaValidationError, errorFromResponse } from '../errors.js';
import type { HttpClient } from '../http.js';
import { applyClassification, type CodeClassificationFields } from '../result-codes.js';
import { validateAmount } from '../validation/amount.js';
import { generatePassword } from '../validation/password.js';
import { phoneToNumber } from '../validation/phone.js';
import { makeTimestamp } from '../validation/timestamp.js';

export interface StkPushInput {
  /** Payer phone in any accepted format. */
  phone: string;
  /** Whole KES. */
  amount: number;
  /** Shown on the payer's statement; your invoice/order id. */
  accountReference: string;
  /** Short description of the charge. */
  description: string;
  /** HTTPS URL Safaricom posts the async result to. */
  callbackUrl: string;
}

export interface StkPushResult {
  merchantRequestId: string;
  checkoutRequestId: string;
  responseCode: string;
  responseDescription: string;
  customerMessage: string;
}

interface StkPushRaw {
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
  CustomerMessage?: string;
}

type StkConfig = Pick<DarajaConfig, 'shortcode' | 'passkey' | 'transactionType'>;

const ENDPOINT = '/mpesa/stkpush/v1/processrequest';

export async function stkPush(
  http: HttpClient,
  config: StkConfig,
  input: StkPushInput,
): Promise<StkPushResult> {
  // Validation throws DarajaValidationError before any network call.
  const partyA = phoneToNumber(input.phone);
  const amount = validateAmount(input.amount);
  const timestamp = makeTimestamp();
  const password = generatePassword(config.shortcode, config.passkey, timestamp);

  const payload = {
    BusinessShortCode: config.shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: config.transactionType ?? 'CustomerPayBillOnline',
    Amount: amount,
    PartyA: partyA, // JS number — gotcha #1
    PartyB: config.shortcode,
    PhoneNumber: partyA, // JS number — gotcha #1
    CallBackURL: input.callbackUrl,
    AccountReference: input.accountReference,
    TransactionDesc: input.description,
  };

  const raw = await http.post<StkPushRaw>(ENDPOINT, payload);

  if (raw.ResponseCode !== '0') {
    throw errorFromResponse({
      scope: 'stk',
      responseCode: raw.ResponseCode,
      errorMessage: raw.ResponseDescription,
      raw,
    });
  }

  return {
    merchantRequestId: raw.MerchantRequestID ?? '',
    checkoutRequestId: raw.CheckoutRequestID ?? '',
    responseCode: raw.ResponseCode,
    responseDescription: raw.ResponseDescription ?? '',
    customerMessage: raw.CustomerMessage ?? '',
  };
}

/** The async STK Push result Safaricom posts to your callback URL. */
export interface StkCallbackResult extends CodeClassificationFields {
  merchantRequestId: string;
  checkoutRequestId: string;
  resultCode: number;
  resultDesc: string;
  /** `true` when `resultCode === 0`. */
  success: boolean;
  amount?: number | undefined;
  mpesaReceiptNumber?: string | undefined;
  phoneNumber?: number | undefined;
  transactionDate?: number | undefined;
}

interface StkCallbackBody {
  Body?: {
    stkCallback?: {
      MerchantRequestID?: string;
      CheckoutRequestID?: string;
      ResultCode?: number;
      ResultDesc?: string;
      CallbackMetadata?: { Item?: Array<{ Name: string; Value?: unknown }> };
    };
  };
}

/**
 * Parse the STK Push result callback (the body Safaricom POSTs to your callback
 * URL). Note: Daraja does not sign this callback — pair it with IP allowlisting
 * for Safaricom's ranges. Accepts a parsed object or a raw JSON string.
 */
export function parseStkCallback(body: unknown): StkCallbackResult {
  const obj = (typeof body === 'string' ? JSON.parse(body) : body) as StkCallbackBody;
  const cb = obj?.Body?.stkCallback;
  if (!cb || cb.CheckoutRequestID == null || cb.ResultCode == null) {
    throw new DarajaValidationError('not an STK Push callback');
  }

  const result: StkCallbackResult = {
    merchantRequestId: cb.MerchantRequestID ?? '',
    checkoutRequestId: cb.CheckoutRequestID,
    resultCode: cb.ResultCode,
    resultDesc: cb.ResultDesc ?? '',
    success: cb.ResultCode === 0,
  };

  const items = cb.CallbackMetadata?.Item;
  if (items) {
    const value = (name: string): unknown => items.find((i) => i.Name === name)?.Value;
    result.amount = value('Amount') as number | undefined;
    result.mpesaReceiptNumber = value('MpesaReceiptNumber') as string | undefined;
    result.phoneNumber = value('PhoneNumber') as number | undefined;
    result.transactionDate = value('TransactionDate') as number | undefined;
  }

  return applyClassification(result, 'stk', result.resultCode, result.resultDesc);
}
