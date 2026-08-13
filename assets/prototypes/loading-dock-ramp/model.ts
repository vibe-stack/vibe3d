import { Group, Object3D } from 'three/webgpu'

import { cylinder, extrudeProfile, type Vec2 } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  AXIS_Y,
  acquireCargoMaterials,
  addLabelDecal,
  addStripeDecal,
  bolt,
  box,
  boltRun,
  createCargoPreview,
  finishModel,
  member,
  paintMark,
  plaque,
  slashProfile,
  socket,
  statusLens,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay loading dock ramp — a yard ramp with a hinged lip.
 *
 * The one prop in the pack that resolves a height difference, so its whole
 * design is the transition: a tapered side beam that hides the change in slope,
 * a running deck of grip plate, a hinged lip that lands on the trailer bed, and
 * kerbs high enough to stop a wheel leaving the edge.
 *
 * The side beams are single extruded profiles. Stacking boxes to fake the taper
 * would leave a stepped silhouette exactly where the eye follows the slope.
 */

const RUN = 3.6
const WIDTH = 2.0
const RISE = 1.05
const LIP = 0.42

interface RampSockets {
  crest: Object3D
  toe: Object3D
  lip_hinge: Object3D
  handrail_left: Object3D
}

export type RampState = 'stowed' | 'landed'

export interface DockRampController {
  root: Group
  parts: { body: Group; lip: Group }
  sockets: RampSockets
  readonly state: RampState
  setState(state: RampState): RampState
  update(deltaSeconds: number): void
  dispose(): void
}

/** Side beam: a wedge with a levelled crest and a feathered toe. */
function beamProfile(): Vec2[] {
  return [
    [-RUN * 0.5, 0],
    [-RUN * 0.5 + 0.34, 0.055],
    [RUN * 0.5 - 0.62, RISE - 0.16],
    [RUN * 0.5, RISE],
    [RUN * 0.5, RISE - 0.34],
    [RUN * 0.5 - 0.5, RISE - 0.52],
    [-RUN * 0.5 + 0.3, -0.03],
  ]
}

function deck(body: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  const slope = Math.atan2(RISE - 0.12, RUN - 0.5)
  const length = Math.hypot(RUN - 0.5, RISE - 0.12)
  // One continuous running surface, tilted once.
  box(body, m.graphite, [length, 0.05, WIDTH - 0.24], [0, RISE * 0.5 - 0.02, 0], {
    chamfer: 0.05, fillet: 0.018, bevel: 0.012, rotation: [0, 0, slope],
  })
  // Grip cleats across the run, at the pitch a wheel actually needs.
  const cleats = 13
  for (let index = 0; index < cleats; index += 1) {
    const t = (index + 0.5) / cleats - 0.5
    box(body, m.graphiteEdge, [0.05, 0.022, WIDTH - 0.3], [
      Math.cos(slope) * t * length,
      RISE * 0.5 - 0.02 + Math.sin(slope) * t * length + 0.035,
      0,
    ], { chamfer: 0.008, fillet: 0.004, bevel: 0.004, rotation: [0, 0, slope] })
  }
  // Kerbs, one per side, following the same slope.
  for (const sz of [-1, 1]) {
    box(body, m.amberPaint, [length, 0.13, 0.07], [0, RISE * 0.5 + 0.05, sz * (WIDTH * 0.5 - 0.14)], {
      chamfer: 0.024, fillet: 0.009, bevel: 0.008, rotation: [0, 0, slope],
    })
  }
  const stripe = addStripeDecal(bundle, { count: 8, lean: 1 })
  plaque(body, m, stripe, [WIDTH - 0.5, 0.11], [-RUN * 0.5 + 0.34, 0.075, 0], 'top', m.ink)
}

function build(): {
  root: Group
  body: Group
  lip: Group
  sockets: RampSockets
  bundle: CargoMaterialBundle
} {
  const bundle = acquireCargoMaterials(59_400, { condition: 0.82 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_LOADING-DOCK-RAMP_ROOT_STOWED'
  const body = new Group()
  body.name = 'AXR_CARGO_LOADING-DOCK-RAMP_PART_BODY_DEFAULT'
  const lip = new Group()
  lip.name = 'AXR_CARGO_LOADING-DOCK-RAMP_PART_LIP_STOWED'
  root.add(body, lip)

  for (const sz of [-1, 1]) {
    body.add(extrudeProfile(m.shell, beamProfile(), 0.14, [0, 0, sz * (WIDTH * 0.5 - 0.07)], {
      fillet: 0.03, bevel: 0.02, capChamfer: 0.03,
    }))
    boltRun(body, m.steel, [-RUN * 0.4, 0.14, sz * (WIDTH * 0.5 - 0.005)], [RUN * 0.36, RISE - 0.42, sz * (WIDTH * 0.5 - 0.005)], 6, 0.02, sz > 0 ? 'front' : 'back')
  }
  // Cross bracing between the beams, visible under the deck.
  for (let index = 0; index < 4; index += 1) {
    const t = -0.34 + index * 0.24
    const x = t * RUN
    const y = 0.12 + (t + 0.5) * (RISE - 0.5)
    box(body, m.graphite, [0.08, 0.09, WIDTH - 0.2], [x, y, 0], { chamfer: 0.022, fillet: 0.008, bevel: 0.007 })
  }
  for (const sz of [-1, 1]) {
    member(body, m.graphite, [-RUN * 0.3, 0.1, sz * 0.4], [RUN * 0.2, RISE - 0.5, sz * 0.4], 0.05, 0.05)
  }

  deck(body, m, bundle)

  // Toe end: a feathered plate and two ground anchors.
  box(body, m.ironOxide, [0.42, 0.024, WIDTH - 0.1], [-RUN * 0.5 - 0.12, 0.012, 0], {
    chamfer: 0.014, fillet: 0.006, bevel: 0.005, rotation: [0, 0, 0.045],
  })
  for (const sz of [-1, 1]) {
    box(body, m.graphiteEdge, [0.13, 0.06, 0.13], [-RUN * 0.5 + 0.06, 0.03, sz * (WIDTH * 0.5 - 0.16)], {
      chamfer: 0.03, fillet: 0.011, bevel: 0.008,
    })
    bolt(body, m.steel, [-RUN * 0.5 + 0.06, 0.06, sz * (WIDTH * 0.5 - 0.16)], 0.02, 'top')
  }

  // Crest: a levelling pad, the lip hinge line, and the operator's controls.
  const crestX = RUN * 0.5 - 0.16
  box(body, m.graphite, [0.36, 0.12, WIDTH - 0.06], [crestX, RISE - 0.06, 0], {
    chamfer: 0.035, fillet: 0.013, bevel: 0.01,
  })
  box(body, m.graphite, [0.24, 0.44, 0.24], [crestX + 0.02, RISE - 0.34, WIDTH * 0.5 - 0.16], {
    chamfer: 0.05, fillet: 0.018, bevel: 0.012,
  })
  statusLens(body, m, [0.07, 0.05], [crestX + 0.16, RISE - 0.24, WIDTH * 0.5 - 0.16], m.amber, 'right')
  box(body, m.amberPaint, [0.05, 0.09, 0.06], [crestX + 0.15, RISE - 0.42, WIDTH * 0.5 - 0.16], {
    chamfer: 0.016, fillet: 0.006, bevel: 0.005,
  })

  // Handrails: three stanchions and two rails per side, socketed into the beam
  // top. The socket height is solved from the beam's own slope rather than
  // guessed, or the low-end stanchions hang in the air and the high-end ones
  // sink into the web - the classic tell of a ramp assembled by eye.
  const beamTop = (t: number): number => 0.055 + (t + 0.5) * (RISE - 0.055)
  const stanchions = [-0.3, 0.1, 0.44]
  for (const sz of [-1, 1]) {
    const z = sz * (WIDTH * 0.5 - 0.06)
    for (const t of stanchions) {
      const y = beamTop(t)
      body.add(cylinder(m.shell, 0.024, 0.9, [t * RUN, y + 0.44, z], AXIS_Y, 8))
      box(body, m.graphiteEdge, [0.08, 0.07, 0.08], [t * RUN, y + 0.02, z], { chamfer: 0.02, fillet: 0.007, bevel: 0.006 })
    }
    const first = stanchions[0]
    const last = stanchions[stanchions.length - 1]
    for (const lift of [0.88, 0.46]) {
      member(body, lift > 0.6 ? m.shell : m.shellShade,
        [first * RUN, beamTop(first) + lift, z],
        [last * RUN, beamTop(last) + lift, z],
        lift > 0.6 ? 0.045 : 0.032, lift > 0.6 ? 0.045 : 0.032)
    }
  }

  // Hinged lip: its own assembly, pivoting on the crest.
  lip.position.set(RUN * 0.5, RISE, 0)
  box(lip, m.ironOxide, [LIP, 0.045, WIDTH - 0.1], [LIP * 0.5, -0.02, 0], {
    chamfer: 0.022, fillet: 0.009, bevel: 0.008, capChamfer: [0.02, 0],
  })
  box(lip, m.amberPaint, [0.07, 0.05, WIDTH - 0.12], [LIP - 0.03, -0.005, 0], {
    chamfer: 0.014, fillet: 0.005, bevel: 0.005,
  })
  for (const sz of [-1, 1]) {
    lip.add(cylinder(m.steel, 0.035, 0.16, [0, -0.02, sz * (WIDTH * 0.5 - 0.16)], AXIS_X, 10))
  }
  const label = addLabelDecal(bundle, { variant: 220 })
  plaque(body, m, label, [0.28, 0.1], [crestX - 0.02, RISE + 0.005, -0.5], 'top', m.shellLight)
  paintMark(body, m.amberPaint, slashProfile(0.06, 0.16, 0.45), [RUN * 0.34, RISE - 0.44, WIDTH * 0.5 - 0.06], 'front', 0.01)

  const sockets: RampSockets = {
    crest: socket('crest', [RUN * 0.5, RISE + 0.03, 0]),
    toe: socket('toe', [-RUN * 0.5 - 0.3, 0.02, 0]),
    lip_hinge: socket('lip_hinge', [RUN * 0.5, RISE, 0]),
    handrail_left: socket('handrail_left', [0, RISE * 0.6 + 0.86, -(WIDTH * 0.5 - 0.06)]),
  }
  return { root, body, lip, sockets, bundle }
}

export function createModel(): DockRampController {
  const { root, body, lip, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'loading-dock-ramp',
    assemblies: [lip],
    reach: 0.2,
    sockets: Object.values(sockets),
  })

  let state: RampState = 'stowed'
  let blend = 0
  let elapsed = 0
  const applyBlend = (): void => {
    // Stowed the lip stands up; landed it lies flat on the trailer bed.
    lip.rotation.z = (1 - blend) * 1.5
    lip.name = blend > 0.02
      ? 'AXR_CARGO_LOADING-DOCK-RAMP_PART_LIP_LANDED'
      : 'AXR_CARGO_LOADING-DOCK-RAMP_PART_LIP_STOWED'
  }
  applyBlend()

  return {
    root,
    parts: { body, lip },
    sockets,
    get state() {
      return state
    },
    setState: (next: RampState) => {
      state = next
      root.name = next === 'landed'
        ? 'AXR_CARGO_LOADING-DOCK-RAMP_ROOT_LANDED'
        : 'AXR_CARGO_LOADING-DOCK-RAMP_ROOT_STOWED'
      blend = next === 'landed' ? 1 : 0
      applyBlend()
      return state
    },
    update: (deltaSeconds: number) => {
      const step = Math.min(Math.max(deltaSeconds, 0), 0.05)
      elapsed += step
      const target = state === 'landed' ? 1 : 0
      if (Math.abs(target - blend) > 1e-4) {
        blend += Math.sign(target - blend) * Math.min(Math.abs(target - blend), step * 0.7)
        applyBlend()
      }
      bundle.materials.amber.emissiveIntensity = state === 'landed'
        ? 2.2
        : 1.5 + Math.abs(Math.sin(elapsed * 2.6)) * 1.0
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: RampState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'landed')
  return createCargoPreview(model, {
    target: [0, RISE * 0.6, 0],
    distance: 8.6,
    yaw: 0.86,
    pitch: 0.46,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createStowedPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'stowed' })
