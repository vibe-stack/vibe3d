import { createRoofModel, createRoofPreview, ROOF, type RoofModel, type RoofPreview } from '../axiom-roof-kit/index.ts'
import { block, curb, deck } from '../axiom-roof-kit/deck.ts'

/**
 * Axiom Relay vented roof panel — a bay of deck that breathes.
 *
 * The counterpart to the flat roof: same 4 m bay, same slab and membrane, but
 * the middle of it is a weathered air path instead of a sealed surface. It is
 * what sits over a plant room, a stair pressurisation shaft, or anything that
 * has to move air without a machine standing on the roof to do it.
 *
 * The blades face *down and outward* on all four sides of a raised hood rather
 * than lying flat in the deck. A louvre lying in a horizontal surface is a drain
 * with a grille over it: rain lands straight in it. Raising the opening onto a
 * hood and turning the blades to the side is the only arrangement that both
 * passes air and sheds water.
 */

const SIZE = ROOF.grid
const HOOD = 1.9
const HOOD_H = 0.62
const BLADES = 5
const ENVELOPE = { width: SIZE, depth: SIZE, height: HOOD_H + 0.32 }

export function createModel(): RoofModel {
  return createRoofModel({
    id: 'vented-roof-panel',
    envelope: ENVELOPE,
    build: ({ m, part }) => {
      const panel = part('panel')
      deck(panel, m, SIZE, SIZE)
      curb(panel, m, HOOD + 0.3, HOOD + 0.3, 0.3)

      // The shaft below, so the hood opens onto something.
      for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const w = sx !== 0 ? 0.04 : HOOD - 0.2
        const d = sz !== 0 ? 0.04 : HOOD - 0.2
        block(panel, m.ink, [w, 0.6, d], [sx * (HOOD - 0.2) / 2, -0.54, sz * (HOOD - 0.2) / 2])
      }
      block(panel, m.ink, [HOOD - 0.2, 0.02, HOOD - 0.2], [0, -0.84, 0])

      // Hood: corner posts, a lid, and blades on all four faces.
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
        block(panel, m.graphite, [0.1, HOOD_H, 0.1], [sx * HOOD / 2, 0.3 + HOOD_H / 2, sz * HOOD / 2])
      }
      block(panel, m.graphite, [HOOD + 0.26, 0.08, HOOD + 0.26], [0, 0.3 + HOOD_H + 0.04, 0])
      block(panel, m.deck, [HOOD + 0.16, 0.04, HOOD + 0.16], [0, 0.3 + HOOD_H + 0.1, 0])

      for (let index = 0; index < BLADES; index += 1) {
        const y = 0.36 + ((index + 0.5) / BLADES) * (HOOD_H - 0.12)
        for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const w = sx !== 0 ? 0.05 : HOOD - 0.12
          const d = sz !== 0 ? 0.05 : HOOD - 0.12
          block(panel, m.steel, [w, (HOOD_H - 0.12) / BLADES * 0.7, d], [
            sx * HOOD / 2, y, sz * HOOD / 2,
          ], [sz !== 0 ? -sz * 0.55 : 0, 0, sx !== 0 ? sx * 0.55 : 0])
        }
      }
      // Bird mesh inside the blades: the dark plane they read against.
      for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const w = sx !== 0 ? 0.02 : HOOD - 0.2
        const d = sz !== 0 ? 0.02 : HOOD - 0.2
        block(panel, m.ink, [w, HOOD_H - 0.14, d], [sx * (HOOD / 2 - 0.09), 0.3 + HOOD_H / 2, sz * (HOOD / 2 - 0.09)])
      }
    },
  })
}

export function createPreview(options: { aspect?: number } = {}): RoofPreview {
  return createRoofPreview(createModel(), ENVELOPE, { distance: 8.2, pitch: 0.36, ...options })
}
