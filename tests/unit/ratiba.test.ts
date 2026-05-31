import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Daraja } from '../../src/client.js';
import { DarajaAPIError } from '../../src/errors.js';
import { parseRatibaCallback } from '../../src/resources/ratiba.js';

const SANDBOX = 'https://sandbox.safaricom.co.ke';
const ENDPOINT = `${SANDBOX}/standingorder/v1/createStandingOrderExternal`;
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

const ACK_OK = {
  ResponseHeader: {
    responseRefID: 'ref-1',
    responseCode: '200',
    responseDescription: 'Request accepted for processing',
    ResultDesc: 'The service request is processed successfully.',
  },
  ResponseBody: { responseDescription: 'Request accepted for processing', responseCode: '200' },
};

function makeDaraja(overrides = {}) {
  return new Daraja({
    consumerKey: 'ck',
    consumerSecret: 'cs',
    shortcode: '174379',
    passkey: 'pk',
    environment: 'sandbox',
    ...overrides,
  });
}

function captureBody() {
  const ref: { body: Record<string, unknown> } = { body: {} };
  server.use(
    http.post(ENDPOINT, async ({ request }) => {
      ref.body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(ACK_OK);
    }),
  );
  return ref;
}

const BASE_INPUT = {
  name: 'Phone Lipa Mdogo Mdogo',
  startDate: '20240905',
  endDate: '20250905',
  transactionType: 'paybill' as const,
  amount: 4500,
  phone: '254712345678',
  callbackUrl: 'https://example.com/ratiba',
  accountReference: 'Test',
  transactionDesc: 'Repayment',
  frequency: '4' as const,
};

describe('ratiba.create', () => {
  it('posts a paybill standing order with the exact wire fields', async () => {
    mockOAuth();
    const ref = captureBody();
    const res = await makeDaraja().ratiba.create(BASE_INPUT);

    expect(ref.body.StandingOrderName).toBe('Phone Lipa Mdogo Mdogo');
    expect(ref.body.TransactionType).toBe('Standing Order Customer Pay Bill');
    expect(ref.body.ReceiverPartyIdentifierType).toBe('4');
    expect(ref.body.BusinessShortCode).toBe('174379'); // defaults to config.shortcode
    expect(ref.body.PartyA).toBe('254712345678');
    expect(ref.body.Frequency).toBe('4');
    expect(ref.body.CallBackURL).toBe('https://example.com/ratiba');
    expect(res.responseCode).toBe('200');
  });

  it('maps buygoods to the (misspelled) Marchant string + identifier 2', async () => {
    mockOAuth();
    const ref = captureBody();
    await makeDaraja().ratiba.create({ ...BASE_INPUT, transactionType: 'buygoods' });
    expect(ref.body.TransactionType).toBe('Standing Order Customer Pay Marchant');
    expect(ref.body.ReceiverPartyIdentifierType).toBe('2');
  });

  it('throws DarajaAPIError when the nested responseCode is not 200', async () => {
    mockOAuth();
    server.use(
      http.post(ENDPOINT, () =>
        HttpResponse.json({
          ResponseHeader: { responseCode: '401', responseDescription: 'Unauthorized' },
          ResponseBody: { responseCode: '401' },
        }),
      ),
    );
    await expect(makeDaraja().ratiba.create(BASE_INPUT)).rejects.toBeInstanceOf(DarajaAPIError);
  });
});

describe('parseRatibaCallback', () => {
  it('parses a successful callback (name/value responseData)', () => {
    const r = parseRatibaCallback({
      responseHeader: {
        responseRefID: 'r1',
        requestRefID: 'q1',
        responseCode: '0',
        responseDescription: 'The service request is processed successfully',
      },
      responseBody: {
        responseData: [
          { name: 'TransactionID', value: 'SC8F2IQMH5' },
          { name: 'responseCode', value: '0' },
          { name: 'Status', value: 'OKAY' },
          { name: 'Msisdn', value: '254******867' },
        ],
      },
    });
    expect(r.success).toBe(true);
    expect(r.transactionId).toBe('SC8F2IQMH5');
    expect(r.status).toBe('OKAY');
    expect(r.msisdn).toBe('254******867');
  });

  it('parses a failed callback (1037) as not successful', () => {
    const r = parseRatibaCallback({
      ResponseHeader: { responseCode: '1037', responseDescription: 'Error' },
      ResponseBody: {
        ResponseData: [
          { Name: 'TransactionID', Value: '0000000000' },
          { Name: 'responseCode', Value: '1037' },
          { Name: 'Status', Value: 'ERROR' },
        ],
      },
    });
    expect(r.success).toBe(false);
    expect(r.responseCode).toBe('1037');
    expect(r.status).toBe('ERROR');
  });

  it('accepts a JSON-string body', () => {
    const r = parseRatibaCallback(
      JSON.stringify({ responseHeader: { responseCode: '0' }, responseBody: { responseData: [] } }),
    );
    expect(r.success).toBe(true);
  });
});
