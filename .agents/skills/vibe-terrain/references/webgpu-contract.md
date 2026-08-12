# WebGPU source and compiled-topology contract

## Representation boundary

The source path owns field evaluation, dense reference extraction, topology
repair, reduction, stable IDs, LODs, collision, high-to-low baking, and
materialization. The compiled path owns only reusable, fingerprinted compiler
outputs.

Both paths must produce the same public terrain instance shape and stable root.

Use `createTerrainAsset` from `@vibe3djs/terrain` to resolve:

```text
auto + matching bundled topology -> materialize
auto + matching local topology   -> materialize
auto + no valid topology         -> source build, then cache if supplied
compiled + no valid topology     -> fail
source                           -> source build
```

`bypass` ignores compiled data. `refresh` generates from source and replaces the
local cache. Reject fingerprint mismatches instead of choosing a nearby cache.

## Compiled contents

Include:

- normalized domain coordinates;
- game-ready triangle connectivity;
- stable vertex IDs;
- triangle adjacency when needed;
- LOD index buffers and geometric error;
- collision indices;
- deformation bounds and validation claims;
- asset, topology, recipe, compiler, and profile fingerprints.

Exclude final world-space positions, final normals, texture pixels, material
values, Three.js objects, and interchange scene formats such as GLB.

That exclusion applies to the topology artifact. A sibling compiled-surface
artifact may contain derived high-to-low texture pixels when its bake domain,
channel semantics, resolution, source recipe hash, compiler hash, topology key,
profile, and seed identity are explicit. Treat it as disposable acceleration
data, never as the source asset. Runtime-generated transient textures remain a
valid cache policy when persistent bake pages are undesirable.

Use Three.js `StorageBufferAttribute` or equivalent storage nodes to materialize
positions and derived attributes with `WebGPURenderer`. Keep the topology cache
runtime-neutral so a worker or CPU fallback can decode and inspect it.

## Registry

Use a schema-v2 `vibe3d:model` item. Put editable recipes and runtime code in
`files`; put encoded topology in `artifacts`; declare `representations.source`
and one or more `representations.compiled` entries. Set WebGPU/TSL capabilities
on the representation that needs them instead of forcing them onto every
possible representation.

The source recipe is mandatory. A compiled representation must reference an
artifact in the same item and must use format `vibe3d-topology@1`.

Compiled artifacts are integrity-checked and replaceable. Editable source keeps
the existing consumer-change protection. A schema-v1 Sci-Fi registry has no
artifacts or representation metadata and remains valid without migration.
