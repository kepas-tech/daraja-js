import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Daraja } from '../../src/client.js';
import { DarajaAPIError, DarajaValidationError } from '../../src/errors.js';
import { billManagerAck, parseBillManagerPayment } from '../../src/resources/bill-manager.js';

const SANDBOX = 'https://sandbox.safaricom.co.ke';
const BASE = `${SANDBOX}/v1/billmanager-invoice`;
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
    shortcode: '718003',
    passkey: 'pk',
    environment: 'sandbox',
    billManagerAppKey: 'AG_app_key_from_config',
    ...overrides,
  });
}

/** Capture the request body + headers for one POST to `path`, returning `respond`. */
function capture(path: string, respond: unknown) {
  const ref: { body: unknown; appKey: string | null; auth: string | null } = {
    body: undefined,
    appKey: null,
    auth: null,
  };
  server.use(
    http.post(`${BASE}${path}`, async ({ request }) => {
      ref.body = await request.json();
      ref.appKey = request.headers.get('app_key');
      ref.auth = request.headers.get('authorization');
      return HttpResponse.json(respond);
    }),
  );
  return ref;
}

const OPTIN_OK = { app_key: 'AG_returned_key', resmsg: 'Success', rescode: '200' };
const INVOICE_OK = {
  Status_Message: 'Invoice sent successfully',
  resmsg: 'Success',
  rescode: '200',
};

const SAMPLE_INVOICE = {
  externalReference: '113',
  billedFullName: 'John Doe',
  billedPhoneNumber: '0710000000',
  billedPeriod: 'August 2021',
  invoiceName: 'Water Bill',
  dueDate: '2021-09-15',
  accountReference: 'ACC-1',
  amount: 800,
  invoiceItems: [{ itemName: 'water', amount: 800 }],
};

describe('billManager.optIn', () => {
  it('posts lowercase callbackurl + shortcode, sends NO app_key header, returns appKey', async () => {
    mockOAuth();
    const ref = capture('/optin', OPTIN_OK);

    const res = await makeDaraja().billManager.optIn({
      email: 'biz@example.com',
      officialContact: '0710000000',
      sendReminders: true,
      callbackUrl: 'https://my.server/bm/callback',
    });

    const body = ref.body as Record<string, unknown>;
    expect(body.shortcode).toBe('718003');
    expect(body.email).toBe('biz@example.com');
    expect(body.officialContact).toBe('0710000000');
    expect(body.sendReminders).toBe('1'); // boolean → '1'
    expect(body.callbackurl).toBe('https://my.server/bm/callback'); // lowercase wire key
    expect(ref.appKey).toBeNull(); // optIn carries no app_key header
    expect(res.appKey).toBe('AG_returned_key');
    expect(res.rescode).toBe('200');
  });

  it('throws DarajaAPIError when optIn returns a non-200 rescode (409)', async () => {
    mockOAuth();
    server.use(
      http.post(`${BASE}/optin`, () =>
        HttpResponse.json({ rescode: '409', resmsg: 'Biller already Registered' }),
      ),
    );
    await expect(
      makeDaraja().billManager.optIn({
        email: 'a@b.com',
        officialContact: '0710000000',
        sendReminders: false,
        callbackUrl: 'https://x/y',
      }),
    ).rejects.toBeInstanceOf(DarajaAPIError);
  });
});

describe('billManager.sendInvoice', () => {
  it('sends the app_key header from config fallback + encodes invoiceItems', async () => {
    mockOAuth();
    const ref = capture('/single-invoicing', INVOICE_OK);

    const res = await makeDaraja().billManager.sendInvoice(SAMPLE_INVOICE);

    const body = ref.body as Record<string, unknown>;
    expect(ref.appKey).toBe('AG_app_key_from_config'); // resolved from config
    expect(ref.auth).toBe('Bearer tok-1'); // auth not clobbered by extra header
    expect(body.externalReference).toBe('113');
    expect(body.invoiceItems).toEqual([{ itemName: 'water', amount: 800 }]);
    expect(res.rescode).toBe('200');
  });

  it('prefers an explicit input.appKey over the config fallback', async () => {
    mockOAuth();
    const ref = capture('/single-invoicing', INVOICE_OK);
    await makeDaraja().billManager.sendInvoice({ ...SAMPLE_INVOICE, appKey: 'AG_explicit' });
    expect(ref.appKey).toBe('AG_explicit');
  });

  it('throws DarajaValidationError when no appKey is resolvable', async () => {
    mockOAuth();
    await expect(
      makeDaraja({ billManagerAppKey: undefined }).billManager.sendInvoice(SAMPLE_INVOICE),
    ).rejects.toBeInstanceOf(DarajaValidationError);
  });
});

describe('billManager.sendBulkInvoices', () => {
  it('posts an array of invoices', async () => {
    mockOAuth();
    const ref = capture('/bulk-invoicing', INVOICE_OK);
    await makeDaraja().billManager.sendBulkInvoices({ invoices: [SAMPLE_INVOICE, SAMPLE_INVOICE] });
    expect(Array.isArray(ref.body)).toBe(true);
    expect((ref.body as unknown[]).length).toBe(2);
    expect(ref.appKey).toBe('AG_app_key_from_config');
  });

  it('throws DarajaValidationError above the 1000-invoice cap', async () => {
    const invoices = Array.from({ length: 1001 }, () => SAMPLE_INVOICE);
    await expect(makeDaraja().billManager.sendBulkInvoices({ invoices })).rejects.toBeInstanceOf(
      DarajaValidationError,
    );
  });

  it('throws DarajaValidationError on an empty invoice list', async () => {
    await expect(
      makeDaraja().billManager.sendBulkInvoices({ invoices: [] }),
    ).rejects.toBeInstanceOf(DarajaValidationError);
  });
});

describe('billManager.cancelInvoice', () => {
  it('surfaces a 409 (paid invoice) as DarajaAPIError', async () => {
    mockOAuth();
    server.use(
      http.post(`${BASE}/cancel-single-invoice`, () =>
        HttpResponse.json({
          rescode: '409',
          resmsg: 'Fail',
          Status_Message: 'partially or fully paid invoices cannot be cancelled',
          errors: [{ externalReference: '113' }],
        }),
      ),
    );
    await expect(
      makeDaraja().billManager.cancelInvoice({ externalReference: '113' }),
    ).rejects.toBeInstanceOf(DarajaAPIError);
  });
});

describe('billManager.acknowledgePayment', () => {
  it('posts the 8 reconciliation fields with the app_key header', async () => {
    mockOAuth();
    const ref = capture('/reconciliation', { resmsg: 'Success', rescode: '200' });
    await makeDaraja().billManager.acknowledgePayment({
      paymentDate: '2021-08-04',
      paidAmount: 800,
      accountReference: 'ACC-1',
      transactionId: 'PBL31AA5TX',
      phoneNumber: '254710000000',
      fullName: 'John Doe',
      invoiceName: 'Water Bill',
      externalReference: '113',
    });
    const body = ref.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      [
        'accountReference',
        'externalReference',
        'fullName',
        'invoiceName',
        'paidAmount',
        'paymentDate',
        'phoneNumber',
        'transactionId',
      ].sort(),
    );
    expect(ref.appKey).toBe('AG_app_key_from_config');
  });
});

describe('parseBillManagerPayment', () => {
  const push = {
    transactionId: 'PBL31AA5TX',
    paidAmount: 800,
    msisdn: '254710000000',
    dateCreated: '2021-08-04 12:00:00',
    accountReference: 'ACC-1',
    shortCode: '718003',
  };

  it('parses an inbound payment-push object', () => {
    const p = parseBillManagerPayment(push);
    expect(p.transactionId).toBe('PBL31AA5TX');
    expect(p.paidAmount).toBe(800);
    expect(p.shortCode).toBe('718003');
  });

  it('parses a JSON-string body', () => {
    const p = parseBillManagerPayment(JSON.stringify(push));
    expect(p.transactionId).toBe('PBL31AA5TX');
  });

  it('throws DarajaValidationError when transactionId is missing', () => {
    expect(() => parseBillManagerPayment({ paidAmount: 1 })).toThrow(DarajaValidationError);
  });
});

describe('billManagerAck', () => {
  it('returns the 200 acknowledgment Bill Manager expects in reply to a push', () => {
    expect(billManagerAck()).toEqual({ rescode: '200', resmsg: 'Success' });
  });
});
