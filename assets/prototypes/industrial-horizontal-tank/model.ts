import { Group, Object3D } from 'three/webgpu'

import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  AXIS_Y,
  AXIS_Z,
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
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay horizontal process tank on saddles.
 *
 * The lying-down counterpart to the vertical tank, and it needs a completely
 * different support story: two saddle cradles on a plinth, a slotted anchor at
 * one end so the shell can grow when it heats, and a fixed anchor at the other.
 * That sliding saddle is the detail that says "this gets hot" without a single
 * warning decal.
 *
 * Dished ends are two stepped discs each. A hemispherical cap is invisible at
 * the distances this prop is used and costs several times the triangles.
 */

const RADIUS = 0.72
const BARREL = 3.1
const PLINTH = 0.16
const SADDLE = 0.44

interface HorizontalTankSockets {
  manway: Object3D
  inlet: Object3D
  drain: Object3D
  gauge: Object3D
}

export type HorizontalTankState = 'live' | 'isolated'

export interface HorizontalTankController {
  root: Group
  sockets: HorizontalTankSockets
  readonly state: HorizontalTankState
  setState(state: HorizontalTankState): HorizontalTankState
  update(deltaSeconds: number): void
  dispose(): void
}

const AXIS_HEIGHT = PLINTH + SADDLE + RADIUS

/** One saddle cradle: a plinth block, a curved seat, and its anchor detail. */
function saddle(root: Group, m: CargoMaterials, x: number, sliding: boolean): void {
  box(root, m.graphite, [0.44, PLINTH, RADIUS * 2 + 0.3], [x, PLINTH * 0.5, 0], {
    chamfer: 0.05, fillet: 0.018, bevel: 0.012, capChamfer: 0.03,
  })
  box(root, m.shellShade, [0.34, SADDLE, RADIUS * 2 + 0.14], [x, PLINTH + SADDLE * 0.5, 0], {
    chamfer: 0.06, fillet: 0.022, bevel: 0.014,
  })
  // Seat: five short chords stepping around the shell, so the cradle reads
  // curved without a lathe.
  for (let index = 0; index < 5; index += 1) {
    const angle = -1.0 + index * 0.5
    box(root, m.graphiteEdge, [0.36, 0.08, 0.34], [
      x, AXIS_HEIGHT - Math.cos(angle) * (RADIUS + 0.03), Math.sin(angle) * (RADIUS + 0.03),
    ], { chamfer: 0.02, fillet: 0.008, bevel: 0.007, rotation: [angle, 0, 0] })
  }
  for (const sz of [-1, 1]) {
    member(root, m.shellShade, [x, PLINTH + 0.04, sz * (RADIUS + 0.1)], [x, PLINTH + SADDLE, sz * 0.16], 0.05, 0.28)
    // A slotted hole at the sliding end, a plain one at the fixed end.
    box(root, sliding ? m.ink : m.steel, [0.16, 0.03, sliding ? 0.16 : 0.09], [
      x, PLINTH + 0.02, sz * (RADIUS + 0.06),
    ], { chamfer: 0.02, fillet: 0.008, bevel: 0.006 })
    bolt(root, m.steel, [x, PLINTH + 0.035, sz * (RADIUS + 0.06)], 0.022, 'top')
  }
}

function build(): { root: Group; sockets: HorizontalTankSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(60_200, { condition: 0.7 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_INDUSTRIAL_HORIZONTAL-TANK_ROOT_LIVE'

  root.add(cylinder(m.shell, RADIUS, BARREL, [0, AXIS_HEIGHT, 0], AXIS_X, 24))
  for (const sx of [-1, 1]) {
    // Dished end: two stepped discs and a weld ring.
    root.add(cylinder(m.shellShade, RADIUS + 0.012, 0.06, [sx * BARREL * 0.5, AXIS_HEIGHT, 0], AXIS_X, 24))
    root.add(cylinder(m.shell, RADIUS * 0.88, 0.12, [sx * (BARREL * 0.5 + 0.06), AXIS_HEIGHT, 0], AXIS_X, 22))
    root.add(cylinder(m.shell, RADIUS * 0.58, 0.1, [sx * (BARREL * 0.5 + 0.15), AXIS_HEIGHT, 0], AXIS_X, 18))
  }
  // Girth welds and two longitudinal strakes.
  for (const fraction of [-0.28, 0.06, 0.34]) {
    root.add(cylinder(m.shellShade, RADIUS + 0.01, 0.045, [fraction * BARREL, AXIS_HEIGHT, 0], AXIS_X, 24))
  }
  for (const angle of [0.7, 2.4]) {
    box(root, m.shellShade, [BARREL - 0.3, 0.04, 0.022], [
      0, AXIS_HEIGHT + Math.cos(angle) * (RADIUS + 0.006), Math.sin(angle) * (RADIUS + 0.006),
    ], { chamfer: 0.01, fillet: 0.004, bevel: 0.004, rotation: [angle, 0, 0] })
  }

  saddle(root, m, -BARREL * 0.3, false)
  saddle(root, m, BARREL * 0.3, true)

  // Crown furniture: a bolted manway, an inlet nozzle, and a relief valve.
  const crown = AXIS_HEIGHT + RADIUS
  root.add(cylinder(m.graphiteEdge, 0.28, 0.1, [-0.5, crown + 0.03, 0], AXIS_Y, 16))
  root.add(cylinder(m.shellLight, 0.24, 0.07, [-0.5, crown + 0.1, 0], AXIS_Y, 16))
  for (let index = 0; index < 8; index += 1) {
    const angle = (Math.PI / 4) * index
    bolt(root, m.steel, [-0.5 + Math.sin(angle) * 0.25, crown + 0.09, Math.cos(angle) * 0.25], 0.017, 'top')
  }
  root.add(cylinder(m.steel, 0.09, 0.22, [0.55, crown + 0.1, 0], AXIS_Y, 12))
  root.add(cylinder(m.graphiteEdge, 0.13, 0.06, [0.55, crown + 0.22, 0], AXIS_Y, 12))
  root.add(cylinder(m.amberPaint, 0.06, 0.1, [0.55, crown + 0.3, 0], AXIS_Y, 8))
  root.add(cylinder(m.steel, 0.055, 0.3, [1.15, crown + 0.14, 0], AXIS_Y, 10))
  root.add(cylinder(m.ink, 0.075, 0.07, [1.15, crown + 0.31, 0], AXIS_Y, 10))

  // Instrument column and drain on the +Z flank.
  box(root, m.graphite, [0.2, 0.5, 0.07], [-1.2, AXIS_HEIGHT + 0.1, RADIUS + 0.02], {
    chamfer: 0.045, fillet: 0.016, bevel: 0.012,
  })
  statusLens(root, m, [0.11, 0.11], [-1.2, AXIS_HEIGHT + 0.2, RADIUS + 0.06], m.cyan, 'front')
  statusLens(root, m, [0.07, 0.04], [-1.2, AXIS_HEIGHT - 0.02, RADIUS + 0.06], m.amber, 'front')
  root.add(cylinder(m.steel, 0.05, 0.4, [1.3, AXIS_HEIGHT - RADIUS - 0.16, 0], AXIS_Y, 10))
  root.add(cylinder(m.orangePaint, 0.07, 0.05, [1.3, AXIS_HEIGHT - RADIUS - 0.36, 0], AXIS_Y, 6))
  root.add(cylinder(m.steel, 0.03, 0.16, [1.3, AXIS_HEIGHT - RADIUS - 0.3, 0.09], AXIS_Z, 8))

  const label = addLabelDecal(bundle, { variant: 240 })
  plaque(root, m, label, [0.46, 0.2], [0.3, AXIS_HEIGHT + 0.1, RADIUS + 0.008], 'front', m.ink)
  const stripe = addStripeDecal(bundle, { count: 6, lean: 1 })
  plaque(root, m, stripe, [0.4, 0.09], [-BARREL * 0.3, PLINTH * 0.6, RADIUS + 0.16], 'front', m.ink)
  paintMark(root, m.orangePaint, slashProfile(0.11, 0.34, 0.42), [-0.42, AXIS_HEIGHT - 0.34, RADIUS + 0.004], 'front', 0.012)
  paintMark(root, m.orangePaint, slashProfile(0.055, 0.34, 0.42), [-0.24, AXIS_HEIGHT - 0.34, RADIUS + 0.004], 'front', 0.012)

  const sockets: HorizontalTankSockets = {
    manway: socket('manway', [-0.5, crown + 0.2, 0]),
    inlet: socket('inlet', [0.55, crown + 0.4, 0]),
    drain: socket('drain', [1.3, AXIS_HEIGHT - RADIUS - 0.42, 0]),
    gauge: socket('gauge', [-1.2, AXIS_HEIGHT + 0.2, RADIUS + 0.14]),
  }
  return { root, sockets, bundle }
}

export function createModel(): HorizontalTankController {
  const { root, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'industrial-horizontal-tank',
    reach: 0.24,
    sockets: Object.values(sockets),
  })

  let state: HorizontalTankState = 'live'
  let elapsed = 0
  const applyState = (next: HorizontalTankState): HorizontalTankState => {
    state = next
    const live = next === 'live'
    bundle.materials.cyan.emissiveIntensity = live ? 1.7 : 0
    bundle.materials.amber.emissiveIntensity = live ? 2.1 : 0
    root.name = live
      ? 'AXR_INDUSTRIAL_HORIZONTAL-TANK_ROOT_LIVE'
      : 'AXR_INDUSTRIAL_HORIZONTAL-TANK_ROOT_ISOLATED'
    return state
  }

  return {
    root,
    sockets,
    get state() {
      return state
    },
    setState: applyState,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      if (state !== 'live') return
      bundle.materials.cyan.emissiveIntensity = 1.6 + Math.sin(elapsed * 1.4) * 0.2
      bundle.materials.amber.emissiveIntensity = 2.0 + Math.sin(elapsed * 2.6) * 0.24
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: HorizontalTankState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'live')
  return createCargoPreview(model, {
    target: [0, AXIS_HEIGHT * 0.85, 0],
    distance: 7.6,
    yaw: 0.78,
    pitch: 0.26,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createIsolatedPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'isolated' })
