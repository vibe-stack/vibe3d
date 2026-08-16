import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import { AXIS_X, AXIS_Y, type CargoPreview, type CargoPreviewOptions } from '../axiom-cargo-kit/index.ts'
import {
  STREET,
  createStreetModel,
  createStreetPreview,
  foliage,
  slab,
  type StreetModel,
} from '../axiom-street-kit/index.ts'

/**
 * Axiom Relay planter — the movable concrete tub.
 *
 * The street's most honest object: it is a heavy box that exists to stop
 * vehicles and happens to have plants in it. Everything about it says so — the
 * fork slots in the base, the lifting eyes at the corners, the drainage holes,
 * and the fact that the walls are far thicker than a plant needs.
 *
 * The planting is deliberately low and dense rather than a shrub. A tub this
 * size grows ground cover; anything taller would be leaning out of it.
 */

const ENVELOPE = { width: 1.5, depth: 0.8, height: 0.92 }

export function createModel(): StreetModel {
  return createStreetModel({
    id: 'planter',
    condition: 0.88,
    envelope: ENVELOPE,
    build: ({ m, bundle, part }) => {
      const p = part('planter')
      const leaf = foliage(bundle, 7_910)
      const leafDark = foliage(bundle, 7_911, -0.4)
      const W = 1.44
      const D = 0.74
      const H = 0.78

      // Tub: four thick walls on a plinth, hollow rather than a solid block.
      slab(p, m.shellShade, [W, 0.1, D], [0, 0.05, 0])
      for (const sx of [-1, 1]) slab(p, m.shellShade, [0.13, H, D], [sx * (W / 2 - 0.065), 0.1 + H / 2, 0])
      for (const sz of [-1, 1]) slab(p, m.shellShade, [W - 0.26, H, 0.13], [0, 0.1 + H / 2, sz * (D / 2 - 0.065)])
      // Rim capping, which is what a hand and a hip actually meet.
      slab(p, m.graphiteEdge, [W + 0.06, 0.07, D + 0.06], [0, 0.1 + H + 0.02, 0])

      // Fork slots in the plinth and lifting eyes at the corners: this is plant,
      // not furniture, and both details say it gets moved.
      for (const sx of [-1, 1]) slab(p, m.ink, [0.3, 0.07, 0.2], [sx * 0.32, 0.05, 0.28])
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          p.add(cylinder(m.steel, 0.022, 0.05, [sx * (W / 2 - 0.09), 0.1 + H + 0.05, sz * (D / 2 - 0.09)], AXIS_Y, 8))
        }
      }
      // Drainage holes through the lower wall.
      for (let index = 0; index < 4; index += 1) {
        p.add(cylinder(m.ink, 0.02, 0.14, [-0.5 + index * 0.34, 0.2, D / 2 - 0.06], [Math.PI / 2, 0, 0], 8))
      }

      // Soil, then low dense planting: overlapping masses, none symmetrical.
      slab(p, m.ink, [W - 0.28, 0.08, D - 0.28], [0, 0.1 + H - 0.02, 0])
      const clumps: readonly (readonly [number, number, number, number])[] = [
        [-0.42, 0.2, 0.34, 0.3],
        [0.0, 0.26, 0.4, 0.9],
        [0.44, 0.18, 0.3, 1.5],
        [-0.2, 0.14, 0.24, 2.1],
        [0.24, 0.15, 0.26, 2.7],
      ]
      for (const [index, [x, h, w, yaw]] of clumps.entries()) {
        slab(p, index % 2 === 0 ? leaf : leafDark, [w, h, w * 0.8], [x, 0.1 + H + h * 0.4, (index % 2 ? 0.1 : -0.1)], [0, yaw, 0])
      }
      return { sockets: { dressing_planting: [0, 0.1 + H + 0.1, 0], mount_fork_slots: [0, 0.05, 0.28] } }
    },
  })
}

export function createPreview(options: CargoPreviewOptions = {}): CargoPreview {
  return createStreetPreview(createModel(), ENVELOPE, { distance: 3.6, pitch: 0.3, ...options })
}
