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
 */
function cord(
  root: Group,
  m: CargoMaterials,
  from: [number, number, number],
  to: [number, number, number],
  sag: number,
): void {
  const points: Array<[number, number, number]> = []
  for (let index = 0; index <= 3; index += 1) {
    const t = index / 3
    points.push([
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t - Math.sin(t * Math.PI) * sag,
      from[2] + (to[2] - from[2]) * t,
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
  box(root, m.graphiteEdge, [loadX * 1.4, 0.03, loadZ * 1.4], [0, LOAD - 0.007, 0], {
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
  // A crown run is carried by the load along its whole length, so it keeps only
  // enough fall to break the straight line. At the 18 to 22 mm the drops use it
  // dipped below the wear plate and the middle of the net vanished inside it.
  for (let index = 0; index < 5; index += 1) {
    const z = (index / 4 - 0.5) * shoulderZ * 2
    cord(root, m, [-shoulderX, crown, z], [shoulderX, crown, z], 0.004)
    cord(root, m, [-shoulderX, crown, z], [-loadX - 0.012, 0.1, z * 0.99], 0.008)
    cord(root, m, [shoulderX, crown, z], [loadX + 0.012, 0.1, z * 0.99], 0.008)
  }
  for (let index = 0; index < 6; index += 1) {
    const x = (index / 5 - 0.5) * shoulderX * 2
    cord(root, m, [x, crown, -shoulderZ], [x, crown, shoulderZ], 0.004)
    cord(root, m, [x, crown, -shoulderZ], [x * 0.99, 0.1, -loadZ - 0.012], 0.008)
    cord(root, m, [x, crown, shoulderZ], [x * 0.99, 0.1, loadZ + 0.012], 0.008)
  }
  // Perimeter rope around the skid line, which is what the hooks pull on.
  for (const sz of [-1, 1]) {
    cord(root, m, [-loadX - 0.012, 0.1, sz * (loadZ + 0.012)], [loadX + 0.012, 0.1, sz * (loadZ + 0.012)], 0.012)
  }
  for (const sx of [-1, 1]) {
    cord(root, m, [sx * (loadX + 0.012), 0.1, -loadZ - 0.012], [sx * (loadX + 0.012), 0.1, loadZ + 0.012], 0.012)
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
      cord(root, m, [sx * (loadX + 0.012), 0.1, sz * (loadZ + 0.012)], [x, 0.1, z], 0.004)
    }
  }
  // Tensioner on the near edge, the one place the net is adjusted from, clamped
  // onto the side run it adjusts. Set out from the skid's face instead it stood
  // 55 mm clear of the flank with no rope inside it.
  const tensionerX = shoulderX * 0.6
  const tensionerY = 0.2
  box(root, m.amberPaint, [0.1, 0.11, 0.05], [tensionerX, tensionerY, loadZ + 0.008], {
    chamfer: 0.024, fillet: 0.009, bevel: 0.007,
  })
  root.add(cylinder(m.steel, 0.014, 0.12, [tensionerX, tensionerY, loadZ + 0.028], AXIS_X, 8))
  // Spindle seated in the top of the clamp body, which is 55 mm above its
  // centre. At 0.28 it stood 13 mm clear of the body with nothing between.
  root.add(cylinder(m.steel, 0.012, 0.05, [tensionerX, tensionerY + 0.055, loadZ + 0.008], AXIS_Z, 8))

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
    target: [0, LOAD * 0.5, 0],
    distance: 3.1,
    yaw: 0.74,
    pitch: 0.34,
    fov: 30,
    ...options,
  })
