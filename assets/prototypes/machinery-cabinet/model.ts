import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import { AXIS_Y, box, statusLens, type CargoPreview, type CargoPreviewOptions } from '../axiom-cargo-kit/index.ts'
import { createConsoleModel, createConsolePreview, screen, screenSurface, type ConsoleModel } from '../axiom-console-kit/index.ts'

/**
 * Axiom Relay machinery cabinet — the floor-standing control enclosure.
 *
 * The thing on the wall behind the desks. A sealed enclosure with a rotary
 * isolator that has to be turned off before the door will open, a gland plate at
 * the bottom where every cable enters from below, and a filtered vent at the top
 * where the heat leaves. Those three are what distinguish a control cabinet from
 * a cupboard, and all three are interlocked by physics rather than by decoration.
 *
 * The plinth is the detail that dates a real one: cabinets stand on a plinth so
 * a wash-down never reaches the gland plate.
 */

const W = 0.8
const D = 0.42
const H = 1.9
const ENVELOPE = { width: W + 0.08, depth: D + 0.14, height: H + 0.06 }

export function createModel(): ConsoleModel {
  return createConsoleModel({
    id: 'machinery-cabinet',
    condition: 0.62,
    envelope: ENVELOPE,
    build: ({ m, bundle, part }) => {
      const cab = part('cabinet')
      const readout = screenSurface(bundle, 'AMBER-400', 6_160, 0.5)

      // Plinth, body, and the capping that sheds off the top.
      box(cab, m.graphite, [W - 0.06, 0.1, D - 0.06], [0, 0.05, 0], { chamfer: 0.02, fillet: 0.008, bevel: 0.007 })
      box(cab, m.shell, [W, H - 0.14, D], [0, 0.1 + (H - 0.14) * 0.5, 0], { chamfer: 0.03, fillet: 0.012, bevel: 0.014 })
      box(cab, m.graphiteEdge, [W + 0.06, 0.06, D + 0.06], [0, H - 0.01, 0], { chamfer: 0.022, fillet: 0.009, bevel: 0.008 })

      // Door: a recessed leaf with a full-height hinge and the isolator on it.
      box(cab, m.ink, [W - 0.07, H - 0.3, 0.02], [0, 0.98, D * 0.5 - 0.005], { chamfer: 0.02, fillet: 0.008, bevel: 0.006 })
      box(cab, m.shellLight, [W - 0.11, H - 0.34, 0.035], [0, 0.98, D * 0.5 + 0.015], { chamfer: 0.024, fillet: 0.01, bevel: 0.009 })
      for (const y of [0.44, 1.52]) {
        cab.add(cylinder(m.graphiteEdge, 0.026, 0.14, [-W * 0.5 + 0.035, y, D * 0.5], AXIS_Y, 10))
      }
      // Rotary isolator: body, shaft, and the amber handle on it.
      box(cab, m.graphite, [0.1, 0.1, 0.03], [W * 0.5 - 0.12, 1.5, D * 0.5 + 0.035], { chamfer: 0.022, fillet: 0.008, bevel: 0.007 })
      cab.add(cylinder(m.steel, 0.014, 0.05, [W * 0.5 - 0.12, 1.5, D * 0.5 + 0.06], [Math.PI / 2, 0, 0], 8))
      box(cab, m.amberPaint, [0.075, 0.026, 0.02], [W * 0.5 - 0.12, 1.5, D * 0.5 + 0.08], {
        chamfer: 0.006, fillet: 0.003, bevel: 0.003, rotation: [0, 0, 0.6],
      })
      // Door readout and its lamps.
      screen(cab, m, readout, [0.2, 0.11], [-0.11, 1.5, D * 0.5 + 0.035])
      for (let index = 0; index < 3; index += 1) {
        statusLens(cab, m, [0.026, 0.026], [-0.28 + index * 0.07, 1.31, D * 0.5 + 0.04], index === 0 ? m.amber : m.cyan, 'front')
      }
      // Latch and the door's stiffening ribs.
      box(cab, m.steel, [0.03, 0.16, 0.02], [W * 0.5 - 0.07, 0.98, D * 0.5 + 0.04], { chamfer: 0.007, fillet: 0.003, bevel: 0.003 })
      for (const y of [0.62, 0.86]) {
        box(cab, m.shellShade, [W - 0.19, 0.02, 0.014], [0, y, D * 0.5 + 0.03], { chamfer: 0.006, fillet: 0.003, bevel: 0.002 })
      }

      // Filtered vent at the top, and the gland plate at the bottom.
      box(cab, m.ink, [0.32, 0.16, 0.03], [0, H - 0.24, D * 0.5 + 0.01], { chamfer: 0.014, fillet: 0.005, bevel: 0.005 })
      for (let index = 0; index < 4; index += 1) {
        box(cab, m.steel, [0.3, 0.022, 0.026], [0, H - 0.3 + index * 0.038, D * 0.5 + 0.03], {
          chamfer: 0.005, fillet: 0.002, bevel: 0.002, rotation: [-0.5, 0, 0],
        })
      }
      box(cab, m.graphite, [W - 0.14, 0.05, D - 0.1], [0, 0.13, 0], { chamfer: 0.014, fillet: 0.006, bevel: 0.005 })
      for (let index = 0; index < 4; index += 1) {
        cab.add(cylinder(m.ink, 0.022, 0.08, [-0.22 + index * 0.145, 0.13, D * 0.5 - 0.09], AXIS_Y, 8))
      }
    },
  })
}

export function createPreview(options: CargoPreviewOptions = {}): CargoPreview {
  return createConsolePreview(createModel(), ENVELOPE, { distance: 4.2, ...options })
}
