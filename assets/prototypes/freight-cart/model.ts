import { Group, Object3D } from 'three/webgpu'

import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  AXIS_Z,
  acquireCargoMaterials,
  addLabelDecal,
  addStripeDecal,
  bolt,
  box,
  castor,
  createCargoPreview,
  finishModel,
  member,
  paintMark,
  plaque,
  seam,
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
 * Axiom Relay freight cart — the four-wheel platform trolley.
 *
 * Two swivel castors at the handle end and two fixed wheels at the far end,
 * which is the arrangement that actually steers; four swivels would be a
 * shopping trolley and four fixed would not turn. The handle folds, so it is
 * modelled as its own assembly with a real pivot rather than welded upright.
 *
 * Its deck is scarred: the cart is the one prop in the wave that takes a beating
 * from every other prop in the wave.
 */

const LENGTH = 1.32
const WIDTH = 0.76
const DECK = 0.32
const WHEEL = 0.09

interface CartSockets {
  deck_centre: Object3D
  handle_grip: Object3D
  tow_eye: Object3D
}

export type CartState = 'ready' | 'stowed'

export interface FreightCartController {
  root: Group
  parts: { chassis: Group; handle: Group }
  sockets: CartSockets
  readonly state: CartState
  setState(state: CartState): CartState
  update(deltaSeconds: number): void
  dispose(): void
}

function chassisBody(chassis: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  // Deck: a pressed pan with a raised lip and a non-slip field.
  box(chassis, m.shell, [LENGTH, 0.05, WIDTH], [0, DECK, 0], {
    chamfer: 0.07, fillet: 0.024, bevel: 0.014, capChamfer: 0.03,
  })
  const lipFace = WIDTH * 0.5 - 0.02 + 0.0175
  for (const sz of [-1, 1]) {
    box(chassis, m.shellShade, [LENGTH, 0.045, 0.035], [0, DECK + 0.04, sz * (WIDTH * 0.5 - 0.02)], {
      chamfer: 0.014, fillet: 0.006, bevel: 0.005,
    })
  }
  box(chassis, m.shellShade, [LENGTH - 0.18, 0.014, WIDTH - 0.16], [0, DECK + 0.031, 0], {
    chamfer: 0.05, fillet: 0.018, bevel: 0.008,
  })
  for (let index = 0; index < 7; index += 1) {
    const x = (index / 6 - 0.5) * (LENGTH - 0.3)
    seam(chassis, m.shellShade, WIDTH - 0.24, [x, DECK + 0.038, 0], 'top', 'along', 0.02, 0.011)
  }

  // Under-frame: two longitudinal rails and three cross members.
  for (const sz of [-1, 1]) {
    tubeSection(chassis, m.graphite, [0.06, 0.07], 0.01, LENGTH - 0.06, [0, DECK - 0.055, sz * (WIDTH * 0.5 - 0.08)], [0, Math.PI / 2, 0])
  }
  for (const x of [-LENGTH * 0.34, 0, LENGTH * 0.34]) {
    box(chassis, m.graphiteEdge, [0.06, 0.05, WIDTH - 0.18], [x, DECK - 0.055, 0], {
      chamfer: 0.018, fillet: 0.007, bevel: 0.006,
    })
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      member(chassis, m.graphiteEdge, [sx * LENGTH * 0.34, DECK - 0.055, sz * 0.2], [sx * (LENGTH * 0.5 - 0.06), DECK - 0.055, sz * (WIDTH * 0.5 - 0.08)], 0.03, 0.03)
    }
  }

  // Corner bumpers at deck height, the part that actually meets a door frame.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(chassis, m.rubber, [0.1, 0.06, 0.1], [
        sx * (LENGTH * 0.5 - 0.03), DECK + 0.02, sz * (WIDTH * 0.5 - 0.03),
      ], { chamfer: 0.03, fillet: 0.011, bevel: 0.008 })
    }
  }

  // Two swivel castors at the handle end, two fixed wheels at the far end.
  for (const sz of [-1, 1]) {
    castor(chassis, m, [-LENGTH * 0.5 + 0.14, WHEEL, sz * (WIDTH * 0.5 - 0.1)], WHEEL, sz * 0.35)
    const x = LENGTH * 0.5 - 0.14
    // The bracket runs from the axle up into the rail, whose underside is at
    // 0.23: at the height it was drawn it stopped 10 mm below that and carried
    // the wheel on nothing.
    box(chassis, m.graphite, [0.09, 0.17, 0.11], [x, WHEEL + 0.075, sz * (WIDTH * 0.5 - 0.1)], {
      chamfer: 0.026, fillet: 0.009, bevel: 0.008,
    })
    // Fixed wheels roll along the cart's length, so their axle runs across it.
    chassis.add(cylinder(m.rubber, WHEEL, 0.055, [x, WHEEL, sz * (WIDTH * 0.5 - 0.1)], AXIS_Z, 14))
    chassis.add(cylinder(m.steel, WHEEL * 0.44, 0.062, [x, WHEEL, sz * (WIDTH * 0.5 - 0.1)], AXIS_Z, 10))
  }

  // Tow eye at the fixed end, so the cart can be trained behind a tug. It hangs
  // off the deck pan, so it laps 20 mm into it rather than stopping short.
  box(chassis, m.graphiteEdge, [0.11, 0.09, 0.07], [LENGTH * 0.5 - 0.02, DECK - 0.05, 0], {
    chamfer: 0.024, fillet: 0.009, bevel: 0.007,
  })
  chassis.add(cylinder(m.steel, 0.03, 0.05, [LENGTH * 0.5 + 0.04, DECK - 0.05, 0], AXIS_X, 10))

  // The non-slip field's top face is 0.358, the same face the deck seams are cut
  // into, so everything laid on the deck is placed from there.
  const label = addLabelDecal(bundle, { variant: 200 })
  plaque(chassis, m, label, [0.22, 0.08], [LENGTH * 0.34, DECK + 0.038, 0.2], 'top', m.shellLight)
  statusLens(chassis, m, [0.05, 0.02], [LENGTH * 0.34, DECK + 0.038, -0.2], m.cyan, 'top')
  // The hazard band spans the deck edge and the lip above it. Seated on the lip
  // face it bites 3 mm into the lip and 5.5 mm into the pan, which stands
  // proud of it; seated where it was, it stood 5.5 mm clear of both.
  const stripe = addStripeDecal(bundle, { count: 6, lean: 1 })
  plaque(chassis, m, stripe, [0.5, 0.04], [0, DECK + 0.02, lipFace], 'front', m.ink)
  paintMark(chassis, m.amberPaint, slashProfile(0.05, 0.09, 0.45), [-LENGTH * 0.34, DECK + 0.038, 0.16], 'top', 0.009)
  for (const sx of [-1, 1]) bolt(chassis, m.steel, [sx * LENGTH * 0.42, DECK + 0.038, 0], 0.014, 'top')
}

/** Folding push handle: two stiles, a grip bar, and a pivot clamp per side. */
function handleBody(handle: Group, m: CargoMaterials): void {
  for (const sz of [-1, 1]) {
    const z = sz * (WIDTH * 0.5 - 0.1)
    tubeSection(handle, m.shell, [0.045, 0.045], 0.008, 0.72, [0, 0.36, z], [Math.PI / 2, 0, 0])
    // The handle folds about Z, so the clamp barrel and its pin lie on Z too.
    handle.add(cylinder(m.graphiteEdge, 0.045, 0.06, [0, 0.02, z], AXIS_Z, 10))
    handle.add(cylinder(m.amberPaint, 0.026, 0.075, [0, 0.02, z], AXIS_Z, 8))
  }
  // Grip and brace both span the two stiles at z +/- 0.28, which is the axis
  // they are separated along; on X they ran fore and aft between them, touching
  // neither.
  handle.add(cylinder(m.rubber, 0.025, WIDTH - 0.14, [0, 0.71, 0], AXIS_Z, 12))
  box(handle, m.shellShade, [0.03, 0.05, WIDTH - 0.2], [0, 0.42, 0], {
    chamfer: 0.012, fillet: 0.005, bevel: 0.005,
  })
}

function build(): {
  root: Group
  chassis: Group
  handle: Group
  sockets: CartSockets
  bundle: CargoMaterialBundle
} {
  const bundle = acquireCargoMaterials(59_000, { condition: 0.8 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_FREIGHT-CART_ROOT_READY'
  const chassis = new Group()
  chassis.name = 'AXR_CARGO_FREIGHT-CART_PART_CHASSIS_DEFAULT'
  const handle = new Group()
  handle.name = 'AXR_CARGO_FREIGHT-CART_PART_HANDLE_UPRIGHT'
  root.add(chassis, handle)

  chassisBody(chassis, m, bundle)
  handle.position.set(-LENGTH * 0.5 + 0.1, DECK + 0.03, 0)
  handleBody(handle, m)

  const sockets: CartSockets = {
    deck_centre: socket('deck_centre', [0, DECK + 0.04, 0]),
    handle_grip: socket('handle_grip', [-LENGTH * 0.5 + 0.1, DECK + 0.74, 0]),
    tow_eye: socket('tow_eye', [LENGTH * 0.5 + 0.06, DECK - 0.05, 0]),
  }
  return { root, chassis, handle, sockets, bundle }
}

export function createModel(): FreightCartController {
  const { root, chassis, handle, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'freight-cart',
    assemblies: [handle],
    reach: 0.12,
    sockets: Object.values(sockets),
  })

  let state: CartState = 'ready'
  let blend = 0
  let elapsed = 0
  const applyBlend = (): void => {
    handle.rotation.z = -blend * 1.5
    handle.name = blend > 0.02
      ? 'AXR_CARGO_FREIGHT-CART_PART_HANDLE_FOLDED'
      : 'AXR_CARGO_FREIGHT-CART_PART_HANDLE_UPRIGHT'
  }

  return {
    root,
    parts: { chassis, handle },
    sockets,
    get state() {
      return state
    },
    setState: (next: CartState) => {
      state = next
      root.name = next === 'stowed'
        ? 'AXR_CARGO_FREIGHT-CART_ROOT_STOWED'
        : 'AXR_CARGO_FREIGHT-CART_ROOT_READY'
      blend = next === 'stowed' ? 1 : 0
      applyBlend()
      return state
    },
    update: (deltaSeconds: number) => {
      const step = Math.min(Math.max(deltaSeconds, 0), 0.05)
      elapsed += step
      const target = state === 'stowed' ? 1 : 0
      if (Math.abs(target - blend) > 1e-4) {
        blend += Math.sign(target - blend) * Math.min(Math.abs(target - blend), step * 0.9)
        applyBlend()
      }
      bundle.materials.cyan.emissiveIntensity = 1.5 + Math.sin(elapsed * 1.9) * 0.2
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: CartState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'ready')
  return createCargoPreview(model, {
    target: [0, DECK + 0.14, 0],
    distance: 3.5,
    yaw: 0.78,
    pitch: 0.3,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createStowedPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'stowed' })
