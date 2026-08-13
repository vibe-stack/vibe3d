import { Group, Object3D } from 'three/webgpu'

import { cylinder, extrudeProfile, type Vec2 } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  AXIS_Z,
  FACE_CLEARANCE,
  acquireCargoMaterials,
  addLabelDecal,
  addStripeDecal,
  bolt,
  box,
  boltRun,
  cornerCasting,
  createCargoPreview,
  finishModel,
  forkPocket,
  louvreVent,
  paintMark,
  plaque,
  seam,
  slashProfile,
  socket,
  statusLens,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay armoured cargo crate.
 *
 * The hardened member of the family: no clamshell lid, no grab handles, and a
 * faceted plate skin bolted over the shell. It opens by a powered front hatch,
 * which is why its whole front face is a frame and why the caution band runs
 * around the hatch rather than along the skirt.
 *
 * The plate facets are a single extruded profile per side rather than a stack of
 * boxes, so the armour keeps one continuous edge instead of restarting its bevel
 * at every corner.
 */

const WIDTH = 1.44
const DEPTH = 1.06
const HEIGHT = 1.12
const SKIRT = 0.2
/** How far the body reaches down past the skirt, so the two do not share a plane. */
const LAP = 0.02
const BODY_HEIGHT = HEIGHT - SKIRT + LAP
const BODY_Y = SKIRT - LAP + BODY_HEIGHT * 0.5
/**
 * Outward offset from the shell's long face to the armour plate's own face.
 *
 * The plate is 70 mm thick about `DEPTH * 0.5 + 0.012`, so this is where
 * anything bolted to the back of the crate has to sit. Every fitting back there
 * was measured from an offset 15 mm past it and hung clear of the plate.
 */
const PLATE = 0.047

interface ArmoredCrateSockets {
  hatch_face: Object3D
  lift_top: Object3D
  power_in: Object3D
  fx_status: Object3D
}

export type ArmorState = 'locked' | 'released'

export interface ArmoredCrateController {
  root: Group
  parts: { hull: Group; hatch: Group }
  sockets: ArmoredCrateSockets
  readonly state: ArmorState
  setState(state: ArmorState): ArmorState
  update(deltaSeconds: number): void
  dispose(): void
}

/** Faceted side plate: a rectangle with all four corners cut back hard. */
function plateProfile(width: number, height: number, cut: number): Vec2[] {
  const hw = width * 0.5
  const hh = height * 0.5
  return [
    [hw, hh - cut], [hw - cut * 1.4, hh],
    [-hw + cut * 1.4, hh], [-hw, hh - cut],
    [-hw, -hh + cut * 0.7], [-hw + cut, -hh],
    [hw - cut, -hh], [hw, -hh + cut * 0.7],
  ]
}

function hullBody(hull: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  box(hull, m.graphite, [WIDTH, SKIRT, DEPTH], [0, SKIRT * 0.5, 0], {
    chamfer: 0.075, fillet: 0.024, bevel: 0.018, capChamfer: 0.05,
  })
  box(hull, m.ink, [WIDTH - 0.01, BODY_HEIGHT, DEPTH - 0.01], [0, BODY_Y, 0], {
    chamfer: 0.1, fillet: 0.03, bevel: 0.02, capChamfer: 0.07,
  })

  // The pockets fit inside the skirt. At 130 mm the wear plate around each mouth
  // was 240 mm tall in a 200 mm band, so all four dipped 20 mm below the deck -
  // four bright slivers hanging under the prop in the below tile.
  for (const x of [-0.42, 0.42]) {
    forkPocket(hull, m, [0.42, 0.07], 0.36, [x, SKIRT * 0.5, DEPTH * 0.5], 'front')
    forkPocket(hull, m, [0.42, 0.07], 0.36, [x, SKIRT * 0.5, -DEPTH * 0.5], 'back')
  }

  // Bolted armour plate on both long faces and the back.
  for (const sz of [-1, 1]) {
    const z = sz * (DEPTH * 0.5 + 0.012)
    hull.add(extrudeProfile(m.shell, plateProfile(WIDTH - 0.24, BODY_HEIGHT - 0.16, 0.19), 0.07, [0, BODY_Y, z], {
      fillet: 0.02, bevel: 0.022, capChamfer: [0.035, 0],
      rotation: [0, sz > 0 ? 0 : Math.PI, 0],
    }))
  }
  for (const sx of [-1, 1]) {
    const x = sx * (WIDTH * 0.5 + 0.01)
    hull.add(extrudeProfile(m.shellShade, plateProfile(DEPTH - 0.16, BODY_HEIGHT - 0.16, 0.17), 0.06, [x, BODY_Y, 0], {
      fillet: 0.02, bevel: 0.02, capChamfer: [0.03, 0],
      rotation: [0, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 0],
    }))
    boltRun(hull, m.steel, [x + sx * 0.03, BODY_Y + BODY_HEIGHT * 0.32, -0.3], [x + sx * 0.03, BODY_Y + BODY_HEIGHT * 0.32, 0.3], 3, 0.022, sx > 0 ? 'right' : 'left')
    boltRun(hull, m.steel, [x + sx * 0.03, BODY_Y - BODY_HEIGHT * 0.32, -0.3], [x + sx * 0.03, BODY_Y - BODY_HEIGHT * 0.32, 0.3], 3, 0.022, sx > 0 ? 'right' : 'left')
  }

  // Back face: conditioning louvres and the power interface, all seated on the
  // armour plate that carries them.
  const backZ = -(DEPTH * 0.5 + PLATE)
  louvreVent(hull, m, [0.4, 0.4], [-0.3, BODY_Y, backZ], 4, 'back')
  box(hull, m.graphite, [0.3, 0.24, 0.06], [0.32, BODY_Y, backZ], { chamfer: 0.05, fillet: 0.016, bevel: 0.012 })
  hull.add(cylinder(m.steel, 0.055, 0.1, [0.32, BODY_Y, backZ - 0.05], AXIS_Z, 12))
  hull.add(cylinder(m.ink, 0.03, 0.12, [0.32, BODY_Y, backZ - 0.07], AXIS_Z, 8))
  // The plate's top edge is at 0.38 of its own height; a band any higher than
  // this overhangs it onto the shell 52 mm behind.
  const stripe = addStripeDecal(bundle, { count: 5, lean: -1 })
  plaque(hull, m, stripe, [0.6, 0.1], [0, BODY_Y + BODY_HEIGHT * 0.31, backZ], 'back', m.ink)

  // Top deck: castings, a lift spine, and the manifest.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      cornerCasting(hull, m, [0.2, 0.14, 0.2], [
        sx * (WIDTH * 0.5 - 0.13), HEIGHT - 0.06, sz * (DEPTH * 0.5 - 0.13),
      ], 0.042, 'y', m.shellLight)
    }
  }
  box(hull, m.graphiteEdge, [WIDTH - 0.6, 0.06, 0.2], [0, HEIGHT + 0.01, 0], { chamfer: 0.05, fillet: 0.016, bevel: 0.012 })
  box(hull, m.amberPaint, [WIDTH - 0.72, 0.035, 0.09], [0, HEIGHT + 0.05, 0], { chamfer: 0.025, fillet: 0.01, bevel: 0.008 })
  const label = addLabelDecal(bundle, { variant: 21 })
  plaque(hull, m, label, [0.36, 0.18], [0, HEIGHT, -0.32], 'top', m.shellLight)
  seam(hull, m.ink, WIDTH - 0.34, [0, HEIGHT, 0.3], 'top', 'across', 0.03, 0.018)
}

function hatchFace(hull: Group, hatch: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  const z = DEPTH * 0.5 + 0.03

  // A real frame on the hull, so the moving leaf has something to seal against.
  // The head and sill bars are 90 mm about `z` and carry the frame's face; the
  // stiles are a face clearance shallower, because at the same depth the two
  // members meet on one plane over the whole 57 x 97 mm they cross at each of
  // the frame's four corners. A lamp seats on the stile's own face.
  const stileDepth = 0.09 - FACE_CLEARANCE * 2
  for (const sx of [-1, 1]) {
    box(hull, m.graphiteEdge, [0.15, BODY_HEIGHT - 0.1, stileDepth], [sx * (WIDTH * 0.5 - 0.14), BODY_Y, z], {
      chamfer: 0.035, fillet: 0.012, bevel: 0.01,
    })
    for (const y of [BODY_Y - 0.24, BODY_Y + 0.24]) {
      statusLens(hull, m, [0.05, 0.14], [sx * (WIDTH * 0.5 - 0.14), y, z + stileDepth * 0.5], sx > 0 ? m.amber : m.cyan, 'front')
    }
  }
  box(hull, m.graphiteEdge, [WIDTH - 0.2, 0.13, 0.09], [0, BODY_Y + BODY_HEIGHT * 0.5 - 0.06, z], { chamfer: 0.035 })
  box(hull, m.graphiteEdge, [WIDTH - 0.2, 0.13, 0.09], [0, BODY_Y - BODY_HEIGHT * 0.5 + 0.06, z], { chamfer: 0.035 })

  // The leaf itself slides down into the skirt; its origin is its closed centre.
  // Its skin is 75 mm about that origin and the recessed pan 30 mm about the
  // skin's face, so those two planes are what everything else on the leaf seats
  // on. Measured from neither, the grab bar stood 7.5 mm clear of the leaf and
  // read as a stub floating in front of it.
  hatch.position.set(0, BODY_Y, z + 0.03)
  const skin = 0.0375
  const pan = skin + 0.015
  box(hatch, m.shellLight, [WIDTH - 0.42, BODY_HEIGHT - 0.28, 0.075], [0, 0, 0], {
    chamfer: 0.09, fillet: 0.028, bevel: 0.018, capChamfer: [0.04, 0],
  })
  box(hatch, m.shellShade, [WIDTH - 0.56, BODY_HEIGHT - 0.44, 0.03], [0, 0.015, skin], {
    chamfer: 0.07, fillet: 0.022, bevel: 0.012,
  })
  paintMark(hatch, m.amberPaint, slashProfile(0.11, 0.3, 0.55), [-0.16, 0.02, pan], 'front', 0.013)
  paintMark(hatch, m.amberPaint, slashProfile(0.055, 0.3, 0.55), [-0.02, 0.02, pan], 'front', 0.013)
  box(hatch, m.ink, [0.3, 0.1, 0.04], [0.22, -0.16, pan], { chamfer: 0.03, fillet: 0.01, bevel: 0.008 })
  const label = addLabelDecal(bundle, { variant: 17 })
  plaque(hatch, m, label, [0.26, 0.12], [0.22, 0.16, pan], 'front', m.shell)
  // Outboard of the pan rather than astride its edge, so each head has one host.
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      bolt(hatch, m.steel, [sx * (WIDTH * 0.5 - 0.245), sy * (BODY_HEIGHT * 0.5 - 0.2), skin], 0.024, 'front')
    }
  }
  hatch.add(cylinder(m.steel, 0.035, 0.16, [0, -BODY_HEIGHT * 0.5 + 0.2, skin + 0.018], AXIS_X, 10))
}

function build(): { root: Group; hull: Group; hatch: Group; sockets: ArmoredCrateSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(53_200, { condition: 0.6 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_ARMORED-CARGO-CRATE_ROOT_LOCKED'
  const hull = new Group()
  hull.name = 'AXR_CARGO_ARMORED-CARGO-CRATE_PART_HULL_DEFAULT'
  const hatch = new Group()
  hatch.name = 'AXR_CARGO_ARMORED-CARGO-CRATE_PART_HATCH_LOCKED'
  root.add(hull, hatch)

  hullBody(hull, m, bundle)
  hatchFace(hull, hatch, m, bundle)

  const sockets: ArmoredCrateSockets = {
    hatch_face: socket('hatch_face', [0, HEIGHT * 0.55, DEPTH * 0.5 + 0.12]),
    lift_top: socket('lift_top', [0, HEIGHT + 0.08, 0]),
    power_in: socket('power_in', [0.32, HEIGHT * 0.55, -(DEPTH * 0.5 + 0.14)]),
    fx_status: socket('fx_status', [WIDTH * 0.5 - 0.14, HEIGHT * 0.55, DEPTH * 0.5 + 0.1]),
  }
  return { root, hull, hatch, sockets, bundle }
}

export function createModel(): ArmoredCrateController {
  const { root, hull, hatch, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'armored-cargo-crate',
    assemblies: [hatch],
    reach: 0.18,
    sockets: Object.values(sockets),
  })

  let state: ArmorState = 'locked'
  let blend = 0
  let elapsed = 0
  // The leaf slides until it stands on the deck. At `HEIGHT - SKIRT - 0.3` it
  // ran 280 mm past it, and a released hatch was a plate half underground.
  const drop = BODY_Y - (BODY_HEIGHT - 0.28) * 0.5
  const applyBlend = (): void => {
    hatch.position.y = BODY_Y - blend * drop
    hatch.name = blend > 0.02
      ? 'AXR_CARGO_ARMORED-CARGO-CRATE_PART_HATCH_RELEASED'
      : 'AXR_CARGO_ARMORED-CARGO-CRATE_PART_HATCH_LOCKED'
  }

  return {
    root,
    parts: { hull, hatch },
    sockets,
    get state() {
      return state
    },
    setState: (next: ArmorState) => {
      state = next
      root.name = next === 'released'
        ? 'AXR_CARGO_ARMORED-CARGO-CRATE_ROOT_RELEASED'
        : 'AXR_CARGO_ARMORED-CARGO-CRATE_ROOT_LOCKED'
      blend = next === 'released' ? 1 : 0
      applyBlend()
      return state
    },
    update: (deltaSeconds: number) => {
      const step = Math.min(Math.max(deltaSeconds, 0), 0.05)
      elapsed += step
      const target = state === 'released' ? 1 : 0
      if (Math.abs(target - blend) > 1e-4) {
        blend += Math.sign(target - blend) * Math.min(Math.abs(target - blend), step * 0.6)
        applyBlend()
      }
      const pulse = state === 'released' ? 0.5 : 1
      bundle.materials.amber.emissiveIntensity = (2.1 + Math.sin(elapsed * 2.8) * 0.5) * pulse
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: ArmorState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'locked')
  return createCargoPreview(model, {
    target: [0, HEIGHT * 0.5, 0],
    distance: 3.9,
    yaw: 0.74,
    pitch: 0.31,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createReleasedPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'released' })
