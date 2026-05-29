# daraja-js

> Type-safe Node.js / TypeScript SDK for Safaricom Daraja (M-Pesa). It encodes the production gotchas that silently break real PayBills — so you don't rediscover them in your own outage.

[![npm](https://img.shields.io/npm/v/@kepas/daraja-js.svg)](https://www.npmjs.com/package/@kepas/daraja-js)
[![CI](https://github.com/nellylemmy/daraja-js/actions/workflows/ci.yml/badge.svg)](https://github.com/nellylemmy/daraja-js/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![Types](https://img.shields.io/badge/types-included-blue.svg)](#typescript)

> [!WARNING]
> **Alpha — pre-1.0.** The API surface is still settling. Do not run against production credentials on a shared host until v1.0. See the [roadmap](./ROADMAP.md).

> **Not affiliated with or endorsed by Safaricom PLC.** "Daraja" is the public name of Safaricom's M-Pesa Open API; this is an independent, community toolkit. See [TRADEMARK.md](./TRADEMARK.md).

---

## Why this exists

The Daraja API works. The problem is the dozen undocumented behaviors that pass in sandbox and fail in production — phone numbers that must be JSON numbers, balances pipe-delimited into a single string, callbacks that never retry. Every team that ships on M-Pesa rediscovers these the hard way, usually mid-incident.

`daraja-js` is the distillation of a production PayBill (Safaricom shortcode `4052037`) into a typed SDK. Each gotcha below is a class of bug we hit in production and now prevent at the type level or in the request layer.

## Install

```bash
npm install @kepas/daraja-js
# or
pnpm add @kepas/daraja-js
```

Node 20+. Ships ESM + CJS + types. Works in Node, Bun, and Cloudflare Workers (WebCrypto-backed webhook verification).

## Quickstart

### ESM

```ts
import { Daraja, DarajaInsufficientFundsError } from '@kepas/daraja-js';

const daraja = new Daraja({
  consumerKey: process.env.MPESA_CONSUMER_KEY!,
  consumerSecret: process.env.MPESA_CONSUMER_SECRET!,
  shortcode: '600999',                // your own shortcode (600999 = Safaricom sandbox)
  passkey: process.env.MPESA_PASSKEY!,
  environment: 'sandbox',             // 'sandbox' | 'production'
  maxNetworkRetries: 2,
});

const res = await daraja.collect.stkPush({
  phone: '0712345678',                // any of 5 formats — normalized internally
  amount: 100,
  accountReference: 'INV-001',
  description: 'Subscription payment',
  callbackUrl: 'https://pay.example.com/webhooks/mpesa/stk',
});

console.log(res.checkoutRequestId);
```

### CJS

```js
const { Daraja } = require('@kepas/daraja-js');
```

### Sharing the OAuth token across workers (Redis)

By default the token is cached per-process. To share one token across many
workers, pass a `tokenStore` — two functions over any backend (the SDK has no
Redis dependency):

```ts
import Redis from 'ioredis';
const redis = new Redis();

const daraja = new Daraja({
  /* …creds… */
  tokenStore: {
    get: (key) => redis.get(key),
    set: (key, value, ttlSeconds) => redis.set(key, value, 'EX', ttlSeconds).then(() => undefined),
  },
});
```

The in-memory fast path still applies — Redis is only read when the local token
is cold. Keys are namespaced per environment + consumer key.

### Receiving the STK result (Daraja callback)

Safaricom POSTs the async result to your `callbackUrl`. Daraja does **not** sign
it, so pair this with an IP allowlist for Safaricom's ranges.

```ts
import { parseStkCallback } from '@kepas/daraja-js';

app.post('/webhooks/mpesa/stk', express.json(), (req, res) => {
  const result = parseStkCallback(req.body);
  if (result.success) {
    // result.mpesaReceiptNumber, result.amount, result.phoneNumber
  }
  res.status(200).end(); // ALWAYS 200 to Safaricom
});
```

### C2B — direct PayBill/Till payments

Register your callback URLs once, then handle the validation + confirmation
callbacks. The confirmation is **terminal** — money is already settled and
Safaricom won't retry it, so always reply 200.

```ts
import { parseC2bConfirmation, c2bAccept, c2bReject } from '@kepas/daraja-js';

// one-time setup
await daraja.c2b.registerUrls({
  confirmationUrl: 'https://example.com/c2b/confirm',
  validationUrl: 'https://example.com/c2b/validate',
});

// validation (optional): accept or reject before the payment completes
app.post('/c2b/validate', express.json(), (req, res) => res.json(c2bAccept()));

// confirmation: money is in — record it, always 200
app.post('/c2b/confirm', express.json(), (req, res) => {
  const p = parseC2bConfirmation(req.body); // p.transId, p.amount, p.msisdn, p.billRefNumber
  res.status(200).end();
});
```

### B2C — pay out to a customer phone

Money out. Needs initiator auth — set `initiator` + `securityCredential` on the
client. B2C draws from your **Utility** account (gotcha #7), so fund it first.

```ts
import { Daraja, generateSecurityCredential, parseB2cResult } from '@kepas/daraja-js';

const daraja = new Daraja({
  consumerKey, consumerSecret, shortcode: '600999', passkey, environment: 'sandbox',
  initiator: 'apitest',
  // one-time: RSA-encrypt your initiator password with Safaricom's cert
  securityCredential: generateSecurityCredential({ password, certPath: './certs/sandbox.cer' }),
});

const ack = await daraja.b2c.send({
  phone: '0712345678',
  amount: 500,
  resultUrl: 'https://example.com/b2c/result',
  queueTimeoutUrl: 'https://example.com/b2c/timeout',
  remarks: 'Refund',
});

// async result lands at resultUrl:
app.post('/b2c/result', express.json(), (req, res) => {
  const r = parseB2cResult(req.body); // r.success, r.mpesaReceipt, r.amount, r.recipientName
  res.status(200).end();
});
```

### Re-emitting signed webhooks (Stripe-compatible)

For platforms built on daraja-js that forward events to their own consumers —
sign on send, verify on receive. Works on Node and edge runtimes.

```ts
import { webhooks } from '@kepas/daraja-js';

app.post('/webhooks/mpesa/stk',
  express.raw({ type: 'application/json' }),   // RAW bytes — not parsed JSON
  async (req, res) => {
    const event = await webhooks.constructEventAsync({
      payload: req.body,
      signature: req.headers['x-daraja-signature'] as string,
      secret: process.env.MPESA_WEBHOOK_SECRET!,
    });
    // ... handle event ...
    res.status(200).end();                      // ALWAYS 200 to Safaricom
  }
);
```

## The gotchas it defeats

These are real production failures, encoded so you never meet them:

| # | Gotcha | How the SDK handles it |
|---|--------|------------------------|
| 1 | STK `PartyA`/`PhoneNumber` must be JSON **numbers** — strings silently time out (ResultCode 1037) | Cast after normalization, enforced by the request type |
| 2 | Phone numbers arrive in many formats — `07XX` **and** the newer `01XX`, plus `+254…`, `254…`, bare 9-digit, and a hashed (SHA-256 hex) MSISDN | `normalizePhone()`, tested across all ranges |
| 3 | Timestamp is `YYYYMMDDHHMMSS` UTC, zero-padded | Generated internally |
| 4 | STK password = `base64(shortcode + passkey + timestamp)`, order matters | Derived for you |
| 5 | B2B callback URL is **shared** between float transfers and B2B payments | Typed callback parsers + optional router helper |
| 6 | Balance is pipe-delimited, accounts `&`-joined | `parseBalance()` returns a typed struct |
| 7 | B2C draws from the **Utility** account, not Working | Config-time warning when float is untopped |
| 8 | C2B confirmation is **terminal** — no second callback | Parser sets `terminal: true` |
| 9 | Safaricom does **not** retry C2B callbacks | Pull Transaction recovery cookbook |
| 10 | Pull Transaction 3.0: no `/mpesa/` prefix, `NominatedNumber` is MSISDN not shortcode, `OffSetValue` is a number | Correct paths + typed params |
| 11 | Always return 200 to callbacks, even on bad payloads | Helper returns 200 + persists for replay |
| 12 | OAuth token TTL 3599s | Cached per-environment, race-safe |
| 13 | Prod vs sandbox base URLs | Single `environment` flag |
| 14 | Bank withdrawal is **not** API-automatable | Documented; no misleading stub |

Two more the SDK exposes as helpers: amounts ≤100 KES on B2B PayBill are free-tier (no assumed fee), and reversal-failure-by-recipient-spend (`isSettledByRecipientSpend()`) since Safaricom signals it only via free-text `resultDesc`.

## What's covered

**Available now (v0.x):**

- `collect.stkPush` — STK Push, with the gotcha-defeating validation layer.
- `parseStkCallback` — parse the async STK result Safaricom posts back.
- `c2b.registerUrls` + `parseC2bConfirmation` / `parseC2bValidation` + `c2bAccept` / `c2bReject` — capture direct PayBill/Till payments (confirmation is terminal — gotcha #8).
- `b2c.send` + `parseB2cResult` — disburse to a customer phone (money out; Utility account — gotcha #7).
- `b2b.pay` + `b2b.transferFloat` + `parseB2bResult` — pay another business, and move float Working↔Utility (funds B2C).
- `status.stkPush` (sync) + `status.transaction` (async) + `parseStatusResult` — query a transaction's outcome.
- `reversal.request` + `parseReversalResult` + `isSettledByRecipientSpend` — reverse a transaction; classify the "recipient already spent it" case (gotcha #16).
- `qr.generate` — dynamic QR codes (Pay Bill / Buy Goods / Send Money / etc.).
- `pull.registerUrl` + `pull.query` — Pull Transaction API (Daraja 3.0) to backfill C2B payments missed when a callback failed (gotcha #10).
- `generateSecurityCredential` — RSA-encrypt the initiator password for the initiator-authed APIs.
- `balance.query` + `parseBalanceResult` / `parseAccountBalance` — query account balances, with the pipe-delimited parser (gotcha #6).
- `webhooks.sign` / `constructEvent` / `constructEventAsync` — Stripe-compatible signing + verification (sync + edge).
- The phone / amount / timestamp / password primitives (`normalizePhone`, `phoneToNumber`, `makeTimestamp`, `generatePassword`, `validateAmount`).
- The `DarajaError` hierarchy + `errorFromResult` (ResultCode classification).
- OAuth token management (race-safe, 3599s TTL) and the HTTP transport.
- Pluggable cross-process token cache (`tokenStore`) — share one OAuth token across workers (e.g. Redis), no SDK Redis dependency.

This now covers **every Daraja endpoint** a production PayBill uses — collection, disbursement, account management, reconciliation, and QR.

**On the [roadmap](./ROADMAP.md) (post-1.0):** Tax Remittance, B2C Topup, B2B Express Checkout, Ratiba (standing orders).

Full surface in the [API reference](./docs) (published with each release).

## TypeScript

Types are bundled — no `@types/daraja-js` needed. Inputs and Daraja callbacks are fully typed; the error hierarchy (`DarajaError` → `DarajaAuthError`, `DarajaInsufficientFundsError`, …) lets you branch on recoverable vs fatal.

## Security

Webhook signatures use the Stripe-compatible scheme (`t=…,v1=…`, HMAC-SHA256 over raw body, constant-time compare, replay window). Report vulnerabilities per [SECURITY.md](./SECURITY.md) — **not** via public issues. We ship neither Safaricom certificate (they own those); `generateSecurityCredential()` works against your own.

## Telemetry

Off by default. The SDK makes no network calls except to Safaricom.

## Support this project 💛

`daraja-js` is free and Apache 2.0. If it saved you an outage, you can fund its
maintenance via M-Pesa — the same rail this SDK is built on:

> **Pay Bill → Business no. `4052037` → Account no. `daraja` → amount → PIN.**

Donations are voluntary and buy no support guarantees or roadmap influence.
International card rails and full details in [DONATING.md](./DONATING.md).

## Community

- [Discussions](https://github.com/nellylemmy/daraja-js/discussions) — questions, ideas, RFCs
- [Issues](https://github.com/nellylemmy/daraja-js/issues) — bugs + features
- [CONTRIBUTING.md](./CONTRIBUTING.md) — DCO sign-off required (`git commit -s`)

## License

[Apache License 2.0](./LICENSE). Patent grant included.
