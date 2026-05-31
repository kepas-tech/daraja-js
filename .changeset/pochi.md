---
"@kepas/daraja-js": minor
---

Add Business To Pochi (`daraja.b2c.toPochi`) — pay a customer's business wallet (pochi la biashara) via `/mpesa/b2pochi/v1/paymentrequest` + `BusinessPayToPochi`. Reuses B2C auth, the `ResponseCode "0"` ack, and `parseB2cResult`. Caller-supplied `originatorConversationId` (dedupe guard, auto-generated UUID if omitted) and optional `occasion` (sent as Safaricom's misspelled `Occassion`).
