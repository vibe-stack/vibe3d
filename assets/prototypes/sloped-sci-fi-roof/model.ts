import { createRoofModel, createRoofPreview, ROOF, type RoofModel, type RoofPreview } from '../axiom-roof-kit/index.ts'
import { block, deck } from '../axiom-roof-kit/deck.ts'

/**
 * Axiom Relay sloped roof — the shed bay.
 *
 * The kit's only pitched deck, and it is a single-direction shed rather than a
 * ridge, because a ridge implies a gable and the Axiom shell has no gable to
 * give it. A shed slope reads as *drainage* on a flat-roofed building — which is
 * what it is — rather than as a house roof pasted onto a facility.
 *
 * It is built as stepped bays on a raised frame, not as a tilted slab. The
 * cassettes are flat pressings in this system; a genuinely raked plate would be
 * a second fabrication method the kit does not have, and the steps are what let
 * each pressing stay flat while the surface as a whole falls.
 */

const SIZE = ROOF.grid
const RISE = 0.9
const STEPS = 6
const ENVELOPE = { width: SIZE, depth: SIZE, height: RISE + 0.4 }

export function createModel(): RoofModel {
  return createRoofModel({
    id: 'sloped-sci-fi-roof',
    envelope: ENVELOPE,
    build: ({ m, part }) => {
      const roof = part('roof')
      deck(roof, m, SIZE, SIZE)

      // Raking frame: the trusses the stepped panels sit on.
      for (const sx of [-1, 0, 1] as const) {
        block(roof, m.graphite, [0.11, 0.14, SIZE - 0.1], [sx * (SIZE / 2 - 0.3), RISE * 0.5, 0], [-Math.atan2(RISE, SIZE), 0, 0])
      }
      for (let index = 0; index <= STEPS; index += 1) {
        const z = -SIZE / 2 + (index / STEPS) * SIZE
        const y = (index / STEPS) * RISE
        block(roof, m.graphite, [SIZE - 0.2, 0.1, 0.1], [0, Math.max(0.02, y - 0.03), z])
      }

      // Stepped panels: each flat, each lapped over the one below it.
      //
      // The run starts at the deck rather than at half a step above it. Lifted
      // clear the whole slope floated over its own deck with daylight under the
      // eaves, which read as two separate objects rather than as a roof.
      for (let index = 0; index < STEPS; index += 1) {
        const z = -SIZE / 2 + ((index + 0.5) / STEPS) * SIZE
        const y = (index / STEPS) * RISE
        block(roof, m.shell, [SIZE - 0.26, 0.06, SIZE / STEPS + 0.06], [0, y + 0.09, z])
        // The lap: a raised standing seam at every step, which is where the
        // water crosses from one panel to the next.
        block(roof, m.steel, [SIZE - 0.24, 0.05, 0.05], [0, y + 0.14, z + SIZE / STEPS * 0.5])
        // Riser closing the step's open end, so each lap is a solid face.
        block(roof, m.graphite, [SIZE - 0.26, RISE / STEPS + 0.04, 0.05], [0, y + 0.09 + RISE / STEPS * 0.5, z + SIZE / STEPS * 0.5])
      }

      // Verge trims down both rakes, and the eaves gutter at the low end.
      for (const sx of [-1, 1] as const) {
        block(roof, m.graphite, [0.12, 0.16, SIZE + 0.1], [sx * (SIZE / 2 - 0.05), RISE * 0.5 + 0.12, 0], [-Math.atan2(RISE, SIZE), 0, 0])
      }
      block(roof, m.graphite, [SIZE + 0.1, 0.16, 0.24], [0, 0.06, -SIZE / 2 - 0.06])
      block(roof, m.ink, [SIZE - 0.06, 0.08, 0.16], [0, 0.11, -SIZE / 2 - 0.06])
      // Ridge closure at the high end, capping the top step.
      block(roof, m.graphite, [SIZE + 0.06, 0.2, 0.2], [0, RISE + 0.12, SIZE / 2 - 0.02])
    },
  })
}

export function createPreview(options: { aspect?: number } = {}): RoofPreview {
  // Pitched well above the group default: a 0.9 m rise across a 4 m bay is a
  // shallow slope, and from a low angle the module reads as a flat plate seen
  // edge-on rather than as a fall.
  return createRoofPreview(createModel(), ENVELOPE, { distance: 11.2, pitch: 0.5, yaw: -0.8, ...options })
}
