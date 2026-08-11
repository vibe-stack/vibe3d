# Releases

Vibe3D uses Bun workspaces for development and Changesets for package versions,
changelogs, dependency-aware publishing, and GitHub release pull requests.

## Package groups

The Vibe3D core is a fixed group. A release of any package in the group bumps
and publishes all of them at the same version:

- `@vibe3djs/schema`
- `@vibe3djs/registry-sdk`
- `@vibe3djs/registry`
- `@vibe3djs/conformance`
- `vibe3d`

`vibe-model`, `@scifi-kit/registry`, and future third-party registries are
independently versioned.

The repository root and `@vibe3djs/docs` are private and are never published.

## Recording a change

Run this while the change is still fresh:

```bash
bun run changeset
```

Select every affected public package, choose `patch`, `minor`, or `major`, and
write a concise user-facing summary. Commit the generated `.changeset/*.md`
file with the implementation.

Changes that cannot affect a published package, such as internal documentation
maintenance, do not need a changeset.

## Automated release flow

After a changeset reaches `main`, `.github/workflows/release.yml` creates or
updates a `Version Packages` pull request. That pull request contains the
calculated versions, internal dependency updates, and changelogs.

Merging the version pull request runs the workflow again. With no pending
changesets left, it builds and verifies the repository, publishes every
unpublished package in dependency order, creates npm provenance, tags the
release, and creates GitHub releases.

The workflow is guarded by the repository variable
`NPM_PUBLISHING_ENABLED=true`. Leave it unset until the npm scopes and trusted
publishers are ready.

## One-time npm setup

1. Create or obtain access to the `@vibe3d` and `@scifi-kit` organizations on
   npm and enable two-factor authentication.
2. Push this repository to GitHub and enable **Allow GitHub Actions to create
   and approve pull requests** under Actions settings.
3. Upgrade the local release environment to Node.js 22.12 or newer.
4. Sign in with `npm login` and perform the initial release from a clean `main`
   checkout with `bun run release`. Changesets publishes all currently
   unpublished packages in dependency order.
5. In the npm settings for each published package, add this repository and
   `.github/workflows/release.yml` as its trusted GitHub Actions publisher.
6. Add the GitHub repository variable `NPM_PUBLISHING_ENABLED` with the value
   `true`.

After trusted publishing is configured, do not add an `NPM_TOKEN` secret. The
workflow obtains a short-lived npm credential through GitHub OIDC.

## Local commands

```bash
# Record release intent
bun run changeset

# Preview the pending release plan
bun run changeset:status

# Apply versions and changelogs locally
bun run version-packages

# Build, typecheck, and test without publishing
bun run release:check

# Query npm and preview the dependency-aware publish plan
bun run release:plan

# Publish all unpublished packages (maintainers only)
bun run release
```

`bun run version-packages` consumes pending changesets. Normally the GitHub
release workflow owns that command; use it locally only when deliberately
performing a manual release.
