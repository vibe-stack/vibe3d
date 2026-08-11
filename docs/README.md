# Axiom Relay Kit — asset bible

This directory is the production handoff for the procedural sci-fi kit. The
source inventory remains [`../prop-list.md`](../prop-list.md); this bible turns
that inventory into a coherent, agent-ready asset system.

## Start here

1. [`world/concept.md`](world/concept.md) — the shared world premise and the
   visual promise every location must keep.
2. [`world/visual-language.md`](world/visual-language.md) — shape, scale,
   composition, lighting, and faction rules.
3. [`world/material-library.md`](world/material-library.md) — canonical
   reusable materials and their authoring constraints.
4. [`world/color-system.md`](world/color-system.md) — exact color tokens,
   semantic states, contrast rules, and biome palettes.
5. [`world/production-rules.md`](world/production-rules.md) — naming, units,
   LODs, pivots, sockets, collision, and review gates.
6. [`indexes/asset-index.md`](indexes/asset-index.md) — generated map of every
   inventory item to its focused Markdown brief.
7. [`vibe3d-architecture.md`](vibe3d-architecture.md) — source-registry, CLI,
   runtime, publishing, and monorepo architecture for the Vibe3D ecosystem.

## Folder contract

Every named item in the inventory has a Markdown file. Reusable kit lives under
`assets/reusable/`; district dressing has its own family; map-specific hero
assemblies live under `assets/hero/`; marks, decals, and signage live under
`assets/graphics-signage/`. Each prop brief is paired with a same-folder
`<asset-slug>.png` reference render.

POI folders contain an assembly brief named `_assembly.md` plus one child brief
per named component. A child brief may depend on a reusable prop, a shared
material, or another child in the same POI. Those relationships are written as
links in the `Dependencies` section rather than left to inference.

## How an agent should use a brief

Read the linked world rules first, then the asset brief, then its dependency
briefs. Keep the asset's public dimensions, pivot, sockets, material IDs, and
readability state machine stable while iterating on geometry. A local detail may
be inventive; it may not introduce a new visual language.

The generated briefs are deliberately explicit about intent, construction,
materials, color roles, variants, and acceptance criteria. They are design
contracts, not claims that meshes or textures already exist.
