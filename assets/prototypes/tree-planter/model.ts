import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import { AXIS_X, AXIS_Y, type CargoPreview, type CargoPreviewOptions } from '../axiom-cargo-kit/index.ts'
import {
  STREET,
  createStreetModel,
  createStreetPreview,
  pole,
  poleArm,
  foliage,
  slab,
  streetLamp,
  type StreetModel,
} from '../axiom-street-kit/index.ts'

/**
 * Axiom Relay tree planter — the street tree and its pit.
 *
 * The tree is the least of it. What makes a street tree survive is the grating
 * over the pit, the guard around the trunk, and the irrigation tube down the
 * side — all three visible, all three the reason the tree is not dead. A planted
 * trunk with no pit furniture reads as scenery dropped on a pavement.
 *
 * The canopy is three overlapping masses rather than one blob or a spray of
 * flat cards: masses at different yaws keep a silhouette when the camera moves,
 * which is the least a tree has to do and the thing cards never manage.
 */

const ENVELOPE = { width: 1.6, depth: 1.6, height: 4.2 }

export function createModel(): StreetModel {
  return createStreetModel({
    id: 'tree-planter',
    condition: 0.7,
    envelope: ENVELOPE,
    build: ({ m, bundle, part }) => {
      const p = part('planter')
      // Pit kerb and the two-piece cast grating over it.
      slab(p, m.graphiteEdge, [1.5, 0.14, 1.5], [0, 0.07, 0])
      for (const sz of [-1, 1]) {
        slab(p, m.ironOxide, [1.36, 0.05, 0.62], [0, 0.16, sz * 0.34])
        for (let index = 0; index < 7; index += 1) {
          slab(p, m.ink, [0.03, 0.02, 0.56], [-0.54 + index * 0.18, 0.19, sz * 0.34])
        }
      }
      slab(p, m.ink, [0.3, 0.04, 0.3], [0, 0.17, 0])
      // Trunk: two concentric sections, the upper one running up *into* the
      // canopy rather than stopping below it.
      //
      // The first pass offset the upper section 58 mm sideways to suggest a
      // natural lean. Concentricity is what makes a taper read as one trunk, so
      // the offset just put a visible knee at the joint — and the upper section,
      // narrower but shifted, broke the silhouette of the wider one below it.
      // It also stopped at 2.65 m while the canopy began at 2.80 m, leaving the
      // whole crown hanging on four thin raked twigs.
      p.add(cylinder(m.timber, 0.11, 1.5, [0, 0.9, 0], AXIS_Y, 10))
      p.add(cylinder(m.timber, 0.085, 1.75, [0, 2.4, 0], AXIS_Y, 10))
      // Canopy: three overlapping masses at falling widths, each rotated off the
      // one below, on a short branch armature.
      //
      // The first pass laid flat slabs at one height and called it sparse. It
      // read as a mushroom on scaffolding — flat plates have no volume from any
      // angle, and a canopy is volume before it is anything else. Overlapping
      // masses at different yaws give a silhouette that survives rotation, which
      // is the least a tree has to do.
      const leaf = foliage(bundle, 7_901)
      const leafDark = foliage(bundle, 7_902, -0.42)
      for (let index = 0; index < 4; index += 1) {
        const a = (index / 4) * Math.PI * 2 + 0.5
        p.add(cylinder(m.timber, 0.042, 0.78, [
          Math.cos(a) * 0.2, 2.92, Math.sin(a) * 0.2,
        ], [Math.sin(a) * 0.85, 0, -Math.cos(a) * 0.85], 6))
      }
      // First tier overlaps the trunk's top rather than clearing it.
      // Canopy as three overlapping tiers, each rotated off the one below.
      //
      // Tried scattering fourteen small lumps instead, on the theory that big
      // boxes read as crates. They read worse: at that size nothing overlaps
      // enough to form a crown, so the silhouette dissolved into loose confetti.
      // Fewer, larger, overlapping masses at least hold an outline. This is
      // stylised rather than convincing either way — foliage wants a primitive
      // this kit does not have, and that is a kit change, not a model change.
      const tiers: readonly (readonly [number, number, number, number])[] = [
        [1.5, 0.56, 3.02, 0.0],
        [1.24, 0.46, 3.4, 0.62],
        [0.84, 0.38, 3.72, 1.15],
      ]
      for (const [index, [w, h, y, yaw]] of tiers.entries()) {
        slab(p, index === 1 ? leafDark : leaf, [w, h, w * 0.9], [0, y, 0], [0, yaw, 0])
        slab(p, index === 1 ? leaf : leafDark, [w * 0.52, h * 0.72, w * 0.5], [
          Math.cos(yaw + 1.1) * w * 0.36, y + h * 0.22, Math.sin(yaw + 1.1) * w * 0.36,
        ], [0, yaw + 0.5, 0])
      }

      // Trunk guard and the irrigation tube that keeps it alive.
      for (let index = 0; index < 4; index += 1) {
        const a = (index / 4) * Math.PI * 2 + 0.4
        p.add(cylinder(m.steel, 0.018, 1.1, [Math.cos(a) * 0.3, 0.72, Math.sin(a) * 0.3], AXIS_Y, 6))
      }
      for (const y of [0.5, 1.15]) {
        p.add(cylinder(m.steel, 0.012, 0.6, [0, y, 0], AXIS_X, 6))
        p.add(cylinder(m.steel, 0.012, 0.6, [0, y, 0], [Math.PI / 2, 0, 0], 6))
      }
      p.add(cylinder(m.ink, 0.035, 0.6, [0.46, 0.32, 0.3], AXIS_Y, 8))
      return { sockets: { dressing_canopy: [0, 3.3, 0], pipe_irrigation: [0.46, 0.62, 0.3] } }
    },
  })
}

export function createPreview(options: CargoPreviewOptions = {}): CargoPreview {
  return createStreetPreview(createModel(), ENVELOPE, { distance: 8.4, pitch: 0.16, ...options })
}
