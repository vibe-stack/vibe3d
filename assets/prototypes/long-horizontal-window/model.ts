import { box, type CargoPreview } from '../axiom-cargo-kit/index.ts'
import {
  PLATE_FRONT,
  WINDOW_KIT,
  actuatorRam,
  apertureLamps,
  bayPlate,
  cill,
  controlPaddle,
  createWindowModel,
  createWindowPreview,
  glazing,
  plateBorder,
  plateFixings,
  plateStrips,
  signalLamp,
  tiledWidth,
  type WindowModel,
  type WindowPreviewOptions,
} from '../axiom-window-kit/index.ts'

/**
 * Four bays. An even count, because a run of 1.5 m bays only terminates on the
 * production rules' 1 m grid when the count is even — three bays would be 4.5 m
 * and would push everything placed after it half a metre off the grid.
 */
const BAYS = 4
const WIDTH = tiledWidth(BAYS)

/**
 * Axiom Relay long horizontal window — the ribbon light.
 *
 * The brief says long and curtain variants tile on the grid, and this is the
 * module that takes that literally: it is four window-frame bays sharing one
 * plate, not one bay stretched to 6 m. That distinction is the whole point of a
 * bay pitch — a stretched bay has a 6 m aperture with the same 50 mm reveal,
 * which reads as a slot cut in a panel; four tiled bays keep the reveal, the
 * lamps, and the mullions at the size a hand and an eye expect them.
 *
 * Only the outer bays carry the plate's stepped border. The mullions between
 * them are structure, and structure that is drawn as two picture frames meeting
 * back to back is not carrying anything.
 */

export function createModel(): WindowModel {
  return createWindowModel({
    id: 'long-horizontal-window',
    condition: 0.44,
    bays: BAYS,
    envelope: { width: WIDTH, depth: WINDOW_KIT.depth, height: WINDOW_KIT.height },
    build: ({ m, bundle, part }) => {
      const frame = part('frame')
      const amber = signalLamp(bundle, 'AMBER-400', 2_740)

      // One continuous plate for the whole run, cut with three apertures.
      for (let index = 0; index < BAYS; index += 1) {
        const centreX = (index - (BAYS - 1) / 2) * WINDOW_KIT.bayPitch
        bayPlate(frame, m, { centreX, width: WINDOW_KIT.bayPitch, border: false })
        apertureLamps(frame, m, amber, { centreX })
        glazing(frame, m, { centreX })
        cill(frame, m, { centreX, width: WINDOW_KIT.bayPitch })
        actuatorRam(frame, m, { centreX })
      }

      // Mullions: one structural post per bay boundary, running the full height
      // and standing proud of the plate, so the run reads as framed rather than
      // as a plate with three holes in it.
      for (let index = 1; index < BAYS; index += 1) {
        const x = (index - BAYS / 2) * WINDOW_KIT.bayPitch
        box(frame, m.graphite, [0.11, WINDOW_KIT.height - 0.1, 0.11], [x, WINDOW_KIT.centreY, PLATE_FRONT + 0.005], {
          chamfer: 0.03, fillet: 0.01, bevel: 0.009,
        })
        box(frame, m.shellShade, [0.05, WINDOW_KIT.height - 0.28, 0.03], [x, WINDOW_KIT.centreY, PLATE_FRONT + 0.062], {
          chamfer: 0.014, fillet: 0.005, bevel: 0.004,
        })
      }

      // One border around the whole run, so three bays read as one ribbon.
      plateBorder(frame, m, { width: WIDTH })
      plateFixings(frame, m, { width: WIDTH })
      plateStrips(frame, m, { centreX: 0 })
      controlPaddle(frame, m, amber, { width: WIDTH })

      return {
        sockets: {
          mount_left: [-WIDTH * 0.5, WINDOW_KIT.centreY, 0],
          mount_right: [WIDTH * 0.5, WINDOW_KIT.centreY, 0],
          window_bay_left: [-WINDOW_KIT.bayPitch * 1.5, WINDOW_KIT.centreY, PLATE_FRONT],
          window_bay_right: [WINDOW_KIT.bayPitch * 1.5, WINDOW_KIT.centreY, PLATE_FRONT],
        },
        tick: (elapsed) => {
          amber.emissiveIntensity = 0.7 + Math.sin(elapsed * 1.3) * 0.1
        },
      }
    },
  })
}

export function createPreview(options: WindowPreviewOptions = {}): CargoPreview {
  return createWindowPreview(createModel(), { distance: 10.8, yaw: -0.42, pitch: 0.14, ...options })
}

