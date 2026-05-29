import { describe, expect, it } from 'vitest';
import { parseStkCallback } from '../../src/resources/stk-push.js';

const SUCCESS = {
  Body: {
    stkCallback: {
      MerchantRequestID: 'm-1',
      CheckoutRequestID: 'c-1',
      ResultCode: 0,
      ResultDesc: 'The service request is processed successfully.',
      CallbackMetadata: {
        Item: [
          { Name: 'Amount', Value: 100 },
          { Name: 'MpesaReceiptNumber', Value: 'NLJ7RT61SV' },
          { Name: 'TransactionDate', Value: 20191219102115 },
          { Name: 'PhoneNumber', Value: 254712345678 },
        ],
      },
    },
  },
};

const CANCELLED = {
  Body: {
    stkCallback: {
      MerchantRequestID: 'm-2',
      CheckoutRequestID: 'c-2',
      ResultCode: 1032,
      ResultDesc: 'Request cancelled by user',
    },
  },
};

describe('parseStkCallback', () => {
  it('parses a successful callback and extracts the metadata', () => {
    const r = parseStkCallback(SUCCESS);
    expect(r.success).toBe(true);
    expect(r.resultCode).toBe(0);
    expect(r.merchantRequestId).toBe('m-1');
    expect(r.checkoutRequestId).toBe('c-1');
    expect(r.amount).toBe(100);
    expect(r.mpesaReceiptNumber).toBe('NLJ7RT61SV');
    expect(r.phoneNumber).toBe(254712345678);
    expect(r.transactionDate).toBe(20191219102115);
  });

  it('parses a failed/cancelled callback with no metadata', () => {
    const r = parseStkCallback(CANCELLED);
    expect(r.success).toBe(false);
    expect(r.resultCode).toBe(1032);
    expect(r.resultDesc).toBe('Request cancelled by user');
    expect(r.amount).toBeUndefined();
    expect(r.mpesaReceiptNumber).toBeUndefined();
  });

  it('accepts a raw JSON string body', () => {
    const r = parseStkCallback(JSON.stringify(SUCCESS));
    expect(r.success).toBe(true);
    expect(r.mpesaReceiptNumber).toBe('NLJ7RT61SV');
  });

  it('throws on a body that is not an STK callback', () => {
    expect(() => parseStkCallback({ Body: {} })).toThrow();
  });

  it('handles ResultCode 1037 (phone-number-as-string timeout)', () => {
    // Daraja CLAUDE.md gotcha: phone as string causes ResultCode 1037 silent timeout
    const r = parseStkCallback({
      Body: {
        stkCallback: {
          MerchantRequestID: 'm-3',
          CheckoutRequestID: 'c-3',
          ResultCode: 1037,
          ResultDesc: 'DS timeout user cannot be reached',
        },
      },
    });
    expect(r.success).toBe(false);
    expect(r.resultCode).toBe(1037);
    expect(r.resultDesc).toContain('timeout');
    expect(r.amount).toBeUndefined();
  });

  it('handles ResultCode 1 (insufficient balance)', () => {
    const r = parseStkCallback({
      Body: {
        stkCallback: {
          MerchantRequestID: 'm-4',
          CheckoutRequestID: 'c-4',
          ResultCode: 1,
          ResultDesc: 'The balance is insufficient for the transaction',
        },
      },
    });
    expect(r.success).toBe(false);
    expect(r.resultCode).toBe(1);
  });

  it('throws on malformed JSON string', () => {
    expect(() => parseStkCallback('{ not valid json')).toThrow();
  });

  it('throws on null input', () => {
    expect(() => parseStkCallback(null)).toThrow();
  });

  it('throws on undefined input', () => {
    expect(() => parseStkCallback(undefined)).toThrow();
  });

  it('handles CallbackMetadata with extra unknown items gracefully', () => {
    const withExtra = {
      Body: {
        stkCallback: {
          MerchantRequestID: 'm-5',
          CheckoutRequestID: 'c-5',
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 200 },
              { Name: 'MpesaReceiptNumber', Value: 'XYZABC123' },
              { Name: 'TransactionDate', Value: 20240101120000 },
              { Name: 'PhoneNumber', Value: 254798765432 },
              { Name: 'UnknownFutureField', Value: 'some-value' }, // Daraja adds new fields
            ],
          },
        },
      },
    };
    const r = parseStkCallback(withExtra);
    expect(r.success).toBe(true);
    expect(r.amount).toBe(200);
    expect(r.mpesaReceiptNumber).toBe('XYZABC123');
  });

  it('returns success=false and resultCode=0 only for ResultCode 0', () => {
    // ResultCode 0 is the only success code per Daraja spec
    const resultCodes = [1, 2, 17, 1001, 1032, 1037];
    for (const code of resultCodes) {
      const r = parseStkCallback({
        Body: {
          stkCallback: {
            MerchantRequestID: 'm-x',
            CheckoutRequestID: 'c-x',
            ResultCode: code,
            ResultDesc: 'Some failure',
          },
        },
      });
      expect(r.success).toBe(false);
      expect(r.resultCode).toBe(code);
    }
  });
});
