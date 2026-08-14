# vibe-model

Install the Vibe Model skill for preview-first, reference-driven Three.js asset
creation.

```bash
bunx vibe-model
# or
npx vibe-model
```

Install globally into your Codex skills directory with:

```bash
bunx vibe-model --global
```

## Use it in an empty Three.js project

The package installs instructions for Codex. It does not add Three.js, generate
a model by itself, or add a preview runner to `package.json`.

Create a project and install the skill locally:

```bash
mkdir cargo-viewer
cd cargo-viewer
bun create vite . --template vanilla-ts
bun install
bun add three
bunx vibe-model
```

This creates `.agents/skills/vibe-model`. Then ask Codex to use the installed
skill and describe the asset, scale, behavior, source path, and references:

```text
Use vibe-model to build a weathered sci-fi cargo crate.
Put it at src/models/cargo-crate/model.ts and export createModel.
Keep the root stable, expose a lid anchor, and wire a preview into this app.
Use the attached front and three-quarter reference images.
```

Run the Vite app for the visual loop:

```bash
bun run dev
```

The generated model is direct Three.js source. `createModel` returns a `Group`
or a controller with a stable `root`, optional `update`, semantic parts and
actions, and `dispose`.

The Vibe3D repository also has a deterministic `bun run vibe:model preview`
command. That runner is part of the repository authoring workspace and is not
installed into an external project by `bunx vibe-model`; use the project's Vite
preview unless a compatible capture runner has been added separately.

Verify the package bundle or replace an existing local installation with:

```bash
bunx vibe-model doctor
bunx vibe-model --force
```

Released under the MIT License.
