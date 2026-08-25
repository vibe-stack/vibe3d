import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import { AXIS_Y, box, boltRun, type CargoPreview } from '../axiom-cargo-kit/index.ts'
import {
  PLATE_FRONT,
  WINDOW_KIT,
  buildBay,
  createWindowModel,
  createWindowPreview,
  glazing,
  glazingBars,
  signalLamp,
  type WindowModel,
  type WindowPreviewOptions,
} from '../axiom-window-kit/index.ts'

/** A tighter aperture in the same plate: the bay is shared, the opening is not. */
const SMALL_HALF: readonly [number, number] = [0.34, 0.29]

/**
 * Axiom Relay small industrial window — the plant-room light.
 *
 * This is the module that proves the *bay* is the shared thing rather than the
 * aperture. Same 1.5 m plate, same reveal language, same cill — but the opening
 * is barely a third of the area, because a plant room wants daylight and does
 * not want a 1 m hole in a wall carrying services. What the plate loses in
 * aperture it gains in hardware: a protective grille, corner gussets, and the
 * fixings to carry both.
 */

export function createModel(): WindowModel {
  return createWindowModel({
    id: 'small-industrial-window',
    condition: 0.74,
    build: ({ m, bundle, part }) => {
      const frame = part('frame')
      const amber = signalLamp(bundle, 'AMBER-400', 2_630)

      buildBay(frame, m, amber, { half: SMALL_HALF })
      glazing(frame, m, { half: SMALL_HALF })
      glazingBars(frame, m, 2, 2, { half: SMALL_HALF })

      // Protective grille: four bars and a surround, standing off the glass so
      // it reads as a guard rather than as a pattern printed on the pane.
      const [hx, hy] = SMALL_HALF
      const z = PLATE_FRONT + 0.02
      for (let index = 0; index < 4; index += 1) {
        box(frame, m.ironOxide, [0.026, hy * 2 - 0.02, 0.026], [
          (index - 1.5) * (hx * 2 - 0.08) / 3.4, WINDOW_KIT.centreY, z,
        ], { chamfer: 0.008, fillet: 0.003, bevel: 0.003 })
      }
      for (const sy of [-1, 1]) {
        box(frame, m.ironOxide, [hx * 2 - 0.02, 0.03, 0.03], [0, WINDOW_KIT.centreY + sy * (hy - 0.02), z], {
          chamfer: 0.009, fillet: 0.004, bevel: 0.003,
        })
      }
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          frame.add(cylinder(m.steel, 0.02, 0.07, [sx * (hx - 0.02), WINDOW_KIT.centreY + sy * (hy - 0.02), z - 0.02], AXIS_Y, 8))
        }
      }

      // Corner gussets on the plate: the plate is mostly solid here, so it gets
      // the stiffening a mostly-glazed bay does not need.
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          box(frame, m.shellShade, [0.2, 0.055, 0.016], [
            sx * 0.44, WINDOW_KIT.centreY + sy * 0.42, PLATE_FRONT + 0.026,
          ], { chamfer: 0.014, fillet: 0.005, bevel: 0.004, rotation: [0, 0, sx * sy * 0.62] })
        }
      }
      boltRun(frame, m.steel, [-0.52, WINDOW_KIT.centreY, PLATE_FRONT + 0.03], [0.52, WINDOW_KIT.centreY, PLATE_FRONT + 0.03], 2, 0.014, 'front')

      return {
        sockets: {
          cover_grille: [0, WINDOW_KIT.centreY, PLATE_FRONT + 0.02],
        },
        tick: (elapsed) => {
          amber.emissiveIntensity = 0.6 + Math.sin(elapsed * 0.9) * 0.08
        },
      }
    },
  })
}

export function createPreview(options: WindowPreviewOptions = {}): CargoPreview {
  return createWindowPreview(createModel(), options)
}
