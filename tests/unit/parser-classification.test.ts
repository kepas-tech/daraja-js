import { describe, expect, it } from 'vitest';
import { parseB2cResult } from '../../src/resources/b2c.js';
import { parseReversalResult } from '../../src/resources/reversal.js';
import { parseStatusResult } from '../../src/resources/status.js';
import { parseStkCallback } from '../../src/resources/stk-push.js';

function stk(resultCode: number, resultDesc: string) {
  return {
    Body: {
      stkCallback: { CheckoutRequestID: 'c', ResultCode: resultCode, ResultDesc: resultDesc },
    },
  };
}
function envelope(resultCode: number, resultDesc: string) {
  return { Result: { ResultCode: resultCode, ResultDesc: resultDesc, ConversationID: 'AG' } };
}

describe('parser classification (additive, verbatim preserved)', () => {
  it('enriches a proven STK failure (1037) with an actionable meaning', () => {
    const r = parseStkCallback(stk(1037, 'DS timeout user cannot be reached.'));
    expect(r.catalogued).toBe(true);
    expect(r.meaning).toMatch(/respond|retry|unreachable/i);
    expect(r.retriable).toBe(true);
    // verbatim fields untouched
    expect(r.resultCode).toBe(1037);
    expect(r.resultDesc).toBe('DS timeout user cannot be reached.');
    expect(r.success).toBe(false);
  });

  it('marks STK success as catalogued + terminal', () => {
    const r = parseStkCallback(stk(0, 'The service request is processed successfully.'));
    expect(r.success).toBe(true);
    expect(r.catalogued).toBe(true);
    expect(r.terminal).toBe(true);
  });

  it('enriches a proven B2C failure (1 insufficient)', () => {
    const r = parseB2cResult(envelope(1, 'The balance is insufficient for the transaction.'));
    expect(r.meaning).toMatch(/insufficient|top it up|fund/i);
    expect(r.retriable).toBe(true);
    expect(r.resultDesc).toBe('The balance is insufficient for the transaction.');
  });

  it('enriches the proven status code 25', () => {
    const r = parseStatusResult(envelope(25, 'The format of parameter null is invalid.'));
    expect(r.catalogued).toBe(true);
    expect(r.meaning).toMatch(/parameter|missing|malformed/i);
  });

  it('leaves an UNPROVEN code uncatalogued, verbatim preserved', () => {
    const r = parseB2cResult(envelope(9999, 'Some undocumented failure'));
    expect(r.catalogued).toBe(false);
    expect(r.meaning).toBeUndefined();
    expect(r.resultDesc).toBe('Some undocumented failure'); // verbatim
  });

  it('reversal: flags recipient-spend even with no catalogued code', () => {
    const r = parseReversalResult(envelope(1, 'The balance is insufficient...'));
    // not a catalogued reversal code, but the spend heuristic should surface a meaning
    expect(r.settledByRecipientSpend).toBe(true);
    expect(r.meaning).toMatch(/spent|used|gone|recipient/i);
  });
});
