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
  groundPad,
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
    // The axle boss reaches from the stile back to the axle. The wheels hang in
    // world space, so in the raked frame's own space the axle sits at
    // (0.124, -0.111) - the boss has to span that, not stop 60 mm short of it.
    box(frame, m.graphiteEdge, [0.06, 0.12, 0.13], [x, WHEEL + 0.02, -0.07], {
      chamfer: 0.02, fillet: 0.007, bevel: 0.006,
    })
  }
  for (const y of [0.34, 0.78, HEIGHT - 0.3]) {
    box(frame, m.shellShade, [WIDTH - 0.06, 0.045, 0.04], [0, y, 0], {
      chamfer: 0.014, fillet: 0.006, bevel: 0.005,
    })
  }
  // The two braces cross, so they cannot share one slab: at a common z their
  // front and back caps are coplanar over the whole crossing. The rear one runs
  // inside the frame bay and the front one laps the stiles' 0.025 face, which is
  // how the pair is riveted on anyway. Both ends land on the stile axis, 25 mm
  // inside its inner face, rather than 5 mm.
  for (const sx of [-1, 1]) {
    const z = sx > 0 ? 0.004 : 0.024
    member(frame, m.shellShade, [-(WIDTH * 0.5 - 0.03), 0.34 + (sx > 0 ? 0 : 0.44), z], [WIDTH * 0.5 - 0.03, 0.34 + (sx > 0 ? 0.44 : 0), z], 0.03, 0.024)
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
  for (const sx of [-1, 1]) bolt(frame, m.steel, [sx * (WIDTH * 0.5 - 0.08), 0.064, 0.1], 0.013, 'top')

  // Handle: a wrapped bar across the top plus two secondary side grips. A grip
  // has to be fatter than the 0.05 stile it is wrapped round; at the radius it
  // was drawn at the whole sleeve sat inside the tube's own profile.
  frame.add(cylinder(m.rubber, 0.024, WIDTH + 0.02, [0, HEIGHT - 0.04, 0], AXIS_X, 12))
  for (const sx of [-1, 1]) {
    frame.add(cylinder(m.rubber, 0.034, 0.16, [sx * (WIDTH * 0.5 - 0.03), HEIGHT - 0.22, 0], [0, 0, 0], 10))
  }

  // The back panel's outer face is -0.035 and its stiffener ribs are pitched
  // 0.15 apart from 0.4, so the label and the lamp go in the bays between them.
  const label = addLabelDecal(bundle, { variant: 190 })
  plaque(frame, m, label, [0.2, 0.07], [0, 0.775, -0.035], 'back', m.shellLight)
  statusLens(frame, m, [0.045, 0.018], [0, 0.625, -0.035], m.cyan, 'back')
  paintMark(frame, m.amberPaint, slashProfile(0.045, 0.1, 0.45), [-0.14, 0.56, -0.013], 'front', 0.009)
  const stripe = addStripeDecal(bundle, { count: 4, lean: 1 })
  plaque(frame, m, stripe, [0.3, 0.05], [0, 0.064, 0.24], 'top', m.ink)

  // Wheels hang off the root, not the frame: their axle is horizontal in world
  // space no matter how the frame is raked.
  const axleZ = -0.09
  for (const sx of [-1, 1]) wheel(root, m, sx * (WIDTH * 0.5 + 0.02), WHEEL, axleZ)
  root.add(cylinder(m.steel, 0.018, WIDTH + 0.1, [0, WHEEL, axleZ], AXIS_X, 8))
  // Stand feet capping the stiles. The rake carries the frame forward, not back,
  // so the stile soles come down at z = 0 and a foot 240 mm behind that stood in
  // open air with nothing above it.
  for (const sx of [-1, 1]) groundPad(root, m.rubber, [0.06, 0.08], [sx * (WIDTH * 0.5 - 0.03), 0, 0], 0.05)

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
