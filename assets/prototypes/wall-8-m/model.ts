import { createWallModel, createWallPreview, WALL, type WallModel, type WallPreview } from '../axiom-wall-kit/index.ts'
import { runFace, straightRun } from '../axiom-wall-kit/straight.ts'

/**
 * Axiom Relay wall, 8 m — two bays in one run.
 *
 * Two bays rather than a doubled 4 m module, which matters at the joint: butting
 * two 4 m modules leaves two end returns back to back in the middle of a
 * straight wall, and a straight wall with a seam every 4 m reads as fencing.
 * Authored as one 8 m section the cassette rhythm runs continuously and the ends
 * are the only ends.
 */

const LENGTH = 8
const ENVELOPE = { width: LENGTH + 0.22, depth: WALL.thickness + 0.24, height: WALL.top + 0.12 }

export function createModel(): WallModel {
  return createWallModel({
    id: 'wall-8-m',
    envelope: ENVELOPE,
    build: ({ m, part, section }) => {
      const wall = part('wall')
      const face = runFace()
      straightRun(wall, m, face, LENGTH, (u0, u1) => {
        section(wall, face, u0, u1)
      })
    },
  })
}

export function createPreview(options: { aspect?: number } = {}): WallPreview {
  return createWallPreview(createModel(), ENVELOPE, options)
}
