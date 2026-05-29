# 2. License the SDK under Apache 2.0

Date: 2026-05-29

## Status

Accepted

## Context

The SDK is meant for maximum adoption — anyone integrating M-Pesa should be able
to depend on it without legal friction, including in commercial and closed-source
products. We considered MIT, Apache 2.0, and BSL.

A payment SDK carries patent risk: a contributor could later assert a patent over
a contributed algorithm. MIT has no patent grant. BSL is source-available, not
open-source, and would suppress adoption of a foundational dependency.

## Decision

License `daraja-js` under **Apache License 2.0**. Contributions are accepted
under the **DCO** (not a CLA), licensed under Apache 2.0.

The companion dashboard `daraja-studio` is licensed separately under BSL 1.1
(see that repo's ADR 0004). The two licensing models are deliberately decoupled.

## Consequences

- Universal adoption — Apache 2.0 is on every corporate allowlist.
- Explicit patent grant protects users from contributor patent claims.
- We forgo the ability to monetize the SDK by relicensing; monetization, if any,
  happens around `daraja-studio`.
- `NOTICE` must be preserved by redistributors.
