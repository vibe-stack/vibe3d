# Changesets

Every pull request that changes a published package should normally include a
changeset:

```bash
bun run changeset
```

Select the affected packages, choose the appropriate semantic version bump,
and write a short user-facing summary. Documentation-only and internal changes
do not require a changeset.

The published Vibe3D packages are a fixed group and always share one version.
Any changeset for one package advances the complete release train together.
