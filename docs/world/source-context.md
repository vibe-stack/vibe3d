# Source context and temporal policy

This document preserves the intent carried by the prose around the inventory.
The generated asset files are the implementation handoff; this is the policy
for interpreting source notes that do not belong to one mesh.

## Inventory policy

- Every named source bullet is retained, including historical, legacy, variant,
  component, and “where applicable” entries.
- Reusable gameplay systems are first-class assets, not optional decoration.
  Their states, resets, interaction surfaces, and readability are part of the
  specification.
- POI-specific hero assets are mandatory. Generic recombination alone must not
  make every place read like the same industrial park.
- Graphics, decals, banners, flags, balloons, labels, graffiti, and advertising
  are a full production family. They are not a final polish task.
- The source's approximate 1,070 authored-piece target is an optimization
  target, not permission to remove a named design intent. Repeated pieces should
  be instanced or parameterized where the detailed list would otherwise grow
  beyond the target.

## Temporal tags

Use these tags in future implementation manifests:

| Tag | Meaning | Default behavior |
| --- | --- | --- |
| `current` | compatible with the present gameplay/world pass | available to new assemblies |
| `legacy` | retained for historical maps, event dressing, or archival scenes | opt-in |
| `variant` | a state, material, cosmetic, or structural variation of a base asset | inherits base contract |
| `component` | a child part of a POI or gameplay assembly | built through its parent |
| `hero` | a landmark or uniquely identifying setpiece | must have an assembly brief |
| `seasonal` | temporary banners, flags, balloons, or public dressing | opt-in by event |

The source explicitly calls out historical Tridents, removed long-distance
Broken Moon rails, the historical World's Edge train, older map versions, and
current/damaged Armory states. The briefs preserve these so the library can
author both current and historical worlds.

## Gameplay context retained from the brief

Supply bins, Arsenal stations, Replicators/Crafters, Respawn Beacons, Survey
Beacons, Ring Consoles, Ziprails, Gravity devices, Charge Towers, Explosive
Holds, IMC Armories, Cargo Bots, Loot Ticks, MRVN units, vaults, and Blast Wall
systems should be treated as recurring map mechanics. Their asset specs must
share state language even when their local shells vary.

## Storytelling context retained from the brief

E-District needs deliberate graffiti, overturned cars, rubble, market clutter,
and socioeconomic variation. Storm Point needs wildlife traces, coastal damage,
flood infrastructure, and field research. Broken Moon needs quarantine,
terraforming, habitat, and meteor/crash logic. World's Edge needs thermal
transitions and frozen industrial failure. Kings Canyon needs aging military
infrastructure, containment, salvage, and ecological disaster. Olympus needs
clean civic/scientific precision with enough service infrastructure to avoid a
sterile showroom.

## Reference discipline

The supplied reference images and source labels are used to study composition,
value hierarchy, modularity, and color behavior. New authored geometry and
graphics should remain original to the Axiom Relay kit. Use neutral Axiom marks
and placeholder manufacturers in production assets; third-party names in the
inventory are descriptive reference labels, not a request to reproduce logos or
copyrighted hero geometry.
