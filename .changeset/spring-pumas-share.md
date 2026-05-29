---
"daraja-js": minor
---

Add the foundation layer: validation primitives and the error hierarchy.

- `normalizePhone` / `phoneToNumber` — accept all five Kenyan phone formats and a hashed MSISDN, cast to a JS number for STK Push (gotchas #1, #2).
- `makeTimestamp` — `YYYYMMDDHHMMSS` UTC (gotcha #3).
- `generatePassword` — `base64(shortcode + passkey + timestamp)` (gotcha #4).
- `validateAmount` — whole-KES guard.
- `DarajaError` hierarchy with `errorFromResult`, mapping ResultCodes 1 (insufficient funds), 1032 (cancelled), and 1037 (user unreachable) to typed errors.
