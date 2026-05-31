/**
 * The Daraja client — the SDK entry point. Validates config, wires the OAuth
 * token manager and HTTP transport, and exposes the resource namespaces.
 */

import { TokenManager, type TokenResponse, type TokenStore } from './auth.js';
import { DarajaAuthError, DarajaValidationError } from './errors.js';
import { HttpClient } from './http.js';
import {
  type B2bAck,
  type B2bPayInput,
  type B2bTopUpInput,
  pay as b2bPay,
  remitTax as b2bRemitTax,
  topUp as b2bTopUp,
  transferFloat as b2bTransferFloat,
  type FloatTransferInput,
  type RemitTaxInput,
} from './resources/b2b.js';
import {
  type ExpressCheckoutAck,
  type ExpressCheckoutInput,
  checkout as expressCheckout,
} from './resources/b2b-express.js';
import {
  type B2cSendInput,
  type B2cSendResult,
  type B2cToPochiInput,
  send as b2cSend,
  toPochi as b2cToPochi,
} from './resources/b2c.js';
import {
  type BalanceQueryInput,
  type BalanceQueryResult,
  query as balanceQuery,
} from './resources/balance.js';
import {
  type AcknowledgePaymentInput,
  type BillManagerOptInInput,
  type BillManagerOptInResult,
  type BillManagerResult,
  acknowledgePayment as bmAcknowledgePayment,
  cancelBulkInvoices as bmCancelBulkInvoices,
  cancelInvoice as bmCancelInvoice,
  optIn as bmOptIn,
  sendBulkInvoices as bmSendBulkInvoices,
  sendInvoice as bmSendInvoice,
  updateOptIn as bmUpdateOptIn,
  type CancelBulkInvoicesInput,
  type CancelInvoiceInput,
  type SendBulkInvoicesInput,
  type SendInvoiceInput,
} from './resources/bill-manager.js';
import {
  calculatePoints as bongaCalculatePoints,
  redeem as bongaRedeem,
  type CalculatePointsInput,
  type CalculatePointsResult,
  type RedeemAck,
  type RedeemInput,
} from './resources/bonga.js';
import { type RegisterUrlsInput, type RegisterUrlsResult, registerUrls } from './resources/c2b.js';
import {
  type OrgInfoQueryInput,
  type OrgInfoResult,
  query as orgInfoQuery,
} from './resources/org-info.js';
import {
  type PullQueryInput,
  type PullQueryResult,
  type PullRegisterInput,
  type PullRegisterResult,
  query as pullQuery,
  registerUrl as pullRegisterUrl,
} from './resources/pull.js';
import {
  type QrGenerateInput,
  type QrGenerateResult,
  generate as qrGenerate,
} from './resources/qr.js';
import {
  type RatibaAck,
  type RatibaCreateInput,
  create as ratibaCreate,
} from './resources/ratiba.js';
import {
  type ReversalAck,
  type ReversalInput,
  request as reversalRequest,
} from './resources/reversal.js';
import {
  type StatusAck,
  type StkStatusInput,
  type StkStatusResult,
  stkPush as statusStkPush,
  transaction as statusTransaction,
  type TransactionStatusInput,
} from './resources/status.js';
import { type StkPushInput, type StkPushResult, stkPush } from './resources/stk-push.js';

export interface DarajaConfig {
  consumerKey: string;
  consumerSecret: string;
  /** PayBill or Till shortcode. */
  shortcode: string;
  /** Passkey for STK password derivation. */
  passkey: string;
  environment: 'sandbox' | 'production';
  /** STK transaction type. Defaults to PayBill. */
  transactionType?: 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline';
  /** Initiator name — required for B2C/B2B/balance/status/reversal. */
  initiator?: string;
  /** RSA-encrypted initiator password (see `generateSecurityCredential`). */
  securityCredential?: string;
  /** Retries on 5xx. Default 2. */
  maxNetworkRetries?: number;
  /** Bill Manager `app_key` (from `billManager.optIn`) — fallback for invoicing calls. */
  billManagerAppKey?: string;
  /** Cross-process OAuth token cache (e.g. Redis). Defaults to per-process. */
  tokenStore?: TokenStore;
  /** `fetch` override, for tests or custom runtimes. */
  fetchImpl?: typeof fetch;
}

const BASE_URLS: Record<DarajaConfig['environment'], string> = {
  sandbox: 'https://sandbox.safaricom.co.ke',
  production: 'https://api.safaricom.co.ke',
};

const REQUIRED_KEYS = ['consumerKey', 'consumerSecret', 'shortcode', 'passkey'] as const;

export class Daraja {
  readonly config: DarajaConfig;
  private readonly http: HttpClient;

  /** Money-in collection (STK Push, C2B). */
  readonly collect: {
    stkPush: (input: StkPushInput) => Promise<StkPushResult>;
  };

  /** C2B — register callback URLs for direct PayBill/Till payments. */
  readonly c2b: {
    registerUrls: (input: RegisterUrlsInput) => Promise<RegisterUrlsResult>;
  };

  /** B2C — disburse money to a customer phone, or to a business wallet (pochi). */
  readonly b2c: {
    send: (input: B2cSendInput) => Promise<B2cSendResult>;
    toPochi: (input: B2cToPochiInput) => Promise<B2cSendResult>;
  };

  /** Account balance query (read-only). */
  readonly balance: {
    query: (input: BalanceQueryInput) => Promise<BalanceQueryResult>;
  };

  /** B2B — pay another business, move float, top up a B2C shortcode, or remit tax. */
  readonly b2b: {
    pay: (input: B2bPayInput) => Promise<B2bAck>;
    transferFloat: (input: FloatTransferInput) => Promise<B2bAck>;
    topUp: (input: B2bTopUpInput) => Promise<B2bAck>;
    remitTax: (input: RemitTaxInput) => Promise<B2bAck>;
  };

  /** Transaction status — STK Push (sync) and any transaction (async). */
  readonly status: {
    stkPush: (input: StkStatusInput) => Promise<StkStatusResult>;
    transaction: (input: TransactionStatusInput) => Promise<StatusAck>;
  };

  /** Reverse a transaction back to the payer. */
  readonly reversal: {
    request: (input: ReversalInput) => Promise<ReversalAck>;
  };

  /** Dynamic QR code generation. */
  readonly qr: {
    generate: (input: QrGenerateInput) => Promise<QrGenerateResult>;
  };

  /** Pull Transaction API — backfill missed C2B payments (Daraja 3.0). */
  readonly pull: {
    registerUrl: (input: PullRegisterInput) => Promise<PullRegisterResult>;
    query: (input: PullQueryInput) => Promise<PullQueryResult>;
  };

  /** M-Pesa Ratiba — create a customer standing order (recurring collection). */
  readonly ratiba: {
    create: (input: RatibaCreateInput) => Promise<RatibaAck>;
  };

  /** B2B Express Checkout — USSD push to a merchant's till to pay a vendor paybill. */
  readonly express: {
    checkout: (input: ExpressCheckoutInput) => Promise<ExpressCheckoutAck>;
  };

  /** Query Organization Info — validate a shortcode's name + tariff (read-only). */
  readonly orgInfo: {
    query: (input: OrgInfoQueryInput) => Promise<OrgInfoResult>;
  };

  /** Lipa na Bonga — points→KES conversion (read) + redeem points as payment. */
  readonly bonga: {
    calculatePoints: (input: CalculatePointsInput) => Promise<CalculatePointsResult>;
    redeem: (input: RedeemInput) => Promise<RedeemAck>;
  };

  /** Bill Manager — invoicing + reconciliation (rescode "200", `app_key` header). */
  readonly billManager: {
    optIn: (input: BillManagerOptInInput) => Promise<BillManagerOptInResult>;
    updateOptIn: (input: BillManagerOptInInput) => Promise<BillManagerResult>;
    sendInvoice: (input: SendInvoiceInput) => Promise<BillManagerResult>;
    sendBulkInvoices: (input: SendBulkInvoicesInput) => Promise<BillManagerResult>;
    cancelInvoice: (input: CancelInvoiceInput) => Promise<BillManagerResult>;
    cancelBulkInvoices: (input: CancelBulkInvoicesInput) => Promise<BillManagerResult>;
    acknowledgePayment: (input: AcknowledgePaymentInput) => Promise<BillManagerResult>;
  };

  constructor(config: DarajaConfig) {
    validateConfig(config);
    this.config = config;

    const baseUrl = BASE_URLS[config.environment];
    const tokens = new TokenManager({
      fetchToken: () => fetchOAuthToken(baseUrl, config),
      store: config.tokenStore,
      cacheKey: `daraja-token:${config.environment}:${config.consumerKey}`,
    });
    this.http = new HttpClient({
      baseUrl,
      getToken: () => tokens.getToken(),
      fetchImpl: config.fetchImpl,
      maxRetries: config.maxNetworkRetries,
    });

    this.collect = {
      stkPush: (input) => stkPush(this.http, this.config, input),
    };
    this.c2b = {
      registerUrls: (input) => registerUrls(this.http, this.config, input),
    };
    this.b2c = {
      send: (input) => b2cSend(this.http, this.config, input),
      toPochi: (input) => b2cToPochi(this.http, this.config, input),
    };
    this.balance = {
      query: (input) => balanceQuery(this.http, this.config, input),
    };
    this.b2b = {
      pay: (input) => b2bPay(this.http, this.config, input),
      transferFloat: (input) => b2bTransferFloat(this.http, this.config, input),
      topUp: (input) => b2bTopUp(this.http, this.config, input),
      remitTax: (input) => b2bRemitTax(this.http, this.config, input),
    };
    this.status = {
      stkPush: (input) => statusStkPush(this.http, this.config, input),
      transaction: (input) => statusTransaction(this.http, this.config, input),
    };
    this.reversal = {
      request: (input) => reversalRequest(this.http, this.config, input),
    };
    this.qr = {
      generate: (input) => qrGenerate(this.http, this.config, input),
    };
    this.pull = {
      registerUrl: (input) => pullRegisterUrl(this.http, this.config, input),
      query: (input) => pullQuery(this.http, this.config, input),
    };
    this.ratiba = {
      create: (input) => ratibaCreate(this.http, this.config, input),
    };
    this.express = {
      checkout: (input) => expressCheckout(this.http, input),
    };
    this.orgInfo = {
      query: (input) => orgInfoQuery(this.http, input),
    };
    this.bonga = {
      calculatePoints: (input) => bongaCalculatePoints(this.http, input),
      redeem: (input) => bongaRedeem(this.http, this.config, input),
    };
    this.billManager = {
      optIn: (input) => bmOptIn(this.http, this.config, input),
      updateOptIn: (input) => bmUpdateOptIn(this.http, this.config, input),
      sendInvoice: (input) => bmSendInvoice(this.http, this.config, input),
      sendBulkInvoices: (input) => bmSendBulkInvoices(this.http, this.config, input),
      cancelInvoice: (input) => bmCancelInvoice(this.http, this.config, input),
      cancelBulkInvoices: (input) => bmCancelBulkInvoices(this.http, this.config, input),
      acknowledgePayment: (input) => bmAcknowledgePayment(this.http, this.config, input),
    };
  }
}

function validateConfig(config: DarajaConfig): void {
  for (const key of REQUIRED_KEYS) {
    const value = config[key];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new DarajaValidationError(`config.${key} is required`);
    }
  }
  if (config.environment !== 'sandbox' && config.environment !== 'production') {
    throw new DarajaValidationError("config.environment must be 'sandbox' or 'production'");
  }
}

/** UTF-8 → base64, portable across Node 20+ and edge runtimes. */
function toBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function fetchOAuthToken(baseUrl: string, config: DarajaConfig): Promise<TokenResponse> {
  const fetchFn = config.fetchImpl ?? globalThis.fetch;
  const credentials = toBase64(`${config.consumerKey}:${config.consumerSecret}`);
  const res = await fetchFn(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    method: 'GET',
    headers: {
      authorization: `Basic ${credentials}`,
      accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new DarajaAuthError(`OAuth token request failed (HTTP ${res.status})`);
  }
  return (await res.json()) as TokenResponse;
}
