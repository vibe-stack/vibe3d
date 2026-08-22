import { createRoofModel, createRoofPreview, ROOF, type RoofModel, type RoofPreview } from '../axiom-roof-kit/index.ts'
import { block, deck, outlet, parapet } from '../axiom-roof-kit/deck.ts'

/**
 * Axiom Relay flat roof — one bay of finished deck.
 *
 * The group's reference piece: a 4 m structural bay of slab, membrane, bay
 * joints, a parapet on all four sides, and the outlet the whole surface falls
 * toward. Everything else in the roof group either stands on this or replaces
 * part of it.
 *
 * "Flat" is a trade term, not a geometric one. The deck falls toward its outlet,
 * and the fall is the reason the outlet is believable — a genuinely level roof
 * with a drain in it is a roof with a puddle in it.
 */

const SIZE = ROOF.grid
const ENVELOPE = { width: SIZE, depth: SIZE, height: ROOF.parapet + ROOF.deck + 0.1 }

export function createModel(): RoofModel {
  return createRoofModel({
    id: 'flat-roof',
    envelope: ENVELOPE,
    build: ({ m, part }) => {
      const roof = part('deck')
      deck(roof, m, SIZE, SIZE)
      parapet(roof, m, SIZE, SIZE)

      // Fall: shallow wedges laid toward the outlet corner, so the surface
      // slopes rather than the slab being modelled as a tilted plate.
      for (let index = 0; index < 4; index += 1) {
        const inset = 0.4 + index * 0.42
        block(roof, m.deck, [SIZE - inset, 0.014 * (4 - index), SIZE - inset], [0.18, 0.007 * (4 - index), 0.18])
      }
      outlet(roof, m, [-SIZE / 2 + 0.62, 0, -SIZE / 2 + 0.62])
    },
  })
}

/**
 * Pitched steeper than the group default. A 1 m parapet around a 4 m bay hides
 * the deck completely from a normal three-quarter angle, and the deck — its
 * fall, its joints, its outlet — is the entire module.
 */
export function createPreview(options: { aspect?: number } = {}): RoofPreview {
  return createRoofPreview(createModel(), ENVELOPE, { distance: 9.6, pitch: 0.72, ...options })
}
