import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import { createRoofModel, createRoofPreview, type RoofModel, type RoofPreview } from '../axiom-roof-kit/index.ts'
import { block, curb, deck } from '../axiom-roof-kit/deck.ts'

/**
 * Axiom Relay rooftop HVAC foundation — the serviced plant base.
 *
 * Where `roof-machinery-pad` is bare structure, this is the base with its
 * services already brought up: a flow and return pair, a condensate drain, a
 * power gland, and the isolator they all land on. Those five things are what
 * turn a place to stand a machine into a place a machine can actually run, and
 * they are also what a level builder cannot easily add afterwards, because each
 * one is a penetration through the deck and every penetration needs its own
 * sealed sleeve.
 *
 * The pipes rise on a stand rather than turning straight down into the deck.
 * A pipe entering a roof vertically has nowhere for its sleeve to shed water.
 */

const W = 2.6
const D = 2
const ENVELOPE = { width: W + 0.8, depth: D + 0.8, height: 1.5 }

export function createModel(): RoofModel {
  return createRoofModel({
    id: 'rooftop-hvac-foundation',
    envelope: ENVELOPE,
    build: ({ m, part }) => {
      const base = part('foundation')
      deck(base, m, W + 0.8, D + 0.8)
      curb(base, m, W, D, 0.34)
      block(base, m.deck, [W - 0.12, 0.05, D - 0.12], [0, 0.4, 0])

      // Bearer rails and anti-vibration mounts across the curb.
      for (const side of [-1, 1] as const) {
        block(base, m.steel, [W - 0.3, 0.06, 0.2], [0, 0.45, side * (D / 2 - 0.28)])
        for (let index = 0; index < 3; index += 1) {
          const x = -W / 2 + 0.4 + index * ((W - 0.8) / 2)
          block(base, m.ink, [0.18, 0.07, 0.18], [x, 0.51, side * (D / 2 - 0.28)])
        }
      }

      // Pipe stand: flow and return rising to a machine's connection height.
      const stand = W / 2 + 0.24
      curb(base, m, 0.4, 0.5, 0.24, [stand, 0, -0.3])
      for (const [dz, material] of [[-0.12, m.graphite], [0.12, m.steel]] as const) {
        base.add(cylinder(material, 0.055, 0.86, [stand, 0.24 + 0.43, -0.3 + dz], [0, 0, 0], 12))
        base.add(cylinder(material, 0.055, 0.34, [stand - 0.17, 1.1, -0.3 + dz], [0, 0, Math.PI / 2], 12))
        block(base, m.ink, [0.13, 0.06, 0.13], [stand, 0.3, -0.3 + dz])
      }
      // Condensate drain: a trapped fall back to the deck outlet.
      base.add(cylinder(m.ink, 0.03, 0.5, [stand - 0.14, 0.28, -0.3 + 0.3], [0, 0, 0.9], 8))

      // Power gland and the isolator it feeds.
      curb(base, m, 0.34, 0.3, 0.22, [-stand, 0, 0.4])
      block(base, m.graphite, [0.3, 0.42, 0.22], [-stand, 0.43, 0.4])
      block(base, m.steel, [0.1, 0.12, 0.06], [-stand, 0.7, 0.52])
      block(base, m.cyan, [0.12, 0.03, 0.02], [-stand, 0.56, 0.52])
      base.add(cylinder(m.ink, 0.045, 0.4, [-stand + 0.02, 0.36, 0.28], [0.7, 0, 0], 10))
    },
  })
}

export function createPreview(options: { aspect?: number } = {}): RoofPreview {
  return createRoofPreview(createModel(), ENVELOPE, { distance: 7.2, pitch: 0.34, ...options })
}
