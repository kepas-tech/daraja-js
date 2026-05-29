import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Daraja } from '../../src/client.js';
import { DarajaAPIError, DarajaValidationError } from '../../src/errors.js';
import { parseStatusResult } from '../../src/resources/status.js';

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

function makeDaraja(overrides = {}) {
  return new Daraja({
    consumerKey: 'ck',
    consumerSecret: 'cs',
    shortcode: '600999',
    passkey: 'pk',
    environment: 'sandbox',
    initiator: 'KILELO',
    securityCredential: 'sec-cred',
    ...overrides,
  });
}

describe('status.stkPush (synchronous query)', () => {
  it('POSTs BusinessShortCode/Password/Timestamp/CheckoutRequestID and returns the outcome', async () => {
    mockOAuth();
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`${SANDBOX}/mpesa/stkpushquery/v1/query`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          ResponseCode: '0',
          ResponseDescription: 'The service request has been accepted successfully',
          MerchantRequestID: 'm-1',
          CheckoutRequestID: 'ws_CO_1',
          ResultCode: '0',
          ResultDesc: 'The service request is processed successfully.',
        });
      }),
    );

    const r = await makeDaraja().status.stkPush({ checkoutRequestId: 'ws_CO_1' });

    expect(typeof body.BusinessShortCode).toBe('number');
    expect(body.CheckoutRequestID).toBe('ws_CO_1');
    expect(typeof body.Password).toBe('string');
    expect(r.resultCode).toBe('0');
    expect(r.success).toBe(true);
    expect(r.checkoutRequestId).toBe('ws_CO_1');
  });

  it('reports success=false for a non-zero ResultCode', async () => {
    mockOAuth();
    server.use(
      http.post(`${SANDBOX}/mpesa/stkpushquery/v1/query`, () =>
        HttpResponse.json({
          ResponseCode: '0',
          ResultCode: '1032',
          ResultDesc: 'Cancelled by user',
        }),
      ),
    );
    const r = await makeDaraja().status.stkPush({ checkoutRequestId: 'x' });
    expect(r.success).toBe(false);
    expect(r.resultCode).toBe('1032');
  });
});

describe('status.transaction (async query)', () => {
  it('POSTs the TransactionStatusQuery command, initiator-authed', async () => {
    mockOAuth();
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`${SANDBOX}/mpesa/transactionstatus/v1/query`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          ConversationID: 'AG_1',
          OriginatorConversationID: 'orig_1',
          ResponseCode: '0',
          ResponseDescription: 'Accept the service request successfully.',
        });
      }),
    );

    const res = await makeDaraja().status.transaction({
      transactionId: 'NLJ7RT61SV',
      resultUrl: 'https://example.com/r',
      queueTimeoutUrl: 'https://example.com/t',
    });

    expect(body.CommandID).toBe('TransactionStatusQuery');
    expect(body.TransactionID).toBe('NLJ7RT61SV');
    expect(body.PartyA).toBe(600999);
    expect(body.IdentifierType).toBe('4');
    expect(body.Initiator).toBe('KILELO');
    expect(res.conversationId).toBe('AG_1');
  });

  it('throws without initiator/securityCredential', async () => {
    await expect(
      makeDaraja({ initiator: undefined, securityCredential: undefined }).status.transaction({
        transactionId: 'x',
        resultUrl: 'https://example.com/r',
        queueTimeoutUrl: 'https://example.com/t',
      }),
    ).rejects.toBeInstanceOf(DarajaValidationError);
  });

  it('throws DarajaAPIError on a non-zero ResponseCode', async () => {
    mockOAuth();
    server.use(
      http.post(`${SANDBOX}/mpesa/transactionstatus/v1/query`, () =>
        HttpResponse.json({ ResponseCode: '2001', ResponseDescription: 'Bad' }),
      ),
    );
    await expect(
      makeDaraja().status.transaction({
        transactionId: 'x',
        resultUrl: 'https://example.com/r',
        queueTimeoutUrl: 'https://example.com/t',
      }),
    ).rejects.toBeInstanceOf(DarajaAPIError);
  });
});

describe('parseStatusResult', () => {
  it('parses the async result envelope + params', () => {
    const r = parseStatusResult({
      Result: {
        ResultCode: 0,
        ResultDesc: 'OK',
        ConversationID: 'AG_1',
        ResultParameters: {
          ResultParameter: [
            { Key: 'TransactionStatus', Value: 'Completed' },
            { Key: 'Amount', Value: 100 },
          ],
        },
      },
    });
    expect(r.success).toBe(true);
    expect(r.params.TransactionStatus).toBe('Completed');
  });

  it('throws on a non-result envelope', () => {
    expect(() => parseStatusResult({ x: 1 })).toThrow(DarajaValidationError);
  });
});
