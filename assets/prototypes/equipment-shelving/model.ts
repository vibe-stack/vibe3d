import { Group, Object3D } from 'three/webgpu'

import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  AXIS_Y,
  AXIS_Z,
  FACE_CLEARANCE,
  acquireCargoMaterials,
  addLabelDecal,
  bolt,
  box,
  createCargoPreview,
  finishModel,
  groundPad,
  louvreVent,
  member,
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
/** Back panel: its span, and the outer face anything mounted on it seats at. */
const PANEL_BOTTOM = 0.15
const PANEL_TOP = HEIGHT - 0.02
const PANEL_Z = -(DEPTH * 0.5 - POST * 0.5) - 0.015
/** Busbar spine, lapping the panel's inner face by 20 mm. */
const SPINE_Z = -(DEPTH * 0.5 - POST * 0.5) + 0.03
/**
 * How far an outlet sits above the tray it feeds. The top bay sets the figure:
 * its lamp stands 75 mm above the outlet's centre and has to stay on the panel.
 */
const OUTLET_RISE = 0.09
/** Foot pad and plate, stacked so the rubber is the part in contact. */
const PAD = 0.018
const FOOT = 0.028
/** Cable basket depth, and the span the two straps carrying it sit inside. */
const BASKET = 0.16

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
  box(root, m.amberPaint, [0.05, 0.06, 0.03], [WIDTH * 0.5 - 0.22, y, z + 0.045], {
    chamfer: 0.012, fillet: 0.005, bevel: 0.004,
  })
  // The lamp seats on the outlet's own front face and inside its 0.14 height;
  // lifted 10 mm off it and 55 mm up, the bezel floated and overshot the box.
  statusLens(root, m, [0.05, 0.02], [WIDTH * 0.5 - 0.28, y + 0.045, z + 0.025], lamp, 'front')
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
      // The post is bedded in its pad rather than run through it, and the pad
      // now drops a face clearance below the sole it beds on its own, so the
      // post takes the deck; lifted as well all four stood clear of it.
      tubeSection(root, m.shell, [POST, POST], 0.012, HEIGHT, [
        x, HEIGHT * 0.5, z,
      ], [Math.PI / 2, 0, 0])
      // The pad is wider than the plate it beds, which is the only way it shows
      // at all - a 0.08 disc under a 0.12 plate is rubber nobody ever sees.
      groundPad(root, m.rubber, [0.14, 0.14], [x, 0, z], PAD)
      box(root, m.graphite, [0.12, FOOT, 0.12], [x, PAD * 0.5 + FOOT * 0.5, z], {
        chamfer: 0.03, fillet: 0.01, bevel: 0.006,
      })
      bolt(root, m.steel, [x, PAD * 0.5 + FOOT, z], 0.013, 'top')
    }
  }
  // Back panel with a louvred field, so the bay reads as ventilated. It runs to
  // the head of the frame because the top bay's outlet hangs on it; stopped at
  // HEIGHT - 0.3 it ended below that outlet and left it in mid-air.
  box(root, m.shellShade, [WIDTH - POST, PANEL_TOP - PANEL_BOTTOM, 0.03], [
    0, (PANEL_TOP + PANEL_BOTTOM) * 0.5, -(DEPTH * 0.5 - POST * 0.5),
  ], {
    chamfer: 0.04, fillet: 0.014, bevel: 0.01,
  })
  louvreVent(root, m, [0.36, 0.44], [-WIDTH * 0.5 + 0.34, HEIGHT * 0.42, PANEL_Z], 5, 'back')

  for (const y of LEVELS) tray(root, m, y)

  // Busbar trunking down the spine plus a cable basket under the top tray.
  box(root, m.graphite, [0.1, HEIGHT - 0.42, 0.07], [WIDTH * 0.5 - 0.14, HEIGHT * 0.5, SPINE_Z], {
    chamfer: 0.024, fillet: 0.009, bevel: 0.008,
  })
  for (const [index, y] of LEVELS.entries()) {
    outlet(root, m, y + OUTLET_RISE, index === 2 ? m.amber : m.cyan)
  }
  box(root, m.graphiteEdge, [WIDTH - 0.4, 0.05, BASKET], [0, LEVELS[3] - 0.1, DEPTH * 0.5 - 0.2], {
    chamfer: 0.02, fillet: 0.008, bevel: 0.007,
  })
  // Two straps carrying the basket off the tray above it. Without them the
  // basket and its cable run hung 60 mm under the shelf on nothing at all; they
  // sit outboard of the cables so the run passes between them.
  // A strap is let into the basket rather than run to the same depth: built to
  // the basket's own 0.16 both of its faces landed on the basket's, and the two
  // fought down each side of both straps.
  for (const sx of [-1, 1]) {
    box(root, m.shellShade, [0.03, 0.14, BASKET - FACE_CLEARANCE * 2], [sx * ((WIDTH - 0.4) * 0.5 - 0.02), LEVELS[3] - 0.065, DEPTH * 0.5 - 0.2], {
      chamfer: 0.008, fillet: 0.004, bevel: 0.004,
    })
  }
  for (let index = 0; index < 6; index += 1) {
    root.add(cylinder(m.rubber, 0.012, WIDTH - 0.52, [0, LEVELS[3] - 0.07 + (index % 2) * 0.02, DEPTH * 0.5 - 0.24 + index * 0.012], AXIS_X, 6))
  }
  // Earth strap, bonding the front post to its own base plate. Drawn as a free
  // box it reached neither: 10 mm clear of the post at the top and 55 mm short
  // of the plate at the bottom, a bond wire bonding nothing.
  member(root, m.amberPaint, [
    -(WIDTH * 0.5 - POST * 0.5), 0.26, DEPTH * 0.5 - 0.06,
  ], [
    -(WIDTH * 0.5 - POST * 0.5) + 0.05, PAD * 0.5 + FOOT * 0.5, DEPTH * 0.5 - 0.06,
  ], 0.03, 0.012)

  const label = addLabelDecal(bundle, { variant: 170 })
  plaque(root, m, label, [0.2, 0.07], [-WIDTH * 0.5 + 0.26, LEVELS[3] + 0.015, DEPTH * 0.5 - 0.12], 'top', m.shellLight)

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
