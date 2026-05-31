# Prerequisites — what you need from Safaricom

`@kepas/daraja-js` is a client for Safaricom's Daraja (M-Pesa) APIs. The SDK
handles the code; **Safaricom controls access.** Each API needs (a) the right
**Daraja app product enabled**, (b) the right **credentials**, and for some, a
specific **operator role** or **Go-Live**. This page lists the exact, categorical
prerequisites per capability so you reach 100% compatibility.

> **How these were determined.** Auth tiers come from the SDK's own code — which
> calls require an initiator vs a passkey. Product, role, and Go-Live requirements
> come from Safaricom's official API docs, preserved under [`docs/specs/`](./docs/specs).
> We also confirmed against the live API that an app without a product enabled
> returns `HTTP 401 "Invalid API call as no apiproduct match found"`.

---

## 1. Universal (every API)

| Need | What it is | Where |
|------|-----------|-------|
| **Daraja account** | developer.safaricom.co.ke login | [developer.safaricom.co.ke](https://developer.safaricom.co.ke) |
| **A Daraja app** | created under *My Apps*, with the **products you need added to it** | Daraja portal → My Apps |
| **Consumer Key + Consumer Secret** | the app's OAuth credentials (the SDK exchanges them for a bearer token) | My Apps → your app |
| **Environment** | `sandbox` (free, test data + simulator) or `production` (after Go-Live) | — |

SDK config: `consumerKey`, `consumerSecret`, `environment`, and your `shortcode`.

```ts
const daraja = new Daraja({
  consumerKey: process.env.MPESA_CONSUMER_KEY!,
  consumerSecret: process.env.MPESA_CONSUMER_SECRET!,
  shortcode: process.env.MPESA_SHORTCODE!,
  passkey: process.env.MPESA_PASSKEY!,          // STK only (see below)
  environment: 'production',
});
```

If a call returns **`401 … no apiproduct match found`**, the product isn't enabled
on your app — add it (and Go-Live for commercial products) before retrying.

---

## 2. The five credential types

1. **Consumer Key / Secret** — every API. OAuth bearer token. (The SDK caches it; 3599s TTL.)
2. **Passkey** — **STK Push only** (`collect.stkPush`, `status.stkPush`). The Lipa-na-M-Pesa
   Online passkey for your shortcode (sandbox passkey is published; production passkey is issued at Go-Live).
3. **Initiator name + SecurityCredential** — the **initiator-authed APIs** (B2C, B2B, balance,
   `status.transaction`, reversal — see the matrix). The initiator is an **API operator
   username** created on the **M-Pesa Org Portal** with a specific API role; the
   SecurityCredential is that operator's password **RSA-encrypted** with Safaricom's public
   certificate. Generate it with the SDK's `generateSecurityCredential({ … })`.
   - Password char rule (Safaricom): only `#`, `&`, `%`, `$` are valid specials; `@` is treated
     as a normal char; `(` `)` are **rejected**.
4. **`app_key`** — **Bill Manager only.** Returned by `billManager.optIn`; pass it back on every
   later Bill Manager call (`appKey` per call, or set `config.billManagerAppKey`).
5. **Nominated Number** — **Pull Transactions only.** A real Safaricom MSISDN in `2547XXXXXXXX`
   form (the operator's preferred number), **not** the shortcode.

SDK config for these: `passkey`, `initiator`, `securityCredential`, `billManagerAppKey`.

---

## 3. Auth tier per API (from the SDK's own guards)

| Tier | Needs | APIs |
|------|-------|------|
| **A. OAuth only** | consumerKey/secret | `c2b.*`, `qr.generate`, `pull.*`, `orgInfo.query`, `express.checkout`, `ratiba.create`, `bonga.*` |
| **B. OAuth + passkey** | + passkey | `collect.stkPush`, `status.stkPush` |
| **C. OAuth + initiator + SecurityCredential** | + initiator role + RSA cred | `b2c.send`, `b2c.toPochi`, `b2b.pay`, `b2b.transferFloat`, `b2b.topUp`, `b2b.remitTax`, `balance.query`, `status.transaction`, `reversal.request` |
| **D. OAuth + app_key** | + Bill Manager `app_key` (from optIn) | `billManager.*` (optIn itself is tier A) |

---

## 4. Full prerequisite matrix (per capability)

| SDK call | Daraja product to enable | Auth tier | Specific Safaricom prerequisite |
|----------|--------------------------|:---------:|---------------------------------|
| `collect.stkPush` | Lipa Na M-Pesa Online (M-Pesa Express) | B | Shortcode enabled for online checkout; passkey |
| `c2b.registerUrls` + parsers | Customer To Business (C2B) | A | Register your confirmation/validation URLs (once) |
| `b2c.send` | Business To Customer (B2C) | C | **B2C shortcode** (Bulk Disbursement / one-account); operator role **ORG B2C API Initiator**. B2C debits the **Utility** account |
| `b2c.toPochi` | Business To Customer / B2Pochi | C | As B2C; recipient must have a **pochi la biashara** (business wallet) |
| `b2b.pay` | B2B | C | Role **Business Paybill Org API initiator** (PayBill) or **Business Buy Goods Org API initiator** (Till) |
| `b2b.transferFloat` | B2B | C | `BusinessTransferFromMMFToUtility/…` **whitelisting** — contact apisupport@safaricom.co.ke |
| `b2b.topUp` | B2B | C | Role **Org Business Pay to Bulk API initiator**; a destination B2C shortcode |
| `b2b.remitTax` | B2B / Tax Remittance | C | **Prior KRA integration** (PRN generation) + role **Tax Remittance to KRA API**; PartyB is fixed `572572` |
| `balance.query` | Account Balance | C | Role **Balance Query ORG API** |
| `status.stkPush` | (uses the STK product) | B | passkey |
| `status.transaction` | Transaction Status | C | Role **Transaction Status query ORG API** |
| `reversal.request` | Reversal | C | Role **Org Reversals Initiator** |
| `qr.generate` | Dynamic QR | A | — |
| `pull.registerUrl` / `pull.query` | Pull Transactions (Daraja 3.0) | A | **Nominated Number** (a `2547…` phone, not the shortcode); register once |
| `orgInfo.query` | Query Organization Info | A | — (read-only validation) |
| `express.checkout` | B2B Express Checkout (USSD Push to Till) | A | **Nominated Number** set on the shortcode's Org Details (else error `4104`); **Go-Live** |
| `ratiba.create` | M-Pesa Ratiba | A | **Commercial API** — email apisupport@safaricom.co.ke for **Go-Live + contract** |
| `bonga.calculatePoints` / `bonga.redeem` | Lipa na Bonga | A | Merchant must accept **Lipa na M-Pesa** (Buy Goods / Pay Bill) |
| `billManager.*` | Bill Manager | D | Run `billManager.optIn` → store the returned `app_key`; settlement set to **Bank via Head Office** |
| `webhooks.*`, primitives, `generateSecurityCredential` | — | none | Pure client-side; no Safaricom call |

> The SDK does not gate on product/role — only on credentials it needs to build the
> request. A missing product/role surfaces as Safaricom's own `401`/`ResultCode`
> (e.g. B2B/B2C `ResultCode 21` = "initiator is not allowed", Express `4104` =
> missing Nominated Number) — passed through verbatim. See [docs/ERROR_CODES.md](./docs/ERROR_CODES.md).

---

## 5. Creating an initiator (for tier C)

Tier-C APIs need an **API operator** with the right role on the M-Pesa Org Portal
([org.ke.m-pesa.com](https://org.ke.m-pesa.com)). High level (per Safaricom docs):

1. Your shortcode's settlement must be **Bank via a Head Office** application
   (contact M-PESABusiness@safaricom.co.ke for the forms).
2. A **Business Administrator** is created for the shortcode.
3. The Business Administrator creates an **API operator** (access channel = **API**),
   assigns the **role(s)** from the matrix above, then a user with the
   **Set Restricted ORG API PASSWORD** role sets the operator's password
   (avoid `@` and `.` and `( )` in it).
4. That username is your `initiator`; RSA-encrypt its password with
   `generateSecurityCredential({ … })` to get `securityCredential`.

Reference role names (Safaricom): `ORG B2C API Initiator`, `Business Paybill Org API initiator`,
`Business Buy Goods Org API initiator`, `Transaction Status query ORG API`, `Org Reversals Initiator`,
`Tax Remittance to KRA API`, `Org Business Pay to Bulk API initiator`, `Balance Query ORG API`.

---

## 6. Sandbox vs production / Go-Live

- **Sandbox**: create a sandbox app, add the product(s), use the portal's test credentials +
  simulator. No real money. Some products' simulators are login-gated.
- **Production / Go-Live**: from the app's **GO LIVE** tab, supply a live PayBill/Till/B2C
  shortcode, the org name, and an M-Pesa **admin/manager** username; an OTP goes to that
  user's Safaricom line. On success, production endpoints + keys are issued.
- **Commercial / add-on products** — **Bill Manager, M-Pesa Ratiba, B2B Express Checkout,
  Query Org Info, Lipa na Bonga**, and the money-movers — must be **added to the app**
  (and several require **Go-Live / a contract**) before live calls succeed. Until then,
  expect `HTTP 401 "no apiproduct match found"`.

---

## 7. Quick credential checklist by goal

- **Collect via STK Push** → consumerKey/secret + **passkey** + STK product.
- **Capture direct PayBill/Till payments (C2B)** → consumerKey/secret + C2B product (register URLs).
- **Pay out (B2C / Pochi / B2B / float / top-up / tax)** → consumerKey/secret + **initiator + SecurityCredential** + the matching **operator role** + the product.
- **Reconcile (status / balance / reversal / pull)** → as above (status.transaction/balance/reversal are tier C; pull is tier A + Nominated Number).
- **Invoice (Bill Manager)** → consumerKey/secret + Bill Manager product + `optIn` → `app_key`.
- **Standing orders / Express / Bonga / Org Info** → consumerKey/secret + the product (Ratiba & Express need Go-Live; Express needs a Nominated Number).
