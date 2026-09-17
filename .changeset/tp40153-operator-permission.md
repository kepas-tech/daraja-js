---
"@kepas/daraja-js": patch
---

Catalogue `TP40153` for `b2c`, `b2b`, `balance` and `reversal`: the API operator that signed the request has no permission for this API, or is not in this organisation. Safaricom returns it as plain text today, so a caller gets the `ResultDesc` with no meaning, no retriable hint and no terminal hint attached. The proof is a production integration's own operator classification (`production-code`), the same class of proof as the `2001` handler entry; Safaricom publishes no reference for it, so nothing is claimed beyond what that integration handles. Only these four scopes carry it — an endpoint that has not shown the code keeps passing it through verbatim.
