import { facePrism, wallFace } from '../axiom-modular-kit/parts.ts'
import { createWallModel, createWallPreview, type WallModel, type WallPreview } from '../axiom-wall-kit/index.ts'

/**
 * Axiom Relay low concrete wall — the site boundary, not a building wall.
 *
 * This is the one module in the straight-wall group that deliberately does *not*
 * use `buildWallSection`, and the reason is that it is not the same thing. The
 * kit wall is a framed composite panel system: a structural frame with light
 * cassettes clipped into it, made in a shop and bolted up on site. A boundary
 * wall is cast concrete — poured in bays against formwork, with a construction
 * joint every bay, a chamfered arris, and a weathered top.
 *
 * Building it from cassettes would give a 1.1 m tall version of a building
 * facade standing in a car park, which is exactly the mistake that makes a kit
 * feel like it was applied rather than designed. The two share the grid, the
 * palette, and the joint pitch. They do not share a construction.
 */

const LENGTH = 4
const HEIGHT = 1.1
const THICKNESS = 0.26
const BAYS = 2
const ENVELOPE = { width: LENGTH + 0.2, depth: THICKNESS + 0.34, height: HEIGHT + 0.06 }

export function createModel(): WallModel {
  return createWallModel({
    id: 'low-concrete-wall',
    envelope: ENVELOPE,
    build: ({ m, part }) => {
      const wall = part('wall')
      const face = wallFace([0, 0, -THICKNESS * 0.5], 0)

      // Splayed foundation: wider at the bottom, because a free-standing wall
      // with no building behind it is held up by its own footing.
      facePrism(wall, face, m.deck, [LENGTH + 0.2, 0.16, THICKNESS + 0.34], 0, 0.08, 0, {
        fillet: 0.02, bevel: 0.018,
      })
      facePrism(wall, face, m.deck, [LENGTH + 0.1, 0.1, THICKNESS + 0.16], 0, 0.21, 0, {
        fillet: 0.016, bevel: 0.014,
      })

      // The stem, cast in bays. Each bay is its own prism so the construction
      // joint between them is a real edge rather than a scored line.
      const bay = LENGTH / BAYS
      for (let index = 0; index < BAYS; index += 1) {
        const u = -LENGTH / 2 + (index + 0.5) * bay
        facePrism(wall, face, m.deck, [bay - 0.012, HEIGHT - 0.26, THICKNESS], u, 0.26 + (HEIGHT - 0.26) / 2, 0, {
          // A generous arris on a cast wall: the chamfer the formwork's fillet
          // leaves, not a machined edge.
          fillet: 0.014,
          bevel: 0.026,
        })
        // Lifting anchor and the recessed bay number, one per pour.
        facePrism(wall, face, m.steel, [0.09, 0.03, 0.02], u, HEIGHT - 0.12, THICKNESS * 0.5 - 0.004, {
          fillet: 0.005, bevel: 0.004,
        })
        facePrism(wall, face, m.ink, [0.16, 0.1, 0.014], u - bay * 0.3, 0.5, THICKNESS * 0.5 - 0.004, {
          fillet: 0.006, bevel: 0.005,
        })
      }

      // Weathered capping with a drip on both faces, and the kit's dark service
      // band carried across so the piece still belongs to the same world.
      facePrism(wall, face, m.graphite, [LENGTH + 0.08, 0.07, THICKNESS + 0.1], 0, HEIGHT - 0.035, 0, {
        fillet: 0.012, bevel: 0.014,
      })
      facePrism(wall, face, m.graphite, [LENGTH, 0.09, THICKNESS + 0.012], 0, 0.31, 0, {
        fillet: 0.008, bevel: 0.007,
      })

      // Impact posts at each end: what a low wall in a yard actually collects.
      for (const side of [-1, 1] as const) {
        facePrism(wall, face, m.graphite, [0.16, HEIGHT + 0.04, THICKNESS + 0.06], side * (LENGTH / 2 - 0.08), (HEIGHT + 0.04) / 2, 0, {
          fillet: 0.018, bevel: 0.016,
        })
        facePrism(wall, face, m.amber, [0.1, 0.14, 0.016], side * (LENGTH / 2 - 0.08), HEIGHT - 0.22, THICKNESS * 0.5 + 0.03, {
          fillet: 0.006, bevel: 0.005,
        })
      }
    },
  })
}

export function createPreview(options: { aspect?: number } = {}): WallPreview {
  return createWallPreview(createModel(), ENVELOPE, { distance: 6.8, pitch: 0.28, ...options })
}
