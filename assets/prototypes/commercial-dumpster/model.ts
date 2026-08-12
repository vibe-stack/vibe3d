import { Group, Object3D } from 'three/webgpu'

import { cylinder, extrudeProfile, type Vec2 } from '../../../src/asset-forge/generator/index.ts'
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
 * Axiom Relay commercial waste bin — a lidded four-wheel dumpster.
 *
 * The street-side counterpart to the industrial skip, and it is deliberately the
 * opposite object in every way that matters: closed lids instead of an open
 * load, castors instead of rollers, trunnion bars instead of a lifting eye, and
 * a sloped back so it tips cleanly into a rear-loader.
 *
 * One lid is left ajar with a bag caught under it. That single asymmetry is what
 * stops a pair of these reading as two copies of one mesh.
 */

const LENGTH = 1.42
const WIDTH = 1.0
const HEIGHT = 1.16
const SLOPE = 0.16
const WHEEL = 0.1

interface BinSockets {
  lid_hinge: Object3D
  trunnion_left: Object3D
  trunnion_right: Object3D
  foot_pedal: Object3D
}

export type BinState = 'closed' | 'ajar'

export interface CommercialBinController {
  root: Group
  parts: { body: Group; lidLeft: Group; lidRight: Group }
  sockets: BinSockets
  readonly state: BinState
  setState(state: BinState): BinState
  update(deltaSeconds: number): void
  dispose(): void
}

/** Side elevation: vertical front, sloped back, flat floor. */
function sideProfile(): Vec2[] {
  return [
    [-LENGTH * 0.5, 0],
    [LENGTH * 0.5, 0],
    [LENGTH * 0.5, HEIGHT],
    [-LENGTH * 0.5 + SLOPE, HEIGHT],
  ]
}

function bodyBuild(body: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  for (const sz of [-1, 1]) {
    body.add(extrudeProfile(m.shell, sideProfile(), 0.05, [0, 0, sz * (WIDTH * 0.5 - 0.025)], {
      fillet: 0.035, bevel: 0.024,
    }))
  }
  box(body, m.shell, [0.05, HEIGHT, WIDTH - 0.06], [LENGTH * 0.5 - 0.025, HEIGHT * 0.5, 0], {
    chamfer: 0.04, fillet: 0.014, bevel: 0.012,
  })
  const slant = Math.atan2(SLOPE, HEIGHT)
  box(body, m.shell, [0.05, Math.hypot(HEIGHT, SLOPE), WIDTH - 0.06], [
    -LENGTH * 0.5 + SLOPE * 0.5, HEIGHT * 0.5, 0,
  ], { chamfer: 0.04, fillet: 0.014, bevel: 0.012, rotation: [0, 0, -slant] })
  box(body, m.graphiteEdge, [LENGTH, 0.07, WIDTH], [0, 0.035, 0], {
    chamfer: 0.035, fillet: 0.013, bevel: 0.011,
  })

  // Pressed panel field on both flanks: three shallow pans between ribs.
  for (const sz of [-1, 1]) {
    const z = sz * (WIDTH * 0.5 + 0.004)
    for (let index = 0; index < 3; index += 1) {
      box(body, m.shellShade, [LENGTH * 0.26, HEIGHT * 0.52, 0.018], [
        (index - 1) * LENGTH * 0.3 + 0.02, HEIGHT * 0.46, z,
      ], { chamfer: 0.045, fillet: 0.016, bevel: 0.009 })
    }
    box(body, m.graphite, [LENGTH - 0.06, 0.07, 0.035], [0.02, HEIGHT * 0.8, z], {
      chamfer: 0.018, fillet: 0.007, bevel: 0.006,
    })
    seam(body, m.shell, LENGTH - 0.16, [0.02, HEIGHT * 0.14, z], sz > 0 ? 'front' : 'back', 'across', 0.022, 0.013)
  }

  // Trunnion bars: the pins a rear-loader's arms hook under.
  for (const sz of [-1, 1]) {
    box(body, m.graphite, [0.14, 0.12, 0.07], [LENGTH * 0.5 - 0.06, HEIGHT * 0.62, sz * (WIDTH * 0.5 + 0.03)], {
      chamfer: 0.028, fillet: 0.01, bevel: 0.008,
    })
    body.add(cylinder(m.steel, 0.028, 0.18, [LENGTH * 0.5 - 0.06, HEIGHT * 0.62, sz * (WIDTH * 0.5 + 0.1)], AXIS_Z, 10))
    body.add(cylinder(m.graphiteEdge, 0.042, 0.03, [LENGTH * 0.5 - 0.06, HEIGHT * 0.62, sz * (WIDTH * 0.5 + 0.18)], AXIS_Z, 10))
  }

  // Two swivel castors at the front, two fixed at the back, all with brakes.
  for (const sz of [-1, 1]) {
    castor(body, m, [LENGTH * 0.5 - 0.16, WHEEL, sz * (WIDTH * 0.5 - 0.14)], WHEEL, sz * 0.3)
    const x = -LENGTH * 0.5 + 0.2
    box(body, m.graphite, [0.1, 0.14, 0.1], [x, WHEEL + 0.06, sz * (WIDTH * 0.5 - 0.14)], {
      chamfer: 0.026, fillet: 0.01, bevel: 0.008,
    })
    body.add(cylinder(m.rubber, WHEEL, 0.06, [x, WHEEL, sz * (WIDTH * 0.5 - 0.14)], AXIS_X, 14))
    body.add(cylinder(m.steel, WHEEL * 0.42, 0.068, [x, WHEEL, sz * (WIDTH * 0.5 - 0.14)], AXIS_X, 10))
    box(body, m.amberPaint, [0.06, 0.03, 0.05], [x + 0.07, WHEEL * 0.5, sz * (WIDTH * 0.5 - 0.14)], {
      chamfer: 0.01, fillet: 0.004, bevel: 0.004,
    })
  }

  // Foot pedal linkage on the front face.
  box(body, m.graphiteEdge, [0.05, HEIGHT * 0.7, 0.05], [LENGTH * 0.5 + 0.03, HEIGHT * 0.42, 0.26], {
    chamfer: 0.014, fillet: 0.005, bevel: 0.005,
  })
  box(body, m.amberPaint, [0.16, 0.035, 0.09], [LENGTH * 0.5 + 0.08, 0.11, 0.26], {
    chamfer: 0.014, fillet: 0.006, bevel: 0.005, rotation: [0, 0, -0.14],
  })
  body.add(cylinder(m.steel, 0.014, 0.14, [LENGTH * 0.5 + 0.03, 0.16, 0.26], AXIS_Z, 8))

  const label = addLabelDecal(bundle, { variant: 340 })
  plaque(body, m, label, [0.3, 0.12], [-0.1, HEIGHT * 0.62, WIDTH * 0.5 + 0.016], 'front', m.shellLight)
  const stripe = addStripeDecal(bundle, { count: 5, lean: 1 })
  plaque(body, m, stripe, [0.44, 0.08], [0.1, HEIGHT * 0.16, WIDTH * 0.5 + 0.016], 'front', m.ink)
  paintMark(body, m.amberPaint, slashProfile(0.08, 0.24, 0.42), [0.34, HEIGHT * 0.5, WIDTH * 0.5 + 0.016], 'front', 0.011)
  statusLens(body, m, [0.05, 0.02], [-0.42, HEIGHT * 0.62, WIDTH * 0.5 + 0.016], m.cyan, 'front')
  for (const sz of [-1, 1]) bolt(body, m.steel, [0.02, HEIGHT * 0.8, sz * (WIDTH * 0.5 + 0.024)], 0.015, sz > 0 ? 'front' : 'back')
}

/** One lid leaf, hinged along the bin's back edge. */
function lidBuild(lid: Group, m: CargoMaterials, side: -1 | 1): void {
  const leaf = WIDTH * 0.5 - 0.01
  const centre = side * leaf * 0.5
  box(lid, m.shellLight, [LENGTH - SLOPE + 0.06, 0.05, leaf], [SLOPE * 0.5, 0.025, centre], {
    chamfer: 0.045, fillet: 0.016, bevel: 0.012, capChamfer: 0.028,
  })
  box(lid, m.shellShade, [LENGTH - SLOPE - 0.16, 0.02, leaf - 0.14], [SLOPE * 0.5, 0.055, centre], {
    chamfer: 0.04, fillet: 0.014, bevel: 0.008,
  })
  box(lid, m.graphiteEdge, [0.18, 0.035, 0.06], [LENGTH * 0.5 - 0.14, 0.06, centre], {
    chamfer: 0.014, fillet: 0.005, bevel: 0.005,
  })
  for (const x of [-LENGTH * 0.18, LENGTH * 0.22]) {
    lid.add(cylinder(m.steel, 0.016, 0.1, [x, 0.01, centre], AXIS_Z, 8))
  }
}

function build(): {
  root: Group
  body: Group
  lidLeft: Group
  lidRight: Group
  sockets: BinSockets
  bundle: CargoMaterialBundle
} {
  const bundle = acquireCargoMaterials(62_200, { condition: 0.88 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_STREETS_COMMERCIAL-DUMPSTER_ROOT_CLOSED'
  const body = new Group()
  body.name = 'AXR_STREETS_COMMERCIAL-DUMPSTER_PART_BODY_DEFAULT'
  const lidLeft = new Group()
  lidLeft.name = 'AXR_STREETS_COMMERCIAL-DUMPSTER_PART_LID-LEFT_CLOSED'
  const lidRight = new Group()
  lidRight.name = 'AXR_STREETS_COMMERCIAL-DUMPSTER_PART_LID-RIGHT_AJAR'
  root.add(body, lidLeft, lidRight)

  bodyBuild(body, m, bundle)
  for (const [lid, side] of [[lidLeft, 1], [lidRight, -1]] as const) {
    lid.position.set(0, HEIGHT, -side * 0.005)
    lidBuild(lid, m, side)
  }
  // A bag caught under the ajar lid, which is why that lid does not close.
  box(body, m.fabric, [0.3, 0.22, 0.26], [0.1, HEIGHT + 0.04, -WIDTH * 0.26], {
    chamfer: 0.09, fillet: 0.03, bevel: 0.014, rotation: [0.1, 0.4, -0.12],
  })

  const sockets: BinSockets = {
    lid_hinge: socket('lid_hinge', [0, HEIGHT, 0]),
    trunnion_left: socket('trunnion_left', [LENGTH * 0.5 - 0.06, HEIGHT * 0.62, -(WIDTH * 0.5 + 0.14)]),
    trunnion_right: socket('trunnion_right', [LENGTH * 0.5 - 0.06, HEIGHT * 0.62, WIDTH * 0.5 + 0.14]),
    foot_pedal: socket('foot_pedal', [LENGTH * 0.5 + 0.14, 0.11, 0.26]),
  }
  return { root, body, lidLeft, lidRight, sockets, bundle }
}

export function createModel(): CommercialBinController {
  const { root, body, lidLeft, lidRight, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'commercial-dumpster',
    assemblies: [lidLeft, lidRight],
    reach: 0.16,
    sockets: Object.values(sockets),
  })

  let state: BinState = 'ajar'
  let blend = 1
  let elapsed = 0
  const applyBlend = (): void => {
    // Only the right lid moves; the left one stays shut, which is the whole
    // point of the asymmetry.
    lidRight.rotation.z = -blend * 0.34
    lidRight.name = blend > 0.05
      ? 'AXR_STREETS_COMMERCIAL-DUMPSTER_PART_LID-RIGHT_AJAR'
      : 'AXR_STREETS_COMMERCIAL-DUMPSTER_PART_LID-RIGHT_CLOSED'
  }
  applyBlend()

  return {
    root,
    parts: { body, lidLeft, lidRight },
    sockets,
    get state() {
      return state
    },
    setState: (next: BinState) => {
      state = next
      root.name = next === 'ajar'
        ? 'AXR_STREETS_COMMERCIAL-DUMPSTER_ROOT_AJAR'
        : 'AXR_STREETS_COMMERCIAL-DUMPSTER_ROOT_CLOSED'
      blend = next === 'ajar' ? 1 : 0
      applyBlend()
      return state
    },
    update: (deltaSeconds: number) => {
      const step = Math.min(Math.max(deltaSeconds, 0), 0.05)
      elapsed += step
      const target = state === 'ajar' ? 1 : 0
      if (Math.abs(target - blend) > 1e-4) {
        blend += Math.sign(target - blend) * Math.min(Math.abs(target - blend), step * 1.2)
        applyBlend()
      }
      bundle.materials.cyan.emissiveIntensity = 1.45 + Math.sin(elapsed * 1.1) * 0.18
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: BinState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'ajar')
  return createCargoPreview(model, {
    target: [0, HEIGHT * 0.52, 0],
    distance: 4.6,
    yaw: 0.8,
    pitch: 0.3,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createClosedPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'closed' })
