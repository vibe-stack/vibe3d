import { Group, Object3D } from 'three/webgpu'

import { cylinder, extrudeProfile, type Vec2 } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  AXIS_Z,
  FACE_CLEARANCE,
  acquireCargoMaterials,
  addLabelDecal,
  addStripeDecal,
  bolt,
  box,
  castor,
  castorMount,
  createCargoPreview,
  finishModel,
  paintMark,
  plaque,
  seam,
  slashProfile,
  socket,
  statusLens,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay commercial waste bin — a lidded four-wheel dumpster.
 *
 * The street-side counterpart to the industrial skip, and it is deliberately the
 * opposite object in every way that matters: closed lids instead of an open
 * load, castors instead of rollers, trunnion bars instead of a lifting eye, and
 * a sloped back so it tips cleanly into a rear-loader.
 *
 * One lid is left ajar with a bag caught under it. That single asymmetry is what
 * stops a pair of these reading as two copies of one mesh.
 */

const LENGTH = 1.42
const WIDTH = 1.0
const HEIGHT = 1.16
const SLOPE = 0.16
const WHEEL = 0.1

/**
 * Ride height: the plane the bin's floor slab is carried on.
 *
 * A castor's origin is its axle, and its mount plate stands `castorMount` above
 * that, so a bin whose floor sat at y = 0 swallowed every fork and plate inside
 * its own 70 mm slab and rendered flat on the ground with no wheels at all. The
 * extra 20 mm is the bite R5 asks of a structural pair - the plates are inside
 * the slab rather than butted against its underside.
 */
const RIDE = WHEEL + castorMount(WHEEL) - 0.02

/** The pressed pans stand 13 mm proud of the skin, and they host the graphics. */
const PAN_FACE = WIDTH * 0.5 + 0.013

/**
 * How far the ajar leaf stands open, in radians.
 *
 * Solved from the bag rather than picked: the leaf's underside is a plane
 * through the hinge, and at this angle it comes down on the bag's high corner at
 * (-0.076, 1.326). Any wider and the one thing propping the lid open is not
 * touching it.
 */
const AJAR = 0.31

interface BinSockets {
  lid_hinge: Object3D
  trunnion_left: Object3D
  trunnion_right: Object3D
  foot_pedal: Object3D
}

export type BinState = 'closed' | 'ajar'

export interface CommercialBinController {
  root: Group
  parts: { body: Group; lidLeft: Group; lidRight: Group }
  sockets: BinSockets
  readonly state: BinState
  setState(state: BinState): BinState
  update(deltaSeconds: number): void
  dispose(): void
}

/**
 * Side elevation: vertical front, sloped back, flat floor.
 *
 * The floor is drawn a clearance up rather than at zero because the skirt band
 * below wraps the whole base from y = 0 to 0.07 and is the underside anyone
 * actually sees; a wall that started at zero put its own downward cap on that
 * same plane, facing the same way.
 */
function sideProfile(): Vec2[] {
  return [
    [-LENGTH * 0.5, FACE_CLEARANCE],
    [LENGTH * 0.5, FACE_CLEARANCE],
    [LENGTH * 0.5, HEIGHT],
    [-LENGTH * 0.5 + SLOPE, HEIGHT],
  ]
}

function bodyBuild(body: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  for (const sz of [-1, 1]) {
    body.add(extrudeProfile(m.shell, sideProfile(), 0.05, [0, 0, sz * (WIDTH * 0.5 - 0.025)], {
      fillet: 0.035, bevel: 0.024,
    }))
  }
  // The front wall starts on the same floor as the side elevations, and for the
  // same reason: 66 mm of it is still buried in the skirt band.
  box(body, m.shell, [0.05, HEIGHT - FACE_CLEARANCE, WIDTH - 0.06], [
    LENGTH * 0.5 - 0.025, (HEIGHT + FACE_CLEARANCE) * 0.5, 0,
  ], { chamfer: 0.04, fillet: 0.014, bevel: 0.012 })
  const slant = Math.atan2(SLOPE, HEIGHT)
  box(body, m.shell, [0.05, Math.hypot(HEIGHT, SLOPE), WIDTH - 0.06], [
    -LENGTH * 0.5 + SLOPE * 0.5, HEIGHT * 0.5, 0,
  ], { chamfer: 0.04, fillet: 0.014, bevel: 0.012, rotation: [0, 0, -slant] })
  // Skirt band, standing 10 mm proud of the skin all round. Sized to the shell
  // it shared both its long faces with the side walls and both its ends with the
  // end walls - four pairs of coplanar, co-facing planes down the base.
  box(body, m.graphiteEdge, [LENGTH + 0.02, 0.07, WIDTH + 0.02], [0, 0.035, 0], {
    chamfer: 0.035, fillet: 0.013, bevel: 0.011,
  })

  // Pressed panel field on both flanks: three shallow pans between ribs.
  for (const sz of [-1, 1]) {
    const z = sz * (WIDTH * 0.5 + 0.004)
    for (let index = 0; index < 3; index += 1) {
      box(body, m.shellShade, [LENGTH * 0.26, HEIGHT * 0.52, 0.018], [
        (index - 1) * LENGTH * 0.3 + 0.02, HEIGHT * 0.46, z,
      ], { chamfer: 0.045, fillet: 0.016, bevel: 0.009 })
    }
    box(body, m.graphite, [LENGTH - 0.06, 0.07, 0.035], [0.02, HEIGHT * 0.8, z], {
      chamfer: 0.018, fillet: 0.007, bevel: 0.006,
    })
    // The groove is cut in the skin, not in the pans' centre plane the boxes
    // above are hung on, so it takes the skin's own face: 4 mm out and its rim
    // stands off the wall with daylight under the lip.
    seam(body, m.shell, LENGTH - 0.16, [0.02, HEIGHT * 0.14, sz * WIDTH * 0.5], sz > 0 ? 'front' : 'back', 'across', 0.022, 0.013)
  }

  // Trunnion bars: the pins a rear-loader's arms hook under.
  for (const sz of [-1, 1]) {
    box(body, m.graphite, [0.14, 0.12, 0.07], [LENGTH * 0.5 - 0.06, HEIGHT * 0.62, sz * (WIDTH * 0.5 + 0.03)], {
      chamfer: 0.028, fillet: 0.01, bevel: 0.008,
    })
    body.add(cylinder(m.steel, 0.028, 0.18, [LENGTH * 0.5 - 0.06, HEIGHT * 0.62, sz * (WIDTH * 0.5 + 0.1)], AXIS_Z, 10))
    body.add(cylinder(m.graphiteEdge, 0.042, 0.03, [LENGTH * 0.5 - 0.06, HEIGHT * 0.62, sz * (WIDTH * 0.5 + 0.18)], AXIS_Z, 10))
  }

  // Centre rail under the shut line between the two leaves, tenoned into the end
  // walls at both ends. Without it the 10 mm joint the leaves close on is a slot
  // straight into an unlit bin, and it is the full 1.32 m of the lid long.
  box(body, m.graphiteEdge, [LENGTH - SLOPE - 0.02, 0.07, 0.1], [(SLOPE - 0.02) * 0.5, HEIGHT - 0.045, 0], {
    chamfer: 0.024, fillet: 0.009, bevel: 0.008,
  })

  // Two swivel castors at the front, two fixed at the back, all with brakes. The
  // body rides on the castors' mount plane, so the running gear is authored below
  // the floor everything else here is measured from.
  const axle = WHEEL - RIDE
  for (const sz of [-1, 1]) {
    castor(body, m, [LENGTH * 0.5 - 0.16, axle, sz * (WIDTH * 0.5 - 0.14)], WHEEL, sz * 0.3)
    const x = -LENGTH * 0.5 + 0.2
    // The fixed legs reach from their axles 50 mm up into the floor slab. At the
    // 0.14 stub they were they stopped 70 mm below it once the bin was lifted.
    box(body, m.graphite, [0.1, 0.05 - axle, 0.1], [x, (axle + 0.05) * 0.5, sz * (WIDTH * 0.5 - 0.14)], {
      chamfer: 0.026, fillet: 0.01, bevel: 0.008,
    })
    // Sixteen facets, not fourteen: a facet count off a multiple of four puts a
    // flat rather than a vertex at the bottom, and the tyre hovers by its sagitta.
    body.add(cylinder(m.rubber, WHEEL, 0.06, [x, axle, sz * (WIDTH * 0.5 - 0.14)], AXIS_X, 16))
    body.add(cylinder(m.steel, WHEEL * 0.42, 0.068, [x, axle, sz * (WIDTH * 0.5 - 0.14)], AXIS_X, 10))
    box(body, m.amberPaint, [0.06, 0.03, 0.05], [x + 0.07, axle - WHEEL * 0.5, sz * (WIDTH * 0.5 - 0.14)], {
      chamfer: 0.01, fillet: 0.004, bevel: 0.004,
    })
  }

  // Foot pedal linkage on the front face, seated on the wall's own face so the
  // upright bites 25 mm into it instead of standing 5 mm clear.
  box(body, m.graphiteEdge, [0.05, HEIGHT * 0.7, 0.05], [LENGTH * 0.5, HEIGHT * 0.42, 0.26], {
    chamfer: 0.014, fillet: 0.005, bevel: 0.005,
  })
  box(body, m.amberPaint, [0.16, 0.035, 0.09], [LENGTH * 0.5 + 0.08, 0.11, 0.26], {
    chamfer: 0.014, fillet: 0.006, bevel: 0.005, rotation: [0, 0, -0.14],
  })
  body.add(cylinder(m.steel, 0.014, 0.14, [LENGTH * 0.5, 0.16, 0.26], AXIS_Z, 8))

  // One graphic per pan. Placed on the pans' 0.513 face rather than 3 mm in
  // front of it, and each sized to the 0.369 pan under it: the hazard band was
  // 0.48 wide, so it hung over two pan edges and the 57 mm gap between them.
  const label = addLabelDecal(bundle, { variant: 340 })
  plaque(body, m, label, [0.3, 0.12], [0.02, HEIGHT * 0.62, PAN_FACE], 'front', m.shellLight)
  const stripe = addStripeDecal(bundle, { count: 5, lean: 1 })
  plaque(body, m, stripe, [0.3, 0.08], [-LENGTH * 0.3 + 0.02, HEIGHT * 0.3, PAN_FACE], 'front', m.ink)
  paintMark(body, m.amberPaint, slashProfile(0.08, 0.24, 0.42), [LENGTH * 0.3 + 0.02, HEIGHT * 0.5, PAN_FACE], 'front', 0.011)
  statusLens(body, m, [0.05, 0.02], [-LENGTH * 0.3 + 0.02, HEIGHT * 0.62, PAN_FACE], m.cyan, 'front')
  for (const sz of [-1, 1]) bolt(body, m.steel, [0.02, HEIGHT * 0.8, sz * (WIDTH * 0.5 + 0.0215)], 0.015, sz > 0 ? 'front' : 'back')
}

/**
 * One lid leaf. The leaf is authored from its hinge, at local x = 0, so the
 * group origin is the pivot the whole assembly turns about.
 *
 * The leaf runs 10 mm past the bin's flank rather than stopping 15 mm inside it,
 * and stops 5 mm short of the centreline rather than 5 mm past it: at the widths
 * it had, the two leaves duplicated 10 mm of coplanar-topped volume down the
 * middle and left an open strip down each side.
 */
function lidBuild(lid: Group, m: CargoMaterials, side: -1 | 1): void {
  const span = LENGTH - SLOPE + 0.06
  const leaf = WIDTH * 0.5 + 0.01
  const centre = side * leaf * 0.5
  box(lid, m.graphite, [span, 0.05, leaf], [span * 0.5, 0.025, centre], {
    chamfer: 0.045, fillet: 0.016, bevel: 0.012, capChamfer: 0.028,
  })
  box(lid, m.shellShade, [span - 0.22, 0.02, leaf - 0.14], [span * 0.5, 0.055, centre], {
    chamfer: 0.04, fillet: 0.014, bevel: 0.008,
  })
  box(lid, m.graphiteEdge, [0.18, 0.035, 0.06], [span - 0.17, 0.06, centre], {
    chamfer: 0.014, fillet: 0.005, bevel: 0.005,
  })
  for (const x of [span * 0.25, span * 0.68]) {
    lid.add(cylinder(m.steel, 0.016, 0.1, [x, 0.01, centre], AXIS_Z, 8))
  }
}

function build(): {
  root: Group
  body: Group
  lidLeft: Group
  lidRight: Group
  sockets: BinSockets
  bundle: CargoMaterialBundle
} {
  const bundle = acquireCargoMaterials(62_200, { condition: 0.88 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_STREETS_COMMERCIAL-DUMPSTER_ROOT_CLOSED'
  const body = new Group()
  body.name = 'AXR_STREETS_COMMERCIAL-DUMPSTER_PART_BODY_DEFAULT'
  const lidLeft = new Group()
  lidLeft.name = 'AXR_STREETS_COMMERCIAL-DUMPSTER_PART_LID-LEFT_CLOSED'
  const lidRight = new Group()
  lidRight.name = 'AXR_STREETS_COMMERCIAL-DUMPSTER_PART_LID-RIGHT_AJAR'
  root.add(body, lidLeft, lidRight)

  body.position.y = RIDE
  bodyBuild(body, m, bundle)
  // The pivot is the leaves' own back edge, 30 mm aft of the sloped back's top.
  // Turned about their middles instead, at the ajar angle the front edge swung
  // 247 mm down through the front wall.
  for (const [lid, side] of [[lidLeft, 1], [lidRight, -1]] as const) {
    lid.position.set(-LENGTH * 0.5 + SLOPE - 0.03, RIDE + HEIGHT, side * 0.005)
    lidBuild(lid, m, side)
  }
  // A bag caught under the ajar lid, which is why that lid does not close.
  box(body, m.fabric, [0.3, 0.22, 0.26], [0.1, HEIGHT + 0.04, -WIDTH * 0.26], {
    chamfer: 0.09, fillet: 0.03, bevel: 0.014, rotation: [0.1, 0.4, -0.12],
  })

  const sockets: BinSockets = {
    lid_hinge: socket('lid_hinge', [-LENGTH * 0.5 + SLOPE - 0.03, RIDE + HEIGHT, 0]),
    trunnion_left: socket('trunnion_left', [LENGTH * 0.5 - 0.06, RIDE + HEIGHT * 0.62, -(WIDTH * 0.5 + 0.14)]),
    trunnion_right: socket('trunnion_right', [LENGTH * 0.5 - 0.06, RIDE + HEIGHT * 0.62, WIDTH * 0.5 + 0.14]),
    foot_pedal: socket('foot_pedal', [LENGTH * 0.5 + 0.14, RIDE + 0.11, 0.26]),
  }
  return { root, body, lidLeft, lidRight, sockets, bundle }
}

export function createModel(): CommercialBinController {
  const { root, body, lidLeft, lidRight, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'commercial-dumpster',
    assemblies: [lidLeft, lidRight],
    reach: 0.16,
    sockets: Object.values(sockets),
  })

  let state: BinState = 'ajar'
  let blend = 1
  let elapsed = 0
  const applyBlend = (): void => {
    // Only the right lid moves; the left one stays shut, which is the whole
    // point of the asymmetry.
    lidRight.rotation.z = blend * AJAR
    lidRight.name = blend > 0.05
      ? 'AXR_STREETS_COMMERCIAL-DUMPSTER_PART_LID-RIGHT_AJAR'
      : 'AXR_STREETS_COMMERCIAL-DUMPSTER_PART_LID-RIGHT_CLOSED'
  }
  applyBlend()

  return {
    root,
    parts: { body, lidLeft, lidRight },
    sockets,
    get state() {
      return state
    },
    setState: (next: BinState) => {
      state = next
      root.name = next === 'ajar'
        ? 'AXR_STREETS_COMMERCIAL-DUMPSTER_ROOT_AJAR'
        : 'AXR_STREETS_COMMERCIAL-DUMPSTER_ROOT_CLOSED'
      blend = next === 'ajar' ? 1 : 0
      applyBlend()
      return state
    },
    update: (deltaSeconds: number) => {
      const step = Math.min(Math.max(deltaSeconds, 0), 0.05)
      elapsed += step
      const target = state === 'ajar' ? 1 : 0
      if (Math.abs(target - blend) > 1e-4) {
        blend += Math.sign(target - blend) * Math.min(Math.abs(target - blend), step * 1.2)
        applyBlend()
      }
      bundle.materials.cyan.emissiveIntensity = 1.45 + Math.sin(elapsed * 1.1) * 0.18
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: BinState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'ajar')
  return createCargoPreview(model, {
    target: [0, RIDE + HEIGHT * 0.52, 0],
    distance: 5.0,
    yaw: 0.8,
    pitch: 0.3,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createClosedPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'closed' })
