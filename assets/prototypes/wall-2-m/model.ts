import { createWallModel, createWallPreview, WALL, type WallModel, type WallPreview } from '../axiom-wall-kit/index.ts'
import { runFace, straightRun } from '../axiom-wall-kit/straight.ts'

/**
 * Axiom Relay wall, 2 m — the half-bay run.
 *
 * The kit's structural grid is 4 m, so a 2 m wall is not a small wall, it is the
 * piece that lets a plan close on a half-bay: the offset between a 4 m module
 * and a corner, the infill beside a door bay, the short return into a recess.
 * It is cut from the same `buildWallSection` the prefab shells use, so its
 * cassette rhythm, skirt height, and thickness cannot drift away from the walls
 * it butts against.
 */

const LENGTH = 2
const ENVELOPE = { width: LENGTH + 0.22, depth: WALL.thickness + 0.24, height: WALL.top + 0.12 }

export function createModel(): WallModel {
  return createWallModel({
    id: 'wall-2-m',
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
