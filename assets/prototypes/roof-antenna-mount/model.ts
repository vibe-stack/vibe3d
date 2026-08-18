import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import { createRoofModel, createRoofPreview, type RoofModel, type RoofPreview } from '../axiom-roof-kit/index.ts'
import { block, curb, deck } from '../axiom-roof-kit/deck.ts'

/**
 * Axiom Relay roof antenna mount — the ballasted lattice mast.
 *
 * A mast on a roof is a lever: wind load at the top is resisted at the bottom,
 * and the bottom is a waterproof membrane that must not be drilled. So the whole
 * thing stands on ballast, and the mast itself is a lattice rather than a tube —
 * a triangulated frame carries the same moment at a fraction of the wind area,
 * which is exactly why real masts are built this way and why a plain pole reads
 * as a flagpole instead.
 *
 * The equipment is the point of the structure, so it is modelled rather than
 * implied: three sector panels on a headframe, a dish on its own offset arm, a
 * lightning finial above everything, and the cable bundle that runs the whole
 * height down into a gland.
 */

const LEG = 0.34
const HEIGHT = 4.6
const BAYS = 7
const ENVELOPE = { width: 3.0, depth: 3.0, height: HEIGHT + 1.5 }

export function createModel(): RoofModel {
  return createRoofModel({
    id: 'roof-antenna-mount',
    envelope: ENVELOPE,
    build: ({ m, part }) => {
      const mt = part('mount')
      deck(mt, m, 3.0, 3.0)

      // Ballast frame on pads, with the blocks that make it heavy.
      block(mt, m.ink, [1.9, 0.02, 1.9], [0, 0.01, 0])
      block(mt, m.graphite, [1.8, 0.16, 1.8], [0, 0.1, 0])
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
        block(mt, m.deck, [0.62, 0.2, 0.62], [sx * 0.52, 0.28, sz * 0.52])
        block(mt, m.porcelain, [0.66, 0.04, 0.66], [sx * 0.52, 0.4, sz * 0.52])
      }

      // Three legs on an equilateral plan, each on its own hinged base plate so
      // the mast can be laid down for service.
      const legAt = (index: number): readonly [number, number] => {
        const a = (index / 3) * Math.PI * 2 + Math.PI / 6
        return [Math.cos(a) * LEG, Math.sin(a) * LEG]
      }
      for (let index = 0; index < 3; index += 1) {
        const [x, z] = legAt(index)
        block(mt, m.porcelain, [0.2, 0.05, 0.2], [x, 0.42, z])
        block(mt, m.steel, [0.1, 0.16, 0.06], [x, 0.5, z])
        mt.add(cylinder(m.steel, 0.035, HEIGHT, [x, 0.44 + HEIGHT * 0.5, z], [0, 0, 0], 8))
      }

      // Lattice: a horizontal ring and a diagonal at every bay, which is what
      // makes it a mast rather than three poles standing near each other.
      for (let bay = 0; bay <= BAYS; bay += 1) {
        const y = 0.56 + (bay / BAYS) * (HEIGHT - 0.3)
        for (let index = 0; index < 3; index += 1) {
          const [x0, z0] = legAt(index)
          const [x1, z1] = legAt((index + 1) % 3)
          const span = Math.hypot(x1 - x0, z1 - z0)
          const yaw = Math.atan2(z1 - z0, x1 - x0)
          block(mt, m.steel, [span, 0.028, 0.028], [(x0 + x1) / 2, y, (z0 + z1) / 2], [0, -yaw, 0])
          if (bay < BAYS) {
            const rise = (HEIGHT - 0.3) / BAYS
            const diag = Math.hypot(span, rise)
            block(mt, m.steel, [diag, 0.022, 0.022], [
              (x0 + x1) / 2, y + rise * 0.5, (z0 + z1) / 2,
            ], [0, -yaw, Math.atan2(rise, span)])
          }
        }
      }

      // Headframe, three sector panels, and the dish on its offset arm.
      const HEAD = 0.44 + HEIGHT
      block(mt, m.graphite, [0.9, 0.07, 0.9], [0, HEAD, 0])
      for (let index = 0; index < 3; index += 1) {
        const a = (index / 3) * Math.PI * 2
        const r = 0.46
        block(mt, m.porcelain, [0.14, 0.72, 0.3], [
          Math.cos(a) * r, HEAD + 0.42, Math.sin(a) * r,
        ], [0, -a, 0])
        block(mt, m.graphite, [0.08, 0.14, 0.1], [Math.cos(a) * r * 0.7, HEAD + 0.12, Math.sin(a) * r * 0.7], [0, -a, 0])
      }
      mt.add(cylinder(m.steel, 0.028, 0.5, [0.42, HEAD + 0.2, -0.42], [0, 0, Math.PI / 2], 8))
      mt.add(cylinder(m.porcelain, 0.3, 0.07, [0.72, HEAD + 0.2, -0.42], [Math.PI / 2, 0.7, 0], 14))
      mt.add(cylinder(m.steel, 0.02, 0.22, [0.72, HEAD + 0.2, -0.42], [Math.PI / 2, 0.7, 0], 6))
      // Lightning finial above everything it protects.
      mt.add(cylinder(m.steel, 0.018, 0.9, [0, HEAD + 0.95, 0], [0, 0, 0], 6))

      // Cable bundle down one face, into a gland on its own curb.
      for (const dx of [-0.02, 0.02, 0.06]) {
        mt.add(cylinder(m.ink, 0.022, HEIGHT - 0.2, [LEG + dx, 0.6 + (HEIGHT - 0.2) * 0.5, 0.1], [0, 0, 0], 6))
      }
      block(mt, m.steel, [0.16, 0.05, 0.16], [LEG + 0.02, 2.4, 0.1])
      curb(mt, m, 0.34, 0.32, 0.22, [0.95, 0, 0.62])
      block(mt, m.graphite, [0.3, 0.34, 0.26], [0.95, 0.4, 0.62])
      block(mt, m.cyan, [0.1, 0.03, 0.02], [0.95, 0.5, 0.75])

      return {
        sockets: {
          mount_headframe: [0, HEAD, 0],
          fx_finial: [0, HEAD + 1.4, 0],
          cable_gland: [0.95, 0.4, 0.75],
        },
      }
    },
  })
}

export function createPreview(options: { aspect?: number } = {}): RoofPreview {
  return createRoofPreview(createModel(), ENVELOPE, { distance: 12, pitch: 0.2, ...options })
}
