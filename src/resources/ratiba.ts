/**
 * M-Pesa Ratiba — create a customer standing order (recurring collection).
 *
 * OAuth-only (no initiator). Triggers an STK/NI PIN push to the customer to
 * consent + opt-in, then creates the order. Conventions differ from the rest of
 * Daraja: the endpoint is `/standingorder/v1/...` (no `/mpesa/` prefix); the
 * sync ack nests success in `ResponseHeader.responseCode "200"`; the async
 * callback nests `responseBody.responseData[]` as `name`/`value` pairs (NOT
 * `Key`/`Value`). Doc casing is inconsistent — parse case-insensitively.
 *
 * Proof: docs/specs/mpesa-ratiba.md (official Safaricom portal spec).
 */

import type { DarajaConfig } from '../client.js';
import { DarajaValidationError, errorFromResponse } from '../errors.js';
import type { HttpClient } from '../http.js';
import { toArray } from '../internal.js';
import { applyClassification, type CodeClassificationFields } from '../result-codes.js';

type RatibaConfig = Pick<DarajaConfig, 'shortcode'>;

const ENDPOINT = '/standingorder/v1/createStandingOrderExternal';

/** 1 One-Off · 2 Daily · 3 Weekly · 4 Monthly · 5 Bi-Monthly · 6 Quarterly · 7 Half-Year · 8 Yearly. */
export type RatibaFrequency = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8';

export interface RatibaCreateInput {
  /** StandingOrderName — must be unique per customer (duplicate → 1050). */
  name: string;
  /** yyyymmdd. */
  startDate: string;
  /** yyyymmdd. */
  endDate: string;
  /** Paybill or Buy Goods. Sets TransactionType + ReceiverPartyIdentifierType. */
  transactionType: 'paybill' | 'buygoods';
  amount: number | string;
  /** Customer M-Pesa phone 2547XXXXXXXX (PartyA, the payer). */
  phone: string;
  callbackUrl: string;
  /** Account number for the paybill. Max 12 chars. */
  accountReference: string;
  /** Comment. Max 13 chars. */
  transactionDesc: string;
  frequency: RatibaFrequency;
  /** Destination shortcode. Defaults to `config.shortcode`. */
  businessShortCode?: string;
}

export interface RatibaAck {
  responseRefId: string;
  responseCode: string;
  responseDescription: string;
  resultDesc: string;
}

interface AckRaw {
  ResponseHeader?: {
    responseRefID?: string;
    responseCode?: string;
    responseDescription?: string;
    ResultDesc?: string;
  };
  ResponseBody?: { responseCode?: string; responseDescription?: string };
}

export async function create(
  http: HttpClient,
  config: RatibaConfig,
  input: RatibaCreateInput,
): Promise<RatibaAck> {
  const isPaybill = input.transactionType === 'paybill';
  const raw = await http.post<AckRaw>(ENDPOINT, {
    StandingOrderName: input.name,
    StartDate: input.startDate,
    EndDate: input.endDate,
    BusinessShortCode: input.businessShortCode ?? config.shortcode,
    TransactionType: isPaybill
      ? 'Standing Order Customer Pay Bill'
      : 'Standing Order Customer Pay Marchant', // Safaricom's misspelling — sent exactly
    ReceiverPartyIdentifierType: isPaybill ? '4' : '2',
    Amount: input.amount,
    PartyA: input.phone,
    CallBackURL: input.callbackUrl,
    AccountReference: input.accountReference.slice(0, 12),
    TransactionDesc: input.transactionDesc.slice(0, 13),
    Frequency: input.frequency,
  });
  const header = raw.ResponseHeader;
  if (header?.responseCode !== '200') {
    throw errorFromResponse({
      scope: 'ratiba',
      responseCode: header?.responseCode,
      errorMessage: header?.responseDescription,
      raw,
    });
  }
  return {
    responseRefId: header.responseRefID ?? '',
    responseCode: header.responseCode,
    responseDescription: header.responseDescription ?? '',
    resultDesc: header.ResultDesc ?? '',
  };
}

export interface RatibaCallback extends CodeClassificationFields {
  responseRefId: string;
  requestRefId: string;
  responseCode: string;
  responseDescription: string;
  success: boolean;
  transactionId?: string | undefined;
  status?: string | undefined;
  msisdn?: string | undefined;
  params: Record<string, unknown>;
}

/** Read a key case-insensitively from an object. */
function ci(obj: Record<string, unknown> | undefined, ...keys: string[]): unknown {
  if (!obj) return undefined;
  const lower = new Map(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]));
  for (const k of keys) {
    const v = lower.get(k.toLowerCase());
    if (v !== undefined) return v;
  }
  return undefined;
}

/**
 * Parse the async Ratiba callback. Tolerates the doc's inconsistent casing
 * (`ResponseHeader`/`responseHeader`, `Name`/`name`). Accepts object or JSON string.
 */
export function parseRatibaCallback(body: unknown): RatibaCallback {
  const o = (typeof body === 'string' ? JSON.parse(body) : body) as Record<string, unknown> | null;
  const header = ci(o ?? undefined, 'responseHeader') as Record<string, unknown> | undefined;
  const bodyObj = ci(o ?? undefined, 'responseBody') as Record<string, unknown> | undefined;
  if (!header) {
    throw new DarajaValidationError('not a Ratiba callback envelope');
  }
  const responseCode = String(ci(header, 'responseCode') ?? '');
  const params: Record<string, unknown> = {};
  for (const it of toArray(ci(bodyObj, 'responseData') as Array<Record<string, unknown>>)) {
    const name = ci(it, 'name');
    if (typeof name === 'string') params[name] = ci(it, 'value');
  }
  const out: RatibaCallback = {
    responseRefId: String(ci(header, 'responseRefID') ?? ''),
    requestRefId: String(ci(header, 'requestRefID') ?? ''),
    responseCode,
    responseDescription: String(ci(header, 'responseDescription') ?? ''),
    success: responseCode === '0',
    transactionId: params.TransactionID != null ? String(params.TransactionID) : undefined,
    status: params.Status != null ? String(params.Status) : undefined,
    msisdn: params.Msisdn != null ? String(params.Msisdn) : undefined,
    params,
  };
  return applyClassification(out, 'ratiba', responseCode, out.responseDescription);
}
