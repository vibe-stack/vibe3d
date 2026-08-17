import { createWallModel, createWallPreview, WALL, type WallModel, type WallPreview } from '../axiom-wall-kit/index.ts'
import { runFace, straightRun } from '../axiom-wall-kit/straight.ts'

/**
 * Axiom Relay wall with door — one bay with the kit's standard door bay cut in.
 *
 * The opening is not a hole this module invented. `buildWallSection` is the same
 * function the prefab shells call, and the door it cuts is the kit's 1.56 m
 * clear width on the shared head datum, complete with the stepped frame: proud
 * outer flange, inward lip, and a reveal lining the jamb through the full 300 mm
 * of wall. That is the whole reason to build this as a wall variant rather than
 * as a wall with a door prop parked in it — a level builder can swap this module
 * for a solid bay and the elevation still lines up.
 */

const LENGTH = 4
const ENVELOPE = { width: LENGTH + 0.22, depth: WALL.thickness + 0.24, height: WALL.top + 0.12 }

export function createModel(): WallModel {
  return createWallModel({
    id: 'wall-with-door',
    envelope: ENVELOPE,
    build: ({ m, part, section }) => {
      const wall = part('wall')
      const face = runFace()
      straightRun(wall, m, face, LENGTH, (u0, u1) => {
        section(wall, face, u0, u1, {
          opening: {
            kind: 'door',
            // Centred on the bay, on the kit's own door datums.
            spec: { centre: 0, width: 1.56, sill: WALL.base, head: 2.6, clip: [0.3, 0.3, 0, 0] },
          },
        })
      })
    },
  })
}

export function createPreview(options: { aspect?: number } = {}): WallPreview {
  return createWallPreview(createModel(), ENVELOPE, options)
}
