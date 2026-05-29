#!/usr/bin/env node
// Generate docs/ERROR_CODES.md from the proven catalog (CATALOG in dist).
// Run AFTER `pnpm build`:  node tools/gen-error-codes-docs.mjs
import { writeFileSync } from 'node:fs';
import { CATALOG } from '../dist/index.js';

const SCOPES = ['stk', 'c2b', 'b2c', 'b2b', 'balance', 'status', 'reversal', 'qr', 'pull'];
const TITLE = {
  stk: 'STK Push',
  c2b: 'C2B',
  b2c: 'B2C',
  b2b: 'B2B + float transfers',
  balance: 'Account Balance',
  status: 'Transaction Status',
  reversal: 'Reversal',
  qr: 'Dynamic QR',
  pull: 'Pull Transactions',
};
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
const proofs = (p) => [...new Set(p.map((x) => x.kind))].join(', ');

let md = `# Daraja result/response codes — proven catalog

> **How to read this.** Every code below is **proven** from one of: real Safaricom
> responses observed in production (\`kepas-db\` — the meaning IS Safaricom's own
> \`ResultDesc\` text), this SDK's own code (\`sdk-code\`), kepas-pay's production
> handlers (\`kepas-prod\`), or official Safaricom docs (\`safaricom-docs\`).
> Community blogs are **not** a source.
>
> **This is not exhaustive — and cannot be.** Safaricom does not publish a complete
> error-code reference; codes arrive inline with each response. Any code NOT listed
> here is passed through by the SDK **verbatim** (Safaricom's \`ResultDesc\`, generic
> \`DarajaAPIError\`) with no fabricated meaning. The list grows as new codes are
> observed (re-run \`tools/mine-daraja-codes.sql\`).
>
> **Where these surface:** async \`resultCode\`s arrive on the parsers
> (\`parseStkCallback\`, \`parseB2cResult\`, …) as \`{ resultCode, resultDesc, meaning?,
> retriable?, terminal?, catalogued? }\`; \`errorFromResult({ scope, resultCode })\`
> turns one into a typed error; sync rejections throw via \`errorFromResponse\`.

`;

for (const scope of SCOPES) {
  const rows = CATALOG.filter((e) => e.scope === scope);
  if (!rows.length) continue;
  md += `## ${TITLE[scope]} (\`${scope}\`)\n\n`;
  md += '| Code | Kind | Success | Meaning | Retriable | Terminal | SDK error | Proof |\n';
  md += '|------|------|---------|---------|-----------|----------|-----------|-------|\n';
  for (const e of rows) {
    md += `| \`${esc(e.code)}\` | ${e.codeType} | ${e.success ? '✅' : '—'} | ${esc(e.authoredMessage ?? e.canonicalMeaning)} | ${e.retriable ? 'yes' : 'no'} | ${e.terminal ? 'yes' : 'no'} | ${e.errorClass ?? (e.success ? '—' : 'DarajaAPIError')} | ${proofs(e.proof)} |\n`;
  }
  md += '\n';
}

md += `## Codes we deliberately do NOT assert

Safaricom returns these (or they're widely cited) but we have **not** observed them
in our own traffic and they're not in our code, so the SDK does **not** invent a
meaning — it passes Safaricom's \`ResultDesc\` through verbatim:

- **STK**: 17, 26, 1001, 1019, 1025, 2001, 9999 (and any other unlisted code).
- **Dotted HTTP errorCodes** (e.g. \`500.001.1001\`, \`400.002.02\`): never observed in our logged responses — not asserted.

When you hit one, \`catalogued\` is \`false\` and \`resultDesc\` is Safaricom's exact text.
If you can prove a new code (a real response), add it to \`src/result-codes.ts\` with a proof tag.
`;

writeFileSync(new URL('../docs/ERROR_CODES.md', import.meta.url), md);
console.log(`Wrote docs/ERROR_CODES.md (${CATALOG.length} catalogued codes)`);
