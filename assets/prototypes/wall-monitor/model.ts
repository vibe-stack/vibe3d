import { box, statusLens, type CargoPreview, type CargoPreviewOptions } from '../axiom-cargo-kit/index.ts'
import { createConsoleModel, createConsolePreview, screen, screenSurface, type ConsoleModel } from '../axiom-console-kit/index.ts'

/**
 * Axiom Relay wall monitor — the shared overview display.
 *
 * The room's screen rather than a person's: bracketed off a wall, tilted down so
 * a standing viewer sees it square, and large enough to be read from the far
 * side of a control room. Its bracket is the module's real content — a wall
 * screen drawn flush to a wall has no way to be serviced, no cable route, and no
 * explanation for the gap every real one has behind it.
 *
 * The pivot sits on the wall plane at z = 0, so the module can be dropped
 * straight onto a wall bay without a builder solving for its own depth.
 */

const PANEL: readonly [number, number] = [1.28, 0.74]
const ENVELOPE = { width: PANEL[0] + 0.1, depth: 0.3, height: PANEL[1] + 0.2 }

export function createModel(): ConsoleModel {
  return createConsoleModel({
    id: 'wall-monitor',
    condition: 0.28,
    envelope: ENVELOPE,
    build: ({ m, bundle, part }) => {
      const display = part('display')
      const face = screenSurface(bundle, 'CYAN-400', 5_830, 0.54)
      const tilt = -0.18
      const centreY = ENVELOPE.height * 0.5

      // Wall plate and the two arms that carry the panel off it.
      box(display, m.graphite, [0.34, 0.5, 0.05], [0, centreY, 0.025], { chamfer: 0.04, fillet: 0.012, bevel: 0.01 })
      for (const side of [-1, 1] as const) {
        box(display, m.steel, [0.06, 0.06, 0.22], [side * 0.11, centreY + 0.12, 0.14], { chamfer: 0.016, fillet: 0.006, bevel: 0.005 })
        box(display, m.steel, [0.05, 0.3, 0.05], [side * 0.11, centreY, 0.24], { chamfer: 0.014, fillet: 0.005, bevel: 0.005, rotation: [tilt, 0, 0] })
      }
      // Cable route down the wall plate, which is why there is a gap at all.
      box(display, m.ink, [0.07, 0.44, 0.03], [0, centreY - 0.02, 0.055], { chamfer: 0.014, fillet: 0.005, bevel: 0.004 })

      screen(display, m, face, PANEL, [0, centreY, 0.28], [tilt, 0, 0])
      box(display, m.shellShade, [PANEL[0] - 0.1, PANEL[1] - 0.1, 0.05], [0, centreY, 0.24], {
        chamfer: 0.04, fillet: 0.012, bevel: 0.011, rotation: [tilt, 0, 0],
      })
      statusLens(display, m, [0.035, 0.02], [PANEL[0] * 0.44, centreY - PANEL[1] * 0.46, 0.31], m.amber, 'front')
    },
  })
}

export function createPreview(options: CargoPreviewOptions = {}): CargoPreview {
  return createConsolePreview(createModel(), ENVELOPE, { distance: 3.4, ...options })
}
