import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Daraja } from '../../src/client.js';
import { DarajaAPIError, DarajaValidationError } from '../../src/errors.js';

const SANDBOX = 'https://sandbox.safaricom.co.ke';
const ENDPOINT = `${SANDBOX}/mpesa/b2c/hakikisha/v1/hakikisha`;
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
    shortcode: '123456',
    passkey: 'pk',
    environment: 'sandbox',
  });
}

const OK = {
  header: { requestID: 'echo-me', timestamp: '1748933384', status: '200', message: 'Success' },
  body: { firstName: 'john', middleName: 'M******', lastName: 'M******' },
};

function captureBody(respond: unknown = OK) {
  const ref: { body: Record<string, unknown> } = { body: {} };
  server.use(
    http.post(ENDPOINT, async ({ request }) => {
      ref.body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(respond);
    }),
  );
  return ref;
}

describe('hakikisha.lookup', () => {
  it('sends the spec body (header + body, shortcode from config, phone as 254…) and parses the masked name', async () => {
    mockOAuth();
    const ref = captureBody();
    const res = await makeDaraja().hakikisha.lookup({
      phone: '0722 000 000',
      requestId: 'echo-me',
    });

    expect(ref.body).toEqual({
      header: { requestID: 'echo-me', timestamp: expect.stringMatching(/^\d{10}$/) },
      body: { msisdn: '254722000000', shortcode: '123456' },
    });
    expect(res).toMatchObject({
      requestId: 'echo-me',
      status: '200',
      message: 'Success',
      firstName: 'john',
      middleName: 'M******',
      lastName: 'M******',
      displayName: 'john M****** M******',
    });
  });

  it('mints a request id when none is given', async () => {
    mockOAuth();
    const ref = captureBody();
    await makeDaraja().hakikisha.lookup({ phone: '254722000000' });
    const header = ref.body.header as { requestID: string };
    expect(header.requestID).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("a non-200 header.status throws DarajaAPIError with Safaricom's body.message", async () => {
    mockOAuth();
    captureBody({
      header: { requestID: 'r-2', timestamp: '20250603074239', status: '400', message: 'Error' },
      body: { message: 'The customer does not exist.' },
    });
    const err = await makeDaraja()
      .hakikisha.lookup({ phone: '254722000000' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DarajaAPIError);
    expect((err as Error).message).toBe('The customer does not exist.');
    expect((err as DarajaAPIError).requestId).toBe('r-2');
  });

  it('refuses a number that is not a Kenyan mobile before any request is sent', async () => {
    mockOAuth();
    await expect(makeDaraja().hakikisha.lookup({ phone: '12345' })).rejects.toBeInstanceOf(
      DarajaValidationError,
    );
  });
});
