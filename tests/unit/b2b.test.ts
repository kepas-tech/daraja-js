import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Daraja } from '../../src/client.js';
import { DarajaAPIError, DarajaValidationError } from '../../src/errors.js';
import { parseB2bResult } from '../../src/resources/b2b.js';

const SANDBOX = 'https://sandbox.safaricom.co.ke';
const ENDPOINT = `${SANDBOX}/mpesa/b2b/v1/paymentrequest`;
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
    shortcode: '600999',
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

describe('b2b.pay', () => {
  it('pays another paybill (BusinessPayBill, both identifiers 4, numeric parties)', async () => {
    mockOAuth();
    const ref = captureBody();

    const res = await makeDaraja().b2b.pay({
      toShortcode: '888880',
      amount: 250,
      accountReference: 'INV-9',
      resultUrl: 'https://example.com/b2b/result',
      queueTimeoutUrl: 'https://example.com/b2b/timeout',
    });

    expect(ref.body.CommandID).toBe('BusinessPayBill');
    expect(ref.body.SenderIdentifierType).toBe('4');
    expect(ref.body.RecieverIdentifierType).toBe('4'); // Daraja's misspelling
    expect(ref.body.PartyA).toBe(600999);
    expect(ref.body.PartyB).toBe(888880);
    expect(ref.body.Amount).toBe(250);
    expect(ref.body.AccountReference).toBe('INV-9');
    expect(res.responseCode).toBe('0');
  });

  it('uses ReceiverIdentifierType 2 for BusinessBuyGoods', async () => {
    mockOAuth();
    const ref = captureBody();
    await makeDaraja().b2b.pay({
      toShortcode: '777777',
      amount: 10,
      commandId: 'BusinessBuyGoods',
      resultUrl: 'https://example.com/r',
      queueTimeoutUrl: 'https://example.com/t',
    });
    expect(ref.body.CommandID).toBe('BusinessBuyGoods');
    expect(ref.body.RecieverIdentifierType).toBe('2');
  });
});

describe('b2b.transferFloat', () => {
  it('moves Working→Utility with BusinessTransferFromMMFToUtility, PartyA=PartyB=own shortcode', async () => {
    mockOAuth();
    const ref = captureBody();
    await makeDaraja().b2b.transferFloat({
      amount: 1000,
      direction: 'toUtility',
      resultUrl: 'https://example.com/r',
      queueTimeoutUrl: 'https://example.com/t',
    });
    expect(ref.body.CommandID).toBe('BusinessTransferFromMMFToUtility');
    expect(ref.body.PartyA).toBe(600999);
    expect(ref.body.PartyB).toBe(600999);
  });

  it('sweeps Utility→Working with BusinessTransferFromUtilityToMMF', async () => {
    mockOAuth();
    const ref = captureBody();
    await makeDaraja().b2b.transferFloat({
      amount: 1000,
      direction: 'toWorking',
      resultUrl: 'https://example.com/r',
      queueTimeoutUrl: 'https://example.com/t',
    });
    expect(ref.body.CommandID).toBe('BusinessTransferFromUtilityToMMF');
  });
});

describe('b2b guards', () => {
  it('throws DarajaValidationError without initiator/securityCredential', async () => {
    await expect(
      makeDaraja({ initiator: undefined, securityCredential: undefined }).b2b.pay({
        toShortcode: '888880',
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
      makeDaraja().b2b.transferFloat({
        amount: 1,
        direction: 'toUtility',
        resultUrl: 'https://example.com/r',
        queueTimeoutUrl: 'https://example.com/t',
      }),
    ).rejects.toBeInstanceOf(DarajaAPIError);
  });
});

describe('b2b.topUp', () => {
  it('loads a B2C shortcode (BusinessPayToBulk, both identifiers 4, optional Requester)', async () => {
    mockOAuth();
    const ref = captureBody();
    const res = await makeDaraja().b2b.topUp({
      toShortcode: '600000',
      amount: 239,
      requester: '254708374149',
      accountReference: 'TOP1',
      resultUrl: 'https://example.com/r',
      queueTimeoutUrl: 'https://example.com/t',
    });
    expect(ref.body.CommandID).toBe('BusinessPayToBulk');
    expect(ref.body.SenderIdentifierType).toBe('4');
    expect(ref.body.RecieverIdentifierType).toBe('4'); // Daraja's misspelling
    expect(ref.body.PartyA).toBe(600999);
    expect(ref.body.PartyB).toBe(600000);
    expect(ref.body.Amount).toBe(239);
    expect(ref.body.Requester).toBe('254708374149');
    expect(ref.body.AccountReference).toBe('TOP1');
    expect(res.responseCode).toBe('0');
  });

  it('omits Requester when not supplied', async () => {
    mockOAuth();
    const ref = captureBody();
    await makeDaraja().b2b.topUp({
      toShortcode: '600000',
      amount: 10,
      resultUrl: 'https://example.com/r',
      queueTimeoutUrl: 'https://example.com/t',
    });
    expect('Requester' in ref.body).toBe(false);
  });
});

describe('b2b.remitTax', () => {
  const REMITTAX = `${SANDBOX}/mpesa/b2b/v1/remittax`;

  function captureRemitTax() {
    const ref: { body: Record<string, unknown> } = { body: {} };
    server.use(
      http.post(REMITTAX, async ({ request }) => {
        ref.body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(ACCEPTED);
      }),
    );
    return ref;
  }

  it('remits tax to KRA (PayTaxToKRA, PartyB 572572, AccountReference = PRN)', async () => {
    mockOAuth();
    const ref = captureRemitTax();
    const res = await makeDaraja().b2b.remitTax({
      amount: 239,
      prn: 'PRN1234XN',
      resultUrl: 'https://example.com/r',
      queueTimeoutUrl: 'https://example.com/t',
    });
    expect(ref.body.CommandID).toBe('PayTaxToKRA');
    expect(ref.body.SenderIdentifierType).toBe('4');
    expect(ref.body.RecieverIdentifierType).toBe('4');
    expect(ref.body.PartyA).toBe(600999);
    expect(ref.body.PartyB).toBe(572572);
    expect(ref.body.AccountReference).toBe('PRN1234XN');
    expect(ref.body.Amount).toBe(239);
    expect(res.responseCode).toBe('0');
  });

  it('throws DarajaValidationError without an initiator', async () => {
    await expect(
      makeDaraja({ initiator: undefined, securityCredential: undefined }).b2b.remitTax({
        amount: 1,
        prn: 'PRN1',
        resultUrl: 'https://example.com/r',
        queueTimeoutUrl: 'https://example.com/t',
      }),
    ).rejects.toBeInstanceOf(DarajaValidationError);
  });
});

describe('parseB2bResult', () => {
  it('parses a successful B2B result', () => {
    const r = parseB2bResult({
      Result: {
        ResultCode: 0,
        ResultDesc: 'OK',
        ConversationID: 'AG_1',
        TransactionID: 'TX1',
        ResultParameters: {
          ResultParameter: [
            { Key: 'Amount', Value: 250 },
            { Key: 'DebitAccountBalance', Value: 'x' },
          ],
        },
      },
    });
    expect(r.success).toBe(true);
    expect(r.transactionId).toBe('TX1');
    expect(r.params.Amount).toBe(250);
  });

  it('throws on a non-result envelope', () => {
    expect(() => parseB2bResult({ x: 1 })).toThrow(DarajaValidationError);
  });
});
