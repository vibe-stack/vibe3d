<!-- generated from prop-list.md; edit the source brief or generator for durable changes -->
---
asset_id: "asset.vegetation-terrain.general.giant-tropical-tree"
source_label: "giant tropical tree"
source_section: "Reusable / vegetation and terrain"
source_group: "General"
source_line: 715
level: L1
status: planned
place_family: "Tropical, volcanic, frozen, lunar, coastal, civic, and cave spaces"
owner: "Natural system / Axiom field context"
---

# giant tropical tree

## Identity

- **Asset ID:** asset.vegetation-terrain.general.giant-tropical-tree
- **Type:** vegetation or terrain prop
- **Source:** prop-list.md:715
- **Family:** Reusable / vegetation and terrain
- **Place family:** Tropical, volcanic, frozen, lunar, coastal, civic, and cave spaces
- **Owner / story role:** Natural system / Axiom field context

## Reference render

![giant tropical tree reference render](giant-tropical-tree.png)

## Intent

The **giant tropical tree** is a vegetation or terrain prop for the Axiom Relay kit. It exists to support
biome-specific natural forms that integrate with manufactured foundations and sightlines. Its primary read should be **giant tropical tree** as a useful,
maintained, or visibly altered thing—not anonymous sci-fi decoration. At far
distance, the silhouette and mass locate it; at mid distance, the operational
face and state signal explain it; up close, the service layer rewards inspection
without changing the core language.

Keep the source label as the production name while applying the neutral Axiom Relay visual system defined in the world docs.

## Public contract

- **Blockout envelope:** Natural blockout envelope authored per silhouette; keep the contact patch stable and the tallest point within the named size class.
- **Grid:** 1 m world unit; snap structural breaks to 0.25 m increments.
- **Pivot:** the functional ground contact or lower-left mounting corner; keep placement stable across variants.
- **Orientation:** operational/front face points toward local +Z in the preview; document any intentional radial, overhead, or mirrored placement in implementation.
- **Sockets:** Expose the appropriate mount_*, power_*, pipe_*, cable_*, cover_*, door_*, rail_*, or fx_* sockets implied by the name and construction.
- **Read distance:** far = silhouette and footprint; mid = use, ownership, and state; near = fasteners, seams, labels, wear, and material response.
- **Collision:** keep the gameplay mass simple and stable; tertiary cables, foliage, loose debris, and clutter must not become accidental snag surfaces.

## Performance and implementation

- **LOD0:** full silhouette, service layer, articulated parts, and state signal for hero/near read.
- **LOD1:** merge small repeated parts while preserving silhouette, openings, interaction face, and signal.
- **LOD2:** keep only primary mass, cover boundary, major supports, and the state-bearing accent.
- **Instancing:** repeated bolts, slats, cables, foliage clusters, crates, panels, and sibling modules should be instanced where possible.
- **Preview:** validate in neutral light, home-map light, and a 1280×720 thumbnail so value hierarchy survives the app's current capture target.

## Visual brief

Use a species-specific primary silhouette and a clear contact patch. Cluster secondary growth in authored groups; keep negative space open enough for gameplay sightlines.

The construction follows the shared **chassis → service → signal** order.
Replace service detail with ecological attachment: roots, soil, nesting, staining, tracks, or environmental contact must explain how the object sits in its biome. Keep the strongest value break on the
operational face, frame any screen or opening with a physical bezel, and leave
negative space around the interaction point. Do not add unmotivated greebles;
each visible repetition needs a fastening, cooling, handling, safety, or
identity reason.

### State signal

Use LIME-400 as the dominant signal token and FIELD-500 only
as support. Reinforce signal color with position, shape, label, pulse, or
material response. Place emission inside a lens, recess, tube, projector, or
screen housing; never float a bright line over an unexplained surface.

## Construction plan

1. Block the public envelope and contact/mounting faces on the Axiom grid.
2. Build the primary silhouette as a small number of named chassis parts.
3. Add the service layer: seams, brackets, access panels, hoses, drains, handles, hinges, vents, or labels that make the function credible.
4. Add the signal layer and author the named states below. Keep state changes modular so clean, active, and damaged versions can share the base mesh.
5. Test the asset in neutral light, its home place family, and one unrelated place family. It should feel local in dressing but global in construction.



## Materials and color

Use these canonical materials in descending surface importance:

- MAT-15 — [canonical definition](../../../world/material-library.md).
- MAT-11 — [canonical definition](../../../world/material-library.md).

Apply these exact semantic color tokens:

- dominant signal: LIME-400;
- supporting signal: FIELD-500;
- neutral chassis: SHELL-200 or GRAPHITE-800 according to owner and place;
- service cavity: INK-950;
- identity, safety, or state graphics: MAT-17 over the correct substrate.

Never introduce a near-match hex value for a local fix. If a new role is truly
needed, update [the central color system](../../../world/color-system.md) first.

## Variants and states

1. **Healthy / Natural** — recognition state and public contract.
2. **Weathered Or Seasonal** — state-bearing geometry, signal, decal, and collision change.
3. **Damaged / Ecological Trace** — reuse the chassis with a focused dressing or service pass.

Map-specific availability belongs to the assembly brief; do not delete a reusable item because one current map no longer uses it.

## Dependencies

- **Blocking:** [world concept](../../../world/concept.md), [visual language](../../../world/visual-language.md), [production rules](../../../world/production-rules.md), and [dependency model](../../../world/dependency-model.md).
- **Materials/colors:** [material library](../../../world/material-library.md) and [color system](../../../world/color-system.md).



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
