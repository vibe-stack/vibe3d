---
name: vibe-terrain
description: Preview-first authoring of deterministic procedural terrain for Three.js WebGPU and Vibe3D registries, including SDF or field-generated rocks, cliffs, caves, ground patches, formations, topology caches, LODs, collision, and biome-aware TSL materials. Use when building, revising, validating, cataloguing, or packaging terrain generators and natural hard-organic assets. Do not use for hard-surface props, characters, vegetation systems, generic Three.js applications, or bitmap-only terrain.
---

# Vibe Terrain

Build terrain from authoritative recipes and disposable compiled topology:

```text
terrain brief -> source recipe -> deterministic multi-seed preview
      ^                                  |
      `---- geological + technical QA ---'

source recipe -> topology compiler -> game-ready topology cache
      |                                      |
      `---------- fallback ------------------'
```

Before authoring, read:

- [terrain-rules.md](references/terrain-rules.md) for field, topology, LOD,
  collision, and material rules;
- [catalogue-schema.md](references/catalogue-schema.md) when defining or
  revising catalogue entries;
- [webgpu-contract.md](references/webgpu-contract.md) when implementing source,
  compiled-topology, cache, or registry behavior;
- [preview-loop.md](references/preview-loop.md) before capture and critique.

## Author

Work in the terrain registry's configured source directory. Keep the recipe,
topology identity, material response, and public runtime contract in source.
Treat a compiled topology cache as reproducible acceleration data, never as the
authoritative asset.

Separate configuration into:

- topology-affecting parameters such as holes, component count, formation,
  major fractures, and chunk connectivity;
- topology-preserving variation such as bounded warp, fine erosion, deposits,
  moisture, snow, moss, and material response.

Derive `topologyKey` only from the first group plus the compiler and LOD
profile. Keep the random seed in variation unless the recipe proves that it can
change connectivity.

Use `@vibe3djs/terrain` for compiled-topology validation, encoding, cache
identity, representation selection, and source fallback. Return the same stable
model instance contract from both paths.

## Generate

Implement the simplest representation that preserves the formation:

- deformable shell for boulders and closed rocks;
- heightfield patch for open ground without overhangs;
- chunked dual contouring for caves, arches, cliffs, and arbitrary SDFs;
- swept volume for tubes, roots, stalactites, and flow forms;
- instanced scatter for scree, pebbles, and repeated fragments.

Evaluate macro structure before adding noise. Use noise to express a named
process at a declared physical scale. Generate or validate topology before
procedural texturing. Keep source generation deterministic for the same recipe,
configuration, seed, compiler version, and profile.

## Compile

Compile connectivity, normalized domain coordinates, stable vertex IDs,
adjacency, LOD index buffers, chunk seams, and collision indices. Do not cache
final world-space positions, final normals, textures, material values, scene
objects, or GLB files.

Declare a bounded deformation envelope. Reject a cache if its asset ID,
`topologyKey`, recipe hash, compiler hash, or profile differs from the request.
In `auto` mode, materialize a compatible cache; otherwise generate from source
and optionally refresh the cache. Never approximate an incompatible request
with the nearest cached topology.

## Preview and critique

Capture at least three deterministic seeds in neutral light, one biome context,
and the declared LODs. Include a wireframe or topology diagnostic separately
from beauty images.

Critique geological structure first, then silhouette and negative space,
feature-scale hierarchy, contact and placement, material response, topology,
LOD behavior, and performance. Apply the highest-impact correction and repeat.

Accept only when the formation remains recognizable across the tested seeds and
the compiled cache passes game-ready validation. Stop after acceptance, two
plateauing critiques, or ten visual iterations; a plateau requires a better
representation or stronger reference evidence.

## Deliver

Keep:

- the source recipe and typed configuration;
- the catalogue entry and reference evidence;
- the final deterministic preview matrix;
- the reproducible compiled-topology artifact when requested by the registry;
- validation results, performance budgets, compiler fingerprint, and tested
  seed range.

Report unresolved geological approximations and any parameter that invalidates
the topology cache. Do not deliver a compiled cache without its source recipe.
