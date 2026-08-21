# F1 Kit

85 procedural Formula 1 props for real-time Three.js (`three/webgpu`): a pit
box, circuit furniture to instance along a racing line, and a pit building
whose fascia accepts a number, a legend, a built-in plate, or your own image
material. Palette and hardware live in `f1-kit-core`. Colours are generic
defaults — no team liveries, sponsor marks, or driver likenesses.

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
createModel({ count: 3, number: '1', legend: 'PIT' }) // style: 'stamp'
createModel({ style: 'fia', number: '12' })
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
generic two-handle stand-in and not a championship trophy.

`f1-trophy-cup` · `f1-champagne` · `f1-ice-bucket` · `f1-trophy-table` ·
`f1-interview-backdrop` · `f1-press-riser` · `f1-cooldown-board`

`f1-trophy-bowl` and `f1-trophy-plinth` remain catalog ids only (retired
generic shapes, not GP trophies).

## Displays

`f1-led-ribbon` · `f1-pit-totem` · `f1-sector-board` · `f1-fan-screen` ·
`f1-start-clock` · `f1-nameboard`

## Hospitality

`f1-banner-bridge` · `f1-a-frame` · `f1-barrier-sleeve` · `f1-gazebo` ·
`f1-drink-wall` · `f1-feather-flag`

## Paddock

`f1-service-truck` (EU 96/53 cab-over rigid — assemble `kind` / wheelbase /
boxLength / axles, hang a wrap with `setMaterial('livery', …)`) ·
`f1-stillage` · `f1-hand-trolley` · `f1-cable-ramp`

Paddock millimetres live in `f1-kit-core/paddock.ts` (truck envelope, EUR
stillage) and `ceremony.ts` (cups, LED ribbon, 3 m gazebo). No real team,
sponsor, or trophy IP.
