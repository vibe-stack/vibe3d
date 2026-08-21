# @f1-kit/registry

## 0.0.6

Ceremony wave AAA. `f1-podium` follows FIA Appendix 5 plus the 2026 F1-supplied
dais (P2 | P1 | P3, carpet, 1.20 m walkway, 0.50 m flag slot, numbered faces,
solid backdrop). `f1-trophy-cup` is the 0.60 m Piet Boon / Royal Delft
Zandvoort winner's cup. Bowl and plinth stay as retired generic ids, not GP
trophies.

## 0.0.5

Wave E paddock / ceremony furniture. 85 props. Shared 1:1 numbers in
`f1-kit-core/paddock.ts` (EU 96/53 rigid truck, EUR stillage) and
`ceremony.ts` (cups, LED ribbon, 3 m gazebo). `f1-service-truck` is one
assembleable vehicle (`kind` / wheelbase / boxLength / axles / livery), not
five ids. Fascia props take `stamp|fia|blank` plates or `setMaterial` for a
host image. No real team, sponsor, or championship-trophy IP.

## 0.0.4

Wave 3 1:1 FIA datum pass. Shared numbers live in `f1-kit-core/track.ts`
(FIA-published kerbs, walls, lights, and grid; Grade 1 garage / pit-wall /
race-control envelopes) so props cannot invent a second height.


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
