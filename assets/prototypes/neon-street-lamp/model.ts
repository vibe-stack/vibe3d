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
 * Axiom Relay neon street lamp — the district's own column.
 *
 * Where the industrial lamp throws light down at a road, this one is as much a
 * sign as a luminaire: a tube of magenta running the full column, a horizontal
 * head, and a bracket for the banner every one of them carries. It is the piece
 * that makes a street read as the E-District rather than as a depot, and the
 * colour is doing that work, not the geometry.
 */

const ENVELOPE = { width: 1.5, depth: 0.5, height: STREET.lampHead + 0.4 }

export function createModel(): StreetModel {
  return createStreetModel({
    id: 'neon-street-lamp',
    condition: 0.5,
    envelope: ENVELOPE,
    build: ({ m, bundle, part }) => {
      const p = part('lamp')
      const neon = streetLamp(bundle, 'MAGENTA-400', 7_710, 'sign')
      const head = streetLamp(bundle, 'CYAN-400', 7_711, 'signal')
      pole(p, m, STREET.pole.lamp, STREET.lampHead)
      // Neon tube in a channel up the column: the channel is what stops it
      // reading as a glowing stripe painted on a tube.
      slab(p, m.ink, [0.07, STREET.lampHead - 1.1, 0.05], [0, STREET.lampHead * 0.55, STREET.pole.lamp])
      slab(p, neon, [0.035, STREET.lampHead - 1.3, 0.03], [0, STREET.lampHead * 0.55, STREET.pole.lamp + 0.03])
      // Head: a flat lantern on a short arm, and the banner bracket below it.
      poleArm(p, m, [0, STREET.lampHead - 0.1, 0], 0.62, 0.045)
      slab(p, m.graphite, [0.66, 0.12, 0.3], [0.6, STREET.lampHead - 0.22, 0])
      slab(p, head, [0.56, 0.03, 0.22], [0.6, STREET.lampHead - 0.29, 0])
      slab(p, m.graphiteEdge, [0.05, 0.42, 0.05], [0, 3.1, 0.16], [0.5, 0, 0])
      slab(p, m.shellShade, [0.03, 0.9, 0.34], [0, 2.72, 0.3])
      return { sockets: { dressing_banner: [0, 2.72, 0.3], fx_lamp_head: [0.6, STREET.lampHead - 0.29, 0] } }
    },
  })
}

export function createPreview(options: CargoPreviewOptions = {}): CargoPreview {
  return createStreetPreview(createModel(), ENVELOPE, { distance: 11, pitch: 0.12, ...options })
}
