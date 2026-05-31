# Tax Remittance — official Daraja spec (proof)

> Source: Safaricom Daraja portal, pasted verbatim by the operator 2026-05-30.
> Proof-grade reference behind the daraja-js Tax Remittance implementation.
> Remits tax to KRA. Requires prior KRA integration (PRN generation).

Endpoint: `POST /mpesa/b2b/v1/remittax` (prod base `https://api.safaricom.co.ke`).
**Same path family as B2B** — rides the existing b2b transport + `parseB2bResult`.

## Auth
Initiator + SecurityCredential (RSA-encrypted operator password). Initiator-authed, like all b2b.

## Request body (exact wire casing)
```
{
  "Initiator": "TaxPayer",
  "SecurityCredential": "<encrypted>",
  "CommandID": "PayTaxToKRA",
  "SenderIdentifierType": "4",
  "RecieverIdentifierType": "4",
  "Amount": "239",
  "PartyA": "888880",
  "PartyB": "572572",
  "AccountReference": "353353",
  "Remarks": "OK",
  "QueueTimeOutURL": "https://.../b2b/remittax/queue/",
  "ResultURL": "https://.../b2b/remittax/result/"
}
```

Param rules (from spec):
- `CommandID` — fixed `PayTaxToKRA`. (Spec prose wrote "Command ID" with a space — IGNORE; the JSON body shows `CommandID`. Wire = `CommandID`.)
- `Initiator` — operator username.
- `PartyA` — YOUR shortcode (money deducted from). Number.
- `SenderIdentifierType` — only `"4"` allowed.
- `PartyB` — **only `572572` allowed** (KRA tax collector). Number.
- `RecieverIdentifierType` — only `"4"` allowed. **NOTE Safaricom's misspelling "Reciever" — encode the field name exactly as `RecieverIdentifierType`.**
- `Amount` — number.
- `AccountReference` — **the KRA-issued PRN (Payment Registration Number)**, e.g. `PRN1234XN`. String. Required.
- `Remarks` — ≤100 chars.
- `QueueTimeOutURL`, `ResultURL` — required.

## Sync response (ack)
```
{ "OriginatorConversationID": "...", "ConversationID": "AG_...", "ResponseCode": "0",
  "ResponseDescription": "Accept the service request successfully." }
```
**`ResponseCode "0"` = accepted** — identical convention to b2b. Reuse the b2b ack shape.

## Async result (standard `Result` envelope → reuse `parseB2bResult`)
Success `ResultCode 0`; ResultParameters carry `DebitAccountBalance`, `Amount`,
`DebitPartyAffectedAccountBalance` (pipe-delimited balance), `TransCompletedTime`,
`DebitPartyCharges`, `ReceiverPartyPublicName`, `Currency`, `InitiatorAccountCurrentBalance`.
`ReferenceData.ReferenceItem` carries `BillReferenceNumber` + echoed `QueueTimeoutURL`.
Failure example: `ResultCode 2001` "The initiator information is invalid."
**`ReferenceItem` arrives as a single object OR array** (spec shows single object in both
success+failure bodies) → `toArray` already handles this collapse.

## Error response (sync HTTP error)
`{ requestId, errorCode, errorMessage }` (e.g. `404.001.04` "Invalid Access Token") —
already handled by `errorFromResponse` (b2b scope) catalog path.

## Implementation note
Add as `b2b.remitTax` (new method + new endpoint const `/mpesa/b2b/v1/remittax`). Reuses
`requireInitiator`, the b2b ack parser, and `parseB2bResult`. The only NEW fields vs b2b.pay are
`SenderIdentifierType`/`RecieverIdentifierType` (both fixed `"4"`) and `AccountReference`=PRN.
No new scope, no new parser, no new error class.
