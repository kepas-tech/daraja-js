# Governance

## Model

`daraja-js` is **maintainer-led**. A small group of maintainers (currently the founding maintainer) sets direction, reviews contributions, and cuts releases. This is honest about the project's size — 1–2 maintainer projects that pretend to be foundations burn out.

## Roles

- **Contributor** — anyone who opens a PR, issue, or discussion. No formal status required.
- **Maintainer** — commit + merge + release rights. Added by consensus of existing maintainers after a sustained track record of quality contributions and review.

## Decisions

- Day-to-day (bug fixes, docs, small features): a maintainer reviews and merges.
- Anything that changes the public API, a dependency choice, or the security posture: open an **RFC** issue. Maintainers decide; the rationale is recorded in the issue and, if architectural, an ADR under `docs/adr/`.
- Releases follow [Changesets](https://github.com/changesets/changesets) + SemVer. Breaking changes require a major bump and a migration note.

## Transition path

If the project outgrows maintainer-led governance (multiple active orgs depending on it, several full-time maintainers), we will adopt a documented steering-committee model and move it under a neutral home. We will not pretend to be there before we are.

## Code of Conduct enforcement

Maintainers enforce the [Code of Conduct](./CODE_OF_CONDUCT.md). Reports go to nelsonlemmy61@gmail.com.
