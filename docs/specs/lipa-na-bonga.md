# Lipa na Bonga — official Daraja spec (proof)

> Source: Safaricom Daraja portal, pasted verbatim by the operator 2026-05-30.
> Proof-grade reference behind daraja-js `bonga`.
> Lets Lipa-na-M-Pesa merchants accept payment in Bonga loyalty points
> (redeemable at Ksh 0.2 / point). Asynchronous redemption.

Base path: `/v1/lipa/na/bonga/{suffix}` (prod base `https://api.safaricom.co.ke`). No `/mpesa/` prefix.
**Two endpoints** → two methods on a `bonga` namespace.

## Conventions
- **OAuth Bearer only.** No initiator.
- **Nested `header`/`body` response envelope** — `header.responseCode` + `header.responseMessage`
  + `customerMessage` + `timestamp`; payload under `body` (may be `null`). NEW shape → dedicated reader.

## Endpoint 1 — Calculate Points (`POST /v1/lipa/na/bonga/calculate-points`)
Informational: convert points → KES at the current rate. **Synchronous** → `retryable: true`.
Request:
```
{ "points": "40" }
```
Response:
```
{ "header": { "requestRefId":"55b2b8bd-...", "responseCode":200, "responseMessage":"Success",
    "customerMessage":"Request executed successfully.", "timestamp":"2025-02-24T12:29:05.484864516" },
  "body": { "amount":"8", "points":"40", "rate":"0.2" } }
```
Returns `{ amount, points, rate }`. `rate` = Ksh 0.2 per Bonga point.

## Endpoint 2 — Redeem Points (`POST /v1/lipa/na/bonga/redeem-paybill`)
Redeems points as payment to the merchant paybill/till. **Asynchronous** (triggers an STK PIN push to
the customer) → money-mover, `retryable: false` (default).
Request:
```
{ "msisdn":"254720776155", "amount":50, "bongaPoints":20, "conversionRate":0.2,
  "shortCode":"888880", "accountNumber":"test" }
```
- `msisdn` — customer phone (254…).
- `amount` — KES equivalent (number).
- `bongaPoints` — points to deduct (number).
- `conversionRate` — `0.2`.
- `shortCode` — merchant paybill/till.
- `accountNumber` — account reference.

Sync ack:
```
{ "header": { "requestRefId":"a53a2939-...", "responseCode":200,
    "responseMessage":"Operation Successfully.",
    "customerMessage":"Dear customer, your request was processed successfully",
    "timestamp":"2026-03-10T09:54:28.456847481" },
  "body": null }
```

### ⚠️ Final result arrives on the EXISTING C2B callback — not a new Bonga callback
Per spec: "Once redemption completes, M-PESA immediately transfers funds to the merchant's PayBill/Till.
A callback result is then sent to the URLs registered for C2B transactions." → the settlement lands on
the **already-implemented C2B confirmation handler** (`resources/c2b.ts` / `parseC2bConfirmation`).
**No new redemption-result parser needed.** On Bonga-deduction-success-but-transfer-failure, M-Pesa
reverses the equivalent points and tells the customer to retry.

## ⚠️ Ambiguities (DO NOT guess — resolve at sandbox)
1. **Success code split.** Sync acks show `header.responseCode: 200` (integer) + `Success`/`Operation
   Successfully.`, but the **Result Codes table** lists `6000 Success / 6001 Fail / …` (below). The 200
   is the immediate HTTP-style ack; the 6000-series are processing result codes (likely surfaced on the
   C2B callback / status query). Gate the sync ack on `header.responseCode === 200`
   (or `responseMessage` starting "Success"/"Operation Success"); treat the 6000-series as catalog
   entries for the async result. Confirm both at the live sandbox before hard-coding.
2. **`Username`/`Password` header row.** The redeem "Request Parameter Definition" lists `Username`,
   `Password` (SHA256-hashed) and `Request id` — but the actual JSON body omits them and "Get Auth
   Token" says OAuth Bearer. Likely legacy "Bonga Everywhere" auth, not the Daraja path. Trust the JSON
   body + OAuth Bearer; verify at sandbox whether any extra header is truly required.

## Result codes (Safaricom-docs proof → catalog scope `bonga`)
`6000` Success · `6001` Fail · `6004` Server error · `6005` Invalid credentials · `6006` Missing parts
in body · `6007` CBS unavailable/busy · `6008` STK unavailable/busy · `6009` Broker unavailable/busy ·
`1037` DS timeout (no STK applet) · `6011` Database unavailable · `2001` Wrong PIN / initiator invalid ·
`1031` STK push timeout (customer didn't enter PIN) · `17` Reversal fails — account balance limit (100,000).

## Implementation note
New namespace `bonga`, new file `src/resources/bonga.ts`, new scope `bonga`, tiny nested-`header`
reader. `bonga.calculatePoints(points)` → sync, `retryable:true`. `bonga.redeem({...})` → async ack,
`retryable:false`; final result reuses the existing C2B callback path (no new parser). Own minor.
