---
"@kepas/daraja-js": patch
---

`hakikisha.lookup`: when Safaricom answers HTTP 400 with its own envelope (`body.message`, e.g. "The customer does not exist."), the thrown `DarajaAPIError` now carries that message and the request id, the same as a 200 with `header.status` 400, instead of a bare "Daraja request failed (HTTP 400)".
