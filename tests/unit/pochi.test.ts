import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Daraja } from '../../src/client.js';
import { DarajaAPIError, DarajaValidationError } from '../../src/errors.js';

const SANDBOX = 'https://sandbox.safaricom.co.ke';
const ENDPOINT = `${SANDBOX}/mpesa/b2pochi/v1/paymentrequest`;
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

const ACCEPTED = {
  ConversationID: 'AG_1',
  OriginatorConversationID: 'orig_1',
  ResponseCode: '0',
  ResponseDescription: 'Accept the service request successfully.',
};

function makeDaraja(overrides = {}) {
  return new Daraja({
    consumerKey: 'ck',
    consumerSecret: 'cs',
    shortcode: '600992',
    passkey: 'pk',
    environment: 'sandbox',
    initiator: 'KILELO',
    securityCredential: 'sec-cred',
    ...overrides,
  });
}

function captureBody() {
  const ref: { body: Record<string, unknown> } = { body: {} };
  server.use(
    http.post(ENDPOINT, async ({ request }) => {
      ref.body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(ACCEPTED);
    }),
  );
  return ref;
}

describe('b2c.toPochi', () => {
  it('pays a customer business wallet (BusinessPayToPochi, own caller OCID + misspelled Occassion)', async () => {
    mockOAuth();
    const ref = captureBody();
    const res = await makeDaraja().b2c.toPochi({
      phone: '254705912645',
      amount: 10,
      originatorConversationId: '600992_Test_1',
      occasion: 'ChristmasPay',
      resultUrl: 'https://example.com/r',
      queueTimeoutUrl: 'https://example.com/t',
    });
    expect(ref.body.CommandID).toBe('BusinessPayToPochi');
    expect(ref.body.OriginatorConversationID).toBe('600992_Test_1');
    expect(ref.body.PartyA).toBe(600992);
    expect(ref.body.PartyB).toBe(254705912645);
    expect(ref.body.Amount).toBe(10);
    expect(ref.body.Occassion).toBe('ChristmasPay'); // Safaricom's misspelling
    expect(res.responseCode).toBe('0');
  });

  it('generates an OriginatorConversationID when omitted', async () => {
    mockOAuth();
    const ref = captureBody();
    await makeDaraja().b2c.toPochi({
      phone: '254705912645',
      amount: 10,
      resultUrl: 'https://example.com/r',
      queueTimeoutUrl: 'https://example.com/t',
    });
    expect(typeof ref.body.OriginatorConversationID).toBe('string');
    expect((ref.body.OriginatorConversationID as string).length).toBeGreaterThan(0);
  });

  it('throws DarajaValidationError without an initiator', async () => {
    await expect(
      makeDaraja({ initiator: undefined, securityCredential: undefined }).b2c.toPochi({
        phone: '254705912645',
        amount: 10,
        resultUrl: 'https://example.com/r',
        queueTimeoutUrl: 'https://example.com/t',
      }),
    ).rejects.toBeInstanceOf(DarajaValidationError);
  });

  it('throws DarajaAPIError on a non-zero ResponseCode', async () => {
    mockOAuth();
    server.use(
      http.post(ENDPOINT, () =>
        HttpResponse.json({ ResponseCode: '2001', ResponseDescription: 'Bad' }),
      ),
    );
    await expect(
      makeDaraja().b2c.toPochi({
        phone: '254705912645',
        amount: 10,
        resultUrl: 'https://example.com/r',
        queueTimeoutUrl: 'https://example.com/t',
      }),
    ).rejects.toBeInstanceOf(DarajaAPIError);
  });
});
