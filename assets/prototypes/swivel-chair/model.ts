import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import { AXIS_Y, box, type CargoPreview, type CargoPreviewOptions } from '../axiom-cargo-kit/index.ts'
import { CONSOLE, chairColumn, createConsoleModel, createConsolePreview, type ConsoleModel } from '../axiom-console-kit/index.ts'

/**
 * Axiom Relay swivel chair — the general-issue task seat.
 *
 * The plain seat the whole facility sits on: gas column, five-star base, a
 * moulded pan and a low back. It is deliberately the *unremarkable* one, because
 * the group also has a control chair, and a kit only reads as a kit when the
 * ordinary member is visibly ordinary — the same column, the same castors, less
 * of everything else.
 *
 * The back is raked and the pan is dished. A flat pan on a flat back is the
 * silhouette of a stool, and no amount of detail elsewhere recovers it.
 */

const ENVELOPE = { width: 0.62, depth: 0.62, height: 1.02 }

export function createModel(): ConsoleModel {
  return createConsoleModel({
    id: 'swivel-chair',
    condition: 0.52,
    envelope: ENVELOPE,
    build: ({ m, part }) => {
      const chair = part('chair')
      chairColumn(chair, m, CONSOLE.seat)

      // Mechanism under the pan: the part that explains the height adjustment.
      box(chair, m.graphite, [0.22, 0.07, 0.26], [0, CONSOLE.seat - 0.05, 0], {
        chamfer: 0.02, fillet: 0.008, bevel: 0.007,
      })
      chair.add(cylinder(m.steel, 0.016, 0.11, [0.13, CONSOLE.seat - 0.07, 0.02], [0, 0, Math.PI / 2], 8))

      // Dished pan: a shell with a proud cushion inset into it.
      box(chair, m.graphite, [0.46, 0.05, 0.44], [0, CONSOLE.seat, 0], {
        chamfer: 0.07, fillet: 0.016, bevel: 0.014,
      })
      box(chair, m.fabric, [0.4, 0.05, 0.38], [0, CONSOLE.seat + 0.035, -0.01], {
        chamfer: 0.08, fillet: 0.018, bevel: 0.016,
      })

      // Raked back on its stem.
      const rake = -0.22
      box(chair, m.steel, [0.05, 0.26, 0.05], [0, CONSOLE.seat + 0.13, -0.19], {
        chamfer: 0.012, fillet: 0.005, bevel: 0.005, rotation: [rake, 0, 0],
      })
      box(chair, m.graphite, [0.42, 0.42, 0.05], [0, CONSOLE.seat + 0.34, -0.24], {
        chamfer: 0.08, fillet: 0.016, bevel: 0.014, rotation: [rake, 0, 0],
      })
      box(chair, m.fabric, [0.36, 0.36, 0.04], [0, CONSOLE.seat + 0.34, -0.21], {
        chamfer: 0.07, fillet: 0.014, bevel: 0.013, rotation: [rake, 0, 0],
      })
    },
  })
}

export function createPreview(options: CargoPreviewOptions = {}): CargoPreview {
  return createConsolePreview(createModel(), ENVELOPE, options)
}
