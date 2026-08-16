import { createRoofModel, createRoofPreview, ROOF, type RoofModel, type RoofPreview } from '../axiom-roof-kit/index.ts'
import { block, parapet } from '../axiom-roof-kit/deck.ts'

/**
 * Axiom Relay roof parapet — the edge upstand as a loose 4 m run.
 *
 * Shipped separately from the flat roof because a parapet is what a level
 * builder actually places: decks get generated to fit a footprint, but the edge
 * has to be walked around a plan that is rarely a single bay. This is one 4 m
 * length of it, with its coping, its membrane turn-up, and the cap-flashing
 * joint at each end that lets two runs meet without a visible seam.
 *
 * It carries no deck. A parapet module that brings its own slab cannot be placed
 * on a deck that already exists, which is the only place a parapet ever goes.
 */

const LENGTH = ROOF.grid
const HEIGHT = ROOF.parapet
const ENVELOPE = { width: LENGTH, depth: 0.38, height: HEIGHT + 0.09 }

export function createModel(): RoofModel {
  return createRoofModel({
    id: 'roof-parapet',
    envelope: ENVELOPE,
    build: ({ m, part }) => {
      const run = part('parapet')
      parapet(run, m, LENGTH, 0.18 * 2, HEIGHT, ['front'])

      // Cap-flashing joints at both ends: a lapped plate over the coping, so two
      // runs butt into a covered joint instead of an open butt.
      for (const side of [-1, 1] as const) {
        block(run, m.steel, [0.16, 0.02, 0.34], [side * (LENGTH / 2 - 0.08), HEIGHT + 0.1, 0.09])
      }
      // Counter-flashing along the outboard face, and the drip under the coping.
      block(run, m.steel, [LENGTH - 0.06, 0.05, 0.02], [0, HEIGHT - 0.14, 0.19])
      block(run, m.ink, [LENGTH + 0.06, 0.03, 0.03], [0, HEIGHT - 0.02, 0.21])
      // Restraint straps back into the deck, one per 2 m.
      for (const side of [-1, 1] as const) {
        block(run, m.steel, [0.06, 0.3, 0.16], [side * LENGTH * 0.25, 0.15, -0.06], [0.5, 0, 0])
      }
    },
  })
}

export function createPreview(options: { aspect?: number } = {}): RoofPreview {
  return createRoofPreview(createModel(), ENVELOPE, { distance: 6.6, pitch: 0.3, ...options })
}
