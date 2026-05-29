/**
 * Webhook signing and verification, Stripe-compatible.
 *
 * Daraja does NOT sign its own callbacks — this is for platforms built on
 * daraja-js that re-emit events to their own consumers (the pattern kepas-pay
 * uses). Signature header: `t=<unix-seconds>,v1=<hex hmac-sha256>`. The signed
 * payload is `${timestamp}.${rawBody}` over the RAW body bytes. Verification is
 * constant-time and rejects signatures outside a replay window.
 *
 * `constructEvent` (sync) uses `node:crypto`; `constructEventAsync` uses
 * WebCrypto so it runs on Cloudflare Workers and other edge runtimes.
 */

import { createHmac } from 'node:crypto';
import { DarajaSignatureError } from './errors.js';

export interface SignParams {
  /** Raw body string to sign. */
  payload: string;
  /** Per-consumer signing secret. */
  secret: string;
  /** Override the timestamp (unix seconds). Defaults to now. */
  timestamp?: number;
  /** Clock in ms, injectable for tests. */
  now?: () => number;
}

export interface VerifyParams {
  /** Raw body string exactly as received. */
  payload: string;
  /** The `t=…,v1=…` signature header. */
  signature: string;
  secret: string;
  /** Replay window in seconds. Default 300. Set 0 to disable. */
  toleranceSec?: number;
  /** Clock in ms, injectable for tests. */
  now?: () => number;
}

const DEFAULT_TOLERANCE_SEC = 300;

function signedContent(timestampSec: number, payload: string): string {
  return `${timestampSec}.${payload}`;
}

function hmacHexSync(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

async function hmacHexAsync(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const buf = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time hex comparison. Both inputs are fixed-length hex digests. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function parseSignatureHeader(header: string): { timestamp: number; v1: string } {
  const fields: Record<string, string> = {};
  for (const part of header.split(',')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      fields[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
    }
  }
  const timestamp = Number(fields.t);
  const v1 = fields.v1;
  if (!Number.isFinite(timestamp) || !v1) {
    throw new DarajaSignatureError('malformed signature header');
  }
  return { timestamp, v1 };
}

function checkTolerance(timestampSec: number, toleranceSec: number, now: () => number): void {
  if (toleranceSec <= 0) {
    return;
  }
  const nowSec = Math.floor(now() / 1000);
  if (Math.abs(nowSec - timestampSec) > toleranceSec) {
    throw new DarajaSignatureError('timestamp outside the replay tolerance window');
  }
}

function sign({ payload, secret, timestamp, now = Date.now }: SignParams): string {
  const timestampSec = timestamp ?? Math.floor(now() / 1000);
  const hex = hmacHexSync(secret, signedContent(timestampSec, payload));
  return `t=${timestampSec},v1=${hex}`;
}

function constructEvent<T = unknown>({
  payload,
  signature,
  secret,
  toleranceSec = DEFAULT_TOLERANCE_SEC,
  now = Date.now,
}: VerifyParams): T {
  const { timestamp, v1 } = parseSignatureHeader(signature);
  checkTolerance(timestamp, toleranceSec, now);
  const expected = hmacHexSync(secret, signedContent(timestamp, payload));
  if (!constantTimeEqual(v1, expected)) {
    throw new DarajaSignatureError('signature mismatch');
  }
  return JSON.parse(payload) as T;
}

async function constructEventAsync<T = unknown>({
  payload,
  signature,
  secret,
  toleranceSec = DEFAULT_TOLERANCE_SEC,
  now = Date.now,
}: VerifyParams): Promise<T> {
  const { timestamp, v1 } = parseSignatureHeader(signature);
  checkTolerance(timestamp, toleranceSec, now);
  const expected = await hmacHexAsync(secret, signedContent(timestamp, payload));
  if (!constantTimeEqual(v1, expected)) {
    throw new DarajaSignatureError('signature mismatch');
  }
  return JSON.parse(payload) as T;
}

export const webhooks = { sign, constructEvent, constructEventAsync };
