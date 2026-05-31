# M-Pesa Ratiba (Standing Order) — official Daraja spec (proof)

> Source: Safaricom Daraja portal, pasted verbatim by the operator 2026-05-30.
> Proof-grade reference behind daraja-js `ratiba.create`.
> Creates an M-Pesa standing order on the customer's profile for recurring collection.
> Commercial API — requires Go-Live email + contract before prod access.

Endpoint: `POST /standingorder/v1/createStandingOrderExternal` (prod base `https://api.safaricom.co.ke`).
**Resolves the plan's path ambiguity: it is `/standingorder/v1/...`, NOT `/mpesa/ratiba/v1/setup`.**
Own path family, no `/mpesa/` prefix (mirror pull.ts escape hatch).

## ⚠️ Conventions — two new shapes
- **OAuth-only** (Bearer). No initiator.
- **Sync ack is NESTED**: `ResponseHeader.responseCode` + `ResponseBody.responseCode`, success = `"200"`
  (HTTP-style string, NOT `ResponseCode "0"`).
- **Async callback is NESTED** with a `responseData[]` key-value array using **`Name`/`Value`**
  (NOT `Key`/`Value` like b2b). Dedicated parser; `toArray` for the array but a different field-name reader.

## Auth
Daraja OAuth Bearer only. Triggers an STK/NI PIN push to the customer to consent + opt-in, then creates the order.

## Request body (exact wire casing — PascalCase)
```
{
  "StandingOrderName": "Test Standing Order",
  "StartDate": "20240905",
  "EndDate": "20250905",
  "BusinessShortCode": "174379",
  "TransactionType": "Standing Order Customer Pay Bill",
  "ReceiverPartyIdentifierType": "4",
  "Amount": "4500",
  "PartyA": "254708374149",
  "CallBackURL": "https://mydomain.com/path",
  "AccountReference": "Test",
  "TransactionDesc": "Test",
  "Frequency": "2"
}
```
- `StandingOrderName` — **must be unique per customer** (dup → error `1050`).
- `StartDate`, `EndDate` — `yyyymmdd`. (Doc body sample has EndDate < StartDate — a doc typo; param table shows the correct future date. SDK should not silently enforce ordering unless requested.)
- `BusinessShortCode` — string, paybill/till to be paid.
- `TransactionType` — enum of exactly two strings:
  - `"Standing Order Customer Pay Bill"` (paybill)
  - `"Standing Order Customer Pay Marchant"` (buy goods) — **note Safaricom's misspelling "Marchant"; encode exactly.**
- `ReceiverPartyIdentifierType` — `"4"` paybill, `"2"` till.
- `Amount` — whole numbers only (string).
- `PartyA` — customer's M-Pesa phone `2547XXXXXXXX` (money sender). (Doc's "Parameters" prose also lists
  `PartyB`/`PhoneNumber`, but the actual body uses only `PartyA` — trust the body.)
- `CallBackURL` — required.
- `AccountReference` — alphanumeric, **max 12 chars**.
- `TransactionDesc` — string, **max 13 chars**.
- `Frequency` — string enum (1–8):
  `1` One Off · `2` Daily · `3` Weekly · `4` Monthly · `5` Bi-Monthly · `6` Quarterly · `7` Half Year · `8` Yearly.
  (Supersedes the older CLAUDE.md note that listed only daily/weekly/monthly/quarterly/annually — use these 8.)

## Sync ack (nested)
```
{ "ResponseHeader": { "responseRefID":"4dd9...", "responseCode":"200",
    "responseDescription":"Request accepted for processing",
    "ResultDesc":"The service request is processed successfully." },
  "ResponseBody": { "responseDescription":"Request accepted for processing", "responseCode":"200" } }
```
**Success = `ResponseHeader.responseCode === "200"`** (`401` unauthorized, `500` system failure).
Gate in-resource; new `DarajaScope` `ratiba`.

## Async callback (nested, `Name`/`Value` params — dedicated parser)
Success:
```
{ "responseHeader": { "responseRefID":"...", "requestRefID":"...", "responseCode":"0",
    "responseDescription":"The service request is processed successfully" },
  "responseBody": { "responseData": [
    {"name":"TransactionID","value":"SC8F2IQMH5"},
    {"name":"responseCode","value":"0"},
    {"name":"Status","value":"OKAY"},
    {"name":"Msisdn","value":"254******867"} ] } }
```
Failure: header `responseCode:"1037"`/`"Error"`; responseData carries `responseCode`/`Status:"ERROR"`.
Parser `parseRatibaCallback(body)`: read `responseHeader.responseCode`; flatten `responseBody.responseData`
by **`name`/`value`** into a map; expose `transactionId`, `status`, inner `responseCode`, `msisdn`.
`success = header responseCode === '0'`. **Casing is inconsistent in the docs** (`ResponseHeader`
in the spec table vs `responseHeader` in the JSON sample; `Name/Value` table vs `name/value` JSON) —
read case-insensitively / accept both when parsing.

## Error / result codes (Safaricom-docs proof → catalog scope `ratiba`)
STK-push family + standing-order specific:
- `0` success
- `1025` push send error (partner system) — retry
- `1032` request cancelled by user (STK timeout / user cancel)
- `1037` DS timeout, user unreachable / no timely response
- `2001` initiator info invalid (wrong PIN)
- `1001` unable to lock subscriber (existing USSD session) — one push at a time
- `1050` customer already has a standing order with the same name
- `1051` bad request (invalid field in payload)

## Implementation note
New namespace `ratiba`, new file `src/resources/ratiba.ts`, new scope `ratiba`, dedicated nested
`parseRatibaCallback` (name/value flattener). Own minor. No reuse of b2b parser/ack.
