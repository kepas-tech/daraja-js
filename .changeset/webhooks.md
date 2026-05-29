---
"daraja-js": minor
---

Add webhook handling — STK Push is now fully receivable.

- `parseStkCallback` — parse the async STK result Safaricom posts to your
  callback URL into a typed `StkCallbackResult` (success flag + receipt, amount,
  phone, date from `CallbackMetadata`). Accepts a parsed object or raw JSON.
- `webhooks.sign` / `constructEvent` / `constructEventAsync` — Stripe-compatible
  HMAC-SHA256 signing and verification (`t=…,v1=…` over `timestamp.payload`,
  constant-time compare, replay window). Sync uses `node:crypto`; the async
  variant uses WebCrypto for edge runtimes. For platforms re-emitting events.
- New `DarajaSignatureError`.
