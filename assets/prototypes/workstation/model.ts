import { box, statusLens, type CargoPreview, type CargoPreviewOptions } from '../axiom-cargo-kit/index.ts'
import { CONSOLE, createConsoleModel, createConsolePreview, screen, screenSurface, type ConsoleModel } from '../axiom-console-kit/index.ts'

/**
 * Axiom Relay workstation — the operator desk.
 *
 * The piece the rest of the group is dimensioned around. Its surface is at the
 * kit's 0.74 m desk datum, its screen rail puts panel centres at the 1.15 m
 * seated eye datum, and the knee space under it is clear to 0.62 m — which is
 * what makes the swivel chair actually fit under it rather than approximately
 * fit under it.
 *
 * The cable management is modelled rather than implied: a tray under the back
 * edge, a grommet through the top, and a riser down one leg. On a desk covered
 * in equipment, where the cables go is most of what makes it look used.
 */

const W = 1.6
const D = 0.78
const ENVELOPE = { width: W, depth: D + 0.06, height: 1.42 }

export function createModel(): ConsoleModel {
  return createConsoleModel({
    id: 'workstation',
    condition: 0.44,
    envelope: ENVELOPE,
    build: ({ m, bundle, part }) => {
      const desk = part('desk')
      const face = screenSurface(bundle, 'CYAN-400', 6_050)

      // Top: a worked surface on a deeper front edge, with a grommet in it.
      box(desk, m.shell, [W, 0.04, D], [0, CONSOLE.desk - 0.02, 0], { chamfer: 0.02, fillet: 0.009, bevel: 0.012 })
      box(desk, m.graphiteEdge, [W, 0.03, 0.05], [0, CONSOLE.desk - 0.055, D * 0.5 - 0.02], { chamfer: 0.01, fillet: 0.004, bevel: 0.004 })
      box(desk, m.ink, [0.11, 0.02, 0.07], [0.42, CONSOLE.desk - 0.008, -D * 0.28], { chamfer: 0.026, fillet: 0.006, bevel: 0.005 })

      // Legs: braced frames, with the knee space between them left clear.
      for (const side of [-1, 1] as const) {
        const x = side * (W * 0.5 - 0.09)
        box(desk, m.graphite, [0.06, CONSOLE.desk - 0.06, D - 0.12], [x, (CONSOLE.desk - 0.06) * 0.5, 0], { chamfer: 0.016, fillet: 0.007, bevel: 0.006 })
        box(desk, m.graphite, [0.13, 0.05, D - 0.06], [x, 0.03, 0], { chamfer: 0.014, fillet: 0.006, bevel: 0.005 })
        box(desk, m.rubber, [0.13, 0.012, 0.09], [x, 0.006, D * 0.4], { chamfer: 0.005, fillet: 0.002, bevel: 0.002 })
        box(desk, m.rubber, [0.13, 0.012, 0.09], [x, 0.006, -D * 0.4], { chamfer: 0.005, fillet: 0.002, bevel: 0.002 })
      }
      // Back rail tying the legs together, above knee height.
      box(desk, m.graphiteEdge, [W - 0.24, 0.08, 0.05], [0, 0.62, -D * 0.5 + 0.09], { chamfer: 0.016, fillet: 0.006, bevel: 0.006 })

      // Cable tray under the back edge, and the riser down one leg.
      box(desk, m.ink, [W - 0.4, 0.06, 0.11], [0, CONSOLE.desk - 0.12, -D * 0.5 + 0.1], { chamfer: 0.014, fillet: 0.006, bevel: 0.005 })
      box(desk, m.graphiteEdge, [0.07, 0.5, 0.06], [W * 0.5 - 0.09, 0.38, -D * 0.5 + 0.11], { chamfer: 0.016, fillet: 0.006, bevel: 0.005 })

      // Screen rail: two panels at the shared seated eye datum.
      box(desk, m.graphite, [0.07, CONSOLE.eye - CONSOLE.desk + 0.16, 0.07], [0, (CONSOLE.desk + CONSOLE.eye) * 0.5 - 0.02, -D * 0.34], {
        chamfer: 0.018, fillet: 0.007, bevel: 0.006,
      })
      box(desk, m.graphite, [0.96, 0.05, 0.05], [0, CONSOLE.eye + 0.04, -D * 0.34], { chamfer: 0.014, fillet: 0.006, bevel: 0.005 })
      for (const side of [-1, 1] as const) {
        screen(desk, m, face, [0.42, 0.27], [side * 0.26, CONSOLE.eye - 0.05, -D * 0.3], [0, -side * 0.22, 0])
      }
      statusLens(desk, m, [0.03, 0.03], [-0.6, CONSOLE.desk + 0.01, -D * 0.32], m.amber, 'top')
    },
  })
}

export function createPreview(options: CargoPreviewOptions = {}): CargoPreview {
  return createConsolePreview(createModel(), ENVELOPE, { distance: 3.9, ...options })
}
