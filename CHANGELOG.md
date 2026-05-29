# Changelog

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

All notable changes to this project are documented here. The format follows
[Keep a Changelog 1.1](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases are managed with [Changesets](https://github.com/changesets/changesets);
entries below v1.0.0 are generated from changeset files.

## [Unreleased]

### Added

- Initial repository scaffold: README, Apache 2.0 license, governance, security
  policy, CI/CD, and tooling.
