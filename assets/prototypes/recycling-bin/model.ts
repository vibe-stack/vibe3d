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
 * Axiom Relay recycling bin — the segregated street bin.
 *
 * Three streams in one shell, and the aperture shape is what tells them apart: a
 * slot for flat waste, a round hole for containers, a wide mouth for general.
 * That is how real ones are read at a glance, and it survives at distances where
 * a colour code or a label does not.
 */

const ENVELOPE = { width: 1.1, depth: 0.5, height: 1.25 }

export function createModel(): StreetModel {
  return createStreetModel({
    id: 'recycling-bin',
    condition: 0.8,
    envelope: ENVELOPE,
    build: ({ m, bundle, part }) => {
      const p = part('bin')
      const lit = streetLamp(bundle, 'CYAN-400', 7_740, 'signal')
      // Shell on a plinth, with the back panel that carries all three liners.
      slab(p, m.graphiteEdge, [1.04, 0.09, 0.46], [0, 0.045, 0])
      slab(p, m.shellShade, [1.0, 1.0, 0.42], [0, 0.6, 0])
      slab(p, m.graphite, [1.06, 0.1, 0.48], [0, 1.14, 0])
      for (const [index, sx] of [-1, 0, 1].entries()) {
        const x = sx * 0.33
        // Divider ribs between streams, and the recessed aperture face.
        if (index < 2) slab(p, m.graphite, [0.02, 0.9, 0.44], [x + 0.165, 0.62, 0])
        slab(p, m.ink, [0.26, 0.3, 0.06], [x, 0.92, 0.2])
        if (index === 0) slab(p, m.ink, [0.19, 0.045, 0.05], [x, 0.92, 0.24])
        else if (index === 1) p.add(cylinder(m.ink, 0.075, 0.05, [x, 0.92, 0.24], AXIS_X, 12))
        else slab(p, m.ink, [0.2, 0.15, 0.05], [x, 0.9, 0.24])
        slab(p, m.amberPaint, [0.24, 0.02, 0.012], [x, 0.74, 0.215])
      }
      // Service door with its lock, and the fill indicator above it.
      slab(p, m.graphiteEdge, [0.9, 0.5, 0.02], [0, 0.36, -0.215])
      slab(p, lit, [0.05, 0.02, 0.012], [0.4, 1.06, 0.215])
      return { sockets: { cover_service_door: [0, 0.36, -0.215], dressing_apertures: [0, 0.92, 0.22] } }
    },
  })
}

export function createPreview(options: CargoPreviewOptions = {}): CargoPreview {
  return createStreetPreview(createModel(), ENVELOPE, { distance: 3.4, ...options })
}
