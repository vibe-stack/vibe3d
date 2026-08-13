import { Group, Object3D } from 'three/webgpu'

import { cylinder, prism } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  acquireCargoMaterials,
  addLabelDecal,
  box,
  boltRun,
  createCargoPreview,
  finishModel,
  paintMark,
  plaque,
  seam,
  slashProfile,
  socket,
  statusLens,
  toggleLatch,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay hard equipment case — the wheeled flight case.
 *
 * Everything about it is about one operator moving it alone: two fixed wheels at
 * the trailing edge, a telescoping tow handle, a tilted-back stance implied by
 * the skid feet at the front, and a mass low enough in the shell that it does not
 * tip. It is the only case in the wave that rolls, and the wheels are what
 * distinguish it from the military case at a glance.
 */

const WIDTH = 0.62
const DEPTH = 0.44
const HEIGHT = 0.72
const LID = 0.16
const WHEEL = 0.075

interface HardCaseSockets {
  tow_handle: Object3D
  lid_hinge: Object3D
  wheel_axle: Object3D
}

export type HardCaseState = 'stowed' | 'towing'

export interface HardCaseController {
  root: Group
  parts: { hull: Group; lid: Group; handle: Group }
  sockets: HardCaseSockets
  readonly state: HardCaseState
  setState(state: HardCaseState): HardCaseState
  update(deltaSeconds: number): void
  dispose(): void
}

function hullBody(hull: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  const bodyHeight = HEIGHT - LID
  const bodyY = bodyHeight * 0.5

  box(hull, m.shell, [WIDTH, bodyHeight, DEPTH], [0, bodyY, 0], {
    chamfer: 0.07, fillet: 0.024, bevel: 0.018, capChamfer: 0.045,
  })
  // Corner extrusions run the full height, which is what a case that is dragged
  // over kerbs actually has.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(hull, m.graphiteEdge, [0.075, bodyHeight + 0.006, 0.075], [
        sx * (WIDTH * 0.5 - 0.035), bodyY, sz * (DEPTH * 0.5 - 0.035),
      ], { chamfer: 0.028, fillet: 0.01, bevel: 0.008 })
    }
  }
  // Skid feet at the front, wheels at the back.
  for (const sx of [-1, 1]) {
    box(hull, m.rubber, [0.09, 0.028, 0.09], [sx * (WIDTH * 0.5 - 0.06), 0.014, DEPTH * 0.5 - 0.06], {
      chamfer: 0.024, fillet: 0.009, bevel: 0.007,
    })
    const wheelZ = -(DEPTH * 0.5 - 0.02)
    box(hull, m.graphite, [0.09, 0.15, 0.11], [sx * (WIDTH * 0.5 - 0.055), WHEEL + 0.01, wheelZ], {
      chamfer: 0.03, fillet: 0.011, bevel: 0.009,
    })
    hull.add(cylinder(m.rubber, WHEEL, 0.055, [sx * (WIDTH * 0.5 - 0.055), WHEEL, wheelZ], AXIS_X, 14))
    hull.add(cylinder(m.steel, WHEEL * 0.44, 0.062, [sx * (WIDTH * 0.5 - 0.055), WHEEL, wheelZ], AXIS_X, 10))
    hull.add(cylinder(m.ink, WHEEL * 0.16, 0.07, [sx * (WIDTH * 0.5 - 0.055), WHEEL, wheelZ], AXIS_X, 8))
  }

  // The service panel is what the whole front is applied to, so it laps the shell
  // by half its own thickness and everything above it measures from the panel's
  // face rather than from the skin behind it.
  const panelThickness = 0.022
  box(hull, m.shellShade, [WIDTH - 0.2, bodyHeight - 0.16, panelThickness], [0, bodyY + 0.02, DEPTH * 0.5], {
    chamfer: 0.055, fillet: 0.018, bevel: 0.01,
  })
  const panelZ = DEPTH * 0.5 + panelThickness * 0.5
  for (const x of [-0.12, 0.12]) {
    seam(hull, m.shellShade, bodyHeight - 0.24, [x, bodyY + 0.02, panelZ], 'front', 'along', 0.022, 0.014)
  }
  const label = addLabelDecal(bundle, { variant: 55 })
  plaque(hull, m, label, [0.22, 0.1], [0, bodyY + 0.14, panelZ], 'front', m.shellLight)
  statusLens(hull, m, [0.06, 0.024], [0, bodyY - 0.1, panelZ], m.cyan, 'front')
  // Inboard of the panel edge at 0.21: drawn at the old 0.22 the slash hung off
  // the panel over bare shell and the corner extrusion behind it.
  paintMark(hull, m.amberPaint, slashProfile(0.05, 0.1, 0.5), [WIDTH * 0.5 - 0.18, bodyY - 0.1, panelZ], 'front', 0.009)
  // The run has to stop short of the tow-handle channels at x 0.165 to 0.215,
  // which swallowed the two outer bolts whole.
  boltRun(hull, m.steel, [-0.12, bodyY + 0.2, -DEPTH * 0.5], [0.12, bodyY + 0.2, -DEPTH * 0.5], 3, 0.014, 'back')

  // Side pull grips.
  for (const sx of [-1, 1]) {
    box(hull, m.ink, [0.02, 0.09, 0.18], [sx * (WIDTH * 0.5 + 0.004), bodyY + 0.05, 0], {
      chamfer: 0.028, fillet: 0.01, bevel: 0.008,
    })
    box(hull, m.rubber, [0.018, 0.045, 0.14], [sx * (WIDTH * 0.5 + 0.016), bodyY + 0.05, 0], {
      chamfer: 0.016, fillet: 0.006, bevel: 0.005,
    })
  }
}

function lidBody(lid: Group, m: CargoMaterials): void {
  const lidZ = DEPTH * 0.5 - 0.032
  const lidBack = lidZ - (DEPTH + 0.008) * 0.5

  box(lid, m.shellLight, [WIDTH + 0.008, LID, DEPTH + 0.008], [0, LID * 0.5, lidZ], {
    chamfer: 0.062, fillet: 0.022, bevel: 0.016, capChamfer: 0.04,
  })
  box(lid, m.ink, [WIDTH - 0.2, 0.024, DEPTH - 0.16], [0, LID - 0.006, lidZ], {
    chamfer: 0.05, fillet: 0.016, bevel: 0.01,
  })
  box(lid, m.shellShade, [WIDTH - 0.28, 0.02, DEPTH - 0.24], [0, LID + 0.002, lidZ], {
    chamfer: 0.045, fillet: 0.014, bevel: 0.009,
  })
  // The knuckles have to clear the lid's own back face. Drawn 52 mm inside it
  // they render as nothing, which is why the case back was a smooth shell with
  // no hinge on it anywhere.
  for (const sx of [-1, 1]) {
    lid.add(prism(m.graphiteEdge, [0.11, 0.07, 0.06], [sx * 0.2, LID * 0.55, lidBack + 0.01], {
      chamfer: 0.02, fillet: 0.007, bevel: 0.006,
    }))
    lid.add(cylinder(m.steel, 0.016, 0.13, [sx * 0.2, LID * 0.55, lidBack - 0.016], AXIS_X, 8))
  }
}

/** Telescoping tow handle: two stiles in guide channels plus a rubber grip. */
function towHandle(handle: Group, m: CargoMaterials): void {
  for (const sx of [-1, 1]) {
    handle.add(cylinder(m.steel, 0.014, 0.34, [sx * 0.19, 0.17, 0], [0, 0, 0], 8))
  }
  // The grip spans the two stiles, so its axis is the axis they are separated
  // along. On AXIS_Z it ran 400 mm aft from the centreline and joined nothing.
  handle.add(cylinder(m.rubber, 0.021, 0.4, [0, 0.35, 0], AXIS_X, 10))
  for (const sx of [-1, 1]) {
    handle.add(cylinder(m.graphiteEdge, 0.024, 0.035, [sx * 0.19, 0.343, 0], [0, 0, 0], 8))
  }
}

function build(): {
  root: Group
  hull: Group
  lid: Group
  handle: Group
  sockets: HardCaseSockets
  bundle: CargoMaterialBundle
} {
  const bundle = acquireCargoMaterials(56_400, { condition: 0.62 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_HARD-EQUIPMENT-CASE_ROOT_STOWED'
  const hull = new Group()
  hull.name = 'AXR_CARGO_HARD-EQUIPMENT-CASE_PART_HULL_DEFAULT'
  const lid = new Group()
  lid.name = 'AXR_CARGO_HARD-EQUIPMENT-CASE_PART_LID_CLOSED'
  const handle = new Group()
  handle.name = 'AXR_CARGO_HARD-EQUIPMENT-CASE_PART_HANDLE_STOWED'
  root.add(hull, lid, handle)

  hullBody(hull, m, bundle)
  lid.position.set(0, HEIGHT - LID, -(DEPTH * 0.5 - 0.032))
  lidBody(lid, m)
  for (const x of [-0.18, 0.18]) {
    toggleLatch(hull, m, [x, HEIGHT - LID - 0.01, DEPTH * 0.5], 0.68, 'front')
  }

  // Guide channels on the back face; the handle runs in the trough they form.
  const channelZ = -(DEPTH * 0.5 + 0.008)
  const channelFace = channelZ - 0.02
  for (const sx of [-1, 1]) {
    box(hull, m.graphite, [0.05, HEIGHT - LID - 0.1, 0.04], [sx * 0.19, (HEIGHT - LID) * 0.5, channelZ], {
      chamfer: 0.016, fillet: 0.006, bevel: 0.005,
    })
  }
  // Stiles centred on the channel mouth, so each tube is half buried in its
  // guide. Set behind the channel they stood 8 mm out of the back of it.
  handle.position.set(0, HEIGHT - LID - 0.32, channelFace)
  towHandle(handle, m)

  const sockets: HardCaseSockets = {
    tow_handle: socket('tow_handle', [0, HEIGHT - LID + 0.05, channelFace]),
    lid_hinge: socket('lid_hinge', [0, HEIGHT - LID, -(DEPTH * 0.5 - 0.032)]),
    wheel_axle: socket('wheel_axle', [0, WHEEL, -(DEPTH * 0.5 - 0.02)]),
  }
  return { root, hull, lid, handle, sockets, bundle }
}

export function createModel(): HardCaseController {
  const { root, hull, lid, handle, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'hard-equipment-case',
    assemblies: [lid, handle],
    reach: 0.11,
    sockets: Object.values(sockets),
  })

  let state: HardCaseState = 'stowed'
  let blend = 0
  let elapsed = 0
  const stowY = HEIGHT - LID - 0.32
  const applyBlend = (): void => {
    handle.position.y = stowY + blend * 0.34
    handle.name = blend > 0.02
      ? 'AXR_CARGO_HARD-EQUIPMENT-CASE_PART_HANDLE_EXTENDED'
      : 'AXR_CARGO_HARD-EQUIPMENT-CASE_PART_HANDLE_STOWED'
  }

  return {
    root,
    parts: { hull, lid, handle },
    sockets,
    get state() {
      return state
    },
    setState: (next: HardCaseState) => {
      state = next
      root.name = next === 'towing'
        ? 'AXR_CARGO_HARD-EQUIPMENT-CASE_ROOT_TOWING'
        : 'AXR_CARGO_HARD-EQUIPMENT-CASE_ROOT_STOWED'
      blend = next === 'towing' ? 1 : 0
      applyBlend()
      return state
    },
    update: (deltaSeconds: number) => {
      const step = Math.min(Math.max(deltaSeconds, 0), 0.05)
      elapsed += step
      const target = state === 'towing' ? 1 : 0
      if (Math.abs(target - blend) > 1e-4) {
        blend += Math.sign(target - blend) * Math.min(Math.abs(target - blend), step * 1.4)
        applyBlend()
      }
      bundle.materials.cyan.emissiveIntensity = 1.6 + Math.sin(elapsed * 2.2) * 0.22
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: HardCaseState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'stowed')
  return createCargoPreview(model, {
    target: [0, HEIGHT * 0.5, 0],
    distance: 2.35,
    yaw: 0.82,
    pitch: 0.28,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createTowingPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'towing' })
