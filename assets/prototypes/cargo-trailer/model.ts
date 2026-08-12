import { Group, Object3D } from 'three/webgpu'

import { cylinder } from '../../../src/asset-forge/generator/index.ts'
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
  cornerCasting,
  createCargoPreview,
  finishModel,
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
 * Axiom Relay cargo trailer — a towed flatbed skeletal.
 *
 * A yard trailer, not a road one: short drawbar with a ring hitch, a single
 * bogie of four wheels under the tail, a parking jack at the nose, and twistlock
 * castings on the deck at the container's own corner spacing. Those castings are
 * the reason it belongs in this pack rather than in a vehicle set - it is the
 * thing the containers ride on.
 */

const LENGTH = 4.6
const WIDTH = 1.86
const DECK = 0.58
const WHEEL = 0.28
const CASTING_X = 1.9
const CASTING_Z = 0.72

interface TrailerSockets {
  hitch_ring: Object3D
  deck_centre: Object3D
  lock_fore_left: Object3D
  lock_aft_right: Object3D
  jack_foot: Object3D
}

export type TrailerState = 'parked' | 'hitched'

export interface CargoTrailerController {
  root: Group
  parts: { chassis: Group; jack: Group }
  sockets: TrailerSockets
  readonly state: TrailerState
  setState(state: TrailerState): TrailerState
  update(deltaSeconds: number): void
  dispose(): void
}

function bogie(chassis: Group, m: CargoMaterials, x: number): void {
  for (const sz of [-1, 1]) {
    const z = sz * (WIDTH * 0.5 - 0.11)
    // Leaf pack and hanger, so the wheels hang off something.
    box(chassis, m.graphite, [0.9, 0.06, 0.13], [x, DECK - 0.22, z], {
      chamfer: 0.024, fillet: 0.009, bevel: 0.008,
    })
    box(chassis, m.graphiteEdge, [0.7, 0.05, 0.11], [x, DECK - 0.27, z], {
      chamfer: 0.02, fillet: 0.008, bevel: 0.007,
    })
    for (const dx of [-0.32, 0.32]) {
      chassis.add(cylinder(m.rubber, WHEEL, 0.19, [x + dx, WHEEL, z], AXIS_X, 18))
      chassis.add(cylinder(m.shellShade, WHEEL * 0.52, 0.2, [x + dx, WHEEL, z], AXIS_X, 14))
      chassis.add(cylinder(m.graphiteEdge, WHEEL * 0.3, 0.22, [x + dx, WHEEL, z], AXIS_X, 12))
      chassis.add(cylinder(m.ink, WHEEL * 0.1, 0.24, [x + dx, WHEEL, z], AXIS_X, 8))
      // Mudguard over each wheel: a shallow arc of three plates.
      for (const angle of [-0.5, 0, 0.5]) {
        box(chassis, m.shellShade, [0.3, 0.02, 0.24], [
          x + dx + Math.sin(angle) * (WHEEL + 0.06),
          WHEEL + Math.cos(angle) * (WHEEL + 0.06),
          z,
        ], { chamfer: 0.01, fillet: 0.004, bevel: 0.004, rotation: [0, 0, -angle] })
      }
    }
    chassis.add(cylinder(m.steel, 0.035, WIDTH - 0.1, [x - 0.32, WHEEL, 0], AXIS_X, 10))
    chassis.add(cylinder(m.steel, 0.035, WIDTH - 0.1, [x + 0.32, WHEEL, 0], AXIS_X, 10))
  }
}

function chassisBody(chassis: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  // Two main longitudinals plus cross members: a skeletal, so the deck reads
  // through and the trailer never becomes a slab.
  for (const sz of [-1, 1]) {
    tubeSection(chassis, m.graphite, [0.16, 0.2], 0.018, LENGTH, [0, DECK - 0.1, sz * (WIDTH * 0.5 - 0.14)], [0, Math.PI / 2, 0])
  }
  const crossCount = 9
  for (let index = 0; index < crossCount; index += 1) {
    const x = (index / (crossCount - 1) - 0.5) * (LENGTH - 0.4)
    box(chassis, m.graphiteEdge, [0.09, 0.11, WIDTH - 0.32], [x, DECK - 0.12, 0], {
      chamfer: 0.024, fillet: 0.009, bevel: 0.008,
    })
  }
  box(chassis, m.shellShade, [LENGTH - 0.1, 0.04, WIDTH - 0.06], [0, DECK, 0], {
    chamfer: 0.06, fillet: 0.02, bevel: 0.012,
  })
  for (let index = 0; index < 11; index += 1) {
    const x = (index / 10 - 0.5) * (LENGTH - 0.5)
    seam(chassis, m.shellShade, WIDTH - 0.24, [x, DECK + 0.02, 0], 'top', 'along', 0.024, 0.013)
  }
  for (const sz of [-1, 1]) {
    box(chassis, m.amberPaint, [LENGTH - 0.1, 0.055, 0.05], [0, DECK + 0.03, sz * (WIDTH * 0.5 - 0.01)], {
      chamfer: 0.016, fillet: 0.006, bevel: 0.005,
    })
  }

  // Twistlock castings at the container corner spacing.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      cornerCasting(chassis, m, [0.2, 0.1, 0.2], [sx * CASTING_X, DECK + 0.05, sz * CASTING_Z], 0.04, 'y', m.shellLight)
      chassis.add(cylinder(m.steel, 0.038, 0.08, [sx * CASTING_X, DECK + 0.1, sz * CASTING_Z], AXIS_Y, 8))
      chassis.add(cylinder(m.amberPaint, 0.024, 0.09, [sx * CASTING_X, DECK + 0.12, sz * CASTING_Z], AXIS_Y, 6))
    }
  }

  bogie(chassis, m, LENGTH * 0.5 - 1.0)

  // Drawbar and ring hitch at the nose.
  const nose = -LENGTH * 0.5
  for (const sz of [-1, 1]) {
    member(chassis, m.graphite, [nose + 0.1, DECK - 0.1, sz * (WIDTH * 0.5 - 0.14)], [nose - 0.62, DECK - 0.16, sz * 0.1], 0.1, 0.12)
  }
  box(chassis, m.graphiteEdge, [0.4, 0.1, 0.16], [nose - 0.78, DECK - 0.16, 0], {
    chamfer: 0.028, fillet: 0.01, bevel: 0.009,
  })
  chassis.add(cylinder(m.steel, 0.075, 0.05, [nose - 0.98, DECK - 0.16, 0], AXIS_Z, 12))
  chassis.add(cylinder(m.ink, 0.045, 0.062, [nose - 0.98, DECK - 0.16, 0], AXIS_Z, 10))
  box(chassis, m.amberPaint, [0.16, 0.06, 0.1], [nose - 0.56, DECK - 0.08, 0], {
    chamfer: 0.018, fillet: 0.007, bevel: 0.006,
  })

  // Tail lamps and a rear underrun bar.
  box(chassis, m.graphite, [0.1, 0.16, WIDTH - 0.2], [LENGTH * 0.5 - 0.02, DECK - 0.3, 0], {
    chamfer: 0.028, fillet: 0.01, bevel: 0.009,
  })
  for (const sz of [-1, 1]) {
    statusLens(chassis, m, [0.09, 0.09], [LENGTH * 0.5 + 0.04, DECK - 0.3, sz * (WIDTH * 0.5 - 0.24)], sz > 0 ? m.amber : m.cyan, 'right')
  }
  const stripe = addStripeDecal(bundle, { count: 7, lean: 1 })
  plaque(chassis, m, stripe, [WIDTH - 0.6, 0.08], [LENGTH * 0.5 + 0.04, DECK - 0.12, 0], 'right', m.ink)

  const label = addLabelDecal(bundle, { variant: 210 })
  plaque(chassis, m, label, [0.3, 0.11], [-LENGTH * 0.28, DECK - 0.1, WIDTH * 0.5 - 0.12], 'front', m.shellLight)
  paintMark(chassis, m.amberPaint, slashProfile(0.07, 0.14, 0.45), [LENGTH * 0.2, DECK - 0.1, WIDTH * 0.5 - 0.12], 'front', 0.01)
  boltRun(chassis, m.steel, [-LENGTH * 0.4, DECK - 0.1, WIDTH * 0.5 - 0.13], [LENGTH * 0.4, DECK - 0.1, WIDTH * 0.5 - 0.13], 7, 0.016, 'front')
  for (const sx of [-1, 1]) bolt(chassis, m.steel, [sx * CASTING_X, DECK + 0.021, 0], 0.016, 'top')
}

/** Parking jack: an outer tube, an inner leg, a foot, and a crank handle. */
function jackBody(jack: Group, m: CargoMaterials): void {
  jack.add(cylinder(m.graphite, 0.055, 0.34, [0, 0.17, 0], AXIS_Y, 10))
  jack.add(cylinder(m.steel, 0.038, 0.3, [0, -0.05, 0], AXIS_Y, 10))
  box(jack, m.graphiteEdge, [0.16, 0.03, 0.16], [0, -0.19, 0], {
    chamfer: 0.04, fillet: 0.014, bevel: 0.008,
  })
  jack.add(cylinder(m.steel, 0.012, 0.16, [0.1, 0.3, 0], AXIS_X, 8))
  jack.add(cylinder(m.rubber, 0.018, 0.07, [0.17, 0.3, 0], AXIS_Y, 8))
}

function build(): {
  root: Group
  chassis: Group
  jack: Group
  sockets: TrailerSockets
  bundle: CargoMaterialBundle
} {
  const bundle = acquireCargoMaterials(59_200, { condition: 0.76 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_CARGO-TRAILER_ROOT_PARKED'
  const chassis = new Group()
  chassis.name = 'AXR_CARGO_CARGO-TRAILER_PART_CHASSIS_DEFAULT'
  const jack = new Group()
  jack.name = 'AXR_CARGO_CARGO-TRAILER_PART_JACK_DOWN'
  root.add(chassis, jack)

  chassisBody(chassis, m, bundle)
  jack.position.set(-LENGTH * 0.5 + 0.3, DECK - 0.26, 0.36)
  jackBody(jack, m)

  const sockets: TrailerSockets = {
    hitch_ring: socket('hitch_ring', [-LENGTH * 0.5 - 0.98, DECK - 0.16, 0]),
    deck_centre: socket('deck_centre', [0, DECK + 0.02, 0]),
    lock_fore_left: socket('lock_fore_left', [-CASTING_X, DECK + 0.1, -CASTING_Z]),
    lock_aft_right: socket('lock_aft_right', [CASTING_X, DECK + 0.1, CASTING_Z]),
    jack_foot: socket('jack_foot', [-LENGTH * 0.5 + 0.3, 0, 0.36]),
  }
  return { root, chassis, jack, sockets, bundle }
}

export function createModel(): CargoTrailerController {
  const { root, chassis, jack, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'cargo-trailer',
    assemblies: [jack],
    reach: 0.24,
    sockets: Object.values(sockets),
  })

  let state: TrailerState = 'parked'
  let blend = 0
  let elapsed = 0
  const downY = DECK - 0.26
  const applyBlend = (): void => {
    jack.position.y = downY + blend * 0.26
    jack.name = blend > 0.02
      ? 'AXR_CARGO_CARGO-TRAILER_PART_JACK_RAISED'
      : 'AXR_CARGO_CARGO-TRAILER_PART_JACK_DOWN'
  }

  return {
    root,
    parts: { chassis, jack },
    sockets,
    get state() {
      return state
    },
    setState: (next: TrailerState) => {
      state = next
      root.name = next === 'hitched'
        ? 'AXR_CARGO_CARGO-TRAILER_ROOT_HITCHED'
        : 'AXR_CARGO_CARGO-TRAILER_ROOT_PARKED'
      blend = next === 'hitched' ? 1 : 0
      applyBlend()
      return state
    },
    update: (deltaSeconds: number) => {
      const step = Math.min(Math.max(deltaSeconds, 0), 0.05)
      elapsed += step
      const target = state === 'hitched' ? 1 : 0
      if (Math.abs(target - blend) > 1e-4) {
        blend += Math.sign(target - blend) * Math.min(Math.abs(target - blend), step * 0.5)
        applyBlend()
      }
      bundle.materials.amber.emissiveIntensity = state === 'hitched'
        ? 1.6 + Math.abs(Math.sin(elapsed * 3.4)) * 1.2
        : 1.9 + Math.sin(elapsed * 1.4) * 0.2
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: TrailerState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'parked')
  return createCargoPreview(model, {
    target: [0, DECK * 0.7, 0],
    distance: 9.4,
    yaw: 0.8,
    pitch: 0.24,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createHitchedPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'hitched' })
