# Roadmap

Target: **daraja-js v1.0 in 8 weeks** from kickoff. Roadmap discipline over feature sprawl — we ship a stable 1.0, not a buggy 2.0.

## Now (v0.x, alpha)

- Core client: config validation, OAuth token cache (3599s TTL, race-safe), fetch-based HTTP with retry + timeout + idempotency.
- `collect.stkPush` — the flagship, with phone normalization + JSON-number casting.
- Error hierarchy (`DarajaError` → typed subclasses).
- Webhook verification (`constructEvent` + async variant for Workers).
- Phone / amount / timestamp / password primitives, property-tested.

## Next (toward v1.0)

- `c2b.registerUrls`, `b2c.send`, `b2b.pay` + float transfers.
- `balance.query` with pipe-delimited parser.
- `transaction.status`, `reversal.request` + `isSettledByRecipientSpend()`.
- `pullTransactions.register` / `query` (async iterator over offset pagination).
- `generateSecurityCredential()` (RSA-PKCS1-v1.5).
- Full docs site (VitePress + TypeDoc), runnable examples, sandbox nightly CI.

## Later (post-1.0)

- `qr.generate` (dynamic QR).
- `taxRemittance` (KRA).
- B2C Topup, B2B Express Checkout, Ratiba (standing orders).
- Pluggable token cache (Redis adapter) and PII scrubber for logs.

## Not on the roadmap

- A `bankWithdraw()` method — bank withdrawal is **not** API-automatable (G2 portal / USSD only). We will not ship a misleading stub.
- Shipping Safaricom certificates or credentials — they own those.
- A heavy client framework. The SDK stays small and edge-compatible.
