import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import { createRoofModel, createRoofPreview, type RoofModel, type RoofPreview } from '../axiom-roof-kit/index.ts'
import { block, curb } from '../axiom-roof-kit/deck.ts'

/**
 * Axiom Relay roof access box — the stair head.
 *
 * The way onto a roof, and the reason a roof has a door at all. It is a small
 * building in its own right: a curb, a shell, a single outward-opening leaf, and
 * a canopy over it — outward because a door that opens inward at the top of a
 * stair opens onto the stair.
 *
 * The grab rail beside the door and the tread plate in front of it are the parts
 * that give the module its scale. Without them it is a box; with them it is
 * obviously something a person steps out of.
 */

const W = 1.6
const D = 1.9
const H = 2.35
const ENVELOPE = { width: W + 0.5, depth: D + 0.6, height: H + 0.28 }

export function createModel(): RoofModel {
  return createRoofModel({
    id: 'roof-access-box',
    envelope: ENVELOPE,
    build: ({ m, part }) => {
      const box = part('box')
      curb(box, m, W + 0.3, D + 0.3, 0.3)

      // Shell: shoulders in above the curb, so the curb reads as what carries it.
      block(box, m.shell, [W, H - 0.32, D], [0, 0.32 + (H - 0.32) / 2, 0])
      block(box, m.graphite, [W + 0.1, 0.12, D + 0.1], [0, H - 0.06, 0])
      // Slight fall on the lid, draining to the back.
      block(box, m.deck, [W - 0.06, 0.05, D - 0.06], [0, H + 0.03, -0.02], [0.03, 0, 0])

      // Door: a recessed leaf in the front face, with its own frame and threshold.
      block(box, m.ink, [0.96, 2.02, 0.09], [0, 1.31, D / 2 - 0.02])
      block(box, m.porcelain, [0.86, 1.94, 0.06], [0, 1.31, D / 2 + 0.015])
      for (const side of [-1, 1] as const) block(box, m.graphite, [0.05, 1.98, 0.1], [side * 0.46, 1.31, D / 2 + 0.01])
      block(box, m.steel, [0.05, 0.4, 0.06], [0.3, 1.24, D / 2 + 0.055])
      block(box, m.cyan, [0.22, 0.03, 0.02], [0, 2.32, D / 2 + 0.05])
      // Tread plate on the deck in front of the door.
      block(box, m.steel, [1.1, 0.03, 0.5], [0, 0.02, D / 2 + 0.32])

      // Canopy over the door, on two brackets.
      block(box, m.graphite, [W + 0.24, 0.07, 0.44], [0, H - 0.42, D / 2 + 0.18])
      for (const side of [-1, 1] as const) {
        block(box, m.steel, [0.05, 0.3, 0.3], [side * (W / 2 - 0.14), H - 0.6, D / 2 + 0.1], [-0.78, 0, 0])
      }

      // Grab rail beside the door, and the vent that keeps the stair dry.
      box.add(cylinder(m.steel, 0.024, 1.1, [0.62, 1.3, D / 2 + 0.04], [0, 0, 0], 8))
      for (const y of [0.78, 1.82]) {
        box.add(cylinder(m.steel, 0.018, 0.14, [0.62, y, D / 2 - 0.02], [Math.PI / 2, 0, 0], 8))
      }
      block(box, m.ink, [0.5, 0.34, 0.05], [0, 1.9, -D / 2 - 0.01])
      for (let index = 0; index < 4; index += 1) {
        block(box, m.steel, [0.46, 0.05, 0.04], [0, 1.78 + index * 0.08, -D / 2 - 0.03], [-0.5, 0, 0])
      }
    },
  })
}

export function createPreview(options: { aspect?: number } = {}): RoofPreview {
  return createRoofPreview(createModel(), ENVELOPE, { distance: 7.4, pitch: 0.24, yaw: -0.72, ...options })
}
