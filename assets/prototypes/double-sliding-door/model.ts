import { Group } from 'three/webgpu'

import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import { AXIS_X, AXIS_Y, box, type CargoPreview } from '../axiom-cargo-kit/index.ts'
import {
  CLEAR_HALF,
  DOOR_KIT,
  LEAF_HALF,
  PANEL_FRONT,
  buildPortal,
  createDoorModel,
  createDoorPreview,
  leafRibs,
  leafSkin,
  signalLamp,
  type DoorModel,
  type DoorPreviewOptions,
} from '../axiom-door-kit/index.ts'

/** Each leaf covers half the clear opening, with a small overlap at the meeting stile. */
const HALF_LEAF: readonly [number, number] = [CLEAR_HALF[0] * 0.5 - 0.006, LEAF_HALF[1]]

/**
 * Axiom Relay double sliding door — the powered bi-parting leaf pair.
 *
 * The interesting constraint is where the leaves *go*. A bi-parting door that
 * slides into the wall needs pockets the kit's 1.6 m module does not have, so
 * these run on an exposed head track and park across the jambs instead. That is
 * a real building decision and it shows: the track, its carriages, and the
 * drive belt are all on the outside of the module, and the leaves are thin
 * because nothing structural passes through them.
 */

export function createModel(): DoorModel {
  return createDoorModel({
    id: 'double-sliding-door',
    condition: 0.34,
    build: ({ m, bundle, part, root }) => {
      const frame = part('frame')
      const left = part('leaf-left')
      const right = part('leaf-right')
      const cyan = signalLamp(bundle, 'CYAN-400', 8_260)

      // No hinge column: the leaves hang from the head, not from a jamb.
      buildPortal(frame, m, { signal: cyan, hinges: false })

      // Head track, carriages, and the belt that drives them.
      const trackY = DOOR_KIT.centreY + CLEAR_HALF[1] - 0.06
      box(frame, m.graphite, [DOOR_KIT.width - 0.24, 0.1, 0.09], [0, trackY, PANEL_FRONT + 0.02], {
        chamfer: 0.026, fillet: 0.01, bevel: 0.008,
      })
      frame.add(cylinder(m.steel, 0.016, DOOR_KIT.width - 0.3, [0, trackY - 0.055, PANEL_FRONT + 0.03], AXIS_X, 8))
      for (const sx of [-1, 1]) {
        frame.add(cylinder(m.steel, 0.038, 0.03, [sx * (DOOR_KIT.width * 0.5 - 0.19), trackY, PANEL_FRONT + 0.08], AXIS_Y, 10))
      }

      const buildLeaf = (parent: Group, centreX: number, side: -1 | 1): void => {
        leafSkin(parent, m, { half: HALF_LEAF, centreX, clip: 0.1 })
        leafRibs(parent, m, centreX, HALF_LEAF)
        // Meeting stile: the vertical the two leaves close against. Only the
        // inboard edge gets one, because only that edge meets anything.
        box(parent, m.graphiteEdge, [0.05, HALF_LEAF[1] * 1.9, 0.05], [
          centreX - side * (HALF_LEAF[0] - 0.025), DOOR_KIT.centreY, PANEL_FRONT - 0.004,
        ], { chamfer: 0.014, fillet: 0.006, bevel: 0.005 })
        // Carriage hanger up to the track.
        box(parent, m.steel, [0.07, 0.11, 0.045], [centreX, trackY - 0.075, PANEL_FRONT + 0.03], {
          chamfer: 0.018, fillet: 0.007, bevel: 0.006,
        })
        // A single lit band per leaf, low, where a hand reaches.
        box(parent, cyan, [HALF_LEAF[0] * 1.3, 0.028, 0.026], [
          centreX, DOOR_KIT.centreY - 0.32, PANEL_FRONT + 0.008,
        ], { chamfer: 0.008, fillet: 0.004, bevel: 0.003 })
      }

      const openBy = CLEAR_HALF[0] * 0.92
      buildLeaf(left, -HALF_LEAF[0], -1)
      buildLeaf(right, HALF_LEAF[0], 1)

      return {
        assemblies: [left, right],
        cycleSeconds: 1.3,
        apply: (blend) => {
          left.position.x = -blend * openBy
          right.position.x = blend * openBy
        },
        sockets: {
          rail_head: [0, trackY, PANEL_FRONT + 0.02],
          door_meet: [0, DOOR_KIT.centreY, PANEL_FRONT],
        },
        tick: (elapsed) => {
          cyan.emissiveIntensity = 0.66 + Math.sin(elapsed * 2.6) * 0.16
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
