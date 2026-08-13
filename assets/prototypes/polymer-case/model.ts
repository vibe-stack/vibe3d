import { Group, Object3D } from 'three/webgpu'

import { cylinder, prism } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  acquireCargoMaterials,
  addLabelDecal,
  box,
  createCargoPreview,
  finishModel,
  groundPad,
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
 * Axiom Relay polymer instrument case.
 *
 * The lightest object in the wave, and it has to look it. Everything that makes
 * the metal crates read heavy is deliberately absent: no corner castings, no
 * bolts, no skirt. Instead the whole shell is one moulded form with a generous
 * draft, a wrap-around parting line, and thin blade ribs - the language of a
 * tool that came out of an injection mould in one piece.
 */

const WIDTH = 0.62
const DEPTH = 0.44
const HEIGHT = 0.23
const LID = 0.095
/**
 * Hinge line, behind the lid's own back face.
 *
 * The lid box is offset forward by the same amount the group is set back, so the
 * closed case is unchanged and the moulded pin becomes the axis the leaf swings
 * about instead of a rod buried 39 mm inside it.
 */
const LID_PIVOT = DEPTH * 0.5 + 0.019

interface PolymerCaseSockets {
  lid_hinge: Object3D
  grip: Object3D
  stack_top: Object3D
}

export type PolymerCaseState = 'sealed' | 'open'

export interface PolymerCaseController {
  root: Group
  parts: { hull: Group; lid: Group }
  sockets: PolymerCaseSockets
  readonly state: PolymerCaseState
  setState(state: PolymerCaseState): PolymerCaseState
  update(deltaSeconds: number): void
  dispose(): void
}

function hullBody(hull: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  const bodyHeight = HEIGHT - LID
  const bodyY = bodyHeight * 0.5

  box(hull, m.shell, [WIDTH, bodyHeight, DEPTH], [0, bodyY, 0], {
    chamfer: 0.07, fillet: 0.026, bevel: 0.02, capChamfer: 0.045,
  })
  // A base band, which is what the reference has and what stops the case from
  // being a single unbroken light value. Even a moulded case is two-tier: the
  // shell is one moulding and the base it stands on is another.
  box(hull, m.graphite, [WIDTH - 0.03, 0.028, DEPTH - 0.03], [0, 0.014, 0], {
    chamfer: 0.045, fillet: 0.016, bevel: 0.009,
  })
  // The parting line is the case's strongest single feature; it wraps the whole
  // shell just under the lid and is what says "moulded in two halves".
  for (const sz of [-1, 1]) {
    seam(hull, m.shellLight, WIDTH - 0.12, [0, bodyHeight - 0.014, sz * DEPTH * 0.5], sz > 0 ? 'front' : 'back', 'across', 0.02, 0.012)
  }
  for (const sx of [-1, 1]) {
    seam(hull, m.shellLight, DEPTH - 0.1, [sx * WIDTH * 0.5, bodyHeight - 0.014, 0], sx > 0 ? 'right' : 'left', 'across', 0.02, 0.012)
  }

  // Blade ribs on the underside corners: the moulded stand-offs a case rests on.
  // They reach past the base band in plan and sit a millimetre below its sole,
  // because a stand-off drawn inside the band is a foot the case never uses.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      groundPad(hull, m.shellShade, [0.11, 0.11], [
        sx * (WIDTH * 0.5 - 0.06), 0, sz * (DEPTH * 0.5 - 0.06),
      ], 0.016)
    }
  }

  // The graphic field is the host for everything on the front, so it laps the
  // shell by half its thickness and the details measure from its own face.
  const panelThickness = 0.014
  box(hull, m.shellShade, [WIDTH - 0.16, bodyHeight - 0.03, panelThickness], [0, bodyY - 0.008, DEPTH * 0.5], {
    chamfer: 0.025, fillet: 0.014, bevel: 0.008,
  })
  const panelZ = DEPTH * 0.5 + panelThickness * 0.5
  const label = addLabelDecal(bundle, { variant: 41 })
  plaque(hull, m, label, [0.18, 0.055], [-0.11, bodyY - 0.008, panelZ], 'front', m.shell)
  statusLens(hull, m, [0.055, 0.02], [0.06, bodyY - 0.008, panelZ], m.cyan, 'front')
  // Dropped below the panel's centre line to clear the latch keeper, which comes
  // down to y 0.077 over the same stretch of panel.
  paintMark(hull, m.orangePaint, slashProfile(0.04, 0.055, 0.5), [0.19, 0.044, panelZ], 'front', 0.008)

  // Recessed side grips moulded into the short ends.
  for (const sx of [-1, 1]) {
    box(hull, m.shellShade, [0.02, 0.055, 0.2], [sx * (WIDTH * 0.5 + 0.004), bodyY, 0], {
      chamfer: 0.022, fillet: 0.008, bevel: 0.006,
    })
    box(hull, m.rubber, [0.016, 0.032, 0.16], [sx * (WIDTH * 0.5 + 0.016), bodyY, 0], {
      chamfer: 0.014, fillet: 0.006, bevel: 0.005,
    })
  }
}

function lidBody(lid: Group, m: CargoMaterials): void {
  const lidBack = LID_PIVOT - (DEPTH + 0.006) * 0.5

  box(lid, m.shell, [WIDTH + 0.006, LID, DEPTH + 0.006], [0, LID * 0.5, LID_PIVOT], {
    chamfer: 0.065, fillet: 0.024, bevel: 0.018, capChamfer: 0.04,
  })
  // A single sunk oval on the crown, the moulded badge recess.
  box(lid, m.shellShade, [WIDTH - 0.22, 0.016, DEPTH - 0.16], [0, LID - 0.004, LID_PIVOT], {
    chamfer: 0.05, fillet: 0.018, bevel: 0.009,
  })
  box(lid, m.graphiteEdge, [0.13, 0.012, 0.09], [0, LID + 0.004, LID_PIVOT], {
    chamfer: 0.028, fillet: 0.01, bevel: 0.006,
  })
  // Living-hinge blocks: wide and shallow, not steel knuckles. The pin is the
  // swing axis and the blocks lap the leaf from behind it, so both are outside
  // the lid box - drawn inside it the whole hinge appeared in no frame.
  for (const sx of [-1, 1]) {
    lid.add(prism(m.shellShade, [0.16, 0.05, 0.05], [sx * 0.17, 0.025, lidBack + 0.014], {
      chamfer: 0.016, fillet: 0.006, bevel: 0.005,
    }))
    lid.add(cylinder(m.graphiteEdge, 0.016, 0.19, [sx * 0.17, 0, 0], AXIS_X, 8))
  }
}

function build(): { root: Group; hull: Group; lid: Group; sockets: PolymerCaseSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(53_800, { condition: 0.3 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_POLYMER-CASE_ROOT_SEALED'
  const hull = new Group()
  hull.name = 'AXR_CARGO_POLYMER-CASE_PART_HULL_DEFAULT'
  const lid = new Group()
  lid.name = 'AXR_CARGO_POLYMER-CASE_PART_LID_CLOSED'
  root.add(hull, lid)

  hullBody(hull, m, bundle)
  lid.position.set(0, HEIGHT - LID, -LID_PIVOT)
  lidBody(lid, m)
  for (const x of [-0.17, 0.17]) {
    toggleLatch(hull, m, [x, HEIGHT - LID - 0.006, DEPTH * 0.5], 0.52, 'front', m.orangePaint)
  }

  const sockets: PolymerCaseSockets = {
    lid_hinge: socket('lid_hinge', [0, HEIGHT - LID, -LID_PIVOT]),
    grip: socket('grip', [WIDTH * 0.5 + 0.04, (HEIGHT - LID) * 0.5, 0]),
    stack_top: socket('stack_top', [0, HEIGHT, 0]),
  }
  return { root, hull, lid, sockets, bundle }
}

export function createModel(): PolymerCaseController {
  const { root, hull, lid, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'polymer-case',
    assemblies: [lid],
    reach: 0.08,
    sockets: Object.values(sockets),
  })

  let state: PolymerCaseState = 'sealed'
  let blend = 0
  let elapsed = 0
  const applyBlend = (): void => {
    lid.rotation.x = -blend * 1.68
    lid.name = blend > 0.02
      ? 'AXR_CARGO_POLYMER-CASE_PART_LID_OPEN'
      : 'AXR_CARGO_POLYMER-CASE_PART_LID_CLOSED'
  }

  return {
    root,
    parts: { hull, lid },
    sockets,
    get state() {
      return state
    },
    setState: (next: PolymerCaseState) => {
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
        blend += Math.sign(target - blend) * Math.min(Math.abs(target - blend), step * 1.1)
        applyBlend()
      }
      bundle.materials.cyan.emissiveIntensity = 1.65 + Math.sin(elapsed * 2.7) * 0.2
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: PolymerCaseState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'sealed')
  return createCargoPreview(model, {
    target: [0, HEIGHT * 0.5, 0],
    distance: 1.5,
    yaw: 0.76,
    pitch: 0.36,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createOpenPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'open' })
