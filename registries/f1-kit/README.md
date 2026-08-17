# F1 Kit

Procedural Formula-1 pit-lane props for real-time Three.js scenes, built
directly on `three/webgpu`. Install one prop or bring in the complete kit,
then work directly in your own source tree.

```sh
bunx vibe3d add @f1-kit/f1-tyre
bunx vibe3d add @f1-kit
```

Every model includes an interactive preview, portable GLB export, and the
source needed to make it fit your world.

## Pit lane, wave one

Eleven props covering a working pit box: a loose tyre; the two
hand tools a pit crew swings during a stop (a lever jack and an impact wheel
gun); garage dressing (a tool cabinet, a fire extinguisher, an air-hose
reel); and pit-lane signage and structures (a blanketed tyre stack, a
wheel-gun rack, a stop/go lollipop board, a numbered pit board, and an
overhead gantry). Two of them — the tyre stack and the gun rack — are built
by composing the tyre and the wheel gun, so recoloring either base
prop recolors every stack or rack built from it.

They share one support item rather than each carrying a private copy of the
palette, hardware, and geometry helpers:

```sh
bunx vibe3d add @f1-kit/f1-tool-cabinet
```

- `@f1-kit/f1-kit-core` — the wave's palette, shared material bundle, hardware
  vocabulary (bolts, castors, straps, pads), swept-geometry helpers, and the
  disposal contract every prop in the kit builds on.

## No real-team branding

Every color in this kit is a generic default exposed as a real material
slot — no real F1 team liveries, sponsor branding, or driver likenesses are
baked into any prop. Recolor freely via `setMaterial()` or by passing your
own materials into `createModel()`.

## What's next

The assembled car itself — chassis, wings, halo, cockpit, and a paintable
livery system — is a separate, later addition to this kit, once every
standalone pit-lane prop has landed.
