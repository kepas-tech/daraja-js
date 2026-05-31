# Plan: 100% money-API coverage for `@kepas/daraja-js`

## Context & goal
Cover **every Safaricom money API** (leave only sandbox-simulate + telco: SIM swap, IMSI, IoT).
SDK is at **v1.2.0**. 8 money APIs remain uncovered. **Proof-driven**: the Daraja portal is a JS
SPA (unfetchable) — the operator **pastes each official spec**, we implement from that proof; never
guess a schema. Plan ALL 8 first (this doc), then implement **one PR per API**, each with the same
intensity (TDD, full verify, CI/OIDC publish, `pnpm verify:published`).

**Specs: 8/8 IN HAND** (all pasted by operator 2026-05-30, preserved under `docs/specs/`):
`bill-manager.md`, `tax-remittance.md`, `b2c-account-topup.md`, `b2b-express-checkout.md`,
`mpesa-ratiba.md`, `business-to-pochi.md`, `query-org-info.md`, `lipa-na-bonga.md`.
Planning phase complete — ready to implement one-by-one.

## Cross-cutting decisions (locked)
1. **`http.post` gains an additive `headers?` opt** (`http.ts:64/72/83/93`) so per-call headers (Bill
   Manager's `app_key`) work; fixed `authorization` wins the merge so it can't be clobbered.
2. **Stateless `app_key`**: caller passes `appKey` into Bill Manager invoicing inputs; optional
   `config.billManagerAppKey` fallback. No mutable client state. (Caller persists the key from optIn.)
3. **Namespaces stay flat; fold CommandID-variants into existing namespaces.** Net new top-level
   namespaces ≈3–4 (→~13 total, fine). Specifically: B2C Top Up → `b2b.topUp`, Tax Remittance →
   `b2b.remitTax` (both share the b2b endpoint + `Result` parser); B2B Express → new `express`;
   Ratiba → new `ratiba`; Bill Manager → new `billManager`. **No super-grouping** (would break the 9
   shipped namespaces — backward-compat forbids renames).
4. **Reuse `errorFromResponse`; decide the success sentinel in the resource** (the `pull.ts` pattern).
   No new error classes — `DarajaAPIError` + a per-API catalog scope suffices.
5. **New `DarajaScope` only when the success/error convention is new** (billmanager `rescode`,
   b2b-express `code`/`status`). Catalog entries added **only with a real proof ref**; unproven codes
   pass Safaricom's text verbatim.
6. **Versioning:** one **minor** per API (additive). Batch Tax Remittance + B2C Top Up into one minor
   (shared b2b path). No major bumps.

## The recipe (every API follows this)
1. `src/resources/<name>.ts` — Input/Ack types; `requireInitiator(config)` guard **iff** initiator-authed;
   build body with exact wire casing + CommandID/PartyB; `http.post(ENDPOINT, body, {retryable})`
   (`retryable:true` only for reads/registrations, omit for money-movers); check success sentinel,
   else `throw errorFromResponse({scope,...})`; return typed ack.
2. Async parser `parse<Name>Result` only if there's a `Result`/callback (reuse `ResultEnvelope` +
   `toArray` + `applyClassification`, OR a flat parser if non-standard).
3. `DarajaScope` += scope (only if new convention/proven codes); add CATALOG entries with proof.
4. Wire client.ts (import, `readonly <ns>` field, constructor binding); extend `DarajaConfig` only if a
   new credential is truly needed.
5. Barrel-export types + parsers in `index.ts`.
6. `tests/unit/<name>.test.ts` (MSW, per `b2b.test.ts`): body mapping, success, error-throw, parser,
   retry/no-retry where relevant.
7. changeset (minor).

---

## API 1 — Bill Manager  ✅ SPEC IN HAND — implement first
New file `src/resources/bill-manager.ts`; new namespace `daraja.billManager`:
`optIn, updateOptIn, sendInvoice, sendBulkInvoices, cancelInvoice, cancelBulkInvoices, acknowledgePayment`
+ standalone `parseBillManagerPayment(body)` (inbound push) + `billManagerAck()` helper (reply to push,
mirrors `c2bAccept`). 7 endpoints under `/v1/billmanager-invoice/`.
- **Auth:** OAuth Bearer; invoicing/cancel/recon also send `app_key` header (from optIn). optIn sends none.
- **Success = `rescode:"200"`** (string) — resource-local sentinel; non-200 → `errorFromResponse({scope:'billmanager', responseCode: rescode, errorMessage: resmsg ?? Status_Message, raw})`.
- **`appKey` resolution:** `input.appKey ?? config.billManagerAppKey`, else `DarajaValidationError`.
- **Reconciliation dual:** `parseBillManagerPayment` (inbound) + `acknowledgePayment` (outbound ack, 8 fields).
- **Bulk cap:** ≤1000 invoices → else `DarajaValidationError`.
- **Catalog:** add scope `billmanager`; entries `'200'` (success) + `'409'` (conflict family, proof=safaricom-docs). No new error class.
- **Config:** add optional `billManagerAppKey?: string` to `DarajaConfig` (not required-key).
- **http:** add `headers?` opt (decision #1).
- **Integration points:** `http.ts:64/72/83/93`, `result-codes.ts:27` + `~384`, `client.ts:51-71`/`~49`/`~130`/`~178`, `index.ts:~74`, new resource file.
- **Tests:** optIn body casing + returns appKey + no app_key header + 409 throw; sendInvoice sends app_key header + config fallback + missing-key throws + invoiceItems casing; bulk >1000 throws; cancel 409 surfaces errors[]; acknowledgePayment posts 8 fields; parseBillManagerPayment (object + JSON string + missing transactionId throws); billManagerAck shape; http header-forwarding (auth not overridden); catalog lookup 200/409.
- **Open item to confirm vs sandbox:** whether 409 arrives in-body (`rescode`) or as HTTP status (both already yield `DarajaAPIError`).
- Ship as its own minor.

---

## APIs 2–8 — recipe + known facts (SPEC-PENDING unless noted)

| # | API | Namespace (planned) | Endpoint | Auth | Sync ack | Async | Reuse / new | Status |
|---|-----|---------------------|----------|------|----------|-------|-------------|--------|
| 2 | **B2C Account Top Up** | `b2b.topUp` | `/mpesa/b2b/v1/paymentrequest` (SAME as b2b.pay) | initiator | `ResponseCode '0'` | `parseB2bResult` (reuse) | **all reuse** — new method only, CommandID `BusinessPayToBulk`, fixed `Sender/RecieverIdentifierType "4"`, optional `Requester`. Wire misspells `RecieverIdentifierType` | ✅ **SPEC IN HAND** (`docs/specs/b2c-account-topup.md`) + proof-grade b2b errorCode table |
| 3 | **Tax Remittance** | `b2b.remitTax` | `/mpesa/b2b/v1/remittax` (new const) | initiator | `ResponseCode '0'` | `parseB2bResult` (reuse) | new endpoint const; fixed `CommandID PayTaxToKRA`, `PartyB 572572`, `Sender/RecieverIdentifierType "4"`, `AccountReference`=KRA PRN. Wire misspells `RecieverIdentifierType` | ✅ **SPEC IN HAND** (`docs/specs/tax-remittance.md`) |
| 4 | **M-Pesa Ratiba** | `ratiba.create` | `/standingorder/v1/createStandingOrderExternal` (no `/mpesa/`) | OAuth-only | **nested `ResponseHeader.responseCode "200"`** | **nested `parseRatibaCallback`** (`responseData[]` `name`/`value`, NOT Key/Value) | new scope `ratiba`; `Frequency` 1–8 string enum; `TransactionType` 2-value enum (misspelled "Marchant"); AccountRef ≤12, TransDesc ≤13 | ✅ **SPEC IN HAND** (`docs/specs/mpesa-ratiba.md`) |
| 5 | **B2B Express Checkout** | `express.checkout` | `/v1/ussdpush/get-msisdn` | **OAuth-only** | **`code`/`status`** (not ResponseCode) | **flat `parseExpressCallback`** (top-level `resultCode`, NO `Result{}`) | new scope `b2b-express` + new sync convention + dedicated flat parser; camelCase body; gen `RequestRefID` | ✅ **SPEC IN HAND** (`docs/specs/b2b-express-checkout.md`) |
| 6 | **Business To Pochi** | `b2c.toPochi` | `/mpesa/b2pochi/v1/paymentrequest` (new const) | initiator | `ResponseCode '0'` | standard `Result` → **reuse b2c parser** | **all reuse** (b2c auth/ack/parser/scope); new method+const, CommandID `BusinessPayToPochi`, caller-supplied `OriginatorConversationID` required, optional `Occassion` (misspelled) | ✅ **SPEC IN HAND** (`docs/specs/business-to-pochi.md`) |
| 7 | **Query Org Info** | `orgInfo.query` | `/sfcverify/v1/query/info` (no `/mpesa/`) | OAuth-only | **SYNCHRONOUS inline** result; success-code conflict (`4000` vs `0`) → gate on `ResponseMessage`/`OrganizationName` | none (no callback) | new scope `orginfo`; `retryable:true` (idempotent read); IdentifierType 4/2 | ✅ **SPEC IN HAND** (`docs/specs/query-org-info.md`) — numeric success code unconfirmed, resolve at sandbox |
| 8 | **Lipa na Bonga** | `bonga.calculatePoints` + `bonga.redeem` | `/v1/lipa/na/bonga/calculate-points` (sync), `/v1/lipa/na/bonga/redeem-paybill` (async) | OAuth-only | nested `header.responseCode 200`; 200-vs-6000 split → gate on `header.responseCode`/msg | **redemption result reuses EXISTING C2B callback** (no new parser); tiny `header` reader for sync | new scope `bonga`; calc=`retryable:true`, redeem=`retryable:false` | ✅ **SPEC IN HAND** (`docs/specs/lipa-na-bonga.md`) — success-code + auth-header ambiguities, resolve at sandbox |

Notes (all specs now in hand — see per-API `docs/specs/*.md` for verbatim proof):
- **Near-free reuse (#2 TopUp, #3 Tax, #6 Pochi):** ride existing b2b/b2c auth + ack + `Result` parser + scope. New method + (sometimes) new endpoint const only. Watch the wire misspelling `RecieverIdentifierType` (#2/#3) and caller-supplied required `OriginatorConversationID` (#6).
- **#5 B2B Express — outlier**: OAuth-only, `code`/`status` ack, FLAT callback. Dedicated `parseExpressCallback`; ignore the doc's boilerplate `Result` table. New scope `b2b-express`.
- **#4 Ratiba**: path is `/standingorder/v1/createStandingOrderExternal`. Nested `ResponseHeader.responseCode "200"` ack; nested `parseRatibaCallback` over `responseData[]` (`name`/`value`). `Frequency` 1–8; `TransactionType` misspells "Marchant". New scope `ratiba`.
- **#7 Query Org Info — SYNCHRONOUS read** (`retryable:true`, no callback). ⚠️ success-code conflict `4000`(JSON) vs `0`(table) → gate on `ResponseMessage`/`OrganizationName`, confirm numeric code at sandbox. New scope `orginfo`.
- **#8 Lipa na Bonga — two endpoints**: `calculatePoints` (sync, `retryable:true`) + `redeem` (async ack, `retryable:false`). Nested `header` envelope. ⚠️ Redemption RESULT reuses the EXISTING C2B callback (no new parser). 200-vs-6000 + auth-header ambiguities → confirm at sandbox. New scope `bonga`.

## Implementation order (one PR each, highest-confidence first)
1. **Bill Manager** (spec in hand) → minor.
2. **B2C Account Top Up + Tax Remittance** (shared b2b path, no new infra) → one minor.
3. **M-Pesa Ratiba** (first OAuth-only standing order; settles the path escape-hatch).
4. **B2B Express Checkout** (new sync/async convention).
5. **Business To Pochi** → 6. **Query Org Info** → 7. **Lipa na Bonga** — as specs land (order by expected reuse).

## Per-PR verification
`pnpm test` (+ new tests green, 159 existing stay green) · `pnpm typecheck` · `pnpm lint` · `pnpm build` ·
changeset → push → CI/OIDC publish → `pnpm verify:published <ver>`. For APIs touching live money, do not
add retry on the write call (payment-safe default).

## Critical files (recurring)
`src/resources/<name>.ts` (new per API) · `src/client.ts` (namespace + config) · `src/result-codes.ts`
(scope + catalog) · `src/errors.ts` (`errorFromResponse` seam) · `src/http.ts` (headers opt — Bill Manager)
· `src/index.ts` (barrel) · `tests/unit/<name>.test.ts` · `docs/specs/<name>.md` (paste proof per API).
