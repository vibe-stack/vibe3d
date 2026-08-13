import { Group, Object3D } from 'three/webgpu'

import { cylinder, prism } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_Y,
  acquireCargoMaterials,
  addLabelDecal,
  box,
  boltRun,
  createCargoPreview,
  finishModel,
  lidHinge,
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
 * Axiom Relay military field case.
 *
 * Man-portable, so everything about it is sized to a gloved hand: a sprung top
 * grip, two oversized latches, moulded corner bumpers, and a pressure-equalising
 * valve that tells you it has been flown. The shell is graphite rather than the
 * pack's light coat, because a field case is issued to be invisible.
 */

const WIDTH = 0.74
const DEPTH = 0.48
const HEIGHT = 0.38
const LID = 0.14
/**
 * Hinge line, behind both leaves.
 *
 * The lid used to swing about a point 30 mm inboard of the body's own back face,
 * which drove the leaf's back-bottom corner 34 mm through the hull on the way
 * open. A barrel hinge pivots on its pin and the pin is outside the box, so the
 * axis is the lid's back face plus the pin radius.
 */
const LID_PIVOT = DEPTH * 0.5 + 0.019

interface MilitaryCaseSockets {
  lid_hinge: Object3D
  grip: Object3D
  valve: Object3D
}

export type MilitaryCaseState = 'sealed' | 'open'

export interface MilitaryCaseController {
  root: Group
  parts: { hull: Group; lid: Group }
  sockets: MilitaryCaseSockets
  readonly state: MilitaryCaseState
  setState(state: MilitaryCaseState): MilitaryCaseState
  update(deltaSeconds: number): void
  dispose(): void
}

/** Moulded corner bumper, proud on all three faces it touches. */
function bumper(parent: Group, m: CargoMaterials, x: number, y: number, z: number): void {
  box(parent, m.rubber, [0.11, 0.09, 0.11], [x, y, z], { chamfer: 0.035, fillet: 0.012, bevel: 0.01 })
  // The wear band belts the block, so it has to be wider than it. Drawn inside
  // the rubber at the same centre it was a part that appeared in no frame.
  box(parent, m.graphiteEdge, [0.125, 0.03, 0.125], [x, y, z], { chamfer: 0.024, fillet: 0.008, bevel: 0.007 })
}

function hullBody(hull: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  const bodyHeight = HEIGHT - LID
  const bodyY = bodyHeight * 0.5

  box(hull, m.graphite, [WIDTH, bodyHeight, DEPTH], [0, bodyY, 0], {
    chamfer: 0.055, fillet: 0.018, bevel: 0.014, capChamfer: 0.035,
  })
  // Rib field. Shallow and close-pitched, which is what makes a small case read
  // as moulded rather than as a shrunken freight crate.
  const ribZ = DEPTH * 0.5 + 0.006
  const ribThickness = 0.018
  for (let index = 0; index < 7; index += 1) {
    const x = (index / 6 - 0.5) * (WIDTH - 0.26)
    for (const sz of [-1, 1]) {
      box(hull, m.graphiteEdge, [0.045, bodyHeight - 0.11, ribThickness], [x, bodyY, sz * ribZ], {
        chamfer: 0.012, fillet: 0.005, bevel: 0.005,
        rotation: [0, sz > 0 ? 0 : Math.PI, 0],
      })
    }
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      bumper(hull, m, sx * (WIDTH * 0.5 - 0.03), 0.045, sz * (DEPTH * 0.5 - 0.03))
    }
  }

  // The plaque, lens and bolts are all applied to the ribs, so they measure from
  // the rib face and not from the skin 15 mm behind it.
  const frontZ = ribZ + ribThickness * 0.5
  const label = addLabelDecal(bundle, { variant: 33, ground: 0x4a5963, mark: 0x071019 })
  plaque(hull, m, label, [0.22, 0.09], [-0.16, bodyY + 0.02, frontZ], 'front', m.ink)
  statusLens(hull, m, [0.07, 0.028], [0.17, bodyY + 0.02, frontZ], m.cyan, 'front')
  // The rib field and the corner bumpers between them own the whole front, so
  // the ownership slash goes on the clear end panel opposite the valve. Drawn on
  // the front it stood 13 mm off bare skin and ran into a bumper.
  paintMark(hull, m.amberPaint, slashProfile(0.055, 0.09, 0.5), [-WIDTH * 0.5, bodyY, 0], 'left', 0.009)
  // The seam runs below the rib field, so its host is the shell skin.
  seam(hull, m.graphite, WIDTH - 0.2, [0, bodyY - bodyHeight * 0.5 + 0.035, DEPTH * 0.5], 'front', 'across', 0.02, 0.013)
  boltRun(hull, m.steel, [-0.24, bodyY, -frontZ], [0.24, bodyY, -frontZ], 4, 0.013, 'back')

  // Pressure valve on the short end: a knurled cap in a sunk boss.
  const endX = WIDTH * 0.5 + 0.008
  box(hull, m.ink, [0.03, 0.11, 0.11], [endX, bodyY, -0.1], { chamfer: 0.03, fillet: 0.01, bevel: 0.008 })
  hull.add(cylinder(m.steel, 0.028, 0.05, [endX + 0.02, bodyY, -0.1], [0, 0, Math.PI / 2], 10))
  hull.add(cylinder(m.amberPaint, 0.016, 0.06, [endX + 0.035, bodyY, -0.1], [0, 0, Math.PI / 2], 6))
}

function lidBody(lid: Group, m: CargoMaterials): void {
  const lidBack = LID_PIVOT - (DEPTH + 0.008) * 0.5

  box(lid, m.graphite, [WIDTH + 0.008, LID, DEPTH + 0.008], [0, LID * 0.5, LID_PIVOT], {
    chamfer: 0.05, fillet: 0.016, bevel: 0.013, capChamfer: 0.032,
  })
  box(lid, m.ink, [WIDTH - 0.2, 0.024, DEPTH - 0.14], [0, LID - 0.006, LID_PIVOT], {
    chamfer: 0.04, fillet: 0.013, bevel: 0.009,
  })
  box(lid, m.graphiteEdge, [WIDTH - 0.28, 0.02, DEPTH - 0.2], [0, LID + 0.002, LID_PIVOT], {
    chamfer: 0.035, fillet: 0.012, bevel: 0.008,
  })
  // Sprung top grip: two posts and a rubber-wrapped bar.
  for (const sx of [-1, 1]) {
    lid.add(prism(m.graphiteEdge, [0.05, 0.055, 0.05], [sx * 0.11, LID + 0.02, LID_PIVOT], {
      chamfer: 0.016, fillet: 0.006, bevel: 0.005,
    }))
    lid.add(cylinder(m.steel, 0.012, 0.055, [sx * 0.11, LID + 0.045, LID_PIVOT], AXIS_Y, 8))
  }
  lid.add(cylinder(m.rubber, 0.019, 0.24, [0, LID + 0.066, LID_PIVOT], [0, 0, Math.PI / 2], 10))
  // A barrel on the swing axis, its knuckles clear of the lid's own back face
  // and a strap off each one onto both leaves. Drawn 48 mm inside the leaf the
  // whole hinge rendered as nothing and the case back read as an unbroken shell.
  lidHinge(lid, m, WIDTH - 0.1, [0, 0, 0], 'x', 2, 0.018, 0.07, lidBack)
}

function build(): { root: Group; hull: Group; lid: Group; sockets: MilitaryCaseSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(53_600, { condition: 0.7 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_MILITARY-CASE_ROOT_SEALED'
  const hull = new Group()
  hull.name = 'AXR_CARGO_MILITARY-CASE_PART_HULL_DEFAULT'
  const lid = new Group()
  lid.name = 'AXR_CARGO_MILITARY-CASE_PART_LID_CLOSED'
  root.add(hull, lid)

  hullBody(hull, m, bundle)
  lid.position.set(0, HEIGHT - LID, -LID_PIVOT)
  lidBody(lid, m)
  for (const x of [-0.21, 0.21]) {
    toggleLatch(hull, m, [x, HEIGHT - LID - 0.008, DEPTH * 0.5], 0.72, 'front')
  }

  const sockets: MilitaryCaseSockets = {
    lid_hinge: socket('lid_hinge', [0, HEIGHT - LID, -LID_PIVOT]),
    grip: socket('grip', [0, HEIGHT + 0.09, 0]),
    valve: socket('valve', [WIDTH * 0.5 + 0.06, (HEIGHT - LID) * 0.5, -0.1]),
  }
  return { root, hull, lid, sockets, bundle }
}

export function createModel(): MilitaryCaseController {
  const { root, hull, lid, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'military-case',
    assemblies: [lid],
    reach: 0.1,
    sockets: Object.values(sockets),
  })

  let state: MilitaryCaseState = 'sealed'
  let blend = 0
  let elapsed = 0
  const applyBlend = (): void => {
    lid.rotation.x = -blend * 1.55
    lid.name = blend > 0.02
      ? 'AXR_CARGO_MILITARY-CASE_PART_LID_OPEN'
      : 'AXR_CARGO_MILITARY-CASE_PART_LID_CLOSED'
  }

  return {
    root,
    parts: { hull, lid },
    sockets,
    get state() {
      return state
    },
    setState: (next: MilitaryCaseState) => {
      state = next
      blend = next === 'open' ? 1 : 0
      applyBlend()
      return state
    },
    update: (deltaSeconds: number) => {
      const step = Math.min(Math.max(deltaSeconds, 0), 0.05)
      elapsed += step
      const target = state === 'open' ? 1 : 0
      if (Math.abs(target - blend) > 1e-4) {
        blend += Math.sign(target - blend) * Math.min(Math.abs(target - blend), step)
        applyBlend()
      }
      bundle.materials.cyan.emissiveIntensity = 1.6 + Math.sin(elapsed * 2.4) * 0.25
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: MilitaryCaseState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'sealed')
  return createCargoPreview(model, {
    target: [0, HEIGHT * 0.55, 0],
    distance: 1.92,
    yaw: 0.78,
    pitch: 0.34,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createOpenPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'open' })
