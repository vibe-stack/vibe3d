# F1 Kit

70 procedural Formula 1 props for real-time Three.js (`three/webgpu`): a pit
box, circuit furniture to instance along a racing line, and a pit building
whose fascia accepts a number, a legend, a built-in plate, or your own image
material. Palette and hardware live in `f1-kit-core`. Colours are generic
defaults — no team liveries or copied sponsor marks. Driver plates default to
Checo 11 in black and white (`DRIVER`). Interview / LED fascias default to a
Three.js step-and-repeat of invented names (`sponsorWallTexture`).

Every id is a photographed Circuit Zandvoort / Dutch GP object, or a 1:1 FIA
Appendix 5 / Grade 1 object used there. Invented marketplace filler is not
kept as a catalog stub — the folder is deleted.

```sh
bunx vibe3d add @f1-kit
bunx vibe3d add @f1-kit/f1-garage-box
```

`tyre-stack` and `gun-rack` compose `f1-tyre` and `f1-tyre-gun`. Garage boxes
and the pit wall share a 7 m bay pitch. Wall gates and crash cushions share
`WALL_FITS` (`armco` | `concrete` | `jersey`).

1:1 sizes are shared from `f1-kit-core/track.ts` so walls, kerbs, the garage,
and the pit wall cannot drift: FIA Type 4 sausage (0.80 × 0.12 m), artificial
grass 2.0 m, grid stall 2.7 × 8 m, MYLAPS Grade 1 light cabinet 970 mm,
garage bay 7 × 17 × 5 m, pit wall 1.0 m deep / 2.2 m overall, jersey crown
1.0 m, spectator-bridge deck 5.5 m.

Garage fascia — stamp a number/legend, pick a built-in plate, or hang an image:

```ts
createModel({ count: 3, number: '11', legend: 'CHECO' }) // style: 'stamp'
createModel({ style: 'fia', number: '11' })
createModel({ style: 'blank' })
box.setMaterial('fascia', yourImageMaterial)
```

## Pit lane

`f1-tyre` · `f1-tyre-stack` · `f1-tyre-gun` · `f1-gun-rack` · `f1-pit-jack` ·
`f1-tool-cabinet` · `f1-fire-extinguisher` · `f1-hose-reel` · `f1-pit-board` ·
`f1-lollipop-board` · `f1-pit-gantry` · `f1-garage-box` · `f1-pit-wall`

## Circuit furniture

Walls and runoff: `f1-concrete-wall` · `f1-jersey-barrier` · `f1-sausage-kerb` ·
`f1-astroturf-strip` · `f1-gravel-trap` · `f1-access-gate` · `f1-crash-cushion` ·
`f1-crowd-fence` · `f1-marker-post` · `f1-slot-drain` · `f1-stairs`

Signage and services: `f1-circuit-sign` · `f1-grid-box` · `f1-start-finish-line` ·
`f1-fia-light-panel` · `f1-chevron-board` · `f1-camera-tower` · `f1-foam-monitor` ·
`f1-cctv-mast` · `f1-pa-horn`

Existing trackside: `f1-catch-fence` · `f1-armco` · `f1-tyre-barrier` ·
`f1-tecpro` · `f1-start-lights` · `f1-kerb` · `f1-floodlight` ·
`f1-timing-pylon` · `f1-brake-marker` · `f1-jumbotron` · `f1-marshal-post` ·
`f1-start-gantry` · `f1-grandstand-bay` · `f1-oranje-can`

Heroes: `f1-race-control` · `f1-spectator-bridge` · `f1-podium` (FIA Appendix 5
dais: camera-facing P2 | P1 | P3, 1.20 m walkway, 0.50 m flag slot, carpet,
numbered faces, solid backdrop)

Weekend extras: `f1-cone` · `f1-bollard` · `f1-weighbridge` · `f1-parc-ferme` ·
`f1-medical-post` · `f1-generator-cabin` · `f1-flag-pole` ·
`f1-camera-platform` · `f1-tunnel-portal` · `f1-sector-gantry`

## Ceremony

FIA Appendix 5 podium ceremony. Winner's cup is the measured Studio Piet Boon /
Royal Delft Zandvoort silhouette (0.60 m, Appendix 5 winner band) — not a
generic two-handle stand-in and not a championship trophy. P2 / P3 /
constructors use the same cup with different paint — one id. Magnum is
Moët-green glass with gold foil; no house name. Interview backdrop is a
step-and-repeat of invented marks.

`f1-trophy-cup` · `f1-champagne` · `f1-ice-bucket` · `f1-trophy-table` ·
`f1-interview-backdrop` · `f1-cooldown-board`

## Displays

Zandvoort main-straight LED cabinet, trackside sector-time board, and a
pit-wall driver plate (Checo 11 by default). Fascia faces take `setMaterial`
for a host image.

`f1-led-ribbon` · `f1-sector-board` · `f1-nameboard`

## Paddock

`f1-service-truck` (DAF XG+ high-roof cab-over + box trailer, EU 96/53 artic
≤ 16.50 m — assemble `kind` / wheelbase / boxLength / axles, hang a wrap with
`setMaterial('livery', …)`). Unbranded black cab and black-to-white trailer
swoop; no DAF or team wordmark. Preview uses kit bloom on DRL / headlamps / roof markers.

Paddock millimetres live in `f1-kit-core/paddock.ts` (truck envelope) and
`ceremony.ts` (cup, magnum, bucket, table, LED ribbon). No copied team,
sponsor, or trophy IP.
