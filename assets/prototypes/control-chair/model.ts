import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import { AXIS_Y, box, statusLens, type CargoPreview, type CargoPreviewOptions } from '../axiom-cargo-kit/index.ts'
import {
  CONSOLE,
  chairColumn,
  createConsoleModel,
  createConsolePreview,
  screen,
  screenSurface,
  type ConsoleModel,
} from '../axiom-console-kit/index.ts'

/**
 * Axiom Relay control chair — the supervised-position seat.
 *
 * Same column and castors as the swivel chair, and then everything a station you
 * do not leave for eight hours needs: a high back with a headrest, arms with a
 * control pad on the right, a footring, and a lumbar section that is a separate
 * pad rather than part of the back shell.
 *
 * The right arm's pad is the module's only lit surface, and it is angled inward
 * so it faces the person sitting in it. An interface that faces the room is
 * decoration; one that faces the seat is a control.
 */

const ENVELOPE = { width: 0.76, depth: 0.74, height: 1.34 }

export function createModel(): ConsoleModel {
  return createConsoleModel({
    id: 'control-chair',
    condition: 0.36,
    build: ({ m, bundle, part }) => {
      const chair = part('chair')
      const pad = screenSurface(bundle, 'CYAN-400', 5_610)
      chairColumn(chair, m, CONSOLE.seat)

      // Footring: the tell that this is a seat for a raised station.
      //
      // Built as a tangent-segment polygon on its stems. Drawn as one straight
      // cylinder it is a bar lying across the base, which is what a footring
      // most needs not to look like.
      const RING = 0.26
      const SEGMENTS = 10
      const chord = 2 * RING * Math.tan(Math.PI / SEGMENTS) + 0.01
      for (let index = 0; index < SEGMENTS; index += 1) {
        const angle = (index / SEGMENTS) * Math.PI * 2
        box(chair, m.steel, [chord, 0.032, 0.032], [
          Math.sin(angle) * RING, CONSOLE.footring, Math.cos(angle) * RING,
        ], { chamfer: 0.008, fillet: 0.004, bevel: 0.003, rotation: [0, angle, 0] })
      }
      for (let index = 0; index < 3; index += 1) {
        const angle = (index / 3) * Math.PI * 2
        chair.add(cylinder(m.steel, 0.014, CONSOLE.seat - CONSOLE.footring - 0.14, [
          Math.sin(angle) * RING, (CONSOLE.footring + CONSOLE.seat - 0.14) * 0.5, Math.cos(angle) * RING,
        ], AXIS_Y, 8))
      }

      box(chair, m.graphite, [0.24, 0.08, 0.28], [0, CONSOLE.seat - 0.055, 0], { chamfer: 0.022, fillet: 0.009, bevel: 0.008 })
      box(chair, m.graphite, [0.5, 0.06, 0.48], [0, CONSOLE.seat, 0], { chamfer: 0.08, fillet: 0.018, bevel: 0.016 })
      box(chair, m.fabric, [0.44, 0.055, 0.42], [0, CONSOLE.seat + 0.04, -0.01], { chamfer: 0.09, fillet: 0.02, bevel: 0.018 })

      // High back, lumbar pad, and headrest, all on one raked stem.
      const rake = -0.2
      box(chair, m.steel, [0.06, 0.28, 0.06], [0, CONSOLE.seat + 0.14, -0.21], { chamfer: 0.014, fillet: 0.006, bevel: 0.005, rotation: [rake, 0, 0] })
      box(chair, m.graphite, [0.46, 0.62, 0.06], [0, CONSOLE.seat + 0.45, -0.29], { chamfer: 0.09, fillet: 0.018, bevel: 0.016, rotation: [rake, 0, 0] })
      box(chair, m.fabric, [0.4, 0.34, 0.05], [0, CONSOLE.seat + 0.3, -0.235], { chamfer: 0.07, fillet: 0.015, bevel: 0.014, rotation: [rake, 0, 0] })
      box(chair, m.fabric, [0.38, 0.2, 0.04], [0, CONSOLE.seat + 0.62, -0.31], { chamfer: 0.06, fillet: 0.013, bevel: 0.012, rotation: [rake, 0, 0] })
      // Seated on the back's top edge, not floating above it: the back tops out
      // at seat + 0.76 once its rake is taken into account.
      box(chair, m.steel, [0.05, 0.1, 0.05], [0, CONSOLE.seat + 0.78, -0.4], { chamfer: 0.012, fillet: 0.005, bevel: 0.004, rotation: [rake, 0, 0] })
      box(chair, m.graphite, [0.3, 0.14, 0.07], [0, CONSOLE.seat + 0.87, -0.42], { chamfer: 0.05, fillet: 0.012, bevel: 0.011, rotation: [rake, 0, 0] })

      // Arms. The right one carries the control pad, turned inward.
      for (const side of [-1, 1] as const) {
        box(chair, m.steel, [0.05, 0.16, 0.05], [side * 0.27, CONSOLE.seat + 0.09, -0.06], { chamfer: 0.012, fillet: 0.005, bevel: 0.005 })
        box(chair, m.graphite, [0.08, 0.05, 0.34], [side * 0.27, CONSOLE.seat + 0.19, 0.02], { chamfer: 0.02, fillet: 0.008, bevel: 0.007 })
        box(chair, m.rubber, [0.07, 0.03, 0.3], [side * 0.27, CONSOLE.seat + 0.225, 0.02], { chamfer: 0.014, fillet: 0.006, bevel: 0.005 })
      }
      screen(chair, m, pad, [0.11, 0.08], [0.28, CONSOLE.seat + 0.27, 0.14], [0.5, -0.55, 0])
      statusLens(chair, m, [0.03, 0.03], [-0.28, CONSOLE.seat + 0.25, 0.14], m.amber, 'top')
    },
    envelope: ENVELOPE,
  })
}

export function createPreview(options: CargoPreviewOptions = {}): CargoPreview {
  return createConsolePreview(createModel(), ENVELOPE, options)
}
