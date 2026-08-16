import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import { AXIS_X, AXIS_Y, box, statusLens, type CargoPreview, type CargoPreviewOptions } from '../axiom-cargo-kit/index.ts'
import { CONSOLE, castorLeg, createConsoleModel, createConsolePreview, type ConsoleModel } from '../axiom-console-kit/index.ts'

/**
 * Axiom Relay maintenance cart — the technician's trolley.
 *
 * The mobile counterpart to the workstation: three shelves, a push handle, a
 * power strip on a reel, and a lipped top so nothing rolls off it while it is
 * being pushed. It runs on the same castors as the chairs, which is the point of
 * putting them in the kit — the two roll on the same wheels because in a facility
 * that buys one it would.
 *
 * The lip is the detail that makes it a cart rather than a shelf on wheels.
 * A flat-topped trolley is a trolley that has never been pushed anywhere.
 */

const W = 0.72
const D = 0.46
const TOP = 0.94
const ENVELOPE = { width: W + 0.12, depth: D + 0.16, height: TOP + 0.28 }

export function createModel(): ConsoleModel {
  return createConsoleModel({
    id: 'maintenance-cart',
    condition: 0.78,
    envelope: ENVELOPE,
    build: ({ m, part }) => {
      const cart = part('cart')

      // Corner uprights and the castors under them.
      for (const sx of [-1, 1] as const) {
        for (const sz of [-1, 1] as const) {
          const x = sx * (W * 0.5 - 0.04)
          const z = sz * (D * 0.5 - 0.04)
          box(cart, m.graphite, [0.04, TOP - CONSOLE.castor, 0.04], [x, (TOP + CONSOLE.castor) * 0.5, z], {
            chamfer: 0.01, fillet: 0.004, bevel: 0.004,
          })
          castorLeg(cart, m, [x, 0, z])
        }
      }

      // Three shelves, each with a turned-up lip on all four sides.
      for (const [index, y] of [0.28, 0.6, TOP].entries()) {
        box(cart, m.shell, [W, 0.026, D], [0, y, 0], { chamfer: 0.014, fillet: 0.006, bevel: 0.007 })
        for (const sx of [-1, 1] as const) {
          box(cart, m.graphiteEdge, [0.02, 0.05, D], [sx * (W * 0.5 - 0.01), y + 0.032, 0], { chamfer: 0.006, fillet: 0.003, bevel: 0.003 })
        }
        for (const sz of [-1, 1] as const) {
          box(cart, m.graphiteEdge, [W, 0.05, 0.02], [0, y + 0.032, sz * (D * 0.5 - 0.01)], { chamfer: 0.006, fillet: 0.003, bevel: 0.003 })
        }
        // Anti-slip mat on the two working shelves.
        if (index > 0) box(cart, m.rubber, [W - 0.08, 0.008, D - 0.08], [0, y + 0.017, 0], { chamfer: 0.008, fillet: 0.003, bevel: 0.002 })
      }

      // Push handle, raked back so it clears the top shelf's lip.
      for (const sx of [-1, 1] as const) {
        box(cart, m.graphite, [0.03, 0.26, 0.03], [sx * (W * 0.5 - 0.04), TOP + 0.13, -D * 0.5 + 0.04], {
          chamfer: 0.008, fillet: 0.003, bevel: 0.003, rotation: [0.22, 0, 0],
        })
      }
      cart.add(cylinder(m.rubber, 0.019, W - 0.06, [0, TOP + 0.26, -D * 0.5 + 0.01], AXIS_X, 10))

      // Power reel and strip on the lower shelf, and the tool rail on the side.
      cart.add(cylinder(m.graphiteEdge, 0.075, 0.09, [-W * 0.5 + 0.14, 0.37, -D * 0.5 + 0.13], AXIS_Y, 12))
      cart.add(cylinder(m.ink, 0.052, 0.07, [-W * 0.5 + 0.14, 0.37, -D * 0.5 + 0.13], AXIS_Y, 12))
      box(cart, m.graphite, [0.24, 0.05, 0.06], [W * 0.5 - 0.19, 0.33, -D * 0.5 + 0.12], { chamfer: 0.012, fillet: 0.005, bevel: 0.004 })
      for (let index = 0; index < 3; index += 1) {
        statusLens(cart, m, [0.018, 0.018], [W * 0.5 - 0.27 + index * 0.07, 0.355, -D * 0.5 + 0.12], m.amber, 'top')
      }
      cart.add(cylinder(m.steel, 0.012, D - 0.1, [W * 0.5 + 0.02, 0.72, 0], [Math.PI / 2, 0, 0], 8))
      for (let index = 0; index < 4; index += 1) {
        box(cart, m.steel, [0.014, 0.09, 0.014], [W * 0.5 + 0.02, 0.67, -0.12 + index * 0.08], { chamfer: 0.004, fillet: 0.002, bevel: 0.002 })
      }
    },
  })
}

export function createPreview(options: CargoPreviewOptions = {}): CargoPreview {
  return createConsolePreview(createModel(), ENVELOPE, { distance: 3.1, ...options })
}
