import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import { AXIS_X, AXIS_Z } from '../axiom-cargo-kit/index.ts'
import { createRoofModel, createRoofPreview, ROOF, type RoofModel, type RoofPreview } from '../axiom-roof-kit/index.ts'
import { block } from '../axiom-roof-kit/deck.ts'

/**
 * Axiom Relay rooftop railing — free-standing fall protection.
 *
 * Counterweighted rather than bolted, which is the entire design. Drilling a
 * roof to fix a handrail puts a hundred penetrations through the one layer
 * keeping water out of the building, so real roof railings stand on weighted
 * feet on rubber pads and rely on mass. That is why this module has no fixings,
 * why the feet are as heavy as they are, and why it can be placed anywhere on a
 * deck without the deck needing to know.
 */

const LENGTH = ROOF.grid
const HEIGHT = 1.1
const POSTS = 3
const ENVELOPE = { width: LENGTH, depth: 0.9, height: HEIGHT + 0.06 }

export function createModel(): RoofModel {
  return createRoofModel({
    id: 'rooftop-railing',
    envelope: ENVELOPE,
    build: ({ m, part }) => {
      const rail = part('railing')

      for (let index = 0; index < POSTS; index += 1) {
        const x = -LENGTH / 2 + (index / (POSTS - 1)) * LENGTH
        // Counterweight foot on its rubber pad, and the raking strut that stops
        // the post folding over under load.
        block(rail, m.ink, [0.44, 0.02, 0.72], [x, 0.01, 0])
        block(rail, m.graphite, [0.4, 0.11, 0.66], [x, 0.075, 0])
        block(rail, m.deck, [0.3, 0.06, 0.5], [x, 0.16, 0])
        rail.add(cylinder(m.steel, 0.032, HEIGHT - 0.19, [x, 0.19 + (HEIGHT - 0.19) / 2, 0.22], [0, 0, 0], 10))
        rail.add(cylinder(m.steel, 0.022, 0.62, [x, 0.5, -0.02], [0.62, 0, 0], 8))
      }

      // Top rail, knee rail, and the toe board at deck level.
      for (const y of [HEIGHT, HEIGHT * 0.58]) {
        rail.add(cylinder(m.steel, 0.028, LENGTH + 0.16, [0, y, 0.22], AXIS_X, 10))
      }
      block(rail, m.graphite, [LENGTH + 0.1, 0.14, 0.03], [0, 0.28, 0.29])
      // End returns, so the run does not terminate in an open pipe.
      for (const side of [-1, 1] as const) {
        rail.add(cylinder(m.steel, 0.028, 0.42, [side * (LENGTH / 2 + 0.08), HEIGHT, 0.02], AXIS_Z, 10))
      }
    },
  })
}

export function createPreview(options: { aspect?: number } = {}): RoofPreview {
  return createRoofPreview(createModel(), ENVELOPE, { distance: 7.2, pitch: 0.26, ...options })
}
