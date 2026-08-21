# @f1-kit/registry

## 0.0.12

Walls and runoff identity pass. Concrete wall, jersey, sausage, astroturf, gravel,
access gate, crash cushion, crowd fence, marker post, and slot drain now read at
catalogue distance from geometry (bay joints, NJ kink and drain slots, Type 4
modules, grass pile, readable stones, marshal-gap stubs, stepped attenuator,
weldmesh, square distance post, grate + slot). Stairs overpass unchanged. No
new ids; kit stays 70.

## 0.0.11

`f1-service-truck` highway 315/80R22.5 wheels on spinning hubs, raycast onto the preview ground, and a see-through Super Space Cab with seats / dash. Live preview parks in place (`wheelRpm` from 8 m/s of spin, no root translation) with bloom and interior light on. No DAF marks.

## 0.0.10

`f1-stairs` is a galvanized FIA 180/280 flight (open grating, channel
stringers, raked rails, toe boards) that composes into `kind: 'overpass'`
— a warren-truss overhang pass whose deck clears the 5.5 m catch fence.
Hosts instance flights or span the circuit with one configure call.

## 0.0.9

DAF XG+ critic pass on `f1-service-truck`. Cab is a pinched Super Space Cab
with a recessed grille cassette, visor light bar, hook DRLs, A-pillar camera
stalks, and Dawn emissive bloom in the demo (`createPreview({ bloom: true })`).
Trailer keeps the hospitality window belt, black nose, and black-to-white swoop.
Median resemblance vs a public XG+ 3/4 plateaued in the 40s — remaining gap is
class-A surfacing and outdoor IBL, not the 16.50 m envelope. No Cadillac / DAF
marks.

## 0.0.8

DAF XG+ high-roof artic replaces the Tesla Semi cab. `f1-service-truck` is an
unbranded tractor + box trailer inside the EU 96/53 16.50 m envelope (black
cab, black-to-white trailer swoop, TEAM disc — no Cadillac / DAF marks).
Magnum is Moët-green glass with gold foil; no house name. Ceremony fascias
default to a Three.js step-and-repeat of invented marks (`sponsorWallTexture`).
Driver plates default to Checo 11 in black and white (`DRIVER`).

## 0.0.7

Wave E cull. Dropped 15 invented, duplicate, or catalog-stub props: trophy
bowl, trophy plinth, gazebo, drink wall, a-frame, feather flag, stillage, hand
trolley, cable ramp, pit totem, fan screen, start clock, barrier sleeve,
banner bridge, press riser. Kit is 70. Remaining ceremony and display objects
were rebuilt against photographed Dutch GP / FIA Appendix 5 millimetres.
Real-object rule: delete the folder — do not keep a catalog-id mesh. No
replacement wave.

## 0.0.6

Ceremony wave AAA. `f1-podium` follows FIA Appendix 5 plus the 2026 F1-supplied
dais (P2 | P1 | P3, carpet, 1.20 m walkway, 0.50 m flag slot, numbered faces,
solid backdrop). `f1-trophy-cup` is the 0.60 m Piet Boon / Royal Delft
Zandvoort winner's cup.

## 0.0.5

Wave E paddock / ceremony furniture. Shared 1:1 numbers in
`f1-kit-core/paddock.ts` (EU 96/53 rigid truck) and `ceremony.ts` (cups, LED
ribbon). `f1-service-truck` is one assembleable vehicle (`kind` / wheelbase /
boxLength / axles / livery), not five ids. Fascia props take `stamp|fia|blank`
plates or `setMaterial` for a host image. No real team, sponsor, or
championship-trophy IP.

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
