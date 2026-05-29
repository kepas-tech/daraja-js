# Daraja result/response codes — proven catalog

> **How to read this.** Every code below is **proven** from one of: real Safaricom
> responses observed in production (`kepas-db` — the meaning IS Safaricom's own
> `ResultDesc` text), this SDK's own code (`sdk-code`), kepas-pay's production
> handlers (`kepas-prod`), or official Safaricom docs (`safaricom-docs`).
> Community blogs are **not** a source.
>
> **This is not exhaustive — and cannot be.** Safaricom does not publish a complete
> error-code reference; codes arrive inline with each response. Any code NOT listed
> here is passed through by the SDK **verbatim** (Safaricom's `ResultDesc`, generic
> `DarajaAPIError`) with no fabricated meaning. The list grows as new codes are
> observed (re-run `tools/mine-daraja-codes.sql`).
>
> **Where these surface:** async `resultCode`s arrive on the parsers
> (`parseStkCallback`, `parseB2cResult`, …) as `{ resultCode, resultDesc, meaning?,
> retriable?, terminal?, catalogued? }`; `errorFromResult({ scope, resultCode })`
> turns one into a typed error; sync rejections throw via `errorFromResponse`.

## STK Push (`stk`)

| Code | Kind | Success | Meaning | Retriable | Terminal | SDK error | Proof |
|------|------|---------|---------|-----------|----------|-----------|-------|
| `0` | resultCode | ✅ | Payment received. | no | yes | — | kepas-db |
| `1` | resultCode | — | The customer has insufficient M-Pesa balance (and no Fuliza). Ask them to top up and retry. | yes | no | DarajaInsufficientFundsError | kepas-prod, sdk-code |
| `1032` | resultCode | — | The customer dismissed the STK prompt. | yes | no | DarajaCancelledError | kepas-db |
| `1037` | resultCode | — | The customer didn't respond to the STK prompt within ~60s — phone off, out of network, or prompt ignored. Ask them to retry. | yes | no | DarajaUserUnreachableError | kepas-db |

## C2B (`c2b`)

| Code | Kind | Success | Meaning | Retriable | Terminal | SDK error | Proof |
|------|------|---------|---------|-----------|----------|-----------|-------|
| `0` | c2bReply | ✅ | Accept the payment. | no | yes | — | sdk-code |
| `C2B00011` | c2bReply | — | Reject: invalid MSISDN. | no | no | DarajaAPIError | sdk-code |
| `C2B00012` | c2bReply | — | Reject: invalid account number. | no | no | DarajaAPIError | sdk-code |
| `C2B00013` | c2bReply | — | Reject: invalid amount. | no | no | DarajaAPIError | sdk-code |
| `C2B00016` | c2bReply | — | Reject: other. | no | no | DarajaAPIError | sdk-code |

## B2C (`b2c`)

| Code | Kind | Success | Meaning | Retriable | Terminal | SDK error | Proof |
|------|------|---------|---------|-----------|----------|-----------|-------|
| `0` | resultCode | ✅ | Payout completed. | no | yes | — | kepas-db |
| `1` | resultCode | — | Your Utility (B2C) account has insufficient funds. Top it up (B2B transfer Working→Utility) and retry. | yes | no | DarajaInsufficientFundsError | kepas-db |
| `2` | resultCode | — | Amount is below M-Pesa’s minimum for this payout. Increase the amount. | no | no | DarajaAPIError | kepas-db |

## B2B + float transfers (`b2b`)

| Code | Kind | Success | Meaning | Retriable | Terminal | SDK error | Proof |
|------|------|---------|---------|-----------|----------|-----------|-------|
| `0` | resultCode | ✅ | Transfer completed. | no | yes | — | kepas-db |
| `1` | resultCode | — | The sending (Working) account has insufficient funds. Fund it and retry. | yes | no | DarajaInsufficientFundsError | kepas-db |
| `21` | resultCode | — | The initiator is not permitted to perform this B2B/float operation. Check the initiator name + its role/permissions on the M-Pesa org portal. | no | no | DarajaAPIError | kepas-db |
| `SFC_IC0003` | resultCode | — | The receiver is invalid — wrong destination shortcode, or wrong ReceiverIdentifierType for the CommandID (PayBill=4, BuyGoods=2). | no | no | DarajaAPIError | kepas-db |

## Account Balance (`balance`)

| Code | Kind | Success | Meaning | Retriable | Terminal | SDK error | Proof |
|------|------|---------|---------|-----------|----------|-----------|-------|
| `0` | resultCode | ✅ | Balance query completed. | no | yes | — | kepas-db |

## Transaction Status (`status`)

| Code | Kind | Success | Meaning | Retriable | Terminal | SDK error | Proof |
|------|------|---------|---------|-----------|----------|-----------|-------|
| `0` | resultCode | ✅ | Status query completed. | no | yes | — | kepas-db |
| `25` | resultCode | — | Daraja rejected the status query — a required parameter was missing or malformed (commonly the transaction id or IdentifierType). Check the query inputs. | no | no | DarajaAPIError | kepas-db |

## Reversal (`reversal`)

| Code | Kind | Success | Meaning | Retriable | Terminal | SDK error | Proof |
|------|------|---------|---------|-----------|----------|-----------|-------|
| `0` | resultCode | ✅ | Reversal completed. | no | yes | — | kepas-db |

## Dynamic QR (`qr`)

| Code | Kind | Success | Meaning | Retriable | Terminal | SDK error | Proof |
|------|------|---------|---------|-----------|----------|-----------|-------|
| `00` | responseCode | ✅ | QR generated. | no | yes | — | sdk-code |

## Pull Transactions (`pull`)

| Code | Kind | Success | Meaning | Retriable | Terminal | SDK error | Proof |
|------|------|---------|---------|-----------|----------|-----------|-------|
| `1000` | pullStatus | ✅ | Pull callback URL registered. | no | yes | — | sdk-code |
| `1001` | pullStatus | ✅ | Pull callback URL was already registered (no change needed). | no | yes | — | sdk-code |

## Codes we deliberately do NOT assert

Safaricom returns these (or they're widely cited) but we have **not** observed them
in our own traffic and they're not in our code, so the SDK does **not** invent a
meaning — it passes Safaricom's `ResultDesc` through verbatim:

- **STK**: 17, 26, 1001, 1019, 1025, 2001, 9999 (and any other unlisted code).
- **Dotted HTTP errorCodes** (e.g. `500.001.1001`, `400.002.02`): never observed in our logged responses — not asserted.

When you hit one, `catalogued` is `false` and `resultDesc` is Safaricom's exact text.
If you can prove a new code (a real response), add it to `src/result-codes.ts` with a proof tag.
