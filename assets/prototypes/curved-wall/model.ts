import { wallFace } from '../axiom-modular-kit/parts.ts'
import { createWallModel, createWallPreview, WALL, type WallModel, type WallPreview } from '../axiom-wall-kit/index.ts'
import { coping, endReturn, footing } from '../axiom-wall-kit/straight.ts'

/**
 * Axiom Relay curved wall — a quarter-arc built from the straight kit.
 *
 * Nothing in this visual system is actually curved: the cassettes are flat
 * pressings, the frame is folded plate, and a genuinely swept wall would need a
 * second fabrication method the kit does not have. So this is a *faceted* arc —
 * eight straight chords on a 6 m radius, each a real kit section, each meeting
 * its neighbour at a 11.25-degree post.
 *
 * That is not a compromise, it is the honest answer, and it is what makes the
 * piece sit beside a straight run without looking like it came from a different
 * library. The chord length falls out of the radius and the facet count rather
 * than being chosen, so changing either keeps every segment identical.
 */

const RADIUS = 6
const FACETS = 8
const SWEEP = Math.PI / 2
const STEP = SWEEP / FACETS
const CHORD = 2 * RADIUS * Math.sin(STEP / 2)
const ENVELOPE = {
  width: RADIUS * Math.sin(SWEEP / 2) * 2 + WALL.thickness + 0.4,
  depth: RADIUS * (1 - Math.cos(SWEEP / 2)) + WALL.thickness + 0.4,
  height: WALL.top + 0.12,
}

export function createModel(): WallModel {
  return createWallModel({
    id: 'curved-wall',
    envelope: ENVELOPE,
    build: ({ m, part, section }) => {
      const wall = part('wall')
      // Centred on the arc's own mid-point, so the module's pivot is the middle
      // of the run rather than one end of it — the same convention as every
      // straight piece in the group.
      const originZ = -RADIUS * Math.cos(SWEEP / 2)
      for (let index = 0; index < FACETS; index += 1) {
        const mid = -SWEEP / 2 + (index + 0.5) * STEP
        const yaw = mid
        const face = wallFace([
          Math.sin(mid) * (RADIUS - WALL.thickness * 0.5),
          0,
          originZ + Math.cos(mid) * (RADIUS - WALL.thickness * 0.5),
        ], yaw)
        footing(wall, m, face, -CHORD / 2 - 0.06, CHORD / 2 + 0.06)
        section(wall, face, -CHORD / 2, CHORD / 2)
        coping(wall, m, face, -CHORD / 2 - 0.06, CHORD / 2 + 0.06)
        // A post at every facet's trailing end — which gives one post at each
        // joint between facets, plus one closing the far end of the arc — and a
        // single leading post opening the near end.
        if (index === 0) endReturn(wall, m, face, -CHORD / 2, -1)
        endReturn(wall, m, face, CHORD / 2, 1)
      }
    },
  })
}

export function createPreview(options: { aspect?: number } = {}): WallPreview {
  return createWallPreview(createModel(), ENVELOPE, { distance: 16, yaw: -0.42, pitch: 0.3, ...options })
}
