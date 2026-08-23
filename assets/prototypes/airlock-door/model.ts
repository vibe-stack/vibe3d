import { Group } from 'three/webgpu'

import { box, type CargoPreview } from '../axiom-cargo-kit/index.ts'
import {
  DOOR_KIT,
  LEAF_HALF,
  PANEL_FRONT,
  buildPortal,
  createDoorModel,
  createDoorPreview,
  leafHandle,
  leafPanel,
  leafRibs,
  leafSkin,
  signalLamp,
  steppedSeam,
  visionPort,
  type DoorModel,
  type DoorPreviewOptions,
} from '../axiom-door-kit/index.ts'

/**
 * Axiom Relay airlock door — the pressure-rated leaf with a vision port.
 *
 * What separates it from the blast door is not thickness, it is *procedure*: an
 * airlock is a door you are meant to look through before you open, and whose
 * seal state has to be readable before you touch it. So it gets the family's
 * only glazed leaf opening, an inflatable-seal bead standing proud of the skin,
 * and a cyan equalisation read next to the amber lock state — two signals,
 * because "pressure equal" and "door unlocked" are different facts and a crew
 * that conflates them opens onto vacuum.
 */

export function createModel(): DoorModel {
  return createDoorModel({
    id: 'airlock-door',
    condition: 0.3,
    build: ({ m, bundle, part, root }) => {
      const frame = part('frame')
      const leaf = part('leaf')
      const amber = signalLamp(bundle, 'AMBER-400', 6_140)

      buildPortal(frame, m, { signal: amber })

      leafSkin(leaf, m)
      steppedSeam(leaf, m)
      leafHandle(leaf, m)
      visionPort(leaf, m, [0.3, 0.36], [-LEAF_HALF[0] * 0.34, DOOR_KIT.centreY + 0.42])
      leafPanel(leaf, m, amber, [LEAF_HALF[0] * 0.66, DOOR_KIT.centreY - 0.02])
      leafRibs(leaf, m)

      // Inflatable seal bead around the leaf edge. Rubber, proud, and continuous
      // — the one part that explains why this door is rated and the others
      // are not.
      for (const sy of [-1, 1]) {
        box(leaf, m.rubber, [LEAF_HALF[0] * 1.72, 0.03, 0.04], [
          0, DOOR_KIT.centreY + sy * (LEAF_HALF[1] - 0.045), PANEL_FRONT - 0.028,
        ], { chamfer: 0.01, fillet: 0.005, bevel: 0.004 })
      }
      for (const sx of [-1, 1]) {
        box(leaf, m.rubber, [0.03, LEAF_HALF[1] * 1.68, 0.04], [
          sx * (LEAF_HALF[0] - 0.045), DOOR_KIT.centreY, PANEL_FRONT - 0.028,
        ], { chamfer: 0.01, fillet: 0.005, bevel: 0.004 })
      }

      // Equalisation valve: the physical thing the cyan read is about.
      box(leaf, m.graphite, [0.11, 0.11, 0.05], [-LEAF_HALF[0] * 0.34, DOOR_KIT.centreY - 0.5, PANEL_FRONT + 0.018], {
        chamfer: 0.03, fillet: 0.01, bevel: 0.008,
      })
      box(leaf, m.steel, [0.13, 0.028, 0.028], [-LEAF_HALF[0] * 0.34, DOOR_KIT.centreY - 0.5, PANEL_FRONT + 0.05], {
        chamfer: 0.008, fillet: 0.004, bevel: 0.004,
      })

      const swing = new Group()
      swing.name = 'AXR_ARCH_AIRLOCK-DOOR_PART_SWING_CLOSED'
      swing.position.set(-LEAF_HALF[0], 0, 0)
      leaf.position.set(LEAF_HALF[0], 0, 0)
      swing.add(leaf)
      root.add(swing)

      return {
        assemblies: [swing],
        cycleSeconds: 2.6,
        apply: (blend) => {
          swing.rotation.y = blend * 1.7
        },
        sockets: {
          fx_seal_bead: [0, DOOR_KIT.centreY + LEAF_HALF[1], PANEL_FRONT],
          pipe_equalise: [-LEAF_HALF[0] * 0.34, DOOR_KIT.centreY - 0.5, PANEL_FRONT],
        },
        tick: (elapsed) => {
          amber.emissiveIntensity = 0.72 + Math.sin(elapsed * 1.2) * 0.12
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
