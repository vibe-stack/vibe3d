# Production rules

These rules make the library safe for focused agents and predictable for
procedural assembly.

## Units and transform contract

- One world unit equals one metre.
- Z is forward for authored previews; Y is up.
- The pivot is at the functional ground contact or the assembly mounting
  origin. A wall pivots at its lower-left grid corner; a freestanding prop
  pivots at the centre of its footprint unless its interaction requires an
  offset.
- Dimensions in the brief are public contract values. Do not silently change
  them to make a mesh easier.
- Apply transforms before export. Keep object scale at `1,1,1` in the authored
  asset and use child transforms for articulated parts.

## Naming

Use `AXR_<FAMILY>_<ASSET>_<PART>_<STATE>`, uppercase for scene nodes and
kebab-case for files. Keep the generated `asset_id` stable even if the display
name is refined. Example: `AXR_TRAVERSAL_GRAVITY-CANNON_BARREL_ACTIVE`.

## Mesh and modularity

- Primary geometry carries the silhouette and collision.
- Secondary geometry carries service logic and can be merged or instanced.
- Tertiary geometry is decals, normal detail, bolts, labels, and controlled
  clutter. It must have a clear budget and not be required for recognition.
- Repeatable elements expose sockets named `mount_*`, `power_*`, `pipe_*`,
  `cable_*`, `door_*`, `rail_*`, `cover_*`, or `fx_*`.
- Modular architecture terminates on the 1 m grid. Hide seams with designed
  overlap, shadow gaps, trims, or access plates—not random bevels.

## Readability and collision

- Define `read_near`, `read_mid`, and `read_far` in the asset preview. At far
  read, silhouette and interaction state must survive without texture detail.
- Gameplay cover needs simple, stable collision. Decorative pipes, cables,
  foliage, and rubble should not create accidental snag surfaces.
- Openable or stateful parts need named states and a deterministic reset state.
- Every traversable edge needs a clear walkable boundary and a safety/readability
  treatment such as a rail, curb, stripe, or light.

## LOD and performance defaults

- `LOD0`: hero or close combat read; full service layer.
- `LOD1`: gameplay read; merge repeated small parts and reduce bevel segments.
- `LOD2`: silhouette read; preserve openings, major pipes, and state signal.
- `LOD3`: impostor or proxy for distant set dressing where the engine supports
  it.
- Instancing is preferred for bolts, slats, bars, crates, vegetation clusters,
  and repeated POI modules.
- Hero assemblies should document an approximate triangle budget, draw-call
  budget, and which child parts may be instanced.

## State and interaction contract

Use a named state machine where applicable: `default`, `active`, `open`,
`depleted`, `damaged`, `destroyed`, or `legacy`. State changes affect geometry,
emission, audio hooks, decals, and collision together. A prop must not show an
active cyan indicator while its interaction surface is visibly broken unless
that contradiction is intentional and documented.

## Review gate

An asset is ready for handoff only when:

- its public dimensions, pivot, sockets, states, collision, and LOD intent are
  documented;
- it uses only canonical materials and color tokens or has a linked exception;
- its ownership and location family are clear;
- it has at least one dependency link for every non-trivial shared part;
- the silhouette reads at far distance and the function reads at mid distance;
- the brief's acceptance checklist can be tested without guessing.
