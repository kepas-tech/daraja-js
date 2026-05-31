import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Daraja } from '../../src/client.js';
import { DarajaAPIError } from '../../src/errors.js';
import { parseExpressCallback } from '../../src/resources/b2b-express.js';

const SANDBOX = 'https://sandbox.safaricom.co.ke';
const ENDPOINT = `${SANDBOX}/v1/ussdpush/get-msisdn`;
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

function makeDaraja(overrides = {}) {
  return new Daraja({
    consumerKey: 'ck',
    consumerSecret: 'cs',
    shortcode: '000002',
    passkey: 'pk',
    environment: 'sandbox',
    ...overrides,
  });
}

function captureBody(respond = { code: '0', status: 'USSD Initiated Successfully' }) {
  const ref: { body: Record<string, unknown> } = { body: {} };
  server.use(
    http.post(ENDPOINT, async ({ request }) => {
      ref.body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(respond);
    }),
  );
  return ref;
}

describe('express.checkout', () => {
  it('posts the camelCase body and returns the code/status ack', async () => {
    mockOAuth();
    const ref = captureBody();
    const res = await makeDaraja().express.checkout({
      primaryShortCode: '000001',
      receiverShortCode: '000002',
      amount: 100,
      paymentRef: 'pay-1',
      callbackUrl: 'https://example.com/express',
      partnerName: 'Vendor',
      requestRefId: 'fixed-ref-123',
    });
    expect(ref.body.primaryShortCode).toBe('000001');
    expect(ref.body.receiverShortCode).toBe('000002');
    expect(ref.body.amount).toBe(100);
    expect(ref.body.paymentRef).toBe('pay-1');
    expect(ref.body.partnerName).toBe('Vendor');
    expect(ref.body.RequestRefID).toBe('fixed-ref-123'); // wire casing: capital ID
    expect(res.code).toBe('0');
    expect(res.status).toBe('USSD Initiated Successfully');
  });

  it('generates a RequestRefID when not supplied', async () => {
    mockOAuth();
    const ref = captureBody();
    await makeDaraja().express.checkout({
      primaryShortCode: '000001',
      receiverShortCode: '000002',
      amount: 10,
      paymentRef: 'p',
      callbackUrl: 'https://example.com/x',
      partnerName: 'V',
    });
    expect(typeof ref.body.RequestRefID).toBe('string');
    expect((ref.body.RequestRefID as string).length).toBeGreaterThan(0);
  });

  it('throws DarajaAPIError when code is not 0', async () => {
    mockOAuth();
    captureBody({ code: '4104', status: 'Missing Nominated Number' });
    await expect(
      makeDaraja().express.checkout({
        primaryShortCode: '000001',
        receiverShortCode: '000002',
        amount: 10,
        paymentRef: 'p',
        callbackUrl: 'https://example.com/x',
        partnerName: 'V',
      }),
    ).rejects.toBeInstanceOf(DarajaAPIError);
  });
});

describe('parseExpressCallback', () => {
  it('parses a successful (flat) callback', () => {
    const r = parseExpressCallback({
      resultCode: '0',
      resultDesc: 'The service request is processed successfully.',
      amount: '71.0',
      requestId: '404e1aec-19e0-4ce3-973d-bd92e94c8021',
      resultType: '0',
      conversationID: 'AG_20230426_2010434680d9f5a73766',
      transactionId: 'RDQ01NFT1Q',
      status: 'SUCCESS',
    });
    expect(r.success).toBe(true);
    expect(r.transactionId).toBe('RDQ01NFT1Q');
    expect(r.conversationId).toBe('AG_20230426_2010434680d9f5a73766');
    expect(r.status).toBe('SUCCESS');
  });

  it('parses a cancelled callback (4001) as not successful', () => {
    const r = parseExpressCallback({
      resultCode: '4001',
      resultDesc: 'User cancelled transaction',
      requestId: 'c2a9ba32-9e11-4b90-892c-7bc54944609a',
      amount: '71.0',
      paymentReference: 'MAndbubry3hi',
    });
    expect(r.success).toBe(false);
    expect(r.resultCode).toBe('4001');
    expect(r.paymentReference).toBe('MAndbubry3hi');
  });

  it('accepts a JSON-string body', () => {
    const r = parseExpressCallback(JSON.stringify({ resultCode: '0' }));
    expect(r.success).toBe(true);
  });
});
