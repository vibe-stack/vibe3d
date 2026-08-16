import { Group } from 'three/webgpu'

import { extrudeProfile } from '../../../src/asset-forge/generator/index.ts'
import { box, slot, type CargoPreview } from '../axiom-cargo-kit/index.ts'
import {
  DOOR_KIT,
  LEAF_HALF,
  LEAF_Z,
  PANEL_FRONT,
  buildPortal,
  createDoorModel,
  createDoorPreview,
  signalLamp,
  type DoorModel,
  type DoorPreviewOptions,
} from '../axiom-door-kit/index.ts'

/**
 * Axiom Relay glass commercial door — the shopfront leaf.
 *
 * This is the module that proves the opening is shared rather than the leaf. It
 * hangs in the same octagon as the blast door and uses the same jamb hardware,
 * but almost none of the leaf is there: two slim stiles, a rail top and bottom,
 * a push bar, and glass in between. Where the hardened doors put armour, this
 * one puts nothing, and the frame around it is unchanged — which is exactly the
 * argument for building a doors group instead of nine separate props.
 *
 * It carries no dominant signal on the leaf. A commercial door's state is
 * whether you can see the shop through it.
 */

export function createModel(): DoorModel {
  return createDoorModel({
    id: 'glass-commercial-door',
    condition: 0.24,
    build: ({ m, bundle, part, root }) => {
      const frame = part('frame')
      const leaf = part('leaf')
      const cyan = signalLamp(bundle, 'CYAN-400', 9_310)

      buildPortal(frame, m, { signal: cyan })

      const [hx, hy] = LEAF_HALF
      const stile = 0.085
      const rail = 0.13

      // Glazed centre, cut as one pane and set behind the frame members so the
      // members read as what holds it rather than as a grid drawn on it.
      leaf.add(extrudeProfile(m.glass, slot(hx - stile * 0.6, hy - rail * 0.6, 0.08), 0.016, [
        0, DOOR_KIT.centreY, LEAF_Z + 0.012,
      ], { fillet: 0.004, bevel: 0.005 }))

      // Perimeter: two stiles and two rails, mitred by overlap at the corners.
      for (const sx of [-1, 1]) {
        box(leaf, m.shellLight, [stile, hy * 2, 0.062], [sx * (hx - stile * 0.5), DOOR_KIT.centreY, LEAF_Z + 0.03], {
          chamfer: 0.02, fillet: 0.008, bevel: 0.009,
        })
      }
      for (const sy of [-1, 1]) {
        // The bottom rail is deeper: it is the one a trolley hits.
        const depth = sy < 0 ? rail * 1.7 : rail
        box(leaf, m.shellLight, [hx * 2 - stile * 2, depth, 0.062], [
          0, DOOR_KIT.centreY + sy * (hy - depth * 0.5), LEAF_Z + 0.03,
        ], { chamfer: 0.02, fillet: 0.008, bevel: 0.009 })
      }
      box(leaf, m.graphiteEdge, [hx * 2 - stile * 2, 0.03, 0.07], [
        0, DOOR_KIT.centreY - hy + rail * 1.7, LEAF_Z + 0.032,
      ], { chamfer: 0.009, fillet: 0.004, bevel: 0.004 })

      // Push bar, on stand-offs, spanning most of the leaf width.
      const barY = DOOR_KIT.centreY - 0.06
      box(leaf, m.steel, [hx * 1.55, 0.05, 0.045], [0, barY, PANEL_FRONT + 0.05], {
        chamfer: 0.016, fillet: 0.007, bevel: 0.006,
      })
      for (const sx of [-1, 1]) {
        box(leaf, m.graphite, [0.045, 0.045, 0.05], [sx * hx * 0.62, barY, PANEL_FRONT + 0.014], {
          chamfer: 0.012, fillet: 0.005, bevel: 0.005,
        })
      }

      // Manifestation band — the strip that stops people walking into the glass.
      box(leaf, m.shellShade, [hx * 1.72, 0.055, 0.006], [0, DOOR_KIT.centreY + 0.46, LEAF_Z + 0.024], {
        chamfer: 0.012, fillet: 0.004, bevel: 0.002,
      })

      const swing = new Group()
      swing.name = 'AXR_ARCH_GLASS-COMMERCIAL-DOOR_PART_SWING_CLOSED'
      swing.position.set(-hx, 0, 0)
      leaf.position.set(hx, 0, 0)
      swing.add(leaf)
      root.add(swing)

      return {
        assemblies: [swing],
        cycleSeconds: 1.1,
        apply: (blend) => {
          swing.rotation.y = blend * 1.5
        },
        sockets: {
          door_push_bar: [0, barY, PANEL_FRONT + 0.05],
          cover_glazing: [0, DOOR_KIT.centreY, LEAF_Z],
        },
        tick: (elapsed) => {
          cyan.emissiveIntensity = 0.6 + Math.sin(elapsed * 1.1) * 0.06
        },
      }
    },
  })
}

export function createPreview(options: DoorPreviewOptions = {}): CargoPreview {
  return createDoorPreview(createModel(), options)
}

/** Framing that shows the glazing reading against the reveal behind it. */
export function createOpenPreview(options: DoorPreviewOptions = {}): CargoPreview {
  return createDoorPreview(createModel(), { ...options, state: 'open', yaw: -0.9 })
}

