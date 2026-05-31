---
"@kepas/daraja-js": minor
---

Sync all documentation to v1.3.0 code reality and add the proven Lipa na Bonga result codes.

- Add Bonga catalog entries to `CATALOG` (sync `200`; processing `6000`/`6001`/`6004`–`6009`/`6011`/`1037`/`1031`/`2001`/`17`, proof=safaricom-docs) so the declared `bonga` scope is no longer hollow.
- `docs/ERROR_CODES.md` now renders all 13 scopes (was missing `billmanager`, `ratiba`, `b2bexpress`, `bonga`).
- README "What's covered" lists every shipped namespace/method (the 8 v1.3.0 APIs were absent); the roadmap no longer advertises shipped features as "post-1.0". ROADMAP.md rewritten to reflect shipped reality.
- CI now fails if `docs/ERROR_CODES.md` drifts from the catalog, and a unit test asserts every catalogued scope is rendered — making doc drift impossible to merge.
