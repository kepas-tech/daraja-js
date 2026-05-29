/**
 * SecurityCredential generation for the initiator-authenticated APIs (B2C, B2B,
 * balance, status, reversal).
 *
 * RSA-encrypts the initiator password with the Safaricom-issued certificate
 * using PKCS1 v1.5 padding, then base64-encodes it — exactly what those APIs
 * expect for `SecurityCredential`. Node-only (offline setup helper, not in the
 * request path). We ship no certificate — Safaricom owns those; download yours
 * from the Daraja portal (Production) and pass it in.
 */

import { constants, publicEncrypt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DarajaValidationError } from '../errors.js';

export interface SecurityCredentialInput {
  /** The initiator's plaintext password. */
  password: string;
  /** PEM of the Safaricom certificate (or a public key). */
  certPem?: string;
  /** Path to the certificate file, read as UTF-8. Alternative to `certPem`. */
  certPath?: string;
}

/**
 * Produce a base64 `SecurityCredential` from the initiator password + cert.
 *
 * @throws DarajaValidationError if the password or certificate is missing.
 */
export function generateSecurityCredential({
  password,
  certPem,
  certPath,
}: SecurityCredentialInput): string {
  if (!password) {
    throw new DarajaValidationError('password is required');
  }
  const cert = certPem ?? (certPath ? readFileSync(certPath, 'utf8') : undefined);
  if (!cert) {
    throw new DarajaValidationError('certPem or certPath is required');
  }
  const encrypted = publicEncrypt(
    { key: cert, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(password, 'utf8'),
  );
  return encrypted.toString('base64');
}
