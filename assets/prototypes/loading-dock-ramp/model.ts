import { Group, Object3D } from 'three/webgpu'

import { cylinder, extrudeProfile, type Vec2 } from '../../../src/asset-forge/generator/index.ts'
import {
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

/** Running deck: one plane, so everything on or under it is solved from it. */
const SLOPE = Math.atan2(RISE - 0.12, RUN - 0.5)
const DECK_LEN = Math.hypot(RUN - 0.5, RISE - 0.12)
const DECK_HALF = 0.025 / Math.cos(SLOPE)
const deckMid = (x: number): number => RISE * 0.5 - 0.02 + x * Math.tan(SLOPE)

/**
 * The beam's top chord at a given x, read straight off the profile it is cut
 * from: it climbs from (-1.46, 0.055) to the knee at (1.18, 0.89) and then eases
 * onto the crest at (1.8, 1.05).
 *
 * Interpolating between the ends of the run instead - which is what this was -
 * describes a chord the beam does not have: 79 mm high over the web at the toe
 * and 28 mm below it at the crest, so the low stanchions stood in the air and
 * the high one sank into the plate.
 */
const beamTop = (x: number): number => x <= RUN * 0.5 - 0.62
  ? 0.055 + (x + RUN * 0.5 - 0.34) * (RISE - 0.215) / (RUN - 0.96)
  : RISE - 0.16 + (x - RUN * 0.5 + 0.62) * 0.16 / 0.62

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
    [-RUN * 0.5 + 0.3, 0],
  ]
}

function deck(body: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  // One continuous running surface, tilted once.
  box(body, m.graphite, [DECK_LEN, 0.05, WIDTH - 0.24], [0, RISE * 0.5 - 0.02, 0], {
    chamfer: 0.05, fillet: 0.018, bevel: 0.012, rotation: [0, 0, SLOPE],
  })
  // Grip cleats across the run, at the pitch a wheel actually needs.
  const cleats = 13
  for (let index = 0; index < cleats; index += 1) {
    const t = (index + 0.5) / cleats - 0.5
    box(body, m.graphiteEdge, [0.05, 0.022, WIDTH - 0.3], [
      Math.cos(SLOPE) * t * DECK_LEN,
      RISE * 0.5 - 0.02 + Math.sin(SLOPE) * t * DECK_LEN + 0.035,
      0,
    ], { chamfer: 0.008, fillet: 0.004, bevel: 0.004, rotation: [0, 0, SLOPE] })
  }
  // Kerbs, one per side, following the same slope.
  for (const sz of [-1, 1]) {
    box(body, m.amberPaint, [DECK_LEN, 0.13, 0.07], [0, RISE * 0.5 + 0.05, sz * (WIDTH * 0.5 - 0.14)], {
      chamfer: 0.024, fillet: 0.009, bevel: 0.008, rotation: [0, 0, SLOPE],
    })
  }
  // The hazard band lies on the deck, so it is raked with it and sized to it: a
  // level 1.54 m plate on a 16.7 degree deck is flush at one end, a quarter of a
  // metre under the plate at the other and out over bare ground past the toe.
  // It sits in the gap between the first two cleats and runs across the width.
  const band = 1 / cleats - 0.5
  const stripe = addStripeDecal(bundle, { count: 8, lean: 1 })
  plaque(body, m, stripe, [WIDTH - 0.5, 0.11], [
    Math.cos(SLOPE) * band * DECK_LEN,
    RISE * 0.5 - 0.02 + Math.sin(SLOPE) * band * DECK_LEN + DECK_HALF,
    0,
  ], 'top', m.ink, 0, [-Math.PI / 2, -SLOPE, Math.PI / 2])
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
    // The bolt line follows the top chord 40 mm down, which keeps it on the web
    // over the whole run instead of climbing off it at the toe.
    boltRun(body, m.steel,
      [-RUN * 0.34, beamTop(-RUN * 0.34) - 0.04, sz * WIDTH * 0.5],
      [RUN * 0.36, beamTop(RUN * 0.36) - 0.04, sz * WIDTH * 0.5],
      6, 0.02, sz > 0 ? 'front' : 'back')
  }
  // Cross bracing between the beams, hung 20 mm up into the deck it carries.
  // On its own slope it climbed through the running surface at the toe end and
  // dropped clear of the beams at the crest.
  const braceY = (x: number): number => deckMid(x) - DECK_HALF - 0.025
  const braces = [-0.24, -0.04, 0.16, 0.36]
  for (const t of braces) {
    box(body, m.graphite, [0.08, 0.09, WIDTH - 0.2], [t * RUN, braceY(t * RUN), 0], { chamfer: 0.022, fillet: 0.008, bevel: 0.007 })
  }
  // Two stringers on the braces' own line, so the pair is one frame.
  for (const sz of [-1, 1]) {
    const first = braces[0] * RUN
    const last = braces[braces.length - 1] * RUN
    member(body, m.graphite, [first, braceY(first), sz * 0.4], [last, braceY(last), sz * 0.4], 0.05, 0.05)
  }

  deck(body, m, bundle)

  // Toe end: a feathered plate and two ground anchors. The plate runs back to
  // x = -1.46 because the profile's toe spike is too sharp to survive its own
  // fillet and the beam actually begins at -1.655, so a 0.42 m plate ended 55 mm
  // short of the ramp and lay on the ground attached to nothing.
  box(body, m.ironOxide, [0.67, 0.024, WIDTH - 0.1], [-RUN * 0.5 + 0.005, 0.012, 0], {
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
  statusLens(body, m, [0.07, 0.05], [crestX + 0.14, RISE - 0.24, WIDTH * 0.5 - 0.16], m.amber, 'right')
  box(body, m.amberPaint, [0.05, 0.09, 0.06], [crestX + 0.15, RISE - 0.42, WIDTH * 0.5 - 0.16], {
    chamfer: 0.016, fillet: 0.006, bevel: 0.005,
  })

  // Handrails: three stanchions and two rails per side, socketed into the beam
  // top. The socket height comes off the beam's own chord rather than a guess,
  // or the low-end stanchions hang in the air and the high-end ones sink into
  // the web - the classic tell of a ramp assembled by eye.
  const stanchions = [-0.3, 0.1, 0.44]
  for (const sz of [-1, 1]) {
    const z = sz * (WIDTH * 0.5 - 0.06)
    for (const t of stanchions) {
      const y = beamTop(t * RUN)
      body.add(cylinder(m.shell, 0.024, 0.9, [t * RUN, y + 0.44, z], AXIS_Y, 8))
      // The crest stanchion passes through the levelling pad on its way down to
      // the chord, so its base plate belongs on the pad's top face; seated on the
      // chord the plate is 56 mm inside the pad and only a 10 mm sliver shows.
      const foot = t * RUN >= crestX - 0.18 ? RISE : y
      box(body, m.graphiteEdge, [0.08, 0.07, 0.08], [t * RUN, foot + 0.02, z], { chamfer: 0.02, fillet: 0.007, bevel: 0.006 })
    }
    const first = stanchions[0]
    const last = stanchions[stanchions.length - 1]
    for (const lift of [0.88, 0.46]) {
      member(body, lift > 0.6 ? m.shell : m.shellShade,
        [first * RUN, beamTop(first * RUN) + lift, z],
        [last * RUN, beamTop(last * RUN) + lift, z],
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
  // The lip swings about Z, so its knuckles lie on Z.
  for (const sz of [-1, 1]) {
    lip.add(cylinder(m.steel, 0.035, 0.16, [0, -0.02, sz * (WIDTH * 0.5 - 0.16)], AXIS_Z, 10))
  }
  const label = addLabelDecal(bundle, { variant: 220 })
  plaque(body, m, label, [0.28, 0.1], [crestX - 0.02, RISE, -0.5], 'top', m.shellLight)
  // On the beam's outer face; at the half-width less 60 mm it was inside the web.
  paintMark(body, m.amberPaint, slashProfile(0.06, 0.16, 0.45), [RUN * 0.34, RISE - 0.44, WIDTH * 0.5], 'front', 0.01)

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
    // The ramp is nearly six metres of run against one of rise, so the frame is
    // set by its length: at 8.6 m the toe plate ran off the right-hand edge.
    target: [0, RISE * 0.51, 0],
    distance: 10.2,
    yaw: 0.86,
    pitch: 0.46,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createStowedPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'stowed' })
