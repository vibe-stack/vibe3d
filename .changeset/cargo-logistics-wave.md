---
"@scifi-kit/registry": patch
---

Add the Axiom Relay cargo, storage, and logistics wave: fifty new procedural
models covering freight containers and their variants, the crate and case
family, drums and bulk vessels, pallets and soft goods, racking and shelving,
wheeled handling equipment, and depot machinery including a chain hoist, a beam
trolley, and a counterbalance loader.

The kit states where an applied detail sits: `LAYER_CLEARANCE` is the datum a
`layer()` helper counts from, the mark, fastener and label helpers take `centre`,
`orient` and `proud` overrides so a detail can be placed on a curved or rotated
host without hand-rolling it, and the curved-body helpers seat on the facet the
shell actually renders rather than on its nominal radius. Container detail is
derived from the rib, band or leaf it is painted on rather than from a fraction
of the box's length, so it lands correctly on every variant from the small
container to the forty-foot shell.

All fifty are built on a new `axiom-cargo-kit` support item, which carries the
wave's shared material set, procedural hazard and manifest decals, the corner
casting, fork pocket, louvre vent, latch, lifting hook, and drum primitives, and
one deterministic preview rig. Container variants additionally share a single
parameterised chassis, so their rib cadence, skirt height, and corner castings
match by construction rather than by eye.
