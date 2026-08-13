import { Group, Object3D } from 'three/webgpu'

import { cylinder, extrudeProfile } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_Z,
  FACE_CLEARANCE,
  acquireCargoMaterials,
  addLabelDecal,
  addStripeDecal,
  bolt,
  box,
  createCargoPreview,
  finishModel,
  paintMark,
  plaque,
  slashProfile,
  slot,
  socket,
  statusLens,
  tubeSection,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay pallet storage rack — two bays, three beam levels.
 *
 * Warehouse racking is defined by its *connections*, not its bars: punched
 * uprights, hooked beam ends that drop into those punchings, safety pins, and a
 * bolted base plate. Model it as plain boxes meeting at right angles and it
 * reads as scaffolding; model the connections and it reads as racking even at
 * silhouette distance.
 *
 * The uprights are closed tube sections with real wall thickness, so the
 * punching pattern is a hole through material rather than a dark mark on a slab.
 */

const BAY = 2.3
const DEPTH = 1.05
const HEIGHT = 3.4
const UPRIGHT = 0.11
const LEVELS = [0.9, 1.9, 2.9]
/** Outward face of a frame's uprights, measured from the rack's centreline. */
const FACE_Z = DEPTH * 0.5 + UPRIGHT * 0.5
/** Aisle face of a beam web, which is what a beam's graphics are applied to. */
const BEAM_Z = DEPTH * 0.5 + 0.0275
/** Column guard height, and the half-depth at which it clears the uprights. */
const GUARD = 0.42
const GUARD_Z = FACE_Z + 0.02
/** Base plate thickness, and therefore the level a column is welded at. */
const PLATE = 0.03
/** Punching pattern: first slot, pitch, and the last slot the head leaves room for. */
const PUNCH_BASE = 0.24
const PUNCH_PITCH = 0.14
const PUNCH_TOP = HEIGHT - 0.16

interface RackSockets {
  bay_left_l1: Object3D
  bay_left_l2: Object3D
  bay_right_l1: Object3D
  bay_right_l2: Object3D
  aisle_face: Object3D
}

export interface StorageRackController {
  root: Group
  sockets: RackSockets
  update(deltaSeconds: number): void
  dispose(): void
}

/** A punched upright with its base plate and floor anchors. */
function upright(root: Group, m: CargoMaterials, x: number, z: number): void {
  // The column is welded on top of its base plate, which is the part the floor
  // anchors go through. Run to the floor instead it put a second down-facing
  // cap on the plate's own sole, inside the guard where neither can be seen
  // from anywhere but underneath - which is exactly where the sheet looks.
  tubeSection(root, m.shell, [UPRIGHT, UPRIGHT], 0.016, HEIGHT - PLATE, [x, (HEIGHT + PLATE) * 0.5, z], [Math.PI / 2, 0, 0])
  // Punching pattern: real slots cut through the outward face, at the pitch the
  // beam hooks engage. The offset carries the upright's own sign, or the rear
  // frame gets its slots on its inner face - which is why the rack read as a
  // punched aisle column and a plain bar from every angle behind it.
  const face = z + Math.sign(z) * UPRIGHT * 0.5
  for (let index = 0; index < 22; index += 1) {
    const y = PUNCH_BASE + index * PUNCH_PITCH
    if (y > PUNCH_TOP) break
    root.add(extrudeProfile(m.ink, slot(0.019, 0.03, 0.008), 0.02, [x, y, face], {
      fillet: 0.005, bevel: 0.004,
    }))
  }
  box(root, m.graphite, [0.26, PLATE, 0.19], [x, PLATE * 0.5, z], { chamfer: 0.05, fillet: 0.016, bevel: 0.008 })
  // Anchors sit outboard of the guard's 0.16 width. Paired across the plate's
  // depth they were both inside it, which is a fastener nobody can ever see.
  for (const sx of [-1, 1]) {
    bolt(root, m.steel, [x + sx * 0.105, PLATE, z], 0.016, 'top')
  }
}

/**
 * A beam with hooked ends and a safety pin at each connector.
 *
 * The beam web is graphite and only its end connectors are painted. Amber is
 * an accent everywhere else in the catalogue - lamps, latches, kerbs, lift
 * points. Running it as a field colour down every beam put it on 62% of this
 * prop's silhouette, which both broke the house language and, because the wear
 * shader desaturates rubbed paint toward bare alloy, came back as khaki rather
 * than caution.
 */
function beam(root: Group, m: CargoMaterials, x: number, y: number, z: number, length: number): void {
  // The web is 4 mm shallower than the 0.11 it reads as, and the whole of that
  // comes off the top. Drawn at 0.11 its top cap and the flange's were both at
  // `y + 0.055` facing up, on all twelve beams, and the flange is wider than the
  // web on every side - so the web's cap is the one nobody can see and the one
  // that moves. The soffit, which is seen from under every pallet, stays put.
  box(root, m.graphite, [length, 0.106, 0.055], [x, y - 0.002, z], {
    chamfer: 0.022, fillet: 0.008, bevel: 0.008, capChamfer: 0.014,
  })
  box(root, m.graphiteEdge, [length, 0.03, 0.075], [x, y + 0.04, z], {
    chamfer: 0.012, fillet: 0.005, bevel: 0.005,
  })
  // The web stops 20 mm short of the upright so the hooks have somewhere to
  // drop, so the connector is the only thing closing that joint: it is cut
  // deeper than the 0.055 web on purpose, and the pin has to clear it in turn
  // or the safety pin is a cylinder inside a block.
  for (const sx of [-1, 1]) {
    const end = x + sx * (length * 0.5 + 0.02)
    box(root, m.amberPaint, [0.05, 0.19, 0.075], [end, y - 0.01, z], {
      chamfer: 0.014, fillet: 0.005, bevel: 0.005,
    })
    root.add(cylinder(m.steel, 0.009, 0.11, [end, y + 0.07, z], AXIS_Z, 6))
  }
}

function build(): { root: Group; sockets: RackSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(58_000, { condition: 0.66 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_STORAGE-RACK_ROOT_DEFAULT'

  const stripe = addStripeDecal(bundle, { count: 5, lean: 1 })
  const frames = [-BAY, 0, BAY]
  for (const x of frames) {
    for (const sz of [-1, 1]) upright(root, m, x, sz * DEPTH * 0.5)
    // Frame bracing: a zig-zag between the two uprights of each frame. It runs
    // in the YZ plane, which `member` cannot express - that helper solves for a
    // heading in XY - so the angle is taken directly about the X axis here.
    //
    // The pitch is solved from the band the zig-zag has to fill, between the
    // guard it lands on and the head of the punching pattern. Taken as a fixed
    // rise instead, five panels overshot the upright by 50 mm and the top
    // diagonal ended in mid-air above the frame.
    const panels = 5
    const rise = (PUNCH_TOP - GUARD) / panels
    const brace = Math.hypot(rise * 0.5, DEPTH)
    for (let index = 0; index < panels; index += 1) {
      const y0 = GUARD + index * rise
      for (const step of [0, 1]) {
        const dy = step === 0 ? rise * 0.5 : -rise * 0.5
        const centre = y0 + rise * 0.25 + step * rise * 0.5
        box(root, m.shellShade, [0.038, 0.038, brace], [x, centre, 0], {
          chamfer: 0.012, fillet: 0.005, bevel: 0.005,
          rotation: [Math.atan2(-dy, DEPTH), 0, 0],
        })
      }
    }
    // Column guard at floor level, the part a fork actually hits. It has to
    // stand proud of the column it protects: run flush with the uprights its
    // aisle face sits 5 mm behind theirs, so the two end frames showed only
    // their long flanks and the centre frame showed 25 mm of amber either side
    // of its upright and read as having no guard at all.
    // The rack is carried by its base plates, so the guard is the one thing in
    // this footprint that does not take the floor: it stops FACE_CLEARANCE above
    // it, since it wraps both plates and both columns and its sole would
    // otherwise be a third down-facing skin on their plane.
    box(root, m.amberPaint, [0.16, GUARD - FACE_CLEARANCE, GUARD_Z * 2], [x, (GUARD + FACE_CLEARANCE) * 0.5, 0], {
      chamfer: 0.05, fillet: 0.016, bevel: 0.012, capChamfer: 0.03,
    })
    box(root, m.ink, [0.17, 0.06, GUARD_Z * 2 + 0.01], [x, 0.32, 0], { chamfer: 0.02, fillet: 0.008, bevel: 0.006 })
    // Hazard band on the guard's own face, and sized to it. One 0.38-wide
    // placard on the centre frame overhung its 0.16 host by 110 mm each side
    // and left the other two frames unmarked.
    plaque(root, m, stripe, [0.1, 0.07], [x, 0.16, GUARD_Z], 'front', m.ink)
  }

  for (const y of LEVELS) {
    for (const bay of [-BAY * 0.5, BAY * 0.5]) {
      for (const sz of [-1, 1]) beam(root, m, bay, y, sz * DEPTH * 0.5, BAY - UPRIGHT - 0.04)
      // Deck bars spanning the two beams, so a pallet has something to sit on.
      for (let index = 0; index < 4; index += 1) {
        const z = (index / 3 - 0.5) * (DEPTH - 0.22)
        box(root, m.graphiteEdge, [BAY - 0.2, 0.02, 0.06], [bay, y + 0.06, z], {
          chamfer: 0.008, fillet: 0.004, bevel: 0.004,
        })
      }
    }
  }

  // Aisle-facing identity: a bay placard per level and a status lamp on the far
  // bay, both seated on the beam web's own face and sized to its 0.11 depth.
  // Lifted 35 mm off the beam centreline instead, they hung 7.5 mm clear of the
  // web and reached up over the top flange into open air.
  for (const [index, y] of LEVELS.entries()) {
    const label = addLabelDecal(bundle, { variant: 150 + index })
    plaque(root, m, label, [0.26, 0.06], [-BAY * 0.5, y, BEAM_Z], 'front', m.shellLight)
    statusLens(root, m, [0.05, 0.02], [BAY * 0.5, y, BEAM_Z], index === 2 ? m.amber : m.cyan, 'front')
  }
  // Bay-end slash, in the clear band between two punchings on the end column.
  // The aisle face is slotted from 210 mm to the head, so this is the height
  // and the width the column has to offer; at its old x it stood 85 mm past the
  // end of the rack with nothing behind it at all.
  paintMark(root, m.amberPaint, slashProfile(0.05, 0.07, 0.45), [-BAY, PUNCH_BASE + 8.5 * PUNCH_PITCH, FACE_Z], 'front', 0.01)

  const sockets: RackSockets = {
    bay_left_l1: socket('bay_left_l1', [-BAY * 0.5, LEVELS[0] + 0.07, 0]),
    bay_left_l2: socket('bay_left_l2', [-BAY * 0.5, LEVELS[1] + 0.07, 0]),
    bay_right_l1: socket('bay_right_l1', [BAY * 0.5, LEVELS[0] + 0.07, 0]),
    bay_right_l2: socket('bay_right_l2', [BAY * 0.5, LEVELS[1] + 0.07, 0]),
    aisle_face: socket('aisle_face', [0, 1.6, DEPTH * 0.5 + 0.2]),
  }
  return { root, sockets, bundle }
}

export function createModel(): StorageRackController {
  const { root, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'storage-rack',
    reach: 0.22,
    sockets: Object.values(sockets),
  })
  let elapsed = 0
  return {
    root,
    sockets,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      bundle.materials.cyan.emissiveIntensity = 1.6 + Math.sin(elapsed * 1.5) * 0.2
    },
    dispose: finished.dispose,
  }
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  createCargoPreview(createModel(), {
    target: [0, HEIGHT * 0.46, 0],
    distance: 9.6,
    yaw: 0.66,
    pitch: 0.18,
    fov: 30,
    ...options,
  })
