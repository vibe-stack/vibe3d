import { createRoofModel, createRoofPreview, type RoofModel, type RoofPreview } from '../axiom-roof-kit/index.ts'
import { block, curb, deck } from '../axiom-roof-kit/deck.ts'

/**
 * Axiom Relay roof skylight — a glazed opening in the deck.
 *
 * Everything about it follows from the fact that it is a hole in the one surface
 * keeping weather out. It sits on a tall curb — taller than the group's default,
 * because a skylight is the penetration most likely to be sitting in standing
 * water. The glazing is raked so it sheds rather than pools. A fall-arrest grille
 * sits under the glass, since a person stepping on a rooflight in the dark is the
 * classic roof accident. And the light well below the deck is lined, so looking
 * into it from above bottoms out in a real space instead of in the deck's own
 * back faces.
 */

const OPENING = 1.6
const CURB_H = 0.42
const ENVELOPE = { width: 2.8, depth: 2.8, height: CURB_H + 0.5 }

export function createModel(): RoofModel {
  return createRoofModel({
    id: 'roof-skylight',
    envelope: ENVELOPE,
    build: ({ m, part }) => {
      const light = part('skylight')
      // The deck around the opening, drawn as four bands so the hole is real.
      const outer = 2.8
      const half = OPENING / 2 + 0.28
      for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const w = sx !== 0 ? (outer / 2 - half) : outer
        const d = sz !== 0 ? (outer / 2 - half) : half * 2
        block(light, m.graphite, [w, 0.24, d], [sx * (outer / 2 - w / 2), -0.12, sz * (outer / 2 - d / 2)])
        block(light, m.deck, [w - 0.02, 0.012, d - 0.02], [sx * (outer / 2 - w / 2), -0.006, sz * (outer / 2 - d / 2)])
      }

      curb(light, m, OPENING + 0.34, OPENING + 0.34, CURB_H)
      // Lined light well below the deck.
      for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const w = sx !== 0 ? 0.04 : OPENING
        const d = sz !== 0 ? 0.04 : OPENING
        block(light, m.ink, [w, 0.7, d], [sx * OPENING / 2, -0.6, sz * OPENING / 2])
      }
      block(light, m.ink, [OPENING, 0.02, OPENING], [0, -0.94, 0])

      // Fall-arrest grille inside the curb, under the glass.
      for (let index = 0; index < 6; index += 1) {
        const t = -OPENING / 2 + 0.12 + index * ((OPENING - 0.24) / 5)
        block(light, m.steel, [0.03, 0.03, OPENING - 0.06], [t, CURB_H - 0.06, 0])
        block(light, m.steel, [OPENING - 0.06, 0.03, 0.03], [0, CURB_H - 0.06, t])
      }

      // Raked glazing on its frame: a low pyramid rather than a flat pane.
      const rake = 0.18
      for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const w = sx !== 0 ? OPENING * 0.52 : OPENING + 0.1
        const d = sz !== 0 ? OPENING * 0.52 : OPENING + 0.1
        block(light, m.ink, [w, 0.03, d], [sx * OPENING * 0.24, CURB_H + 0.1 + rake * 0.5, sz * OPENING * 0.24],
          [sz !== 0 ? -sz * 0.34 : 0, 0, sx !== 0 ? sx * 0.34 : 0])
      }
      block(light, m.graphite, [OPENING + 0.24, 0.07, OPENING + 0.24], [0, CURB_H + 0.06, 0])
      block(light, m.steel, [0.1, 0.09, OPENING + 0.2], [0, CURB_H + 0.3, 0])
      block(light, m.steel, [OPENING + 0.2, 0.09, 0.1], [0, CURB_H + 0.3, 0])
    },
  })
}

export function createPreview(options: { aspect?: number } = {}): RoofPreview {
  return createRoofPreview(createModel(), ENVELOPE, { distance: 6.4, pitch: 0.44, ...options })
}
