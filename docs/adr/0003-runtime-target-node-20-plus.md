# 3. Target Node 20+ and the Web platform

Date: 2026-05-29

## Status

Accepted

## Context

The SDK talks HTTP to Daraja and verifies HMAC webhook signatures. We want it to
run unchanged in Node, Bun, and edge runtimes (Cloudflare Workers), because
payment backends increasingly live at the edge. We also want zero heavyweight
HTTP dependencies after the axios supply-chain incident (2026-03).

## Decision

- Minimum runtime: **Node 20** (`engines.node: ">=20"`), developed on Node 22 LTS.
- HTTP via the **native `fetch`** API — available in all targets — not axios.
- Crypto via a thin shim: `node:crypto` `timingSafeEqual` on Node, WebCrypto
  constant-time comparison on the Web/edge. The webhook verifier ships sync
  (`constructEvent`) and async (`constructEventAsync`) variants; the async one is
  mandatory on Workers where WebCrypto is async.
- Validation via **Valibot** (~1.4 KB), not Zod (~18 KB), to stay edge-friendly.

## Consequences

- Single codebase runs in Node, Bun, and Workers.
- No axios attack surface.
- Node <20 is unsupported. Acceptable: Node 18 is EOL by the time v1.0 ships.
- The crypto shim adds a small amount of build complexity (two entry paths).
