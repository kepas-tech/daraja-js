---
"daraja-js": minor
---

Add the `Daraja` client and `collect.stkPush` — the first end-to-end call.

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
