import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { DarajaAPIError } from '../../src/errors.js';

// Stand-in for customer PII a Daraja response might carry.
const PII = 'MSISDN-254712345678-receipt-NLJ7RT61SV';

describe('DarajaError does not leak raw payloads into logs', () => {
  const err = new DarajaAPIError('failed', {
    resultCode: 26,
    resultDesc: 'System busy',
    requestId: 'AG_1',
    raw: { MSISDN: PII },
  });

  it('JSON.stringify(err) omits raw', () => {
    expect(JSON.stringify(err)).not.toContain(PII);
  });

  it('util.inspect(err) (the console.log path) omits raw', () => {
    expect(inspect(err)).not.toContain(PII);
  });

  it('still exposes safe fields', () => {
    const s = JSON.stringify(err);
    expect(s).toContain('AG_1');
    expect(s).toContain('26');
  });

  it('keeps raw accessible for explicit debugging', () => {
    expect((err.raw as { MSISDN: string }).MSISDN).toBe(PII);
  });

  it('toJSON returns a safe, raw-free object', () => {
    const j = err.toJSON();
    expect(j).toMatchObject({
      name: 'DarajaAPIError',
      message: 'failed',
      requestId: 'AG_1',
      resultCode: 26,
    });
    expect(JSON.stringify(j)).not.toContain(PII);
  });
});
