import { Group, Object3D } from 'three/webgpu'

import { cylinder, extrudeProfile, type Vec2 } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  AXIS_Z,
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
  const bodyHeight = HEIGHT - SKIRT
  const bodyY = SKIRT + bodyHeight * 0.5

  box(hull, m.graphite, [WIDTH, SKIRT, DEPTH], [0, SKIRT * 0.5, 0], {
    chamfer: 0.075, fillet: 0.024, bevel: 0.018, capChamfer: 0.05,
  })
  box(hull, m.ink, [WIDTH - 0.01, bodyHeight, DEPTH - 0.01], [0, bodyY, 0], {
    chamfer: 0.1, fillet: 0.03, bevel: 0.02, capChamfer: 0.07,
  })

  for (const x of [-0.42, 0.42]) {
    forkPocket(hull, m, [0.42, 0.13], 0.36, [x, SKIRT * 0.5, DEPTH * 0.5], 'front')
    forkPocket(hull, m, [0.42, 0.13], 0.36, [x, SKIRT * 0.5, -DEPTH * 0.5], 'back')
  }

  // Bolted armour plate on both long faces and the back.
  for (const sz of [-1, 1]) {
    const z = sz * (DEPTH * 0.5 + 0.012)
    hull.add(extrudeProfile(m.shell, plateProfile(WIDTH - 0.24, bodyHeight - 0.16, 0.19), 0.07, [0, bodyY, z], {
      fillet: 0.02, bevel: 0.022, capChamfer: [0.035, 0],
      rotation: [0, sz > 0 ? 0 : Math.PI, 0],
    }))
  }
  for (const sx of [-1, 1]) {
    const x = sx * (WIDTH * 0.5 + 0.01)
    hull.add(extrudeProfile(m.shellShade, plateProfile(DEPTH - 0.16, bodyHeight - 0.16, 0.17), 0.06, [x, bodyY, 0], {
      fillet: 0.02, bevel: 0.02, capChamfer: [0.03, 0],
      rotation: [0, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 0],
    }))
    boltRun(hull, m.steel, [x + sx * 0.03, bodyY + bodyHeight * 0.32, -0.3], [x + sx * 0.03, bodyY + bodyHeight * 0.32, 0.3], 3, 0.022, sx > 0 ? 'right' : 'left')
    boltRun(hull, m.steel, [x + sx * 0.03, bodyY - bodyHeight * 0.32, -0.3], [x + sx * 0.03, bodyY - bodyHeight * 0.32, 0.3], 3, 0.022, sx > 0 ? 'right' : 'left')
  }

  // Back face: conditioning louvres and the power interface.
  const backZ = -(DEPTH * 0.5 + 0.062)
  louvreVent(hull, m, [0.4, 0.4], [-0.3, bodyY, backZ], 4, 'back')
  box(hull, m.graphite, [0.3, 0.24, 0.06], [0.32, bodyY, backZ], { chamfer: 0.05, fillet: 0.016, bevel: 0.012 })
  hull.add(cylinder(m.steel, 0.055, 0.1, [0.32, bodyY, backZ - 0.05], AXIS_Z, 12))
  hull.add(cylinder(m.ink, 0.03, 0.12, [0.32, bodyY, backZ - 0.07], AXIS_Z, 8))
  const stripe = addStripeDecal(bundle, { count: 5, lean: -1 })
  plaque(hull, m, stripe, [0.6, 0.1], [0, bodyY + bodyHeight * 0.36, backZ], 'back', m.ink)

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
  plaque(hull, m, label, [0.36, 0.18], [0, HEIGHT + 0.002, -0.32], 'top', m.shellLight)
  seam(hull, m.ink, WIDTH - 0.34, [0, HEIGHT + 0.002, 0.3], 'top', 'across', 0.03, 0.018)
}

function hatchFace(hull: Group, hatch: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  const bodyHeight = HEIGHT - SKIRT
  const bodyY = SKIRT + bodyHeight * 0.5
  const z = DEPTH * 0.5 + 0.03

  // A real frame on the hull, so the moving leaf has something to seal against.
  for (const sx of [-1, 1]) {
    box(hull, m.graphiteEdge, [0.15, bodyHeight - 0.1, 0.09], [sx * (WIDTH * 0.5 - 0.14), bodyY, z], {
      chamfer: 0.035, fillet: 0.012, bevel: 0.01,
    })
    for (const y of [bodyY - 0.24, bodyY + 0.24]) {
      statusLens(hull, m, [0.05, 0.14], [sx * (WIDTH * 0.5 - 0.14), y, z + 0.05], sx > 0 ? m.amber : m.cyan, 'front')
    }
  }
  box(hull, m.graphiteEdge, [WIDTH - 0.2, 0.13, 0.09], [0, bodyY + bodyHeight * 0.5 - 0.06, z], { chamfer: 0.035 })
  box(hull, m.graphiteEdge, [WIDTH - 0.2, 0.13, 0.09], [0, bodyY - bodyHeight * 0.5 + 0.06, z], { chamfer: 0.035 })

  // The leaf itself slides down into the skirt; its origin is its closed centre.
  hatch.position.set(0, bodyY, z + 0.03)
  box(hatch, m.shellLight, [WIDTH - 0.42, bodyHeight - 0.28, 0.075], [0, 0, 0], {
    chamfer: 0.09, fillet: 0.028, bevel: 0.018, capChamfer: [0.04, 0],
  })
  box(hatch, m.shellShade, [WIDTH - 0.56, bodyHeight - 0.44, 0.03], [0, 0.015, 0.05], {
    chamfer: 0.07, fillet: 0.022, bevel: 0.012,
  })
  paintMark(hatch, m.amberPaint, slashProfile(0.11, 0.3, 0.55), [-0.16, 0.02, 0.065], 'front', 0.013)
  paintMark(hatch, m.amberPaint, slashProfile(0.055, 0.3, 0.55), [-0.02, 0.02, 0.065], 'front', 0.013)
  box(hatch, m.ink, [0.3, 0.1, 0.04], [0.22, -0.16, 0.06], { chamfer: 0.03, fillet: 0.01, bevel: 0.008 })
  const label = addLabelDecal(bundle, { variant: 17 })
  plaque(hatch, m, label, [0.26, 0.12], [0.22, 0.16, 0.05], 'front', m.shell)
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      bolt(hatch, m.steel, [sx * (WIDTH * 0.5 - 0.28), sy * (bodyHeight * 0.5 - 0.2), 0.04], 0.024, 'front')
    }
  }
  hatch.add(cylinder(m.steel, 0.035, 0.16, [0, -bodyHeight * 0.5 + 0.2, 0.08], AXIS_X, 10))
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
  const drop = HEIGHT - SKIRT - 0.3
  const applyBlend = (): void => {
    hatch.position.y = SKIRT + (HEIGHT - SKIRT) * 0.5 - blend * drop
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
