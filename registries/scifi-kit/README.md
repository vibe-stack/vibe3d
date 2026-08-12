# Sci-fi Kit

Build dense, readable science-fiction spaces with procedural Three.js models
you can keep, tune, and ship. Install one prop or bring in the complete kit,
then work directly in your own source tree.

```sh
bunx vibe3d add @scifi-kit/modular-wall
bunx vibe3d add @scifi-kit
```

Every model includes an interactive preview, portable GLB export, and the
source needed to make it fit your world.

## Cargo, storage, and logistics wave

Fifty models covering a working depot: freight containers and their short,
open-top, small, stacked, wrecked, and door-only variants; the crate and case
family from a two-metre freight crate down to a polymer instrument case; drums,
gas bottles, and bulk vessels; pallets, sacks, nets, and straps; pallet racking,
warehouse shelving, and powered equipment bays; trolleys, carts, a yard trailer,
and a dock ramp; and depot machinery including a chain hoist, a beam trolley,
and a counterbalance loader.

They share one support item rather than each carrying a private copy of the
look:

```sh
bunx vibe3d add @scifi-kit/shipping-container-standard
```

- `@scifi-kit/axiom-cargo-kit` — the wave's material set, procedural hazard and
  manifest decals, and its construction vocabulary: corner castings, fork
  pockets, louvre vents, toggle latches, lifting hooks, castors, drums, and the
  deterministic preview rig every prop is framed with.
- Container variants additionally share one parameterised chassis, so rib
  cadence, skirt height, and casting spacing match by construction.

Pulling any single prop brings the support item with it, so an individually
installed crate still looks like it came from the same catalogue as the
container beside it.
