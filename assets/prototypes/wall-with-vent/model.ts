import { facePrism } from '../axiom-modular-kit/parts.ts'
import { createWallModel, createWallPreview, WALL, type WallModel, type WallPreview } from '../axiom-wall-kit/index.ts'
import { runFace, straightRun } from '../axiom-wall-kit/straight.ts'

/**
 * Axiom Relay wall with vent — one bay carrying a plant-side louvre bank.
 *
 * The vent is cut as a *window* opening rather than as a louvre panel stuck on
 * the wall, and that is the point: it uses the kit's own aperture, so the reveal
 * runs the full wall thickness behind the blades and the frame is the same
 * stepped section as every other opening. A louvre grille surface-mounted on a
 * solid bay has no depth behind it, and every glancing camera angle says so.
 *
 * The blades are set back inside the reveal, with a bird mesh behind them and a
 * drained sill below — the three parts that make an opening in a wall read as
 * ventilation rather than as a window someone forgot to glaze.
 */

const LENGTH = 4
const ENVELOPE = { width: LENGTH + 0.22, depth: WALL.thickness + 0.24, height: WALL.top + 0.12 }
const VENT = { width: 1.9, sill: 1.32, head: 2.6 } as const
const BLADES = 7

export function createModel(): WallModel {
  return createWallModel({
    id: 'wall-with-vent',
    envelope: ENVELOPE,
    build: ({ m, part, section }) => {
      const wall = part('wall')
      const face = runFace()
      straightRun(wall, m, face, LENGTH, (u0, u1) => {
        section(wall, face, u0, u1, {
          opening: {
            kind: 'window',
            spec: { centre: 0, width: VENT.width, sill: VENT.sill, head: VENT.head, clip: [0.2, 0.2, 0.2, 0.2] },
          },
        })
      })

      // Bird mesh, deep in the reveal: the dark plane the blades read against.
      facePrism(wall, face, m.ink, [VENT.width - 0.1, VENT.head - VENT.sill - 0.1, 0.02], 0, (VENT.sill + VENT.head) / 2, -0.06, {
        fillet: 0.006, bevel: 0.005,
      })

      // Blades, raked down and out so rain sheds and sight lines are blocked.
      const span = VENT.head - VENT.sill - 0.14
      for (let index = 0; index < BLADES; index += 1) {
        const y = VENT.sill + 0.07 + ((index + 0.5) / BLADES) * span
        facePrism(wall, face, m.steel, [VENT.width - 0.14, span / BLADES * 0.72, 0.05], 0, y, 0.03, {
          fillet: 0.006, bevel: 0.006, rotation: [-0.55, 0, 0],
        })
      }
      // Mullion splitting the bank, and the drained sill under it.
      facePrism(wall, face, m.graphite, [0.06, VENT.head - VENT.sill - 0.06, 0.09], 0, (VENT.sill + VENT.head) / 2, 0.04, {
        fillet: 0.01, bevel: 0.009,
      })
      facePrism(wall, face, m.graphite, [VENT.width - 0.04, 0.06, 0.14], 0, VENT.sill + 0.01, 0.05, {
        fillet: 0.012, bevel: 0.01, rotation: [0.22, 0, 0],
      })
    },
  })
}

export function createPreview(options: { aspect?: number } = {}): WallPreview {
  return createWallPreview(createModel(), ENVELOPE, options)
}
