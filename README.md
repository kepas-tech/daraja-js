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
- `webhooks.sign` / `constructEvent` / `constructEventAsync` — Stripe-compatible signing + verification (sync + edge).
- The phone / amount / timestamp / password primitives (`normalizePhone`, `phoneToNumber`, `makeTimestamp`, `generatePassword`, `validateAmount`).
- The `DarajaError` hierarchy + `errorFromResult` (ResultCode classification).
- OAuth token management (race-safe, 3599s TTL) and the HTTP transport.

**On the [roadmap](./ROADMAP.md) (committed APIs, not yet shipped):**

`c2b.registerUrls` · `b2c.send` · `b2b.pay` / float transfers · `balance.query` · `transaction.status` · `reversal.request` + `isSettledByRecipientSpend()` · `pullTransactions.register` / `query` · `qr.generate` · `generateSecurityCredential()`.

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
