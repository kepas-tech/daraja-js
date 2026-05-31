/**
 * Query Organization Info — validate a shortcode's name + tariff before paying
 * (reduces reversals to wrong tills/paybills). SYNCHRONOUS read — the result is
 * returned inline (no callback), so the call is idempotent and retryable.
 *
 * ⚠️ The spec contradicts itself on the success code: the sample JSON shows
 * `ResponseCode "4000"` with `ResponseMessage "Success"`, while the prose tables
 * say `0`. We therefore gate success on `ResponseMessage === "Success"` AND an
 * `OrganizationName` being present, and expose the raw `responseCode` verbatim
 * rather than hard-coding a number. Confirm the live code before cataloguing.
 *
 * Proof: docs/specs/query-org-info.md (official Safaricom portal spec).
 */

import type { HttpClient } from '../http.js';

const ENDPOINT = '/sfcverify/v1/query/info';

export interface OrgInfoQueryInput {
  /** The shortcode / till to look up. */
  identifier: string;
  /** `paybill` → IdentifierType 4, `till` → IdentifierType 2. */
  identifierType: 'paybill' | 'till';
}

export interface OrgInfoResult {
  conversationId: string;
  /** Raw — `'4000'` (per sample) or `'0'` (per table); unconfirmed, see file docs. */
  responseCode: string;
  responseMessage: string;
  detailedMessage: string;
  organizationShortCode: string;
  organizationName: string;
  chargeProfileId: string;
  /** True when `ResponseMessage === 'Success'` and an OrganizationName is present. */
  success: boolean;
}

interface Raw {
  ConversationID?: string;
  ResponseCode?: string | number;
  ResponseMessage?: string;
  DetailedMessage?: string;
  OrganizationShortCode?: string;
  OrganizationName?: string;
  ChargeProfileID?: string;
}

export async function query(http: HttpClient, input: OrgInfoQueryInput): Promise<OrgInfoResult> {
  const raw = await http.post<Raw>(
    ENDPOINT,
    {
      IdentifierType: input.identifierType === 'paybill' ? '4' : '2',
      Identifier: input.identifier,
    },
    { retryable: true },
  ); // read-only lookup — safe to retry on 5xx
  const organizationName = raw.OrganizationName ?? '';
  return {
    conversationId: raw.ConversationID ?? '',
    responseCode: String(raw.ResponseCode ?? ''),
    responseMessage: raw.ResponseMessage ?? '',
    detailedMessage: raw.DetailedMessage ?? '',
    organizationShortCode: raw.OrganizationShortCode ?? '',
    organizationName,
    chargeProfileId: raw.ChargeProfileID ?? '',
    success: raw.ResponseMessage === 'Success' && organizationName !== '',
  };
}
