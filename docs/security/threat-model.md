# Threat Model

Scope: the `daraja-js` SDK as a library embedded in a consumer's payment backend.
The consumer's deployment, Safaricom's infrastructure, and the network between
them are out of scope except where the SDK can defend the boundary.

## Assets

- **Daraja credentials** — consumer key/secret, passkey, initiator password,
  security credential. Compromise = attacker can move money.
- **Webhook secret** — HMAC key. Compromise = attacker can forge callbacks.
- **In-flight payment data** — MSISDNs, amounts, receipts (PII + financial).

## Trust boundaries

1. Consumer app ⇄ SDK (in-process — trusted).
2. SDK ⇄ Safaricom Daraja (TLS, OAuth bearer).
3. Safaricom ⇄ consumer's webhook endpoint (the SDK verifies this).

## Threats & mitigations

| Threat | Mitigation in the SDK |
|--------|----------------------|
| Forged webhook ("fake payment confirmed") | HMAC-SHA256 over **raw body**, constant-time compare, replay window. Verify before trusting any callback. |
| Timing attack on signature compare | `timingSafeEqual` / WebCrypto constant-time path. |
| Credential leak via logs | PII scrubber for log lines; secrets never logged by the SDK. |
| Credential leak via repo | `.gitignore` blocks `.env`, `*.cer`, `*.pem`, `*.key`. CONTRIBUTING + PR checklist reinforce. |
| Supply-chain (malicious dep) | Minimal deps (Valibot only at runtime), Dependabot, gitleaks, Semgrep, CodeQL, SBOM, npm provenance. |
| Duplicate processing from callback retries | Idempotency support + guidance to always return 200 and dedupe on `originatorConversationId`. |
| Replay of a captured callback | Timestamp tolerance window (default 300s), rejected if stale. |
| MITM | TLS enforced; HTTP upgraded to HTTPS; no plaintext endpoints. |

## Explicit non-goals

- The SDK cannot protect a consumer who commits their `.env`.
- The SDK does not store credentials — that is the consumer's responsibility.
- We do not defend against a compromised Safaricom (out of scope).
