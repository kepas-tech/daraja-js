/**
 * Bill Manager — invoicing + reconciliation for a PayBill.
 *
 * Unlike the rest of Daraja, Bill Manager does NOT use `ResponseCode "0"`:
 * success is the STRING `rescode: "200"` (with `resmsg`/`Status_Message`). All
 * calls use the OAuth bearer token; every call after opt-in also sends the
 * `app_key` header returned by `optIn` (pass it per-call as `appKey`, or set
 * `config.billManagerAppKey`).
 *
 * Proof: docs/specs/bill-manager.md (official Safaricom portal spec).
 */

import type { DarajaConfig } from '../client.js';
import { DarajaValidationError, errorFromResponse } from '../errors.js';
import type { HttpClient } from '../http.js';

type BillManagerConfig = Pick<DarajaConfig, 'shortcode' | 'billManagerAppKey'>;

const BASE = '/v1/billmanager-invoice';
const ENDPOINTS = {
  optIn: `${BASE}/optin`,
  changeOptIn: `${BASE}/change-optin-details`,
  singleInvoicing: `${BASE}/single-invoicing`,
  bulkInvoicing: `${BASE}/bulk-invoicing`,
  reconciliation: `${BASE}/reconciliation`,
  cancelSingle: `${BASE}/cancel-single-invoice`,
  cancelBulk: `${BASE}/cancel-bulk-invoices`,
} as const;

const MAX_BULK = 1000;

/** Raw Bill Manager response — `rescode "200"` is success (not `ResponseCode`). */
interface BillManagerRaw {
  rescode?: string;
  resmsg?: string;
  Status_Message?: string;
  app_key?: string;
  errors?: unknown[];
}

export interface BillManagerResult {
  /** Always `'200'` on the success path (non-200 throws). */
  rescode: string;
  resmsg: string;
  statusMessage?: string | undefined;
  errors?: unknown[] | undefined;
  raw: unknown;
}

export interface BillManagerOptInResult extends BillManagerResult {
  /** Whitelisting key to send as the `app_key` header on later calls. */
  appKey: string;
}

export interface BillManagerOptInInput {
  email: string;
  /** Official contact phone. */
  officialContact: string;
  /** Whether Bill Manager sends payment reminders. */
  sendReminders: boolean | '0' | '1';
  /** Optional logo (image). */
  logo?: string;
  callbackUrl: string;
}

export interface Invoice {
  externalReference: string;
  billedFullName: string;
  billedPhoneNumber: string;
  billedPeriod: string;
  invoiceName: string;
  dueDate: string;
  accountReference: string;
  amount: number | string;
  invoiceItems?: Array<{ itemName: string; amount: number | string }>;
}

export interface SendInvoiceInput extends Invoice {
  /** Overrides `config.billManagerAppKey` for this call. */
  appKey?: string;
}

export interface SendBulkInvoicesInput {
  invoices: Invoice[];
  appKey?: string;
}

export interface CancelInvoiceInput {
  externalReference: string;
  appKey?: string;
}

export interface CancelBulkInvoicesInput {
  externalReferences: string[];
  appKey?: string;
}

export interface AcknowledgePaymentInput {
  paymentDate: string;
  paidAmount: number | string;
  accountReference: string;
  transactionId: string;
  phoneNumber: string;
  fullName: string;
  invoiceName: string;
  externalReference: string;
  appKey?: string;
}

/** Inbound payment-push payload Bill Manager sends to your callback URL. */
export interface BillManagerPayment {
  transactionId: string;
  paidAmount: number;
  msisdn: string;
  dateCreated: string;
  accountReference: string;
  shortCode: string;
  raw: unknown;
}

function toReminderFlag(v: boolean | '0' | '1'): '0' | '1' {
  if (v === '0' || v === '1') return v;
  return v ? '1' : '0';
}

function resolveAppKey(config: BillManagerConfig, perCall?: string): string {
  const key = perCall ?? config.billManagerAppKey;
  if (!key) {
    throw new DarajaValidationError(
      'Bill Manager requires an app_key — pass `appKey` or set `config.billManagerAppKey` (obtained from billManager.optIn)',
    );
  }
  return key;
}

/** POST a Bill Manager call and assert `rescode === '200'`. */
async function bmPost(
  http: HttpClient,
  path: string,
  body: unknown,
  appKey?: string,
): Promise<BillManagerRaw> {
  const opts = appKey ? { headers: { app_key: appKey } } : {};
  const raw = await http.post<BillManagerRaw>(path, body, opts);
  if (raw.rescode !== '200') {
    throw errorFromResponse({
      scope: 'billmanager',
      responseCode: raw.rescode,
      errorMessage: raw.resmsg ?? raw.Status_Message,
      raw,
    });
  }
  return raw;
}

function toResult(raw: BillManagerRaw): BillManagerResult {
  return {
    rescode: raw.rescode ?? '',
    resmsg: raw.resmsg ?? '',
    statusMessage: raw.Status_Message,
    errors: raw.errors,
    raw,
  };
}

function optInBody(
  config: BillManagerConfig,
  input: BillManagerOptInInput,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    shortcode: config.shortcode,
    email: input.email,
    officialContact: input.officialContact,
    sendReminders: toReminderFlag(input.sendReminders),
    callbackurl: input.callbackUrl, // lowercase wire key (per spec)
  };
  if (input.logo !== undefined) body.logo = input.logo;
  return body;
}

export async function optIn(
  http: HttpClient,
  config: BillManagerConfig,
  input: BillManagerOptInInput,
): Promise<BillManagerOptInResult> {
  const raw = await bmPost(http, ENDPOINTS.optIn, optInBody(config, input));
  return { ...toResult(raw), appKey: raw.app_key ?? '' };
}

export async function updateOptIn(
  http: HttpClient,
  config: BillManagerConfig,
  input: BillManagerOptInInput,
): Promise<BillManagerResult> {
  const raw = await bmPost(http, ENDPOINTS.changeOptIn, optInBody(config, input));
  return toResult(raw);
}

function invoiceBody(invoice: Invoice): Record<string, unknown> {
  const body: Record<string, unknown> = {
    externalReference: invoice.externalReference,
    billedFullName: invoice.billedFullName,
    billedPhoneNumber: invoice.billedPhoneNumber,
    billedPeriod: invoice.billedPeriod,
    invoiceName: invoice.invoiceName,
    dueDate: invoice.dueDate,
    accountReference: invoice.accountReference,
    amount: invoice.amount,
  };
  if (invoice.invoiceItems !== undefined) body.invoiceItems = invoice.invoiceItems;
  return body;
}

export async function sendInvoice(
  http: HttpClient,
  config: BillManagerConfig,
  input: SendInvoiceInput,
): Promise<BillManagerResult> {
  const appKey = resolveAppKey(config, input.appKey);
  const raw = await bmPost(http, ENDPOINTS.singleInvoicing, invoiceBody(input), appKey);
  return toResult(raw);
}

export async function sendBulkInvoices(
  http: HttpClient,
  config: BillManagerConfig,
  input: SendBulkInvoicesInput,
): Promise<BillManagerResult> {
  if (input.invoices.length === 0) {
    throw new DarajaValidationError('sendBulkInvoices requires at least one invoice');
  }
  if (input.invoices.length > MAX_BULK) {
    throw new DarajaValidationError(`bulk invoicing is capped at ${MAX_BULK} invoices per call`);
  }
  const appKey = resolveAppKey(config, input.appKey);
  const raw = await bmPost(http, ENDPOINTS.bulkInvoicing, input.invoices.map(invoiceBody), appKey);
  return toResult(raw);
}

export async function cancelInvoice(
  http: HttpClient,
  config: BillManagerConfig,
  input: CancelInvoiceInput,
): Promise<BillManagerResult> {
  const appKey = resolveAppKey(config, input.appKey);
  const raw = await bmPost(
    http,
    ENDPOINTS.cancelSingle,
    { externalReference: input.externalReference },
    appKey,
  );
  return toResult(raw);
}

export async function cancelBulkInvoices(
  http: HttpClient,
  config: BillManagerConfig,
  input: CancelBulkInvoicesInput,
): Promise<BillManagerResult> {
  if (input.externalReferences.length === 0) {
    throw new DarajaValidationError('cancelBulkInvoices requires at least one externalReference');
  }
  const appKey = resolveAppKey(config, input.appKey);
  const raw = await bmPost(
    http,
    ENDPOINTS.cancelBulk,
    input.externalReferences.map((externalReference) => ({ externalReference })),
    appKey,
  );
  return toResult(raw);
}

export async function acknowledgePayment(
  http: HttpClient,
  config: BillManagerConfig,
  input: AcknowledgePaymentInput,
): Promise<BillManagerResult> {
  const appKey = resolveAppKey(config, input.appKey);
  const raw = await bmPost(
    http,
    ENDPOINTS.reconciliation,
    {
      paymentDate: input.paymentDate,
      paidAmount: input.paidAmount,
      accountReference: input.accountReference,
      transactionId: input.transactionId,
      phoneNumber: input.phoneNumber,
      fullName: input.fullName,
      invoiceName: input.invoiceName,
      externalReference: input.externalReference,
    },
    appKey,
  );
  return toResult(raw);
}

interface PaymentPushRaw {
  transactionId?: string;
  paidAmount?: number | string;
  msisdn?: string;
  dateCreated?: string;
  accountReference?: string;
  shortCode?: string;
}

/**
 * Parse an inbound Bill Manager payment push (sent to your callback URL, retried
 * up to 5×). Reply with `billManagerAck()`. Accepts an object or JSON string.
 */
export function parseBillManagerPayment(body: unknown): BillManagerPayment {
  const o = (typeof body === 'string' ? JSON.parse(body) : body) as PaymentPushRaw | null;
  if (!o || o.transactionId == null) {
    throw new DarajaValidationError('not a Bill Manager payment push (missing transactionId)');
  }
  return {
    transactionId: o.transactionId,
    paidAmount: Number(o.paidAmount ?? 0),
    msisdn: o.msisdn ?? '',
    dateCreated: o.dateCreated ?? '',
    accountReference: o.accountReference ?? '',
    shortCode: o.shortCode ?? '',
    raw: o,
  };
}

/** The body Bill Manager expects in reply to a payment push. */
export function billManagerAck(): { rescode: string; resmsg: string } {
  return { rescode: '200', resmsg: 'Success' };
}
