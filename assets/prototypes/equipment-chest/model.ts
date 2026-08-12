import { Group, Object3D } from 'three/webgpu'

import { cylinder, prism } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  AXIS_Z,
  acquireCargoMaterials,
  addLabelDecal,
  addStripeDecal,
  box,
  boltRun,
  createCargoPreview,
  finishModel,
  paintMark,
  plaque,
  recessedHandle,
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
 * Axiom Relay equipment chest — a standing tool chest with drawers.
 *
 * The only asset in the wave that opens *toward* the operator instead of
 * upward, which is what stops the crate family from becoming monotonous. Five
 * drawer fronts at different depths, a lidded top well, a locking bar down the
 * face, and a plinth with levelling feet.
 *
 * The drawers are separate assemblies with their own transforms, so a dresser
 * can pull one out to make a chest look worked without editing geometry.
 */

const WIDTH = 0.96
const DEPTH = 0.56
const HEIGHT = 1.06
const PLINTH = 0.12
const TOP = 0.14

interface ChestSockets {
  drawer_top: Object3D
  drawer_mid: Object3D
  top_well: Object3D
  lock_bar: Object3D
}

export type ChestState = 'closed' | 'worked'

export interface EquipmentChestController {
  root: Group
  parts: { body: Group; drawers: Group[] }
  sockets: ChestSockets
  readonly state: ChestState
  setState(state: ChestState): ChestState
  update(deltaSeconds: number): void
  dispose(): void
}

const DRAWERS = [0.1, 0.1, 0.14, 0.18, 0.22]

function drawerFront(drawer: Group, m: CargoMaterials, height: number, index: number): void {
  box(drawer, m.shellLight, [WIDTH - 0.08, height - 0.012, 0.05], [0, 0, DEPTH * 0.5 - 0.02], {
    chamfer: 0.028, fillet: 0.01, bevel: 0.009, capChamfer: [0.018, 0],
  })
  box(drawer, m.shellShade, [WIDTH - 0.24, height - 0.05, 0.02], [0, 0, DEPTH * 0.5 + 0.012], {
    chamfer: 0.02, fillet: 0.008, bevel: 0.006,
  })
  // Full-width pull, recessed into the front so a closed chest stays flush.
  box(drawer, m.ink, [WIDTH - 0.3, height * 0.34, 0.03], [0, height * 0.18, DEPTH * 0.5 + 0.016], {
    chamfer: 0.016, fillet: 0.006, bevel: 0.005,
  })
  box(drawer, m.graphiteEdge, [WIDTH - 0.34, height * 0.16, 0.026], [0, height * 0.18, DEPTH * 0.5 + 0.03], {
    chamfer: 0.01, fillet: 0.004, bevel: 0.004,
  })
  // The box behind the front, so an open drawer is not a floating panel.
  box(drawer, m.shellShade, [WIDTH - 0.14, height - 0.03, DEPTH - 0.1], [0, 0, 0.02], {
    chamfer: 0.02, fillet: 0.008, bevel: 0.007,
  })
  box(drawer, m.ink, [WIDTH - 0.2, height - 0.07, DEPTH - 0.16], [0, 0.012, 0.02], {
    chamfer: 0.016, fillet: 0.006, bevel: 0.005,
  })
  if (index === 1) {
    box(drawer, m.amberPaint, [0.07, height * 0.3, 0.022], [WIDTH * 0.5 - 0.11, -height * 0.18, DEPTH * 0.5 + 0.026], {
      chamfer: 0.008, fillet: 0.004, bevel: 0.003,
    })
  }
}

function body(bodyGroup: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  const caseHeight = HEIGHT - PLINTH - TOP
  const caseY = PLINTH + caseHeight * 0.5

  box(bodyGroup, m.graphite, [WIDTH - 0.04, PLINTH, DEPTH - 0.04], [0, PLINTH * 0.5, 0], {
    chamfer: 0.045, fillet: 0.016, bevel: 0.012, capChamfer: 0.028,
  })
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      bodyGroup.add(cylinder(m.steel, 0.026, 0.05, [
        sx * (WIDTH * 0.5 - 0.1), 0.025, sz * (DEPTH * 0.5 - 0.1),
      ], [0, 0, 0], 8))
      bodyGroup.add(cylinder(m.rubber, 0.036, 0.02, [
        sx * (WIDTH * 0.5 - 0.1), 0.01, sz * (DEPTH * 0.5 - 0.1),
      ], [0, 0, 0], 8))
    }
  }

  // Carcass: open at the front, so the drawers sit in a real cavity.
  for (const sx of [-1, 1]) {
    box(bodyGroup, m.shell, [0.05, caseHeight, DEPTH], [sx * (WIDTH * 0.5 - 0.025), caseY, 0], {
      chamfer: 0.045, fillet: 0.016, bevel: 0.014,
    })
  }
  box(bodyGroup, m.shell, [WIDTH, caseHeight, 0.05], [0, caseY, -(DEPTH * 0.5 - 0.025)], {
    chamfer: 0.045, fillet: 0.016, bevel: 0.014,
  })
  box(bodyGroup, m.ink, [WIDTH - 0.1, caseHeight - 0.04, DEPTH - 0.1], [0, caseY, -0.02], {
    chamfer: 0.03, fillet: 0.012, bevel: 0.008,
  })

  // Top well with its own lid band.
  box(bodyGroup, m.shellLight, [WIDTH, TOP, DEPTH], [0, HEIGHT - TOP * 0.5, 0], {
    chamfer: 0.055, fillet: 0.02, bevel: 0.016, capChamfer: 0.035,
  })
  box(bodyGroup, m.ink, [WIDTH - 0.22, 0.024, DEPTH - 0.18], [0, HEIGHT - 0.006, 0], {
    chamfer: 0.05, fillet: 0.016, bevel: 0.01,
  })
  seam(bodyGroup, m.shellLight, DEPTH - 0.12, [0, HEIGHT, 0], 'top', 'along', 0.026, 0.014)
  for (const sx of [-1, 1]) {
    recessedHandle(bodyGroup, m, [0.24, 0.09], [sx * (WIDTH * 0.5 + 0.004), HEIGHT - TOP * 0.5, 0], sx > 0 ? 'right' : 'left')
  }

  // Locking bar down the face, hinged at the plinth and latched at the top.
  const barX = WIDTH * 0.5 - 0.07
  bodyGroup.add(prism(m.graphiteEdge, [0.055, HEIGHT - PLINTH - 0.05, 0.045], [barX, PLINTH + (HEIGHT - PLINTH) * 0.5 - 0.02, DEPTH * 0.5 + 0.055], {
    chamfer: 0.016, fillet: 0.006, bevel: 0.006,
  }))
  box(bodyGroup, m.amberPaint, [0.075, 0.11, 0.05], [barX, HEIGHT - 0.26, DEPTH * 0.5 + 0.07], {
    chamfer: 0.018, fillet: 0.007, bevel: 0.006,
  })
  bodyGroup.add(cylinder(m.steel, 0.014, 0.09, [barX, HEIGHT - 0.26, DEPTH * 0.5 + 0.1], AXIS_Z, 8))
  bodyGroup.add(cylinder(m.steel, 0.016, 0.07, [barX, PLINTH + 0.05, DEPTH * 0.5 + 0.055], AXIS_X, 8))

  const label = addLabelDecal(bundle, { variant: 180 })
  plaque(bodyGroup, m, label, [0.26, 0.1], [-WIDTH * 0.5 + 0.24, HEIGHT - TOP - 0.02, DEPTH * 0.5 + 0.006], 'front', m.shellLight)
  statusLens(bodyGroup, m, [0.05, 0.02], [-WIDTH * 0.5 + 0.24, HEIGHT - 0.05, DEPTH * 0.5 + 0.006], m.cyan, 'front')
  const stripe = addStripeDecal(bundle, { count: 4, lean: 1 })
  plaque(bodyGroup, m, stripe, [0.4, 0.06], [0, PLINTH * 0.5, DEPTH * 0.5 + 0.006], 'front', m.ink)
  paintMark(bodyGroup, m.amberPaint, slashProfile(0.05, 0.11, 0.45), [-WIDTH * 0.5 + 0.1, HEIGHT * 0.5, -(DEPTH * 0.5 + 0.002)], 'back', 0.009)
  boltRun(bodyGroup, m.steel, [-WIDTH * 0.3, HEIGHT * 0.35, -(DEPTH * 0.5 + 0.002)], [WIDTH * 0.3, HEIGHT * 0.35, -(DEPTH * 0.5 + 0.002)], 4, 0.014, 'back')
}

function build(): { root: Group; bodyGroup: Group; drawers: Group[]; sockets: ChestSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(58_600, { condition: 0.58 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_EQUIPMENT-CHEST_ROOT_CLOSED'
  const bodyGroup = new Group()
  bodyGroup.name = 'AXR_CARGO_EQUIPMENT-CHEST_PART_BODY_DEFAULT'
  root.add(bodyGroup)
  body(bodyGroup, m, bundle)

  const drawers: Group[] = []
  let cursor = PLINTH + 0.03
  for (const [index, height] of DRAWERS.entries()) {
    const drawer = new Group()
    drawer.name = `AXR_CARGO_EQUIPMENT-CHEST_PART_DRAWER-${index + 1}_CLOSED`
    drawer.position.set(0, cursor + height * 0.5, 0)
    root.add(drawer)
    drawerFront(drawer, m, height, index)
    drawers.push(drawer)
    cursor += height
  }

  const sockets: ChestSockets = {
    drawer_top: socket('drawer_top', [0, PLINTH + DRAWERS[0] * 0.5, DEPTH * 0.5 + 0.1]),
    drawer_mid: socket('drawer_mid', [0, PLINTH + 0.34, DEPTH * 0.5 + 0.1]),
    top_well: socket('top_well', [0, HEIGHT + 0.04, 0]),
    lock_bar: socket('lock_bar', [WIDTH * 0.5 - 0.07, HEIGHT - 0.26, DEPTH * 0.5 + 0.14]),
  }
  return { root, bodyGroup, drawers, sockets, bundle }
}

export function createModel(): EquipmentChestController {
  const { root, bodyGroup, drawers, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'equipment-chest',
    assemblies: drawers,
    reach: 0.12,
    sockets: Object.values(sockets),
  })

  let state: ChestState = 'closed'
  let blend = 0
  let elapsed = 0
  // Only two drawers open, at different extents. A chest with every drawer out
  // reads as vandalised; two reads as somebody working.
  const pull = [0, 0.26, 0, 0.13, 0]
  const applyBlend = (): void => {
    for (const [index, drawer] of drawers.entries()) {
      drawer.position.z = pull[index] * blend
      drawer.name = `AXR_CARGO_EQUIPMENT-CHEST_PART_DRAWER-${index + 1}_${pull[index] * blend > 0.02 ? 'OPEN' : 'CLOSED'}`
    }
  }

  return {
    root,
    parts: { body: bodyGroup, drawers },
    sockets,
    get state() {
      return state
    },
    setState: (next: ChestState) => {
      state = next
      root.name = next === 'worked'
        ? 'AXR_CARGO_EQUIPMENT-CHEST_ROOT_WORKED'
        : 'AXR_CARGO_EQUIPMENT-CHEST_ROOT_CLOSED'
      blend = next === 'worked' ? 1 : 0
      applyBlend()
      return state
    },
    update: (deltaSeconds: number) => {
      const step = Math.min(Math.max(deltaSeconds, 0), 0.05)
      elapsed += step
      const target = state === 'worked' ? 1 : 0
      if (Math.abs(target - blend) > 1e-4) {
        blend += Math.sign(target - blend) * Math.min(Math.abs(target - blend), step * 1.6)
        applyBlend()
      }
      bundle.materials.cyan.emissiveIntensity = 1.6 + Math.sin(elapsed * 1.8) * 0.2
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: ChestState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'closed')
  return createCargoPreview(model, {
    target: [0, HEIGHT * 0.5, 0],
    distance: 3.3,
    yaw: 0.72,
    pitch: 0.26,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createWorkedPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'worked' })
