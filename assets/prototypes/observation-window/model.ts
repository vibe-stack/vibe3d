import { extrudeProfile } from '../../../src/asset-forge/generator/index.ts'
import { box, slot, type CargoPreview } from '../axiom-cargo-kit/index.ts'
import {
  APERTURE_HALF,
  PLATE_FRONT,
  WINDOW_KIT,
  buildBay,
  createWindowModel,
  createWindowPreview,
  glazing,
  signalLamp,
  type WindowModel,
  type WindowPreviewOptions,
} from '../axiom-window-kit/index.ts'

/**
 * Axiom Relay observation window — the pressure-rated port.
 *
 * The thing that makes an observation window different from a window is that it
 * is rated: the pane is thick enough to have a visible edge, it is clamped by a
 * retaining ring rather than beaded in, and the aperture is stepped so the pane
 * seats against a shoulder instead of against a seal alone. Those three parts
 * are the whole design, and they are why the group's amber aperture lamps read
 * *through* the glass here rather than around it — the light is inboard of the
 * pane, in the thickness of the port.
 */

export function createModel(): WindowModel {
  return createWindowModel({
    id: 'observation-window',
    condition: 0.32,
    build: ({ m, bundle, part }) => {
      const frame = part('frame')
      const amber = signalLamp(bundle, 'AMBER-400', 2_520)

      buildBay(frame, m, amber)
      // A thick pane, so its edge catches a highlight the group's thin glazing
      // never does. This is the module's whole near read.
      glazing(frame, m, { thickness: 0.055 })

      // Retaining ring: the clamp that holds the pane against its shoulder,
      // with the fasteners that tension it.
      const [hx, hy] = APERTURE_HALF
      frame.add(extrudeProfile(m.steel, slot(hx + 0.006, hy + 0.006, WINDOW_KIT.clip - 0.01), 0.03, [
        0, WINDOW_KIT.centreY, PLATE_FRONT - 0.098,
      ], {
        fillet: 0.006,
        bevel: 0.008,
        holes: [slot(hx - 0.042, hy - 0.042, WINDOW_KIT.clip - 0.03)],
      }))
      for (let index = 0; index < 6; index += 1) {
        const angle = (index / 6) * Math.PI * 2 + Math.PI / 12
        box(frame, m.graphiteEdge, [0.05, 0.05, 0.038], [
          Math.cos(angle) * (hx - 0.018),
          WINDOW_KIT.centreY + Math.sin(angle) * (hy - 0.018),
          PLATE_FRONT - 0.09,
        ], { chamfer: 0.012, fillet: 0.005, bevel: 0.004 })
      }

      // Pressure equalisation port beside the paddle: the fitting that explains
      // why the pane needs a retaining ring at all.
      box(frame, m.graphite, [0.09, 0.09, 0.045], [WINDOW_KIT.width * 0.5 - 0.135, WINDOW_KIT.centreY - 0.29, PLATE_FRONT + 0.026], {
        chamfer: 0.025, fillet: 0.009, bevel: 0.007,
      })
      box(frame, m.steel, [0.11, 0.024, 0.024], [WINDOW_KIT.width * 0.5 - 0.135, WINDOW_KIT.centreY - 0.29, PLATE_FRONT + 0.055], {
        chamfer: 0.007, fillet: 0.003, bevel: 0.003,
      })

      return {
        sockets: {
          pipe_equalise: [WINDOW_KIT.width * 0.5 - 0.135, WINDOW_KIT.centreY - 0.29, PLATE_FRONT],
          cover_retaining_ring: [0, WINDOW_KIT.centreY, PLATE_FRONT - 0.098],
        },
        tick: (elapsed) => {
          amber.emissiveIntensity = 0.78 + Math.sin(elapsed * 1.1) * 0.1
        },
      }
    },
  })
}

export function createPreview(options: WindowPreviewOptions = {}): CargoPreview {
  return createWindowPreview(createModel(), options)
}
