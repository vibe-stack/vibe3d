import { box, type CargoPreview } from '../axiom-cargo-kit/index.ts'
import {
  APERTURE_HALF,
  PLATE_FRONT,
  WINDOW_KIT,
  apertureLamps,
  bayPlate,
  createWindowModel,
  createWindowPreview,
  glazing,
  plateBorder,
  plateFixings,
  signalLamp,
  tiledWidth,
  type WindowModel,
  type WindowPreviewOptions,
} from '../axiom-window-kit/index.ts'

/** Two bays wide, two storeys tall, on the brief's tiling grid. */
const COLUMNS = 2
const ROWS = 2
// Two bays: an even count, so the run terminates on the 1 m grid at 3 m.
const WIDTH = tiledWidth(COLUMNS)
const STOREY = WINDOW_KIT.height
const HEIGHT = STOREY * ROWS

/**
 * Axiom Relay high-rise curtain glazing — the bay tiled in two directions.
 *
 * A curtain wall is not a big window: it is a non-loadbearing skin hung off the
 * floor slabs behind it, so its structure runs *vertically* through unbroken
 * mullions and only stops at the transoms that mark each slab edge. That is why
 * the mullions here are continuous over the full 2.8 m and the transoms are
 * interrupted by them, rather than the two being drawn as an even grid. Drawn as
 * a grid the module reads as a warehouse window enlarged; drawn this way it
 * reads as a facade.
 *
 * The spandrel — the opaque band at each slab line — is the other half of the
 * difference. It is where the floor structure actually is, and a curtain wall
 * without one is a glass box with invisible floors.
 */

export function createModel(): WindowModel {
  return createWindowModel({
    id: 'high-rise-curtain-glazing',
    condition: 0.22,
    bays: COLUMNS * ROWS,
    envelope: { width: WIDTH, depth: WINDOW_KIT.depth, height: HEIGHT },
    build: ({ m, bundle, part }) => {
      const frame = part('frame')
      const cyan = signalLamp(bundle, 'CYAN-400', 2_850)

      for (let row = 0; row < ROWS; row += 1) {
        // The kit's builders are authored around one centre height, so a second
        // storey is placed by lifting a group rather than by re-parameterising
        // every helper on Y.
        const storey = part(`storey-${row}`)
        storey.position.y = row * STOREY
        for (let column = 0; column < COLUMNS; column += 1) {
          const centreX = (column - (COLUMNS - 1) / 2) * WINDOW_KIT.bayPitch
          bayPlate(storey, m, { centreX, width: WINDOW_KIT.bayPitch, border: false })
          apertureLamps(storey, m, cyan, { centreX })
          glazing(storey, m, { centreX })
        }
        // Spandrel band at the slab line: opaque, and deeper than the glass.
        box(storey, m.shellShade, [WIDTH - 0.12, 0.16, 0.06], [0, WINDOW_KIT.centreY - APERTURE_HALF[1] - 0.13, PLATE_FRONT + 0.02], {
          chamfer: 0.03, fillet: 0.01, bevel: 0.009,
        })
        box(storey, m.graphite, [WIDTH - 0.2, 0.05, 0.09], [0, WINDOW_KIT.centreY - APERTURE_HALF[1] - 0.13, PLATE_FRONT + 0.05], {
          chamfer: 0.014, fillet: 0.006, bevel: 0.005,
        })
      }

      // Mullions: continuous over the full height, standing proud of the skin.
      for (let index = 0; index <= COLUMNS; index += 1) {
        const x = (index - COLUMNS / 2) * WINDOW_KIT.bayPitch
        box(frame, m.graphite, [0.1, HEIGHT - 0.04, 0.13], [x, HEIGHT * 0.5, PLATE_FRONT + 0.03], {
          chamfer: 0.028, fillet: 0.01, bevel: 0.009,
        })
        box(frame, m.shellShade, [0.044, HEIGHT - 0.16, 0.03], [x, HEIGHT * 0.5, PLATE_FRONT + 0.1], {
          chamfer: 0.012, fillet: 0.005, bevel: 0.004,
        })
      }
      // Transoms: only between mullions, because that is what they span.
      for (let row = 1; row < ROWS; row += 1) {
        for (let column = 0; column < COLUMNS; column += 1) {
          const centreX = (column - (COLUMNS - 1) / 2) * WINDOW_KIT.bayPitch
          box(frame, m.graphiteEdge, [WINDOW_KIT.bayPitch - 0.11, 0.07, 0.1], [centreX, row * STOREY, PLATE_FRONT + 0.024], {
            chamfer: 0.02, fillet: 0.008, bevel: 0.007,
          })
        }
      }

      // The border and fixings are the only parts authored about the kit's
      // single-bay centre rather than about a storey, so they get their own
      // group and it is lifted once. Shifting `frame` wholesale instead would
      // take the mullions and transoms — which are already in run coordinates —
      // up with it, and push the mullions a full storey off the glass.
      const skin = part('skin')
      skin.position.y = HEIGHT * 0.5 - WINDOW_KIT.centreY
      plateBorder(skin, m, { width: WIDTH, height: HEIGHT })
      plateFixings(skin, m, { width: WIDTH, height: HEIGHT })

      return {
        sockets: {
          mount_left: [-WIDTH * 0.5, HEIGHT * 0.5, 0],
          mount_right: [WIDTH * 0.5, HEIGHT * 0.5, 0],
          window_head: [0, HEIGHT, 0],
          window_cill: [0, 0, 0],
          mount_slab_line: [0, STOREY, PLATE_FRONT],
        },
        tick: (elapsed) => {
          cyan.emissiveIntensity = 0.58 + Math.sin(elapsed * 0.7) * 0.06
        },
      }
    },
  })
}

export function createPreview(options: WindowPreviewOptions = {}): CargoPreview {
  return createWindowPreview(createModel(), {
    target: [0, HEIGHT * 0.5, 0],
    distance: 8.2,
    yaw: -0.5,
    pitch: 0.12,
    ...options,
  })
}
