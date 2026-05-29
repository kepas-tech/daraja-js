import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Daraja } from '../../src/client.js';
import { DarajaValidationError } from '../../src/errors.js';
import {
  c2bAccept,
  c2bReject,
  parseC2bConfirmation,
  parseC2bValidation,
} from '../../src/resources/c2b.js';

const SANDBOX = 'https://sandbox.safaricom.co.ke';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function mockOAuth() {
  server.use(
    http.get(`${SANDBOX}/oauth/v1/generate`, () =>
      HttpResponse.json({ access_token: 'tok-1', expires_in: 3599 }),
    ),
  );
}

function makeDaraja() {
  return new Daraja({
    consumerKey: 'ck',
    consumerSecret: 'cs',
    shortcode: '600638',
    passkey: 'pk',
    environment: 'sandbox',
  });
}

const CONFIRMATION = {
  TransactionType: 'Pay Bill',
  TransID: 'RKTQDM7W6S',
  TransTime: '20191122063845',
  TransAmount: '10',
  BusinessShortCode: '600638',
  BillRefNumber: 'invoice008',
  InvoiceNumber: '',
  OrgAccountBalance: '49197.00',
  ThirdPartyTransID: '',
  MSISDN: '254708374149',
  FirstName: 'John',
  MiddleName: '',
  LastName: 'Doe',
};

describe('c2b.registerUrls', () => {
  it('POSTs ShortCode, ResponseType, and both URLs to the v2 register endpoint', async () => {
    mockOAuth();
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`${SANDBOX}/mpesa/c2b/v2/registerurl`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          OriginatorCoversationID: 'oc-1',
          ResponseCode: '0',
          ResponseDescription: 'Success',
        });
      }),
    );

    const res = await makeDaraja().c2b.registerUrls({
      confirmationUrl: 'https://example.com/confirm',
      validationUrl: 'https://example.com/validate',
    });

    expect(body.ShortCode).toBe('600638');
    expect(body.ResponseType).toBe('Completed'); // default
    expect(body.ConfirmationURL).toBe('https://example.com/confirm');
    expect(body.ValidationURL).toBe('https://example.com/validate');
    expect(res.responseCode).toBe('0');
    expect(res.originatorConversationId).toBe('oc-1');
  });

  it('honors an explicit ResponseType of Cancelled', async () => {
    mockOAuth();
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`${SANDBOX}/mpesa/c2b/v2/registerurl`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ResponseCode: '0', ResponseDescription: 'Success' });
      }),
    );

    await makeDaraja().c2b.registerUrls({
      confirmationUrl: 'https://example.com/confirm',
      validationUrl: 'https://example.com/validate',
      responseType: 'Cancelled',
    });

    expect(body.ResponseType).toBe('Cancelled');
  });
});

describe('parseC2bConfirmation', () => {
  it('parses a confirmation into a typed payment, amount as number, terminal=true', () => {
    const p = parseC2bConfirmation(CONFIRMATION);
    expect(p.transId).toBe('RKTQDM7W6S');
    expect(p.amount).toBe(10);
    expect(p.shortCode).toBe('600638');
    expect(p.billRefNumber).toBe('invoice008');
    expect(p.msisdn).toBe('254708374149');
    expect(p.firstName).toBe('John');
    expect(p.orgAccountBalance).toBe(49197);
    expect(p.terminal).toBe(true); // gotcha #8 — money already in, no second callback
  });

  it('accepts a raw JSON string', () => {
    const p = parseC2bConfirmation(JSON.stringify(CONFIRMATION));
    expect(p.transId).toBe('RKTQDM7W6S');
  });

  it('throws on a body without a TransID', () => {
    expect(() => parseC2bConfirmation({ TransAmount: '10' })).toThrow(DarajaValidationError);
  });
});

describe('parseC2bValidation', () => {
  it('parses the pre-payment validation body (no terminal flag)', () => {
    const v = parseC2bValidation(CONFIRMATION);
    expect(v.transId).toBe('RKTQDM7W6S');
    expect(v.amount).toBe(10);
    // @ts-expect-error — validation result has no terminal flag
    expect(v.terminal).toBeUndefined();
  });
});

describe('c2b validation response helpers', () => {
  it('c2bAccept is the Safaricom-accepted shape', () => {
    expect(c2bAccept()).toEqual({ ResultCode: '0', ResultDesc: 'Accepted' });
  });

  it('c2bReject defaults to C2B00012 and carries a reason', () => {
    expect(c2bReject()).toEqual({ ResultCode: 'C2B00012', ResultDesc: 'Rejected' });
    expect(c2bReject('Unknown account', 'C2B00012').ResultDesc).toBe('Unknown account');
  });
});
