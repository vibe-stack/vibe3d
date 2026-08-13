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
  createCargoPreview,
  facetRadius,
  finishModel,
  radialMark,
  radialPlaque,
  slashProfile,
  socket,
  statusLens,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay bulk fuel tank — a bunded vertical storage tank.
 *
 * Depot-scale, so the safety case is the design: a full-height bund wall that
 * would hold the contents if the shell failed, a ladder with a back guard, a
 * railed roof platform, and a dispense manifold outside the bund with its own
 * drip tray. Draw a plain cylinder and it is a silo; the bund is what makes it
 * read as fuel.
 */

const RADIUS = 1.15
const BODY = 2.9
const BUND = 0.95
const BUND_R = 1.75
/** Bund floor slab thickness, and therefore the level the shell stands on. */
const FLOOR = 0.12
/** Facet count of the shell, which everything seated on it measures from. */
const SIDES = 26
const FACET = (Math.PI * 2) / SIDES

interface FuelTankSockets {
  fill_point: Object3D
  dispense: Object3D
  vent: Object3D
  ladder_base: Object3D
}

export type FuelTankState = 'live' | 'isolated'

export interface FuelTankController {
  root: Group
  sockets: FuelTankSockets
  readonly state: FuelTankState
  setState(state: FuelTankState): FuelTankState
  update(deltaSeconds: number): void
  dispose(): void
}

/** Caged access ladder up the -Z flank. */
function ladder(root: Group, m: CargoMaterials): void {
  const z = -(RADIUS + 0.06)
  const top = BUND + BODY - 0.1
  // The stiles land in the bund floor slab. Started at 0.4 they hung 80 mm over
  // it, and the rung run stopped 550 mm below their own heads.
  const foot = FLOOR - 0.02
  for (const sx of [-1, 1]) {
    root.add(cylinder(m.steel, 0.026, top - foot, [sx * 0.22, (top + foot) * 0.5, z], AXIS_Y, 8))
  }
  const rungs = Math.floor((top - 0.52) / 0.28) + 1
  for (let index = 0; index < rungs; index += 1) {
    root.add(cylinder(m.steel, 0.016, 0.44, [0, 0.4 + index * 0.28, z], AXIS_X, 6))
  }
  // Back guard: hoops with two longitudinal straps, starting above head height.
  const hoopBase = 1.5
  const hoopStep = 0.44
  const hoops = Math.floor((top - 0.2 - hoopBase) / hoopStep) + 1
  for (let index = 0; index < hoops; index += 1) {
    const y = hoopBase + index * hoopStep
    for (const sx of [-1, 1]) {
      box(root, m.shellShade, [0.035, 0.035, 0.38], [sx * 0.34, y, z - 0.2], {
        chamfer: 0.01, fillet: 0.004, bevel: 0.004,
      })
    }
    box(root, m.shellShade, [0.72, 0.035, 0.035], [0, y, z - 0.4], {
      chamfer: 0.01, fillet: 0.004, bevel: 0.004,
    })
  }
  // The straps tie the hoops together and stop with them. Drawn 3 m long from a
  // fixed centre they ran 1.24 m past the top hoop and out over the roof.
  //
  // They are welded on the back of the hoop bar, one section further out, rather
  // than run through its centre plane. Sharing it, two 35 mm bars of the same
  // section crossed with their backs, their ends and their bevels all on each
  // other's, at every one of the ten crossings.
  const strapTop = hoopBase + (hoops - 1) * hoopStep
  for (const sx of [-1, 1]) {
    box(root, m.shellShade, [0.035, strapTop - hoopBase + 0.07, 0.035], [
      sx * 0.34, (hoopBase + strapTop) * 0.5, z - 0.435,
    ], { chamfer: 0.01, fillet: 0.004, bevel: 0.004 })
  }
}

function build(): { root: Group; sockets: FuelTankSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(60_000, { condition: 0.68 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_INDUSTRIAL_FUEL-TANK_ROOT_LIVE'

  // Bund: a ring wall with a coping and a drain sump. The wall is cast around
  // the slab's rim and stands on the deck itself, so the slab keeps its top
  // face - which the shell and the sump are measured from - and gives up
  // FACE_CLEARANCE at the bottom rather than putting a second down-facing skin
  // on the deck plane under all 24 wall segments.
  root.add(cylinder(m.graphite, BUND_R, FLOOR - FACE_CLEARANCE, [0, (FLOOR + FACE_CLEARANCE) * 0.5, 0], AXIS_Y, 24))
  for (let index = 0; index < 24; index += 1) {
    const angle = (Math.PI * 2 * index) / 24
    box(root, m.shellShade, [0.48, BUND, 0.12], [
      Math.sin(angle) * BUND_R, BUND * 0.5, Math.cos(angle) * BUND_R,
    ], { chamfer: 0.03, fillet: 0.012, bevel: 0.01, rotation: [0, angle, 0] })
  }
  root.add(cylinder(m.graphiteEdge, BUND_R + 0.05, 0.09, [0, BUND, 0], AXIS_Y, 24))
  root.add(cylinder(m.ink, BUND_R - 0.12, 0.04, [0, 0.13, 0], AXIS_Y, 22))
  box(root, m.ink, [0.3, 0.06, 0.3], [BUND_R * 0.6, 0.14, BUND_R * 0.5], { chamfer: 0.07, fillet: 0.02, bevel: 0.008 })

  // Shell: a plated cylinder with three girth welds and a roof knuckle. It
  // stands on the bund floor, not on the bund wall's coping - begun at BUND it
  // left 830 mm of air under itself that only a look down into the bund found.
  const base = FLOOR - 0.02
  root.add(cylinder(m.shell, RADIUS, BUND + BODY - base, [0, (BUND + BODY + base) * 0.5, 0], AXIS_Y, SIDES))
  for (const fraction of [0.24, 0.52, 0.8]) {
    root.add(cylinder(m.shellShade, RADIUS + 0.014, 0.055, [0, BUND + BODY * fraction, 0], AXIS_Y, SIDES))
  }
  // Strakes sit on the chord the shell actually renders. On the circle their
  // backs ranged from 1 mm buried to 4 mm clear as each ray crossed a facet.
  const strakeR = facetRadius(RADIUS, SIDES) + 0.008
  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI * 2 * index) / 6 + 0.3
    box(root, m.shellShade, [0.05, BODY - 0.3, 0.024], [
      Math.sin(angle) * strakeR, BUND + BODY * 0.5, Math.cos(angle) * strakeR,
    ], { chamfer: 0.012, fillet: 0.005, bevel: 0.005, rotation: [0, angle, 0] })
  }
  root.add(cylinder(m.shellLight, RADIUS - 0.06, 0.14, [0, BUND + BODY + 0.05, 0], AXIS_Y, SIDES))
  root.add(cylinder(m.graphiteEdge, RADIUS + 0.03, 0.08, [0, BUND + BODY - 0.02, 0], AXIS_Y, SIDES))

  // Roof furniture: platform, rail, fill point, and a vent stack. Everything up
  // here beds 20 mm into what carries it: the roof disc caps at BUND + BODY +
  // 0.12, the platform at + 0.15, and each mass is seated from those.
  root.add(cylinder(m.graphiteEdge, 0.62, 0.05, [0, BUND + BODY + 0.125, -0.32], AXIS_Y, 14))
  // Stanchions plus the two rails that connect them. Posts alone read as a
  // crown of spikes; the rails are what make the platform look walkable.
  const posts = 7
  for (let index = 0; index < posts; index += 1) {
    const angle = -1.4 + index * 0.47
    root.add(cylinder(m.steel, 0.02, 0.5, [
      Math.sin(angle) * 0.58, BUND + BODY + 0.375, -0.32 + Math.cos(angle) * 0.58,
    ], AXIS_Y, 6))
    if (index === posts - 1) continue
    const next = angle + 0.47
    const ax = Math.sin(angle) * 0.58
    const az = Math.cos(angle) * 0.58
    const bx = Math.sin(next) * 0.58
    const bz = Math.cos(next) * 0.58
    for (const lift of [0.6, 0.4]) {
      box(root, m.steel, [Math.hypot(bx - ax, bz - az), 0.028, 0.028], [
        (ax + bx) * 0.5, BUND + BODY + lift, -0.32 + (az + bz) * 0.5,
      ], {
        chamfer: 0.008, fillet: 0.004, bevel: 0.004,
        rotation: [0, Math.atan2(-(bz - az), bx - ax), 0],
      })
    }
  }
  box(root, m.graphite, [0.3, 0.16, 0.3], [0.3, BUND + BODY + 0.17, 0.24], { chamfer: 0.07, fillet: 0.024, bevel: 0.012 })
  root.add(cylinder(m.orangePaint, 0.11, 0.09, [0.3, BUND + BODY + 0.27, 0.24], AXIS_Y, 8))
  root.add(cylinder(m.steel, 0.05, 0.55, [-0.42, BUND + BODY + 0.375, 0.3], AXIS_Y, 10))
  root.add(cylinder(m.ink, 0.07, 0.09, [-0.42, BUND + BODY + 0.68, 0.3], AXIS_Y, 10))

  // Dispense manifold outside the bund, on its own drip tray.
  const manifoldZ = BUND_R + 0.34
  box(root, m.graphite, [0.9, 0.06, 0.5], [0, 0.03, manifoldZ], { chamfer: 0.05, fillet: 0.018, bevel: 0.01 })
  box(root, m.ink, [0.8, 0.03, 0.42], [0, 0.07, manifoldZ], { chamfer: 0.04, fillet: 0.014, bevel: 0.008 })
  box(root, m.shellShade, [0.62, 0.9, 0.24], [0, 0.5, manifoldZ], { chamfer: 0.07, fillet: 0.024, bevel: 0.014 })
  for (const sx of [-1, 1]) {
    root.add(cylinder(m.steel, 0.05, 0.26, [sx * 0.2, 0.66, manifoldZ + 0.16], AXIS_Z, 10))
    root.add(cylinder(m.orangePaint, 0.07, 0.05, [sx * 0.2, 0.66, manifoldZ + 0.3], AXIS_Z, 6))
  }
  statusLens(root, m, [0.11, 0.05], [0, 0.86, manifoldZ + 0.12], m.amber, 'front')
  // Feed line: a riser bedded into the shell, a cross-over, and a drop into the
  // cabinet roof. Set out from the nominal radius the riser stood 145 mm clear
  // of the flank, and the cross-over simply stopped 630 mm above the cabinet.
  //
  // The cross-over runs a smaller bore than the two verticals it joins. Drawn at
  // the same 0.055 and the same ten facets about the same centreline, its flanks
  // were the risers' flanks, and both elbows showed the pair.
  const riserZ = facetRadius(RADIUS, SIDES) + 0.035
  const runY = 1.58
  const cabinetTop = 0.95
  root.add(cylinder(m.steel, 0.055, runY + 0.055 - FLOOR, [0, (runY + 0.055 + FLOOR) * 0.5, riserZ], AXIS_Y, 10))
  root.add(cylinder(m.steel, 0.051, manifoldZ - riserZ, [0, runY, (manifoldZ + riserZ) * 0.5], AXIS_Z, 10))
  root.add(cylinder(m.steel, 0.055, runY + 0.055 - cabinetTop + 0.05, [
    0, (runY + 0.055 + cabinetTop - 0.05) * 0.5, manifoldZ,
  ], AXIS_Y, 10))
  root.add(cylinder(m.graphiteEdge, 0.075, 0.09, [0, runY, riserZ + 0.12], AXIS_Z, 10))

  ladder(root, m)

  // Graphics are laid on facet centres, and the strokes are cut to the arc one
  // facet spans: a mark wider than its own chord lifts its outer corners off
  // the next chord along, which is the same failure at a tenth the amplitude.
  const label = addLabelDecal(bundle, { variant: 230 })
  radialPlaque(root, m, label, [0.5, 0.24], RADIUS, BUND + BODY * 0.62, 2.5 * FACET, m.ink, SIDES)
  // The bund wall is 24 flat panels, so the radius its graphic seats on is the
  // one whose 24-gon facet lands on the panel face, and the angle is a panel's
  // own ray rather than the gap between two of them.
  const stripe = addStripeDecal(bundle, { count: 8, lean: 1 })
  radialPlaque(root, m, stripe, [0.6, 0.1], (BUND_R + 0.06) / Math.cos(Math.PI / 24), BUND - 0.14, Math.PI / 12, m.ink, 24)
  for (const [width, side] of [[0.12, -1], [0.06, 1]] as const) {
    radialMark(root, m.orangePaint, slashProfile(width, 0.44, 0.42), RADIUS, BUND + BODY * 0.35, side * 0.5 * FACET, SIDES)
  }
  for (let index = 0; index < 4; index += 1) {
    const angle = index * 1.57 + 0.78
    bolt(root, m.steel, [Math.sin(angle) * (BUND_R - 0.1), BUND + 0.045, Math.cos(angle) * (BUND_R - 0.1)], 0.024, 'top')
  }

  const sockets: FuelTankSockets = {
    fill_point: socket('fill_point', [0.3, BUND + BODY + 0.4, 0.24]),
    dispense: socket('dispense', [0, 0.66, manifoldZ + 0.42]),
    vent: socket('vent', [-0.42, BUND + BODY + 0.76, 0.3]),
    ladder_base: socket('ladder_base', [0, 0.4, -(RADIUS + 0.4)]),
  }
  return { root, sockets, bundle }
}

export function createModel(): FuelTankController {
  const { root, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'industrial-fuel-tank',
    reach: 0.3,
    sockets: Object.values(sockets),
  })

  let state: FuelTankState = 'live'
  let elapsed = 0
  const applyState = (next: FuelTankState): FuelTankState => {
    state = next
    const live = next === 'live'
    bundle.materials.amber.emissiveIntensity = live ? 2.1 : 0
    root.name = live
      ? 'AXR_INDUSTRIAL_FUEL-TANK_ROOT_LIVE'
      : 'AXR_INDUSTRIAL_FUEL-TANK_ROOT_ISOLATED'
    return state
  }

  return {
    root,
    sockets,
    get state() {
      return state
    },
    setState: applyState,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      if (state === 'live') bundle.materials.amber.emissiveIntensity = 2.0 + Math.sin(elapsed * 1.5) * 0.22
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: FuelTankState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'live')
  return createCargoPreview(model, {
    target: [0, (BUND + BODY) * 0.48, 0],
    distance: 11.4,
    yaw: 0.62,
    pitch: 0.24,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createIsolatedPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'isolated' })
