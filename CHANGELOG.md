# Changelog

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
