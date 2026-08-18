import { createRoofModel, createRoofPreview, ROOF, type RoofModel, type RoofPreview } from '../axiom-roof-kit/index.ts'
import { block, deck } from '../axiom-roof-kit/deck.ts'

/**
 * Axiom Relay sloped roof — the shed bay.
 *
 * A single-direction shed rather than a ridge, because a ridge implies a gable
 * and the Axiom shell has no gable to give it. A shed slope reads as *drainage*
 * on a flat-roofed building, which is what it is, rather than as a house roof
 * pasted onto a facility.
 *
 * It is built as stepped bays on a raking frame, not as a tilted slab: the
 * cassettes in this system are flat pressings, and a genuinely raked plate would
 * be a second fabrication method the kit does not have. Each step's riser is a
 * real vertical face — that riser is the whole silhouette. The first pass ran a
 * 0.9 m rise across a 4 m bay in six 60 mm steps, and at that ratio the risers
 * were shorter than the panels were thick, so the thing read as a flat card
 * lying on a slab from every angle that mattered.
 */

const SIZE = ROOF.grid
const RISE = 1.7
const STEPS = 5
const PANEL = 0.09
const ENVELOPE = { width: SIZE, depth: SIZE, height: RISE + 0.5 }

export function createModel(): RoofModel {
  return createRoofModel({
    id: 'sloped-sci-fi-roof',
    envelope: ENVELOPE,
    build: ({ m, part }) => {
      const roof = part('roof')
      deck(roof, m, SIZE, SIZE)

      const run = SIZE / STEPS
      const lift = RISE / STEPS

      // Raking frame: three trusses carrying the steps, stepped rather than
      // tilted so each panel lands flat on something.
      for (const sx of [-1, 0, 1] as const) {
        for (let index = 0; index < STEPS; index += 1) {
          const y = index * lift
          block(roof, m.graphite, [0.12, y + 0.16, run], [
            sx * (SIZE / 2 - 0.32), (y + 0.16) * 0.5, -SIZE / 2 + (index + 0.5) * run,
          ])
        }
      }

      // Steps: a flat tread and a real riser at each change of level. The riser
      // is in the light tier so the slope reads as a stair of highlights.
      for (let index = 0; index < STEPS; index += 1) {
        const y = index * lift
        const z = -SIZE / 2 + (index + 0.5) * run
        block(roof, m.shell, [SIZE - 0.2, PANEL, run + 0.05], [0, y + 0.2, z])
        block(roof, m.porcelain, [SIZE - 0.16, lift, 0.07], [0, y + 0.2 + lift * 0.5, z + run * 0.5])
        // Standing seam where the water crosses from one panel to the next.
        block(roof, m.steel, [SIZE - 0.18, 0.06, 0.06], [0, y + 0.26, z + run * 0.5])
        // Fixing clips along each tread.
        for (let n = 0; n < 4; n += 1) {
          block(roof, m.steel, [0.07, 0.03, 0.07], [-1.4 + n * 0.93, y + 0.25, z])
        }
      }

      // Verge trims down both rakes, stepped with the panels they close.
      for (const sx of [-1, 1] as const) {
        for (let index = 0; index < STEPS; index += 1) {
          const y = index * lift
          block(roof, m.graphite, [0.1, PANEL + lift * 0.6, run + 0.05], [
            sx * (SIZE / 2 - 0.04), y + 0.22, -SIZE / 2 + (index + 0.5) * run,
          ])
        }
      }
      // Eaves gutter at the low end, ridge closure at the high end.
      block(roof, m.graphite, [SIZE + 0.1, 0.2, 0.26], [0, 0.16, -SIZE / 2 - 0.08])
      block(roof, m.ink, [SIZE - 0.06, 0.1, 0.16], [0, 0.22, -SIZE / 2 - 0.08])
      block(roof, m.porcelain, [SIZE + 0.06, 0.09, 0.24], [0, RISE + 0.28, SIZE / 2 - 0.06])
      block(roof, m.graphite, [SIZE + 0.02, 0.28, 0.14], [0, RISE + 0.1, SIZE / 2 - 0.02])

      return {
        sockets: {
          roof_eaves: [0, 0.16, -SIZE / 2],
          roof_ridge: [0, RISE + 0.28, SIZE / 2],
        },
      }
    },
  })
}

export function createPreview(options: { aspect?: number } = {}): RoofPreview {
  return createRoofPreview(createModel(), ENVELOPE, { distance: 9.6, pitch: 0.26, yaw: -0.82, ...options })
}
