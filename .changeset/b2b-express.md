---
"@kepas/daraja-js": minor
---

Add B2B Express Checkout (`daraja.express.checkout`) — vendor-initiated USSD push to a merchant's till (`/v1/ussdpush/get-msisdn`). OAuth-only, camelCase body, `code`/`status` sync ack; auto-generates `RequestRefID` (UUID) when omitted. Adds `parseExpressCallback` for the FLAT async callback (top-level `resultCode`, no `Result{}` envelope). New `b2bexpress` catalog scope (`0`, `4104`, `4102` sync; `0`, `4001` async).
