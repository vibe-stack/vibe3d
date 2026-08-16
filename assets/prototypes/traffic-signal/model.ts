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
 * Axiom Relay traffic signal — the junction head on its mast arm.
 *
 * The pedestrian signal is read from across a road; this one is read from a
 * vehicle a hundred metres back, and every difference follows from that. The
 * head hangs out over the carriageway on a mast arm rather than sitting on the
 * post, the lenses are twice the diameter, and each gets a deep hood — a signal
 * washed out by low sun is a signal that is not there.
 *
 * The backboard behind the head is the detail that does the most work. It is
 * what gives three small lights something to read against when the background
 * is a lit city rather than sky.
 */

const ENVELOPE = { width: 3.4, depth: 0.6, height: STREET.signalHead + 2.4 }

export function createModel(): StreetModel {
  return createStreetModel({
    id: 'traffic-signal',
    condition: 0.68,
    envelope: ENVELOPE,
    build: ({ m, bundle, part }) => {
      const p = part('signal')
      const stop = streetLamp(bundle, 'RED-500', 7_750, 'signal')
      const wait = streetLamp(bundle, 'AMBER-400', 7_751, 'signal')
      const go = streetLamp(bundle, 'LIME-400', 7_752, 'signal')
      const MAST = STREET.signalHead + 2.1
      pole(p, m, STREET.pole.signal * 1.4, MAST)
      poleArm(p, m, [0, MAST - 0.24, 0], 2.5, 0.07)

      // Head hung off the arm's end, on a backboard.
      const HX = 2.32
      const HY = MAST - 0.62
      slab(p, m.graphiteEdge, [0.1, 0.4, 0.1], [HX, MAST - 0.4, 0])
      slab(p, m.ink, [0.52, 1.18, 0.03], [HX, HY - 0.3, -0.02])
      slab(p, m.graphite, [0.38, 1.06, 0.26], [HX, HY - 0.3, 0.08])
      for (const [index, lit] of [stop, wait, go].entries()) {
        const y = HY - 0.02 - index * 0.32
        slab(p, m.ink, [0.28, 0.28, 0.03], [HX, y, 0.22])
        p.add(cylinder(lit, 0.115, 0.03, [HX, y, 0.235], AXIS_X, 14))
        // Deep hood over each lens, raked down.
        slab(p, m.graphiteEdge, [0.32, 0.06, 0.2], [HX, y + 0.16, 0.29], [0.5, 0, 0])
      }
      // Controller cabinet at the base, and the duct that feeds the arm.
      slab(p, m.shellShade, [0.42, 0.72, 0.28], [0.34, 0.44, 0])
      slab(p, m.ink, [0.34, 0.6, 0.02], [0.34, 0.44, 0.15])
      p.add(cylinder(m.graphiteEdge, 0.04, MAST - 1.1, [0, 0.9, 0.1], AXIS_Y, 8))
      return { sockets: { fx_signal_head: [HX, HY - 0.02, 0.235], power_controller: [0.34, 0.44, 0.15] } }
    },
  })
}

export function createPreview(options: CargoPreviewOptions = {}): CargoPreview {
  return createStreetPreview(createModel(), ENVELOPE, { distance: 11, pitch: 0.12, ...options })
}
