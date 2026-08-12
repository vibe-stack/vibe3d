import { Group, Object3D } from 'three/webgpu'

import { cylinder, extrudeProfile, type Vec2 } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  AXIS_Y,
  AXIS_Z,
  acquireCargoMaterials,
  addStripeDecal,
  box,
  createCargoPreview,
  finishModel,
  plaque,
  socket,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay ratchet strap, coiled and stowed.
 *
 * The smallest asset in the wave and the one that does the most for a scene: a
 * strap lying on a deck is the difference between a depot that is being worked
 * and a depot that is a showroom.
 *
 * Stowed, not deployed. A deployed strap has to be authored against a specific
 * load, which makes it a one-scene asset; a coil with its ratchet resting on top
 * places anywhere, and the coil is where the webbing's thickness and weave read
 * best anyway.
 */

const COIL_R = 0.17
const WEB = 0.05
const TURNS = 5

interface StrapSockets {
  ratchet_handle: Object3D
  hook_free: Object3D
  coil_centre: Object3D
}

export interface StrapController {
  root: Group
  sockets: StrapSockets
  dispose(): void
}

/** The J-hook that terminates each strap end. */
function hook(root: Group, m: CargoMaterials, position: [number, number, number], yaw: number): void {
  const claw: Vec2[] = [
    [-0.042, 0.09], [0.042, 0.09], [0.042, -0.03],
    [0.086, -0.082], [0.06, -0.135], [0.01, -0.106],
    [0.02, -0.05], [-0.02, -0.026], [-0.042, 0],
  ]
  // Laid flat on the deck, because the strap it terminates is lying flat. The
  // extrusion axis becomes world +Y, so the claw's own thickness is its height.
  root.add(extrudeProfile(m.steel, claw, 0.038, position, {
    fillet: 0.008, bevel: 0.007, rotation: [Math.PI / 2, yaw, 0],
  }))
}

/**
 * The ratchet mechanism: frame, drum, pawl, and a painted handle.
 *
 * Built lying on its side on top of the coil, which is how one is actually left
 * after a load is released.
 */
function ratchet(root: Group, m: CargoMaterials, y: number): void {
  const body = new Group()
  body.name = 'AXR_CARGO_CARGO-STRAP_PART_RATCHET_STOWED'
  body.position.set(0.02, y, 0)
  body.rotation.set(0, 0.42, 0)
  root.add(body)

  for (const sz of [-1, 1]) {
    box(body, m.graphiteEdge, [0.14, 0.05, 0.014], [0, 0.025, sz * 0.035], {
      chamfer: 0.014, fillet: 0.005, bevel: 0.005,
    })
  }
  body.add(cylinder(m.steel, 0.028, 0.08, [0.03, 0.028, 0], AXIS_Z, 12))
  body.add(cylinder(m.ink, 0.014, 0.095, [0.03, 0.028, 0], AXIS_Z, 8))
  // Toothed drum flanges, the part that tells you it is a ratchet and not a
  // buckle. Eight facets is enough to catch the key light as teeth.
  for (const sz of [-1, 1]) {
    body.add(cylinder(m.steel, 0.036, 0.008, [0.03, 0.028, sz * 0.044], AXIS_Z, 8))
  }
  box(body, m.amberPaint, [0.15, 0.032, 0.062], [-0.08, 0.03, 0], {
    chamfer: 0.014, fillet: 0.006, bevel: 0.005, rotation: [0, 0, 0.16],
  })
  box(body, m.rubber, [0.05, 0.028, 0.058], [-0.14, 0.038, 0], {
    chamfer: 0.012, fillet: 0.005, bevel: 0.004,
  })
  body.add(cylinder(m.steel, 0.01, 0.07, [-0.012, 0.042, 0], AXIS_Z, 8))
}

function build(): { root: Group; sockets: StrapSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(56_200, { condition: 0.78 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_CARGO-STRAP_ROOT_STOWED'

  // The coil: concentric webbing turns, each one slightly proud of the last so
  // the roll has a visible edge spiral instead of reading as a solid ring.
  for (let turn = 0; turn < TURNS; turn += 1) {
    const radius = COIL_R - turn * (WEB * 0.42)
    const lift = 0.004 + turn * 0.0035
    root.add(cylinder(m.fabric, radius, WEB, [0, WEB * 0.5 + lift, 0], AXIS_Y, 22))
    root.add(cylinder(m.shellShade, radius - 0.004, WEB - 0.006, [0, WEB * 0.5 + lift, 0], AXIS_Y, 22))
  }
  root.add(cylinder(m.ink, COIL_R - TURNS * WEB * 0.42 - 0.012, WEB + 0.02, [0, WEB * 0.5 + 0.012, 0], AXIS_Y, 18))

  // The loose tail leaving the coil, and the free hook at the end of it.
  box(root, m.fabric, [0.3, 0.012, WEB], [COIL_R + 0.12, 0.006, 0.05], {
    chamfer: 0.005, fillet: 0.003, bevel: 0.003, rotation: [0, 0.3, 0],
  })
  box(root, m.fabric, [0.16, 0.012, WEB], [COIL_R + 0.3, 0.006, 0.14], {
    chamfer: 0.005, fillet: 0.003, bevel: 0.003, rotation: [0, 0.85, 0],
  })
  // Raised to the claw's own half-height: the profile straddles y = 0, so
  // planting it at deck level buries the throat and leaves a stub.
  hook(root, m, [COIL_R + 0.36, 0.1, 0.21], 0.85)
  hook(root, m, [-COIL_R - 0.06, 0.1, -0.11], -0.5)
  box(root, m.fabric, [0.12, 0.012, WEB], [-COIL_R - 0.02, 0.006, -0.06], {
    chamfer: 0.005, fillet: 0.003, bevel: 0.003, rotation: [0, -0.5, 0],
  })

  ratchet(root, m, WEB + 0.028)

  // Load-rating tag sewn to the tail: the one graphic a strap carries.
  const stripe = addStripeDecal(bundle, { count: 3, lean: 1 })
  plaque(root, m, stripe, [0.11, 0.035], [COIL_R + 0.14, 0.014, 0.06], 'top', m.ink)
  root.add(cylinder(m.steel, 0.006, 0.03, [COIL_R + 0.2, 0.012, 0.09], AXIS_X, 6))

  const sockets: StrapSockets = {
    ratchet_handle: socket('ratchet_handle', [-0.12, WEB + 0.07, 0]),
    hook_free: socket('hook_free', [COIL_R + 0.36, 0.03, 0.21]),
    coil_centre: socket('coil_centre', [0, WEB * 0.5, 0]),
  }
  return { root, sockets, bundle }
}

export function createModel(): StrapController {
  const { root, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'cargo-strap',
    reach: 0.07,
    sockets: Object.values(sockets),
  })
  return { root, sockets, dispose: finished.dispose }
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  createCargoPreview(createModel(), {
    target: [0.16, 0.06, 0.04],
    distance: 1.75,
    yaw: 0.7,
    pitch: 0.44,
    fov: 30,
    ...options,
  })
