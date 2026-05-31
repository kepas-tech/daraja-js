# Business To Pochi (B2Pochi) — official Daraja spec (proof)

> Source: Safaricom Daraja portal, pasted verbatim by the operator 2026-05-30.
> Proof-grade reference behind daraja-js `b2c.toPochi`.
> A B2C variant: pays from a Business B2C account to a customer's business wallet
> (pochi la biashara / micro-SME). Asynchronous.

Endpoint: `POST /mpesa/b2pochi/v1/paymentrequest` (prod base `https://api.safaricom.co.ke`).
Own path const (NOT the b2c `/mpesa/b2c/v1/paymentrequest`), but **pure B2C shape** otherwise.

## Auth
InitiatorName + SecurityCredential (RSA-encrypted). Initiator needs **ORG B2C API Initiator** role.
Same auth as `b2c.send`.

## Request body (exact wire casing — PascalCase)
```
{
  "OriginatorConversationID": "600997_Test_32et3241ed8yu",
  "InitiatorName": "testapi",
  "SecurityCredential": "<encrypted>",
  "CommandID": "BusinessPayToPochi",
  "Amount": "10",
  "PartyA": "600992",
  "PartyB": "254705912645",
  "Remarks": "remarked",
  "QueueTimeOutURL": "https://mydomain.com/path",
  "ResultURL": "https://mydomain.com/path",
  "Occassion": "ChristmasPay"
}
```
- `OriginatorConversationID` — **REQUIRED, caller-generated**, unique per request (double-disbursement
  guard; duplicate → errorCode `500.002.1001`). This is the key difference from `b2c.send`, whose v1
  body omits it. SDK should let the caller pass it (and may generate one if omitted).
- `InitiatorName` — API operator username.
- `SecurityCredential` — encrypted initiator password.
- `CommandID` — fixed `BusinessPayToPochi` for this product. (Spec notes the endpoint also accepts
  `SalaryPayment`/`BusinessPayment`/`PromotionPayment`, but those are the ordinary b2c.send path —
  for `b2c.toPochi` lock to `BusinessPayToPochi`.)
- `Amount` — numeric. Limits: min Ksh 10, max Ksh 250,000/txn; max wallet balance Ksh 500,000; daily Ksh 500,000.
- `PartyA` — your B2C organization shortcode (sender).
- `PartyB` — customer MSISDN `2547XXXXXXXX` (12-digit, no `+`).
- `Remarks` — 2–100 chars.
- `QueueTimeOutURL`, `ResultURL` — required.
- `Occassion` — **OPTIONAL**, 1–100 chars. (Safaricom's misspelling "Occassion" — encode exactly.)

## Sync ack (b2c convention)
```
{ "ConversationID":"AG_...", "OriginatorConversationID":"600997_Test_...",
  "ResponseCode":"0", "ResponseDescription":"Accept the service request successfully." }
```
**`ResponseCode "0"` = accepted.** Reuse the b2c ack shape.

## Async callback (standard `Result` envelope → reuse the b2c `Result` parser)
Success `ResultCode 0`; `ResultParameters.ResultParameter` (Key/Value array) carries:
`TransactionAmount`, `TransactionReceipt`, `ReceiverPartyPublicName`, `TransactionCompletedDateTime`
(format `06.07.2024 22:48:52`), `B2CUtilityAccountAvailableFunds`, `B2CWorkingAccountAvailableFunds`,
`B2CRecipientIsRegisteredCustomer` (`Y`/`N`), `B2CChargesPaidAccountAvailableFunds`.
Failure `ResultCode 2001` "The initiator information is invalid." (no ResultParameters).
**`ReferenceData.ReferenceItem` is a single OBJECT** (not array) → `toArray` already handles.
Same shape as B2C → reuse the existing b2c result parser; **no new parser, no new scope.**

## Error response (sync HTTP error) → catalog scope `b2c`
`{ requestId, errorCode, errorMessage }`, e.g. `500.002.1001` "Duplicate OriginatorConversationID",
`401.001` Bad Request. Handled by `errorFromResponse` (b2c scope).

## Result codes (Safaricom-docs proof → catalog scope `b2c`; same family as b2c.send)
`0` success · `1` insufficient balance (Utility) · `2` below min limit · `3` above max limit ·
`4` exceeds daily transfer limit (cust 500k) · `8` exceeds max balance (500k) · `11` DebitParty invalid
state (account inactive) · `21` initiator lacks ORG B2C API role · `2001` initiator info invalid (wrong
PIN/cred) · `2006` account status disallows · `2028` PartyA shortcode lacks B2C permission ·
`2040` credit party customer type unsupported (unregistered) · `8006` security credential locked ·
`SFC_IC0003` operator does not exist (invalid phone).

## Notes
- B2C debits the **Utility account** (insufficient-balance error even if Working has funds).
- **Reversal via API is NOT supported** for B2C/B2Pochi — manual on the M-Pesa portal only.

## Implementation note
Add as `b2c.toPochi` (new endpoint const `/mpesa/b2pochi/v1/paymentrequest`, CommandID
`BusinessPayToPochi`). Reuses b2c auth guard, b2c ack, b2c `Result` parser, b2c catalog scope.
Only net-new: the endpoint const + required caller `OriginatorConversationID` + optional `Occassion`.
Batches cleanly with the other b2c/b2b reuse APIs.
