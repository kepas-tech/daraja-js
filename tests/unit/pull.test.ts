import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Daraja } from '../../src/client.js';
import { DarajaAPIError } from '../../src/errors.js';

const SANDBOX = 'https://sandbox.safaricom.co.ke';
const REGISTER = `${SANDBOX}/pulltransactions/v1/register`;
const QUERY = `${SANDBOX}/pulltransactions/v1/query`;
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
    shortcode: '600999',
    passkey: 'pk',
    environment: 'sandbox',
  });
}

describe('pull.registerUrl', () => {
  it('posts ShortCode(number)/RequestType/NominatedNumber/CallBackURL; success on 1000', async () => {
    mockOAuth();
    let body: Record<string, unknown> = {};
    server.use(
      http.post(REGISTER, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ 'Response Status': '1000', 'Response Description': 'Success' });
      }),
    );

    const r = await makeDaraja().pull.registerUrl({
      nominatedNumber: '0712345678',
      callbackUrl: 'https://example.com/pull',
    });

    expect(typeof body.ShortCode).toBe('number');
    expect(body.ShortCode).toBe(600999);
    expect(body.RequestType).toBe('Pull');
    expect(body.NominatedNumber).toBe('254712345678'); // normalized phone, not shortcode
    expect(body.CallBackURL).toBe('https://example.com/pull');
    expect(r.responseStatus).toBe('1000');
  });

  it('treats 1001 (already registered) as success', async () => {
    mockOAuth();
    server.use(
      http.post(REGISTER, () =>
        HttpResponse.json({
          'Response Status': '1001',
          errorMessage: 'Shortcode already Registered!',
        }),
      ),
    );
    const r = await makeDaraja().pull.registerUrl({
      nominatedNumber: '254712345678',
      callbackUrl: 'https://example.com/pull',
    });
    expect(r.responseStatus).toBe('1001');
  });

  it('throws DarajaAPIError on any other status', async () => {
    mockOAuth();
    server.use(http.post(REGISTER, () => HttpResponse.json({ 'Response Status': '500' })));
    await expect(
      makeDaraja().pull.registerUrl({
        nominatedNumber: '254712345678',
        callbackUrl: 'https://example.com/p',
      }),
    ).rejects.toBeInstanceOf(DarajaAPIError);
  });
});

describe('pull.query', () => {
  it('posts ShortCode(number)/StartDate/EndDate/OffSetValue(number) and flattens transactions', async () => {
    mockOAuth();
    let body: Record<string, unknown> = {};
    server.use(
      http.post(QUERY, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          ResponseCode: '1000',
          ResponseMessage: 'Success',
          Response: [
            [
              { transactionId: 'A', amount: 10 },
              { transactionId: 'B', amount: 20 },
            ],
          ],
        });
      }),
    );

    const r = await makeDaraja().pull.query({
      startDate: '2026-05-01 00:00:00',
      endDate: '2026-05-29 23:59:59',
    });

    expect(body.ShortCode).toBe(600999);
    expect(body.StartDate).toBe('2026-05-01 00:00:00');
    expect(typeof body.OffSetValue).toBe('number'); // gotcha #10 — number, not string
    expect(body.OffSetValue).toBe(0); // default
    expect(r.transactions).toHaveLength(2);
    expect(r.transactions[0].transactionId).toBe('A');
  });
});
