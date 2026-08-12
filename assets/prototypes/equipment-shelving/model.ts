import { Group, Object3D } from 'three/webgpu'

import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  AXIS_Y,
  AXIS_Z,
  acquireCargoMaterials,
  addLabelDecal,
  bolt,
  box,
  createCargoPreview,
  finishModel,
  louvreVent,
  plaque,
  seam,
  socket,
  statusLens,
  tubeSection,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay equipment shelving — a powered rack for serviceable kit.
 *
 * Not a store; a bay. It has a busbar down the spine, a drop-in tray per level
 * with its own supply socket and state lamp, an earth strap, and a cable basket
 * under the top shelf. That electrical layer is the whole difference between
 * this and {@link warehouse shelving}: one holds boxes, this one keeps equipment
 * alive and tells you which slot has failed.
 */

const WIDTH = 1.42
const DEPTH = 0.62
const HEIGHT = 1.94
const POST = 0.075
const LEVELS = [0.34, 0.82, 1.3, 1.74]

interface ShelvingSockets {
  bay_a: Object3D
  bay_b: Object3D
  bay_c: Object3D
  power_in: Object3D
}

export type ShelvingState = 'live' | 'isolated'

export interface EquipmentShelvingController {
  root: Group
  sockets: ShelvingSockets
  readonly state: ShelvingState
  setState(state: ShelvingState): ShelvingState
  update(deltaSeconds: number): void
  dispose(): void
}

/** A drop-in tray with a raised lip and two location pips. */
function tray(root: Group, m: CargoMaterials, y: number): void {
  box(root, m.shell, [WIDTH - POST * 2, 0.03, DEPTH - POST], [0, y, 0], {
    chamfer: 0.03, fillet: 0.012, bevel: 0.008,
  })
  for (const sz of [-1, 1]) {
    box(root, m.shellShade, [WIDTH - POST * 2, 0.055, 0.022], [0, y + 0.03, sz * (DEPTH * 0.5 - POST * 0.6)], {
      chamfer: 0.012, fillet: 0.005, bevel: 0.005,
    })
  }
  seam(root, m.shell, WIDTH - POST * 2 - 0.14, [0, y + 0.015, 0], 'top', 'across', 0.022, 0.012)
  for (const sx of [-1, 1]) {
    root.add(cylinder(m.graphiteEdge, 0.016, 0.02, [sx * 0.4, y + 0.024, 0.1], AXIS_Y, 8))
  }
}

/** A supply outlet with its isolator and slot lamp, mounted on the spine. */
function outlet(root: Group, m: CargoMaterials, y: number, lamp: typeof m.cyan): void {
  const z = -(DEPTH * 0.5 - 0.06)
  box(root, m.graphite, [0.24, 0.14, 0.05], [WIDTH * 0.5 - 0.28, y, z], {
    chamfer: 0.03, fillet: 0.011, bevel: 0.009,
  })
  root.add(cylinder(m.ink, 0.032, 0.04, [WIDTH * 0.5 - 0.34, y, z + 0.04], AXIS_Z, 10))
  box(root, m.amberPaint, [0.05, 0.06, 0.03], [WIDTH * 0.5 - 0.22, y, z + 0.04], {
    chamfer: 0.012, fillet: 0.005, bevel: 0.004,
  })
  statusLens(root, m, [0.05, 0.02], [WIDTH * 0.5 - 0.28, y + 0.055, z + 0.035], lamp, 'front')
}

function build(): { root: Group; sockets: ShelvingSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(58_400, { condition: 0.5 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_EQUIPMENT-SHELVING_ROOT_LIVE'

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (WIDTH * 0.5 - POST * 0.5)
      const z = sz * (DEPTH * 0.5 - POST * 0.5)
      tubeSection(root, m.shell, [POST, POST], 0.012, HEIGHT, [x, HEIGHT * 0.5, z], [Math.PI / 2, 0, 0])
      box(root, m.graphite, [0.12, 0.028, 0.12], [x, 0.014, z], { chamfer: 0.03, fillet: 0.01, bevel: 0.006 })
      root.add(cylinder(m.rubber, 0.04, 0.02, [x, 0.008, z], AXIS_Y, 8))
      bolt(root, m.steel, [x, 0.028, z], 0.013, 'top')
    }
  }
  // Back panel with a louvred field, so the bay reads as ventilated.
  box(root, m.shellShade, [WIDTH - POST, HEIGHT - 0.3, 0.03], [0, HEIGHT * 0.5, -(DEPTH * 0.5 - POST * 0.5)], {
    chamfer: 0.04, fillet: 0.014, bevel: 0.01,
  })
  louvreVent(root, m, [0.36, 0.44], [-WIDTH * 0.5 + 0.34, HEIGHT * 0.42, -(DEPTH * 0.5 + 0.005)], 5, 'back')

  for (const y of LEVELS) tray(root, m, y)

  // Busbar trunking down the spine plus a cable basket under the top tray.
  box(root, m.graphite, [0.1, HEIGHT - 0.42, 0.07], [WIDTH * 0.5 - 0.14, HEIGHT * 0.5, -(DEPTH * 0.5 - 0.1)], {
    chamfer: 0.024, fillet: 0.009, bevel: 0.008,
  })
  for (const [index, y] of LEVELS.entries()) {
    outlet(root, m, y + 0.12, index === 2 ? m.amber : m.cyan)
  }
  box(root, m.graphiteEdge, [WIDTH - 0.4, 0.05, 0.16], [0, LEVELS[3] - 0.1, DEPTH * 0.5 - 0.2], {
    chamfer: 0.02, fillet: 0.008, bevel: 0.007,
  })
  for (let index = 0; index < 6; index += 1) {
    root.add(cylinder(m.rubber, 0.012, WIDTH - 0.44, [0, LEVELS[3] - 0.07 + (index % 2) * 0.02, DEPTH * 0.5 - 0.24 + index * 0.012], AXIS_X, 6))
  }
  // Earth strap from the frame to the deck.
  box(root, m.amberPaint, [0.03, 0.22, 0.012], [-WIDTH * 0.5 + 0.1, 0.16, DEPTH * 0.5 - 0.06], {
    chamfer: 0.006, fillet: 0.003, bevel: 0.003, rotation: [0, 0, 0.24],
  })

  const label = addLabelDecal(bundle, { variant: 170 })
  plaque(root, m, label, [0.24, 0.09], [-WIDTH * 0.5 + 0.26, HEIGHT - 0.1, DEPTH * 0.5 - 0.16], 'top', m.shellLight)

  const sockets: ShelvingSockets = {
    bay_a: socket('bay_a', [0, LEVELS[0] + 0.03, 0]),
    bay_b: socket('bay_b', [0, LEVELS[1] + 0.03, 0]),
    bay_c: socket('bay_c', [0, LEVELS[2] + 0.03, 0]),
    power_in: socket('power_in', [WIDTH * 0.5 - 0.14, 0.2, -(DEPTH * 0.5 + 0.08)]),
  }
  return { root, sockets, bundle }
}

export function createModel(): EquipmentShelvingController {
  const { root, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'equipment-shelving',
    reach: 0.14,
    sockets: Object.values(sockets),
  })

  let state: ShelvingState = 'live'
  let elapsed = 0
  const applyState = (next: ShelvingState): ShelvingState => {
    state = next
    const live = next === 'live'
    bundle.materials.cyan.emissiveIntensity = live ? 1.7 : 0
    bundle.materials.amber.emissiveIntensity = live ? 2.1 : 0
    root.name = live
      ? 'AXR_CARGO_EQUIPMENT-SHELVING_ROOT_LIVE'
      : 'AXR_CARGO_EQUIPMENT-SHELVING_ROOT_ISOLATED'
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
      bundle.materials.cyan.emissiveIntensity = 1.6 + Math.sin(elapsed * 2.0) * 0.22
      // The failed slot's amber lamp cycles slower and deeper than the healthy
      // cyan ones, so the fault reads without a colour change alone carrying it.
      bundle.materials.amber.emissiveIntensity = 1.5 + Math.abs(Math.sin(elapsed * 1.1)) * 1.1
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: ShelvingState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'live')
  return createCargoPreview(model, {
    target: [0, HEIGHT * 0.48, 0],
    distance: 5.0,
    yaw: 0.68,
    pitch: 0.22,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createIsolatedPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'isolated' })
