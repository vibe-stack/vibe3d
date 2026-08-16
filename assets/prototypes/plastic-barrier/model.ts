import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import { AXIS_X, AXIS_Y, type CargoPreview, type CargoPreviewOptions } from '../axiom-cargo-kit/index.ts'
import {
  STREET,
  createStreetModel,
  createStreetPreview,
  pole,
  poleArm,
  slab,
  streetLamp,
  type StreetModel,
} from '../axiom-street-kit/index.ts'

/**
 * Axiom Relay plastic barrier — the water-ballasted lane divider.
 *
 * Hollow, moulded, and useless until filled — which is the whole point of the
 * type. The cap on top is the fill port, the recess at the base is the drain,
 * and the interlocking pin-and-socket ends are what turn a line of them into a
 * barrier rather than a row of obstacles.
 *
 * The taper is structural rather than styling: a mould has to release, so every
 * face draws. Drawn with parallel sides it stops reading as plastic.
 */

const ENVELOPE = { width: 1.6, depth: 0.55, height: 0.82 }

export function createModel(): StreetModel {
  return createStreetModel({
    id: 'plastic-barrier',
    condition: 0.86,
    envelope: ENVELOPE,
    build: ({ m, bundle, part }) => {
      const p = part('barrier')
      const body = m.orangePaint
      // Splayed foot, tapered body, and the rounded top rail.
      slab(p, body, [1.5, 0.16, 0.5], [0, 0.08, 0])
      slab(p, body, [1.44, 0.34, 0.36], [0, 0.32, 0])
      slab(p, body, [1.38, 0.24, 0.26], [0, 0.6, 0])
      p.add(cylinder(body, 0.09, 1.36, [0, 0.74, 0], [0, 0, Math.PI / 2], 10))
      // Interlock: a pin one end, a socket the other.
      p.add(cylinder(m.graphiteEdge, 0.05, 0.22, [0.79, 0.44, 0], [0, 0, Math.PI / 2], 8))
      slab(p, m.ink, [0.1, 0.3, 0.2], [-0.76, 0.44, 0])
      // Fill port on top, drain recess at the foot.
      p.add(cylinder(m.graphiteEdge, 0.07, 0.05, [0.42, 0.8, 0], AXIS_Y, 10))
      slab(p, m.ink, [0.12, 0.07, 0.1], [-0.42, 0.06, 0.2])
      // Reflective bands, and the moulded rib pattern between them.
      for (const sx of [-1, 1]) {
        slab(p, m.shellLight, [0.3, 0.14, 0.02], [sx * 0.36, 0.44, 0.14])
      }
      for (let index = 0; index < 5; index += 1) {
        slab(p, body, [0.04, 0.5, 0.03], [-0.6 + index * 0.3, 0.42, 0.15])
      }
      return { sockets: { mount_interlock_pin: [0.9, 0.44, 0], mount_interlock_socket: [-0.8, 0.44, 0] } }
    },
  })
}

export function createPreview(options: CargoPreviewOptions = {}): CargoPreview {
  return createStreetPreview(createModel(), ENVELOPE, { distance: 3.6, ...options })
}
