import { facePrism } from '../axiom-modular-kit/parts.ts'
import { createWallModel, createWallPreview, WALL, type WallModel, type WallPreview } from '../axiom-wall-kit/index.ts'
import { runFace, straightRun } from '../axiom-wall-kit/straight.ts'

/**
 * Axiom Relay wall with inset panel — one bay with a recessed service niche.
 *
 * The niche is the kit's answer to everything a wall has to carry that is not a
 * door or a window: an isolator, a hose reel, a hydrant, a comms head, a bay
 * number. Rather than adding a variant per fitting, this module provides the
 * recess, its lit lip, and a blank backboard drilled on a regular pitch — the
 * fitting is then whatever a level builder mounts to it.
 *
 * The recess stops well short of the wall's own thickness. Cut through, it would
 * be an opening; at 120 mm it is a niche, and the difference is that the wall
 * behind it still does its job.
 */

const LENGTH = 4
const ENVELOPE = { width: LENGTH + 0.22, depth: WALL.thickness + 0.24, height: WALL.top + 0.12 }
const NICHE = { width: 1.4, base: 0.94, top: 2.24, depth: 0.12 } as const

export function createModel(): WallModel {
  return createWallModel({
    id: 'wall-with-inset-panel',
    envelope: ENVELOPE,
    build: ({ m, part, section }) => {
      const wall = part('wall')
      const face = runFace()
      straightRun(wall, m, face, LENGTH, (u0, u1) => {
        section(wall, face, u0, u1)
      })

      const height = NICHE.top - NICHE.base
      const centreY = (NICHE.base + NICHE.top) / 2
      const front = WALL.thickness * 0.5

      // The recess: a dark box let into the face, and the lip that frames it.
      facePrism(wall, face, m.ink, [NICHE.width, height, NICHE.depth], 0, centreY, front - NICHE.depth * 0.5 + 0.004, {
        fillet: 0.012, bevel: 0.01,
      })
      facePrism(wall, face, m.graphite, [NICHE.width + 0.1, height + 0.1, 0.05], 0, centreY, front - 0.006, {
        fillet: 0.016, bevel: 0.014,
      })
      // Backboard on a drilled pitch, so a fitting has somewhere real to bolt.
      facePrism(wall, face, m.deck, [NICHE.width - 0.12, height - 0.12, 0.03], 0, centreY, front - NICHE.depth + 0.02, {
        fillet: 0.008, bevel: 0.007,
      })
      for (let column = 0; column < 3; column += 1) {
        for (let row = 0; row < 4; row += 1) {
          facePrism(wall, face, m.steel, [0.035, 0.035, 0.016], (column - 1) * 0.42, NICHE.base + 0.2 + row * ((height - 0.4) / 3), front - NICHE.depth + 0.04, {
            fillet: 0.005, bevel: 0.004,
          })
        }
      }
      // Lit lip along the head of the recess: the niche's only signal.
      facePrism(wall, face, m.cyan, [NICHE.width - 0.16, 0.03, 0.02], 0, NICHE.top - 0.05, front - 0.03, {
        fillet: 0.005, bevel: 0.004,
      })
    },
  })
}

export function createPreview(options: { aspect?: number } = {}): WallPreview {
  return createWallPreview(createModel(), ENVELOPE, options)
}
