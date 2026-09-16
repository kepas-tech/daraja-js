---
"@kepas/daraja-js": patch
---

A 401 from Daraja's gateway now discards the cached OAuth token (memory and the shared `TokenStore`) and sends the request once more with a fresh one. Daraja binds a token to the API products the app had when it was issued, so after a product is added on the portal every call to it answered 401 "Invalid Access Token" for up to an hour. The second send is safe for every call: a 401 is refused at the gateway before M-Pesa sees the request. A second 401 with the fresh token still throws `DarajaAuthError`.
