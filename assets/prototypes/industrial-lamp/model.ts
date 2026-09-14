import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import { AXIS_X, AXIS_Y, type CargoPreview, type CargoPreviewOptions } from '../axiom-cargo-kit/index.ts'
import {
  STREET,
  createStreetModel,
  createStreetPreview,
  panel,
  pole,
  poleArm,
  slab,
  streetLamp,
  type StreetModel,
} from '../axiom-street-kit/index.ts'

/**
 * Axiom Relay industrial lamp — the road luminaire.
 *
 * The plain one, and deliberately so: a single swan-neck arm, a shielded head
 * raked down at the carriageway, and a door in the column base for the gear. The
 * rake is the whole design — a head hung level throws half its light at the sky,
 * and a lamp that does that is lighting nothing.
 */

const ENVELOPE = { width: 2.2, depth: 0.6, height: STREET.lampHead + 0.2 }

export function createModel(): StreetModel {
  return createStreetModel({
    id: 'industrial-lamp',
    condition: 0.72,
    envelope: ENVELOPE,
    build: ({ m, bundle, part }) => {
      const p = part('lamp')
      const lit = streetLamp(bundle, 'AMBER-400', 7_720, 'signal')
      pole(p, m, STREET.pole.lamp, STREET.lampHead - 0.4)
      // Swan neck, built as two raked sections rather than a curve.
      p.add(cylinder(m.graphite, 0.075, 0.7, [0.24, STREET.lampHead - 0.2, 0], [0, 0, -0.6], 10))
      p.add(cylinder(m.graphite, 0.065, 0.9, [0.84, STREET.lampHead + 0.02, 0], [0, 0, -1.35], 10))
      // Shielded head, raked down at the road.
      //
      // Seated on the neck's computed end rather than at a guessed height. The
      // second neck section runs at 1.35 rad from vertical over 0.9 m, so its
      // tip is at x 1.28, y +0.12 — the head drawn 160 mm below that hung in
      // clear air with the arm stopping short of it.
      const HEAD: readonly [number, number] = [1.3, STREET.lampHead + 0.08]
      slab(p, m.shellShade, [0.78, 0.14, 0.34], [HEAD[0], HEAD[1], 0], [0, 0, 0.16])
      slab(p, m.ink, [0.66, 0.04, 0.26], [HEAD[0], HEAD[1] - 0.08, 0], [0, 0, 0.16])
      slab(p, lit, [0.6, 0.025, 0.22], [HEAD[0], HEAD[1] - 0.1, 0], [0, 0, 0.16])
      // Gear door at the base, with its lock and the cable entry beside it.
      slab(p, m.graphiteEdge, [0.16, 0.5, 0.03], [0, 0.72, STREET.pole.lamp])
      p.add(cylinder(m.steel, 0.014, 0.03, [0, 0.72, STREET.pole.lamp + 0.03], AXIS_X, 6))
      return { sockets: { fx_lamp_head: [1.3, STREET.lampHead - 0.02, 0], power_gear_door: [0, 0.72, STREET.pole.lamp] } }
    },
  })
}

export function createPreview(options: CargoPreviewOptions = {}): CargoPreview {
  return createStreetPreview(createModel(), ENVELOPE, { distance: 12, pitch: 0.1, ...options })
}
