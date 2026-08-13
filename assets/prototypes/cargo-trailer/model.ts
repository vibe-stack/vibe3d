import { Group, Object3D } from 'three/webgpu'

import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  AXIS_Y,
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
/** Wall of the two main longitudinals, which the tail bar has to reach up into. */
const RAIL_WALL = 0.018
// The jack clamps to the nose cross member. Its foot is authored 205 mm below
// the group origin, so JACK_DOWN is what stands that foot on the floor, and the
// lift is short enough that the retracted leg stays inside its own tube.
const JACK_X = -LENGTH * 0.5 + 0.2
const JACK_Z = 0.36
const JACK_DOWN = 0.205
const JACK_LIFT = 0.22

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
    // Springs hang off the longitudinal, wheels run outboard of the deck edge.
    // On the wheel track the leaf pack ran through both tyres, and a tyre there
    // would in turn run through the longitudinal it is meant to hang from - the
    // rail's underside is 0.38 and the wheel stands 0.56 tall.
    const z = sz * (WIDTH * 0.5 - 0.11)
    const track = sz * (WIDTH * 0.5 + 0.14)
    box(chassis, m.graphite, [0.9, 0.06, 0.13], [x, DECK - 0.22, z], {
      chamfer: 0.024, fillet: 0.009, bevel: 0.008,
    })
    box(chassis, m.graphiteEdge, [0.7, 0.05, 0.11], [x, DECK - 0.27, z], {
      chamfer: 0.02, fillet: 0.008, bevel: 0.007,
    })
    for (const dx of [-0.32, 0.32]) {
      chassis.add(cylinder(m.rubber, WHEEL, 0.19, [x + dx, WHEEL, track], AXIS_Z, 18))
      chassis.add(cylinder(m.shellShade, WHEEL * 0.52, 0.2, [x + dx, WHEEL, track], AXIS_Z, 14))
      chassis.add(cylinder(m.graphiteEdge, WHEEL * 0.3, 0.22, [x + dx, WHEEL, track], AXIS_Z, 12))
      chassis.add(cylinder(m.ink, WHEEL * 0.1, 0.24, [x + dx, WHEEL, track], AXIS_Z, 8))
      // Mudguard over each wheel: a shallow arc of three plates, wide enough to
      // reach back under the deck's amber edge rail and be carried by it.
      for (const angle of [-0.5, 0, 0.5]) {
        // The plates are 300 mm long on a 170 mm pitch round the arc, so each
        // raked one runs 130 mm into the crown plate. Held to the crown's full
        // width they laid 3.6 cm² of outboard face on its plane at every lap; a
        // clearance either side puts them behind it and leaves the crown, which
        // is the plate the guard is read from, exactly where it was.
        const width = angle === 0 ? 0.3 : 0.3 - FACE_CLEARANCE * 2
        box(chassis, m.shellShade, [0.3, 0.02, width], [
          x + dx + Math.sin(angle) * (WHEEL + 0.06),
          WHEEL + Math.cos(angle) * (WHEEL + 0.06),
          track,
        ], { chamfer: 0.01, fillet: 0.004, bevel: 0.004, rotation: [0, 0, -angle] })
      }
    }
  }
  // One beam axle per wheel pair, running across the track rather than down the
  // centreline - and built once, not once per side.
  for (const dx of [-0.32, 0.32]) {
    chassis.add(cylinder(m.steel, 0.035, WIDTH + 0.34, [x + dx, WHEEL, 0], AXIS_Z, 10))
  }
}

function chassisBody(chassis: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  // Two main longitudinals plus cross members: a skeletal, so the deck reads
  // through and the trailer never becomes a slab.
  for (const sz of [-1, 1]) {
    tubeSection(chassis, m.graphite, [0.16, 0.2], RAIL_WALL, LENGTH, [0, DECK - 0.1, sz * (WIDTH * 0.5 - 0.14)], [0, Math.PI / 2, 0])
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
  // The marker spans both drawbar legs, which are 157 mm off the centreline
  // where it crosses them.
  box(chassis, m.amberPaint, [0.16, 0.06, 0.42], [nose - 0.56, DECK - 0.13, 0], {
    chamfer: 0.018, fillet: 0.007, bevel: 0.006,
  })

  // Tail lamps and a rear underrun bar, lapped up into the longitudinals it is
  // bolted to instead of hanging below them. The rails are hollow, so the lap
  // stops a clearance short of their inner floor: taken to a round 20 mm the bar
  // came 2 mm past it and laid its top on the cavity floor, both facing up.
  const tailTop = DECK - 0.2 + RAIL_WALL - FACE_CLEARANCE
  const tailBottom = DECK - 0.34
  const tailY = (tailTop + tailBottom) * 0.5
  box(chassis, m.graphite, [0.1, tailTop - tailBottom, WIDTH - 0.2], [LENGTH * 0.5 - 0.02, tailY, 0], {
    chamfer: 0.028, fillet: 0.01, bevel: 0.009,
  })
  // The bar's aft face is 2.33; everything applied to it is placed from there.
  const tailFace = LENGTH * 0.5 + 0.03
  for (const sz of [-1, 1]) {
    statusLens(chassis, m, [0.09, 0.09], [tailFace, tailY, sz * (WIDTH * 0.5 - 0.24)], sz > 0 ? m.amber : m.cyan, 'right')
  }
  const stripe = addStripeDecal(bundle, { count: 7, lean: 1 })
  plaque(chassis, m, stripe, [WIDTH - 0.72, 0.08], [tailFace, tailY, 0], 'right', m.ink)

  // The longitudinal's outer face is 0.87. The flank graphics were placed from
  // the rail's centre and sat entirely inside it.
  const railFace = WIDTH * 0.5 - 0.06
  // The rivet line below runs the whole flank at the graphics' own height, so
  // the label is centred in a bay between two of its bolts. At -LENGTH*0.28 it
  // sat over the one at -1.227, whose head stands 4 mm through the plate and
  // reaches to within a millimetre of the decal plane in front of it.
  const boltPitch = (LENGTH * 0.8) / 6
  const label = addLabelDecal(bundle, { variant: 210 })
  plaque(chassis, m, label, [0.3, 0.11], [-boltPitch * 2.5, DECK - 0.1, railFace], 'front', m.shellLight)
  paintMark(chassis, m.amberPaint, slashProfile(0.07, 0.14, 0.45), [LENGTH * 0.2, DECK - 0.1, railFace], 'front', 0.01)
  boltRun(chassis, m.steel, [-LENGTH * 0.4, DECK - 0.1, railFace], [LENGTH * 0.4, DECK - 0.1, railFace], 7, 0.016, 'front')
  for (const sx of [-1, 1]) bolt(chassis, m.steel, [sx * CASTING_X, DECK + 0.02, 0], 0.016, 'top')

  // Parking jack tube, clamped to the nose cross member. Only the leg inside it
  // travels, so the tube can sit under the deck instead of through it.
  chassis.add(cylinder(m.graphite, 0.055, 0.34, [JACK_X, JACK_DOWN + 0.17, JACK_Z], AXIS_Y, 10))
  chassis.add(cylinder(m.steel, 0.012, 0.16, [JACK_X + 0.1, JACK_DOWN + 0.3, JACK_Z], AXIS_X, 8))
  chassis.add(cylinder(m.rubber, 0.018, 0.07, [JACK_X + 0.17, JACK_DOWN + 0.3, JACK_Z], AXIS_Y, 8))
}

/** The travelling part of the parking jack: the inner leg and its foot. */
function jackBody(jack: Group, m: CargoMaterials): void {
  jack.add(cylinder(m.steel, 0.038, 0.3, [0, -0.05, 0], AXIS_Y, 10))
  box(jack, m.graphiteEdge, [0.16, 0.03, 0.16], [0, -0.19, 0], {
    chamfer: 0.04, fillet: 0.014, bevel: 0.008,
  })
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
  jack.position.set(JACK_X, JACK_DOWN, JACK_Z)
  jackBody(jack, m)

  const sockets: TrailerSockets = {
    hitch_ring: socket('hitch_ring', [-LENGTH * 0.5 - 0.98, DECK - 0.16, 0]),
    deck_centre: socket('deck_centre', [0, DECK + 0.02, 0]),
    lock_fore_left: socket('lock_fore_left', [-CASTING_X, DECK + 0.1, -CASTING_Z]),
    lock_aft_right: socket('lock_aft_right', [CASTING_X, DECK + 0.1, CASTING_Z]),
    jack_foot: socket('jack_foot', [JACK_X, 0, JACK_Z]),
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
  const applyBlend = (): void => {
    jack.position.y = JACK_DOWN + blend * JACK_LIFT
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
