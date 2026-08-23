import type { Group } from 'three/webgpu'

import { prism } from '../../../src/asset-forge/generator/index.ts'
import { KIT_BUILD, facePrism, wallFace, type KitMaterials, type WallFace } from '../axiom-modular-kit/parts.ts'

/**
 * The parts a *loose* wall run needs and a prefab shell does not.
 *
 * Inside a shell the wall starts at the interior floor datum, because a floor
 * slab is under it and the plinth carries it. A loose run has neither, so it
 * would otherwise begin 440 mm in the air. These add the ground it stands on and
 * the two ends a shell hides inside its corners.
 */

/** Ground datum. The kit's wall base sits this far above it. */
export const FOOTING_TOP = KIT_BUILD.floorY

/** The face for a run centred on the origin at the given yaw. */
export function runFace(yaw = 0): WallFace {
  return wallFace([0, 0, -KIT_BUILD.wallThickness * 0.5], yaw)
}

/**
 * Footing: the plinth a free-standing run stands on.
 *
 * Wider than the wall on both faces, so the wall reads as *set on* it rather
 * than as continuing into the ground. A footing flush with the wall is a wall
 * that got taller, which is exactly the read a ground line must not have.
 */
export function footing(parent: Group, m: KitMaterials, face: WallFace, u0: number, u1: number): void {
  const length = u1 - u0
  const centre = (u0 + u1) / 2
  facePrism(parent, face, m.deck, [length, FOOTING_TOP - 0.06, KIT_BUILD.wallThickness + 0.16], centre, (FOOTING_TOP - 0.06) / 2, 0, {
    fillet: 0.02, bevel: 0.018,
  })
  facePrism(parent, face, m.graphite, [length, 0.06, KIT_BUILD.wallThickness + 0.24], centre, FOOTING_TOP - 0.03, 0, {
    fillet: 0.014, bevel: 0.012,
  })
  // Anchor pads, one per 2 m of run, on both faces.
  const pads = Math.max(2, Math.round(length / 2) + 1)
  for (let index = 0; index < pads; index += 1) {
    const u = u0 + (index / (pads - 1)) * length
    for (const side of [1, -1]) {
      facePrism(parent, face, m.steel, [0.16, 0.05, 0.1], u, 0.05, side * (KIT_BUILD.wallThickness * 0.5 + 0.1), {
        fillet: 0.008, bevel: 0.007,
      })
    }
  }
}

/**
 * End condition for a cut run: a full-height post-section closing the cassettes.
 *
 * Without it the wall's cassette layers are visible in section at each end, and
 * a 2 m wall reads as a fragment broken off a longer one rather than as a
 * module that was made 2 m long.
 */
export function endReturn(parent: Group, m: KitMaterials, face: WallFace, u: number, side: -1 | 1): void {
  const width = 0.22
  const centre = u + side * width * 0.5
  facePrism(parent, face, m.graphite, [width, KIT_BUILD.wallTop - KIT_BUILD.floorY, KIT_BUILD.wallThickness + 0.05], centre, (KIT_BUILD.floorY + KIT_BUILD.wallTop) / 2, 0, {
    fillet: 0.024, bevel: 0.02,
  })
  facePrism(parent, face, m.steel, [0.05, KIT_BUILD.wallTop - KIT_BUILD.floorY - 0.24, 0.04], centre, (KIT_BUILD.floorY + KIT_BUILD.wallTop) / 2, KIT_BUILD.wallThickness * 0.5 + 0.03, {
    fillet: 0.008, bevel: 0.007,
  })
}

/** Coping: the capping section along the top of a free-standing run. */
export function coping(parent: Group, m: KitMaterials, face: WallFace, u0: number, u1: number): void {
  const length = u1 - u0
  const centre = (u0 + u1) / 2
  facePrism(parent, face, m.graphite, [length, 0.12, KIT_BUILD.wallThickness + 0.1], centre, KIT_BUILD.wallTop + 0.06, 0, {
    fillet: 0.02, bevel: 0.018,
  })
  facePrism(parent, face, m.steel, [length - 0.1, 0.02, 0.03], centre, KIT_BUILD.wallTop + 0.13, KIT_BUILD.wallThickness * 0.5 + 0.04, {
    fillet: 0.006, bevel: 0.005,
  })
}

/** A free-standing straight run, complete: footing, wall, ends, and coping. */
export function straightRun(
  parent: Group,
  m: KitMaterials,
  face: WallFace,
  length: number,
  build: (u0: number, u1: number) => void,
): void {
  const u0 = -length / 2
  const u1 = length / 2
  footing(parent, m, face, u0 - 0.11, u1 + 0.11)
  build(u0, u1)
  endReturn(parent, m, face, u0, -1)
  endReturn(parent, m, face, u1, 1)
  coping(parent, m, face, u0 - 0.11, u1 + 0.11)
}

/** A plain block section, for the modules that do not use the cassette wall. */
export function plainSection(
  parent: Group,
  material: Parameters<typeof prism>[0],
  size: [number, number, number],
  position: [number, number, number],
  rotation?: [number, number, number],
): void {
  parent.add(prism(material, size, position, {
    chamfer: Math.min(0.09, size[2] * 0.3),
    fillet: 0.02,
    bevel: 0.018,
    ...(rotation ? { rotation } : {}),
  }))
}
