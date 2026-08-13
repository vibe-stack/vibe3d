import { Group, Object3D } from 'three/webgpu'

import { cylinder, extrudeProfile, type Vec2 } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  AXIS_Z,
  acquireCargoMaterials,
  box,
  createCargoPreview,
  finishModel,
  paintMark,
  slashProfile,
  socket,
  statusLens,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay cargo net, tensioned over a palletised load.
 *
 * A net is nothing without something to pull against, so this asset ships the
 * load with it: a blocked-out mass under real webbing with real corner hooks.
 * A net floating on its own is unplaceable, and a net drawn as a flat grid plane
 * over a box is the most obvious fake in a warehouse scene.
 *
 * The cords sag. Each run is built as a shallow three-segment catenary rather
 * than a straight bar, which is the whole difference between webbing and a
 * welded grid.
 */

const SPAN = 1.16
const DEPTH = 0.86
const LOAD = 0.66
const CORD = 0.016
/**
 * How much longer a cord is cut than the straight line between the two points
 * that carry it.
 *
 * Slack belongs to a span, not to the prop. The corner lashings are 96 mm long
 * and the flank runs 576 mm, and one figure shared between them either pulls the
 * flanks straight or turns the lashings into loops. Every run below takes this
 * fraction of its own free length, so the sag falls out of the geometry instead
 * of being typed per cord.
 */
const SLACK = 0.07

interface CargoNetSockets {
  hook_fore_left: Object3D
  hook_fore_right: Object3D
  hook_aft_left: Object3D
  hook_aft_right: Object3D
  net_crown: Object3D
}

export interface CargoNetController {
  root: Group
  sockets: CargoNetSockets
  update(deltaSeconds: number): void
  dispose(): void
}

/**
 * One sagging cord run, built from three straight segments whose ends meet.
 *
 * Three is the minimum that reads as slack from any angle; a two-segment vee
 * reads as a crease and a smooth tube costs far more than the silhouette is
 * worth on a prop this size.
 *
 * `slack` is the mid-span displacement as a vector rather than as a fall,
 * because the direction a run is free to bow in belongs to the run. A flank run
 * is all but vertical, so pushing its middle downwards only slides its points
 * along their own line and it stays dead straight - it has to bow outwards,
 * away from the load, or it does not bow at all.
 */
function cord(
  root: Group,
  m: CargoMaterials,
  from: [number, number, number],
  to: [number, number, number],
  slack: [number, number, number],
): void {
  const points: Array<[number, number, number]> = []
  for (let index = 0; index <= 3; index += 1) {
    const t = index / 3
    const bow = Math.sin(t * Math.PI)
    points.push([
      from[0] + (to[0] - from[0]) * t + slack[0] * bow,
      from[1] + (to[1] - from[1]) * t + slack[1] * bow,
      from[2] + (to[2] - from[2]) * t + slack[2] * bow,
    ])
  }
  for (let index = 0; index < 3; index += 1) {
    const a = points[index]
    const b = points[index + 1]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const dz = b[2] - a[2]
    const length = Math.hypot(dx, dy, dz)
    const mid: [number, number, number] = [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5]
    // Aim the cylinder's +Y down the segment. Three.js composes an XYZ Euler as
    // Rx·Ry·Rz, so a naive yaw-then-pitch pair can never produce an X component:
    // Ry leaves +Y untouched. Rolling about Z first is what buys the third axis.
    const roll = -Math.asin(Math.min(1, Math.max(-1, dx / length)))
    const tilt = Math.atan2(dz, dy)
    root.add(cylinder(m.webbing, CORD * 0.5, length, mid, [tilt, 0, roll], 5))
  }
}

/**
 * One run across the crown, broken at the edges of whatever carries it.
 *
 * A net over a rigid box is only free between its bearing points, and across the
 * crown those are the wear plate's two edges and the load's own shoulders. Bowing
 * the whole width as a single arc is what drove the middle of every run through
 * the plate: the span over the plate lies on it and has nowhere to go, and the
 * fall belongs entirely to the two gaps outside it.
 */
function crownRun(
  root: Group,
  m: CargoMaterials,
  at: (offset: number) => [number, number, number],
  half: number,
  plate: number,
  headroom: number,
): void {
  const bearings = plate > 0 && plate < half ? [-half, -plate, plate, half] : [-half, half]
  for (let index = 0; index < bearings.length - 1; index += 1) {
    const from = bearings[index]
    const to = bearings[index + 1]
    const carried = bearings.length === 4 && index === 1
    cord(root, m, at(from), at(to), [0, carried ? 0 : -Math.min((to - from) * SLACK, headroom), 0])
  }
}

/** A load-bearing corner hook: a bent steel claw on a webbing eye. */
function hook(root: Group, m: CargoMaterials, x: number, z: number): void {
  const claw: Vec2[] = [
    [-0.028, 0.05], [0.028, 0.05], [0.028, -0.02],
    [0.05, -0.045], [0.036, -0.075], [0.008, -0.06],
    [0.012, -0.032], [-0.012, -0.02], [-0.028, -0.005],
  ]
  const yaw = Math.atan2(x, z)
  // `extrudeProfile` adds the outline's own bounding-box centre to the position
  // it is handed, in world axes and before the yaw - and this claw is authored
  // about its throat, 11 mm off that centre in x and 12.5 mm in y. Handing the
  // centre back is what puts the claw where it is asked for: left in, the offset
  // pushed one hook of each mirrored pair 11 mm outboard and its opposite number
  // 11 mm inboard, and dropped the tip of the curl 15 mm through the floor.
  root.add(extrudeProfile(m.steel, claw, 0.026, [x - 0.011, 0.075, z], {
    fillet: 0.006, bevel: 0.005, rotation: [0, yaw, 0],
  }))
  box(root, m.webbing, [0.055, 0.05, 0.014], [x, 0.1125, z], {
    chamfer: 0.008, fillet: 0.004, bevel: 0.004, rotation: [0, yaw, 0],
  })
}

function build(): { root: Group; sockets: CargoNetSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(56_000, { condition: 0.68 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_CARGO-NET_ROOT_DEFAULT'

  // The load under the net: a skid and a blocked mass, kept plain so the net
  // reads as the subject.
  box(root, m.graphite, [SPAN, 0.09, DEPTH], [0, 0.045, 0], {
    chamfer: 0.05, fillet: 0.018, bevel: 0.012, capChamfer: 0.03,
  })
  const loadX = (SPAN - 0.06) * 0.5
  const loadZ = (DEPTH - 0.06) * 0.5
  box(root, m.shellShade, [loadX * 2, LOAD - 0.09, loadZ * 2], [0, 0.09 + (LOAD - 0.09) * 0.5, 0], {
    chamfer: 0.05, fillet: 0.02, bevel: 0.016, capChamfer: 0.03,
  })
  // Top wear plate, let into the load rather than stood on it. Centred at
  // LOAD + 0.008 it was a 23 mm plinth in the middle of the crown - taller than
  // the 16 mm cords that have to cross it - so it swallowed the middle of the
  // net while the ends of every run hung clear of the deck around it.
  const plateX = loadX * 0.7
  const plateZ = loadZ * 0.7
  box(root, m.graphiteEdge, [plateX * 2, 0.03, plateZ * 2], [0, LOAD - 0.007, 0], {
    chamfer: 0.06, fillet: 0.02, bevel: 0.01,
  })

  // The net lies *on* the load. Every run is anchored to the shoulder of the
  // mass it crosses and drops nearly vertically to the skid; routing the sides
  // out to the anchors instead turns the whole thing into a tent frame, which is
  // what a net over nothing always becomes.
  // The crown is the wear plate's top face (LOAD + 0.008) plus a cord radius, so
  // the runs bear on the plate instead of hovering over it. At LOAD + 0.035 the
  // net stood 27 mm clear of the load at the shoulders and read as a tent frame.
  const crown = LOAD + 0.016
  // The shoulder is the load's own top edge, a quarter of a cord's width clear
  // of the flank so the side runs stay proud of it the whole way down. Turned
  // 50 mm inboard of the flank they dived straight through the corner and only
  // the last few centimetres above the skid ever came out of the mass.
  const shoulderX = loadX + CORD * 0.25
  const shoulderZ = loadZ + CORD * 0.25
  // All the fall a crown run has is the 8 mm between the cord bottoms and the
  // load's cap, less the 3 mm the pack keeps between any two surfaces this
  // close. Five millimetres across a metre is invisible, and that is the honest
  // answer: netting drawn tight over a flat box is flat over the box. The slack
  // that has to read at catalogue size is at the free edges, not up here.
  const crownHeadroom = crown - CORD * 0.5 - LOAD - 0.003
  // The hem is the skid line, where the hooks take hold.
  const hem = 0.1
  const hemX = loadX + 0.012
  const hemZ = loadZ + 0.012
  // A flank run falls the whole height of the load with nothing behind it but
  // the load, so it is the slackest span on the prop and the only one whose bow
  // breaks the outline. Forty millimetres of it stands the middle of each run
  // 35 mm off the flank, which turns four straight silhouette edges into four
  // scalloped ones - the difference a 320 px tile can actually see.
  const flankSlack = (crown - hem) * SLACK
  for (let index = 0; index < 5; index += 1) {
    const z = (index / 4 - 0.5) * shoulderZ * 2
    crownRun(root, m, (offset) => [offset, crown, z], shoulderX, Math.abs(z) < plateZ ? plateX : 0, crownHeadroom)
    for (const sx of [-1, 1]) {
      cord(root, m, [sx * shoulderX, crown, z], [sx * hemX, hem, z * 0.99], [sx * flankSlack, 0, 0])
    }
  }
  for (let index = 0; index < 6; index += 1) {
    const x = (index / 5 - 0.5) * shoulderX * 2
    crownRun(root, m, (offset) => [x, crown, offset], shoulderZ, Math.abs(x) < plateX ? plateZ : 0, crownHeadroom)
    for (const sz of [-1, 1]) {
      cord(root, m, [x, crown, sz * shoulderZ], [x * 0.99, hem, sz * hemZ], [0, 0, sz * flankSlack])
    }
  }
  // Perimeter rope around the skid line, which is what the hooks pull on. It is
  // the one member on the prop under tension end to end - four hooks pull it
  // straight and all twenty-two flank runs are tied off along it - so it has no
  // free length of its own. Slack here would only lift those runs' feet off the
  // rope they hang from, and a taut hem is what the bowed flanks read against.
  for (const sz of [-1, 1]) {
    cord(root, m, [-hemX, hem, sz * hemZ], [hemX, hem, sz * hemZ], [0, 0, 0])
  }
  for (const sx of [-1, 1]) {
    cord(root, m, [sx * hemX, hem, -hemZ], [sx * hemX, hem, hemZ], [0, 0, 0])
  }

  // The hooks stand outboard of the skid, where a net's hardware reaches for the
  // pallet's tie points, so each is lashed back to its own corner of the
  // perimeter rope. That rope is 68 mm inboard of them in both axes: without the
  // lashing the four hooks are hardware hanging in the air beside the load.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (SPAN * 0.5 + 0.05)
      const z = sz * (DEPTH * 0.5 + 0.05)
      hook(root, m, x, z)
      const corner: [number, number, number] = [sx * hemX, hem, sz * hemZ]
      cord(root, m, corner, [x, hem, z], [0, -Math.hypot(x - corner[0], z - corner[2]) * SLACK, 0])
    }
  }
  // Tensioner on the near edge, the one place the net is adjusted from, clamped
  // onto the side run it adjusts. It rides that run's lower knuckle, which is a
  // point the cord genuinely passes through; measured off the skid's face
  // instead it stood 55 mm clear of the flank with no rope inside it, and now
  // that the run bows away from the load such a clamp would have the rope
  // passing outside its own roller.
  const tensionerX = shoulderX * 0.6
  const tensionerY = crown - (crown - hem) * (2 / 3)
  const tensionerZ = shoulderZ + (hemZ - shoulderZ) * (2 / 3) + flankSlack * Math.sin((2 / 3) * Math.PI)
  box(root, m.amberPaint, [0.1, 0.11, 0.05], [tensionerX, tensionerY, tensionerZ], {
    chamfer: 0.024, fillet: 0.009, bevel: 0.007,
  })
  root.add(cylinder(m.steel, 0.014, 0.12, [tensionerX, tensionerY, tensionerZ + 0.02], AXIS_X, 8))
  // Spindle seated in the top of the clamp body, which is 55 mm above its
  // centre. At 0.28 it stood 13 mm clear of the body with nothing between.
  root.add(cylinder(m.steel, 0.012, 0.05, [tensionerX, tensionerY + 0.055, tensionerZ], AXIS_Z, 8))

  paintMark(root, m.orangePaint, slashProfile(0.06, 0.16, 0.42), [-0.3, LOAD * 0.5, loadZ], 'front', 0.01)
  statusLens(root, m, [0.05, 0.02], [0.34, LOAD * 0.62, loadZ], m.cyan, 'front')

  const sockets: CargoNetSockets = {
    hook_fore_left: socket('hook_fore_left', [-(SPAN * 0.5 + 0.05), 0.05, DEPTH * 0.5 + 0.05]),
    hook_fore_right: socket('hook_fore_right', [SPAN * 0.5 + 0.05, 0.05, DEPTH * 0.5 + 0.05]),
    hook_aft_left: socket('hook_aft_left', [-(SPAN * 0.5 + 0.05), 0.05, -(DEPTH * 0.5 + 0.05)]),
    hook_aft_right: socket('hook_aft_right', [SPAN * 0.5 + 0.05, 0.05, -(DEPTH * 0.5 + 0.05)]),
    net_crown: socket('net_crown', [0, crown, 0]),
  }
  return { root, sockets, bundle }
}

export function createModel(): CargoNetController {
  const { root, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'cargo-net',
    reach: 0.14,
    sockets: Object.values(sockets),
  })
  let elapsed = 0
  return {
    root,
    sockets,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      bundle.materials.cyan.emissiveIntensity = 1.5 + Math.sin(elapsed * 1.6) * 0.2
    },
    dispose: finished.dispose,
  }
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  createCargoPreview(createModel(), {
    // Framed on the load's mid-height the hooks ran off the right of the frame
    // with a millimetre to spare. The net's own mass sits low, so the frame is
    // centred on the load's lower third and takes in the whole span of hardware.
    target: [0, LOAD * 0.33, 0],
    distance: 3.4,
    yaw: 0.74,
    pitch: 0.34,
    fov: 30,
    ...options,
  })
