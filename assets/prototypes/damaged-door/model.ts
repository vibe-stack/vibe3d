import { Group } from 'three/webgpu'

import { box, type CargoPreview } from '../axiom-cargo-kit/index.ts'
import {
  DOOR_KIT,
  LEAF_HALF,
  PANEL_FRONT,
  buildPortal,
  createDoorModel,
  createDoorPreview,
  leafRibs,
  leafSkin,
  signalLamp,
  steppedSeam,
  type DoorModel,
  type DoorPreviewOptions,
} from '../axiom-door-kit/index.ts'

/**
 * Axiom Relay damaged door — the same leaf after something went through it.
 *
 * The brief's damage variant is not a separate prop, and building it as one is
 * how a kit stops being a kit. This is the standard leaf and the standard
 * portal; what changed is that the lower hinge has failed, so the leaf hangs on
 * the upper knuckle alone, rests on the threshold, and cannot close. Everything
 * else follows from that single cause: the meeting edge is sprung away from the
 * jamb, the skin is buckled where it took the load, the seam has torn open at
 * the jog, and the leaf-side lamp circuit is dead because its loom ran through
 * the hinge.
 *
 * The frame's own signal still works and reads RED-500. A door that cannot
 * close is a door reporting a fault, not a door with no power.
 */

/** Leaf droop and sprung angles, from the failed lower knuckle. */
const DROOP = -0.085
const SPRUNG = 0.19

export function createModel(): DoorModel {
  return createDoorModel({
    id: 'damaged-door',
    condition: 0.94,
    build: ({ m, bundle, part, root }) => {
      const frame = part('frame')
      const leaf = part('leaf')
      const red = signalLamp(bundle, 'RED-500', 10_450)

      buildPortal(frame, m, { signal: red })

      leafSkin(leaf, m)
      steppedSeam(leaf, m)
      leafRibs(leaf, m)

      // The failed knuckle, still on the leaf, sheared off its pin.
      box(leaf, m.ironOxide, [0.1, 0.14, 0.08], [-LEAF_HALF[0] + 0.03, DOOR_KIT.centreY - 0.66, PANEL_FRONT - 0.09], {
        chamfer: 0.024, fillet: 0.008, bevel: 0.007, rotation: [0, 0, 0.22],
      })

      // Buckles: three creases across the skin, each perpendicular to the load
      // path from the surviving hinge to the corner that is now carrying the
      // leaf's weight. Damage with one cause reads as damage; damage scattered
      // for texture reads as noise.
      const buckles: readonly [number, number, number, number][] = [
        [-0.16, DOOR_KIT.centreY - 0.34, 0.62, -0.72],
        [0.06, DOOR_KIT.centreY - 0.68, 0.44, -0.66],
        [-0.3, DOOR_KIT.centreY + 0.06, 0.3, -0.78],
      ]
      for (const [x, y, length, angle] of buckles) {
        box(leaf, m.shellShade, [length, 0.05, 0.022], [x, y, PANEL_FRONT + 0.006], {
          chamfer: 0.014, fillet: 0.006, bevel: 0.005, rotation: [0, 0, angle],
        })
        box(leaf, m.ink, [length * 0.9, 0.018, 0.026], [x, y - 0.026, PANEL_FRONT + 0.008], {
          chamfer: 0.006, fillet: 0.003, bevel: 0.003, rotation: [0, 0, angle],
        })
      }

      // The torn seam. Same jog as the intact leaf, opened into a gap.
      box(leaf, m.ink, [0.09, 0.3, 0.034], [LEAF_HALF[0] * 0.16, DOOR_KIT.centreY + LEAF_HALF[1] * 0.19, PANEL_FRONT - 0.002], {
        chamfer: 0.012, fillet: 0.005, bevel: 0.004, rotation: [0, 0, 0.14],
      })

      // Dead lamp on the leaf: the fixture is intact, the circuit is not.
      box(leaf, m.graphite, [0.19, 0.31, 0.05], [LEAF_HALF[0] * 0.66, DOOR_KIT.centreY - 0.02, PANEL_FRONT + 0.02], {
        chamfer: 0.045, fillet: 0.012, bevel: 0.01, capChamfer: 0.018,
      })
      box(leaf, m.amberDim, [0.1, 0.1, 0.03], [LEAF_HALF[0] * 0.66, DOOR_KIT.centreY + 0.042, PANEL_FRONT + 0.05], {
        chamfer: 0.026, fillet: 0.006, bevel: 0.005,
      })

      // Hung from the upper knuckle only, so the leaf droops and springs open.
      const swing = new Group()
      swing.name = 'AXR_ARCH_DAMAGED-DOOR_PART_SWING_JAMMED'
      swing.position.set(-LEAF_HALF[0], DOOR_KIT.centreY + 0.66, 0)
      leaf.position.set(LEAF_HALF[0], -(DOOR_KIT.centreY + 0.66), 0)
      swing.add(leaf)
      swing.rotation.set(0, SPRUNG, DROOP)
      root.add(swing)

      return {
        assemblies: [swing],
        cycleSeconds: 3.8,
        // It does not close. `open` only widens the gap it is already stuck at,
        // because a jammed leaf that animates shut on request is not damaged.
        apply: (blend) => {
          swing.rotation.set(0, SPRUNG + blend * 0.85, DROOP)
        },
        sockets: {
          door_failed_hinge: [-LEAF_HALF[0], DOOR_KIT.centreY - 0.66, PANEL_FRONT - 0.09],
          fx_fault_gap: [LEAF_HALF[0] * 0.16, DOOR_KIT.centreY, PANEL_FRONT],
        },
        tick: (elapsed) => {
          // A fault flash, not the steady breathe the healthy doors use.
          red.emissiveIntensity = 0.34 + (Math.sin(elapsed * 5.4) > 0.2 ? 0.62 : 0)
        },
      }
    },
  })
}

export function createPreview(options: DoorPreviewOptions = {}): CargoPreview {
  return createDoorPreview(createModel(), options)
}
