#!/usr/bin/env node
// Generate docs/ERROR_CODES.md from the proven catalog (CATALOG in dist).
// Run AFTER `pnpm build`:  node tools/gen-error-codes-docs.mjs
//
// `SCOPES` and `render()` are exported (and side-effect-free on import) so
// tests/unit/error-codes-doc.test.ts can assert scope coverage without building
// dist or writing the file. The dist import + file write run only as `main`.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Render order. MUST cover every DarajaScope that has CATALOG entries — the
// tests/unit/error-codes-doc.test.ts guard fails CI if a catalogued scope is missing here.
export const SCOPES = [
  'stk',
  'c2b',
  'b2c',
  'b2b',
  'balance',
  'status',
  'reversal',
  'qr',
  'pull',
  'billmanager',
  'ratiba',
  'b2bexpress',
  'bonga',
];
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
  billmanager: 'Bill Manager',
  ratiba: 'M-Pesa Ratiba (standing orders)',
  b2bexpress: 'B2B Express Checkout',
  bonga: 'Lipa na Bonga',
};
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
const proofs = (p) => [...new Set(p.map((x) => x.kind))].join(', ');

export function render(catalog) {
  let md = `# Daraja result/response codes — proven catalog

> **How to read this.** Every code below is **proven** from one of: real Safaricom
> responses observed in production (\`production-observed\` — the meaning IS
> Safaricom's own \`ResultDesc\` text), this SDK's own code (\`sdk-code\`), a
> production integration's handlers (\`production-code\`), or official Safaricom
> docs (\`safaricom-docs\`). Community blogs are **not** a source.
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
    const rows = catalog.filter((e) => e.scope === scope);
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
  return md;
}

// Side effects only when run directly (not on import).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { CATALOG } = await import('../dist/index.js');
  writeFileSync(new URL('../docs/ERROR_CODES.md', import.meta.url), render(CATALOG));
  console.log(`Wrote docs/ERROR_CODES.md (${CATALOG.length} catalogued codes)`);
}
