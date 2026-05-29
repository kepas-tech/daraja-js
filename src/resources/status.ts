/**
 * Transaction status queries.
 *
 * - `stkPush` — query an STK Push outcome by CheckoutRequestID. SYNCHRONOUS:
 *   Daraja returns the result inline (no callback). Uses passkey auth.
 * - `transaction` — query any transaction by receipt. ASYNC + initiator-authed;
 *   the result lands at your `resultUrl` (parse with `parseStatusResult`).
 */

import type { DarajaConfig } from '../client.js';
import { DarajaValidationError, errorFromResponse } from '../errors.js';
import type { HttpClient } from '../http.js';
import { toArray } from '../internal.js';
import { applyClassification, type CodeClassificationFields } from '../result-codes.js';
import { generatePassword } from '../validation/password.js';
import { makeTimestamp } from '../validation/timestamp.js';

type StatusConfig = Pick<
  DarajaConfig,
  'shortcode' | 'passkey' | 'initiator' | 'securityCredential'
>;

export interface StkStatusInput {
  checkoutRequestId: string;
}

export interface StkStatusResult {
  merchantRequestId: string;
  checkoutRequestId: string;
  responseCode: string;
  responseDescription: string;
  resultCode: string;
  resultDesc: string;
  success: boolean;
}

interface StkStatusRaw {
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
  ResultCode?: string;
  ResultDesc?: string;
}

export interface TransactionStatusInput {
  transactionId: string;
  resultUrl: string;
  queueTimeoutUrl: string;
  remarks?: string;
  /** Identifier of PartyA. Default `4` (shortcode). */
  identifierType?: string;
}

export interface StatusAck {
  conversationId: string;
  originatorConversationId: string;
  responseCode: string;
  responseDescription: string;
}

interface AckRaw {
  ConversationID?: string;
  OriginatorConversationID?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
}

export interface StatusResult extends CodeClassificationFields {
  resultCode: number;
  resultDesc: string;
  conversationId: string;
  originatorConversationId: string;
  transactionId: string;
  success: boolean;
  params: Record<string, unknown>;
}

interface ResultEnvelope {
  Result?: {
    ResultCode?: number;
    ResultDesc?: string;
    ConversationID?: string;
    OriginatorConversationID?: string;
    TransactionID?: string;
    ResultParameters?: { ResultParameter?: Array<{ Key: string; Value?: unknown }> };
  };
}

const STK_QUERY = '/mpesa/stkpushquery/v1/query';
const TX_QUERY = '/mpesa/transactionstatus/v1/query';

export async function stkPush(
  http: HttpClient,
  config: StatusConfig,
  input: StkStatusInput,
): Promise<StkStatusResult> {
  const timestamp = makeTimestamp();
  const raw = await http.post<StkStatusRaw>(
    STK_QUERY,
    {
      BusinessShortCode: Number(config.shortcode),
      Password: generatePassword(config.shortcode, config.passkey, timestamp),
      Timestamp: timestamp,
      CheckoutRequestID: input.checkoutRequestId,
    },
    { retryable: true },
  ); // status query — safe to retry on 5xx
  return {
    merchantRequestId: raw.MerchantRequestID ?? '',
    checkoutRequestId: raw.CheckoutRequestID ?? input.checkoutRequestId,
    responseCode: raw.ResponseCode ?? '',
    responseDescription: raw.ResponseDescription ?? '',
    resultCode: raw.ResultCode ?? '',
    resultDesc: raw.ResultDesc ?? '',
    success: raw.ResultCode === '0',
  };
}

export async function transaction(
  http: HttpClient,
  config: StatusConfig,
  input: TransactionStatusInput,
): Promise<StatusAck> {
  if (!config.initiator || !config.securityCredential) {
    throw new DarajaValidationError(
      'status.transaction requires config.initiator and config.securityCredential',
    );
  }
  const raw = await http.post<AckRaw>(
    TX_QUERY,
    {
      Initiator: config.initiator,
      SecurityCredential: config.securityCredential,
      CommandID: 'TransactionStatusQuery',
      TransactionID: input.transactionId,
      PartyA: Number(config.shortcode),
      IdentifierType: input.identifierType ?? '4',
      Remarks: (input.remarks ?? 'Status query').slice(0, 100),
      QueueTimeOutURL: input.queueTimeoutUrl,
      ResultURL: input.resultUrl,
    },
    { retryable: true },
  ); // status query — safe to retry on 5xx
  if (raw.ResponseCode !== '0') {
    throw errorFromResponse({
      scope: 'status',
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

/** Parse the async Transaction Status result callback. */
export function parseStatusResult(body: unknown): StatusResult {
  const o = (typeof body === 'string' ? JSON.parse(body) : body) as ResultEnvelope | null;
  const result = o?.Result;
  if (!result || result.ResultCode == null) {
    throw new DarajaValidationError('not a status result envelope');
  }
  const params: Record<string, unknown> = {};
  for (const it of toArray(result.ResultParameters?.ResultParameter)) {
    params[it.Key] = it.Value;
  }
  const out: StatusResult = {
    resultCode: result.ResultCode,
    resultDesc: result.ResultDesc ?? '',
    conversationId: result.ConversationID ?? '',
    originatorConversationId: result.OriginatorConversationID ?? '',
    transactionId: result.TransactionID ?? '',
    success: result.ResultCode === 0,
    params,
  };
  return applyClassification(out, 'status', out.resultCode, out.resultDesc);
}
