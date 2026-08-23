import { createWallModel, createWallPreview, WALL, type WallModel, type WallPreview } from '../axiom-wall-kit/index.ts'
import { runFace, straightRun } from '../axiom-wall-kit/straight.ts'

/**
 * Axiom Relay wall with window — one bay with the kit's standard window cut in.
 *
 * Same argument as the door variant, and one extra datum: the window's 1.32 m
 * sill is shared with every window bay in the kit, so a run assembled from these
 * has a continuous sill line across the elevation. A sill chosen per module is
 * the single fastest way to make a procedural facade look assembled by accident.
 */

const LENGTH = 4
const ENVELOPE = { width: LENGTH + 0.22, depth: WALL.thickness + 0.24, height: WALL.top + 0.12 }

export function createModel(): WallModel {
  return createWallModel({
    id: 'wall-with-window',
    envelope: ENVELOPE,
    build: ({ m, part, section }) => {
      const wall = part('wall')
      const face = runFace()
      straightRun(wall, m, face, LENGTH, (u0, u1) => {
        section(wall, face, u0, u1, {
          opening: {
            kind: 'window',
            spec: { centre: 0, width: 1.9, sill: 1.32, head: 2.6, clip: [0.2, 0.2, 0.2, 0.2] },
          },
        })
      })
    },
  })
}

export function createPreview(options: { aspect?: number } = {}): WallPreview {
  return createWallPreview(createModel(), ENVELOPE, options)
}
