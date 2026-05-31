---
"@kepas/daraja-js": minor
---

Add Query Organization Info (`daraja.orgInfo.query`) — synchronous, read-only shortcode validation (`/sfcverify/v1/query/info`) returning org name, tariff (ChargeProfileID), and a `success` flag. OAuth-only, idempotent (retryable). `identifierType` maps `paybill`→4 / `till`→2. Success is gated on `ResponseMessage === "Success"` + an OrganizationName (the spec's numeric success code is contradictory — `4000` vs `0` — so the raw code is exposed verbatim, not asserted).
