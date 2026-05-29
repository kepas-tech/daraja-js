import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Daraja } from '../../src/client.js';
import { DarajaAPIError, DarajaValidationError } from '../../src/errors.js';
import { parseAccountBalance, parseBalanceResult } from '../../src/resources/balance.js';

const SANDBOX = 'https://sandbox.safaricom.co.ke';
const ENDPOINT = `${SANDBOX}/mpesa/accountbalance/v1/query`;
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

describe('balance.query', () => {
  it('posts the AccountBalance command with numeric PartyA + IdentifierType 4', async () => {
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

    const res = await makeDaraja().balance.query({
      resultUrl: 'https://example.com/bal/result',
      queueTimeoutUrl: 'https://example.com/bal/timeout',
    });

    expect(body.Initiator).toBe('KILELO');
    expect(body.SecurityCredential).toBe('sec-cred');
    expect(body.CommandID).toBe('AccountBalance');
    expect(body.PartyA).toBe(600999);
    expect(body.IdentifierType).toBe('4');
    expect(body.ResultURL).toBe('https://example.com/bal/result');
    expect(res.conversationId).toBe('AG_1');
    expect(res.responseCode).toBe('0');
  });

  it('throws DarajaValidationError without initiator/securityCredential', async () => {
    await expect(
      makeDaraja({ initiator: undefined, securityCredential: undefined }).balance.query({
        resultUrl: 'https://example.com/r',
        queueTimeoutUrl: 'https://example.com/t',
      }),
    ).rejects.toBeInstanceOf(DarajaValidationError);
  });

  it('throws DarajaAPIError on a non-zero ResponseCode', async () => {
    mockOAuth();
    server.use(
      http.post(ENDPOINT, () =>
        HttpResponse.json({ ResponseCode: '2001', ResponseDescription: 'Bad initiator' }),
      ),
    );
    await expect(
      makeDaraja().balance.query({
        resultUrl: 'https://example.com/r',
        queueTimeoutUrl: 'https://example.com/t',
      }),
    ).rejects.toBeInstanceOf(DarajaAPIError);
  });
});

describe('parseAccountBalance (pipe-delimited string — gotcha #6)', () => {
  it('parses multiple accounts split by & and fields by |', () => {
    const raw =
      'Working Account|KES|467.00|467.00|0.00|0.00&Utility Account|KES|46740.00|46700.00|40.00|0.00';
    const accounts = parseAccountBalance(raw);
    expect(accounts).toHaveLength(2);
    expect(accounts[0]).toEqual({
      account: 'Working Account',
      currency: 'KES',
      currentBalance: 467,
      availableBalance: 467,
      reserved: 0,
      uncleared: 0,
    });
    expect(accounts[1].account).toBe('Utility Account');
    expect(accounts[1].availableBalance).toBe(46700);
    expect(accounts[1].reserved).toBe(40);
  });

  it('returns [] for an empty string', () => {
    expect(parseAccountBalance('')).toEqual([]);
  });
});

describe('parseBalanceResult', () => {
  it('parses the result envelope and the pipe-delimited balance', () => {
    const r = parseBalanceResult({
      Result: {
        ResultCode: 0,
        ResultDesc: 'OK',
        ConversationID: 'AG_1',
        OriginatorConversationID: 'orig_1',
        ResultParameters: {
          ResultParameter: [
            { Key: 'AccountBalance', Value: 'Working Account|KES|467.00|467.00|0.00|0.00' },
            { Key: 'BOCompletedTime', Value: 20191220123456 },
          ],
        },
      },
    });
    expect(r.success).toBe(true);
    expect(r.balances).toHaveLength(1);
    expect(r.balances[0].availableBalance).toBe(467);
  });

  it('throws on a non-result envelope', () => {
    expect(() => parseBalanceResult({ nope: 1 })).toThrow(DarajaValidationError);
  });
});
