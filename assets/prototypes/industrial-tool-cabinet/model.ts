import { Group, Object3D } from 'three/webgpu'

import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  AXIS_Y,
  acquireCargoMaterials,
  addLabelDecal,
  addStripeDecal,
  bolt,
  box,
  boltRun,
  createCargoPreview,
  finishModel,
  louvreVent,
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
 * Axiom Relay tool cabinet — a tall two-door floor cabinet.
 *
 * The workshop's wall of storage: full-height double doors on piano hinges, a
 * three-point espagnolette lock down the right leaf, adjustable shelves inside,
 * and a louvred lower panel so damp kit dries out. It stands on a plinth with
 * levelling feet rather than castors, because it is bolted to a wall in service.
 *
 * The doors are separate assemblies with their hinge lines at the outer edges,
 * so the cabinet can be dressed open with contents visible.
 */

const WIDTH = 0.92
const DEPTH = 0.46
const HEIGHT = 1.96
const PLINTH = 0.1

interface CabinetSockets {
  shelf_top: Object3D
  shelf_mid: Object3D
  handle: Object3D
  wall_anchor: Object3D
}

export type CabinetState = 'closed' | 'open'

export interface ToolCabinetController {
  root: Group
  parts: { body: Group; doorLeft: Group; doorRight: Group }
  sockets: CabinetSockets
  readonly state: CabinetState
  setState(state: CabinetState): CabinetState
  update(deltaSeconds: number): void
  dispose(): void
}

const SHELVES = [0.5, 0.9, 1.3, 1.66]

function bodyBuild(body: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  box(body, m.graphite, [WIDTH - 0.04, PLINTH, DEPTH - 0.04], [0, PLINTH * 0.5, 0], {
    chamfer: 0.04, fillet: 0.014, bevel: 0.011, capChamfer: 0.025,
  })
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      body.add(cylinder(m.steel, 0.02, 0.04, [
        sx * (WIDTH * 0.5 - 0.08), 0.02, sz * (DEPTH * 0.5 - 0.08),
      ], AXIS_Y, 8))
    }
  }

  const caseY = PLINTH + (HEIGHT - PLINTH) * 0.5
  for (const sx of [-1, 1]) {
    box(body, m.shell, [0.035, HEIGHT - PLINTH, DEPTH], [sx * (WIDTH * 0.5 - 0.018), caseY, 0], {
      chamfer: 0.03, fillet: 0.011, bevel: 0.01,
    })
  }
  box(body, m.shell, [WIDTH, HEIGHT - PLINTH, 0.035], [0, caseY, -(DEPTH * 0.5 - 0.018)], {
    chamfer: 0.03, fillet: 0.011, bevel: 0.01,
  })
  box(body, m.shellLight, [WIDTH, 0.05, DEPTH], [0, HEIGHT - 0.025, 0], {
    chamfer: 0.035, fillet: 0.013, bevel: 0.01, capChamfer: 0.022,
  })
  box(body, m.ink, [WIDTH - 0.09, HEIGHT - PLINTH - 0.08, DEPTH - 0.06], [0, caseY, -0.02], {
    chamfer: 0.025, fillet: 0.01, bevel: 0.008,
  })

  // Shelves on a punched pilaster, so the interior reads adjustable.
  for (const y of SHELVES) {
    box(body, m.shellShade, [WIDTH - 0.1, 0.02, DEPTH - 0.08], [0, y, -0.01], {
      chamfer: 0.02, fillet: 0.008, bevel: 0.006,
    })
    box(body, m.graphiteEdge, [WIDTH - 0.1, 0.03, 0.02], [0, y + 0.02, DEPTH * 0.5 - 0.06], {
      chamfer: 0.008, fillet: 0.004, bevel: 0.003,
    })
  }
  for (const sx of [-1, 1]) {
    box(body, m.graphiteEdge, [0.03, HEIGHT - PLINTH - 0.14, 0.02], [sx * (WIDTH * 0.5 - 0.05), caseY, -(DEPTH * 0.5 - 0.05)], {
      chamfer: 0.008, fillet: 0.003, bevel: 0.003,
    })
  }
  // A little stock, so an opened cabinet is not an empty box.
  for (let index = 0; index < 3; index += 1) {
    box(body, m.shellLight, [0.16 + index * 0.03, 0.11, DEPTH - 0.14], [
      -0.24 + index * 0.22, SHELVES[1] + 0.07, -0.02,
    ], { chamfer: 0.024, fillet: 0.009, bevel: 0.008, rotation: [0, index * 0.05 - 0.05, 0] })
  }
  body.add(cylinder(m.orangePaint, 0.05, 0.2, [0.22, SHELVES[2] + 0.11, -0.02], AXIS_Y, 12))
  body.add(cylinder(m.graphiteEdge, 0.055, 0.03, [0.22, SHELVES[2] + 0.2, -0.02], AXIS_Y, 12))

  const stripe = addStripeDecal(bundle, { count: 4, lean: 1 })
  plaque(body, m, stripe, [0.34, 0.05], [0, PLINTH * 0.5, DEPTH * 0.5 - 0.03], 'front', m.ink)
  boltRun(body, m.steel, [-WIDTH * 0.3, HEIGHT - 0.12, -(DEPTH * 0.5 + 0.002)], [WIDTH * 0.3, HEIGHT - 0.12, -(DEPTH * 0.5 + 0.002)], 4, 0.013, 'back')
}

/** One door leaf, hinged on its outboard edge. */
function doorBuild(
  door: Group,
  m: CargoMaterials,
  bundle: CargoMaterialBundle,
  side: -1 | 1,
  lock: boolean,
): void {
  const leaf = (WIDTH - 0.08) * 0.5
  const height = HEIGHT - PLINTH - 0.08
  const centre = side * leaf * 0.5

  box(door, m.shellLight, [leaf, height, 0.032], [centre, PLINTH + height * 0.5, 0], {
    chamfer: 0.03, fillet: 0.011, bevel: 0.01,
  })
  box(door, m.shellShade, [leaf - 0.1, height - 0.34, 0.014], [centre, PLINTH + height * 0.5 + 0.06, 0.018], {
    chamfer: 0.026, fillet: 0.01, bevel: 0.007,
  })
  seam(door, m.shellLight, leaf - 0.06, [centre, PLINTH + 0.3, 0.018], 'front', 'across', 0.018, 0.011)
  louvreVent(door, m, [leaf - 0.2, 0.16], [centre, PLINTH + 0.16, 0.018], 4, 'front')

  if (lock) {
    // Espagnolette: a full-height rod with two throw points and a lever.
    door.add(cylinder(m.steel, 0.014, height - 0.14, [centre - side * (leaf * 0.5 - 0.06), PLINTH + height * 0.5, 0.03], AXIS_Y, 8))
    for (const y of [PLINTH + 0.12, HEIGHT - 0.18]) {
      box(door, m.graphiteEdge, [0.05, 0.07, 0.04], [centre - side * (leaf * 0.5 - 0.06), y, 0.03], {
        chamfer: 0.012, fillet: 0.005, bevel: 0.004,
      })
    }
    box(door, m.graphite, [0.09, 0.16, 0.04], [centre - side * (leaf * 0.5 - 0.06), 1.06, 0.038], {
      chamfer: 0.022, fillet: 0.008, bevel: 0.007,
    })
    box(door, m.amberPaint, [0.13, 0.035, 0.03], [centre - side * (leaf * 0.5 - 0.11), 1.06, 0.056], {
      chamfer: 0.01, fillet: 0.004, bevel: 0.004,
    })
    statusLens(door, m, [0.04, 0.016], [centre - side * (leaf * 0.5 - 0.06), 1.2, 0.03], m.cyan, 'front')
  } else {
    const label = addLabelDecal(bundle, { variant: 290 })
    plaque(door, m, label, [0.22, 0.09], [centre, 1.34, 0.02], 'front', m.shellLight)
    paintMark(door, m.amberPaint, slashProfile(0.04, 0.08, 0.45), [centre + side * 0.13, 1.14, 0.02], 'front', 0.008)
  }

  // Piano hinge down the outer edge: a rod plus knuckles.
  const hingeX = side * leaf
  door.add(cylinder(m.steel, 0.011, height - 0.06, [hingeX, PLINTH + height * 0.5, -0.012], AXIS_Y, 6))
  for (let index = 0; index < 6; index += 1) {
    const y = PLINTH + 0.14 + index * (height - 0.28) / 5
    box(door, m.graphiteEdge, [0.05, 0.06, 0.03], [hingeX - side * 0.02, y, -0.008], {
      chamfer: 0.01, fillet: 0.004, bevel: 0.004,
    })
    bolt(door, m.steel, [hingeX - side * 0.05, y, 0.016], 0.009, 'front')
  }
}

function build(): {
  root: Group
  body: Group
  doorLeft: Group
  doorRight: Group
  sockets: CabinetSockets
  bundle: CargoMaterialBundle
} {
  const bundle = acquireCargoMaterials(61_200, { condition: 0.62 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_INDUSTRIAL_TOOL-CABINET_ROOT_CLOSED'
  const body = new Group()
  body.name = 'AXR_INDUSTRIAL_TOOL-CABINET_PART_BODY_DEFAULT'
  const doorLeft = new Group()
  doorLeft.name = 'AXR_INDUSTRIAL_TOOL-CABINET_PART_DOOR-LEFT_CLOSED'
  const doorRight = new Group()
  doorRight.name = 'AXR_INDUSTRIAL_TOOL-CABINET_PART_DOOR-RIGHT_CLOSED'
  root.add(body, doorLeft, doorRight)

  bodyBuild(body, m, bundle)
  const hinge = WIDTH * 0.5 - 0.04
  doorLeft.position.set(-hinge, 0, DEPTH * 0.5 - 0.01)
  doorRight.position.set(hinge, 0, DEPTH * 0.5 - 0.01)
  doorBuild(doorLeft, m, bundle, 1, false)
  doorBuild(doorRight, m, bundle, -1, true)

  const sockets: CabinetSockets = {
    shelf_top: socket('shelf_top', [0, SHELVES[3] + 0.02, -0.01]),
    shelf_mid: socket('shelf_mid', [0, SHELVES[1] + 0.02, -0.01]),
    handle: socket('handle', [0.08, 1.06, DEPTH * 0.5 + 0.08]),
    wall_anchor: socket('wall_anchor', [0, HEIGHT - 0.12, -(DEPTH * 0.5 + 0.02)]),
  }
  return { root, body, doorLeft, doorRight, sockets, bundle }
}

export function createModel(): ToolCabinetController {
  const { root, body, doorLeft, doorRight, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'industrial-tool-cabinet',
    assemblies: [doorLeft, doorRight],
    reach: 0.13,
    sockets: Object.values(sockets),
  })

  let state: CabinetState = 'closed'
  let blend = 0
  let elapsed = 0
  const applyBlend = (): void => {
    doorLeft.rotation.y = blend * 2.0
    doorRight.rotation.y = -blend * 2.0
    doorLeft.name = blend > 0.02
      ? 'AXR_INDUSTRIAL_TOOL-CABINET_PART_DOOR-LEFT_OPEN'
      : 'AXR_INDUSTRIAL_TOOL-CABINET_PART_DOOR-LEFT_CLOSED'
    doorRight.name = doorLeft.name.replace('DOOR-LEFT', 'DOOR-RIGHT')
  }

  return {
    root,
    parts: { body, doorLeft, doorRight },
    sockets,
    get state() {
      return state
    },
    setState: (next: CabinetState) => {
      state = next
      root.name = next === 'open'
        ? 'AXR_INDUSTRIAL_TOOL-CABINET_ROOT_OPEN'
        : 'AXR_INDUSTRIAL_TOOL-CABINET_ROOT_CLOSED'
      blend = next === 'open' ? 1 : 0
      applyBlend()
      return state
    },
    update: (deltaSeconds: number) => {
      const step = Math.min(Math.max(deltaSeconds, 0), 0.05)
      elapsed += step
      const target = state === 'open' ? 1 : 0
      if (Math.abs(target - blend) > 1e-4) {
        blend += Math.sign(target - blend) * Math.min(Math.abs(target - blend), step * 0.9)
        applyBlend()
      }
      bundle.materials.cyan.emissiveIntensity = 1.6 + Math.sin(elapsed * 1.7) * 0.2
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: CabinetState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'closed')
  return createCargoPreview(model, {
    target: [0, HEIGHT * 0.5, 0],
    distance: 5.0,
    yaw: 0.7,
    pitch: 0.2,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createOpenPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'open' })
