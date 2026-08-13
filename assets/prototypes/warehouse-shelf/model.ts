import { Group, Object3D } from 'three/webgpu'

import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_Z,
  acquireCargoMaterials,
  addLabelDecal,
  bolt,
  box,
  createCargoPreview,
  finishModel,
  plaque,
  socket,
  statusLens,
  tubeSection,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay warehouse shelving — hand-loaded boltless shelving with stock.
 *
 * The small-parts counterpart to the pallet rack: light angle uprights, five
 * close-pitched levels a person can reach, and a wire-decked shelf that shows
 * what is on it. It ships stocked, because empty shelving reads as a shop
 * fitting rather than as a working store, and the stock is what gives the
 * silhouette its irregularity.
 *
 * Shelf spacing is uneven on purpose - taller at the bottom for bulky stock,
 * tighter at the top for boxes - which is how anyone who has actually used
 * shelving sets it up.
 */

const WIDTH = 1.7
const DEPTH = 0.56
const HEIGHT = 2.1
const POST = 0.06
const LEVELS = [0.12, 0.6, 1.0, 1.4, 1.76]
/** Front beam depth, and the outer face a level's labels are seated on. */
const RAIL = 0.12
const RAIL_Z = DEPTH * 0.5 - POST * 0.5 + 0.0175
/** Rear brace lean, and the diagonal that lean has to be cut to. */
const BRACE_LEAN = 0.62
const BRACE = (WIDTH - POST) / Math.cos(BRACE_LEAN)

interface ShelfSockets {
  level_1: Object3D
  level_3: Object3D
  level_5: Object3D
  aisle_face: Object3D
}

export interface WarehouseShelfController {
  root: Group
  sockets: ShelfSockets
  update(deltaSeconds: number): void
  dispose(): void
}

/** Wire deck: a perimeter frame with close-pitched cross wires. */
function deck(root: Group, m: CargoMaterials, y: number): void {
  box(root, m.shellShade, [WIDTH - POST, 0.022, DEPTH - POST], [0, y, 0], {
    chamfer: 0.02, fillet: 0.008, bevel: 0.007,
  })
  // The front beam is what a level's label is bolted to, so it is deep enough to
  // hold one. At the 45 mm it was drawn at, a plaque could bite half a
  // millimetre of it and hang the rest of itself over the open bay.
  box(root, m.graphiteEdge, [WIDTH - POST, RAIL, 0.035], [0, y - RAIL * 0.5 + 0.005, DEPTH * 0.5 - POST * 0.5], {
    chamfer: 0.012, fillet: 0.005, bevel: 0.005,
  })
  for (let index = 0; index < 11; index += 1) {
    const x = (index / 10 - 0.5) * (WIDTH - 0.18)
    root.add(cylinder(m.steel, 0.007, DEPTH - POST, [x, y + 0.016, 0], AXIS_Z, 5))
  }
}

/** A stocked bin: a small open tray with a coloured front lip. */
function bin(root: Group, m: CargoMaterials, x: number, y: number, width: number, colour: typeof m.amberPaint): void {
  box(root, m.shell, [width, 0.15, DEPTH - 0.14], [x, y + 0.085, -0.02], {
    chamfer: 0.03, fillet: 0.012, bevel: 0.01,
  })
  box(root, m.ink, [width - 0.05, 0.12, DEPTH - 0.2], [x, y + 0.11, -0.02], {
    chamfer: 0.025, fillet: 0.01, bevel: 0.008,
  })
  box(root, colour, [width - 0.02, 0.05, 0.03], [x, y + 0.055, DEPTH * 0.5 - 0.09], {
    chamfer: 0.012, fillet: 0.005, bevel: 0.004,
  })
}

function build(): { root: Group; sockets: ShelfSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(58_200, { condition: 0.62 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_WAREHOUSE-SHELF_ROOT_DEFAULT'

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (WIDTH * 0.5 - POST * 0.5)
      const z = sz * (DEPTH * 0.5 - POST * 0.5)
      tubeSection(root, m.shell, [POST, POST], 0.01, HEIGHT, [x, HEIGHT * 0.5, z], [Math.PI / 2, 0, 0])
      box(root, m.graphite, [0.1, 0.018, 0.1], [x, 0.009, z], { chamfer: 0.025, fillet: 0.008, bevel: 0.005 })
      bolt(root, m.steel, [x, 0.018, z], 0.012, 'top')
    }
    // Rear cross brace, which is what stops boltless shelving racking sideways.
    // A brace is cut to the diagonal, not to the span it covers: at the bare
    // frame width and laid over 36 degrees, all four ends stopped 155 mm short
    // of the posts they are supposed to tie together.
    box(root, m.shellShade, [BRACE, 0.05, 0.02], [0, HEIGHT * 0.62, -(DEPTH * 0.5 - POST * 0.5)], {
      chamfer: 0.012, fillet: 0.005, bevel: 0.004, rotation: [0, 0, sx * BRACE_LEAN],
    })
  }
  box(root, m.shellShade, [WIDTH - POST, 0.05, 0.02], [0, HEIGHT - 0.06, -(DEPTH * 0.5 - POST * 0.5)], {
    chamfer: 0.012, fillet: 0.005, bevel: 0.004,
  })

  for (const y of LEVELS) deck(root, m, y)

  // Stock. Three bin runs, one row of stacked flat boxes, one level left clear
  // so the shelving still reads as shelving rather than as a solid wall.
  const colours = [m.amberPaint, m.orangePaint, m.redPaint, m.amberPaint]
  for (let index = 0; index < 4; index += 1) {
    bin(root, m, (index - 1.5) * 0.4, LEVELS[1] + 0.011, 0.36, colours[index])
  }
  for (let index = 0; index < 5; index += 1) {
    bin(root, m, (index - 2) * 0.32, LEVELS[3] + 0.011, 0.28, colours[index % 4])
  }
  for (let index = 0; index < 3; index += 1) {
    const width = 0.42 + index * 0.04
    box(root, m.shellLight, [width, 0.12 + index * 0.02, DEPTH - 0.16], [
      -0.5 + index * 0.52, LEVELS[0] + 0.08 + index * 0.01, -0.02,
    ], { chamfer: 0.035, fillet: 0.012, bevel: 0.01, rotation: [0, index * 0.05 - 0.05, 0] })
  }
  for (let index = 0; index < 2; index += 1) {
    box(root, m.graphiteEdge, [0.5, 0.2, DEPTH - 0.18], [-0.42 + index * 0.62, LEVELS[4] + 0.12, -0.02], {
      chamfer: 0.045, fillet: 0.016, bevel: 0.012, rotation: [0, index * 0.06, 0],
    })
  }

  // Level identity, on the beam face rather than in the aisle in front of it.
  const label = addLabelDecal(bundle, { variant: 160 })
  const railY = LEVELS[2] - RAIL * 0.5 + 0.005
  plaque(root, m, label, [0.13, 0.055], [WIDTH * 0.5 - 0.28, railY, RAIL_Z], 'front', m.shellLight)
  statusLens(root, m, [0.05, 0.02], [-WIDTH * 0.5 + 0.2, railY, RAIL_Z], m.cyan, 'front')

  const sockets: ShelfSockets = {
    level_1: socket('level_1', [0, LEVELS[0] + 0.02, 0]),
    level_3: socket('level_3', [0, LEVELS[2] + 0.02, 0]),
    level_5: socket('level_5', [0, LEVELS[4] + 0.02, 0]),
    aisle_face: socket('aisle_face', [0, HEIGHT * 0.5, DEPTH * 0.5 + 0.2]),
  }
  return { root, sockets, bundle }
}

export function createModel(): WarehouseShelfController {
  const { root, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'warehouse-shelf',
    reach: 0.14,
    sockets: Object.values(sockets),
  })
  let elapsed = 0
  return {
    root,
    sockets,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      bundle.materials.cyan.emissiveIntensity = 1.55 + Math.sin(elapsed * 1.7) * 0.2
    },
    dispose: finished.dispose,
  }
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  createCargoPreview(createModel(), {
    target: [0, HEIGHT * 0.48, 0],
    distance: 5.6,
    yaw: 0.7,
    pitch: 0.2,
    fov: 30,
    ...options,
  })
