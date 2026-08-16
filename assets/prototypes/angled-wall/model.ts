import { wallFace } from '../axiom-modular-kit/parts.ts'
import { createWallModel, createWallPreview, WALL, type WallModel, type WallPreview } from '../axiom-wall-kit/index.ts'
import { coping, endReturn, footing } from '../axiom-wall-kit/straight.ts'

/**
 * Axiom Relay angled wall — two runs meeting at an obtuse corner.
 *
 * The kit already has 90-degree corners; what it has no way to express is a plan
 * that turns by less than a right angle — a street that bends, a compound that
 * follows a contour, a frontage cut back from a junction. This module is that
 * turn: two 2 m runs at 135 degrees, sharing one post at the vertex.
 *
 * The vertex post is the whole design problem. Two cassette runs mitred directly
 * into each other leave a feather edge at the inside of the angle and a visible
 * seam at the outside, so instead both runs stop short of the vertex and a
 * full-height post fills it. That is also how the kit's own right-angle corners
 * are built, which is why this piece sits beside them without argument.
 */

const LEG = 2
const ANGLE = Math.PI / 4
const ENVELOPE = {
  width: (LEG + 0.4) * 2 * Math.cos(ANGLE / 2),
  depth: (LEG + 0.4) * Math.sin(ANGLE / 2) + WALL.thickness + 0.3,
  height: WALL.top + 0.12,
}

export function createModel(): WallModel {
  return createWallModel({
    id: 'angled-wall',
    envelope: ENVELOPE,
    build: ({ m, part, section }) => {
      const wall = part('wall')
      // Each leg runs outward from the vertex at the origin, splayed half the
      // turn either way, so the module is symmetric about +Z and the vertex post
      // is the only part either leg has to agree with.
      for (const side of [-1, 1] as const) {
        const yaw = side * ANGLE / 2
        const face = wallFace([0, 0, -WALL.thickness * 0.5], yaw)
        const u0 = side < 0 ? -(LEG + 0.24) : 0.24
        const u1 = side < 0 ? -0.24 : LEG + 0.24
        footing(wall, m, face, u0 - 0.11, u1 + 0.11)
        section(wall, face, u0, u1)
        endReturn(wall, m, face, side < 0 ? u0 : u1, side < 0 ? -1 : 1)
        coping(wall, m, face, u0 - 0.11, u1 + 0.11)
      }

      // The vertex post, filling the turn both legs stopped short of.
      const post = part('vertex-post')
      const face = wallFace([0, 0, -WALL.thickness * 0.5], 0)
      footing(post, m, face, -0.34, 0.34)
      endReturn(post, m, face, 0, 1)
      endReturn(post, m, face, 0, -1)
      coping(post, m, face, -0.34, 0.34)
    },
  })
}

export function createPreview(options: { aspect?: number } = {}): WallPreview {
  return createWallPreview(createModel(), ENVELOPE, { distance: 9.4, yaw: -0.5, ...options })
}
