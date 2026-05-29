/**
 * Dynamic QR — generate a scannable M-Pesa QR for a payment.
 *
 * Synchronous (bearer auth, no callback). Success is `ResponseCode === '00'`
 * (two zeros — not '0'). `TrxCode`: BG (Buy Goods), WA (Withdraw at agent),
 * PB (Pay Bill), SM (Send Money), SB (Send to Business).
 */

import type { DarajaConfig } from '../client.js';
import { errorFromResponse } from '../errors.js';
import type { HttpClient } from '../http.js';

type QrConfig = Pick<DarajaConfig, 'shortcode'>;

export type QrTrxCode = 'BG' | 'WA' | 'PB' | 'SM' | 'SB';

export interface QrGenerateInput {
  /** Your invoice/order reference (RefNo). */
  accountReference: string;
  /** Amount in KES. Default 0 (customer enters). */
  amount?: number;
  /** Transaction type. Default `PB` (Pay Bill). */
  trxCode?: QrTrxCode;
  /** QR pixel size. Default 300. */
  size?: number;
  /** Display name. Default the shortcode. */
  merchantName?: string;
}

export interface QrGenerateResult {
  responseCode: string;
  responseDescription: string;
  /** Base64 QR payload. */
  qrCode: string;
}

interface QrRaw {
  ResponseCode?: string;
  ResponseDescription?: string;
  QRCode?: string;
}

const ENDPOINT = '/mpesa/qrcode/v1/generate';

export async function generate(
  http: HttpClient,
  config: QrConfig,
  input: QrGenerateInput,
): Promise<QrGenerateResult> {
  const raw = await http.post<QrRaw>(ENDPOINT, {
    MerchantName: input.merchantName ?? String(config.shortcode),
    RefNo: input.accountReference,
    Amount: input.amount ?? 0,
    TrxCode: input.trxCode ?? 'PB',
    CPI: String(config.shortcode),
    Size: String(input.size ?? 300),
  });
  if (raw.ResponseCode !== '00') {
    throw errorFromResponse({
      scope: 'qr',
      responseCode: raw.ResponseCode,
      errorMessage: raw.ResponseDescription,
      raw,
    });
  }
  return {
    responseCode: raw.ResponseCode,
    responseDescription: raw.ResponseDescription ?? '',
    qrCode: raw.QRCode ?? '',
  };
}
