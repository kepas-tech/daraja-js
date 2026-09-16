/**
 * B2C Hakikisha — look up a customer's registered name from a phone number BEFORE a B2C payout.
 * SYNCHRONOUS read: the (partly masked) name comes back inline, no callback, so the call is
 * idempotent and retryable.
 *
 * Safaricom returns the first name in the clear and masks the middle and last names ("M******").
 * Production needs Safaricom's approval and a signed contract; sandbox works with the
 * `B2C-Hakikisha-SandBox` product on the app.
 *
 * Proof: docs/specs/b2c-hakikisha.md (official Safaricom portal spec, read 2026-09-16).
 */

import { randomUUID } from 'node:crypto';
import type { DarajaConfig } from '../client.js';
import { errorFromResponse } from '../errors.js';
import type { HttpClient } from '../http.js';
import { normalizePhone } from '../validation/phone.js';

const ENDPOINT = '/mpesa/b2c/hakikisha/v1/hakikisha';

export interface HakikishaLookupInput {
  /** The customer's phone, in any common Kenyan form; sent as 254XXXXXXXXX. */
  phone: string;
  /** Your own id for the request; a UUID is minted when omitted. Echoed back by Safaricom. */
  requestId?: string;
}

export interface HakikishaResult {
  /** Echo of the request id. */
  requestId: string;
  /** Safaricom's `header.status` — `'200'` on success. */
  status: string;
  /** Safaricom's `header.message` — `'Success'` on success. */
  message: string;
  /** In the clear. */
  firstName: string;
  /** Masked by Safaricom: first letter plus stars. */
  middleName: string;
  /** Masked by Safaricom: first letter plus stars. */
  lastName: string;
  /** `firstName` + masked middle and last, for showing to a person. */
  displayName: string;
  raw: unknown;
}

interface Raw {
  header?: { requestID?: string; timestamp?: string; status?: string | number; message?: string };
  body?: { firstName?: string; middleName?: string; lastName?: string; message?: string };
}

export async function lookup(
  http: HttpClient,
  config: Pick<DarajaConfig, 'shortcode'>,
  input: HakikishaLookupInput,
): Promise<HakikishaResult> {
  const msisdn = normalizePhone(input.phone);
  const requestId = input.requestId ?? randomUUID();
  const raw = await http.post<Raw>(
    ENDPOINT,
    {
      header: { requestID: requestId, timestamp: String(Math.floor(Date.now() / 1000)) },
      body: { msisdn, shortcode: config.shortcode },
    },
    { retryable: true }, // read-only lookup — safe to retry on 5xx
  );
  const status = String(raw.header?.status ?? '');
  if (status !== '200') {
    throw errorFromResponse({
      scope: 'hakikisha',
      responseCode: status,
      errorMessage: raw.body?.message ?? raw.header?.message,
      requestId: raw.header?.requestID ?? requestId,
      raw,
    });
  }
  const firstName = raw.body?.firstName ?? '';
  const middleName = raw.body?.middleName ?? '';
  const lastName = raw.body?.lastName ?? '';
  return {
    requestId: raw.header?.requestID ?? requestId,
    status,
    message: raw.header?.message ?? '',
    firstName,
    middleName,
    lastName,
    displayName: [firstName, middleName, lastName].filter(Boolean).join(' '),
    raw,
  };
}
