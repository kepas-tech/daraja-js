---
"@kepas/daraja-js": minor
---

B2C Hakikisha: `hakikisha.lookup({ phone })` returns a customer's registered name (first name in the clear, middle and last masked by Safaricom) from a phone number before a payout. Synchronous, retryable; a non-200 `header.status` throws `DarajaAPIError` with Safaricom's `body.message`. Spec proof in docs/specs/b2c-hakikisha.md.
