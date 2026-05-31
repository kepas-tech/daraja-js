import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Daraja } from '../../src/client.js';

const SANDBOX = 'https://sandbox.safaricom.co.ke';
const ENDPOINT = `${SANDBOX}/sfcverify/v1/query/info`;
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
  ConversationID: '410c-48e1',
  ResponseCode: '4000',
  ResponseMessage: 'Success',
  DetailedMessage: 'Request received successfully',
  OrganizationShortCode: '666677',
  OrganizationName: 'Daraja',
  ChargeProfileID: '20013',
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

describe('orgInfo.query', () => {
  it('looks up a paybill (IdentifierType 4) and returns the parsed org info', async () => {
    mockOAuth();
    const ref = captureBody();
    const res = await makeDaraja().orgInfo.query({
      identifier: '666677',
      identifierType: 'paybill',
    });
    expect(ref.body.IdentifierType).toBe('4');
    expect(ref.body.Identifier).toBe('666677');
    expect(res.success).toBe(true);
    expect(res.organizationName).toBe('Daraja');
    expect(res.chargeProfileId).toBe('20013');
    expect(res.responseCode).toBe('4000');
  });

  it('maps till to IdentifierType 2', async () => {
    mockOAuth();
    const ref = captureBody();
    await makeDaraja().orgInfo.query({ identifier: '555555', identifierType: 'till' });
    expect(ref.body.IdentifierType).toBe('2');
  });

  it('returns success=false when no OrganizationName comes back', async () => {
    mockOAuth();
    captureBody({ ResponseCode: '1', ResponseMessage: 'Fail', DetailedMessage: 'Rejected' });
    const res = await makeDaraja().orgInfo.query({
      identifier: '000000',
      identifierType: 'paybill',
    });
    expect(res.success).toBe(false);
    expect(res.responseMessage).toBe('Fail');
  });
});
