import { Group } from 'three/webgpu'

import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import { AXIS_X, box, boltRun, type CargoPreview } from '../axiom-cargo-kit/index.ts'
import {
  CLEAR_HALF,
  DOOR_KIT,
  PANEL_FRONT,
  buildPortal,
  createDoorModel,
  createDoorPreview,
  signalLamp,
  type DoorModel,
  type DoorPreviewOptions,
} from '../axiom-door-kit/index.ts'

/** Slat pitch, chosen so a whole number of slats fills the clear opening. */
const SLAT_COUNT = 17
const SLAT_PITCH = (DOOR_KIT.clearHeight - 0.04) / SLAT_COUNT

/**
 * Axiom Relay industrial shutter — the rolling closure.
 *
 * A shutter is the one module in the group with no leaf at all: it is a curtain
 * of slats, a barrel to roll onto, and the guides that keep the curtain flat
 * while it moves. That makes it the kit's honest answer to "what closes an
 * opening you also need to drive a pallet jack through", and it is why it
 * carries no hinges, no handle, and no vision port.
 *
 * The curtain rolls up rather than sliding away, so the module's whole open
 * state lives in a 0.34 m barrel above the head — which is the reason the head
 * band on this module is the only place the family spends depth.
 */

export function createModel(): DoorModel {
  return createDoorModel({
    id: 'industrial-shutter',
    condition: 0.72,
    build: ({ m, bundle, part }) => {
      const frame = part('frame')
      const curtain = part('curtain')
      const amber = signalLamp(bundle, 'AMBER-400', 11_600)

      buildPortal(frame, m, { signal: amber, hinges: false })

      // Barrel housing above the head, and the barrel itself inside it.
      // Kept inside the module's 2.6 m envelope. Drawn 60 mm higher the housing
      // stood proud of the plate's own top edge and read as a separate box
      // balanced on the door rather than as the head of it.
      const barrelY = DOOR_KIT.centreY + CLEAR_HALF[1] + 0.11
      box(frame, m.graphite, [DOOR_KIT.width - 0.18, 0.24, 0.26], [0, barrelY, PANEL_FRONT - 0.02], {
        chamfer: 0.045, fillet: 0.014, bevel: 0.012, capChamfer: [0.04, 0.02],
      })
      frame.add(cylinder(m.ironOxide, 0.115, DOOR_KIT.clearWidth + 0.08, [0, barrelY, PANEL_FRONT - 0.02], AXIS_X, 14))
      for (const sx of [-1, 1]) {
        box(frame, m.graphiteEdge, [0.08, 0.21, 0.22], [sx * (DOOR_KIT.width * 0.5 - 0.1), barrelY, PANEL_FRONT - 0.02], {
          chamfer: 0.03, fillet: 0.01, bevel: 0.009,
        })
        boltRun(frame, m.steel, [sx * (DOOR_KIT.width * 0.5 - 0.1), barrelY - 0.08, PANEL_FRONT + 0.115], [sx * (DOOR_KIT.width * 0.5 - 0.1), barrelY + 0.08, PANEL_FRONT + 0.115], 2, 0.015, 'front')
      }

      // Side guides: the channels the curtain's ends run in.
      for (const sx of [-1, 1]) {
        box(frame, m.graphiteEdge, [0.07, DOOR_KIT.clearHeight + 0.1, 0.11], [
          sx * (CLEAR_HALF[0] + 0.02), DOOR_KIT.centreY, PANEL_FRONT - 0.055,
        ], { chamfer: 0.018, fillet: 0.007, bevel: 0.006 })
      }

      // The curtain. Each slat is a shallow box with a rolled lip, and every
      // slat is identical — which is the whole reason a shutter is cheap and a
      // blast door is not.
      const slatWidth = DOOR_KIT.clearWidth - 0.03
      for (let index = 0; index < SLAT_COUNT; index += 1) {
        const y = DOOR_KIT.centreY + CLEAR_HALF[1] - 0.02 - (index + 0.5) * SLAT_PITCH
        box(curtain, index % 2 === 0 ? m.shell : m.shellShade, [slatWidth, SLAT_PITCH * 0.86, 0.05], [
          0, y, PANEL_FRONT - 0.07,
        ], { chamfer: SLAT_PITCH * 0.2, fillet: 0.005, bevel: 0.006 })
        box(curtain, m.ink, [slatWidth - 0.01, SLAT_PITCH * 0.12, 0.03], [
          0, y - SLAT_PITCH * 0.47, PANEL_FRONT - 0.078,
        ], { chamfer: 0.004, fillet: 0.002, bevel: 0.002 })
      }
      // Bottom rail: the heavy section that lands on the threshold, with the
      // hazard band the brief asks for as the module's caution read.
      const railY = DOOR_KIT.centreY - CLEAR_HALF[1] + 0.04
      box(curtain, m.graphite, [slatWidth + 0.02, 0.11, 0.075], [0, railY, PANEL_FRONT - 0.07], {
        chamfer: 0.026, fillet: 0.009, bevel: 0.008,
      })
      box(curtain, m.amberPaint, [slatWidth - 0.04, 0.035, 0.024], [0, railY, PANEL_FRONT - 0.028], {
        chamfer: 0.008, fillet: 0.004, bevel: 0.003,
      })

      return {
        assemblies: [curtain],
        cycleSeconds: 2.9,
        apply: (blend) => {
          // The curtain rises into the barrel and is clipped by the head
          // housing, so no slat is ever visible above the opening.
          curtain.position.y = blend * (DOOR_KIT.clearHeight - 0.06)
          curtain.visible = blend < 0.985
        },
        sockets: {
          rail_barrel: [0, barrelY, PANEL_FRONT - 0.02],
          door_bottom_rail: [0, railY, PANEL_FRONT - 0.07],
        },
        tick: (elapsed) => {
          amber.emissiveIntensity = 0.68 + Math.sin(elapsed * 1.9) * 0.14
        },
      }
    },
  })
}

export function createPreview(options: DoorPreviewOptions = {}): CargoPreview {
  return createDoorPreview(createModel(), options)
}

export function createOpenPreview(options: DoorPreviewOptions = {}): CargoPreview {
  return createDoorPreview(createModel(), { ...options, state: 'open' })
}
