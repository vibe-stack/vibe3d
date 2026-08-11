# Canonical material library

Every prop brief names material IDs from this table. A new material is a system
decision: add it here first, explain why an existing material cannot cover the
need, and then use it consistently. Values are starting ranges for a
physically based implementation, not a mandate to flatten every surface.

## Material IDs

| ID | Material | Appearance and construction | PBR starting range | Approved roles |
| --- | --- | --- | --- | --- |
| `MAT-01` | structural polymer | molded shell, subtly fibrous, broad low-frequency roughness | metalness 0.00, roughness 0.42–0.58 | bins, consoles, civic cladding, cases |
| `MAT-02` | coated alloy | painted aluminum/steel with a controlled satin highlight and exposed edge chips | metalness 0.70–0.90, roughness 0.24–0.38 | walls, doors, machinery, military shells |
| `MAT-03` | brushed alloy | directional brushed metal; anisotropy belongs to the object orientation | metalness 0.90–1.00, roughness 0.25–0.36 | trims, tanks, lab equipment, rails |
| `MAT-04` | weathered steel | dark oxide, heat tint, oil-dark recesses, restrained rust | metalness 0.85–0.95, roughness 0.42–0.68 | industrial, frontier, wreckage |
| `MAT-05` | galvanized mesh | perforated or expanded metal with a readable thickness and edge | metalness 0.75–0.90, roughness 0.42–0.62 | catwalks, cages, barriers, racks |
| `MAT-06` | ceramic composite | smooth technical panel with small satin variation and clean seams | metalness 0.10–0.35, roughness 0.26–0.40 | clean civic, medical, research, lunar pods |
| `MAT-07` | safety rubber | soft black, slightly dusty, rounded contact edges | metalness 0.00–0.05, roughness 0.58–0.78 | bumpers, grips, seals, wheels, hoses |
| `MAT-08` | transparent laminate | layered safety glass/polymer; edge thickness and internal tint are visible | metalness 0.00, roughness 0.04–0.18, transmission as supported | windows, screens, pods, containment |
| `MAT-09` | emissive glass | translucent signal tube or pixel surface; emission is masked and purposeful | metalness 0.00, roughness 0.12–0.24, emission by state | beacons, phase rings, neon, hologram cores |
| `MAT-10` | technical fabric | woven tarp or seat fabric with seam direction and tension | metalness 0.00, roughness 0.68–0.86 | awnings, tents, seats, bags, parachute cloth |
| `MAT-11` | reclaimed concrete | cast aggregate, panel seams, rounded damage, varied but broad stains | metalness 0.00, roughness 0.72–0.90 | walls, dams, barriers, foundations, rubble |
| `MAT-12` | asphalt/mineral | granular road surface with tire polish and edge dust | metalness 0.00, roughness 0.78–0.94 | roads, plazas, runways, roofs |
| `MAT-13` | observation glass | cleaner, bluer laminate with controlled reflections and structural frame | metalness 0.00, roughness 0.04–0.12, transmission as supported | towers, labs, high-rises, bridges |
| `MAT-14` | phase fiber | braided energy conduit or field filament; glow is nested inside a physical carrier | metalness 0.10–0.35, roughness 0.16–0.32, emissive state-driven | portals, gravity devices, phase machinery |
| `MAT-15` | living biological | skin, leaf, fungal, or organic growth with species-specific roughness | metalness 0.00, roughness 0.48–0.88 | wildlife, plants, infestation, roots |
| `MAT-16` | weathered wood | engineered or salvaged timber with end grain, fasteners, and moisture variation | metalness 0.00, roughness 0.62–0.86 | swamp walkways, camps, old town, crates |
| `MAT-17` | paint/decal | thin graphic layer with deliberate abrasion and clear ownership | metalness follows substrate, roughness +0.02–0.12 over substrate | stripes, labels, logos, graffiti, signage |
| `MAT-18` | water/utility fluid | optically simple fluid with environmental color inherited from context | metalness 0.00, roughness 0.02–0.16 | pools, canals, tanks, leaks, treatment basins |
| `MAT-19` | thermal mineral | emissive or reflective lava/heat material with crust variation | metalness 0.00–0.15, roughness 0.42–0.72, emission by temperature | fissures, furnaces, volcanic rock |
| `MAT-20` | ice/frozen mineral | cool translucent edge, opaque dirty core, sharp fracture planes | metalness 0.00, roughness 0.18–0.56, transmission as supported | Epicenter, frozen rock, ice formations |
| `MAT-21` | rubble/debris | family of concrete, metal, glass, and dust chunks with authored proportions | inherits source, roughness 0.48–0.92 | destruction, crash fields, collapse zones |

## Shared authoring rules

- Base color carries ownership and age; roughness carries use and exposure.
- Edge wear exposes the next material layer. It does not draw a bright outline
  around every object.
- Large surfaces need broad value variation, medium panels need seam/fastener
  logic, and only close-up surfaces need micro-normal detail.
- Metallic surfaces remain dark enough to preserve silhouette under bright
  skylight. Avoid mirror chrome except for deliberate luxury or phase focal
  points.
- Emissive material is always paired with a non-emissive housing. A glowing
  strip without a lens, recess, tube, or diffuser is not production-ready.
- Use decals for serials, warning bands, ownership, and temporary messaging.
  Decals are cheaper to change than geometry and keep the kit coherent.
- Biological and terrain materials must touch, stain, pierce, or grow around
  manufactured objects. Never float a biome layer over a clean asset.

## Material assignment recipe

For a normal prop, start with `MAT-02` or `MAT-06` for the chassis, `MAT-04` or
`MAT-03` for service parts, `MAT-07` for contact parts, and `MAT-09`/`MAT-14`
only when the asset communicates an active state. Add `MAT-17` for ownership
or safety information. A hero setpiece may add a terrain or biological
material, but its manufactured core still follows the recipe.
