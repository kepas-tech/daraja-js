import { describe, expect, it } from 'vitest';
import { parseB2bResult } from '../../src/resources/b2b.js';
import { parseB2cResult } from '../../src/resources/b2c.js';
import { parseBalanceResult } from '../../src/resources/balance.js';
import { parseReversalResult } from '../../src/resources/reversal.js';
import { parseStatusResult } from '../../src/resources/status.js';
import { parseStkCallback } from '../../src/resources/stk-push.js';

// Daraja collapses a single-element collection to a BARE OBJECT (observed in
// production). Each parser must handle object | array | missing without throwing.
const singleParam = { Key: 'DebitAccountCurrentBalance', Value: '{Amount=...}' };

function envObject() {
  return {
    Result: {
      ResultCode: 0,
      ResultDesc: 'OK',
      ConversationID: 'AG',
      ResultParameters: { ResultParameter: singleParam }, // OBJECT, not array
    },
  };
}

describe('parsers tolerate a single-object ResultParameter (no array)', () => {
  for (const [name, parse] of [
    ['b2c', parseB2cResult],
    ['b2b', parseB2bResult],
    ['status', parseStatusResult],
    ['balance', parseBalanceResult],
    ['reversal', parseReversalResult],
  ] as const) {
    it(`${name}: does not throw + extracts the single param`, () => {
      const r = parse(envObject()) as { params?: Record<string, unknown>; success: boolean };
      expect(r.success).toBe(true);
      // params-bearing parsers expose it; balance has no params map but must not throw
      if (r.params) {
        expect(r.params.DebitAccountCurrentBalance).toBe('{Amount=...}');
      }
    });
  }

  it('balance: single-object AccountBalance param does not throw', () => {
    const r = parseBalanceResult({
      Result: {
        ResultCode: 0,
        ResultDesc: 'OK',
        ResultParameters: {
          ResultParameter: { Key: 'AccountBalance', Value: 'Working|KES|10|10|0|0' },
        },
      },
    });
    expect(r.success).toBe(true);
    expect(r.balances).toHaveLength(1);
  });

  it('stk: single-object CallbackMetadata.Item does not throw', () => {
    const r = parseStkCallback({
      Body: {
        stkCallback: {
          CheckoutRequestID: 'c',
          ResultCode: 0,
          ResultDesc: 'ok',
          CallbackMetadata: { Item: { Name: 'MpesaReceiptNumber', Value: 'ABC123' } },
        },
      },
    });
    expect(r.success).toBe(true);
    expect(r.mpesaReceiptNumber).toBe('ABC123');
  });

  it('still handles the normal array form', () => {
    const r = parseB2cResult({
      Result: {
        ResultCode: 0,
        ResultDesc: 'OK',
        ResultParameters: {
          ResultParameter: [
            { Key: 'TransactionReceipt', Value: 'NLJ' },
            { Key: 'TransactionAmount', Value: 5 },
          ],
        },
      },
    });
    expect(r.mpesaReceipt).toBe('NLJ');
    expect(r.amount).toBe(5);
  });
});
