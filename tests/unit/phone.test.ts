import { describe, expect, it } from 'vitest';
import { normalizePhone, phoneToNumber } from '../../src/validation/phone.js';

describe('normalizePhone', () => {
  it('normalizes leading-zero local format (0712…) to 254…', () => {
    expect(normalizePhone('0712345678')).toBe('254712345678');
  });

  it('normalizes +254 international format to 254…', () => {
    expect(normalizePhone('+254712345678')).toBe('254712345678');
  });

  it('passes through already-normalized 254… numbers', () => {
    expect(normalizePhone('254712345678')).toBe('254712345678');
  });

  it('normalizes bare 9-digit subscriber number (712…) to 254…', () => {
    expect(normalizePhone('712345678')).toBe('254712345678');
  });

  it('strips spaces, dashes, and parentheses before normalizing', () => {
    expect(normalizePhone('0712 345 678')).toBe('254712345678');
    expect(normalizePhone('+254-712-345-678')).toBe('254712345678');
  });

  it('passes through a 64-char SHA-256 hex (hashed MSISDN) unchanged', () => {
    const hash = 'a'.repeat(64);
    expect(normalizePhone(hash)).toBe(hash);
  });

  it('rejects empty input', () => {
    expect(() => normalizePhone('')).toThrow();
  });

  it('rejects non-Safaricom-length garbage', () => {
    expect(() => normalizePhone('12345')).toThrow();
    expect(() => normalizePhone('not-a-phone')).toThrow();
  });
});

describe('phoneToNumber', () => {
  it('returns a JS number (gotcha #1 — STK PartyA must be numeric)', () => {
    const n = phoneToNumber('0712345678');
    expect(typeof n).toBe('number');
    expect(n).toBe(254712345678);
  });

  it('stays within safe integer range', () => {
    expect(Number.isSafeInteger(phoneToNumber('254712345678'))).toBe(true);
  });

  it('throws on a hashed MSISDN (cannot be a numeric PartyA)', () => {
    expect(() => phoneToNumber('a'.repeat(64))).toThrow();
  });
});
