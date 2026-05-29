/**
 * Account Balance — query the balances on your shortcode (read-only).
 *
 * Async: the sync ack confirms acceptance; the balances arrive at your
 * `resultUrl`. The `AccountBalance` parameter is a pipe-delimited string with
 * `&`-separated accounts (gotcha #6): `Account|Currency|Current|Available|Reserved|Uncleared`.
 * Working = MMF (receives C2B); Utility = source of B2C. Requires initiator auth.
 */

import type { DarajaConfig } from '../client.js';
import { DarajaValidationError, errorFromResponse } from '../errors.js';
import type { HttpClient } from '../http.js';
import { toArray } from '../internal.js';
import { applyClassification, type CodeClassificationFields } from '../result-codes.js';

type BalanceConfig = Pick<DarajaConfig, 'shortcode' | 'initiator' | 'securityCredential'>;

export interface BalanceQueryInput {
  resultUrl: string;
  queueTimeoutUrl: string;
  remarks?: string;
}

export interface BalanceQueryResult {
  conversationId: string;
  originatorConversationId: string;
  responseCode: string;
  responseDescription: string;
}

export interface AccountBalanceEntry {
  account: string;
  currency: string;
  currentBalance: number;
  availableBalance: number;
  reserved: number;
  uncleared: number;
}

export interface BalanceResult extends CodeClassificationFields {
  resultCode: number;
  resultDesc: string;
  conversationId: string;
  originatorConversationId: string;
  success: boolean;
  balances: AccountBalanceEntry[];
}

interface AckRaw {
  ConversationID?: string;
  OriginatorConversationID?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
}

interface ResultEnvelope {
  Result?: {
    ResultCode?: number;
    ResultDesc?: string;
    ConversationID?: string;
    OriginatorConversationID?: string;
    ResultParameters?: { ResultParameter?: Array<{ Key: string; Value?: unknown }> };
  };
}

const ENDPOINT = '/mpesa/accountbalance/v1/query';

export async function query(
  http: HttpClient,
  config: BalanceConfig,
  input: BalanceQueryInput,
): Promise<BalanceQueryResult> {
  if (!config.initiator || !config.securityCredential) {
    throw new DarajaValidationError(
      'balance.query requires config.initiator and config.securityCredential',
    );
  }
  const raw = await http.post<AckRaw>(
    ENDPOINT,
    {
      Initiator: config.initiator,
      SecurityCredential: config.securityCredential,
      CommandID: 'AccountBalance',
      PartyA: Number(config.shortcode),
      IdentifierType: '4', // organization shortcode
      Remarks: (input.remarks ?? 'Balance query').slice(0, 100),
      QueueTimeOutURL: input.queueTimeoutUrl,
      ResultURL: input.resultUrl,
    },
    { retryable: true },
  ); // read-only query — safe to retry on 5xx
  if (raw.ResponseCode !== '0') {
    throw errorFromResponse({
      scope: 'balance',
      responseCode: raw.ResponseCode,
      errorMessage: raw.ResponseDescription,
      raw,
    });
  }
  return {
    conversationId: raw.ConversationID ?? '',
    originatorConversationId: raw.OriginatorConversationID ?? '',
    responseCode: raw.ResponseCode,
    responseDescription: raw.ResponseDescription ?? '',
  };
}

/**
 * Parse the pipe-delimited `AccountBalance` string into typed entries.
 * Format: `Account|Currency|Current|Available|Reserved|Uncleared`, accounts
 * joined by `&`.
 */
export function parseAccountBalance(raw: string): AccountBalanceEntry[] {
  if (!raw) {
    return [];
  }
  const entries: AccountBalanceEntry[] = [];
  for (const part of raw.split('&')) {
    const f = part.split('|');
    if (f.length >= 4) {
      entries.push({
        account: f[0] ?? '',
        currency: f[1] ?? '',
        currentBalance: Number.parseFloat(f[2] ?? '') || 0,
        availableBalance: Number.parseFloat(f[3] ?? '') || 0,
        reserved: Number.parseFloat(f[4] ?? '') || 0,
        uncleared: Number.parseFloat(f[5] ?? '') || 0,
      });
    }
  }
  return entries;
}

/** Parse the async Account Balance result callback. Accepts an object or JSON string. */
export function parseBalanceResult(body: unknown): BalanceResult {
  const o = (typeof body === 'string' ? JSON.parse(body) : body) as ResultEnvelope | null;
  const result = o?.Result;
  if (!result || result.ResultCode == null) {
    throw new DarajaValidationError('not a balance result envelope');
  }
  const items = toArray(result.ResultParameters?.ResultParameter);
  const rawBalance = items.find((i) => i.Key === 'AccountBalance')?.Value;
  const out: BalanceResult = {
    resultCode: result.ResultCode,
    resultDesc: result.ResultDesc ?? '',
    conversationId: result.ConversationID ?? '',
    originatorConversationId: result.OriginatorConversationID ?? '',
    success: result.ResultCode === 0,
    balances: parseAccountBalance(typeof rawBalance === 'string' ? rawBalance : ''),
  };
  return applyClassification(out, 'balance', out.resultCode, out.resultDesc);
}
