---
"@kepas/daraja-js": minor
---

Add `b2b.topUp` (B2C Account Top Up — `BusinessPayToBulk`, loads a B2C shortcode's Utility account; optional `requester`) and `b2b.remitTax` (Tax Remittance to KRA — `PayTaxToKRA`, PartyB fixed `572572`, `prn` sent as AccountReference, own `/mpesa/b2b/v1/remittax` endpoint). Both reuse the b2b initiator guard, ack, and `parseB2bResult`. Verified live against production: `topUp` rejected an invalid PartyB synchronously; `remitTax` accepted (ResponseCode 0).
