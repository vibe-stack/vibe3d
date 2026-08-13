import { Group, Object3D } from 'three/webgpu'

import { cylinder, extrudeProfile, type Vec2 } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_Z,
  acquireCargoMaterials,
  addLabelDecal,
  addStripeDecal,
  bolt,
  box,
  boltRun,
  createCargoPreview,
  finishModel,
  paintMark,
  plaque,
  seam,
  slashProfile,
  socket,
  statusLens,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay industrial skip — a roll-on/roll-off waste container.
 *
 * A skip is a truck attachment, not a bin, and its shape says so: raked ends so
 * it can be dragged up a tilting bed, a lifting eye at the nose, roller wheels
 * at the tail, and rub rails along both flanks where the chains bear. It has no
 * lid, because the load is the read.
 *
 * The load is authored as angular rubble sharing the pack's own materials -
 * offcut plate, broken pallet timber, a crushed drum - so the skip looks like it
 * was filled from this depot rather than from a generic debris library.
 */

const LENGTH = 3.2
const WIDTH = 1.68
const HEIGHT = 1.05
const RAKE = 0.42

interface SkipSockets {
  lift_eye: Object3D
  roller_axle: Object3D
  load_centre: Object3D
  chain_rail: Object3D
}

export interface IndustrialSkipController {
  root: Group
  sockets: SkipSockets
  update(deltaSeconds: number): void
  dispose(): void
}

/** Thickness of the pressed side skin; its outer face is exactly `WIDTH * 0.5`. */
const WALL = 0.055
/** Top of the floor slab. Everything in the skip is loaded from here. */
const FLOOR = 0.09

/**
 * Side elevation: flat floor, vertical middle, raked ends.
 *
 * The wall beds 20 mm into the floor slab rather than sharing its underside. Two
 * down-facing planes on y = 0 is the single most repeated z-fight in the pack,
 * and this one ran the full 3.2 m of both flanks.
 */
function sideProfile(): Vec2[] {
  return [
    [-LENGTH * 0.5, 0.02],
    [LENGTH * 0.5, 0.02],
    [LENGTH * 0.5 + RAKE * 0.4, HEIGHT],
    [-LENGTH * 0.5 - RAKE, HEIGHT],
  ]
}

function rubble(root: Group, m: CargoMaterials): void {
  // The load is stacked up from the floor slab, not down from the coaming. Hung
  // off HEIGHT it sat 430-700 mm clear of the floor it is meant to be filling
  // and the skip read as empty with debris suspended in it.
  // Offcut plate, leaning against the far wall.
  for (const [index, tilt] of [-0.5, 0.3, 0.9].entries()) {
    box(root, m.ironOxide, [0.7 + index * 0.14, 0.04, 0.5], [
      -0.5 + index * 0.5, FLOOR + 0.24 + index * 0.07, -0.28 + index * 0.2,
    ], { chamfer: 0.02, fillet: 0.008, bevel: 0.006, rotation: [tilt * 0.3, tilt, tilt * 0.5] })
  }
  // Broken pallet boards, crossed.
  for (const [index, yaw] of [0.4, -0.8, 1.3].entries()) {
    box(root, m.timber, [0.9, 0.035, 0.11], [
      0.5 - index * 0.4, FLOOR + 0.2 - index * 0.05, 0.3 - index * 0.26,
    ], { chamfer: 0.008, fillet: 0.004, bevel: 0.004, rotation: [0.1, yaw, index * 0.12 - 0.1] })
  }
  // A crushed drum on its side, and two smaller lumps.
  root.add(cylinder(m.ironOxide, 0.26, 0.6, [-0.85, FLOOR + 0.27, 0.3], [0.2, 0, Math.PI / 2 + 0.2], 12))
  root.add(cylinder(m.shellShade, 0.19, 0.34, [1.05, FLOOR + 0.24, -0.1], [0.6, 0.4, 1.2], 10))
  box(root, m.graphiteEdge, [0.34, 0.26, 0.3], [0.1, FLOOR + 0.22, 0.36], {
    chamfer: 0.07, fillet: 0.024, bevel: 0.012, rotation: [0.3, 0.5, -0.2],
  })
  box(root, m.shell, [0.4, 0.18, 0.36], [-0.1, FLOOR + 0.2, -0.34], {
    chamfer: 0.05, fillet: 0.018, bevel: 0.01, rotation: [-0.2, 0.9, 0.15],
  })
}

function build(): { root: Group; sockets: SkipSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(62_000, { condition: 0.95 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_INDUSTRIAL_DUMPSTER_ROOT_DEFAULT'

  // Two side walls as one extruded profile each, plus floor and raked ends.
  for (const sz of [-1, 1]) {
    root.add(extrudeProfile(m.shell, sideProfile(), WALL, [0, 0, sz * (WIDTH * 0.5 - WALL * 0.5)], {
      fillet: 0.03, bevel: 0.022,
    }))
  }
  // The slab is held 25 mm inside the skin's outer face. Run out to WIDTH its
  // own flank and the skin's were the same plane, facing the same way, down the
  // whole 3.2 m of both sides.
  box(root, m.graphiteEdge, [LENGTH + 0.1, FLOOR, WIDTH - 0.05], [0, FLOOR * 0.5, 0], {
    chamfer: 0.04, fillet: 0.014, bevel: 0.012,
  })
  // The end walls rake with the side profile: the sign was inverted, so each end
  // ran the opposite way to the flank it closes and left a 420 mm triangular
  // hole at the top of the tail with a foot jutting out over nothing. They also
  // lap each flank by 45 mm now instead of catching it by 5.
  for (const [sx, rake] of [[-1, RAKE], [1, RAKE * 0.4]] as const) {
    const slant = Math.atan2(rake, HEIGHT)
    box(root, m.shell, [0.05, Math.hypot(HEIGHT, rake), WIDTH - 0.02], [
      sx * (LENGTH * 0.5 + rake * 0.5), HEIGHT * 0.5, 0,
    ], { chamfer: 0.03, fillet: 0.011, bevel: 0.01, rotation: [0, 0, -sx * slant] })
  }

  // Rub rails and top coaming, the two bands that carry the silhouette.
  for (const sz of [-1, 1]) {
    const z = sz * (WIDTH * 0.5 + 0.006)
    box(root, m.graphite, [LENGTH + 0.1, 0.1, 0.05], [-0.06, HEIGHT * 0.46, z], {
      chamfer: 0.024, fillet: 0.009, bevel: 0.008,
    })
    box(root, m.graphiteEdge, [LENGTH + 0.36, 0.09, 0.07], [-0.14, HEIGHT - 0.03, z], {
      chamfer: 0.022, fillet: 0.008, bevel: 0.007,
    })
    boltRun(root, m.steel, [-LENGTH * 0.4, HEIGHT * 0.46, sz * (WIDTH * 0.5 + 0.031)], [LENGTH * 0.4, HEIGHT * 0.46, sz * (WIDTH * 0.5 + 0.031)], 7, 0.017, sz > 0 ? 'front' : 'back')
    // Vertical stiffener ribs between the two rails, biting 25 mm into the skin.
    for (let index = 0; index < 6; index += 1) {
      const x = (index / 5 - 0.5) * (LENGTH - 0.3) - 0.1
      box(root, m.shellShade, [0.09, HEIGHT - 0.2, 0.05], [x, HEIGHT * 0.5, sz * (WIDTH * 0.5 + 0.005)], {
        chamfer: 0.02, fillet: 0.008, bevel: 0.006,
      })
    }
    seam(root, m.shell, LENGTH - 0.2, [0, HEIGHT * 0.2, sz * WIDTH * 0.5], sz > 0 ? 'front' : 'back', 'across', 0.024, 0.014)
  }

  // Nose lifting eye and the hook bar the truck's arm engages.
  const nose = -LENGTH * 0.5 - RAKE * 0.5
  box(root, m.graphite, [0.3, 0.3, 0.4], [nose, HEIGHT * 0.62, 0], {
    chamfer: 0.06, fillet: 0.022, bevel: 0.014,
  })
  // The eye's profile is authored -0.02 … 0.2, so seating it 130 mm above the
  // block's centre buries its legs 40 mm into the block. At 0.2 it stood clear.
  root.add(extrudeProfile(m.steel, [
    [-0.11, 0.2], [0.11, 0.2], [0.11, -0.02], [0.055, -0.02],
    [0.055, 0.14], [-0.055, 0.14], [-0.055, -0.02], [-0.11, -0.02],
  ], 0.07, [nose - 0.1, HEIGHT * 0.62 + 0.13, 0], { fillet: 0.02, bevel: 0.012, rotation: [0, Math.PI / 2, 0] }))
  root.add(cylinder(m.steel, 0.035, 0.44, [nose - 0.02, HEIGHT * 0.3, 0], AXIS_Z, 10))

  // Tail rollers on a real axle, outboard of both flanks. Slung between the
  // walls they were swallowed whole - the lower half inside the floor slab, the
  // outer edge inside the skin - and no wheel appeared in any frame.
  const tail = LENGTH * 0.5 - 0.14
  const rollerZ = WIDTH * 0.5 + 0.09
  root.add(cylinder(m.steel, 0.03, WIDTH + 0.3, [tail, 0.13, 0], AXIS_Z, 8))
  for (const sz of [-1, 1]) {
    root.add(cylinder(m.ironOxide, 0.13, 0.12, [tail, 0.13, sz * rollerZ], AXIS_Z, 12))
    root.add(cylinder(m.graphiteEdge, 0.055, 0.14, [tail, 0.13, sz * rollerZ], AXIS_Z, 10))
    box(root, m.graphite, [0.16, 0.3, 0.06], [tail, 0.16, sz * (WIDTH * 0.5 - 0.005)], {
      chamfer: 0.026, fillet: 0.01, bevel: 0.008,
    })
  }
  // Skids under the floor so the empty skip does not sit flush on the deck.
  // Sized to the slab they were inside it, which is exactly the opposite.
  for (const sz of [-1, 1]) {
    box(root, m.graphite, [LENGTH - 0.2, 0.1, 0.14], [0, 0.03, sz * (WIDTH * 0.5 - 0.24)], {
      chamfer: 0.02, fillet: 0.008, bevel: 0.007,
    })
  }

  rubble(root, m)

  // Every flank graphic sits on the skin's exact face and inside one of the five
  // 490 mm bays the ribs leave. At WIDTH * 0.5 + 0.036 they stood 26-35 mm off
  // the skin, and the hazard band was wide enough to cross a rib and be buried.
  const label = addLabelDecal(bundle, { variant: 330 })
  plaque(root, m, label, [0.36, 0.15], [-0.7, HEIGHT * 0.72, WIDTH * 0.5], 'front', m.shellLight)
  const stripe = addStripeDecal(bundle, { count: 6, lean: 1 })
  plaque(root, m, stripe, [0.4, 0.1], [0.48, HEIGHT * 0.72, WIDTH * 0.5], 'front', m.ink)
  paintMark(root, m.amberPaint, slashProfile(0.1, 0.3, 0.42), [-0.19, HEIGHT * 0.74, WIDTH * 0.5], 'front', 0.012)
  paintMark(root, m.amberPaint, slashProfile(0.05, 0.3, 0.42), [0.02, HEIGHT * 0.74, WIDTH * 0.5], 'front', 0.012)
  statusLens(root, m, [0.06, 0.024], [-1.3, HEIGHT * 0.72, WIDTH * 0.5], m.cyan, 'front')
  for (const sz of [-1, 1]) bolt(root, m.steel, [nose + 0.1, HEIGHT * 0.62, sz * 0.2], 0.02, sz > 0 ? 'front' : 'back')

  const sockets: SkipSockets = {
    lift_eye: socket('lift_eye', [nose - 0.1, HEIGHT * 0.62 + 0.19, 0]),
    roller_axle: socket('roller_axle', [tail, 0.13, 0]),
    load_centre: socket('load_centre', [0, FLOOR + 0.3, 0]),
    chain_rail: socket('chain_rail', [0, HEIGHT * 0.46, WIDTH * 0.5 + 0.06]),
  }
  return { root, sockets, bundle }
}

export function createModel(): IndustrialSkipController {
  const { root, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'industrial-dumpster',
    reach: 0.2,
    sockets: Object.values(sockets),
  })
  let elapsed = 0
  return {
    root,
    sockets,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      bundle.materials.cyan.emissiveIntensity = 1.5 + Math.sin(elapsed * 1.2) * 0.2
    },
    dispose: finished.dispose,
  }
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  createCargoPreview(createModel(), {
    // The skip is 3.4 m long against 1.05 m tall, so its diagonal is what fills
    // the frame: at 7.4 m the tail ran off the right-hand edge. The target
    // drops with the distance because the raked body reads from below its own
    // mid-height.
    target: [0, HEIGHT * 0.34, 0],
    distance: 8.5,
    yaw: 0.78,
    pitch: 0.3,
    fov: 30,
    ...options,
  })
