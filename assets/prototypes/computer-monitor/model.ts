import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import { AXIS_Y, box, type CargoPreview, type CargoPreviewOptions } from '../axiom-cargo-kit/index.ts'
import { CONSOLE, createConsoleModel, createConsolePreview, screen, screenSurface, type ConsoleModel } from '../axiom-console-kit/index.ts'

/**
 * Axiom Relay computer monitor — the desk display.
 *
 * Sized and positioned from the kit's shared human datums rather than from
 * itself: the panel's centre lands at seated eye height when the stand is put on
 * a 0.74 m desk, which is the only reason a monitor and a desk from the same
 * library ever line up.
 *
 * The stand is a weighted foot and a raked neck, not a plate. A screen on a thin
 * plate has nothing holding it against its own moment, and the eye reads that
 * even when it cannot name it.
 */

const PANEL: readonly [number, number] = [0.56, 0.34]
const ENVELOPE = { width: 0.6, depth: 0.24, height: 0.52 }

export function createModel(): ConsoleModel {
  return createConsoleModel({
    id: 'computer-monitor',
    condition: 0.34,
    envelope: ENVELOPE,
    build: ({ m, bundle, part }) => {
      const monitor = part('monitor')
      const face = screenSurface(bundle, 'CYAN-400', 5_720)

      // Weighted foot, raked neck, and the tilt hinge at the top of it.
      box(monitor, m.graphite, [0.22, 0.018, 0.17], [0, 0.009, 0], { chamfer: 0.03, fillet: 0.008, bevel: 0.006 })
      box(monitor, m.ink, [0.2, 0.006, 0.15], [0, 0.002, 0], { chamfer: 0.028, fillet: 0.004, bevel: 0.003 })
      box(monitor, m.graphite, [0.05, 0.2, 0.05], [0, 0.11, -0.02], { chamfer: 0.014, fillet: 0.006, bevel: 0.005, rotation: [0.16, 0, 0] })
      monitor.add(cylinder(m.steel, 0.022, 0.06, [0, 0.21, -0.04], [0, 0, Math.PI / 2], 10))

      // Panel, raked back the same amount the neck is.
      screen(monitor, m, face, PANEL, [0, 0.34, -0.02], [-0.12, 0, 0])
      // Rear housing, so the module is not a card from behind.
      box(monitor, m.shellShade, [PANEL[0] - 0.06, PANEL[1] - 0.06, 0.05], [0, 0.34, -0.06], {
        chamfer: 0.03, fillet: 0.01, bevel: 0.009, rotation: [-0.12, 0, 0],
      })
      box(monitor, m.ink, [0.1, 0.05, 0.03], [0.18, 0.2, -0.06], { chamfer: 0.01, fillet: 0.004, bevel: 0.004 })
    },
  })
}

export function createPreview(options: CargoPreviewOptions = {}): CargoPreview {
  return createConsolePreview(createModel(), ENVELOPE, options)
}
