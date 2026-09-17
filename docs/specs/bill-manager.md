# Bill Manager — official Daraja spec (proof)

> Source: Safaricom Daraja portal (authenticated), pasted verbatim by the operator
> 2026-05-30. This is the proof-grade reference behind the daraja-js Bill Manager
> implementation. All endpoints use the Daraja OAuth access token (Bearer).

Base (prod): `https://api.safaricom.co.ke`  ·  (sandbox): `https://sandbox.safaricom.co.ke`

## 1. Opt-in (onboarding) — `POST /v1/billmanager-invoice/optin`
First call; whitelists the shortcode for all other Bill Manager APIs and returns `app_key`.
Request:
```
{ "shortcode":"718003", "email":"x@y.com", "officialContact":"0710XXXXXX",
  "sendReminders":"1", "logo":"image", "callbackurl":"https://my.server/callback" }
```
Fields: shortcode (numeric, req), email (string, req), officialContact (numeric, req),
sendReminders (0|1, req), logo (image, optional), callbackurl (URL, req).
Response: `{ "app_key":"AG_...", "resmsg":"Success", "rescode":"200" }`. **rescode "200" = success.**
The returned `app_key` must be sent in the header of invoicing service requests.

## 2. Single invoicing — `POST /v1/billmanager-invoice/single-invoicing`
Request: `{ externalReference, billedFullName, billedPhoneNumber, billedPeriod, invoiceName,
dueDate, accountReference, amount, invoiceItems?: [{ itemName, amount }] }`. All required except invoiceItems.
Response: `{ "Status_Message":"Invoice sent successfully", "resmsg":"Success", "rescode":"200" }`.

## 3. Bulk invoicing — `POST /v1/billmanager-invoice/bulk-invoicing`
Request: an array (≤1000) of the single-invoice objects. `appKey` required in header.
Response: same `{ Status_Message, resmsg, rescode }`.

## 4. Payments & Reconciliation — `POST /v1/billmanager-invoice/reconciliation`
Two flows:
- **(a) Payment pushed TO you** (Bill Manager → your callbackurl), retried up to 5×:
  `{ transactionId, paidAmount, msisdn, dateCreated, accountReference, shortCode }` → you reply `{ resmsg, rescode }`.
- **(b) Acknowledgment you SEND** to the reconciliation endpoint:
  `{ paymentDate, paidAmount, accountReference, transactionId, phoneNumber, fullName, invoiceName, externalReference }`
  → response `{ resmsg, rescode }`.

## 5. Cancel single — `POST /v1/billmanager-invoice/cancel-single-invoice`
Request: `{ "externalReference":"113" }`. Response: `{ Status_Message, resmsg, rescode, errors[] }`.
A partially/fully paid invoice cannot be cancelled → `rescode 409` "partially or fully paid invoices cannot be cancelled."

## 6. Cancel bulk — `POST /v1/billmanager-invoice/cancel-bulk-invoices`
Request: `[ { externalReference }, ... ]`. Same response shape.

## 7. Update opt-in — `POST /v1/billmanager-invoice/change-optin-details`
Request: `{ shortcode, email, officialContact, sendReminders, logo, callbackurl }`. Response: `{ resmsg, rescode }`.

## Conventions / gotchas
- **Auth:** Daraja OAuth Bearer for all; invoicing also needs the `app_key` header from opt-in.
- **Success is `rescode:"200"`** (string) + `resmsg`/`Status_Message` — NOT `ResponseCode`/`ResultCode`. Needs its own success check + catalog scope `billmanager`.
- **Key casing:** lowercase `shortcode`, `callbackurl`, camelCase `officialContact`, `externalReference`, etc. — encode exactly.
- **409 family:** `Biller already Registered`, `Invalid consumer key/shortcode`, duplicate `externalReference`, incorrect phone format (use `2547…`/`07…`), incorrect due-date format.
- Bulk invoicing cap: 1000 per call. Reconciliation push retried up to 5×.

## Production proxy paths (Safaricom's go-live email, 2026-09-16)

The docs page (this file, sections 1–7) lists every endpoint under `/v1/billmanager-invoice/…`.
The go-live email Daraja sends after "Update App" ("Congratulations for Updating your API
Products on Go-live!") lists what the production app "will be calling", and for the
**Bill Manager Generic API** product every proxy carries the prefix twice:

```
Proxy:Opt-In                   https://api.safaricom.co.ke/v1/billmanager-invoice/v1/billmanager-invoice/optin
Proxy:Single-Invoicing         https://api.safaricom.co.ke/v1/billmanager-invoice/v1/billmanager-invoice/single-invoicing
Proxy:Bulk-Invoicing           https://api.safaricom.co.ke/v1/billmanager-invoice/v1/billmanager-invoice/bulk-invoicing
Proxy:Reconciliation           https://api.safaricom.co.ke/v1/billmanager-invoice/v1/billmanager-invoice/reconciliation
Proxy:Cancel-Single-Invoicing  https://api.safaricom.co.ke/v1/billmanager-invoice/v1/billmanager-invoice/cancel-single-invoice
Proxy:Cancel-Bulk-Invoicing    https://api.safaricom.co.ke/v1/billmanager-invoice/v1/billmanager-invoice/cancel-bulk-invoice
Proxy:Update-Onboarding-Details https://api.safaricom.co.ke/v1/billmanager-invoice/v1/billmanager-invoice/change-optin-details
Proxy:Update-Single-Invoicing  https://api.safaricom.co.ke/v1/billmanager-invoice/v1/billmanager-invoice/change-invoice
Proxy:Update-Bulk-Invoicing    https://api.safaricom.co.ke/v1/billmanager-invoice/v1/billmanager-invoice/change-invoices
```

Every other product in the same email matches its docs page exactly (e.g.
`/mpesa/b2c/v1/paymentrequest`).

Observed on a production app (product "Bill Manager - Prod" ticked, token minted after it was
added, same token running B2C, balance, STK and C2B): **both** paths answer

```
HTTP 401 {"errorCode":"401","errorMessage":"Unauthorized - Invalid Access Token"}
requestId 2b1f-43e4-90e0-f56603679e1a4664, 2026-09-16
```

That is Bill Manager's own envelope (`errorCode "401"`), not the gateway's
`404.001.03 Invalid Access Token`, so the request reaches Bill Manager on either path and
Bill Manager does not yet know the shortcode or app. Safaricom's API support enables that
(apisupport@safaricom.co.ke, with the paybill and the requestId). The SDK still sends a 401
on the documented path once more on the email's path (`bmPost` in
`src/resources/bill-manager.ts`), because Safaricom's own email names it; a 401 on either
path is refused before any opt-in or invoice is recorded, so the second send cannot double
anything.
