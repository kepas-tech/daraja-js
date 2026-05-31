---
"@kepas/daraja-js": minor
---

Add M-Pesa Ratiba support (`daraja.ratiba.create`) — create a customer standing order (recurring collection) via `/standingorder/v1/createStandingOrderExternal`. OAuth-only; success is the nested `ResponseHeader.responseCode "200"`. Adds `parseRatibaCallback` for the async result (nested `responseBody.responseData[]` `name`/`value` pairs, parsed case-insensitively), `RatibaFrequency` (1–8), and `paybill`/`buygoods` transaction-type mapping (the latter sends Safaricom's misspelled `Standing Order Customer Pay Marchant`). New `ratiba` catalog scope (`200`, `0`, `1037`, `1032`, `2001`, `1050`, `1051`).
