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

## Check

Before each critique:

```sh
node --import tsx scripts/coplanar-check.ts <model-id>
```

It fails on visible faces sharing a plane and facing the same way. That
z-fights, and neither a still nor a critic will name it. Coincidence buried
inside another solid is not reported. Fix per rule 9 in
[modeling-rules.md](references/modeling-rules.md).

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

A score is not an acceptance. The critique measures resemblance to the
reference and is blind to everything else: parts seated on the wrong plane,
geometry left floating in front of a face, coincident faces tearing, extents
carried over from an earlier revision. Ask the critic to list modelling
errors separately from resemblance gaps, with a location for each; unprompted
it scores only likeness. Register the model in the browser registry and put the render and the
live URL in front of the requester before calling it done, and say what you
approximated. Their look is the acceptance; the score only decides when to stop
iterating.

## Deliver

Keep the accepted TypeScript source and final deterministic preview. Preserve
runtime anatomy and ownership contracts. Mark preview-only nodes with
`userData.excludeFromExport = true`.

When a GLB is requested, export the accepted model through the shared portable
GLB path so procedural wear is baked into standard PBR data. Report the model
source, final preview, iteration count, accepted score, and unresolved visual
approximations. Do not commit generated previews or GLBs unless requested.
