import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import { createRoofModel, createRoofPreview, type RoofModel, type RoofPreview } from '../axiom-roof-kit/index.ts'
import { block, curb, deck } from '../axiom-roof-kit/deck.ts'

/**
 * Axiom Relay roof antenna mount — the ballasted mast base.
 *
 * A mast on a roof is a lever: wind load at the top is resisted at the bottom,
 * and the bottom is a waterproof membrane that must not be drilled. So this is
 * the same counterweight logic as the rooftop railing, scaled up — a ballast
 * frame on rubber pads, a stub mast in a hinged base plate so it can be lowered
 * for service, and three guys taken back to their own ballast blocks.
 *
 * The hinge is the detail worth keeping. A mast that cannot be lowered has to be
 * serviced at height, and nothing else on this roof needs a crane.
 */

const ENVELOPE = { width: 2.6, depth: 2.6, height: 3.2 }

export function createModel(): RoofModel {
  return createRoofModel({
    id: 'roof-antenna-mount',
    envelope: ENVELOPE,
    build: ({ m, part }) => {
      const mount = part('mount')
      deck(mount, m, 2.6, 2.6)

      // Ballast frame on pads, with the blocks that make it heavy.
      block(mount, m.ink, [1.5, 0.02, 1.5], [0, 0.01, 0])
      block(mount, m.graphite, [1.4, 0.14, 1.4], [0, 0.09, 0])
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
        block(mount, m.deck, [0.5, 0.16, 0.5], [sx * 0.42, 0.24, sz * 0.42])
        block(mount, m.steel, [0.06, 0.05, 0.44], [sx * 0.42, 0.34, sz * 0.42])
      }

      // Hinged base plate and the stub mast standing in it.
      block(mount, m.graphite, [0.34, 0.1, 0.4], [0, 0.21, 0])
      for (const side of [-1, 1] as const) {
        block(mount, m.steel, [0.03, 0.22, 0.18], [side * 0.13, 0.36, 0])
      }
      mount.add(cylinder(m.steel, 0.026, 0.3, [0, 0.34, 0], [0, 0, Math.PI / 2], 10))
      mount.add(cylinder(m.graphite, 0.07, 2.5, [0, 0.34 + 1.25, 0], [0, 0, 0], 12))
      mount.add(cylinder(m.steel, 0.045, 0.5, [0, 0.34 + 2.65, 0], [0, 0, 0], 10))

      // Guy collar and three stays down to their own ballast blocks.
      //
      // Each stay is oriented from the geometry rather than eyeballed: a
      // cylinder's own axis is +Y, so tilting it by the stay's angle from
      // vertical and yawing that tilt to the block's bearing lands both ends
      // exactly on the collar and the block. Guessed Euler triples put stays
      // near their anchors, which reads as a mast held up by nothing.
      const COLLAR_Y = 2.1
      const BLOCK_Y = 0.16
      const RADIUS = 0.95
      const drop = COLLAR_Y - BLOCK_Y
      const tilt = Math.atan2(RADIUS, drop)
      const stay = Math.hypot(RADIUS, drop)
      mount.add(cylinder(m.steel, 0.09, 0.07, [0, COLLAR_Y, 0], [0, 0, 0], 12))
      for (let index = 0; index < 3; index += 1) {
        const bearing = (index / 3) * Math.PI * 2
        const x = Math.cos(bearing) * RADIUS
        const z = Math.sin(bearing) * RADIUS
        block(mount, m.deck, [0.3, 0.16, 0.3], [x, 0.08, z])
        block(mount, m.steel, [0.1, 0.05, 0.1], [x, 0.17, z])
        mount.add(cylinder(m.steel, 0.014, stay, [x / 2, (COLLAR_Y + BLOCK_Y) / 2, z / 2], [
          0,
          Math.PI - bearing,
          tilt,
        ], 6))
      }

      // Cable tray leaving the base, and its gland into the deck.
      block(mount, m.graphite, [0.22, 0.07, 0.9], [0.5, 0.28, -0.85])
      block(mount, m.ink, [0.18, 0.03, 0.86], [0.5, 0.32, -0.85])
      curb(mount, m, 0.3, 0.28, 0.2, [0.5, 0, -1.2])
    },
  })
}

export function createPreview(options: { aspect?: number } = {}): RoofPreview {
  return createRoofPreview(createModel(), ENVELOPE, { distance: 8.6, pitch: 0.22, ...options })
}
