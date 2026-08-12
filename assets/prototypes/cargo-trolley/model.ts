import { Group, Object3D } from 'three/webgpu'

import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  acquireCargoMaterials,
  addLabelDecal,
  addStripeDecal,
  bolt,
  box,
  createCargoPreview,
  finishModel,
  member,
  paintMark,
  plaque,
  slashProfile,
  socket,
  statusLens,
  tubeSection,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay cargo trolley — the upright two-wheeled sack barrow.
 *
 * Defined by its geometry of use: a toe plate low enough to slide under a load,
 * a frame raked back so a tipped load balances over the axle, big spoked wheels
 * that clear a kerb, and a bar handle at chest height. Get the rake wrong and it
 * reads as a hand truck that would tip forward the moment it was loaded.
 *
 * It is posed upright and leaning on its toe plate, which is how one is left
 * when it is not in use.
 */

const WIDTH = 0.5
const HEIGHT = 1.28
const WHEEL = 0.14
const RAKE = 0.16

interface TrolleySockets {
  toe_plate: Object3D
  grip: Object3D
  axle: Object3D
}

export interface CargoTrolleyController {
  root: Group
  sockets: TrolleySockets
  update(deltaSeconds: number): void
  dispose(): void
}

/** A spoked wheel: tyre, rim, five spokes, hub. */
function wheel(root: Group, m: CargoMaterials, x: number, y: number, z: number): void {
  root.add(cylinder(m.rubber, WHEEL, 0.06, [x, y, z], AXIS_X, 18))
  root.add(cylinder(m.graphiteEdge, WHEEL * 0.76, 0.05, [x, y, z], AXIS_X, 16))
  root.add(cylinder(m.shellShade, WHEEL * 0.66, 0.04, [x, y, z], AXIS_X, 16))
  for (let index = 0; index < 5; index += 1) {
    const angle = (Math.PI * 2 * index) / 5
    box(root, m.steel, [0.03, WHEEL * 1.1, 0.02], [x, y, z], {
      chamfer: 0.008, fillet: 0.004, bevel: 0.004,
      rotation: [angle, Math.PI / 2, 0],
    })
  }
  root.add(cylinder(m.steel, 0.03, 0.075, [x, y, z], AXIS_X, 10))
  root.add(cylinder(m.ink, 0.013, 0.085, [x, y, z], AXIS_X, 8))
}

function build(): { root: Group; sockets: TrolleySockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(58_800, { condition: 0.74 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_CARGO-TROLLEY_ROOT_DEFAULT'

  const frame = new Group()
  frame.name = 'AXR_CARGO_CARGO-TROLLEY_PART_FRAME_DEFAULT'
  frame.rotation.x = RAKE
  root.add(frame)

  // Two raked stiles with three cross rails, built in the frame's own space so
  // the rake is one rotation rather than trigonometry on every part.
  for (const sx of [-1, 1]) {
    const x = sx * (WIDTH * 0.5 - 0.03)
    tubeSection(frame, m.shell, [0.05, 0.05], 0.008, HEIGHT, [x, HEIGHT * 0.5, 0], [Math.PI / 2, 0, 0])
    box(frame, m.graphiteEdge, [0.06, 0.1, 0.09], [x, WHEEL + 0.02, -0.05], {
      chamfer: 0.02, fillet: 0.007, bevel: 0.006,
    })
  }
  for (const y of [0.34, 0.78, HEIGHT - 0.3]) {
    box(frame, m.shellShade, [WIDTH - 0.06, 0.045, 0.04], [0, y, 0], {
      chamfer: 0.014, fillet: 0.006, bevel: 0.005,
    })
  }
  for (const sx of [-1, 1]) {
    member(frame, m.shellShade, [-WIDTH * 0.5 + 0.05, 0.34 + (sx > 0 ? 0 : 0.44), 0.01], [WIDTH * 0.5 - 0.05, 0.34 + (sx > 0 ? 0.44 : 0), 0.01], 0.03, 0.03)
  }

  // Back panel between the stiles, the surface a load actually rests against.
  box(frame, m.shell, [WIDTH - 0.08, 0.62, 0.022], [0, 0.62, -0.024], {
    chamfer: 0.03, fillet: 0.012, bevel: 0.008,
  })
  for (let index = 0; index < 4; index += 1) {
    box(frame, m.shellShade, [WIDTH - 0.16, 0.03, 0.014], [0, 0.4 + index * 0.15, -0.036], {
      chamfer: 0.008, fillet: 0.004, bevel: 0.004,
    })
  }

  // Toe plate: a tapered blade with a bevelled leading edge.
  box(frame, m.ironOxide, [WIDTH - 0.02, 0.028, 0.3], [0, 0.05, 0.16], {
    chamfer: 0.02, fillet: 0.008, bevel: 0.007,
  })
  box(frame, m.ironOxide, [WIDTH - 0.06, 0.016, 0.09], [0, 0.045, 0.34], {
    chamfer: 0.012, fillet: 0.005, bevel: 0.004, rotation: [-0.14, 0, 0],
  })
  for (const sx of [-1, 1]) bolt(frame, m.steel, [sx * (WIDTH * 0.5 - 0.08), 0.066, 0.1], 0.013, 'top')

  // Handle: a wrapped bar across the top plus two secondary side grips.
  frame.add(cylinder(m.rubber, 0.024, WIDTH + 0.02, [0, HEIGHT - 0.04, 0], AXIS_X, 12))
  for (const sx of [-1, 1]) {
    frame.add(cylinder(m.rubber, 0.022, 0.16, [sx * (WIDTH * 0.5 - 0.03), HEIGHT - 0.22, 0], [0, 0, 0], 10))
  }

  const label = addLabelDecal(bundle, { variant: 190 })
  plaque(frame, m, label, [0.2, 0.08], [0, 0.9, -0.038], 'back', m.shellLight)
  statusLens(frame, m, [0.045, 0.018], [0, 0.72, -0.038], m.cyan, 'back')
  paintMark(frame, m.amberPaint, slashProfile(0.045, 0.1, 0.45), [-0.14, 0.24, 0.026], 'front', 0.009)
  const stripe = addStripeDecal(bundle, { count: 4, lean: 1 })
  plaque(frame, m, stripe, [0.3, 0.05], [0, 0.066, 0.24], 'top', m.ink)

  // Wheels hang off the root, not the frame: their axle is horizontal in world
  // space no matter how the frame is raked.
  const axleZ = -0.09
  for (const sx of [-1, 1]) wheel(root, m, sx * (WIDTH * 0.5 + 0.02), WHEEL, axleZ)
  root.add(cylinder(m.steel, 0.018, WIDTH + 0.1, [0, WHEEL, axleZ], AXIS_X, 8))
  // Rear stand feet, so the parked trolley rests on three points.
  for (const sx of [-1, 1]) {
    box(root, m.rubber, [0.06, 0.05, 0.07], [sx * (WIDTH * 0.5 - 0.03), 0.025, -0.24], {
      chamfer: 0.016, fillet: 0.006, bevel: 0.005,
    })
  }

  const sockets: TrolleySockets = {
    toe_plate: socket('toe_plate', [0, 0.09, 0.3]),
    grip: socket('grip', [0, HEIGHT - 0.02, -0.22]),
    axle: socket('axle', [0, WHEEL, axleZ]),
  }
  return { root, sockets, bundle }
}

export function createModel(): CargoTrolleyController {
  const { root, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'cargo-trolley',
    reach: 0.1,
    sockets: Object.values(sockets),
  })
  let elapsed = 0
  return {
    root,
    sockets,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      bundle.materials.cyan.emissiveIntensity = 1.5 + Math.sin(elapsed * 1.6) * 0.2
    },
    dispose: finished.dispose,
  }
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  createCargoPreview(createModel(), {
    target: [0, HEIGHT * 0.46, 0],
    distance: 3.4,
    yaw: 0.74,
    pitch: 0.24,
    fov: 30,
    ...options,
  })
