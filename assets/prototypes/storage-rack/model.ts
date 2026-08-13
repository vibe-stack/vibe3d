import { Group, Object3D } from 'three/webgpu'

import { cylinder, extrudeProfile } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_Z,
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
  tubeSection(root, m.shell, [UPRIGHT, UPRIGHT], 0.016, HEIGHT, [x, HEIGHT * 0.5, z], [Math.PI / 2, 0, 0])
  // Punching pattern: real slots cut through the front face, at the pitch the
  // beam hooks engage.
  for (let index = 0; index < 22; index += 1) {
    const y = 0.24 + index * 0.14
    if (y > HEIGHT - 0.16) break
    root.add(extrudeProfile(m.ink, slot(0.019, 0.03, 0.008), 0.02, [x, y, z + UPRIGHT * 0.5], {
      fillet: 0.005, bevel: 0.004,
    }))
  }
  box(root, m.graphite, [0.22, 0.03, 0.19], [x, 0.015, z], { chamfer: 0.05, fillet: 0.016, bevel: 0.008 })
  for (const sz of [-1, 1]) {
    bolt(root, m.steel, [x, 0.03, z + sz * 0.06], 0.018, 'top')
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
  box(root, m.graphite, [length, 0.11, 0.055], [x, y, z], {
    chamfer: 0.022, fillet: 0.008, bevel: 0.008, capChamfer: 0.014,
  })
  box(root, m.graphiteEdge, [length, 0.03, 0.075], [x, y + 0.04, z], {
    chamfer: 0.012, fillet: 0.005, bevel: 0.005,
  })
  for (const sx of [-1, 1]) {
    const end = x + sx * (length * 0.5 + 0.02)
    box(root, m.amberPaint, [0.05, 0.19, 0.05], [end, y - 0.01, z], {
      chamfer: 0.014, fillet: 0.005, bevel: 0.005,
    })
    root.add(cylinder(m.steel, 0.009, 0.07, [end, y + 0.07, z], AXIS_Z, 6))
  }
}

function build(): { root: Group; sockets: RackSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(58_000, { condition: 0.66 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_STORAGE-RACK_ROOT_DEFAULT'

  const frames = [-BAY, 0, BAY]
  for (const x of frames) {
    for (const sz of [-1, 1]) upright(root, m, x, sz * DEPTH * 0.5)
    // Frame bracing: a zig-zag between the two uprights of each frame. It runs
    // in the YZ plane, which `member` cannot express - that helper solves for a
    // heading in XY - so the angle is taken directly about the X axis here.
    const rise = 0.62
    const brace = Math.hypot(rise * 0.5, DEPTH)
    for (let index = 0; index < 5; index += 1) {
      const y0 = 0.35 + index * rise
      for (const step of [0, 1]) {
        const dy = step === 0 ? rise * 0.5 : -rise * 0.5
        const centre = y0 + rise * 0.25 + step * rise * 0.5
        box(root, m.shellShade, [0.038, 0.038, brace], [x, centre, 0], {
          chamfer: 0.012, fillet: 0.005, bevel: 0.005,
          rotation: [Math.atan2(-dy, DEPTH), 0, 0],
        })
      }
    }
    // Column guard at floor level, the part a fork actually hits.
    box(root, m.amberPaint, [0.16, 0.42, DEPTH + 0.1], [x, 0.21, 0], {
      chamfer: 0.05, fillet: 0.016, bevel: 0.012, capChamfer: 0.03,
    })
    box(root, m.ink, [0.17, 0.06, DEPTH + 0.11], [x, 0.32, 0], { chamfer: 0.02, fillet: 0.008, bevel: 0.006 })
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

  // Aisle-facing identity: a bay placard per level and a load-rating band.
  for (const [index, y] of LEVELS.entries()) {
    const label = addLabelDecal(bundle, { variant: 150 + index })
    plaque(root, m, label, [0.26, 0.1], [-BAY * 0.5, y + 0.02, DEPTH * 0.5 + 0.035], 'front', m.shellLight)
    statusLens(root, m, [0.05, 0.02], [BAY * 0.5, y + 0.02, DEPTH * 0.5 + 0.035], index === 2 ? m.amber : m.cyan, 'front')
  }
  const stripe = addStripeDecal(bundle, { count: 5, lean: 1 })
  plaque(root, m, stripe, [0.34, 0.09], [0, 0.24, DEPTH * 0.5 + 0.06], 'front', m.ink)
  paintMark(root, m.amberPaint, slashProfile(0.06, 0.2, 0.45), [-BAY - 0.14, 1.4, DEPTH * 0.5 + 0.058], 'front', 0.01)

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
