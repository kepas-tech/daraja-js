/**
 * Transaction reversal — reverse a payment back to the payer.
 *
 * Initiator-authed, async — the outcome lands at your `resultUrl`. When a
 * reversal fails because the recipient already spent the money, Daraja signals
 * it only through free-text `resultDesc` keywords (there's no stable
 * ResultCode); `isSettledByRecipientSpend` is the conservative classifier for
 * that "money's gone" case (gotcha #16).
 */

import type { DarajaConfig } from '../client.js';
import { DarajaValidationError, errorFromResponse } from '../errors.js';
import type { HttpClient } from '../http.js';
import { toArray } from '../internal.js';
import { applyClassification, type CodeClassificationFields } from '../result-codes.js';
import { validateAmount } from '../validation/amount.js';

type ReversalConfig = Pick<DarajaConfig, 'shortcode' | 'initiator' | 'securityCredential'>;

export interface ReversalInput {
  /** M-Pesa receipt of the transaction to reverse. */
  transactionId: string;
  amount: number;
  resultUrl: string;
  queueTimeoutUrl: string;
  remarks?: string;
}

export interface ReversalAck {
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

export interface ReversalResult extends CodeClassificationFields {
  resultCode: number;
  resultDesc: string;
  conversationId: string;
  originatorConversationId: string;
  transactionId: string;
  success: boolean;
  params: Record<string, unknown>;
  /**
   * True when a failure's `resultDesc` indicates the recipient already spent the
   * funds (no stable code — keyword heuristic). When set, the reversal won't
   * succeed; treat the original as settled.
   */
  settledByRecipientSpend?: boolean | undefined;
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

const ENDPOINT = '/mpesa/reversal/v1/request';

export async function request(
  http: HttpClient,
  config: ReversalConfig,
  input: ReversalInput,
): Promise<ReversalAck> {
  if (!config.initiator || !config.securityCredential) {
    throw new DarajaValidationError(
      'reversal.request requires config.initiator and config.securityCredential',
    );
  }
  const amount = validateAmount(input.amount);
  const raw = await http.post<AckRaw>(ENDPOINT, {
    Initiator: config.initiator,
    SecurityCredential: config.securityCredential,
    CommandID: 'TransactionReversal',
    TransactionID: input.transactionId,
    Amount: amount,
    ReceiverParty: Number(config.shortcode),
    RecieverIdentifierType: '11',
    Remarks: (input.remarks ?? 'Reversal').slice(0, 100),
    QueueTimeOutURL: input.queueTimeoutUrl,
    ResultURL: input.resultUrl,
  });
  if (raw.ResponseCode !== '0') {
    throw errorFromResponse({
      scope: 'reversal',
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

/** Parse the async Reversal result callback. */
export function parseReversalResult(body: unknown): ReversalResult {
  const o = (typeof body === 'string' ? JSON.parse(body) : body) as ResultEnvelope | null;
  const result = o?.Result;
  if (!result || result.ResultCode == null) {
    throw new DarajaValidationError('not a reversal result envelope');
  }
  const params: Record<string, unknown> = {};
  for (const it of toArray(result.ResultParameters?.ResultParameter)) {
    params[it.Key] = it.Value;
  }
  const out: ReversalResult = {
    resultCode: result.ResultCode,
    resultDesc: result.ResultDesc ?? '',
    conversationId: result.ConversationID ?? '',
    originatorConversationId: result.OriginatorConversationID ?? '',
    transactionId: result.TransactionID ?? '',
    success: result.ResultCode === 0,
    params,
  };
  applyClassification(out, 'reversal', out.resultCode, out.resultDesc);
  // No stable code for "recipient already spent" — keyword heuristic on resultDesc.
  if (!out.success && isSettledByRecipientSpend(out.resultDesc)) {
    out.settledByRecipientSpend = true;
    out.meaning =
      'Reversal not possible — the recipient appears to have already spent the funds; treat the original transaction as settled.';
  }
  return out;
}

/**
 * True when a reversal failure `resultDesc` indicates the recipient already
 * spent the funds — conservative keyword match (no stable ResultCode exists).
 */
export function isSettledByRecipientSpend(resultDesc: string | undefined | null): boolean {
  if (!resultDesc) {
    return false;
  }
  return /\b(balance|insufficient|consumed|already used|already spent|utilis(e|ed))\b/.test(
    resultDesc.toLowerCase(),
  );
}
