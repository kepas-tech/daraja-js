# OWASP ASVS Self-Assessment

Self-assessment against [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)
for the parts of the standard that apply to a client SDK (not a full web app).
Target level: **L2** for the security-relevant surface. This is a living document;
it will be completed before v1.0 and re-checked at each release.

Legend: ✅ met · 🚧 in progress · ➖ not applicable to a library

| ASVS area | Status | Notes |
|-----------|--------|-------|
| V2 Authentication | ➖ | SDK consumes Daraja OAuth; does not implement user auth. |
| V3 Session management | ➖ | No sessions in a library. |
| V6 Cryptography | 🚧 | HMAC-SHA256 webhook verify, constant-time compare, RSA-PKCS1-v1.5 for security credential. No weak primitives. |
| V7 Error handling & logging | 🚧 | Typed error hierarchy; PII scrubber for logs; no secret in error messages. |
| V8 Data protection | 🚧 | Credentials never persisted by the SDK; PII scrubbing helpers provided. |
| V9 Communications | 🚧 | TLS only; HTTP upgraded to HTTPS; no plaintext endpoints. |
| V11 Business logic | 🚧 | Idempotency, replay window, callback-200 guidance. |
| V12 Files & resources | ➖ | No file uploads. Certificate read is consumer-supplied path. |
| V14 Configuration | 🚧 | Config validated at construction; warns on common misconfig (B2C float). |

## How to contribute to this assessment

If you find a gap, open an RFC (not a public security issue for live vulns —
see [SECURITY.md](../../SECURITY.md)). Each ✅ must point at the code and test
that backs it before v1.0.
