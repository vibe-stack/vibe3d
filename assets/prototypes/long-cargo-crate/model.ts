import { Group, Object3D } from 'three/webgpu'

import { cylinder, prism } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
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
  toggleLatch,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay long freight crate.
 *
 * Built for spars, barrels, and rail sections: a shallow box stretched past the
 * point where a single pair of latches would hold it shut, which is why it
 * carries four and why the lid gets a full-length spine. Its two saddle feet lift
 * it off the deck so a strap can pass underneath - the detail that separates a
 * long crate from a plank.
 */

const LENGTH = 2.52
const DEPTH = 0.56
const HEIGHT = 0.6
const FOOT = 0.1
const LID = 0.15

type Side = -1 | 1

interface LongCrateSockets {
  lid_hinge: Object3D
  strap_fore: Object3D
  strap_aft: Object3D
  stack_top: Object3D
}

export type LongCrateState = 'sealed' | 'open'

export interface LongCrateController {
  root: Group
  parts: { hull: Group; lid: Group }
  sockets: LongCrateSockets
  readonly state: LongCrateState
  setState(state: LongCrateState): LongCrateState
  update(deltaSeconds: number): void
  dispose(): void
}

function hullBody(hull: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  const bodyHeight = HEIGHT - FOOT - LID
  const bodyY = FOOT + bodyHeight * 0.5

  box(hull, m.shell, [LENGTH, bodyHeight, DEPTH], [0, bodyY, 0], {
    chamfer: 0.075, fillet: 0.024, bevel: 0.018, capChamfer: 0.05,
  })

  // A continuous base rail rather than two isolated pads. On a crate this long
  // and shallow, two small feet leave the silhouette as one unbroken light bar;
  // the rail gives it the dark lower third every reference in the family has,
  // and still leaves the strap route clear between the saddles.
  box(hull, m.graphite, [LENGTH - 0.06, FOOT * 0.55, DEPTH - 0.04], [0, FOOT * 0.28, 0], {
    chamfer: 0.03, fillet: 0.011, bevel: 0.01, capChamfer: 0.02,
  })
  // Saddle feet. Two, not four, because a long shallow box wants a strap route
  // under its middle third and legs at the ends would fight it.
  for (const x of [-0.78, 0.78]) {
    box(hull, m.graphite, [0.42, FOOT, DEPTH + 0.03], [x, FOOT * 0.5, 0], {
      chamfer: 0.04, fillet: 0.014, bevel: 0.012, capChamfer: 0.03,
    })
    box(hull, m.rubber, [0.4, 0.024, DEPTH - 0.06], [x, 0.012, 0], {
      chamfer: 0.02, fillet: 0.008, bevel: 0.006,
    })
    const stripe = addStripeDecal(bundle, { count: 3, lean: 1 })
    plaque(hull, m, stripe, [0.28, 0.05], [x, FOOT * 0.52, DEPTH * 0.5 + 0.018], 'front', m.ink)
  }

  // Ribs at the same 0.24 cadence as the container wall, so the two read as one
  // manufacturer even though nothing else about them matches.
  const frontZ = DEPTH * 0.5 + 0.004
  for (let index = 0; index < 9; index += 1) {
    const x = (index / 8 - 0.5) * (LENGTH - 0.52)
    for (const sz of [-1, 1] as Side[]) {
      box(hull, m.shellShade, [0.13, bodyHeight - 0.09, 0.04], [x, bodyY, sz * frontZ], {
        chamfer: 0.028, fillet: 0.009, bevel: 0.01,
        rotation: [0, sz > 0 ? 0 : Math.PI, 0],
      })
    }
  }
  for (const sz of [-1, 1] as Side[]) {
    seam(hull, m.shell, LENGTH - 0.34, [0, bodyY - bodyHeight * 0.5 + 0.035, sz * frontZ], sz > 0 ? 'front' : 'back', 'across', 0.03, 0.018)
  }

  const label = addLabelDecal(bundle, { variant: 2 })
  plaque(hull, m, label, [0.34, 0.12], [-0.98, bodyY, frontZ + 0.006], 'front', m.shellLight)
  statusLens(hull, m, [0.1, 0.035], [1.02, bodyY, frontZ + 0.006], m.cyan, 'front')
  paintMark(hull, m.amberPaint, slashProfile(0.1, 0.2, 0.5), [0.62, bodyY, -frontZ - 0.006], 'back', 0.011)
  paintMark(hull, m.amberPaint, slashProfile(0.05, 0.2, 0.5), [0.75, bodyY, -frontZ - 0.006], 'back', 0.011)
  boltRun(hull, m.steel, [-1.1, bodyY + 0.09, -frontZ - 0.006], [1.1, bodyY + 0.09, -frontZ - 0.006], 9, 0.015, 'back')

  for (const side of [-1, 1] as Side[]) {
    const face = side > 0 ? 'right' : 'left'
    recessedHandle(hull, m, [0.3, 0.1], [side * (LENGTH * 0.5 + 0.004), bodyY, 0], face)
  }
}

function lidBody(lid: Group, m: CargoMaterials): void {
  box(lid, m.shellLight, [LENGTH + 0.02, LID, DEPTH + 0.02], [0, LID * 0.5, DEPTH * 0.5 - 0.035], {
    chamfer: 0.07, fillet: 0.022, bevel: 0.016, capChamfer: 0.045,
  })
  // Full-length spine. A lid this long needs a visible reason not to bow.
  box(lid, m.shellShade, [LENGTH - 0.24, 0.05, 0.17], [0, LID + 0.012, DEPTH * 0.5 - 0.035], {
    chamfer: 0.04, fillet: 0.014, bevel: 0.01,
  })
  box(lid, m.ink, [LENGTH - 0.34, 0.03, 0.07], [0, LID + 0.03, DEPTH * 0.5 - 0.035], {
    chamfer: 0.02, fillet: 0.008, bevel: 0.006,
  })
  for (const x of [-0.62, 0.62]) {
    seam(lid, m.shellLight, DEPTH - 0.1, [x, LID, DEPTH * 0.5 - 0.035], 'top', 'along', 0.026, 0.016)
  }
  for (const x of [-0.86, 0, 0.86]) {
    lid.add(prism(m.graphiteEdge, [0.14, 0.09, 0.08], [x, LID * 0.55, 0.02], {
      chamfer: 0.026, fillet: 0.009, bevel: 0.007,
    }))
    lid.add(cylinder(m.steel, 0.022, 0.18, [x, LID * 0.55, 0], AXIS_X, 8))
  }
}

function build(): { root: Group; hull: Group; lid: Group; sockets: LongCrateSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(52_800, { condition: 0.58 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_LONG-CARGO-CRATE_ROOT_SEALED'
  const hull = new Group()
  hull.name = 'AXR_CARGO_LONG-CARGO-CRATE_PART_HULL_DEFAULT'
  const lid = new Group()
  lid.name = 'AXR_CARGO_LONG-CARGO-CRATE_PART_LID_CLOSED'
  root.add(hull, lid)

  hullBody(hull, m, bundle)
  lid.position.set(0, HEIGHT - LID, -(DEPTH * 0.5 - 0.035))
  lidBody(lid, m)

  for (const x of [-0.94, -0.32, 0.32, 0.94]) {
    toggleLatch(hull, m, [x, HEIGHT - LID - 0.012, DEPTH * 0.5 + 0.004], 0.8, 'front')
  }

  const sockets: LongCrateSockets = {
    lid_hinge: socket('lid_hinge', [0, HEIGHT - LID, -(DEPTH * 0.5 - 0.035)]),
    strap_fore: socket('strap_fore', [0.36, FOOT * 0.5, 0]),
    strap_aft: socket('strap_aft', [-0.36, FOOT * 0.5, 0]),
    stack_top: socket('stack_top', [0, HEIGHT, 0]),
  }
  return { root, hull, lid, sockets, bundle }
}

export function createModel(): LongCrateController {
  const { root, hull, lid, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'long-cargo-crate',
    assemblies: [lid],
    reach: 0.14,
    sockets: Object.values(sockets),
  })

  let state: LongCrateState = 'sealed'
  let blend = 0
  let elapsed = 0
  const applyBlend = (): void => {
    lid.rotation.x = -blend * 1.45
    lid.name = blend > 0.02
      ? 'AXR_CARGO_LONG-CARGO-CRATE_PART_LID_OPEN'
      : 'AXR_CARGO_LONG-CARGO-CRATE_PART_LID_CLOSED'
  }

  return {
    root,
    parts: { hull, lid },
    sockets,
    get state() {
      return state
    },
    setState: (next: LongCrateState) => {
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
        blend += Math.sign(target - blend) * Math.min(Math.abs(target - blend), step * 0.9)
        applyBlend()
      }
      bundle.materials.cyan.emissiveIntensity = 1.5 + Math.sin(elapsed * 2.3) * 0.2
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: LongCrateState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'sealed')
  return createCargoPreview(model, {
    target: [0, HEIGHT * 0.5, 0],
    distance: 5.4,
    yaw: 0.82,
    pitch: 0.32,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createOpenPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'open' })
