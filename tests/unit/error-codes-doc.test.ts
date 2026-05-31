import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../src/result-codes.js';
// SCOPES is the render order in the ERROR_CODES.md generator. Importing it is
// side-effect-free (the generator only writes/loads dist when run as `main`).
import { SCOPES } from '../../tools/gen-error-codes-docs.mjs';

describe('ERROR_CODES.md generator scope coverage', () => {
  it('every catalogued scope is rendered by the generator (no silent omission)', () => {
    const cataloguedScopes = [...new Set(CATALOG.map((e) => e.scope))].sort();
    const missing = cataloguedScopes.filter((s) => !SCOPES.includes(s));
    expect(
      missing,
      `scopes in CATALOG but missing from the doc generator: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('the generator lists no scope that has no catalogued codes (no empty sections)', () => {
    const cataloguedScopes = new Set(CATALOG.map((e) => e.scope));
    const orphans = SCOPES.filter((s) => !cataloguedScopes.has(s));
    expect(orphans, `generator SCOPES with zero CATALOG entries: ${orphans.join(', ')}`).toEqual(
      [],
    );
  });
});
