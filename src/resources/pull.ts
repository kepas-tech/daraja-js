/**
 * Pull Transaction API (Daraja 3.0) — backfill C2B payments missed because a
 * confirmation callback failed (Safaricom does not retry them — gotcha #9).
 * Records are available for ~48 hours.
 *
 * Gotcha #10: endpoints are `/pulltransactions/v1/*` with NO `/mpesa/` prefix;
 * `NominatedNumber` must be a phone in `254…` form (not the shortcode); and
 * `OffSetValue` (capital S) must be a number.
 */

import type { DarajaConfig } from '../client.js';
import { errorFromResponse } from '../errors.js';
import type { HttpClient } from '../http.js';
import { normalizePhone } from '../validation/phone.js';

type PullConfig = Pick<DarajaConfig, 'shortcode'>;

export interface PullRegisterInput {
  /** The merchant phone to nominate (254… — NOT the shortcode). */
  nominatedNumber: string;
  callbackUrl: string;
}

export interface PullRegisterResult {
  /** `1000` (registered) or `1001` (already registered) on success. */
  responseStatus: string;
  raw: unknown;
}

export interface PullQueryInput {
  /** `YYYY-MM-DD HH:mm:ss` (EAT). */
  startDate: string;
  endDate: string;
  /** Pagination offset. Default 0. */
  offset?: number;
}

export interface PullQueryResult {
  responseCode: string;
  transactions: Array<Record<string, unknown>>;
}

const REGISTER = '/pulltransactions/v1/register';
const QUERY = '/pulltransactions/v1/query';

export async function registerUrl(
  http: HttpClient,
  config: PullConfig,
  input: PullRegisterInput,
): Promise<PullRegisterResult> {
  const raw = await http.post<Record<string, unknown>>(REGISTER, {
    ShortCode: Number(config.shortcode),
    RequestType: 'Pull',
    NominatedNumber: normalizePhone(input.nominatedNumber),
    CallBackURL: input.callbackUrl,
  });
  const status = String(raw['Response Status'] ?? '');
  // 1000 = first registration, 1001 = already registered — both are success.
  if (status !== '1000' && status !== '1001') {
    throw errorFromResponse({
      scope: 'pull',
      errorMessage: `Pull registration was not accepted (status ${status || 'unknown'})`,
      raw,
    });
  }
  return { responseStatus: status, raw };
}

export async function query(
  http: HttpClient,
  config: PullConfig,
  input: PullQueryInput,
): Promise<PullQueryResult> {
  const raw = await http.post<Record<string, unknown>>(QUERY, {
    ShortCode: Number(config.shortcode),
    StartDate: input.startDate,
    EndDate: input.endDate,
    OffSetValue: input.offset ?? 0,
  });
  // Response is a nested array [[rec, rec, ...]] — flatten one level.
  const resp = (raw as { Response?: unknown }).Response;
  const transactions = (Array.isArray(resp) ? resp : []).flat() as Array<Record<string, unknown>>;
  return {
    responseCode: String((raw as { ResponseCode?: unknown }).ResponseCode ?? ''),
    transactions,
  };
}
