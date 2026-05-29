import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Daraja } from '../../src/client.js';
import { DarajaAPIError, DarajaValidationError } from '../../src/errors.js';
import { isSettledByRecipientSpend, parseReversalResult } from '../../src/resources/reversal.js';

const SANDBOX = 'https://sandbox.safaricom.co.ke';
const ENDPOINT = `${SANDBOX}/mpesa/reversal/v1/request`;
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

describe('reversal.request', () => {
  it('POSTs TransactionReversal with ReceiverParty + RecieverIdentifierType 11', async () => {
    mockOAuth();
    let body: Record<string, unknown> = {};
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          ConversationID: 'AG_1',
          OriginatorConversationID: 'orig_1',
          ResponseCode: '0',
          ResponseDescription: 'Accept the service request successfully.',
        });
      }),
    );

    const res = await makeDaraja().reversal.request({
      transactionId: 'NLJ7RT61SV',
      amount: 100,
      resultUrl: 'https://example.com/r',
      queueTimeoutUrl: 'https://example.com/t',
    });

    expect(body.CommandID).toBe('TransactionReversal');
    expect(body.TransactionID).toBe('NLJ7RT61SV');
    expect(body.Amount).toBe(100);
    expect(body.ReceiverParty).toBe(600999);
    expect(body.RecieverIdentifierType).toBe('11');
    expect(body.Initiator).toBe('KILELO');
    expect(res.conversationId).toBe('AG_1');
  });

  it('throws without initiator/securityCredential', async () => {
    await expect(
      makeDaraja({ initiator: undefined, securityCredential: undefined }).reversal.request({
        transactionId: 'x',
        amount: 1,
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
      makeDaraja().reversal.request({
        transactionId: 'x',
        amount: 1,
        resultUrl: 'https://example.com/r',
        queueTimeoutUrl: 'https://example.com/t',
      }),
    ).rejects.toBeInstanceOf(DarajaAPIError);
  });
});

describe('parseReversalResult', () => {
  it('parses the async result envelope', () => {
    const r = parseReversalResult({
      Result: { ResultCode: 0, ResultDesc: 'OK', ConversationID: 'AG_1', TransactionID: 'TX1' },
    });
    expect(r.success).toBe(true);
    expect(r.transactionId).toBe('TX1');
  });

  it('throws on a non-result envelope', () => {
    expect(() => parseReversalResult({ x: 1 })).toThrow(DarajaValidationError);
  });
});

describe('isSettledByRecipientSpend', () => {
  it('flags resultDescs that mean the recipient already used the funds', () => {
    for (const d of [
      'The balance is insufficient',
      'Funds already used',
      'Amount consumed by recipient',
      'already spent',
      'funds utilised',
      'utilise',
    ]) {
      expect(isSettledByRecipientSpend(d)).toBe(true);
    }
  });

  it('does not flag unrelated failures', () => {
    expect(isSettledByRecipientSpend('Invalid initiator information')).toBe(false);
    expect(isSettledByRecipientSpend('')).toBe(false);
  });
});
