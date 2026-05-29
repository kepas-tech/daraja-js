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
});
