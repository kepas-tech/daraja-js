/**
 * Phone normalization for Safaricom MSISDNs.
 *
 * Daraja accepts a Kenyan mobile number as `254XXXXXXXXX` (12 digits). Callers
 * pass it in five shapes; Safaricom also hashes the MSISDN (SHA-256 hex) in some
 * C2B callbacks. We normalize the dialable forms and pass a hash through
 * untouched. See gotchas #1 and #2.
 */

import { DarajaValidationError } from '../errors.js';

const SHA256_HEX = /^[a-f0-9]{64}$/i;
const MSISDN = /^254\d{9}$/;

/**
 * Normalize a Kenyan phone number to `254XXXXXXXXX`.
 *
 * Accepts `0712345678`, `+254712345678`, `254712345678`, `712345678`, and
 * (pass-through) a 64-char SHA-256 hex hash. Spaces, dashes, parentheses, and a
 * leading `+` are stripped first.
 *
 * @throws if the input is empty or not a recognizable Kenyan MSISDN.
 */
export function normalizePhone(input: string): string {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new DarajaValidationError('phone is required');
  }
  const raw = input.trim();

  // Hashed MSISDN from a C2B callback — not dialable, return as-is.
  if (SHA256_HEX.test(raw)) {
    return raw;
  }

  const digits = raw.replace(/[\s\-()+]/g, '');
  if (!/^\d+$/.test(digits)) {
    throw new DarajaValidationError(`invalid phone number: ${input}`);
  }

  let msisdn: string;
  if (digits.length === 12 && digits.startsWith('254')) {
    msisdn = digits;
  } else if (digits.length === 10 && digits.startsWith('0')) {
    msisdn = `254${digits.slice(1)}`;
  } else if (digits.length === 9) {
    msisdn = `254${digits}`;
  } else {
    throw new DarajaValidationError(`invalid phone number: ${input}`);
  }

  return msisdn;
}

/**
 * Normalize and cast to a JS `number`, as Daraja STK Push requires for `PartyA`
 * and `PhoneNumber` (gotcha #1 — string values silently 1037-timeout in prod).
 *
 * @throws if the value is a hashed MSISDN, which cannot be a numeric PartyA.
 */
export function phoneToNumber(input: string): number {
  const msisdn = normalizePhone(input);
  if (!MSISDN.test(msisdn)) {
    throw new DarajaValidationError('cannot convert a hashed or non-dialable MSISDN to a number');
  }
  return Number(msisdn);
}
