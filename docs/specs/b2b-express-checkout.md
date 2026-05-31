# B2B Express Checkout (USSD Push to Till) — official Daraja spec (proof)

> Source: Safaricom Daraja portal, pasted verbatim by the operator 2026-05-30.
> Proof-grade reference behind daraja-js `express.checkout`.
> Vendor (paybill) initiates a USSD push to a fellow merchant's till; the merchant
> enters Operator ID + M-Pesa PIN to pay the vendor's paybill from their till.

Endpoint: `POST /v1/ussdpush/get-msisdn` (prod base `https://api.safaricom.co.ke`).
**NOT `/b2bexpress/v1/initiate`** and **NOT under `/mpesa/`** — own path family.

## ⚠️ Structural outlier — does NOT follow b2b conventions
- **OAuth-only** (consumer key/secret → Bearer). No Initiator/SecurityCredential.
- **camelCase body** (not PascalCase).
- **Sync ack uses `code`/`status`** — NOT `ResponseCode`/`ResponseDescription`.
- **Async callback is FLAT** — top-level `resultCode`/`resultDesc`, NO `Result{}` envelope,
  NO `ResultParameters`, NO `ReferenceItem`. Needs a dedicated flat parser — do NOT reuse `parseB2bResult`.

## Auth
Daraja OAuth Bearer only (product added to the app at the Apigee layer). No initiator.

## Request body (exact wire casing — camelCase)
```
{
  "primaryShortCode": "000001",
  "receiverShortCode": "000002",
  "amount": "100",
  "paymentRef": "paymentRef",
  "callbackUrl": "http://..../result",
  "partnerName": "Vendor",
  "RequestRefID": "<random unique id per request>"
}
```
- `primaryShortCode` — debit party: the MERCHANT's till/shortcode (money sender).
- `receiverShortCode` — credit party: the VENDOR's paybill (receives money).
- `amount` — number-as-string.
- `paymentRef` — alphanumeric; shown in the merchant's prompt text.
- `callbackUrl` — vendor endpoint for the confirmation callback.
- `partnerName` — vendor's friendly name (as the merchant knows it).
- `RequestRefID` — caller-supplied unique id; tracks the request across components, echoed in the ack.
  **Casing note:** body shows `RequestRefID` (capital ID); the param table says `RequestRefId`.
  Body wins → wire is `RequestRefID`. SDK should generate this if the caller omits it.

## Sync ack (new convention)
```
{ "code": "0", "status": "USSD Initiated Successfully" }
```
**`code === "0"` = success** (USSD push initiated). Gate success in-resource on `code`; call
`errorFromResponse` only to build the message. New `DarajaScope` `b2b-express`.

## Async callback (FLAT — dedicated parser, two observed shapes)
Cancelled:
```
{ "resultCode":"4001", "resultDesc":"User cancelled transaction",
  "requestId":"c2a9ba32-...", "amount":"71.0", "paymentReference":"MAndbubry3hi" }
```
Successful:
```
{ "resultCode":"0", "resultDesc":"The service request is processed successfully.",
  "amount":"71.0", "requestId":"404e1aec-...", "resultType":"0",
  "conversationID":"AG_20230426_...", "transactionId":"RDQ01NFT1Q", "status":"SUCCESS" }
```
Parser `parseExpressCallback(body)`: read top-level fields directly; `success = resultCode === '0'`.
Fields: `resultCode`, `resultDesc`, `requestId`, `amount`, `paymentReference?`, `resultType?`,
`conversationId?` (`conversationID` in wire), `transactionId?`, `status?`.

> **DO NOT trust the doc's "Failed Result Parameter Definition" table** — it is boilerplate copied
> from a standard b2b API (it references `Result{}`, `ResultParameters`, `ReferenceItem`) and
> CONTRADICTS the actual flat callback JSON above. The flat JSON blocks are the real shapes.

## Error / result codes (Safaricom-docs proof → catalog scope `b2b-express`)
- `0` success
- `4001` User cancelled transaction
- `4104` Missing Nominated Number (operator's preferred MSISDN not set on the shortcode)
- `4102` Merchant KYC fail
- `4201` USSD Network error
- `4203` USSD Exception error

## Operational note (from Appendix)
The push only works for the operator whose phone is the **Nominated Number** under the
shortcode's Organization Details in the M-Pesa Web Portal. `4104` = that number is missing.

## Implementation note
New namespace `express`, new file `src/resources/b2b-express.ts`, new scope `b2b-express`,
dedicated flat `parseExpressCallback`. Own minor. Does not touch the b2b family.
