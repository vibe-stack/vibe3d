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
 * Axiom Relay pedestrian signal — the crossing head and its push unit.
 *
 * Two things at two heights, and the gap between them is the design: the signal
 * head sits where it is read from across the road, the push unit where a hand
 * reaches without looking. Putting both on one plate — which is what a single
 * box would be — loses the reason either is where it is.
 */

const ENVELOPE = { width: 0.5, depth: 0.42, height: 2.9 }

export function createModel(): StreetModel {
  return createStreetModel({
    id: 'pedestrian-signal',
    condition: 0.66,
    envelope: ENVELOPE,
    build: ({ m, bundle, part }) => {
      const p = part('signal')
      const go = streetLamp(bundle, 'LIME-400', 7_730, 'signal')
      const stop = streetLamp(bundle, 'RED-500', 7_731, 'signal')
      pole(p, m, STREET.pole.signal, 2.9)
      // Head: two stacked lenses under a hood each, on the pole's road face.
      slab(p, m.graphite, [0.3, 0.62, 0.24], [0, 2.42, 0.1])
      for (const [index, lit] of [stop, go].entries()) {
        const y = 2.62 - index * 0.28
        slab(p, m.ink, [0.22, 0.22, 0.03], [0, y, 0.22])
        slab(p, lit, [0.17, 0.17, 0.02], [0, y, 0.235])
        // Hood, raked so low sun does not wash the lens out.
        slab(p, m.graphiteEdge, [0.26, 0.05, 0.16], [0, y + 0.13, 0.27], [0.42, 0, 0])
      }
      // Push unit at hand height, with its tactile arrow and confirm lamp.
      slab(p, m.graphiteEdge, [0.16, 0.22, 0.12], [0, 1.05, 0.12])
      slab(p, m.amberPaint, [0.07, 0.07, 0.02], [0, 1.09, 0.19])
      slab(p, go, [0.05, 0.015, 0.015], [0, 0.98, 0.19])
      return { sockets: { fx_signal_head: [0, 2.48, 0.235], dressing_push_unit: [0, 1.05, 0.19] } }
    },
  })
}

export function createPreview(options: CargoPreviewOptions = {}): CargoPreview {
  return createStreetPreview(createModel(), ENVELOPE, { distance: 7, ...options })
}
