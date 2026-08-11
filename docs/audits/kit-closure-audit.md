# Kit-closure audit

Generated 2026-08-10 by scripts/audit-kit-closure.mjs.

## Verdict

The inventory is source-complete. The reusable core kit now has explicit floor, ceiling, wall-closure, opening, threshold, foundation, gate, room-shell, building-shell, facade-shell, and utility-enclosure contracts. Hero-scale structural candidates also carry concrete reusable links; remaining work is actual mesh production and optional enrichment of non-structural hero dressing.

This audit treats a name as a production relationship only when the brief names the components, dimensions, sockets, or direct dependency links needed to build it. A generated paragraph about reusable architectural modules does not count as closure.

## Coverage snapshot

| Measure | Result | Interpretation |
| --- | --- | --- |
| Source bullets | 1301 | complete |
| Reusable items | 744 | architecture, systems, dressing, interiors, terrain, vehicles, wildlife, and graphics |
| Hero components | 557 | 116 hero assembly briefs on disk |
| Asset briefs with no inferred sibling dependency | 604 | name-based inference fallback |
| Hero briefs with direct reusable links | 102 / 557 | 455 have none |
| Reusable assembly candidates without manifests | 0 | should become explicit L2 prefabs |
| Reusable assembly candidates still open | 0 | missing a manifest or direct reusable component link |
| Reusable assembly candidates with generic envelope | 0 | still use the default 1 m x 1 m x 1.8 m brief |

Source-to-brief coverage is complete: 1301 source bullets, 1301 asset briefs, and 116 assembly briefs. No orphan asset briefs were detected.

## Connector coverage

| Kit family | Status | Evidence | Closure finding |
| --- | --- | --- | --- |
| Wall segments | present (24) | Reusable / core architecture -> Walls | Straight runs plus explicit corner/junction/termination connectors are named |
| Door components | present (17) | Reusable / core architecture -> Doors | Leaves, hatches, frame, control, and a standard door-bay contract exist |
| Window components | present (12) | Reusable / core architecture -> Windows | Inserts and frames plus a standard window-bay contract exist |
| Roof pieces | present (10) | Reusable / core architecture -> Roof pieces | Roof dressing exists; it does not substitute for floors or ceilings |
| Generic floor / ground tile | present (1) | floor slab tile | Dedicated floor/slab module is named |
| Ceiling panels / slabs | present (1) | ceiling slab panel | Dedicated ceiling module is named |
| Wall corners / returns / end caps | present (5) | interior wall corner, exterior wall corner, wall T-junction, wall end cap, wall return | Straight runs plus closure connectors are named |
| Gate support kit | 9 gate-related entries | Phase Runner gateway, gate post pair, gate lintel, gate wall return, checkpoint gate assembly, checkpoint gate, enormous phase gateways, gateway rings, large gate | Fragmented across gameplay, military, and hero categories |
| Facade / storefront items | 13 entries | storefront glazing, storefront facade shell, Japanese/cyberpunk storefront module, convenience-store facade, restaurant facade, noodle shop facade, bar facade, nightclub facade, boutique facade, luxury boutique facade; plus 3 more | The storefront shell and themed facade variants now expose shared component contracts |
| Reusable building / room shell | present as a dedicated family | room shell, small building shell, and themed prefab variants | Buildings can be composed from the new floor, wall, opening, ceiling, roof-edge, and foundation vocabulary |

Surface-related names exist (33), but they are mostly floor-loot display pedestal where applicable, Replicator platform, Gravity Cannon platform, Phase Runner platform, floor hatch, rooftop HVAC foundation, scaffold platform, foundation block, modular platform, circular platform; plus 23 more rather than a generic building-floor system. Dedicated floor/ground tile or slab names: 1. Dedicated ceiling names: 1.

## P0 - reusable compositional assets without closure

The audit found 16 reusable assets whose names imply assemblies rather than isolated props. 0 remain open after checking for a component manifest and direct reusable dependency links. 0 have no component manifest, 0 have no direct reusable dependency link, and 0 still carry the generic module envelope.

No unresolved reusable assembly candidates remain in the current source inventory.

The reusable core closure is now explicit: L1 connectors and L2 shells/facades expose blocking and optional component links. Remaining closure work is concentrated in hero components and actual mesh production.

## P0 - hero components with weak reusable closure

Only 102 of 557 hero component briefs contain a direct link to a reusable asset; the remaining 455 are mostly non-structural dressing. 0 hero components look structurally compositional and have no reusable link at all. The table shows the first 0 high-risk cases in source order; the count is the important result, not the truncation.

| Source | Brief | Map family | Reusable links | Composition cue |
| --- | --- | --- | --- | --- |

Hero assembly briefs do list sibling components, but their reusable dependency section remains category-level prose. Each L3 component needs concrete blocking and optional links so an agent can build it without rediscovering the kit.

## P1 - gate family audit

There are 9 gate-related source entries: [Phase Runner gateway](../../prop-list.md):86, [gate post pair](../../prop-list.md):270, [gate lintel](../../prop-list.md):271, [gate wall return](../../prop-list.md):272, [checkpoint gate assembly](../../prop-list.md):278, [checkpoint gate](../../prop-list.md):455, [enormous phase gateways](../../prop-list.md):1182, [gateway rings](../../prop-list.md):1183, [large gate](../../prop-list.md):1351.

| Gate role | Named coverage |
| --- | --- |
| gate leaf / moving closure | present somewhere in inventory |
| gate posts / jamb towers | present somewhere in inventory |
| gate lintel / header | present somewhere in inventory |
| wall returns / wing walls | present somewhere in inventory |
| threshold / road interface | present somewhere in inventory |
| gate control / operator kit | present somewhere in inventory |

The existing gate entries are not one reusable family. A checkpoint gate should be decomposable into a closure/leaf, posts or jamb towers, lintel, wall returns, road threshold, operator/control kit, barriers, and signage/light sockets. Those roles need explicit contracts even when some reuse existing doors, walls, roads, or booths.

## P1 - brief classification and dependency quality

The generator emits the fallback sentence No direct sibling dependency was inferred in 604 asset briefs. It still uses name-based inference for ordinary props, while explicit custom manifests cover building shells, floor/ceiling systems, facade composition, gate supports, and wall connector families in [the generator](../../scripts/generate-asset-bible.mjs).

0 compositional candidates are currently represented by primitive/dressing types rather than an explicit reusable-assembly type or manifest. Examples include none.

No broken direct reusable links were detected.

No orphan asset briefs were detected.

## Recommended repair order

1. Keep the L1 architectural closure kit and L2 prefab contracts synchronized with new source additions.
2. Upgrade each hero component with concrete links to the reusable pieces it consumes. Keep unique hero meshes, but make their attachment points explicit.
3. Generate the reference renders for the new source items and verify every markdown image target exists.
4. Fail the audit whenever a compositional asset has no manifest, no blocking shell dependency, or no floor/ceiling/closure strategy.

## Audit limitations

This is a documentation and dependency audit. It verifies names, briefs, links, levels, envelopes, and assembly language; it does not claim that a referenced mesh, GLB, or texture has already been authored. The generated briefs themselves describe planned assets.
