# Query Organization Info — official Daraja spec (proof)

> Source: Safaricom Daraja portal, pasted verbatim by the operator 2026-05-30.
> Proof-grade reference behind daraja-js `orgInfo.query`.
> Validation tool: look up an org's shortcode name + applicable tariff BEFORE paying
> (reduces reversals to wrong till/paybill). **SYNCHRONOUS** — no callback.

Endpoint: `POST /sfcverify/v1/query/info` (prod base `https://api.safaricom.co.ke`).
Own path family (no `/mpesa/` prefix).

## Conventions
- **OAuth Bearer only.** No initiator, no securityCredential.
- **SYNCHRONOUS** — the result is returned inline in the HTTP response (like `status.stkPush`).
  No ResultURL, no async callback. → `http.post(..., { retryable: true })` (read-only, idempotent).

## Headers
`Content-Type: application/json`, `Authorization: Bearer <token>`.

## Request body
```
{ "IdentifierType": "4", "Identifier": "666677" }
```
- `IdentifierType` — `"4"` = paybill, `"2"` = buy-goods till.
- `Identifier` — the shortcode/till registered under the organization.

## Response body (inline, synchronous)
```
{ "ConversationID": "410c-48e1-b4ab-57d897c8c7a0141968",
  "ResponseCode": "4000",
  "ResponseMessage": "Success",
  "DetailedMessage": "Request received successfully",
  "OrganizationShortCode": "666677",
  "OrganizationName": "Daraja",
  "ChargeProfileID": "20013" }
```
- `OrganizationShortCode` — echoed shortcode (or till, if IdentifierType 2).
- `OrganizationName` — store name (only on success).
- `ChargeProfileID` — tariff profile id (only on success).

## ⚠️ Success-code conflict (DO NOT guess — resolve at sandbox)
The spec contradicts itself:
- **Actual response JSON sample** shows `ResponseCode: "4000"` together with `ResponseMessage: "Success"`.
- **Prose tables** ("Response Parameter Definition" + "Error codes") say `0 = Success, details fetched
  successfully`; `1 or any other = Rejecting the request`; `500 = invalid parameter`;
  `401.001 = invalid access token`.

Resolution plan (proof-driven): in the resource, treat success as
`ResponseMessage === 'Success'` **AND** `OrganizationName` present, rather than hard-coding a numeric
code. Log the real `ResponseCode` returned by the live sandbox during implementation and only then add a
catalog entry (`orginfo` scope) with the confirmed code. Until proven, the numeric success code stays
**unconfirmed** — pass Safaricom's `ResponseMessage`/`DetailedMessage` through verbatim on failure.

## Error codes (prose-table proof; numeric success unconfirmed — see above)
`0` success (per table) · `1`/any other → request rejected · `500` invalid parameter input ·
`401.001` invalid access token.

## Charge profile reference (sample mapping from spec)
`20129` B2B Tariff 2 · `20144` Gaming Customer Bouquet · `20143` Gaming Mgao ·
`20142` Gaming Business Bouquet · `20013` (sample "Daraja" org). Tariff types:
Mgao (split charges), Business Bouquet (customer bears all), Customer Bouquet (business bears all).

## Implementation note
New namespace `orgInfo`, new file `src/resources/org-info.ts`, new scope `orginfo`. SYNCHRONOUS
single call returning a typed `{ conversationId, responseCode, responseMessage, detailedMessage,
organizationShortCode, organizationName, chargeProfileId, success }`. No parser (no callback).
`retryable: true` (idempotent read). Gate success on `ResponseMessage`/`OrganizationName` until the
numeric code is sandbox-confirmed. Own minor.
