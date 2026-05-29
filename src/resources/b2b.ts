/**
 * B2B — pay another business, and move float between your own sub-accounts.
 *
 * Same endpoint (`/mpesa/b2b/v1/paymentrequest`), different CommandID:
 * - `pay` → pay another PayBill (`BusinessPayBill`) or Till (`BusinessBuyGoods`).
 * - `transferFloat` → move money Working(MMF)↔Utility on YOUR shortcode. This is
 *   how you fund B2C (gotcha #7): B2C draws from Utility, so top it up from
 *   Working first.
 *
 * Both require initiator auth. Note Daraja's field is misspelled
 * `RecieverIdentifierType` — we send it exactly as the API expects.
 */

import type { DarajaConfig } from '../client.js';
import { DarajaAPIError, DarajaValidationError } from '../errors.js';
import type { HttpClient } from '../http.js';
import { validateAmount } from '../validation/amount.js';

type B2bConfig = Pick<DarajaConfig, 'shortcode' | 'initiator' | 'securityCredential'>;

export type B2bCommandId = 'BusinessPayBill' | 'BusinessBuyGoods';

export interface B2bPayInput {
  /** Destination PayBill/Till shortcode. */
  toShortcode: string;
  amount: number;
  /** Default `BusinessPayBill`. Use `BusinessBuyGoods` for a Till. */
  commandId?: B2bCommandId;
  accountReference?: string;
  remarks?: string;
  resultUrl: string;
  queueTimeoutUrl: string;
}

export interface FloatTransferInput {
  amount: number;
  /** `toUtility` = fund B2C float; `toWorking` = sweep it back. */
  direction: 'toUtility' | 'toWorking';
  remarks?: string;
  resultUrl: string;
  queueTimeoutUrl: string;
}

export interface B2bAck {
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

const ENDPOINT = '/mpesa/b2b/v1/paymentrequest';

function requireInitiator(config: B2bConfig): { initiator: string; securityCredential: string } {
  if (!config.initiator || !config.securityCredential) {
    throw new DarajaValidationError('b2b requires config.initiator and config.securityCredential');
  }
  return { initiator: config.initiator, securityCredential: config.securityCredential };
}

async function post(http: HttpClient, body: Record<string, unknown>): Promise<B2bAck> {
  const raw = await http.post<AckRaw>(ENDPOINT, body);
  if (raw.ResponseCode !== '0') {
    throw new DarajaAPIError(raw.ResponseDescription ?? 'B2B request was not accepted', { raw });
  }
  return {
    conversationId: raw.ConversationID ?? '',
    originatorConversationId: raw.OriginatorConversationID ?? '',
    responseCode: raw.ResponseCode,
    responseDescription: raw.ResponseDescription ?? '',
  };
}

export async function pay(
  http: HttpClient,
  config: B2bConfig,
  input: B2bPayInput,
): Promise<B2bAck> {
  const { initiator, securityCredential } = requireInitiator(config);
  const amount = validateAmount(input.amount);
  const commandId = input.commandId ?? 'BusinessPayBill';
  const own = Number(config.shortcode);
  return post(http, {
    Initiator: initiator,
    SecurityCredential: securityCredential,
    CommandID: commandId,
    SenderIdentifierType: '4',
    RecieverIdentifierType: commandId === 'BusinessBuyGoods' ? '2' : '4',
    Amount: amount,
    PartyA: own,
    PartyB: Number(input.toShortcode),
    Remarks: (input.remarks ?? 'Payment').slice(0, 100),
    AccountReference: (input.accountReference || String(input.toShortcode)).slice(0, 32),
    QueueTimeOutURL: input.queueTimeoutUrl,
    ResultURL: input.resultUrl,
  });
}

export async function transferFloat(
  http: HttpClient,
  config: B2bConfig,
  input: FloatTransferInput,
): Promise<B2bAck> {
  const { initiator, securityCredential } = requireInitiator(config);
  const amount = validateAmount(input.amount);
  const own = Number(config.shortcode);
  const commandId =
    input.direction === 'toUtility'
      ? 'BusinessTransferFromMMFToUtility'
      : 'BusinessTransferFromUtilityToMMF';
  return post(http, {
    Initiator: initiator,
    SecurityCredential: securityCredential,
    CommandID: commandId,
    SenderIdentifierType: '4',
    RecieverIdentifierType: '4',
    Amount: amount,
    PartyA: own,
    PartyB: own,
    Remarks: (
      input.remarks ?? (input.direction === 'toUtility' ? 'Top up float' : 'Sweep float')
    ).slice(0, 100),
    AccountReference: String(own),
    QueueTimeOutURL: input.queueTimeoutUrl,
    ResultURL: input.resultUrl,
  });
}

export interface B2bResult {
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

/** Parse the async B2B result callback (pay or float transfer). */
export function parseB2bResult(body: unknown): B2bResult {
  const o = (typeof body === 'string' ? JSON.parse(body) : body) as ResultEnvelope | null;
  const result = o?.Result;
  if (!result || result.ResultCode == null) {
    throw new DarajaValidationError('not a B2B result envelope');
  }
  const params: Record<string, unknown> = {};
  for (const it of result.ResultParameters?.ResultParameter ?? []) {
    params[it.Key] = it.Value;
  }
  return {
    resultCode: result.ResultCode,
    resultDesc: result.ResultDesc ?? '',
    conversationId: result.ConversationID ?? '',
    originatorConversationId: result.OriginatorConversationID ?? '',
    transactionId: result.TransactionID ?? '',
    success: result.ResultCode === 0,
    params,
  };
}
