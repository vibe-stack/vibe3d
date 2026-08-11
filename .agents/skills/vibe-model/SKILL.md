---
name: vibe-model
description: Preview-first reconstruction of reference-driven hard-surface props, machinery, signage, modular architecture, and hero assemblies as direct Three.js source. Use when building, revising, visually matching, previewing, or preparing a procedural hard-surface model for a Vibe3D registry. Do not use for generic Three.js application code, bitmap editing, characters, organic assets, foliage, terrain, or particle effects.
---

# Vibe Model

Build direct Three.js models with one short visual loop:

```text
model source -> deterministic preview -> independent visual critique
      ^                                      |
      `----------- highest-impact fix -------'
```

Before authoring, read both references completely:

- [fast-loop.md](references/fast-loop.md) for capture and critique;
- [modeling-rules.md](references/modeling-rules.md) for hard-surface geometry
  rules that prevent generated-looking results and wasted iterations.

## Author

Work directly in the registry model source. In this repository the canonical
sources live at `assets/prototypes/<model-id>/model.ts` and are compiled into
the Sci-Fi Kit registry. In another registry, follow its configured source
directory.

Export `createModel`. It may return a Three.js `Group` or a controller with a
stable `root`, optional `update`, semantic parts and actions, and idempotent
`dispose`. Keep preview-only scene setup in `createPreview` rather than inside
the installed model root.

Use shared primitives and material sources when they preserve the intended
shape. Keep the model small enough to understand and change in one focused
edit. Preserve physical bevel widths, clearances, sockets, pivots, semantic
part anchors, and declared configuration behavior.

## Preview

Capture as soon as the primary silhouette and major secondary masses exist:

```sh
bun run vibe:model preview \
  --module assets/prototypes/<model-id>/model.ts \
  --export createModel \
  --asset <model-id> \
  --reference <reference-image>
```

The local compatibility command `bun run asset:forge preview` may be used
during migration. Prefer `vibe:model` in new documentation and automation.

Keep the camera deterministic. Change yaw, pitch, width, height, or the preview
factory only when the reference requires it.

## Critique

Give a fresh critic only the brief, reference, and current beauty image. Ask
for a resemblance score, what reads correctly, and no more than three
prioritized fixes.

Score silhouette and proportions first, then major masses and negative space,
distinctive landmarks, material/value/color read, and detail plausibility.
Apply the highest-impact correction and capture again.

Stop at a score of 85 or higher, after two plateauing scores, or after ten
iterations. Treat a plateau as evidence to change the representation or obtain
better reference evidence.

## Deliver

Keep the accepted TypeScript source and final deterministic preview. Preserve
runtime anatomy and ownership contracts. Mark preview-only nodes with
`userData.excludeFromExport = true`.

When a GLB is requested, export the accepted model through the shared portable
GLB path so procedural wear is baked into standard PBR data. Report the model
source, final preview, iteration count, accepted score, and unresolved visual
approximations. Do not commit generated previews or GLBs unless requested.
