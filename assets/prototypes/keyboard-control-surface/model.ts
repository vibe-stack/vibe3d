import { box, statusLens, type CargoPreview, type CargoPreviewOptions } from '../axiom-cargo-kit/index.ts'
import { CONSOLE, createConsoleModel, createConsolePreview, screen, screenSurface, type ConsoleModel } from '../axiom-console-kit/index.ts'

/**
 * Axiom Relay keyboard control surface — the input deck.
 *
 * Not a keyboard: a control *surface*, which is the thing an industrial station
 * actually has. A block of keys for text, a row of hard-labelled function keys
 * that do not change, two rotary encoders, a shuttle wheel, and one guarded
 * switch under a flip cover for the action that must never be hit by accident.
 *
 * The guard is the module's whole argument. Every other control here is flush
 * and identical; the one that matters is the only one you cannot reach without
 * deciding to.
 */

const W = 0.52
const D = 0.24
const ENVELOPE = { width: W, depth: D + 0.06, height: 0.09 }

export function createModel(): ConsoleModel {
  return createConsoleModel({
    id: 'keyboard-control-surface',
    condition: 0.58,
    envelope: ENVELOPE,
    build: ({ m, bundle, part }) => {
      const deck = part('deck')
      const readout = screenSurface(bundle, 'AMBER-400', 5_940, 0.5)

      // Wedge chassis: back edge raised, so the surface rakes toward the hand.
      box(deck, m.graphite, [W, 0.05, D], [0, 0.025, 0], { chamfer: 0.016, fillet: 0.007, bevel: 0.006 })
      box(deck, m.graphiteEdge, [W - 0.02, 0.02, D - 0.02], [0, 0.055, -0.008], {
        chamfer: 0.012, fillet: 0.005, bevel: 0.004, rotation: [-0.1, 0, 0],
      })
      box(deck, m.rubber, [W - 0.04, 0.012, 0.03], [0, 0.006, D * 0.5 - 0.02], { chamfer: 0.005, fillet: 0.002, bevel: 0.002 })

      // Key block: five rows on a regular pitch.
      const pitch = 0.026
      for (let row = 0; row < 5; row += 1) {
        for (let column = 0; column < 12; column += 1) {
          box(deck, m.ink, [pitch * 0.8, 0.012, pitch * 0.8], [
            -0.16 + column * pitch, 0.072 + row * 0.0022, -0.02 + row * pitch,
          ], { chamfer: 0.004, fillet: 0.002, bevel: 0.002 })
        }
      }
      // Hard-labelled function row along the back, in a lighter key.
      for (let index = 0; index < 8; index += 1) {
        box(deck, m.shellShade, [0.03, 0.011, 0.018], [-0.15 + index * 0.038, 0.079, -0.088], {
          chamfer: 0.004, fillet: 0.002, bevel: 0.002,
        })
      }

      // Encoders, shuttle wheel, and the readout above them.
      for (const x of [0.17, 0.22]) {
        box(deck, m.steel, [0.032, 0.024, 0.032], [x, 0.078, 0.03], { chamfer: 0.008, fillet: 0.004, bevel: 0.003 })
      }
      box(deck, m.graphiteEdge, [0.09, 0.02, 0.09], [0.195, 0.076, -0.04], { chamfer: 0.03, fillet: 0.008, bevel: 0.007 })
      screen(deck, m, readout, [0.1, 0.03], [0.195, 0.082, -0.095], [-1.35, 0, 0])

      // Guarded switch: cover, hinge, and the lit key beneath it.
      box(deck, m.amberPaint, [0.06, 0.03, 0.05], [-0.21, 0.088, 0.052], {
        chamfer: 0.008, fillet: 0.003, bevel: 0.003, rotation: [-0.9, 0, 0],
      })
      box(deck, m.graphite, [0.07, 0.014, 0.055], [-0.21, 0.068, 0.06], { chamfer: 0.01, fillet: 0.004, bevel: 0.004 })
      statusLens(deck, m, [0.022, 0.022], [-0.21, 0.076, 0.06], m.amber, 'top')
    },
  })
}

export function createPreview(options: CargoPreviewOptions = {}): CargoPreview {
  return createConsolePreview(createModel(), ENVELOPE, { distance: 1.4, pitch: 0.5, ...options })
}
