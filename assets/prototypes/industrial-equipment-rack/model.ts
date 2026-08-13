import { Group, Object3D } from 'three/webgpu'

import { cylinder, extrudeProfile } from '../../../src/asset-forge/generator/index.ts'
import {
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
  plaque,
  seam,
  slot,
  socket,
  statusLens,
  tubeSection,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay equipment rack — a rack-unit cabinet, part populated.
 *
 * The instrument counterpart to the pallet rack. Its language is the rack unit:
 * punched mounting rails at a fixed pitch, faceplates that all share a width and
 * differ only in height, blanking panels where a slot is empty, and a fan tray
 * in the plinth pushing air up the stack.
 *
 * Half the U-space is blanked on purpose. A fully populated rack reads as a
 * render of a product catalogue; a part-populated one reads as equipment that
 * somebody is still commissioning.
 */

const WIDTH = 0.66
const DEPTH = 0.78
const HEIGHT = 1.86
const PLINTH = 0.11
const U = 0.0445
/** Mounting rail, and the faceplate plane 4 mm into the face it bolts to. */
const RAIL_Z = DEPTH * 0.5 - 0.06
const PLATE_Z = RAIL_Z + 0.025 + 0.006
/** Roof slab and its outer face, which is the datum for everything on top. */
const ROOF = 0.035
const ROOF_Y = HEIGHT - 0.018
const ROOF_TOP = ROOF_Y + ROOF * 0.5
/**
 * Levelling foot depth, and the underside of the plinth that stands on it. The
 * pad drops a face clearance below the deck, so its top is at `FOOT` less that
 * again; the plinth beds one more clearance into it rather than meeting it on a
 * plane, which is a joint that reads as a slit the moment the deck is not flat.
 */
const FOOT = 0.018
const PLINTH_BOTTOM = FOOT - FACE_CLEARANCE * 2

interface RackSockets {
  slot_low: Object3D
  slot_mid: Object3D
  slot_high: Object3D
  cable_entry: Object3D
}

export type RackState = 'live' | 'standby'

export interface EquipmentRackController {
  root: Group
  sockets: RackSockets
  readonly state: RackState
  setState(state: RackState): RackState
  update(deltaSeconds: number): void
  dispose(): void
}

interface Unit {
  /** Height in rack units. */
  readonly u: number
  readonly kind: 'blank' | 'server' | 'panel' | 'display'
}

const STACK: readonly Unit[] = [
  { u: 3, kind: 'panel' },
  { u: 2, kind: 'server' },
  { u: 2, kind: 'server' },
  { u: 4, kind: 'blank' },
  { u: 3, kind: 'display' },
  { u: 2, kind: 'server' },
  { u: 6, kind: 'blank' },
  { u: 2, kind: 'panel' },
  { u: 5, kind: 'blank' },
  { u: 3, kind: 'server' },
]

function faceplate(root: Group, m: CargoMaterials, unit: Unit, y: number, bundle: CargoMaterialBundle): void {
  const height = unit.u * U - 0.004
  const z = PLATE_Z
  const face = unit.kind === 'blank' ? m.shellShade : m.shellLight
  box(root, face, [WIDTH - 0.09, height, 0.02], [0, y, z], {
    chamfer: 0.012, fillet: 0.005, bevel: 0.005,
  })
  // Every faceplate is bolted to the rails at its corners; that is the detail
  // that makes a stack read as rack-mounted rather than as a shelf of boxes.
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      bolt(root, m.steel, [sx * (WIDTH * 0.5 - 0.06), y + sy * (height * 0.5 - 0.014), z + 0.01], 0.008, 'front')
    }
  }
  if (unit.kind === 'blank') {
    seam(root, m.shellShade, WIDTH - 0.16, [0, y, z + 0.01], 'front', 'across', 0.014, 0.008)
    return
  }
  if (unit.kind === 'server') {
    box(root, m.ink, [WIDTH - 0.2, height - 0.016, 0.012], [0, y, z + 0.014], {
      chamfer: 0.008, fillet: 0.004, bevel: 0.003,
    })
    // The intake bank stops short of the right-hand end, because the lamp column
    // has to sit on the dark well and not straddle its edge onto the faceplate
    // 10 mm behind it.
    for (let index = 0; index < 5; index += 1) {
      box(root, m.graphiteEdge, [0.055, height - 0.024, 0.008], [-0.18 + index * 0.08, y, z + 0.02], {
        chamfer: 0.004, fillet: 0.002, bevel: 0.002,
      })
    }
    statusLens(root, m, [0.02, 0.012], [WIDTH * 0.5 - 0.14, y + height * 0.24, z + 0.02], m.cyan, 'front')
    statusLens(root, m, [0.02, 0.012], [WIDTH * 0.5 - 0.14, y - height * 0.24, z + 0.02], m.amber, 'front')
    for (const sx of [-1, 1]) {
      root.add(cylinder(m.steel, 0.008, 0.035, [sx * (WIDTH * 0.5 - 0.11), y, z + 0.03], AXIS_Z, 6))
    }
    return
  }
  if (unit.kind === 'display') {
    box(root, m.ink, [WIDTH - 0.18, height - 0.03, 0.014], [0, y + 0.008, z + 0.014], {
      chamfer: 0.014, fillet: 0.006, bevel: 0.005,
    })
    statusLens(root, m, [WIDTH - 0.24, height - 0.06], [0, y + 0.008, z + 0.021], m.cyan, 'front')
    const label = addLabelDecal(bundle, { variant: 300 })
    plaque(root, m, label, [0.14, 0.02], [0, y - height * 0.36, z + 0.01], 'front', m.graphite)
    return
  }
  // Patch panel: a row of ports in a dark well.
  box(root, m.ink, [WIDTH - 0.16, height - 0.026, 0.012], [0, y, z + 0.014], {
    chamfer: 0.008, fillet: 0.004, bevel: 0.003,
  })
  for (let index = 0; index < 8; index += 1) {
    box(root, m.graphiteEdge, [0.03, 0.02, 0.008], [-0.22 + index * 0.063, y + 0.01, z + 0.02], {
      chamfer: 0.004, fillet: 0.002, bevel: 0.002,
    })
  }
}

function build(): { root: Group; sockets: RackSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(61_400, { condition: 0.42 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_INDUSTRIAL_EQUIPMENT-RACK_ROOT_LIVE'

  // Plinth with a fan tray drawing air in at the front. It stands on its feet
  // rather than over them: a 0.06 disc buried in the slab is a levelling foot
  // that never appears in any frame.
  const plinthY = (PLINTH + PLINTH_BOTTOM) * 0.5
  box(root, m.graphite, [WIDTH, PLINTH - PLINTH_BOTTOM, DEPTH], [0, plinthY, 0], {
    chamfer: 0.04, fillet: 0.014, bevel: 0.011, capChamfer: 0.026,
  })
  louvreVent(root, m, [WIDTH - 0.24, PLINTH - 0.04], [0, plinthY, DEPTH * 0.5 - 0.01], 3, 'front')
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      groundPad(root, m.rubber, [0.09, 0.09], [sx * (WIDTH * 0.5 - 0.07), 0, sz * (DEPTH * 0.5 - 0.07)], FOOT)
    }
  }

  // Frame: four corner posts and punched mounting rails front and back.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      tubeSection(root, m.shell, [0.05, 0.05], 0.008, HEIGHT - PLINTH, [
        sx * (WIDTH * 0.5 - 0.025), PLINTH + (HEIGHT - PLINTH) * 0.5, sz * (DEPTH * 0.5 - 0.025),
      ], [Math.PI / 2, 0, 0])
    }
    // Mounting rail with its U pitch punched through.
    box(root, m.graphiteEdge, [0.03, HEIGHT - PLINTH - 0.06, 0.05], [sx * (WIDTH * 0.5 - 0.05), PLINTH + (HEIGHT - PLINTH) * 0.5, RAIL_Z], {
      chamfer: 0.008, fillet: 0.003, bevel: 0.003,
    })
    const holes = Math.floor((HEIGHT - PLINTH - 0.12) / U)
    for (let index = 0; index < holes; index += 1) {
      root.add(extrudeProfile(m.ink, slot(0.007, 0.011, 0.003), 0.012, [
        sx * (WIDTH * 0.5 - 0.05), PLINTH + 0.08 + index * U, RAIL_Z + 0.026,
      ], { fillet: 0.002, bevel: 0.002 }))
    }
  }
  // Side skins and a vented roof.
  for (const sx of [-1, 1]) {
    box(root, m.shellShade, [0.02, HEIGHT - PLINTH - 0.1, DEPTH - 0.1], [sx * (WIDTH * 0.5 - 0.005), PLINTH + (HEIGHT - PLINTH) * 0.5, 0], {
      chamfer: 0.02, fillet: 0.008, bevel: 0.007,
    })
  }
  box(root, m.shellShade, [WIDTH, HEIGHT - PLINTH - 0.1, 0.02], [0, PLINTH + (HEIGHT - PLINTH) * 0.5, -(DEPTH * 0.5 - 0.005)], {
    chamfer: 0.02, fillet: 0.008, bevel: 0.007,
  })
  box(root, m.shellLight, [WIDTH, ROOF, DEPTH], [0, ROOF_Y, 0], {
    chamfer: 0.03, fillet: 0.011, bevel: 0.009, capChamfer: 0.02,
  })
  for (const sz of [-1, 1]) {
    louvreVent(root, m, [WIDTH - 0.2, 0.14], [0, ROOF_TOP, sz * (DEPTH * 0.25)], 3, 'top')
  }

  // Populate the U space from the bottom up, then blank whatever the stack does
  // not reach. Left as drawn it stopped 230 mm below the roof and the head of
  // the rack was an open slot onto an empty shell.
  let cursor = PLINTH + 0.06
  for (const unit of STACK) {
    faceplate(root, m, unit, cursor + unit.u * U * 0.5, bundle)
    cursor += unit.u * U
  }
  const headroom = ROOF_Y - ROOF * 0.5 - cursor
  faceplate(root, m, { u: headroom / U, kind: 'blank' }, cursor + headroom * 0.5, bundle)

  // Cable entry at the back, with a bundle dropping out of it. The gland box
  // stands clear of the back panel so the run leaves the rack instead of lying
  // a millimetre off its skin down the whole drop.
  box(root, m.graphite, [WIDTH - 0.2, 0.06, 0.07], [0, HEIGHT - 0.09, -(DEPTH * 0.5 + 0.02)], {
    chamfer: 0.016, fillet: 0.006, bevel: 0.005,
  })
  for (let index = 0; index < 5; index += 1) {
    root.add(cylinder(m.rubber, 0.014, 0.5, [-0.16 + index * 0.08, HEIGHT - 0.34, -(DEPTH * 0.5 + 0.04)], AXIS_Y, 6))
  }
  root.add(cylinder(m.rubber, 0.04, 0.3, [0, HEIGHT - 0.62, -(DEPTH * 0.5 + 0.06)], [0.3, 0, 0], 8))

  // Asset label on the roof's own face, between the two vent fields. At z 0.24
  // it was inside the +Z louvre and the plan view showed two vents and no label.
  const label = addLabelDecal(bundle, { variant: 305 })
  plaque(root, m, label, [0.2, 0.07], [0, ROOF_TOP, 0], 'top', m.shellLight)

  const sockets: RackSockets = {
    slot_low: socket('slot_low', [0, PLINTH + 0.2, DEPTH * 0.5 + 0.05]),
    slot_mid: socket('slot_mid', [0, HEIGHT * 0.5, DEPTH * 0.5 + 0.05]),
    slot_high: socket('slot_high', [0, HEIGHT - 0.3, DEPTH * 0.5 + 0.05]),
    cable_entry: socket('cable_entry', [0, HEIGHT - 0.09, -(DEPTH * 0.5 + 0.08)]),
  }
  return { root, sockets, bundle }
}

export function createModel(): EquipmentRackController {
  const { root, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'industrial-equipment-rack',
    reach: 0.12,
    sockets: Object.values(sockets),
  })

  let state: RackState = 'live'
  let elapsed = 0
  const applyState = (next: RackState): RackState => {
    state = next
    root.name = next === 'standby'
      ? 'AXR_INDUSTRIAL_EQUIPMENT-RACK_ROOT_STANDBY'
      : 'AXR_INDUSTRIAL_EQUIPMENT-RACK_ROOT_LIVE'
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
      const live = state === 'live'
      bundle.materials.cyan.emissiveIntensity = live ? 1.7 + Math.sin(elapsed * 3.1) * 0.25 : 0.35
      // The amber fault lamps blink out of phase with the cyan activity ones, so
      // the rack reads as many independent machines rather than one animation.
      bundle.materials.amber.emissiveIntensity = live ? 1.4 + Math.abs(Math.sin(elapsed * 1.7)) * 0.9 : 0
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: RackState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'live')
  return createCargoPreview(model, {
    target: [0, HEIGHT * 0.5, 0],
    distance: 4.9,
    yaw: 0.6,
    pitch: 0.18,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createStandbyPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'standby' })
