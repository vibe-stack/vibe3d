import { Group } from 'three/webgpu'

import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import { AXIS_Z, box, boltRun, type CargoPreview } from '../axiom-cargo-kit/index.ts'
import {
  DOOR_KIT,
  LEAF_HALF,
  PANEL_FRONT,
  buildPortal,
  createDoorModel,
  createDoorPreview,
  leafRecess,
  leafRibs,
  leafSkin,
  signalLamp,
  type DoorModel,
  type DoorPreviewOptions,
} from '../axiom-door-kit/index.ts'

/**
 * Axiom Relay bunker door — the family's manual, unpowered leaf.
 *
 * Every other door in the group opens because something drives it. This one
 * opens because someone turns the wheel, and that single decision cascades: no
 * pull bar (a wheel is the handle), no vision port (a bunker door that can be
 * seen through is a window), a grab recess rather than a proud handle so
 * nothing catches when the leaf is dogged, and armour rings instead of a raised
 * panel so the face reads as plate rather than as pressed sheet.
 *
 * Its lamps are on the frame only. A leaf with no power on it is the point.
 */

export function createModel(): DoorModel {
  return createDoorModel({
    id: 'bunker-door',
    condition: 0.66,
    build: ({ m, bundle, part, root }) => {
      const frame = part('frame')
      const leaf = part('leaf')
      const amber = signalLamp(bundle, 'AMBER-400', 7_020)

      buildPortal(frame, m, { signal: amber })

      leafSkin(leaf, m, { skin: m.shell })
      leafRecess(leaf, m, [LEAF_HALF[0] * 0.6, DOOR_KIT.centreY - 0.56])
      leafRibs(leaf, m)

      // Armour ribs: three horizontal bands rather than one raised panel. They
      // carry the leaf's load into the dog bolts at each end, so each band ends
      // exactly where a bolt is.
      for (let index = 0; index < 3; index += 1) {
        const y = DOOR_KIT.centreY + (index - 1) * 0.58
        box(leaf, m.graphiteEdge, [LEAF_HALF[0] * 1.74, 0.13, 0.04], [0, y, PANEL_FRONT + 0.012], {
          chamfer: 0.03, fillet: 0.01, bevel: 0.009,
        })
        for (const sx of [-1, 1]) {
          box(leaf, m.steel, [0.085, 0.16, 0.06], [sx * (LEAF_HALF[0] - 0.055), y, PANEL_FRONT + 0.006], {
            chamfer: 0.02, fillet: 0.008, bevel: 0.007,
          })
        }
      }

      // Hand wheel: rim, hub, and four spokes, on a stub shaft.
      //
      // Built in its own group about its own axis, so the actuator can turn.
      // A dogging wheel that stays still while the leaf swings is the clearest
      // possible statement that nothing on this door is actually connected.
      const hubY = DOOR_KIT.centreY + 0.08
      const hubX = LEAF_HALF[0] * 0.1
      leaf.add(cylinder(m.steel, 0.026, 0.14, [hubX, hubY, PANEL_FRONT + 0.075], AXIS_Z, 10))
      leaf.add(cylinder(m.graphite, 0.075, 0.05, [hubX, hubY, PANEL_FRONT + 0.03], AXIS_Z, 12))
      boltRun(leaf, m.steel, [hubX - 0.13, hubY - 0.19, PANEL_FRONT + 0.05], [hubX + 0.13, hubY - 0.19, PANEL_FRONT + 0.05], 3, 0.016, 'front')

      // The swing carries both the leaf and the wheel. Hung off the leaf
      // instead — the obvious place, since that is what it is bolted to — the
      // wheel is an assembly nested inside an assembly, and the batch merge
      // deletes the group it would be re-attached to.
      const swing = new Group()
      swing.name = 'AXR_ARCH_BUNKER-DOOR_PART_SWING_CLOSED'
      swing.position.set(-LEAF_HALF[0], 0, 0)
      leaf.position.set(LEAF_HALF[0], 0, 0)
      swing.add(leaf)
      root.add(swing)

      const wheel = new Group()
      wheel.name = 'AXR_ARCH_BUNKER-DOOR_PART_WHEEL_CLOSED'
      wheel.position.set(hubX + LEAF_HALF[0], hubY, 0)
      swing.add(wheel)
      // Three spokes rather than four. Four boxes at 45-degree steps are only
      // two distinct bars — a box rotated by pi is the same box — so the first
      // pass built an X and called it a wheel.
      const rim = 0.21
      for (let index = 0; index < 3; index += 1) {
        const angle = (index / 3) * Math.PI
        box(wheel, m.steel, [0.04, rim * 2, 0.034], [0, 0, PANEL_FRONT + 0.13], {
          chamfer: 0.012, fillet: 0.005, bevel: 0.005, rotation: [0, 0, angle],
        })
      }
      // Rim as a tangent-segment polygon. Radial studs, which is what the first
      // pass produced, are a hub with spikes rather than something to grip.
      const segments = 14
      const chord = 2 * rim * Math.tan(Math.PI / segments) + 0.012
      for (let index = 0; index < segments; index += 1) {
        const angle = (index / segments) * Math.PI * 2
        box(wheel, m.ironOxide, [chord, 0.042, 0.042], [
          Math.cos(angle) * rim,
          Math.sin(angle) * rim,
          PANEL_FRONT + 0.13,
        ], { chamfer: 0.01, fillet: 0.005, bevel: 0.004, rotation: [0, 0, angle + Math.PI / 2] })
      }

      return {
        assemblies: [swing, wheel],
        cycleSeconds: 3.4,
        apply: (blend) => {
          // The wheel undogs through two full turns before the leaf starts to
          // move, so the first third of the cycle is all actuator and the rest
          // is all swing — which is how a dogged door actually opens.
          wheel.rotation.z = -Math.min(1, blend / 0.34) * Math.PI * 4
          swing.rotation.y = Math.max(0, (blend - 0.34) / 0.66) * 1.6
        },
        sockets: {
          door_wheel: [hubX, hubY, PANEL_FRONT + 0.13],
        },
        tick: (elapsed) => {
          amber.emissiveIntensity = 0.6 + Math.sin(elapsed * 0.8) * 0.08
        },
      }
    },
  })
}

export function createPreview(options: DoorPreviewOptions = {}): CargoPreview {
  return createDoorPreview(createModel(), options)
}
