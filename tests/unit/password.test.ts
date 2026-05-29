import { describe, expect, it } from 'vitest';
import { generatePassword } from '../../src/validation/password.js';

describe('generatePassword', () => {
  it('is base64(shortcode + passkey + timestamp), in that order (gotcha #4)', () => {
    // base64 of '174379passkey20260529080705'
    expect(generatePassword('174379', 'passkey', '20260529080705')).toBe(
      'MTc0Mzc5cGFzc2tleTIwMjYwNTI5MDgwNzA1',
    );
  });

  it('decodes back to the exact concatenation (order is significant)', () => {
    const pw = generatePassword('4052037', 'secret', '20260101000000');
    expect(Buffer.from(pw, 'base64').toString('utf8')).toBe('4052037secret20260101000000');
  });

  it('changes when the timestamp changes', () => {
    const a = generatePassword('4052037', 'secret', '20260101000000');
    const b = generatePassword('4052037', 'secret', '20260101000001');
    expect(a).not.toBe(b);
  });
});
