import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Daraja } from '../../src/client.js';
import { DarajaAPIError, DarajaValidationError } from '../../src/errors.js';

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
    shortcode: '174379',
    passkey: 'pk',
    environment: 'sandbox',
  });
}

describe('Daraja config validation', () => {
  it('throws DarajaValidationError when a required field is missing', () => {
    expect(
      () =>
        new Daraja({
          consumerKey: '',
          consumerSecret: 'cs',
          shortcode: '174379',
          passkey: 'pk',
          environment: 'sandbox',
        }),
    ).toThrow(DarajaValidationError);
  });
});

describe('collect.stkPush', () => {
  it('sends PartyA and PhoneNumber as JSON numbers (gotcha #1)', async () => {
    mockOAuth();
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`${SANDBOX}/mpesa/stkpush/v1/processrequest`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          MerchantRequestID: 'm-1',
          CheckoutRequestID: 'c-1',
          ResponseCode: '0',
          ResponseDescription: 'Success. Request accepted for processing',
          CustomerMessage: 'Success. Request accepted for processing',
        });
      }),
    );

    const res = await makeDaraja().collect.stkPush({
      phone: '0712345678',
      amount: 100,
      accountReference: 'INV-001',
      description: 'Subscription',
      callbackUrl: 'https://example.com/cb',
    });

    expect(typeof body.PartyA).toBe('number');
    expect(body.PartyA).toBe(254712345678);
    expect(typeof body.PhoneNumber).toBe('number');
    expect(body.PhoneNumber).toBe(254712345678);
    expect(body.Amount).toBe(100);
    expect(body.BusinessShortCode).toBe('174379');
    expect(body.PartyB).toBe('174379');
    expect(body.CallBackURL).toBe('https://example.com/cb');
    expect(typeof body.Password).toBe('string');
    expect(typeof body.Timestamp).toBe('string');
    expect(body.TransactionType).toBe('CustomerPayBillOnline');

    expect(res.checkoutRequestId).toBe('c-1');
    expect(res.merchantRequestId).toBe('m-1');
    expect(res.responseCode).toBe('0');
  });

  it('rejects an invalid phone before any network call', async () => {
    await expect(
      makeDaraja().collect.stkPush({
        phone: 'not-a-phone',
        amount: 100,
        accountReference: 'INV-001',
        description: 'x',
        callbackUrl: 'https://example.com/cb',
      }),
    ).rejects.toBeInstanceOf(DarajaValidationError);
  });

  it('throws when Daraja rejects with a non-zero ResponseCode', async () => {
    mockOAuth();
    server.use(
      http.post(`${SANDBOX}/mpesa/stkpush/v1/processrequest`, () =>
        HttpResponse.json({
          ResponseCode: '1',
          ResponseDescription: 'Invalid CallBackURL',
        }),
      ),
    );

    await expect(
      makeDaraja().collect.stkPush({
        phone: '0712345678',
        amount: 100,
        accountReference: 'INV-001',
        description: 'x',
        callbackUrl: 'https://example.com/cb',
      }),
    ).rejects.toBeInstanceOf(DarajaAPIError);
  });
});
