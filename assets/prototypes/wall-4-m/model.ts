import { createWallModel, createWallPreview, WALL, type WallModel, type WallPreview } from '../axiom-wall-kit/index.ts'
import { runFace, straightRun } from '../axiom-wall-kit/straight.ts'

/**
 * Axiom Relay wall, 4 m — one full structural bay.
 *
 * This is the group's reference length: the kit's grid is 4 m, so this module is
 * exactly what one bay of a prefab shell's elevation is, lifted out and given a
 * footing, two ends, and a coping so it can stand on its own. Everything else in
 * the straight-wall family is this piece made longer, shorter, or opened.
 */

const LENGTH = 4
const ENVELOPE = { width: LENGTH + 0.22, depth: WALL.thickness + 0.24, height: WALL.top + 0.12 }

export function createModel(): WallModel {
  return createWallModel({
    id: 'wall-4-m',
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
