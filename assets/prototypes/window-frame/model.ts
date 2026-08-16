import type { CargoPreview } from '../axiom-cargo-kit/index.ts'
import {
  APERTURE_HALF,
  PLATE_FRONT,
  WINDOW_KIT,
  buildBay,
  createWindowModel,
  createWindowPreview,
  signalLamp,
  type WindowModel,
  type WindowPreviewOptions,
} from '../axiom-window-kit/index.ts'

/**
 * Axiom Relay window frame — the shared bay with nothing glazed into it.
 *
 * Every other module in the windows group is this plus a pane, so it ships on
 * its own: an opening onto an interior, a serving hatch, a bulkhead port that a
 * scripted shutter will fill later, or the reference a new variant is authored
 * against. It carries the whole interface — plate, reveal ring, glazing seat,
 * cill and drip, aperture lamps, plate strips, control paddle, and the actuator
 * ram a closing variant needs — which is what makes the group a kit rather than
 * eleven lookalikes.
 */

export function createModel(): WindowModel {
  return createWindowModel({
    id: 'window-frame',
    condition: 0.36,
    build: ({ m, bundle, part }) => {
      const frame = part('frame')
      const amber = signalLamp(bundle, 'AMBER-400', 2_410)
      buildBay(frame, m, amber)
      return {
        sockets: {
          // The glazing interface, published because the frame's whole job is
          // to be the thing other modules are authored against.
          cover_seat_left: [-APERTURE_HALF[0], WINDOW_KIT.centreY, PLATE_FRONT - 0.135],
          cover_seat_right: [APERTURE_HALF[0], WINDOW_KIT.centreY, PLATE_FRONT - 0.135],
        },
        tick: (elapsed) => {
          amber.emissiveIntensity = 0.72 + Math.sin(elapsed * 1.5) * 0.1
        },
      }
    },
  })
}

export function createPreview(options: WindowPreviewOptions = {}): CargoPreview {
  return createWindowPreview(createModel(), options)
}
