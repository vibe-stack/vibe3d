# Changesets

Every pull request that changes a published package should normally include a
changeset:

```bash
bun run changeset
```

Select the affected packages, choose the appropriate semantic version bump,
and write a short user-facing summary. Documentation-only and internal changes
do not require a changeset.

The Vibe3D core packages are a fixed group and always share one version.
`vibe-model` and registry packages such as `@scifi-kit/registry` version
independently.
