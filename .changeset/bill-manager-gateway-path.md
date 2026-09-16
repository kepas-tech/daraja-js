---
"@kepas/daraja-js": patch
---

Bill Manager: a 401 `Invalid Access Token` on the documented path (`/v1/billmanager-invoice/…`) is sent once more on the path Safaricom's go-live email lists for the production product (`/v1/billmanager-invoice/v1/billmanager-invoice/…`). On a production app with the product ticked, the documented path is refused at the gateway while the same token runs every other product. A 401 never reaches Bill Manager, so nothing can be sent twice. Proof and the email's full list in docs/specs/bill-manager.md.
