# Vibe3D

Vibe3D is a source-first model registry for Three.js. It installs models,
materials, and their small runtime helpers directly into an application's
codebase, where they can be inspected, configured, and changed without an
opaque package boundary.

Sci-Fi Kit is the first reference library. The registry is deliberately open:
independent authors can publish compatible kits through npm or host the same
manifest from another source.

## Try the workspace

Requires Bun 1.3+ and Node.js 22.12+.

```bash
bun install
bun run dev
```

The docs app opens the model catalog and gives every model its own interactive
Three.js preview. The model viewport contains a portable GLB export action.

## CLI

```bash
bunx vibe3d init
bunx vibe3d add @scifi-kit/modular-wall
bunx vibe3d add @scifi-kit
```

`init` writes `models.json` and the shared ownership contracts. `add` resolves
registry dependencies, preserves locally edited files by default, and records
the installed source hashes in `models.lock.json`.

Useful inspection commands:

```bash
bunx vibe3d view @scifi-kit/modular-wall
bunx vibe3d list wall
bunx vibe3d diff
bunx vibe3d doctor
bunx vibe3d registry validate ./registry.json
```

## Model authoring skill

Install the preview-first hard-surface modeling workflow into a project:

```bash
bunx vibe-model
# npm works too
npx vibe-model
```

The local workspace keeps the canonical skill at
`.agents/skills/vibe-model`. The published package bundles the same files, so
the install does not depend on this repository layout.

## Workspace

```text
apps/docs/                 Vite, React, TypeScript, and Tailwind docs site
packages/cli/              vibe3d command-line interface
packages/registry/         registry loading, dependency resolution, installer
packages/schema/           models.json, registry, and lock schemas
packages/vibe-model/       distributable model-authoring skill installer
registries/scifi-kit/      first-party registry builder and npm package
assets/prototypes/         canonical Sci-Fi Kit model sources
src/asset-forge/generator/ shared primitives, materials, batching, and GLB
```

The complete system design is in
[`docs/vibe3d-architecture.md`](docs/vibe3d-architecture.md). The Sci-Fi Kit
asset bible starts at [`docs/README.md`](docs/README.md).

## Build and verify

```bash
bun run build
bun run typecheck
bun test
```

## Releases

Published packages are versioned and released with Changesets. Add release
intent alongside a package change with:

```bash
bun run changeset
```

The release workflow maintains a version pull request and publishes packages
in dependency order after that pull request is merged. See
[`docs/releases.md`](docs/releases.md) for the one-time npm setup and the full
maintainer workflow.

All Vibe3D packages and the Sci-Fi Kit registry are released under the MIT
License.
