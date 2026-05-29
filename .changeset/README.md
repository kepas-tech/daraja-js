# Changesets

This folder holds [changesets](https://github.com/changesets/changesets): small
markdown files describing user-facing changes and their semver bump.

Add one for any change that affects published behavior:

```bash
pnpm changeset
```

On release, `changeset version` consumes these files to bump the version and
update `CHANGELOG.md`, and `changeset publish` pushes to npm via OIDC Trusted
Publishing (no `NPM_TOKEN`).
