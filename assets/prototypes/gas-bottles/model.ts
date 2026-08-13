import { Group, Object3D } from 'three/webgpu'

import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  AXIS_Y,
  AXIS_Z,
  FACE_CLEARANCE,
  acquireCargoMaterials,
  addStripeDecal,
  bolt,
  box,
  createCargoPreview,
  facetRadius,
  finishModel,
  groundPad,
  member,
  paintMark,
  plaque,
  slashProfile,
  socket,
  statusLens,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay gas bottle bank — four high-pressure cylinders in a transport
 * cradle.
 *
 * The cradle is not dressing. A loose gas cylinder is a rocket, so the whole
 * point of this asset is the restraint: a welded frame, a chain across the
 * waist, and a valve guard cage over the necks. Model the bottles without it and
 * the prop reads as a mistake to anyone who has ever been on a work site.
 *
 * Each bottle gets a different shoulder colour from the palette's semantic set,
 * which is how gas service is actually identified and gives the group its
 * cadence.
 */

const BOTTLE_R = 0.105
const BOTTLE_H = 1.16
const BASE = 0.11
const PITCH = 0.245
/** Fore-and-aft line the cradle posts, the waist rails and the braces share. */
const RAIL_Z = BOTTLE_R + 0.045
/** Top of the posts, and the tallest thing on the prop. */
const CRADLE = BASE + BOTTLE_H + 0.32

interface GasBottleSockets {
  valve_a: Object3D
  valve_b: Object3D
  chain_anchor: Object3D
  lift_frame: Object3D
}

export interface GasBottleController {
  root: Group
  sockets: GasBottleSockets
  update(deltaSeconds: number): void
  dispose(): void
}

function bottle(root: Group, m: CargoMaterials, x: number, shoulder: typeof m.amberPaint): void {
  const y = BASE
  root.add(cylinder(m.shellShade, BOTTLE_R, BOTTLE_H, [x, y + BOTTLE_H * 0.5, 0], AXIS_Y, 16))
  root.add(cylinder(m.ironOxide, BOTTLE_R + 0.006, 0.05, [x, y + 0.045, 0], AXIS_Y, 16))
  // Shoulder taper: two stepped rings read as a dome and keep the neck legible.
  root.add(cylinder(shoulder, BOTTLE_R * 0.86, 0.09, [x, y + BOTTLE_H + 0.03, 0], AXIS_Y, 16))
  root.add(cylinder(shoulder, BOTTLE_R * 0.6, 0.07, [x, y + BOTTLE_H + 0.1, 0], AXIS_Y, 14))
  root.add(cylinder(m.graphiteEdge, 0.03, 0.075, [x, y + BOTTLE_H + 0.16, 0], AXIS_Y, 10))
  // Valve body and its hand wheel, offset so the bank is not four clones.
  root.add(cylinder(m.steel, 0.036, 0.055, [x, y + BOTTLE_H + 0.21, 0], AXIS_Y, 10))
  root.add(cylinder(m.amberPaint, 0.042, 0.02, [x, y + BOTTLE_H + 0.245, 0], AXIS_Y, 8))
  root.add(cylinder(m.steel, 0.016, 0.09, [x, y + BOTTLE_H + 0.2, 0.045], AXIS_Z, 8))
}

function build(): { root: Group; sockets: GasBottleSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(54_800, { condition: 0.66 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_GAS-BOTTLES_ROOT_DEFAULT'

  // Wide enough that a post at each corner stands outside the outer bottles.
  // At the width it was drawn to, the two end posts ran 40 mm through them.
  const span = PITCH * 3 + BOTTLE_R * 2 + 0.19
  // The rubber mat under the pallet is what meets the deck, so the pallet's own
  // sole starts a face clearance above it rather than a millimetre off it.
  box(root, m.graphite, [span, BASE - FACE_CLEARANCE, BOTTLE_R * 2 + 0.16], [0, (BASE + FACE_CLEARANCE) * 0.5, 0], {
    chamfer: 0.045, fillet: 0.016, bevel: 0.013, capChamfer: 0.03,
  })
  groundPad(root, m.rubber, [span - 0.06, BOTTLE_R * 2 + 0.1], [0, 0, 0])

  const shoulders = [m.amberPaint, m.orangePaint, m.redPaint, m.amberPaint]
  for (let index = 0; index < 4; index += 1) {
    bottle(root, m, (index - 1.5) * PITCH, shoulders[index])
  }

  // Cradle: a post at each corner, a waist rail down each side, and a valve
  // guard over the top. The posts stand on the line the rails and the chain run
  // along, because a rail 120 mm inboard or outboard of its post is a bar
  // hanging in the air at both ends - which is what the single centre post per
  // end left. Every post foot, rail end and brace end is a lap, never a butt.
  const postFoot = BASE - 0.04
  for (const sx of [-1, 1]) {
    const x = sx * (span * 0.5 - 0.055)
    for (const sz of [-1, 1]) {
      box(root, m.graphiteEdge, [0.06, CRADLE - postFoot, 0.06], [x, (CRADLE + postFoot) * 0.5, sz * RAIL_Z], {
        chamfer: 0.018, fillet: 0.007, bevel: 0.006,
      })
      member(root, m.graphiteEdge, [sx * (span * 0.5 - 0.195), BASE - 0.02, sz * RAIL_Z], [x, BASE + 0.34, sz * RAIL_Z], 0.035, 0.035)
    }
    bolt(root, m.steel, [x, BASE + 0.06, RAIL_Z + 0.03], 0.016, 'front')
  }
  for (const sz of [-1, 1]) {
    member(root, m.steel, [-span * 0.5 + 0.03, BASE + BOTTLE_H * 0.62, sz * RAIL_Z], [span * 0.5 - 0.03, BASE + BOTTLE_H * 0.62, sz * RAIL_Z], 0.032, 0.032)
  }
  // Valve guard cage. It stops short of the posts' outer skins in both axes so
  // the joint is an overlap rather than four coincident faces.
  box(root, m.graphiteEdge, [span - 0.09, 0.045, BOTTLE_R * 2 + 0.12], [0, BASE + BOTTLE_H + 0.3, 0], {
    chamfer: 0.02, fillet: 0.008, bevel: 0.007,
  })
  for (let index = 0; index < 5; index += 1) {
    const x = (index / 4 - 0.5) * (span - 0.14)
    box(root, m.steel, [0.026, 0.16, 0.026], [x, BASE + BOTTLE_H + 0.23, BOTTLE_R + 0.02], {
      chamfer: 0.008, fillet: 0.004, bevel: 0.004,
    })
  }

  // Restraint chain across the waist, plus its tensioner.
  box(root, m.ink, [span - 0.09, 0.028, 0.028], [0, BASE + BOTTLE_H * 0.62, BOTTLE_R + 0.07], {
    chamfer: 0.009, fillet: 0.004, bevel: 0.004,
  })
  box(root, m.amberPaint, [0.08, 0.09, 0.05], [span * 0.5 - 0.14, BASE + BOTTLE_H * 0.62, BOTTLE_R + 0.085], {
    chamfer: 0.022, fillet: 0.008, bevel: 0.007,
  })
  root.add(cylinder(m.steel, 0.013, 0.1, [span * 0.5 - 0.14, BASE + BOTTLE_H * 0.62, BOTTLE_R + 0.1], AXIS_X, 8))

  // The cradle's end face is flat, so it takes the flat plaque; drawn as a
  // radius it stood 6 mm off the panel and the curved helper's width clamp had
  // squeezed the stripe to a tenth of its length. A bottle flank is the reverse
  // case: everything on one is measured from the chord a 16-facet shell renders,
  // and a mark is only as wide as its own thickness lets it bed into that chord.
  const stripe = addStripeDecal(bundle, { count: 5, lean: 1 })
  plaque(root, m, stripe, [0.3, 0.05], [0, BASE * 0.5, BOTTLE_R + 0.08], 'front', m.ink)
  const flank = facetRadius(BOTTLE_R, 16)
  paintMark(root, m.orangePaint, slashProfile(0.028, 0.15, 0.18), [-PITCH * 1.5, BASE + BOTTLE_H * 0.34, flank], 'front', 0.012)
  statusLens(root, m, [0.035, 0.018], [PITCH * 1.5, BASE + BOTTLE_H * 0.34, flank], m.cyan, 'front')

  const sockets: GasBottleSockets = {
    valve_a: socket('valve_a', [-PITCH * 1.5, BASE + BOTTLE_H + 0.28, 0]),
    valve_b: socket('valve_b', [PITCH * 1.5, BASE + BOTTLE_H + 0.28, 0]),
    chain_anchor: socket('chain_anchor', [span * 0.5 - 0.14, BASE + BOTTLE_H * 0.62, BOTTLE_R + 0.14]),
    lift_frame: socket('lift_frame', [0, BASE + BOTTLE_H + 0.34, 0]),
  }
  return { root, sockets, bundle }
}

export function createModel(): GasBottleController {
  const { root, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'gas-bottles',
    reach: 0.14,
    sockets: Object.values(sockets),
  })
  let elapsed = 0
  return {
    root,
    sockets,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      bundle.materials.cyan.emissiveIntensity = 1.6 + Math.sin(elapsed * 2.2) * 0.22
    },
    dispose: finished.dispose,
  }
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  createCargoPreview(createModel(), {
    target: [0, CRADLE * 0.5, 0],
    distance: 3.6,
    yaw: 0.62,
    pitch: 0.24,
    fov: 30,
    ...options,
  })
