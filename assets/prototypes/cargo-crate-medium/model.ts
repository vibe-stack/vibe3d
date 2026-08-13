import { Group, Object3D } from 'three/webgpu'

import {
  acquireCargoMaterials,
  addLabelDecal,
  addStripeDecal,
  box,
  boltRun,
  createCargoPreview,
  finishModel,
  lidHinge,
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
 * Axiom Relay medium freight crate.
 *
 * The two-hand size of the family: still machine-stackable, but carried by a
 * pair of operators using the end handles rather than a fork. It drops the
 * container's fork pockets and conditioning bay and earns its character from a
 * deep recessed lid channel and a pair of over-centre latches.
 */

const WIDTH = 1.2
const DEPTH = 0.86
const HEIGHT = 0.84
const SKIRT = 0.14
const LID = 0.19
/**
 * How far each mass in the stack reaches past the one under it.
 *
 * Skirt, body, and lid were sized to meet exactly: the body's bottom cap on the
 * skirt's top, the lid's on the body's. Two caps on a shared plane read as a
 * hard black line rather than as a joint, which is what the shut line under this
 * crate's lid photographs as from every angle above the horizon.
 */
const LAP = 0.02
const BODY_HEIGHT = HEIGHT - SKIRT - LID + LAP
const BODY_Y = SKIRT - LAP + BODY_HEIGHT * 0.5

type Side = -1 | 1

interface CrateSockets {
  lid_hinge: Object3D
  carry_left: Object3D
  carry_right: Object3D
  stack_top: Object3D
}

export type MediumCrateState = 'sealed' | 'open'

export interface MediumCrateController {
  root: Group
  parts: { hull: Group; lid: Group }
  sockets: CrateSockets
  readonly state: MediumCrateState
  setState(state: MediumCrateState): MediumCrateState
  update(deltaSeconds: number): void
  dispose(): void
}

function hullBody(hull: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  box(hull, m.graphite, [WIDTH - 0.02, SKIRT, DEPTH - 0.02], [0, SKIRT * 0.5, 0], {
    chamfer: 0.06, fillet: 0.02, bevel: 0.016, capChamfer: 0.04,
  })
  box(hull, m.shell, [WIDTH, BODY_HEIGHT, DEPTH], [0, BODY_Y, 0], {
    chamfer: 0.085, fillet: 0.028, bevel: 0.02, capChamfer: 0.06,
  })

  // Corner posts, kept narrow so the crate reads lighter than the large one.
  for (const sx of [-1, 1] as Side[]) {
    for (const sz of [-1, 1] as Side[]) {
      box(hull, m.graphiteEdge, [0.13, BODY_HEIGHT + 0.02, 0.13], [
        sx * (WIDTH * 0.5 - 0.075), BODY_Y, sz * (DEPTH * 0.5 - 0.075),
      ], { chamfer: 0.045, fillet: 0.014, bevel: 0.01 })
      box(hull, m.amberPaint, [0.14, 0.075, 0.14], [
        sx * (WIDTH * 0.5 - 0.075), 0.038, sz * (DEPTH * 0.5 - 0.075),
      ], { chamfer: 0.035, fillet: 0.012, bevel: 0.009 })
    }
  }

  // Every graphic below seats on the exact face that carries it. The 2 mm the
  // shell face used to be padded by is the difference between a plate designed
  // to embed 3 mm and one that floats 1 mm, which is what the rim light finds.
  const frontZ = DEPTH * 0.5
  // A pressed pan across the front face gives the latches something to sit in;
  // the pan is 30 mm about the shell, so its own face is 15 mm further out.
  box(hull, m.shellShade, [WIDTH - 0.34, BODY_HEIGHT - 0.14, 0.03], [0, BODY_Y, frontZ], {
    chamfer: 0.06, fillet: 0.02, bevel: 0.012,
  })
  const panZ = frontZ + 0.015
  for (const x of [-0.32, 0.32]) {
    seam(hull, m.shellShade, BODY_HEIGHT - 0.2, [x, BODY_Y, panZ], 'front', 'along', 0.026, 0.016)
  }
  const label = addLabelDecal(bundle, { variant: 6 })
  plaque(hull, m, label, [0.3, 0.15], [0, BODY_Y - 0.02, panZ], 'front', m.shellLight)
  statusLens(hull, m, [0.11, 0.04], [0, BODY_Y + 0.14, panZ], m.cyan, 'front')

  const backZ = -DEPTH * 0.5
  const stripe = addStripeDecal(bundle, { count: 4, lean: -1 })
  plaque(hull, m, stripe, [0.46, 0.1], [0, BODY_Y + 0.11, backZ], 'back', m.ink)
  paintMark(hull, m.amberPaint, slashProfile(0.09, 0.24, 0.5), [-0.3, BODY_Y - 0.08, backZ], 'back', 0.011)
  paintMark(hull, m.amberPaint, slashProfile(0.05, 0.24, 0.5), [-0.17, BODY_Y - 0.08, backZ], 'back', 0.011)
  boltRun(hull, m.steel, [-0.4, BODY_Y - 0.18, backZ], [0.4, BODY_Y - 0.18, backZ], 5, 0.016, 'back')

  for (const side of [-1, 1] as Side[]) {
    const face = side > 0 ? 'right' : 'left'
    recessedHandle(hull, m, [0.34, 0.13], [side * WIDTH * 0.5, BODY_Y + 0.03, 0], face)
  }
}

function lidBody(lid: Group, m: CargoMaterials): void {
  // The leaf is a lap deeper than the opening it covers, so its skirt runs past
  // the body's top face instead of capping it on a shared plane.
  const crown = LID + LAP
  box(lid, m.shellLight, [WIDTH + 0.02, crown, DEPTH + 0.02], [0, crown * 0.5, DEPTH * 0.5 - 0.045], {
    chamfer: 0.08, fillet: 0.026, bevel: 0.018, capChamfer: 0.05,
  })
  // A single deep channel down the crown; it is the crate's cheapest landmark
  // and the reason a stack of them still reads as individual boxes.
  box(lid, m.ink, [WIDTH - 0.4, 0.035, DEPTH - 0.22], [0, crown - 0.012, DEPTH * 0.5 - 0.045], {
    chamfer: 0.05, fillet: 0.016, bevel: 0.01,
  })
  box(lid, m.shellShade, [WIDTH - 0.48, 0.03, DEPTH - 0.3], [0, crown - 0.004, DEPTH * 0.5 - 0.045], {
    chamfer: 0.045, fillet: 0.014, bevel: 0.009,
  })
  // Outboard of the channel's own plates. Run at 0.2 the grooves were under the
  // 0.8-wide dark surround, which buried seven tenths of each cut.
  for (const x of [-1, 1] as Side[]) {
    seam(lid, m.shellLight, DEPTH - 0.18, [x * ((WIDTH - 0.4) * 0.5 + 0.1), crown, DEPTH * 0.5 - 0.045], 'top', 'along', 0.026, 0.016)
  }
  // A barrel straddling the leaf's own back face, on the line the lid turns
  // about. Drawn at a local z of 0.025 the lugs and the pin were both inside the
  // lid they swing on, and the crate's back photographed as a smooth panel with
  // no hinge anywhere on it.
  const leafBack = DEPTH * 0.5 - 0.045 - (DEPTH + 0.02) * 0.5
  lidHinge(lid, m, WIDTH - 0.24, [0, 0, leafBack - 0.005], 'x', 2, 0.022, 0.1, 0.005)
}

function build(): { root: Group; hull: Group; lid: Group; sockets: CrateSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(52_400, { condition: 0.48 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_CARGO-CRATE-MEDIUM_ROOT_SEALED'
  const hull = new Group()
  hull.name = 'AXR_CARGO_CARGO-CRATE-MEDIUM_PART_HULL_DEFAULT'
  const lid = new Group()
  lid.name = 'AXR_CARGO_CARGO-CRATE-MEDIUM_PART_LID_CLOSED'
  root.add(hull, lid)

  hullBody(hull, m, bundle)
  lid.position.set(0, HEIGHT - LID - LAP, -(DEPTH * 0.5 - 0.045))
  lidBody(lid, m)

  for (const x of [-0.36, 0.36]) {
    toggleLatch(hull, m, [x, HEIGHT - LID - LAP, DEPTH * 0.5], 0.95, 'front')
  }

  const sockets: CrateSockets = {
    lid_hinge: socket('lid_hinge', [0, HEIGHT - LID - LAP, -(DEPTH * 0.5 - 0.045)]),
    carry_left: socket('carry_left', [-(WIDTH * 0.5 + 0.06), HEIGHT * 0.55, 0]),
    carry_right: socket('carry_right', [WIDTH * 0.5 + 0.06, HEIGHT * 0.55, 0]),
    stack_top: socket('stack_top', [0, HEIGHT, 0]),
  }
  return { root, hull, lid, sockets, bundle }
}

export function createModel(): MediumCrateController {
  const { root, hull, lid, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'cargo-crate-medium',
    assemblies: [lid],
    reach: 0.16,
    sockets: Object.values(sockets),
  })

  let state: MediumCrateState = 'sealed'
  let blend = 0
  let elapsed = 0
  const applyBlend = (): void => {
    lid.rotation.x = -blend * 1.5
    lid.name = blend > 0.02
      ? 'AXR_CARGO_CARGO-CRATE-MEDIUM_PART_LID_OPEN'
      : 'AXR_CARGO_CARGO-CRATE-MEDIUM_PART_LID_CLOSED'
  }

  return {
    root,
    parts: { hull, lid },
    sockets,
    get state() {
      return state
    },
    setState: (next: MediumCrateState) => {
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
      bundle.materials.cyan.emissiveIntensity = 1.55 + Math.sin(elapsed * 1.9) * 0.2
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: MediumCrateState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'sealed')
  return createCargoPreview(model, {
    target: [0, HEIGHT * 0.48, 0],
    distance: 3.05,
    yaw: 0.8,
    pitch: 0.32,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createOpenPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'open' })
