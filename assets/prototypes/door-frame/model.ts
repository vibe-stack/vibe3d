import {
  buildPortal,
  createDoorModel,
  createDoorPreview,
  signalLamp,
  type DoorModel,
  type DoorPreviewOptions,
} from '../axiom-door-kit/index.ts'
import type { CargoPreview } from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay door frame — the shared portal with no leaf in it.
 *
 * Every other module in the doors group hangs off this one, so it ships on its
 * own: a level builder who wants an opening, a bulkhead pass-through, or a
 * doorway that a scripted leaf will fill later should not have to delete a door
 * to get one. It carries the whole interface — plate, reveal, threshold, jamb
 * strips, head lamp, control plate, and the hinge stack a leaf will be hung on —
 * which is what makes the group a kit rather than nine lookalikes.
 */

export function createModel(): DoorModel {
  return createDoorModel({
    id: 'door-frame',
    condition: 0.38,
    build: ({ m, bundle, part }) => {
      const frame = part('frame')
      const amber = signalLamp(bundle, 'AMBER-400', 3_320)
      buildPortal(frame, m, { signal: amber })
      return {
        sockets: {
          // The leaf interface, published because the frame's whole job is to
          // be the thing other modules are authored against.
          door_hinge_upper: [-0.6, 1.98, 0.03],
          door_hinge_lower: [-0.6, 0.62, 0.03],
        },
        tick: (elapsed) => {
          amber.emissiveIntensity = 0.72 + Math.sin(elapsed * 1.6) * 0.1
        },
      }
    },
  })
}

export function createPreview(options: DoorPreviewOptions = {}): CargoPreview {
  return createDoorPreview(createModel(), options)
}
