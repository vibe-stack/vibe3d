import { createRoofModel, createRoofPreview, ROOF, type RoofModel, type RoofPreview } from '../axiom-roof-kit/index.ts'
import { block, curb, deck } from '../axiom-roof-kit/deck.ts'

/**
 * Axiom Relay roof machinery pad — the mounting field.
 *
 * Not a plant item: the *ground* a plant item stands on. Rooftop equipment is
 * never fixed to the deck itself, it stands on rails carried by curbs, with the
 * gap under it kept clear so the membrane can be inspected and replaced without
 * moving the machine. This module is exactly that arrangement and nothing else,
 * so any piece of plant in the library can be dropped onto it.
 *
 * The anti-vibration mounts on top of the rails are what make it read as a
 * machine base rather than as a low wall. Plant that is bolted rigid to a
 * building transmits everything it does into the building.
 */

const W = 3.2
const D = 2.4
const ENVELOPE = { width: W + 0.6, depth: D + 0.6, height: 0.62 }

export function createModel(): RoofModel {
  return createRoofModel({
    id: 'roof-machinery-pad',
    envelope: ENVELOPE,
    build: ({ m, part }) => {
      const pad = part('pad')
      deck(pad, m, W + 0.6, D + 0.6)

      // Two curbs running the short way, so condensate can cross under the plant.
      for (const side of [-1, 1] as const) {
        curb(pad, m, 0.36, D, 0.3, [side * (W / 2 - 0.3), 0, 0])
        // Bearing rail on top of the curb, and the anti-vibration mounts on it.
        block(pad, m.steel, [0.28, 0.06, D - 0.1], [side * (W / 2 - 0.3), 0.38, 0])
        for (let index = 0; index < 3; index += 1) {
          const z = -D / 2 + 0.4 + index * ((D - 0.8) / 2)
          block(pad, m.ink, [0.2, 0.07, 0.2], [side * (W / 2 - 0.3), 0.44, z])
          block(pad, m.graphite, [0.24, 0.05, 0.24], [side * (W / 2 - 0.3), 0.5, z])
        }
      }

      // Service walkway between the curbs: the clear route the layout exists for.
      block(pad, m.deck, [W - 0.9, 0.02, D - 0.4], [0, 0.011, 0])
      for (let index = 0; index < 5; index += 1) {
        block(pad, m.ink, [0.03, 0.016, D - 0.5], [-W / 2 + 0.7 + index * ((W - 1.4) / 4), 0.02, 0])
      }
      // Hazard edging where the walkway meets the curbs.
      for (const side of [-1, 1] as const) {
        block(pad, m.amber, [0.05, 0.014, D - 0.4], [side * (W / 2 - 0.52), 0.022, 0])
      }
      // Service isolator on its own small curb at the pad's edge.
      curb(pad, m, 0.34, 0.28, 0.22, [0, 0, -D / 2 - 0.1])
      block(pad, m.graphite, [0.28, 0.36, 0.2], [0, 0.42, -D / 2 - 0.1])
      block(pad, m.cyan, [0.1, 0.03, 0.02], [0, 0.52, -D / 2 - 0.21])
    },
  })
}

export function createPreview(options: { aspect?: number } = {}): RoofPreview {
  return createRoofPreview(createModel(), ENVELOPE, { distance: 7.6, pitch: 0.42, ...options })
}
