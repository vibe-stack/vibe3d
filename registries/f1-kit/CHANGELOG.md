# @f1-kit/registry

## 0.0.3

Circuit furniture so a host can instance a full lap: walls, runoff tiles,
FIA boards, a pit garage/wall pair (7 m bay, procedural fascia), S/F heroes,
and a fourth weekend wave (cones, weighbridge, parc fermé, medical post,
generator cabin, flag pole, camera platform, tunnel portal, sector gantry).

Shared `WALL_FITS`, `GARAGE_BAY_PITCH`, `CIRCUIT_SIGN_KINDS`, `FASCIA_STYLES`,
`fasciaTexture`, and `circuitSignTexture` live in `f1-kit-core`. Pass
`number` / `legend` / `style` (`stamp` | `fia` | `blank`) for stamped fascias,
or `setMaterial('fascia', yours)` for an image.

## 0.0.2

Trackside wave: catch fence, Armco, tyre barrier, TecPro, start lights,
kerb, floodlight, timing pylon, brake marker, jumbotron, marshal post,
start gantry, grandstand bay.

## 0.0.1

Initial release: 10 pit-lane props (tyres, pit tools, garage
equipment, and signage & structures) plus the `f1-kit-core` shared support
library.
