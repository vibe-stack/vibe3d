import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import { AXIS_Y, type CargoPreview, type CargoPreviewOptions } from '../axiom-cargo-kit/index.ts'
import { STREET, createStreetModel, createStreetPreview, pole, slab, type StreetModel } from '../axiom-street-kit/index.ts'

/**
 * Axiom Relay utility pole — the street's tallest ordinary object.
 *
 * A pole is only interesting for what hangs off it, so this one is authored as a
 * carrier: a tapered mast, a stepped bolt ladder, two cross-arms with insulator
 * banks, and a service cabinet at working height. The taper matters more than it
 * looks — a parallel tube reads as scaffold, and the 15 % reduction over the run
 * is what makes it read as a pole that carries its own weight.
 */

const HEIGHT = 8.4
const ENVELOPE = { width: 2.4, depth: 0.6, height: HEIGHT + 0.3 }

export function createModel(): StreetModel {
  return createStreetModel({
    id: 'utility-pole',
    condition: 0.74,
    envelope: ENVELOPE,
    build: ({ m, part }) => {
      const p = part('pole')
      pole(p, m, STREET.pole.power, HEIGHT * 0.42)
      // Upper sections, each stepped in: a taper built from real sections rather
      // than a cone, so the joints are where the diameter changes.
      p.add(cylinder(m.graphite, STREET.pole.power * 0.88, HEIGHT * 0.34, [0, HEIGHT * 0.59, 0], AXIS_Y, 12))
      p.add(cylinder(m.graphite, STREET.pole.power * 0.74, HEIGHT * 0.28, [0, HEIGHT * 0.87, 0], AXIS_Y, 12))
      for (const y of [HEIGHT * 0.42, HEIGHT * 0.76]) {
        p.add(cylinder(m.graphiteEdge, STREET.pole.power * 1.06, 0.09, [0, y, 0], AXIS_Y, 12))
      }

      // Bolt-step ladder up one flank, alternating sides as real ones do.
      for (let index = 0; index < 11; index += 1) {
        const side = index % 2 === 0 ? 1 : -1
        p.add(cylinder(m.steel, 0.017, 0.26, [side * 0.12, 1.5 + index * 0.42, 0], [0, 0, Math.PI / 2], 6))
      }

      // Two cross-arms with insulator banks.
      for (const [index, y] of [HEIGHT * 0.78, HEIGHT * 0.93].entries()) {
        const reach = index === 0 ? 1.1 : 0.78
        slab(p, m.timber, [reach * 2, 0.12, 0.13], [0, y, 0])
        slab(p, m.steel, [0.05, 0.34, 0.05], [0, y - 0.2, 0], [0, 0, 0])
        // Spread across the arm from its own count. The previous divisor was
        // `Math.max(1, index === 0 ? 1 : 1)` — always 1, which collapsed the
        // spacing and left the lower arm bare.
        const count = index === 0 ? 3 : 2
        for (let n = 0; n < count; n += 1) {
          const t = count === 1 ? 0 : (n / (count - 1)) * 2 - 1
          const x = t * reach * 0.72
          p.add(cylinder(m.steel, 0.016, 0.13, [x, y + 0.12, 0], AXIS_Y, 6))
          p.add(cylinder(m.glass, 0.055, 0.06, [x, y + 0.2, 0], AXIS_Y, 10))
          p.add(cylinder(m.glass, 0.045, 0.05, [x, y + 0.25, 0], AXIS_Y, 10))
        }
      }

      // Service cabinet and its conduit down to the base.
      slab(p, m.shellShade, [0.34, 0.46, 0.2], [0.2, 1.35, 0])
      slab(p, m.ink, [0.28, 0.38, 0.02], [0.2, 1.35, 0.11])
      p.add(cylinder(m.graphiteEdge, 0.045, 1.2, [0.2, 0.72, 0.09], AXIS_Y, 8))

      return {
        sockets: {
          cable_arm_lower: [0, HEIGHT * 0.78, 0],
          cable_arm_upper: [0, HEIGHT * 0.93, 0],
          power_cabinet: [0.2, 1.35, 0.11],
        },
      }
    },
  })
}

export function createPreview(options: CargoPreviewOptions = {}): CargoPreview {
  return createStreetPreview(createModel(), ENVELOPE, { distance: 17, pitch: 0.1, ...options })
}
