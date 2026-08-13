import { Group, Object3D } from 'three/webgpu'

import { cylinder, prism } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_Z,
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
 * Axiom Relay weapon crate.
 *
 * Reads as ordnance, not freight. It inverts the pack's value scheme - a dark
 * graphite shell with a light lid band instead of a light shell with a dark
 * skirt - and it is the only crate in the wave allowed a critical-red marking,
 * because its contents are the one thing in a depot that is genuinely dangerous
 * to open by mistake.
 *
 * Bail handles are steel loops on real pivots rather than moulded grips, since
 * this is a two-operator carry with gloves.
 */

const LENGTH = 1.72
const DEPTH = 0.52
const HEIGHT = 0.44
const FOOT = 0.05
const LID = 0.13
/**
 * How far the body reaches past the foot below it and the lid above it.
 *
 * Both joints were drawn as exact meets - the foot's top cap on the body's
 * bottom, the lid's bottom on the body's top - which reads as a hard black line
 * from anywhere off the horizon. The body grows into both rather than the lid
 * dropping, so the bands and latches keep the heights they were placed at.
 */
const LAP = 0.02
const BODY_HEIGHT = HEIGHT - LID - FOOT + LAP * 2
const BODY_Y = (FOOT - LAP + HEIGHT - LID + LAP) * 0.5

interface WeaponCrateSockets {
  lid_hinge: Object3D
  bail_left: Object3D
  bail_right: Object3D
  stack_top: Object3D
}

export type WeaponCrateState = 'sealed' | 'open'

export interface WeaponCrateController {
  root: Group
  parts: { hull: Group; lid: Group }
  sockets: WeaponCrateSockets
  readonly state: WeaponCrateState
  setState(state: WeaponCrateState): WeaponCrateState
  update(deltaSeconds: number): void
  dispose(): void
}

/**
 * A hinged steel bail: two pivot lugs, two links, and a cross bar.
 *
 * Three straight segments rather than a torus. A bail is only ever read in
 * silhouette against the crate end, and a swept tube costs an order of magnitude
 * more triangles to say the same thing.
 */
function bailHandle(hull: Group, m: CargoMaterials, side: -1 | 1, y: number): void {
  const root = LENGTH * 0.5 * side
  for (const sz of [-1, 1]) {
    hull.add(prism(m.graphiteEdge, [0.07, 0.09, 0.05], [root, y, sz * 0.15], {
      chamfer: 0.02, fillet: 0.008, bevel: 0.007,
    }))
    hull.add(cylinder(m.steel, 0.013, 0.085, [root + side * 0.032, y - 0.022, sz * 0.15], [0, 0, side * Math.PI / 2.7], 8))
  }
  hull.add(cylinder(m.steel, 0.013, 0.3, [root + side * 0.062, y - 0.044, 0], AXIS_Z, 8))
}

function hullBody(hull: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  box(hull, m.ink, [LENGTH - 0.1, FOOT, DEPTH - 0.06], [0, FOOT * 0.5, 0], {
    chamfer: 0.025, fillet: 0.01, bevel: 0.009,
  })
  box(hull, m.graphite, [LENGTH, BODY_HEIGHT, DEPTH], [0, BODY_Y, 0], {
    chamfer: 0.06, fillet: 0.02, bevel: 0.016, capChamfer: 0.04,
  })

  // Bolted reinforcement bands, the crate's dominant rhythm. They run the clear
  // height between the foot and the shut line rather than the body's, because
  // the body now reaches past both and a band sized to it would stand out
  // through the lid. The bolts seat on the band's own face, 9 mm out.
  const shutY = HEIGHT - LID
  const bandZ = DEPTH * 0.5 + 0.009
  for (const x of [-0.56, 0, 0.56]) {
    box(hull, m.graphiteEdge, [0.1, shutY - FOOT + 0.02, DEPTH + 0.018], [x, (shutY + FOOT) * 0.5, 0], {
      chamfer: 0.026, fillet: 0.009, bevel: 0.008,
    })
    boltRun(hull, m.steel, [x, BODY_Y + 0.05, bandZ], [x, BODY_Y - 0.05, bandZ], 2, 0.014, 'front')
  }

  const frontZ = DEPTH * 0.5
  for (const x of [-0.28, 0.28]) {
    seam(hull, m.graphite, BODY_HEIGHT - 0.1, [x, BODY_Y, frontZ], 'front', 'along', 0.024, 0.015)
  }
  const label = addLabelDecal(bundle, { variant: 29, ground: 0xd9e6e9 })
  plaque(hull, m, label, [0.3, 0.1], [-0.86 + 0.42, BODY_Y, frontZ], 'front', m.shellShade)
  paintMark(hull, m.redPaint, slashProfile(0.09, 0.13, 0.55), [0.78, BODY_Y, frontZ], 'front', 0.011)
  paintMark(hull, m.redPaint, slashProfile(0.045, 0.13, 0.55), [0.88, BODY_Y, frontZ], 'front', 0.011)
  statusLens(hull, m, [0.08, 0.03], [0.3, BODY_Y, frontZ], m.amber, 'front')

  const stripe = addStripeDecal(bundle, { count: 6, lean: -1, bar: 0xeb514e })
  plaque(hull, m, stripe, [0.7, 0.08], [0, BODY_Y, -frontZ], 'back', m.ink)

  bailHandle(hull, m, 1, BODY_Y)
  bailHandle(hull, m, -1, BODY_Y)
}

function lidBody(lid: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  box(lid, m.graphite, [LENGTH + 0.014, LID, DEPTH + 0.014], [0, LID * 0.5, DEPTH * 0.5 - 0.03], {
    chamfer: 0.055, fillet: 0.018, bevel: 0.014, capChamfer: 0.035,
  })
  // Light crown band. It is the only high value on the prop, so it is where the
  // eye lands and where the ordnance marking goes.
  box(lid, m.shell, [LENGTH - 0.3, 0.035, DEPTH - 0.16], [0, LID + 0.006, DEPTH * 0.5 - 0.03], {
    chamfer: 0.04, fillet: 0.014, bevel: 0.01,
  })
  const stripe = addStripeDecal(bundle, { count: 8, lean: 1 })
  plaque(lid, m, stripe, [LENGTH - 0.52, 0.08], [0, LID + 0.024, DEPTH * 0.5 - 0.03], 'top', m.ink)
  // A barrel straddling the leaf's own back face. Drawn at a local z of 0.018
  // the lugs and the pin were both inside the lid they swing on, so the crate's
  // back carried no hinge at all.
  const leafBack = DEPTH * 0.5 - 0.03 - (DEPTH + 0.014) * 0.5
  lidHinge(lid, m, LENGTH - 0.2, [0, 0, leafBack - 0.004], 'x', 2, 0.02, 0.075, 0.004)
}

function build(): { root: Group; hull: Group; lid: Group; sockets: WeaponCrateSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(53_400, { condition: 0.64 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_WEAPON-CRATE_ROOT_SEALED'
  const hull = new Group()
  hull.name = 'AXR_CARGO_WEAPON-CRATE_PART_HULL_DEFAULT'
  const lid = new Group()
  lid.name = 'AXR_CARGO_WEAPON-CRATE_PART_LID_CLOSED'
  root.add(hull, lid)

  hullBody(hull, m, bundle)
  lid.position.set(0, HEIGHT - LID, -(DEPTH * 0.5 - 0.03))
  lidBody(lid, m, bundle)

  for (const x of [-0.78, -0.26, 0.26, 0.78]) {
    toggleLatch(hull, m, [x, HEIGHT - LID, DEPTH * 0.5], 0.7, 'front')
  }

  const sockets: WeaponCrateSockets = {
    lid_hinge: socket('lid_hinge', [0, HEIGHT - LID, -(DEPTH * 0.5 - 0.03)]),
    bail_left: socket('bail_left', [-(LENGTH * 0.5 + 0.14), HEIGHT * 0.55, 0]),
    bail_right: socket('bail_right', [LENGTH * 0.5 + 0.14, HEIGHT * 0.55, 0]),
    stack_top: socket('stack_top', [0, HEIGHT, 0]),
  }
  return { root, hull, lid, sockets, bundle }
}

export function createModel(): WeaponCrateController {
  const { root, hull, lid, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'weapon-crate',
    assemblies: [lid],
    reach: 0.12,
    sockets: Object.values(sockets),
  })

  let state: WeaponCrateState = 'sealed'
  let blend = 0
  let elapsed = 0
  const applyBlend = (): void => {
    lid.rotation.x = -blend * 1.42
    lid.name = blend > 0.02
      ? 'AXR_CARGO_WEAPON-CRATE_PART_LID_OPEN'
      : 'AXR_CARGO_WEAPON-CRATE_PART_LID_CLOSED'
  }

  return {
    root,
    parts: { hull, lid },
    sockets,
    get state() {
      return state
    },
    setState: (next: WeaponCrateState) => {
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
      bundle.materials.amber.emissiveIntensity = 2.0 + Math.sin(elapsed * 3.1) * 0.4
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: WeaponCrateState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'sealed')
  return createCargoPreview(model, {
    target: [0, HEIGHT * 0.52, 0],
    distance: 3.95,
    yaw: 0.8,
    pitch: 0.33,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createOpenPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'open' })
