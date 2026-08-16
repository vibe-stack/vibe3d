import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import { AXIS_X, box, type CargoPreview } from '../axiom-cargo-kit/index.ts'
import {
  PLATE_FRONT,
  WINDOW_KIT,
  apertureLamps,
  bayPlate,
  cill,
  createWindowModel,
  createWindowPreview,
  glazing,
  plateFixings,
  signalLamp,
  type WindowModel,
  type WindowPreviewOptions,
} from '../axiom-window-kit/index.ts'

/** A deliberately larger opening in the same plate: less frame, more view. */
const WIDE_HALF: readonly [number, number] = [0.58, 0.5]

/**
 * Axiom Relay luxury residential window — the bay with its hardware hidden.
 *
 * Luxury in this visual system is not ornament, it is *absence*: the same bay
 * with the aperture opened up, the reveal slimmed to a shadow gap, the control
 * paddle and plate strips deleted, and the actuator ram concealed behind a cover
 * instead of displayed. Everything the industrial modules show off because it
 * proves they are serviceable, this one hides because someone lives here.
 *
 * What it adds instead is the only thing a residential window has that a plant
 * room does not: a projecting ledge deep enough to sit on, and a fabric blind in
 * a head cassette.
 */

export function createModel(): WindowModel {
  return createWindowModel({
    id: 'luxury-residential-window',
    condition: 0.12,
    build: ({ m, bundle, part }) => {
      const frame = part('frame')
      const blind = part('blind')
      const amber = signalLamp(bundle, 'AMBER-400', 3_180, 0.5)

      bayPlate(frame, m, { half: WIDE_HALF })
      plateFixings(frame, m)
      apertureLamps(frame, m, amber, { half: WIDE_HALF })
      glazing(frame, m, { half: WIDE_HALF, thickness: 0.022 })
      cill(frame, m, { half: WIDE_HALF })

      // Ledge: the projecting sill board, deep enough to be furniture.
      const ledgeY = WINDOW_KIT.centreY - WIDE_HALF[1] - 0.1
      box(frame, m.shellLight, [WINDOW_KIT.width - 0.2, 0.055, 0.4], [0, ledgeY, 0.16], {
        chamfer: 0.024, fillet: 0.01, bevel: 0.012, capChamfer: [0.03, 0.015],
      })
      for (const sx of [-1, 1]) {
        // Brackets under it, because a 400 mm cantilever needs them and a
        // ledge that floats is the detail that gives a render away.
        box(frame, m.steel, [0.03, 0.13, 0.22], [sx * 0.42, ledgeY - 0.08, 0.18], {
          chamfer: 0.012, fillet: 0.005, bevel: 0.005, rotation: [0.5, 0, 0],
        })
      }

      // Head cassette and the blind rolled inside it.
      const headY = WINDOW_KIT.centreY + WIDE_HALF[1] + 0.09
      box(frame, m.shellLight, [WINDOW_KIT.width - 0.26, 0.11, 0.13], [0, headY, PLATE_FRONT - 0.045], {
        chamfer: 0.032, fillet: 0.012, bevel: 0.01, capChamfer: [0.03, 0.015],
      })
      frame.add(cylinder(m.graphiteEdge, 0.04, WINDOW_KIT.width - 0.34, [0, headY, PLATE_FRONT - 0.045], AXIS_X, 12))
      box(blind, m.fabric, [WIDE_HALF[0] * 2 - 0.02, WIDE_HALF[1] * 2, 0.012], [
        0, WINDOW_KIT.centreY, PLATE_FRONT - 0.09,
      ], { chamfer: 0.008, fillet: 0.003, bevel: 0.003 })
      box(blind, m.steel, [WIDE_HALF[0] * 2 - 0.02, 0.03, 0.026], [
        0, WINDOW_KIT.centreY - WIDE_HALF[1], PLATE_FRONT - 0.09,
      ], { chamfer: 0.008, fillet: 0.003, bevel: 0.003 })

      // Concealed ram: a cover over the actuator rather than the bare hardware.
      box(frame, m.shellShade, [0.075, WIDE_HALF[1] * 1.7, 0.055], [
        -WIDE_HALF[0] + 0.05, WINDOW_KIT.centreY, PLATE_FRONT - 0.09,
      ], { chamfer: 0.02, fillet: 0.008, bevel: 0.007 })

      return {
        assemblies: [blind],
        cycleSeconds: 2.2,
        apply: (blend) => {
          // `open` retracts the blind into the cassette. The scale is anchored
          // at the head, so it rolls up rather than shrinking about its middle.
          const drop = 1 - blend
          blind.scale.y = Math.max(0.001, drop)
          blind.position.y = (1 - drop) * (WINDOW_KIT.centreY + WIDE_HALF[1])
        },
        sockets: {
          window_head: [0, headY, PLATE_FRONT],
          window_cill: [0, ledgeY, 0.16],
          cover_blind: [0, WINDOW_KIT.centreY, PLATE_FRONT - 0.09],
        },
        tick: (elapsed) => {
          amber.emissiveIntensity = 0.48 + Math.sin(elapsed * 0.6) * 0.05
        },
      }
    },
  })
}

export function createPreview(options: WindowPreviewOptions = {}): CargoPreview {
  return createWindowPreview(createModel(), { ...options, state: options.state ?? 'open' })
}

/** Closed: the blind down, which is the state the fabric actually reads in. */
export function createClosedPreview(options: WindowPreviewOptions = {}): CargoPreview {
  return createWindowPreview(createModel(), { ...options, state: 'closed' })
}

