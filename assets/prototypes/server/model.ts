import { box, statusLens, type CargoPreview, type CargoPreviewOptions } from '../axiom-cargo-kit/index.ts'
import { CONSOLE, createConsoleModel, createConsolePreview, type ConsoleModel } from '../axiom-console-kit/index.ts'

/**
 * Axiom Relay server — one rack-mounted chassis.
 *
 * A single unit, not a cabinet: 4U tall on the kit's 44.5 mm rack pitch, with
 * the ears that carry it and the slide rails it runs on. The existing library
 * already has a server cabinet; what it had no way to express is a machine you
 * can pull out of one, and half of what makes a server room read is the one
 * chassis racked out on its rails.
 *
 * The front is drive bays and airflow, the back is power and data — because that
 * is the actual rule, cold aisle in front, hot aisle behind, and every cable on
 * the hot side.
 */

const UNITS = 4
const W = CONSOLE.rackWidth - 0.12
const H = CONSOLE.rackUnit * UNITS
const D = 0.72
const ENVELOPE = { width: CONSOLE.rackWidth, depth: D + 0.06, height: H + 0.04 }

export function createModel(): ConsoleModel {
  return createConsoleModel({
    id: 'server',
    condition: 0.4,
    envelope: ENVELOPE,
    build: ({ m, part }) => {
      const unit = part('chassis')
      const y = H * 0.5

      box(unit, m.graphite, [W, H, D], [0, y, 0], { chamfer: 0.01, fillet: 0.004, bevel: 0.005 })
      box(unit, m.shellShade, [W - 0.01, H - 0.012, 0.02], [0, y, D * 0.5 + 0.005], { chamfer: 0.008, fillet: 0.003, bevel: 0.003 })

      // Rack ears and the slide rails behind them.
      for (const side of [-1, 1] as const) {
        box(unit, m.steel, [0.05, H, 0.012], [side * (W * 0.5 + 0.025), y, D * 0.5 - 0.006], { chamfer: 0.006, fillet: 0.003, bevel: 0.002 })
        for (const uy of [y - H * 0.28, y + H * 0.28]) {
          box(unit, m.ink, [0.018, 0.018, 0.008], [side * (W * 0.5 + 0.025), uy, D * 0.5 + 0.002], { chamfer: 0.004, fillet: 0.002, bevel: 0.002 })
        }
        box(unit, m.steel, [0.014, H - 0.02, D - 0.05], [side * (W * 0.5 + 0.006), y, -0.01], { chamfer: 0.005, fillet: 0.002, bevel: 0.002 })
      }

      // Front: two rows of drive carriers, a handle, and the status column.
      for (let row = 0; row < 2; row += 1) {
        for (let column = 0; column < 6; column += 1) {
          box(unit, m.graphiteEdge, [0.055, H * 0.36, 0.014], [
            -0.18 + column * 0.062, y + (row === 0 ? -1 : 1) * H * 0.22, D * 0.5 + 0.018,
          ], { chamfer: 0.005, fillet: 0.002, bevel: 0.002 })
          box(unit, m.ink, [0.03, 0.008, 0.008], [
            -0.18 + column * 0.062, y + (row === 0 ? -1 : 1) * H * 0.22, D * 0.5 + 0.026,
          ], { chamfer: 0.002, fillet: 0.001, bevel: 0.001 })
        }
      }
      box(unit, m.steel, [0.02, H * 0.6, 0.03], [W * 0.5 - 0.03, y, D * 0.5 + 0.03], { chamfer: 0.006, fillet: 0.003, bevel: 0.003 })
      for (let index = 0; index < 3; index += 1) {
        statusLens(unit, m, [0.012, 0.012], [-W * 0.5 + 0.03, y - 0.03 + index * 0.03, D * 0.5 + 0.024], index === 0 ? m.cyan : m.amber, 'front')
      }

      // Back: PSU pair, fan grilles, and the port block.
      for (const side of [-1, 1] as const) {
        box(unit, m.graphiteEdge, [0.15, H - 0.02, 0.03], [side * 0.11, y, -D * 0.5 - 0.012], { chamfer: 0.008, fillet: 0.003, bevel: 0.003 })
        box(unit, m.ink, [0.1, H - 0.05, 0.012], [side * 0.11, y, -D * 0.5 - 0.026], { chamfer: 0.02, fillet: 0.004, bevel: 0.003 })
        box(unit, m.steel, [0.026, 0.02, 0.02], [side * 0.11, y - H * 0.3, -D * 0.5 - 0.03], { chamfer: 0.004, fillet: 0.002, bevel: 0.002 })
      }
      for (let index = 0; index < 5; index += 1) {
        box(unit, m.ink, [0.03, 0.014, 0.01], [-0.04 + index * 0.02, y + H * 0.24, -D * 0.5 - 0.014], { chamfer: 0.003, fillet: 0.001, bevel: 0.001 })
      }
    },
  })
}

export function createPreview(options: CargoPreviewOptions = {}): CargoPreview {
  return createConsolePreview(createModel(), ENVELOPE, { distance: 1.9, pitch: 0.3, ...options })
}
