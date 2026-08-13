import { Group, Object3D } from 'three/webgpu'

import { cylinder, extrudeProfile, type Vec2 } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  AXIS_Y,
  AXIS_Z,
  acquireCargoMaterials,
  addLabelDecal,
  addStripeDecal,
  bolt,
  box,
  boltRun,
  createCargoPreview,
  finishModel,
  louvreVent,
  member,
  paintMark,
  plaque,
  seam,
  slashProfile,
  socket,
  statusLens,
  tubeSection,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay counterbalance loader — the depot's forklift.
 *
 * The hero of the industrial half of the wave, and the one prop that has to get
 * its *proportions* right or nothing else matters: the counterweight has to look
 * heavy enough to balance a load on the forks, the front axle has to sit almost
 * under the mast, the rear wheels have to be small and steerable, and the
 * overhead guard has to be tall enough for a seated operator.
 *
 * The mast is two nested channel sections with the carriage running between
 * them, so raising the forks is one translation on the carriage and one on the
 * inner mast - the same two-stage lift a real one has.
 */

const WHEEL_F = 0.34
const WHEEL_R = 0.22
const BODY_W = 1.12
const AXLE_X = 0.62
const MAST_H = 2.15
const FORK_L = 1.06

interface LoaderSockets {
  fork_tips: Object3D
  carriage: Object3D
  seat: Object3D
  tow_hitch: Object3D
}

export type LoaderState = 'lowered' | 'raised'

export interface ForkliftController {
  root: Group
  parts: { chassis: Group; innerMast: Group; carriage: Group }
  sockets: LoaderSockets
  readonly state: LoaderState
  setState(state: LoaderState): LoaderState
  update(deltaSeconds: number): void
  dispose(): void
}

/** Counterweight: a heavy tapered block, the mass that makes the truck work. */
function counterweightProfile(): Vec2[] {
  return [
    [-0.9, 0.1], [-0.78, 0.62], [-0.36, 0.78], [0.1, 0.78],
    [0.1, 0.1], [-0.2, 0.02], [-0.72, 0.02],
  ]
}

/**
 * Where the counterweight's back is, at a given height.
 *
 * It is a rake, not a wall: the profile runs from x -0.9 at y 0.1 to -0.78 at
 * y 0.62 and the whole block is offset -0.3, so the only honest way to seat
 * anything on the back is to solve for the height it sits at. A fitting placed
 * at a guessed x is either buried in a hundred millimetres of casting or hanging
 * off the back of it.
 */
function rearFace(y: number): number {
  return -1.2 + 0.12 * (y - 0.1) / 0.52
}

/** Counterweight flank, which is 10 mm inside the body half-width. */
const FLANK = (BODY_W - 0.06) * 0.5

function chassisBuild(chassis: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  // Counterweight and the powertrain hood in front of it.
  chassis.add(extrudeProfile(m.shell, counterweightProfile(), BODY_W - 0.06, [-0.3, 0, 0], {
    fillet: 0.07, bevel: 0.05, capChamfer: 0.08, rotation: [0, 0, 0],
  }))
  box(chassis, m.graphite, [0.5, 0.52, BODY_W - 0.02], [0.16, 0.4, 0], {
    chamfer: 0.09, fillet: 0.03, bevel: 0.018, capChamfer: 0.05,
  })
  box(chassis, m.shellShade, [0.42, 0.16, BODY_W - 0.14], [0.16, 0.72, 0], {
    chamfer: 0.05, fillet: 0.018, bevel: 0.012,
  })
  // A flat vent cannot follow the rake, so it is a letterbox seated on the top
  // of its own span: 140 mm of height moves the casting's back by 32 mm, which
  // the surround's own thickness swallows.
  louvreVent(chassis, m, [0.34, 0.14], [rearFace(0.57), 0.5, 0], 3, 'left')
  for (const sz of [-1, 1]) {
    seam(chassis, m.shell, 0.9, [-0.4, 0.44, sz * FLANK], sz > 0 ? 'front' : 'back', 'across', 0.028, 0.016)
    boltRun(chassis, m.steel, [-0.85, 0.16, sz * FLANK], [-0.2, 0.16, sz * FLANK], 4, 0.018, sz > 0 ? 'front' : 'back')
  }

  // Front drive axle, wide tyres, almost under the mast.
  chassis.add(cylinder(m.steel, 0.075, BODY_W - 0.1, [AXLE_X, WHEEL_F, 0], AXIS_Z, 10))
  for (const sz of [-1, 1]) {
    const z = sz * (BODY_W * 0.5 - 0.12)
    chassis.add(cylinder(m.rubber, WHEEL_F, 0.28, [AXLE_X, WHEEL_F, z], AXIS_Z, 20))
    chassis.add(cylinder(m.shellShade, WHEEL_F * 0.5, 0.3, [AXLE_X, WHEEL_F, z], AXIS_Z, 14))
    chassis.add(cylinder(m.graphiteEdge, WHEEL_F * 0.24, 0.32, [AXLE_X, WHEEL_F, z], AXIS_Z, 12))
    for (let index = 0; index < 5; index += 1) {
      const angle = (Math.PI * 2 * index) / 5
      bolt(chassis, m.steel, [
        AXLE_X + Math.cos(angle) * WHEEL_F * 0.34, WHEEL_F + Math.sin(angle) * WHEEL_F * 0.34, z + sz * 0.15,
      ], 0.02, sz > 0 ? 'front' : 'back')
    }
  }
  // Rear steer axle: smaller wheels, turned a few degrees off straight.
  for (const sz of [-1, 1]) {
    const z = sz * (BODY_W * 0.5 - 0.2)
    box(chassis, m.graphite, [0.14, 0.2, 0.13], [-0.72, WHEEL_R + 0.09, z], {
      chamfer: 0.03, fillet: 0.011, bevel: 0.009,
    })
    const wheel = new Group()
    wheel.position.set(-0.72, WHEEL_R, z)
    wheel.rotation.y = 0.22
    chassis.add(wheel)
    wheel.add(cylinder(m.rubber, WHEEL_R, 0.18, [0, 0, 0], AXIS_Z, 16))
    wheel.add(cylinder(m.shellShade, WHEEL_R * 0.5, 0.2, [0, 0, 0], AXIS_Z, 12))
  }

  // Operator station: floor, seat, column, and the overhead guard.
  box(chassis, m.graphiteEdge, [0.72, 0.05, BODY_W - 0.24], [-0.24, 0.8, 0], {
    chamfer: 0.03, fillet: 0.011, bevel: 0.009,
  })
  box(chassis, m.ink, [0.36, 0.1, 0.42], [-0.42, 0.88, 0], { chamfer: 0.06, fillet: 0.022, bevel: 0.012 })
  box(chassis, m.graphite, [0.14, 0.42, 0.44], [-0.62, 1.06, 0], {
    chamfer: 0.07, fillet: 0.024, bevel: 0.014, rotation: [0, 0, 0.14],
  })
  box(chassis, m.shellShade, [0.22, 0.5, 0.3], [-0.02, 1.06, 0], {
    chamfer: 0.06, fillet: 0.022, bevel: 0.013, rotation: [0, 0, -0.22],
  })
  chassis.add(cylinder(m.graphiteEdge, 0.11, 0.05, [-0.14, 1.32, 0], [0, 0, -0.22 + Math.PI / 2], 12))
  chassis.add(cylinder(m.amberPaint, 0.05, 0.07, [-0.19, 1.36, 0.09], [0, 0, -0.22 + Math.PI / 2], 8))
  box(chassis, m.graphite, [0.16, 0.24, 0.1], [-0.3, 1.0, 0.3], { chamfer: 0.03, fillet: 0.011, bevel: 0.009 })
  for (const sy of [0, 1]) {
    box(chassis, sy > 0 ? m.amberPaint : m.graphiteEdge, [0.05, 0.16, 0.04], [-0.3, 1.12 + sy * 0.02, 0.36], {
      chamfer: 0.012, fillet: 0.005, bevel: 0.004, rotation: [0, 0, sy * 0.2 - 0.1],
    })
  }

  // Overhead guard: four posts and a slatted roof.
  const guardY = 2.02
  // Each pair of posts is footed on what is actually under it - the counterweight
  // crown behind, the hood in front. Run to a common 0.8 they stood on the
  // operator floor's x span, which neither pair is over.
  for (const [sx, foot] of [[-0.78, 0.7], [0.22, 0.6]] as const) {
    for (const sz of [-1, 1]) {
      const z = sz * (BODY_W * 0.5 - 0.09)
      tubeSection(chassis, m.graphite, [0.07, 0.07], 0.012, guardY - foot, [sx, foot + (guardY - foot) * 0.5, z], [Math.PI / 2, 0, 0])
    }
  }
  box(chassis, m.shell, [1.14, 0.05, BODY_W - 0.1], [-0.28, guardY, 0], {
    chamfer: 0.04, fillet: 0.014, bevel: 0.011,
  })
  for (let index = 0; index < 5; index += 1) {
    const z = (index / 4 - 0.5) * (BODY_W - 0.34)
    box(chassis, m.shellShade, [1.0, 0.03, 0.06], [-0.28, guardY + 0.035, z], {
      chamfer: 0.01, fillet: 0.004, bevel: 0.004,
    })
  }
  // The beacon sits on the roof deck, inboard of its edge and in the gap between
  // two slats rather than through the middle one.
  statusLens(chassis, m, [0.12, 0.06], [0.2, guardY + 0.025, -(BODY_W - 0.34) * 0.125], m.amber, 'top')
  // Guard-to-mast stay: the mast channels stand at z +/- 0.3, not at the guard's
  // own z, so this is a diagonal in all three axes.
  for (const sz of [-1, 1]) {
    member(chassis, m.shellShade, [0.22, guardY - 0.06, sz * (BODY_W * 0.5 - 0.09)], [AXLE_X + 0.18, MAST_H * 0.55, sz * 0.3], 0.05, 0.05)
  }

  const label = addLabelDecal(bundle, { variant: 350 })
  plaque(chassis, m, label, [0.28, 0.11], [-0.5, 0.5, FLANK], 'front', m.shellLight)
  const stripe = addStripeDecal(bundle, { count: 5, lean: 1 })
  plaque(chassis, m, stripe, [0.4, 0.08], [-0.55, 0.1, FLANK], 'front', m.ink)
  // Over the counterweight's crown, where there is casting behind it; at x -0.16
  // the mark spanned the gap between the casting and the hood, on neither.
  paintMark(chassis, m.amberPaint, slashProfile(0.07, 0.2, 0.42), [-0.8, 0.57, FLANK], 'front', 0.011)
  // The tow hitch straddles the casting's back face instead of sitting inside it.
  box(chassis, m.graphiteEdge, [0.14, 0.1, 0.12], [rearFace(0.16), 0.16, 0], { chamfer: 0.03, fillet: 0.011, bevel: 0.009 })
  chassis.add(cylinder(m.steel, 0.03, 0.08, [rearFace(0.16) - 0.06, 0.16, 0], AXIS_X, 10))
}

/** Outer mast channels and the hydraulic ram between them. */
function mastBuild(chassis: Group, m: CargoMaterials): void {
  for (const sz of [-1, 1]) {
    const z = sz * 0.3
    tubeSection(chassis, m.graphite, [0.11, 0.16], 0.016, MAST_H, [AXLE_X + 0.18, MAST_H * 0.5, z], [Math.PI / 2, 0, 0])
  }
  box(chassis, m.graphite, [0.2, 0.14, 0.72], [AXLE_X + 0.18, MAST_H - 0.07, 0], {
    chamfer: 0.035, fillet: 0.013, bevel: 0.011,
  })
  box(chassis, m.graphite, [0.24, 0.18, 0.76], [AXLE_X + 0.16, 0.24, 0], {
    chamfer: 0.045, fillet: 0.016, bevel: 0.012,
  })
  for (const sz of [-1, 1]) {
    bolt(chassis, m.steel, [AXLE_X + 0.16, 0.24, sz * 0.38], 0.022, sz > 0 ? 'front' : 'back')
  }
  // Tilt rams from the chassis to the mast foot.
  for (const sz of [-1, 1]) {
    const z = sz * 0.42
    chassis.add(cylinder(m.graphiteEdge, 0.055, 0.5, [AXLE_X - 0.24, 0.52, z], [0, 0, 0.9], 10))
    chassis.add(cylinder(m.steel, 0.032, 0.34, [AXLE_X + 0.02, 0.66, z], [0, 0, 0.9], 8))
  }
}

function build(): {
  root: Group
  chassis: Group
  innerMast: Group
  carriage: Group
  sockets: LoaderSockets
  bundle: CargoMaterialBundle
} {
  const bundle = acquireCargoMaterials(62_400, { condition: 0.8 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_INDUSTRIAL_FORKLIFT-LOADER_ROOT_LOWERED'
  const chassis = new Group()
  chassis.name = 'AXR_INDUSTRIAL_FORKLIFT-LOADER_PART_CHASSIS_DEFAULT'
  const innerMast = new Group()
  innerMast.name = 'AXR_INDUSTRIAL_FORKLIFT-LOADER_PART_INNER-MAST_LOWERED'
  const carriage = new Group()
  carriage.name = 'AXR_INDUSTRIAL_FORKLIFT-LOADER_PART_CARRIAGE_LOWERED'
  root.add(chassis, innerMast, carriage)

  chassisBuild(chassis, m, bundle)
  mastBuild(chassis, m)

  // Inner mast: narrower channels nested inside the outer pair.
  for (const sz of [-1, 1]) {
    tubeSection(innerMast, m.shell, [0.075, 0.12], 0.012, MAST_H - 0.2, [AXLE_X + 0.26, (MAST_H - 0.2) * 0.5 + 0.1, sz * 0.3], [Math.PI / 2, 0, 0])
  }
  innerMast.add(cylinder(m.steel, 0.05, MAST_H - 0.5, [AXLE_X + 0.24, (MAST_H - 0.5) * 0.5 + 0.2, 0], AXIS_Y, 10))
  box(innerMast, m.graphiteEdge, [0.16, 0.1, 0.66], [AXLE_X + 0.24, MAST_H - 0.14, 0], {
    chamfer: 0.028, fillet: 0.01, bevel: 0.009,
  })
  // Lift chain over the head sheave and down to the carriage.
  for (const sz of [-1, 1]) {
    innerMast.add(cylinder(m.steel, 0.028, 0.1, [AXLE_X + 0.24, MAST_H - 0.14, sz * 0.18], AXIS_Z, 10))
    box(innerMast, m.steel, [0.022, MAST_H - 0.6, 0.045], [AXLE_X + 0.33, (MAST_H - 0.6) * 0.5 + 0.22, sz * 0.18], {
      chamfer: 0.006, fillet: 0.003, bevel: 0.003,
    })
  }

  // Carriage and forks.
  const backrest = 0.72
  box(carriage, m.shellShade, [0.07, backrest, 0.86], [AXLE_X + 0.36, backrest * 0.5 + 0.1, 0], {
    chamfer: 0.03, fillet: 0.011, bevel: 0.01,
  })
  for (let index = 0; index < 4; index += 1) {
    box(carriage, m.graphiteEdge, [0.05, 0.05, 0.82], [AXLE_X + 0.4, 0.2 + index * 0.18, 0], {
      chamfer: 0.014, fillet: 0.005, bevel: 0.005,
    })
  }
  for (const sz of [-1, 1]) {
    box(carriage, m.graphite, [0.09, 0.14, 0.1], [AXLE_X + 0.3, 0.16, sz * 0.3], {
      chamfer: 0.026, fillet: 0.01, bevel: 0.008,
    })
  }
  // Forks: an L profile each, so the heel is one continuous radius.
  const forkProfile: Vec2[] = [
    [0, 0], [FORK_L, 0], [FORK_L, 0.035],
    [0.14, 0.06], [0.13, 0.68], [0, 0.68],
  ]
  for (const sz of [-1, 1]) {
    carriage.add(extrudeProfile(m.steel, forkProfile, 0.13, [AXLE_X + 0.42, 0.06, sz * 0.34], {
      fillet: 0.025, bevel: 0.018, capChamfer: 0.014,
    }))
    box(carriage, m.amberPaint, [0.16, 0.02, 0.14], [AXLE_X + 0.42 + FORK_L * 0.86, 0.075, sz * 0.34], {
      chamfer: 0.008, fillet: 0.004, bevel: 0.003,
    })
  }

  const sockets: LoaderSockets = {
    fork_tips: socket('fork_tips', [AXLE_X + 0.42 + FORK_L, 0.07, 0]),
    carriage: socket('carriage', [AXLE_X + 0.4, 0.4, 0]),
    seat: socket('seat', [-0.42, 0.98, 0]),
    tow_hitch: socket('tow_hitch', [rearFace(0.16) - 0.1, 0.16, 0]),
  }
  return { root, chassis, innerMast, carriage, sockets, bundle }
}

export function createModel(): ForkliftController {
  const { root, chassis, innerMast, carriage, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'industrial-forklift-loader',
    assemblies: [innerMast, carriage],
    reach: 0.2,
    sockets: Object.values(sockets),
  })

  let state: LoaderState = 'lowered'
  let elapsed = 0
  let travel = 0
  return {
    root,
    parts: { chassis, innerMast, carriage },
    sockets,
    get state() {
      return state
    },
    setState: (next: LoaderState) => {
      state = next
      root.name = next === 'raised'
        ? 'AXR_INDUSTRIAL_FORKLIFT-LOADER_ROOT_RAISED'
        : 'AXR_INDUSTRIAL_FORKLIFT-LOADER_ROOT_LOWERED'
      travel = next === 'raised' ? 1 : 0
      innerMast.position.y = travel * (MAST_H - 0.5)
      carriage.position.y = travel * (MAST_H - 0.5) * 2
      return state
    },
    update: (deltaSeconds: number) => {
      const step = Math.min(Math.max(deltaSeconds, 0), 0.05)
      elapsed += step
      const target = state === 'raised' ? 1 : 0
      if (Math.abs(target - travel) > 1e-4) {
        travel += Math.sign(target - travel) * Math.min(Math.abs(target - travel), step * 0.4)
      }
      const smooth = travel * travel * (3 - 2 * travel)
      // Two-stage lift: the carriage runs up the inner mast, and the inner mast
      // runs up the outer, so the forks travel twice the mast's own stroke.
      innerMast.position.y = smooth * (MAST_H - 0.5)
      carriage.position.y = smooth * (MAST_H - 0.5) * 2
      bundle.materials.amber.emissiveIntensity = 1.6 + Math.abs(Math.sin(elapsed * 3.2)) * 1.1
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: LoaderState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'lowered')
  return createCargoPreview(model, {
    target: [0.1, MAST_H * 0.42, 0],
    distance: 7.6,
    yaw: 0.86,
    pitch: 0.22,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createRaisedPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'raised' })
