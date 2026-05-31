/**
 * Lipa na Bonga — accept payment in Bonga loyalty points (Ksh 0.2 / point).
 *
 * OAuth-only. Two endpoints, nested `header`/`body` envelope (sync success is
 * `header.responseCode 200`):
 * - `calculatePoints` — informational points→KES conversion. Synchronous, retryable.
 * - `redeem` — redeem points as payment; async, triggers an STK PIN push. The
 *   final settlement lands on the EXISTING C2B confirmation callback (parse with
 *   `parseC2bConfirmation`) — no Bonga-specific result parser is needed here.
 *
 * Proof: docs/specs/lipa-na-bonga.md (official Safaricom portal spec).
 */

import type { DarajaConfig } from '../client.js';
import { errorFromResponse } from '../errors.js';
import type { HttpClient } from '../http.js';

type BongaConfig = Pick<DarajaConfig, 'shortcode'>;

const CALCULATE = '/v1/lipa/na/bonga/calculate-points';
const REDEEM = '/v1/lipa/na/bonga/redeem-paybill';

interface NestedRaw {
  header?: {
    requestRefId?: string;
    responseCode?: number | string;
    responseMessage?: string;
    customerMessage?: string;
  };
  body?: { amount?: string; points?: string; rate?: string } | null;
}

export interface CalculatePointsInput {
  points: number | string;
}

export interface CalculatePointsResult {
  requestRefId: string;
  responseCode: string;
  responseMessage: string;
  amount: string;
  points: string;
  rate: string;
  success: boolean;
}

export interface RedeemInput {
  /** Customer phone 254…. */
  msisdn: string;
  /** KES equivalent. */
  amount: number | string;
  bongaPoints: number | string;
  /** Ksh per point, e.g. 0.2. */
  conversionRate: number | string;
  accountNumber: string;
  /** Merchant paybill/till. Defaults to `config.shortcode`. */
  shortCode?: string;
}

export interface RedeemAck {
  requestRefId: string;
  responseCode: string;
  responseMessage: string;
  customerMessage: string;
  success: boolean;
}

/** Success = `header.responseCode === 200` (string or number). */
function assertOk(raw: NestedRaw): NonNullable<NestedRaw['header']> {
  const header = raw.header ?? {};
  if (String(header.responseCode) !== '200') {
    throw errorFromResponse({
      scope: 'bonga',
      responseCode: header.responseCode != null ? String(header.responseCode) : undefined,
      errorMessage: header.customerMessage ?? header.responseMessage,
      raw,
    });
  }
  return header;
}

export async function calculatePoints(
  http: HttpClient,
  input: CalculatePointsInput,
): Promise<CalculatePointsResult> {
  const raw = await http.post<NestedRaw>(CALCULATE, { points: input.points }, { retryable: true }); // read-only conversion
  const header = assertOk(raw);
  const body = raw.body ?? {};
  return {
    requestRefId: header.requestRefId ?? '',
    responseCode: String(header.responseCode ?? ''),
    responseMessage: header.responseMessage ?? '',
    amount: body.amount ?? '',
    points: body.points ?? '',
    rate: body.rate ?? '',
    success: true,
  };
}

export async function redeem(
  http: HttpClient,
  config: BongaConfig,
  input: RedeemInput,
): Promise<RedeemAck> {
  // Money-mover — default (non-retryable) post.
  const raw = await http.post<NestedRaw>(REDEEM, {
    msisdn: input.msisdn,
    amount: input.amount,
    bongaPoints: input.bongaPoints,
    conversionRate: input.conversionRate,
    shortCode: input.shortCode ?? config.shortcode,
    accountNumber: input.accountNumber,
  });
  const header = assertOk(raw);
  return {
    requestRefId: header.requestRefId ?? '',
    responseCode: String(header.responseCode ?? ''),
    responseMessage: header.responseMessage ?? '',
    customerMessage: header.customerMessage ?? '',
    success: true,
  };
}
