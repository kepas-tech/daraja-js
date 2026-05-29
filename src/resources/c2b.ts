/**
 * C2B — capture payments customers make directly to your PayBill/Till.
 *
 * `registerUrls` tells Safaricom where to send validation + confirmation
 * callbacks. The confirmation callback is **terminal** (gotcha #8): the money is
 * already in your account and there is no second callback — and Safaricom does
 * NOT retry it (gotcha #9), so always reply 200 and recover misses via the Pull
 * Transaction API.
 */

import type { DarajaConfig } from '../client.js';
import { DarajaValidationError } from '../errors.js';
import type { HttpClient } from '../http.js';

type C2bConfig = Pick<DarajaConfig, 'shortcode'>;

/** What Safaricom does if your ValidationURL is unreachable. */
export type C2bResponseType = 'Completed' | 'Cancelled';

export interface RegisterUrlsInput {
  confirmationUrl: string;
  validationUrl: string;
  /** Fallback when validation can't be reached. Default `Completed`. */
  responseType?: C2bResponseType;
}

export interface RegisterUrlsResult {
  responseCode: string;
  responseDescription: string;
  originatorConversationId: string;
}

interface RegisterRaw {
  ResponseCode?: string;
  ResponseDescription?: string;
  // Daraja ships the misspelled key; tolerate the fixed spelling too.
  OriginatorCoversationID?: string;
  OriginatorConversationID?: string;
}

const REGISTER_ENDPOINT = '/mpesa/c2b/v2/registerurl';

export async function registerUrls(
  http: HttpClient,
  config: C2bConfig,
  input: RegisterUrlsInput,
): Promise<RegisterUrlsResult> {
  const raw = await http.post<RegisterRaw>(REGISTER_ENDPOINT, {
    ShortCode: config.shortcode,
    ResponseType: input.responseType ?? 'Completed',
    ConfirmationURL: input.confirmationUrl,
    ValidationURL: input.validationUrl,
  });
  return {
    responseCode: raw.ResponseCode ?? '',
    responseDescription: raw.ResponseDescription ?? '',
    originatorConversationId: raw.OriginatorCoversationID ?? raw.OriginatorConversationID ?? '',
  };
}

interface C2bRaw {
  TransactionType?: string;
  TransID?: string;
  TransTime?: string;
  TransAmount?: string;
  BusinessShortCode?: string;
  BillRefNumber?: string;
  InvoiceNumber?: string;
  OrgAccountBalance?: string;
  ThirdPartyTransID?: string;
  MSISDN?: string;
  FirstName?: string;
  MiddleName?: string;
  LastName?: string;
}

export interface C2bPayment {
  transactionType: string;
  /** M-Pesa receipt number. */
  transId: string;
  transTime: string;
  amount: number;
  shortCode: string;
  billRefNumber: string;
  invoiceNumber: string;
  orgAccountBalance?: number | undefined;
  thirdPartyTransId: string;
  /** Payer phone — or a hashed token in some callbacks. */
  msisdn: string;
  firstName: string;
  middleName: string;
  lastName: string;
}

export interface C2bConfirmation extends C2bPayment {
  /** Money is already settled; no second callback follows (gotcha #8). */
  terminal: true;
}

function parseBase(body: unknown): C2bPayment {
  const o = (typeof body === 'string' ? JSON.parse(body) : body) as C2bRaw | null;
  if (!o || o.TransID == null) {
    throw new DarajaValidationError('not a C2B payment payload (missing TransID)');
  }
  const payment: C2bPayment = {
    transactionType: o.TransactionType ?? '',
    transId: o.TransID,
    transTime: o.TransTime ?? '',
    amount: Number(o.TransAmount ?? 0),
    shortCode: o.BusinessShortCode ?? '',
    billRefNumber: o.BillRefNumber ?? '',
    invoiceNumber: o.InvoiceNumber ?? '',
    thirdPartyTransId: o.ThirdPartyTransID ?? '',
    msisdn: o.MSISDN ?? '',
    firstName: o.FirstName ?? '',
    middleName: o.MiddleName ?? '',
    lastName: o.LastName ?? '',
  };
  if (o.OrgAccountBalance != null && o.OrgAccountBalance !== '') {
    payment.orgAccountBalance = Number(o.OrgAccountBalance);
  }
  return payment;
}

/** Parse the confirmation callback (money already settled). Accepts object or JSON string. */
export function parseC2bConfirmation(body: unknown): C2bConfirmation {
  return { ...parseBase(body), terminal: true };
}

/** Parse the pre-payment validation callback. Reply with `c2bAccept()` or `c2bReject()`. */
export function parseC2bValidation(body: unknown): C2bPayment {
  return parseBase(body);
}

/** The body Safaricom expects to accept a validation request. */
export function c2bAccept(): { ResultCode: string; ResultDesc: string } {
  return { ResultCode: '0', ResultDesc: 'Accepted' };
}

/**
 * Reject a validation request. Default code `C2B00012` (invalid account); other
 * codes: C2B00011 invalid MSISDN, C2B00013 invalid amount, C2B00016 other.
 */
export function c2bReject(
  reason = 'Rejected',
  code = 'C2B00012',
): { ResultCode: string; ResultDesc: string } {
  return { ResultCode: code, ResultDesc: reason };
}
