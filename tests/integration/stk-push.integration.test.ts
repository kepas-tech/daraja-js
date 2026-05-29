/**
 * Live STK Push integration test — hits the real Safaricom API.
 *
 * Skipped unless sandbox credentials are present, so CI (which has none) never
 * runs it. Run it yourself against the sandbox (free, no real money):
 *
 *   DARAJA_TEST_CONSUMER_KEY=... \
 *   DARAJA_TEST_CONSUMER_SECRET=... \
 *   pnpm test:integration
 *
 * Defaults target the public Safaricom sandbox (shortcode 174379, the published
 * sandbox passkey, test MSISDN 254708374149). Override any via env. Do NOT point
 * this at production credentials — it initiates a real charge.
 */

import { describe, expect, it } from 'vitest';
import { Daraja } from '../../src/client.js';

const consumerKey = process.env.DARAJA_TEST_CONSUMER_KEY;
const consumerSecret = process.env.DARAJA_TEST_CONSUMER_SECRET;
const hasCreds = Boolean(consumerKey && consumerSecret);

// Safaricom's published sandbox Lipa-na-M-Pesa passkey + test shortcode/MSISDN.
const SANDBOX_PASSKEY = 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';

describe.skipIf(!hasCreds)('STK Push against live sandbox', () => {
  it('initiates an STK Push that Daraja accepts (ResponseCode 0)', async () => {
    const daraja = new Daraja({
      consumerKey: consumerKey as string,
      consumerSecret: consumerSecret as string,
      shortcode: process.env.DARAJA_TEST_SHORTCODE ?? '174379',
      passkey: process.env.DARAJA_TEST_PASSKEY ?? SANDBOX_PASSKEY,
      environment: 'sandbox',
    });

    const res = await daraja.collect.stkPush({
      phone: process.env.DARAJA_TEST_PHONE ?? '254708374149',
      amount: 1,
      accountReference: 'ITEST',
      description: 'integration',
      callbackUrl: 'https://example.com/daraja-integration',
    });

    expect(res.responseCode).toBe('0');
    expect(res.checkoutRequestId).toBeTruthy();
    expect(res.merchantRequestId).toBeTruthy();
  }, 30_000);
});
