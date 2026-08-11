# Dependency model

Dependencies are written as production relationships, not a flat wish list.
The goal is for an agent to know what may be built independently and what must
be stabilized first.

## Dependency levels

| Level | Meaning | Example |
| --- | --- | --- |
| `L0` | global rule or token | color token, material, grid |
| `L1` | reusable primitive/prop | hinge, pipe elbow, wall panel |
| `L2` | reusable assembly | supply bin, stair flight, cargo container |
| `L3` | POI component | Planet Harvester support, Boardwalk kiosk |
| `L4` | hero assembly | whole POI landmark |

An `L3` component may depend on `L0`–`L2` and sibling components. An `L4`
assembly coordinates components but should not redefine their geometry rules.

## How links are recorded

Every generated asset brief contains `Dependencies` with:

- canonical world docs;
- direct reusable siblings when the name implies a shared mechanism;
- the POI assembly for hero components;
- explicit state, material, and graphics dependencies when applicable.

If a dependency is optional, label it `optional`. If an asset cannot be
validated without it, label it `blocking`.

## Build order

1. Lock `L0`: world concept, visual language, materials, colors, units.
2. Build architectural and service primitives (`L1`).
3. Build gameplay devices, cover, cargo, interiors, and street assemblies
   (`L2`).
4. Compose POI components (`L3`) from the stabilized kit.
5. Author hero assemblies, destruction passes, and signage dressing (`L4`).
6. Run a world-scale review: five distant landmarks, five mid-distance
   interactions, and five close-up surfaces from different place families.
