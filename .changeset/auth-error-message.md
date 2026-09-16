---
"@kepas/daraja-js": patch
---

A 401 from Daraja keeps the gateway's own `errorMessage` in `DarajaAuthError.message` (for example "Invalid Access Token" or "Invalid API call as no apiproduct match found"), so a caller can tell a bad token from a product that is not enabled on the app. The response body still lives only in the non-enumerable `raw`.
