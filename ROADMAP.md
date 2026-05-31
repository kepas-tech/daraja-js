# Roadmap

We shipped a stable 1.0, then drove to **100% Safaricom money-API coverage** in 1.3.0.
Roadmap discipline over feature sprawl. The per-release detail lives in
[CHANGELOG.md](./CHANGELOG.md); this file is the high-level state.

## Shipped

**Core (v0.x → 1.0):**
- Client: config validation, OAuth token cache (3599s TTL, race-safe), fetch-based HTTP with timeout, payment-safe retry (5xx only, never on money-moving POSTs).
- `collect.stkPush` + `parseStkCallback` — phone normalization + JSON-number casting.
- `c2b.registerUrls` + confirmation/validation parsing + `c2bAccept` / `c2bReject`.
- `b2c.send`, `b2b.pay` + `transferFloat`, `balance.query` (pipe-delimited parser), `status.stkPush` / `status.transaction`, `reversal.request` + `isSettledByRecipientSpend()`.
- `pull.registerUrl` / `pull.query` (Daraja 3.0 backfill).
- `generateSecurityCredential()` (RSA-PKCS1-v1.5).
- Webhook signing + verification (`constructEvent` + async variant for Workers).
- Phone / amount / timestamp / password primitives, property-tested.
- Pluggable cross-process token cache (`tokenStore`) — **shipped v0.8.0**.
- `qr.generate` (dynamic QR) — **shipped v0.7.0**.

**Error intelligence (1.1.0):**
- Proven result-code catalog (`CATALOG`, `lookup`, `classify`, `applyClassification`); `errorFromResult` / `errorFromResponse`.

**Hardening (1.2.0):**
- Single-param callback parser fix; no-retry on non-idempotent payment POSTs; CJS types; webhook timestamp guard; dropped the unused runtime dependency.

**100% money coverage (1.3.0):**
- `billManager.*` (invoicing + reconciliation), `b2b.topUp` (B2C Account Top Up), `b2b.remitTax` (Tax Remittance to KRA), `b2c.toPochi` (Business To Pochi), `express.checkout` (B2B Express Checkout), `ratiba.create` (M-Pesa Ratiba), `orgInfo.query` (Query Org Info), `bonga.calculatePoints` / `bonga.redeem` (Lipa na Bonga).

With 1.3.0 the SDK covers **every Safaricom money API**.

## Forward

No new money APIs are planned — the money surface is complete. Future work is
maintenance and quality, not feature sprawl:
- Keep the result-code catalog growing as new codes are proven from real responses.
- Track Safaricom's published API changes; absorb breaking changes behind SemVer.
- Documentation site polish (TypeDoc) and more runnable examples.

## Not on the roadmap

- A `bankWithdraw()` method — bank withdrawal is **not** API-automatable (G2 portal / USSD only). We will not ship a misleading stub.
- The sandbox-only C2B **simulate** endpoint, and the non-money **telco** APIs (SIM swap, IMSI, IoT SIM) — deliberately out of scope.
- Shipping Safaricom certificates or credentials — they own those.
- A heavy client framework. The SDK stays small and edge-compatible.
