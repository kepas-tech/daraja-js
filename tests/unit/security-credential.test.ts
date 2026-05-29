import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateSecurityCredential } from '../../src/crypto/security-credential.js';
import { DarajaValidationError } from '../../src/errors.js';

const { publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

describe('generateSecurityCredential', () => {
  it('RSA-encrypts the password (PKCS1 v1.5) and base64-encodes it', () => {
    // Note: Node blocks PKCS1 private-decrypt (CVE-2023-46809), so we verify the
    // ciphertext shape instead of a round-trip — Safaricom does the decryption.
    const cred = generateSecurityCredential({ password: 'Initiator@123', certPem: publicKey });

    expect(cred).toMatch(/^[A-Za-z0-9+/]+={0,2}$/); // base64
    // RSA over a 2048-bit key → exactly 256 bytes of ciphertext.
    expect(Buffer.from(cred, 'base64')).toHaveLength(256);
  });

  it('produces a different ciphertext each call (random PKCS1 padding)', () => {
    const a = generateSecurityCredential({ password: 'x', certPem: publicKey });
    const b = generateSecurityCredential({ password: 'x', certPem: publicKey });
    expect(a).not.toBe(b);
  });

  it('throws without a password', () => {
    expect(() => generateSecurityCredential({ password: '', certPem: publicKey })).toThrow(
      DarajaValidationError,
    );
  });

  it('throws without a cert', () => {
    expect(() => generateSecurityCredential({ password: 'x' })).toThrow(DarajaValidationError);
  });
});
