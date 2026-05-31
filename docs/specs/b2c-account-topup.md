# B2C Account Top Up — official Daraja spec (proof)

> Source: Safaricom Daraja portal, pasted verbatim by the operator 2026-05-30.
> Proof-grade reference behind daraja-js `b2b.topUp`.
> Loads funds to a B2C shortcode for disbursement: moves money from your MMF/Working
> account to the recipient's Utility account.

Endpoint: `POST /mpesa/b2b/v1/paymentrequest` — **SAME path as `b2b.pay`** (NOT `/b2b/v1/topup`).
No new endpoint const. Rides existing b2b transport + ack + `parseB2bResult`.

## Auth
Initiator + SecurityCredential. Initiator needs the **"Org Business Pay to Bulk API"** role on M-Pesa.

## Request body (exact wire casing)
```
{
  "Initiator": "testapi",
  "SecurityCredential": "<encrypted>",
  "CommandID": "BusinessPayToBulk",
  "SenderIdentifierType": "4",
  "RecieverIdentifierType": "4",
  "Amount": "239",
  "PartyA": "600979",
  "PartyB": "600000",
  "AccountReference": "353353",
  "Requester": "254708374149",
  "Remarks": "OK",
  "QueueTimeOutURL": "https://.../timeout",
  "ResultURL": "https://.../result"
}
```

Param rules:
- `CommandID` — fixed `BusinessPayToBulk`.
- `Initiator` — operator username (needs Pay-to-Bulk role).
- `PartyA` — YOUR shortcode (deducted). Number.
- `SenderIdentifierType` — only `"4"`.
- `PartyB` — recipient shortcode (credited). Number.
- `RecieverIdentifierType` — only `"4"`. **Same Safaricom misspelling "Reciever" — encode exactly.**
- `Requester` — **OPTIONAL** consumer mobile (254… on whose behalf you pay). Only optional field.
- `Amount` — number.
- `AccountReference` — string.
- `Remarks` — ≤100 chars.
- `QueueTimeOutURL`, `ResultURL` — required.

Net-new vs `b2b.pay`: `SenderIdentifierType`/`RecieverIdentifierType` (fixed `"4"`) + optional `Requester`.
Same shape as Tax Remittance minus PartyB-lock; differs only by CommandID + the optional `Requester`.

## Sync response (ack) — identical b2b convention
```
{ "OriginatorConversationID": "...", "ConversationID": "AG_...", "ResponseCode": "0",
  "ResponseDescription": "Accept the service request successfully." }
```
**`ResponseCode "0"` = accepted.** Reuse b2b ack.

## Async result (standard `Result` → reuse `parseB2bResult`)
Success `ResultCode 0`; same ResultParameters set as Tax Remittance (`DebitAccountBalance`, `Amount`,
`DebitPartyAffectedAccountBalance`, `TransCompletedTime`, `DebitPartyCharges`, `ReceiverPartyPublicName`,
`Currency`, `InitiatorAccountCurrentBalance`). `ReferenceData.ReferenceItem` = array of `{Key,Value}`.
Failure `ResultCode 2001` "The initiator information is invalid."
**Failure body shows `ResultParameters.ResultParameter` as a single OBJECT** (not array) and a
`ReferenceItem` with a key but no value (`{"Key":"Occassion"}`) → `toArray` + tolerant Value-read
already handle both.

## Error response (sync HTTP error) — proof-grade catalog feed
`{ requestId, errorCode, errorMessage }`. Documented errorCodes (Safaricom-docs proof):
- `500.003.1001` Internal Server Error
- `400.003.01` Invalid Access Token
- `400.003.02` Bad Request (something missing)
- `500.003.03` Quota Violation (TPS exceeded)
- `500.003.02` Spike Arrest Violation
- `404.003.01` Resource not found (wrong endpoint)
- `404.001.04` Invalid Authentication Header (used GET instead of POST)
- `400.002.05` Invalid Request Payload (malformed body)

Handled by `errorFromResponse` (b2b scope); these codes are candidate CATALOG entries
(proof=safaricom-docs) shared across all `/mpesa/b2b/v1/*` calls.

## Implementation note
Add as `b2b.topUp` (method only — same endpoint const as `b2b.pay`). Reuses `requireInitiator`,
b2b ack, `parseB2bResult`. Batch into one minor with Tax Remittance.
