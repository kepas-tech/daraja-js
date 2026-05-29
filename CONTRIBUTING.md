# Contributing to daraja-js

Thanks for helping make M-Pesa integration less painful. This guide has two paths: a fast one for first-time contributors and a fuller one for regulars.

## Ground rules

- Be civil. We follow the [Code of Conduct](./CODE_OF_CONDUCT.md).
- **Never** commit real Daraja credentials, certificates (`.cer`/`.pem`), or live shortcodes. The `.gitignore` blocks the common cases; you are the last line of defense.
- Security issues do **not** go in public issues. See [SECURITY.md](./SECURITY.md).

## Developer Certificate of Origin (DCO)

We use the [DCO](https://developercertificate.org/), not a CLA. By signing off your commits you certify you wrote the code (or have the right to submit it) under the project's license.

Sign off every commit:

```bash
git commit -s -m "fix(stk): cast PartyA to JSON number"
```

This appends a `Signed-off-by: Your Name <your@email>` trailer. The name and email must match your commit author. The DCO bot blocks PRs with unsigned commits — fix with `git rebase --signoff`.

## First-time contributor

1. Find an issue tagged [`good-first-issue`](https://github.com/nellylemmy/daraja-js/labels/good-first-issue).
2. Comment to claim it.
3. Fork, branch, code, **sign off**, open a PR using the template.

## Experienced contributor

1. For non-trivial changes, open an RFC issue first (template provided) so we agree on shape before you write code.
2. Branch naming: `feat/…`, `fix/…`, `docs/…`, `chore/…`.
3. Conventional Commits enforced by commitlint.
4. A changeset is required for any user-facing change:
   ```bash
   pnpm changeset
   ```
5. Tests required. Unit tests are MSW-mocked; integration tests are `@integration`-tagged and sandbox-gated; property tests use fast-check.

## Local setup

```bash
pnpm install
pnpm test          # unit
pnpm typecheck
pnpm lint          # biome
pnpm build         # tsup → ESM + CJS + types
```

Node 22 LTS (`.nvmrc`). The published package targets Node 20+.

## What we merge

- Squash-merge only. The PR title becomes the commit — make it a clean Conventional Commit.
- Green CI (lint, typecheck, test matrix, build).
- At least one maintainer review.
- Signed commits + DCO sign-off.

## Maintenance SLA

We aim to ship a security patch within 7 days and non-security patches monthly. Daraja changes silently sometimes — if you spot drift, open an issue with the failing payload (credentials scrubbed).
