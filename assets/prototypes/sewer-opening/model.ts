import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import { AXIS_X, AXIS_Y, type CargoPreview, type CargoPreviewOptions } from '../axiom-cargo-kit/index.ts'
import {
  STREET,
  createStreetModel,
  createStreetPreview,
  foliage,
  slab,
  type StreetModel,
} from '../axiom-street-kit/index.ts'

/**
 * Axiom Relay sewer opening — the kerbside gully and its cover.
 *
 * Two openings, not one, because that is how a real gully works: the kerb inlet
 * takes the water running along the channel, and the grating on the pavement
 * takes what falls on it. A gully drawn with only the top grating is a drain
 * that the road cannot actually reach.
 *
 * The frame sits proud of the paving by the thickness of one bedding course.
 * A grating flush with its surround is a grating that has never been lifted.
 */

const ENVELOPE = { width: 1.0, depth: 0.9, height: STREET.kerb + 0.06 }

export function createModel(): StreetModel {
  return createStreetModel({
    id: 'sewer-opening',
    condition: 0.92,
    envelope: ENVELOPE,
    build: ({ m, part }) => {
      const g = part('gully')
      // Kerb block with the inlet cut into its face.
      slab(g, m.graphiteEdge, [0.98, STREET.kerb, 0.18], [0, STREET.kerb * 0.5, 0.34])
      slab(g, m.ink, [0.62, 0.07, 0.1], [0, 0.05, 0.4])
      slab(g, m.ink, [0.58, 0.05, 0.06], [0, 0.05, 0.44])

      // Grating frame, proud of the paving by one bedding course.
      slab(g, m.ironOxide, [0.66, 0.06, 0.56], [0, 0.03, 0])
      slab(g, m.ink, [0.56, 0.05, 0.46], [0, 0.045, 0])
      // Bars across the short way, so a wheel crosses them rather than drops in.
      for (let index = 0; index < 9; index += 1) {
        slab(g, m.ironOxide, [0.5, 0.035, 0.026], [0, 0.062, -0.2 + index * 0.05])
      }
      // Lifting slots at both ends, and the hinge pin down one side.
      for (const sz of [-1, 1]) {
        slab(g, m.ink, [0.1, 0.03, 0.03], [0, 0.075, sz * 0.21])
      }
      // Hinge pin down the long side. Laid on AXIS_X it ran *across* the gully
      // and stuck 210 mm out past a frame only 660 mm wide; the pin runs with
      // the side it hinges, which is Z.
      g.add(cylinder(m.steel, 0.014, 0.46, [-0.29, 0.05, 0], [Math.PI / 2, 0, 0], 6))

      // Silt bucket visible through the bars: the thing that is actually serviced.
      slab(g, m.ink, [0.44, 0.24, 0.36], [0, -0.12, 0])
      return { sockets: { pipe_outfall: [0, -0.2, -0.28], cover_grating: [0, 0.06, 0] } }
    },
  })
}

export function createPreview(options: CargoPreviewOptions = {}): CargoPreview {
  return createStreetPreview(createModel(), ENVELOPE, { distance: 2.6, pitch: 0.5, ...options })
}
