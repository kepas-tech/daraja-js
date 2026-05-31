---
"@kepas/daraja-js": minor
---

Add Lipa na Bonga (`daraja.bonga`): `calculatePoints` (read-only points→KES conversion, retryable) and `redeem` (redeem Bonga points as payment to a paybill/till). OAuth-only, nested `header`/`body` envelope, success is `header.responseCode 200`. The redemption result settles on the existing C2B confirmation callback (`parseC2bConfirmation`) — no Bonga-specific result parser. New `bonga` catalog scope.
