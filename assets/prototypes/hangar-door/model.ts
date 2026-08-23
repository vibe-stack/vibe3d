import { Group } from 'three/webgpu'

import { cylinder, extrudeProfile } from '../../../src/asset-forge/generator/index.ts'
import { AXIS_X, AXIS_Y, box, boltRun, slot, type CargoPreview } from '../axiom-cargo-kit/index.ts'
import {
  createDoorModel,
  createDoorPreview,
  signalLamp,
  type DoorModel,
  type DoorPreviewOptions,
} from '../axiom-door-kit/index.ts'

/**
 * Axiom Relay hangar door — the vehicle-scale bi-parting closure.
 *
 * This is the one module in the doors group that leaves the shared 1.6 m
 * envelope, because it has to: the brief's double variant widens to 2.8 m, and
 * a hangar door narrower than the thing it admits is a wall. Everything else is
 * deliberately inherited — the same clipped-corner language, the same shell over
 * graphite over ink value order, the same amber-on-a-dark-housing signal — so a
 * 2.8 m opening still reads as the same construction system as a 1.6 m one.
 *
 * The leaves are panelled horizontally rather than octagonally. At this width an
 * octagonal leaf would need a 0.5 m corner clip to keep the same visual rhythm,
 * and that much missing corner on a door meant to seal a hangar is a hole.
 */

const HANGAR = Object.freeze({
  width: 2.8,
  height: 2.6,
  depth: 0.34,
  clearWidth: 2.28,
  clearHeight: 2.16,
  centreY: 1.3,
})

const CLEAR_X = HANGAR.clearWidth * 0.5
const CLEAR_Y = HANGAR.clearHeight * 0.5
const FRONT = HANGAR.depth * 0.5

export function createModel(): DoorModel {
  return createDoorModel({
    id: 'hangar-door',
    condition: 0.68,
    envelope: { width: HANGAR.width, depth: HANGAR.depth, height: HANGAR.height },
    build: ({ m, bundle, part }) => {
      const frame = part('frame')
      const left = part('leaf-left')
      const right = part('leaf-right')
      const amber = signalLamp(bundle, 'AMBER-400', 12_700)

      // Portal plate, cut with the same nested octagons at hangar scale.
      frame.add(extrudeProfile(m.shell, slot(HANGAR.width * 0.5, HANGAR.height * 0.5, 0.34), 0.26, [
        0, HANGAR.centreY, 0,
      ], {
        fillet: 0.022,
        bevel: 0.02,
        capChamfer: [0.05, 0.03],
        holes: [slot(CLEAR_X + 0.06, CLEAR_Y + 0.06, 0.24)],
      }))
      frame.add(extrudeProfile(m.graphite, slot(CLEAR_X + 0.065, CLEAR_Y + 0.065, 0.24), 0.24, [
        0, HANGAR.centreY, FRONT - 0.09,
      ], {
        fillet: 0.012,
        bevel: 0.016,
        holes: [slot(CLEAR_X, CLEAR_Y, 0.22)],
      }))
      frame.add(extrudeProfile(m.ink, slot(CLEAR_X + 0.03, CLEAR_Y + 0.03, 0.22), 0.14, [
        0, HANGAR.centreY, FRONT - 0.28,
      ], {
        fillet: 0.008,
        bevel: 0.008,
        holes: [slot(CLEAR_X - 0.014, CLEAR_Y - 0.014, 0.2)],
      }))

      // Head track and its carriages. Exposed, because at this width nothing
      // pockets into the jamb.
      const trackY = HANGAR.centreY + CLEAR_Y + 0.13
      box(frame, m.graphite, [HANGAR.width - 0.24, 0.13, 0.12], [0, trackY, FRONT + 0.02], {
        chamfer: 0.03, fillet: 0.012, bevel: 0.01,
      })
      frame.add(cylinder(m.steel, 0.022, HANGAR.width - 0.34, [0, trackY - 0.07, FRONT + 0.04], AXIS_X, 8))
      for (const sx of [-1, 1]) {
        for (const offset of [0.34, 0.86]) {
          frame.add(cylinder(m.steel, 0.05, 0.035, [sx * offset, trackY - 0.07, FRONT + 0.09], AXIS_Y, 12))
        }
        // Jamb tower, skirt block, and the ground anchor under it.
        box(frame, m.graphiteEdge, [0.16, HANGAR.height - 0.5, 0.16], [
          sx * (HANGAR.width * 0.5 - 0.1), HANGAR.centreY, -HANGAR.depth * 0.5 + 0.09,
        ], { chamfer: 0.03, fillet: 0.01, bevel: 0.009 })
        box(frame, m.graphite, [0.34, 0.3, HANGAR.depth + 0.04], [
          sx * (HANGAR.width * 0.5 - 0.17), 0.15, 0,
        ], { chamfer: 0.04, fillet: 0.012, bevel: 0.01 })
        boltRun(frame, m.steel, [sx * (HANGAR.width * 0.5 - 0.29), 0.06, FRONT + 0.03], [sx * (HANGAR.width * 0.5 - 0.05), 0.06, FRONT + 0.03], 3, 0.017, 'front')
      }

      // Threshold: a wide ribbed plate with the drive channel down its middle.
      box(frame, m.graphiteEdge, [HANGAR.clearWidth + 0.22, 0.08, HANGAR.depth + 0.06], [0, 0.04, 0.01], {
        chamfer: 0.02, fillet: 0.008, bevel: 0.007, capChamfer: [0.06, 0.02],
      })
      for (let index = 0; index < 13; index += 1) {
        box(frame, m.ink, [0.03, 0.014, HANGAR.depth], [(index - 6) * 0.17, 0.085, 0.01], {
          chamfer: 0.006, fillet: 0.003, bevel: 0.002,
        })
      }

      // Signal: one lamp bar per jamb tower, plus the head strip.
      for (const sx of [-1, 1]) {
        box(frame, m.ink, [0.07, 0.8, 0.05], [sx * (HANGAR.width * 0.5 - 0.1), HANGAR.centreY - 0.2, FRONT + 0.02], {
          chamfer: 0.022, fillet: 0.008, bevel: 0.006,
        })
        box(frame, amber, [0.034, 0.73, 0.032], [sx * (HANGAR.width * 0.5 - 0.1), HANGAR.centreY - 0.2, FRONT + 0.042], {
          chamfer: 0.012, fillet: 0.005, bevel: 0.004,
        })
      }

      // The leaves: horizontally panelled, four bands each, on a bottom guide.
      const halfLeaf = HANGAR.clearWidth * 0.25 - 0.008
      const buildLeaf = (parent: Group, centreX: number, side: -1 | 1): void => {
        parent.add(extrudeProfile(m.shellLight, slot(halfLeaf, CLEAR_Y - 0.02, 0.1), 0.1, [
          centreX, HANGAR.centreY, FRONT - 0.185,
        ], { fillet: 0.012, bevel: 0.018, capChamfer: [0.03, 0.02] }))
        for (let index = 0; index < 4; index += 1) {
          const y = HANGAR.centreY + (index - 1.5) * (HANGAR.clearHeight - 0.28) / 4
          box(parent, m.shell, [halfLeaf * 1.78, (HANGAR.clearHeight - 0.34) / 4.4, 0.035], [
            centreX, y, FRONT - 0.12,
          ], { chamfer: 0.03, fillet: 0.01, bevel: 0.01 })
        }
        // Meeting stile on the inboard edge only, and a guide shoe at the foot.
        box(parent, m.graphiteEdge, [0.06, CLEAR_Y * 1.94, 0.06], [
          centreX - side * (halfLeaf - 0.03), HANGAR.centreY, FRONT - 0.125,
        ], { chamfer: 0.016, fillet: 0.007, bevel: 0.006 })
        box(parent, m.steel, [0.09, 0.12, 0.05], [centreX, HANGAR.centreY - CLEAR_Y + 0.06, FRONT - 0.125], {
          chamfer: 0.02, fillet: 0.008, bevel: 0.007,
        })
        box(parent, m.steel, [0.08, 0.13, 0.05], [centreX, trackY - 0.13, FRONT + 0.02], {
          chamfer: 0.02, fillet: 0.008, bevel: 0.007,
        })
        box(parent, m.amberPaint, [halfLeaf * 1.5, 0.05, 0.02], [
          centreX, HANGAR.centreY - CLEAR_Y + 0.22, FRONT - 0.1,
        ], { chamfer: 0.012, fillet: 0.005, bevel: 0.004 })
      }
      buildLeaf(left, -halfLeaf, -1)
      buildLeaf(right, halfLeaf, 1)

      const travel = HANGAR.clearWidth * 0.46
      return {
        assemblies: [left, right],
        cycleSeconds: 4.2,
        apply: (blend) => {
          left.position.x = -blend * travel
          right.position.x = blend * travel
        },
        sockets: {
          door_threshold: [0, 0.08, 0],
          door_head: [0, HANGAR.centreY + CLEAR_Y, 0],
          rail_head: [0, trackY, FRONT + 0.02],
          mount_left: [-HANGAR.width * 0.5, HANGAR.centreY, 0],
          mount_right: [HANGAR.width * 0.5, HANGAR.centreY, 0],
          power_head: [HANGAR.width * 0.5 - 0.2, HANGAR.height - 0.18, -HANGAR.depth * 0.4],
        },
        tick: (elapsed) => {
          amber.emissiveIntensity = 0.66 + Math.sin(elapsed * 2.1) * 0.18
        },
      }
    },
  })
}

export function createPreview(options: DoorPreviewOptions = {}): CargoPreview {
  return createDoorPreview(createModel(), { distance: 7.4, target: [0, HANGAR.centreY - 0.1, 0], ...options })
}

export function createOpenPreview(options: DoorPreviewOptions = {}): CargoPreview {
  return createPreview({ ...options, state: 'open' })
}
