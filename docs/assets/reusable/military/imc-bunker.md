<!-- generated from prop-list.md; edit the source brief or generator for durable changes -->
---
asset_id: "asset.military.general.imc-bunker"
source_label: "IMC bunker"
source_section: "Reusable / military and IMC reference kit"
source_group: "General"
source_line: 437
level: L2
status: planned
place_family: "Military compounds, armories, checkpoints, and frontier bases"
owner: "Axiom Defense"
---

# IMC bunker

## Identity

- **Asset ID:** asset.military.general.imc-bunker
- **Type:** reusable military prefab assembly
- **Source:** prop-list.md:437
- **Family:** Reusable / military and IMC reference kit
- **Place family:** Military compounds, armories, checkpoints, and frontier bases
- **Owner / story role:** Axiom Defense

## Reference render

![IMC bunker reference render](imc-bunker.png)

## Intent

The **IMC bunker** is a reusable military prefab assembly for the Axiom Relay kit. It exists to support
robust defense infrastructure with clear fields of fire, access control, and repair history. Its primary read should be **IMC bunker** as a useful,
maintained, or visibly altered thing—not anonymous sci-fi decoration. At far
distance, the silhouette and mass locate it; at mid distance, the operational
face and state signal explain it; up close, the service layer rewards inspection
without changing the core language.

Keep the source label as the production name while applying the neutral Axiom Relay visual system defined in the world docs.

## Public contract

- **Blockout envelope:** 10.0 m W × 8.0 m D × 4.0 m H hardened shell; tunnel and entrance extensions snap to the 1 m grid.
- **Grid:** 1 m world unit; snap structural breaks to 0.25 m increments.
- **Pivot:** the functional ground contact or lower-left mounting corner; keep placement stable across variants.
- **Orientation:** operational/front face points toward local +Z in the preview; document any intentional radial, overhead, or mirrored placement in implementation.
- **Sockets:** Expose foundation_*, floor_*, ceiling_*, wall_*, door_bay_*, window_bay_*, roof_*, utility_*, and dressing_* sockets.
- **Read distance:** far = silhouette and footprint; mid = use, ownership, and state; near = fasteners, seams, labels, wear, and material response.
- **Collision:** keep the gameplay mass simple and stable; tertiary cables, foliage, loose debris, and clutter must not become accidental snag surfaces.

## Performance and implementation

- **LOD0:** full silhouette, service layer, articulated parts, and state signal for hero/near read.
- **LOD1:** merge small repeated parts while preserving silhouette, openings, interaction face, and signal.
- **LOD2:** keep only primary mass, cover boundary, major supports, and the state-bearing accent.
- **Instancing:** repeated bolts, slats, cables, foliage clusters, crates, panels, and sibling modules should be instanced where possible.
- **Preview:** validate in neutral light, home-map light, and a 1280×720 thumbnail so value hierarchy survives the app's current capture target.

## Visual brief

Use the small building shell as the base for a hardened IMC bunker: thick wall expression, recessed blast entrance, limited observation, protected service penetrations, and a low, defensible silhouette. The bunker skin should be a dressing layer over reusable shell connectors.

The construction follows the shared **chassis → service → signal** order.
Show load paths, vertical service routing, access clearance, roof drainage, and a clear separation between shell geometry and local dressing. Keep the strongest value break on the
operational face, frame any screen or opening with a physical bezel, and leave
negative space around the interaction point. Do not add unmotivated greebles;
each visible repetition needs a fastening, cooling, handling, safety, or
identity reason.

### State signal

Use AMBER-400 as the dominant signal token and COBALT-500 only
as support. Reinforce signal color with position, shape, label, pulse, or
material response. Place emission inside a lens, recess, tube, projector, or
screen housing; never float a bright line over an unexplained surface.

## Construction plan

1. Lay out two 4 m bays on foundation interfaces and floor slabs.
2. Close the perimeter with wall runs, corners, T-junctions, end caps, and a service spine.
3. Install door/window bays, ceiling panels, roof/floor edges, and optional roof dressing.
4. Validate empty, furnished, open-front, damaged, and stacked-floor variants.

## Component inventory

- **blocking: small building shell** — [small building shell](../architecture/building-prefab-assemblies/small-building-shell.md) — blocking shell.
- **blocking: room shell** — [room shell](../architecture/building-prefab-assemblies/room-shell.md) — interior volume.
- **blocking: exterior wall corner** — [exterior wall corner](../architecture/modular-building-connectors/exterior-wall-corner.md) — hardened outer closure.
- **blocking: door bay** — [door bay](../architecture/modular-building-connectors/door-bay.md) — blast-door opening.
- **blocking: bunker door** — [bunker door](../architecture/doors/bunker-door.md) — moving hardened closure.
- **blocking: building threshold** — [building threshold](../architecture/modular-building-connectors/building-threshold.md) — protected entry transition.
- **blocking: foundation interface** — [foundation interface](../architecture/modular-building-connectors/foundation-interface.md) — buried/base anchoring.
- **blocking: roof/floor edge module** — [roof/floor edge module](../architecture/modular-building-connectors/roof-floor-edge-module.md) — roof/earth closure.
- **optional: wall with vent** — [wall with vent](../architecture/walls/wall-with-vent.md) — protected ventilation.



## Materials and color

Use these canonical materials in descending surface importance:

- MAT-02 — [canonical definition](../../../world/material-library.md).
- MAT-04 — [canonical definition](../../../world/material-library.md).
- MAT-05 — [canonical definition](../../../world/material-library.md).
- MAT-17 — [canonical definition](../../../world/material-library.md).

Apply these exact semantic color tokens:

- dominant signal: AMBER-400;
- supporting signal: COBALT-500;
- neutral chassis: SHELL-200 or GRAPHITE-800 according to owner and place;
- service cavity: INK-950;
- identity, safety, or state graphics: MAT-17 over the correct substrate.

Never introduce a near-match hex value for a local fix. If a new role is truly
needed, update [the central color system](../../../world/color-system.md) first.

## Variants and states

1. **Default** — recognition state and public contract.
2. **Weathered / Locally Repaired** — state-bearing geometry, signal, decal, and collision change.
3. **Damaged / Service Off** — reuse the chassis with a focused dressing or service pass.

Map-specific availability belongs to the assembly brief; do not delete a reusable item because one current map no longer uses it.

## Dependencies

- **Blocking:** [world concept](../../../world/concept.md), [visual language](../../../world/visual-language.md), [production rules](../../../world/production-rules.md), and [dependency model](../../../world/dependency-model.md).
- **Materials/colors:** [material library](../../../world/material-library.md) and [color system](../../../world/color-system.md).



- **blocking component:** [small building shell](../architecture/building-prefab-assemblies/small-building-shell.md) — blocking shell.
- **blocking component:** [room shell](../architecture/building-prefab-assemblies/room-shell.md) — interior volume.
- **blocking component:** [exterior wall corner](../architecture/modular-building-connectors/exterior-wall-corner.md) — hardened outer closure.
- **blocking component:** [door bay](../architecture/modular-building-connectors/door-bay.md) — blast-door opening.
- **blocking component:** [bunker door](../architecture/doors/bunker-door.md) — moving hardened closure.
- **blocking component:** [building threshold](../architecture/modular-building-connectors/building-threshold.md) — protected entry transition.
- **blocking component:** [foundation interface](../architecture/modular-building-connectors/foundation-interface.md) — buried/base anchoring.
- **blocking component:** [roof/floor edge module](../architecture/modular-building-connectors/roof-floor-edge-module.md) — roof/earth closure.
- **optional component:** [wall with vent](../architecture/walls/wall-with-vent.md) — protected ventilation.
- No direct sibling dependency was inferred from the source label. Review the family folder before introducing a new mechanism.

## Acceptance checklist

- [ ] silhouette reads at far distance without texture detail;
- [ ] function and ownership read at mid distance;
- [ ] public envelope, pivot, sockets, and orientation are preserved;
- [ ] chassis, service, and signal layers are visibly distinct;
- [ ] only canonical MAT-* materials and color tokens are used;
- [ ] every state/variant has explicit geometry, emission, decal, and collision decisions;
- [ ] collision and LOD intent are suitable for procedural placement;
- [ ] damage or ecological contact, where relevant, has a believable cause;
- [ ] the asset works in its home place family and remains an Axiom Relay relative elsewhere.
