# Terrain catalogue schema

Use one entry per recognizable procedural family, not per arbitrary seed.

```yaml
id: glacial-granite-boulder
title: Glacial granite boulder
formation: boulder
geology:
  material: granite
  structure: massive-with-joints
  processes: [glacial-plucking, frost-fracture, exfoliation]
biome:
  primary: alpine
  overlays: [snow, lichen, seasonal-wetness]
scale:
  envelopeMeters: [1.2, 0.9, 1.0]
  macroWavelengthMeters: [0.4, 1.8]
  detailWavelengthMeters: [0.01, 0.15]
topology:
  strategy: deformable-shell
  profile: game
  keyParameters: [sizeClass, majorJointFamily, cavityCount]
  variationParameters: [seed, surfaceWarp, frostErosion, snow, wetness]
  boundaryMode: closed
budgets:
  lodTriangles: [24000, 8000, 1800]
  collisionTriangles: 600
  compiledMaterializeMs: 2
  sourceCompileMs: 250
references:
  descriptions:
    - Squat glacial erratic with two dominant joint planes and an embedded base.
  images: []
acceptance:
  testedSeeds: 32
  requiredReads: [granite mass, glacial plucking, stable ground contact]
  forbiddenReads: [melted blob, uniform noise, weightless balance]
```

## Required distinctions

- `formation` names the geometric family.
- `geology` explains why its large and medium features exist.
- `biome` modifies exposure and surface state without silently changing rock
  type.
- `keyParameters` can change connectivity or the admissible deformation cage.
- `variationParameters` must stay inside the compiled topology envelope.
- budgets are measurable acceptance constraints, not aspirations.

Use a small family-level image board when prose cannot establish proportions,
fracture character, or material frequency. Once a family is accepted, retain
its deterministic renders as regression evidence; do not require a unique
external image for every seed.
