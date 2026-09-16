# B2C Hakikisha — official Daraja spec (proof)

> Source: Safaricom Daraja portal, API page "B2C Hakikisha", read on 2026-09-16 while logged in.
> Proof-grade reference behind daraja-js `hakikisha.lookup`.
> Validation tool: look up a customer's (masked) registered name from a phone number BEFORE a
> B2C payout (reduces mistyped numbers, account-swap fraud and reversals). **SYNCHRONOUS**.

Endpoint: `POST /mpesa/b2c/hakikisha/v1/hakikisha`
(sandbox base `https://sandbox.safaricom.co.ke`; the portal lists no production URL — production
needs Safaricom approval and a signed contract, see Onboarding).

## Onboarding (portal text)
- "To be onboarded, partners will write to apisupport@safaricom.co.ke or contact their account
  managers … The partner will have to make contractual agreements after which they will be
  onboarded to the production environment."
- "This API requires approval from Safaricom." "The API is free but requires approval."
- Offered together with C2B Hakikisha under a reciprocal agreement.
- Sandbox product on the app: `B2C-Hakikisha-SandBox`.

## Conventions
- **OAuth Bearer only.** No initiator, no securityCredential.
- **SYNCHRONOUS** — the result is returned inline. No callback. → `http.post(..., { retryable: true })`
  (read-only lookup, idempotent).
- Safaricom numbers only ("Can the API handle international phone numbers? No").

## Request body
```
{
  "header": { "requestID": "8aeefeea-8713-4a4d-b1b4-7b8c143b7ec1", "timestamp": "1748933384" },
  "body": { "msisdn": "254722000000", "shortcode": "123456" }
}
```
- `requestID` — unique per request (the response echoes it).
- `timestamp` — seconds since the epoch, as a string (sample `1748933384`); the error sample
  shows `20250603074239` (yyyyMMddHHmmss), so Safaricom accepts either; we send epoch seconds.
- `msisdn` — `254XXXXXXXXX`.
- `shortcode` — the organisation's shortcode.

## Success response
```
{
  "header": { "requestID": "…", "timestamp": "1748933384", "status": "200", "message": "Success" },
  "body": { "firstName": "john", "middleName": "M******", "lastName": "M******" }
}
```
`firstName` is in the clear; `middleName` and `lastName` are masked (first letter plus stars).

## Error response
```
{
  "header": { "requestID": "…", "timestamp": "20250603074239", "status": "400", "message": "Error" },
  "body": { "message": "The customer does not exist." }
}
```
Documented codes: `400` Bad Request – Invalid phone number; `401.001` Invalid access token.
`header.status` is the code; `body.message` is the descriptive text.
