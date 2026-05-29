import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Daraja } from '../../src/client.js';
import { DarajaAPIError } from '../../src/errors.js';

const SANDBOX = 'https://sandbox.safaricom.co.ke';
const ENDPOINT = `${SANDBOX}/mpesa/qrcode/v1/generate`;
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

describe('qr.generate', () => {
  it('posts MerchantName/RefNo/Amount/TrxCode/CPI/Size; success on ResponseCode "00"', async () => {
    mockOAuth();
    let body: Record<string, unknown> = {};
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          ResponseCode: '00',
          ResponseDescription: 'QR Code Successfully Generated.',
          QRCode: 'BASE64-QR',
        });
      }),
    );

    const r = await makeDaraja().qr.generate({
      accountReference: 'INV-1',
      amount: 100,
      merchantName: 'KEPAS',
    });

    expect(body.MerchantName).toBe('KEPAS');
    expect(body.RefNo).toBe('INV-1');
    expect(body.Amount).toBe(100);
    expect(body.TrxCode).toBe('PB'); // default
    expect(body.CPI).toBe('600999');
    expect(body.Size).toBe('300'); // default, as string
    expect(r.qrCode).toBe('BASE64-QR');
    expect(r.responseCode).toBe('00');
  });

  it('honors an explicit TrxCode and size', async () => {
    mockOAuth();
    let body: Record<string, unknown> = {};
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ResponseCode: '00', QRCode: 'x' });
      }),
    );
    await makeDaraja().qr.generate({ accountReference: 'r', trxCode: 'BG', size: 500 });
    expect(body.TrxCode).toBe('BG');
    expect(body.Size).toBe('500');
  });

  it('throws DarajaAPIError when ResponseCode is not "00"', async () => {
    mockOAuth();
    server.use(
      http.post(ENDPOINT, () =>
        HttpResponse.json({ ResponseCode: '1', ResponseDescription: 'Bad' }),
      ),
    );
    await expect(makeDaraja().qr.generate({ accountReference: 'r' })).rejects.toBeInstanceOf(
      DarajaAPIError,
    );
  });
});
