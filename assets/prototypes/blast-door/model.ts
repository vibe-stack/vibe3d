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
  type DoorModel,
  type DoorPreviewOptions,
} from '../axiom-door-kit/index.ts'

/**
 * Axiom Relay blast door — the family's hardened single leaf.
 *
 * The blast door is the reason the group's leaves are octagonal at all: a
 * pressure leaf wants its load carried into the frame at 45 degrees rather than
 * into four right-angle corners, and every lighter door in the kit then inherits
 * that outline so they can share one opening.
 *
 * Its signal is RED-500 per the brief, and it is the only door in the batch that
 * carries the dominant signal on the *leaf* rather than the jamb: a sealed blast
 * door's state has to be legible from inside the corridor it seals, where the
 * jamb strips are edge-on.
 */

export function createModel(): DoorModel {
  return createDoorModel({
    id: 'blast-door',
    condition: 0.46,
    build: ({ m, bundle, part, root }) => {
      const frame = part('frame')
      const leaf = part('leaf')
      const red = signalLamp(bundle, 'RED-500', 5_180)

      buildPortal(frame, m, { signal: red })

      leafSkin(leaf, m)
      steppedSeam(leaf, m)
      leafHandle(leaf, m)
      leafPanel(leaf, m, red, [LEAF_HALF[0] * 0.66, DOOR_KIT.centreY - 0.02])
      leafRibs(leaf, m)

      // Dog bolts: the hardware that makes it a blast door rather than a thick
      // door. Four per side, standing proud of the leaf's swing edge where they
      // drive into the frame.
      for (let index = 0; index < 4; index += 1) {
        const y = DOOR_KIT.centreY + (index - 1.5) * 0.44
        for (const sx of [-1, 1]) {
          box(leaf, m.steel, [0.075, 0.09, 0.055], [sx * (LEAF_HALF[0] - 0.045), y, PANEL_FRONT - 0.012], {
            chamfer: 0.018, fillet: 0.007, bevel: 0.006,
          })
        }
      }

      // The leaf swings on the frame's hinge column. Its pivot is the hinge
      // line, not the leaf centre, so the group is offset and counter-offset
      // rather than rotated about the middle of the door.
      const swing = new Group()
      swing.name = 'AXR_ARCH_BLAST-DOOR_PART_SWING_CLOSED'
      swing.position.set(-LEAF_HALF[0], 0, 0)
      leaf.position.set(LEAF_HALF[0], 0, 0)
      swing.add(leaf)
      root.add(swing)

      return {
        assemblies: [swing],
        cycleSeconds: 2.1,
        apply: (blend) => {
          swing.rotation.y = blend * 1.85
        },
        sockets: {
          door_leaf_edge: [LEAF_HALF[0], DOOR_KIT.centreY, PANEL_FRONT],
          fx_seal_head: [0, DOOR_KIT.centreY + LEAF_HALF[1], PANEL_FRONT],
        },
        tick: (elapsed) => {
          red.emissiveIntensity = 0.72 + Math.sin(elapsed * 2.3) * 0.14
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
