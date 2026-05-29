# Changelog

## 1.1.0

### Minor Changes

- Add a proven Daraja result-code catalog and meaningful, actionable error messages.

  Every code's meaning is grounded in evidence — real Safaricom responses observed
  in production (the meaning IS Safaricom's own ResultDesc text), this SDK's code,
  kepas-pay's production handlers, or official docs. Community blogs are not a
  source, and codes we cannot prove are passed through VERBATIM (never fabricated).

  - New `result-codes` module: `CATALOG`, `lookup`, `classify`, `applyClassification`
    (per-API scoped — the same numeric code can differ by endpoint).
  - Async parsers (`parseStkCallback`, `parseB2cResult`, `parseStatusResult`,
    `parseReversalResult`, `parseBalanceResult`, `parseB2bResult`) now carry optional
    additive `meaning` / `retriable` / `terminal` / `catalogued` fields. `resultCode`/
    `resultDesc`/`success`/`raw` are unchanged. `parseReversalResult` adds
    `settledByRecipientSpend`.
  - `errorFromResult` is catalog-backed (default scope `stk` for back-compat); new
    `errorFromResponse` enriches synchronous rejections. No new error classes.
  - New `docs/ERROR_CODES.md` (generated) lists every catalogued code, its meaning,
    retriable/terminal, mapped SDK error, and proof source.

  Fully backward-compatible: additive fields/exports only.

## 1.0.0

First stable release. The SDK covers **every Daraja endpoint** a production
PayBill uses — STK Push, C2B, B2C, B2B + float transfers, balance, transaction
status, reversal, dynamic QR, and Pull Transactions — plus the security-credential
helper, Stripe-compatible webhook signing/verification, a pluggable cross-process
token cache, and an auto-published API reference. 130 tests; passed an
independent pre-1.0 security review.

### Major Changes

- **Stable public API.** The `Daraja` client surface and exports are now under
  semver — breaking changes will bump the major version.

### Patch Changes

- Security hardening from the pre-1.0 review: `DarajaError.raw` is now
  non-enumerable with a raw-free `toJSON()`, so Daraja response payloads (which
  may contain customer PII) are not dumped into logs by `JSON.stringify` /
  `console.log` / error serializers. `err.raw` remains accessible for explicit
  debugging.

## 0.8.0

### Minor Changes

- Add a pluggable cross-process OAuth token cache (`tokenStore`).

  Pass `tokenStore` on the client config to share one token across workers (e.g.
  Redis) instead of one-per-process. It's a minimal two-method contract
  (`get`/`set`) over any backend — the SDK keeps zero Redis dependency. The
  in-memory fast path is preserved (the store is read only on a cold local token),
  and keys are namespaced per environment + consumer key (gotcha #12). This is the
  prerequisite for running kepas-pay 100% on the SDK at multi-worker scale.

## 0.7.0

### Minor Changes

- Add QR and Pull Transactions — completing 100% parity with kepas-pay's Daraja
  surface.

  - `daraja.qr.generate({ accountReference, amount?, trxCode?, size? })` — dynamic
    QR (success is ResponseCode "00"; TrxCode BG/WA/PB/SM/SB).
  - `daraja.pull.registerUrl({ nominatedNumber, callbackUrl })` and
    `daraja.pull.query({ startDate, endDate, offset? })` — Pull Transaction API
    (Daraja 3.0) to backfill C2B payments missed when a callback failed. Handles
    the gotcha-#10 quirks: no `/mpesa/` prefix, NominatedNumber as MSISDN,
    OffSetValue as a number.

## 0.6.0

### Minor Changes

- Add transaction status queries and reversal.

  - `daraja.status.stkPush({ checkoutRequestId })` — synchronous STK Push status
    query (returns the outcome inline; passkey auth).
  - `daraja.status.transaction({ transactionId, resultUrl, queueTimeoutUrl })` —
    async transaction status query (initiator-authed). `parseStatusResult` for the
    callback.
  - `daraja.reversal.request({ transactionId, amount, resultUrl, queueTimeoutUrl })`
    — reverse a transaction (initiator-authed). `parseReversalResult` for the
    callback.
  - `isSettledByRecipientSpend(resultDesc)` — conservative classifier for the
    "recipient already spent the funds" reversal failure (gotcha #16, no stable
    ResultCode).

## 0.5.0

### Minor Changes

- Add B2B — pay another business + float transfers.

  - `daraja.b2b.pay({ toShortcode, amount, commandId?, accountReference?, ... })`
    — pay another PayBill (`BusinessPayBill`) or Till (`BusinessBuyGoods`, receiver
    identifier 2). Numeric parties, initiator-authed.
  - `daraja.b2b.transferFloat({ amount, direction })` — move money Working(MMF)↔
    Utility on your own shortcode (`BusinessTransferFromMMFToUtility` /
    `...UtilityToMMF`). This is how you fund B2C (gotcha #7).
  - `parseB2bResult` — parse the async result callback.

  Sends Daraja's misspelled `RecieverIdentifierType` exactly as the API expects.

## 0.4.0

### Minor Changes

- Add Account Balance (read-only).

  - `daraja.balance.query({ resultUrl, queueTimeoutUrl, remarks? })` — POST
    /mpesa/accountbalance/v1/query with the AccountBalance command; returns the
    async ack. Requires initiator auth.
  - `parseBalanceResult` — parse the async result envelope.
  - `parseAccountBalance` — the standalone pipe-delimited parser (gotcha #6):
    `Account|Currency|Current|Available|Reserved|Uncleared`, accounts joined by `&`.

## 0.3.0

### Minor Changes

- Add B2C (money out) and the SecurityCredential helper that unlocks the
  initiator-authed APIs.

  - `generateSecurityCredential({ password, certPem | certPath })` — RSA-encrypt
    the initiator password (PKCS1 v1.5) + base64, exactly what B2C/B2B/balance/
    status/reversal expect. Node-only offline helper; ships no certificate.
  - `daraja.b2c.send({ phone, amount, resultUrl, queueTimeoutUrl, commandId?, remarks?, occasion? })`
    — POST /mpesa/b2c/v1/paymentrequest with numeric PartyA/PartyB; returns the
    async ack. Draws from the Utility account (gotcha #7). Requires `initiator` +
    `securityCredential` on the client config.
  - `parseB2cResult` — parse the async result callback (receipt, amount, recipient,
    Utility/Working balances).

## 0.2.0

### Minor Changes

- Add C2B support — capture payments customers make directly to your PayBill/Till.

  - `daraja.c2b.registerUrls({ confirmationUrl, validationUrl, responseType? })` —
    register validation + confirmation callback URLs (`/mpesa/c2b/v2/registerurl`).
  - `parseC2bConfirmation` — parse the confirmation callback into a typed payment
    with `amount` as a number and `terminal: true` (gotcha #8 — money is already
    settled, no second callback, and Safaricom does not retry it).
  - `parseC2bValidation` — parse the pre-payment validation callback.
  - `c2bAccept()` / `c2bReject(reason?, code?)` — the response bodies Safaricom
    expects to accept or reject a validation request.

## 0.1.1

### Patch Changes

- Fix `VERSION` reporting `0.0.0` — it's now injected from package.json at build
  time (was a stale literal). Add a gated live STK Push integration test
  (`pnpm test:integration`, sandbox-only, skipped without creds).

## 0.1.0

### Minor Changes

- c85be80: Add `TokenManager`: OAuth token cache with a 3599s TTL, configurable safety
  margin, single-flight refresh (concurrent callers share one request), and no
  caching of failed fetches.
- a739473: Add the foundation layer: validation primitives and the error hierarchy.

  - `normalizePhone` / `phoneToNumber` — accept all five Kenyan phone formats and a hashed MSISDN, cast to a JS number for STK Push (gotchas #1, #2).
  - `makeTimestamp` — `YYYYMMDDHHMMSS` UTC (gotcha #3).
  - `generatePassword` — `base64(shortcode + passkey + timestamp)` (gotcha #4).
  - `validateAmount` — whole-KES guard.
  - `DarajaError` hierarchy with `errorFromResult`, mapping ResultCodes 1 (insufficient funds), 1032 (cancelled), and 1037 (user unreachable) to typed errors.

- 5daf191: Add the `Daraja` client and `collect.stkPush` — the first end-to-end call.

  - `Daraja` validates config, resolves the sandbox/production base URL, and wires
    the race-safe token manager + HTTP transport.
  - `collect.stkPush` composes the primitives so `PartyA`/`PhoneNumber` ship as JSON
    numbers (gotcha #1), the timestamp is UTC, and the password is correctly
    derived. Returns a normalized `StkPushResult`; throws `DarajaAPIError` on a
    non-zero `ResponseCode`.
  - HTTP layer retries only on 5xx (never timeouts) to avoid double-charging a
    payment POST.
  - Validation primitives now throw `DarajaValidationError` so bad input surfaces
    uniformly before any network call.

- dede37e: Add webhook handling — STK Push is now fully receivable.

  - `parseStkCallback` — parse the async STK result Safaricom posts to your
    callback URL into a typed `StkCallbackResult` (success flag + receipt, amount,
    phone, date from `CallbackMetadata`). Accepts a parsed object or raw JSON.
  - `webhooks.sign` / `constructEvent` / `constructEventAsync` — Stripe-compatible
    HMAC-SHA256 signing and verification (`t=…,v1=…` over `timestamp.payload`,
    constant-time compare, replay window). Sync uses `node:crypto`; the async
    variant uses WebCrypto for edge runtimes. For platforms re-emitting events.
  - New `DarajaSignatureError`.

  First public release, published as `@kepas/daraja-js`: STK Push end-to-end
  (send, receive, verify) plus the validation/error/auth/HTTP core.
