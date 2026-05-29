/**
 * The Daraja client — the SDK entry point. Validates config, wires the OAuth
 * token manager and HTTP transport, and exposes the resource namespaces.
 */

import { TokenManager, type TokenResponse } from './auth.js';
import { DarajaAuthError, DarajaValidationError } from './errors.js';
import { HttpClient } from './http.js';
import { type RegisterUrlsInput, type RegisterUrlsResult, registerUrls } from './resources/c2b.js';
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
  /** Retries on 5xx. Default 2. */
  maxNetworkRetries?: number;
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

  constructor(config: DarajaConfig) {
    validateConfig(config);
    this.config = config;

    const baseUrl = BASE_URLS[config.environment];
    const tokens = new TokenManager({
      fetchToken: () => fetchOAuthToken(baseUrl, config),
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
