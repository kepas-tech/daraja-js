# Security Policy

`daraja-js` sits in a payment path. We take vulnerabilities seriously.

## Reporting a vulnerability

**Do not open a public issue for security problems.**

Use GitHub's [private vulnerability reporting](https://github.com/nellylemmy/daraja-js/security/advisories/new) (Security tab → Report a vulnerability), or email **nelsonlemmy61@gmail.com** with `[SECURITY]` in the subject.

Include: affected version, a reproduction (credentials scrubbed), and impact. PGP key fingerprint will be published here before v1.0.

## Response SLA

| Severity | Acknowledge | Fix target |
|----------|-------------|-----------|
| Critical (credential leak, RCE, signature bypass) | 24 h | 7 days |
| High (auth weakness, injection) | 48 h | 14 days |
| Medium / Low | 5 days | next minor |

We credit reporters in the advisory unless you ask otherwise.

## Scope

In scope:
- The SDK source under `src/`.
- The webhook signature verifier (`webhooks.constructEvent` / `constructEventAsync`).
- The security-credential generator (`generateSecurityCredential`).
- Published npm artifacts and their provenance.

Out of scope:
- Safaricom's Daraja API itself — report those to Safaricom.
- Misconfiguration in your own deployment (e.g. committing your `.env`).
- Vulnerabilities in transitive deps with no exploit path through the SDK (report upstream; we'll bump).

## Hard rules baked into the SDK

- Webhook signatures verified over **raw body bytes** with constant-time comparison and a replay window.
- We ship **no** Safaricom certificates and **no** credentials.
- Telemetry is off; the SDK makes no network calls except to Safaricom.

## Supported versions

Until v1.0, only the latest release receives fixes. A formal support matrix lands with v1.0.
