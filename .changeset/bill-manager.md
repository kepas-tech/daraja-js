---
"@kepas/daraja-js": minor
---

Add Bill Manager support (`daraja.billManager`): `optIn`, `updateOptIn`, `sendInvoice`, `sendBulkInvoices` (≤1000), `cancelInvoice`, `cancelBulkInvoices`, `acknowledgePayment`, plus `parseBillManagerPayment` (inbound payment push) and `billManagerAck`. Bill Manager uses its own success convention (string `rescode "200"`, not `ResponseCode "0"`) and an `app_key` header obtained from `optIn` (pass per-call as `appKey` or set `config.billManagerAppKey`). `http.post` now accepts an additive `headers` option; fixed auth/content-type headers always win the merge. New `billmanager` catalog scope (`200`/`409`).
