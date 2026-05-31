import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Daraja } from '../../src/client.js';
import { DarajaAPIError } from '../../src/errors.js';

const SANDBOX = 'https://sandbox.safaricom.co.ke';
const CALC = `${SANDBOX}/v1/lipa/na/bonga/calculate-points`;
const REDEEM = `${SANDBOX}/v1/lipa/na/bonga/redeem-paybill`;
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
    shortcode: '888880',
    passkey: 'pk',
    environment: 'sandbox',
  });
}

describe('bonga.calculatePoints', () => {
  it('posts points and returns amount/points/rate from the nested body', async () => {
    mockOAuth();
    const ref: { body: Record<string, unknown> } = { body: {} };
    server.use(
      http.post(CALC, async ({ request }) => {
        ref.body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          header: { responseCode: 200, responseMessage: 'Success' },
          body: { amount: '8', points: '40', rate: '0.2' },
        });
      }),
    );
    const res = await makeDaraja().bonga.calculatePoints({ points: 40 });
    expect(ref.body.points).toBe(40);
    expect(res.amount).toBe('8');
    expect(res.rate).toBe('0.2');
    expect(res.success).toBe(true);
  });

  it('throws DarajaAPIError on a non-200 header responseCode', async () => {
    mockOAuth();
    server.use(
      http.post(CALC, () =>
        HttpResponse.json({ header: { responseCode: 404, responseMessage: 'Fail' }, body: null }),
      ),
    );
    await expect(makeDaraja().bonga.calculatePoints({ points: 1 })).rejects.toBeInstanceOf(
      DarajaAPIError,
    );
  });
});

describe('bonga.redeem', () => {
  it('posts the redemption body and returns the sync ack', async () => {
    mockOAuth();
    const ref: { body: Record<string, unknown> } = { body: {} };
    server.use(
      http.post(REDEEM, async ({ request }) => {
        ref.body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          header: { responseCode: 200, responseMessage: 'Operation Successfully.' },
          body: null,
        });
      }),
    );
    const res = await makeDaraja().bonga.redeem({
      msisdn: '254720776155',
      amount: 50,
      bongaPoints: 20,
      conversionRate: 0.2,
      accountNumber: 'test',
    });
    expect(ref.body.msisdn).toBe('254720776155');
    expect(ref.body.bongaPoints).toBe(20);
    expect(ref.body.shortCode).toBe('888880'); // defaults to config.shortcode
    expect(res.success).toBe(true);
  });
});
