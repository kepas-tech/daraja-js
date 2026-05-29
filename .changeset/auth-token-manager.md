---
"daraja-js": minor
---

Add `TokenManager`: OAuth token cache with a 3599s TTL, configurable safety
margin, single-flight refresh (concurrent callers share one request), and no
caching of failed fetches.
