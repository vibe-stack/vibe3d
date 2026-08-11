<!-- generated from prop-list.md; edit the source brief or generator for durable changes -->
---
asset_id: "asset.e-district-dressing.general.boutique-facade"
source_label: "boutique facade"
source_section: "Reusable / E-District urban dressing"
source_group: "General"
source_line: 545
level: L2
status: planned
place_family: "Dense nightlife, market, residential, and cyber-urban streets"
owner: "Local / reclaimed urban operators"
---

# boutique facade

## Identity

- **Asset ID:** asset.e-district-dressing.general.boutique-facade
- **Type:** reusable themed facade assembly
- **Source:** prop-list.md:545
- **Family:** Reusable / E-District urban dressing
- **Place family:** Dense nightlife, market, residential, and cyber-urban streets
- **Owner / story role:** Local / reclaimed urban operators

## Reference render

![boutique facade reference render](boutique-facade.png)

## Intent

The **boutique facade** is a reusable themed facade assembly for the Axiom Relay kit. It exists to support
social, layered, high-density dressing with a controlled night palette and strong wayfinding. Its primary read should be **boutique facade** as a useful,
maintained, or visibly altered thing—not anonymous sci-fi decoration. At far
distance, the silhouette and mass locate it; at mid distance, the operational
face and state signal explain it; up close, the service layer rewards inspection
without changing the core language.

Keep the source label as the production name while applying the neutral Axiom Relay visual system defined in the world docs.

## Public contract

- **Blockout envelope:** 6.0 m W × 1.0 m D × 4.0 m H frontage shell; supports 1 m-grid depth extensions.
- **Grid:** 1 m world unit; snap structural breaks to 0.25 m increments.
- **Pivot:** the functional ground contact or lower-left mounting corner; keep placement stable across variants.
- **Orientation:** operational/front face points toward local +Z in the preview; document any intentional radial, overhead, or mirrored placement in implementation.
- **Sockets:** Expose floor_*, wall_*, door_bay_*, window_bay_*, sign_*, awning_*, service_*, and lighting_* sockets.
- **Read distance:** far = silhouette and footprint; mid = use, ownership, and state; near = fasteners, seams, labels, wear, and material response.
- **Collision:** keep the gameplay mass simple and stable; tertiary cables, foliage, loose debris, and clutter must not become accidental snag surfaces.

## Performance and implementation

- **LOD0:** full silhouette, service layer, articulated parts, and state signal for hero/near read.
- **LOD1:** merge small repeated parts while preserving silhouette, openings, interaction face, and signal.
- **LOD2:** keep only primary mass, cover boundary, major supports, and the state-bearing accent.
- **Instancing:** repeated bolts, slats, cables, foliage clusters, crates, panels, and sibling modules should be instanced where possible.
- **Preview:** validate in neutral light, home-map light, and a 1280×720 thumbnail so value hierarchy survives the app's current capture target.

## Visual brief

Use the storefront facade shell as the structural host, then apply the named local identity as a restrained dressing pass: boutique facade. Keep doors, glazing, service access, fascia, awning, and sign sockets compatible with the shared shell.

The construction follows the shared **chassis → service → signal** order.
Show the shop threshold, utility entry, ventilation, sign power route, glazing replacement logic, and attachment faces for awnings and shutters. Keep the strongest value break on the
operational face, frame any screen or opening with a physical bezel, and leave
negative space around the interaction point. Do not add unmotivated greebles;
each visible repetition needs a fastening, cooling, handling, safety, or
identity reason.

### State signal

Use MAGENTA-400 as the dominant signal token and CYAN-400 only
as support. Reinforce signal color with position, shape, label, pulse, or
material response. Place emission inside a lens, recess, tube, projector, or
screen housing; never float a bright line over an unexplained surface.

## Construction plan

1. Block the floor strip, wall frame, fascia, and standard storefront depth.
2. Install window bays, door bay, threshold, service panel, and sign/awning sockets.
3. Validate all named storefront dressing variants without changing the shell contract.

## Component inventory

- **blocking: floor slab tile** — [floor slab tile](../architecture/modular-building-connectors/floor-slab-tile.md) — shop floor/sidewalk transition.
- **blocking: wall 4 m** — [wall 4 m](../architecture/walls/wall-4-m.md) — frontage frame.
- **blocking: window bay** — [window bay](../architecture/modular-building-connectors/window-bay.md) — glazed display opening.
- **blocking: door bay** — [door bay](../architecture/modular-building-connectors/door-bay.md) — shop entry.
- **blocking: building threshold** — [building threshold](../architecture/modular-building-connectors/building-threshold.md) — public entry transition.
- **blocking: ceiling slab panel** — [ceiling slab panel](../architecture/modular-building-connectors/ceiling-slab-panel.md) — interior overhead closure.
- **blocking: roof/floor edge module** — [roof/floor edge module](../architecture/modular-building-connectors/roof-floor-edge-module.md) — fascia and upper edge.
- **blocking: foundation interface** — [foundation interface](../architecture/modular-building-connectors/foundation-interface.md) — street/building contact.
- **optional: storefront glazing** — [storefront glazing](../architecture/windows/storefront-glazing.md) — display insert.
- **optional: shop shutter** — [shop shutter](./shop-shutter.md) — closed-state dressing.



## Materials and color

Use these canonical materials in descending surface importance:

- MAT-06 — [canonical definition](../../../world/material-library.md).
- MAT-08 — [canonical definition](../../../world/material-library.md).
- MAT-09 — [canonical definition](../../../world/material-library.md).
- MAT-17 — [canonical definition](../../../world/material-library.md).

Apply these exact semantic color tokens:

- dominant signal: MAGENTA-400;
- supporting signal: CYAN-400;
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



- **blocking component:** [floor slab tile](../architecture/modular-building-connectors/floor-slab-tile.md) — shop floor/sidewalk transition.
- **blocking component:** [wall 4 m](../architecture/walls/wall-4-m.md) — frontage frame.
- **blocking component:** [window bay](../architecture/modular-building-connectors/window-bay.md) — glazed display opening.
- **blocking component:** [door bay](../architecture/modular-building-connectors/door-bay.md) — shop entry.
- **blocking component:** [building threshold](../architecture/modular-building-connectors/building-threshold.md) — public entry transition.
- **blocking component:** [ceiling slab panel](../architecture/modular-building-connectors/ceiling-slab-panel.md) — interior overhead closure.
- **blocking component:** [roof/floor edge module](../architecture/modular-building-connectors/roof-floor-edge-module.md) — fascia and upper edge.
- **blocking component:** [foundation interface](../architecture/modular-building-connectors/foundation-interface.md) — street/building contact.
- **optional component:** [storefront glazing](../architecture/windows/storefront-glazing.md) — display insert.
- **optional component:** [shop shutter](./shop-shutter.md) — closed-state dressing.
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
