import { Group, Object3D } from 'three/webgpu'

import { cylinder, type Vec2 } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  AXIS_Y,
  AXIS_Z,
  acquireCargoMaterials,
  addLabelDecal,
  addStripeDecal,
  bolt,
  box,
  createCargoPreview,
  facetRadius,
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
 * Axiom Relay horizontal process tank on saddles.
 *
 * The lying-down counterpart to the vertical tank, and it needs a completely
 * different support story: two saddle cradles on a plinth, a slotted anchor at
 * one end so the shell can grow when it heats, and a fixed anchor at the other.
 * That sliding saddle is the detail that says "this gets hot" without a single
 * warning decal.
 *
 * Dished ends are two stepped discs each. A hemispherical cap is invisible at
 * the distances this prop is used and costs several times the triangles.
 */

const RADIUS = 0.72
const BARREL = 3.1
const PLINTH = 0.16
const SADDLE = 0.44
/** Facet count of the barrel; everything seated on it measures from here. */
const SIDES = 24
const FACET = (Math.PI * 2) / SIDES
/** The chord the shell renders as, which is 6 mm inside the nominal radius. */
const SKIN = facetRadius(RADIUS, SIDES)

interface HorizontalTankSockets {
  manway: Object3D
  inlet: Object3D
  drain: Object3D
  gauge: Object3D
}

export type HorizontalTankState = 'live' | 'isolated'

export interface HorizontalTankController {
  root: Group
  sockets: HorizontalTankSockets
  readonly state: HorizontalTankState
  setState(state: HorizontalTankState): HorizontalTankState
  update(deltaSeconds: number): void
  dispose(): void
}

const AXIS_HEIGHT = PLINTH + SADDLE + RADIUS
/** Saddle seat chord: its arc length, and how far it stands off the shell. */
const SEAT_SPAN = 0.34
const SEAT_DEEP = 0.08
/** Paint thickness on the flank. */
const STROKE = 0.012

/** One saddle cradle: a plinth block, a curved seat, and its anchor detail. */
function saddle(root: Group, m: CargoMaterials, x: number, sliding: boolean): void {
  box(root, m.graphite, [0.44, PLINTH, RADIUS * 2 + 0.3], [x, PLINTH * 0.5, 0], {
    chamfer: 0.05, fillet: 0.018, bevel: 0.012, capChamfer: 0.03,
  })
  box(root, m.shellShade, [0.34, SADDLE, RADIUS * 2 + 0.14], [x, PLINTH + SADDLE * 0.5, 0], {
    chamfer: 0.06, fillet: 0.022, bevel: 0.014,
  })
  // Seat: five short chords stepping around the shell, so the cradle reads
  // curved without a lathe.
  //
  // A chord is flat, so its ends stand further from the axis than its middle:
  // seated on the shell radius all ten of them came out through the skin. The
  // seat radius is solved from the chord's own half-length instead, and the
  // rotation is the negative of the angle its position was swung by - the two
  // had opposite signs, which tipped every chord away from the surface.
  const seatR = Math.sqrt((SKIN - 0.004) ** 2 - SEAT_SPAN ** 2 * 0.25) + SEAT_DEEP * 0.5
  for (let index = 0; index < 5; index += 1) {
    const angle = -1.0 + index * 0.5
    box(root, m.graphiteEdge, [0.36, SEAT_DEEP, SEAT_SPAN], [
      x, AXIS_HEIGHT - Math.cos(angle) * seatR, Math.sin(angle) * seatR,
    ], { chamfer: 0.02, fillet: 0.008, bevel: 0.007, rotation: [-angle, 0, 0] })
  }
  for (const sz of [-1, 1]) {
    // Haunch plates on the saddle's own flanks. Run down its centre plane they
    // were inside the slab end to end and never rendered at all.
    for (const sx of [-1, 1]) {
      member(root, m.shellShade,
        [x + sx * 0.18, PLINTH - 0.03, sz * (RADIUS + 0.06)],
        [x + sx * 0.18, PLINTH + SADDLE - 0.04, sz * 0.16], 0.09, 0.03)
    }
    // A slotted hole at the sliding end, a plain one at the fixed end, both
    // bedded into the plinth rather than resting 5 mm above it.
    box(root, sliding ? m.ink : m.steel, [0.16, 0.03, sliding ? 0.16 : 0.09], [
      x, PLINTH + 0.005, sz * (RADIUS + 0.06),
    ], { chamfer: 0.02, fillet: 0.008, bevel: 0.006 })
    bolt(root, m.steel, [x, PLINTH + 0.02, sz * (RADIUS + 0.06)], 0.022, 'top')
  }
}

function build(): { root: Group; sockets: HorizontalTankSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(60_200, { condition: 0.7 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_INDUSTRIAL_HORIZONTAL-TANK_ROOT_LIVE'

  root.add(cylinder(m.shell, RADIUS, BARREL, [0, AXIS_HEIGHT, 0], AXIS_X, SIDES))
  for (const sx of [-1, 1]) {
    // Dished end: two stepped discs and a weld ring.
    root.add(cylinder(m.shellShade, RADIUS + 0.012, 0.06, [sx * BARREL * 0.5, AXIS_HEIGHT, 0], AXIS_X, SIDES))
    root.add(cylinder(m.shell, RADIUS * 0.88, 0.12, [sx * (BARREL * 0.5 + 0.06), AXIS_HEIGHT, 0], AXIS_X, 22))
    root.add(cylinder(m.shell, RADIUS * 0.58, 0.1, [sx * (BARREL * 0.5 + 0.15), AXIS_HEIGHT, 0], AXIS_X, 18))
  }
  // Girth welds, and two longitudinal strakes laid on facet centres so each one
  // beds into the chord it runs along instead of straddling two of them.
  for (const fraction of [-0.28, 0.06, 0.34]) {
    root.add(cylinder(m.shellShade, RADIUS + 0.01, 0.045, [fraction * BARREL, AXIS_HEIGHT, 0], AXIS_X, SIDES))
  }
  for (const facet of [2.5, 9.5]) {
    const angle = facet * FACET
    box(root, m.shellShade, [BARREL - 0.3, 0.04, 0.022], [
      0, AXIS_HEIGHT + Math.cos(angle) * (SKIN + 0.016), Math.sin(angle) * (SKIN + 0.016),
    ], { chamfer: 0.01, fillet: 0.004, bevel: 0.004, rotation: [angle, 0, 0] })
  }

  saddle(root, m, -BARREL * 0.3, false)
  saddle(root, m, BARREL * 0.3, true)

  // Crown furniture: a bolted manway, an inlet nozzle, and a relief valve. The
  // shell falls 57 mm away across the manway's own diameter, so each fitting is
  // seated on the height its own rim meets rather than on the crown line.
  const seat = (radius: number): number => AXIS_HEIGHT + Math.sqrt(SKIN ** 2 - radius ** 2) - 0.006
  const manway = seat(0.28)
  root.add(cylinder(m.graphiteEdge, 0.28, 0.1, [-0.5, manway + 0.05, 0], AXIS_Y, 16))
  root.add(cylinder(m.shellLight, 0.24, 0.07, [-0.5, manway + 0.115, 0], AXIS_Y, 16))
  for (let index = 0; index < 8; index += 1) {
    const angle = (Math.PI / 4) * index
    bolt(root, m.steel, [-0.5 + Math.sin(angle) * 0.25, manway + 0.1, Math.cos(angle) * 0.25], 0.017, 'top')
  }
  const inlet = seat(0.09)
  root.add(cylinder(m.steel, 0.09, 0.22, [0.55, inlet + 0.11, 0], AXIS_Y, 12))
  root.add(cylinder(m.graphiteEdge, 0.13, 0.06, [0.55, inlet + 0.19, 0], AXIS_Y, 12))
  root.add(cylinder(m.amberPaint, 0.06, 0.1, [0.55, inlet + 0.25, 0], AXIS_Y, 8))
  const relief = seat(0.055)
  root.add(cylinder(m.steel, 0.055, 0.3, [1.15, relief + 0.15, 0], AXIS_Y, 10))
  root.add(cylinder(m.ink, 0.075, 0.07, [1.15, relief + 0.30, 0], AXIS_Y, 10))

  // Instrument column and drain on the +Z flank. The column is a flat box, so
  // it sits on the barrel's own centreline and is short enough that its top and
  // bottom edges still bite the curve - at half a metre tall and a tenth above
  // the axis its upper corner stood 76 mm off the shell.
  const columnZ = Math.sqrt(SKIN ** 2 - 0.17 ** 2) - 0.004 + 0.035
  box(root, m.graphite, [0.2, 0.34, 0.07], [-1.2, AXIS_HEIGHT, columnZ], {
    chamfer: 0.045, fillet: 0.016, bevel: 0.012,
  })
  statusLens(root, m, [0.11, 0.11], [-1.2, AXIS_HEIGHT + 0.08, columnZ + 0.035], m.cyan, 'front')
  statusLens(root, m, [0.07, 0.04], [-1.2, AXIS_HEIGHT - 0.11, columnZ + 0.035], m.amber, 'front')
  root.add(cylinder(m.steel, 0.05, 0.4, [1.3, AXIS_HEIGHT - RADIUS - 0.16, 0], AXIS_Y, 10))
  root.add(cylinder(m.orangePaint, 0.07, 0.05, [1.3, AXIS_HEIGHT - RADIUS - 0.36, 0], AXIS_Y, 6))
  root.add(cylinder(m.steel, 0.03, 0.16, [1.3, AXIS_HEIGHT - RADIUS - 0.3, 0.09], AXIS_Z, 8))

  // Flank graphics lie on a facet and are tilted with it. The +Z centreline is a
  // facet *vertex*, so a mark laid flat along it stands proud at the middle and
  // sinks at its edges; on the facet plane the whole graphic is flat on the
  // chord it is printed on, and each is cut to the arc that chord spans.
  const label = addLabelDecal(bundle, { variant: 240 })
  const labelTilt = FACET * 0.5
  plaque(root, m, label, [0.46, 0.14], [
    BARREL * 0.2, AXIS_HEIGHT + Math.sin(labelTilt) * SKIN, Math.cos(labelTilt) * SKIN,
  ], 'front', m.ink, 0, [-labelTilt, 0, 0])
  const stripe = addStripeDecal(bundle, { count: 6, lean: 1 })
  plaque(root, m, stripe, [0.34, 0.09], [-BARREL * 0.3, PLINTH * 0.5, RADIUS + 0.15], 'front', m.ink)
  const strokeTilt = FACET * -1.5
  for (const [profile, x] of [
    [slashProfile(0.11, 0.18, 0.42), -0.42],
    [slashProfile(0.055, 0.18, 0.42), -0.24],
  ] as const) {
    paintMark(root, m.orangePaint, profile as Vec2[], [
      x, AXIS_HEIGHT + Math.sin(strokeTilt) * SKIN, Math.cos(strokeTilt) * SKIN,
    ], 'front', STROKE, 0, [-strokeTilt, 0, 0])
  }

  const sockets: HorizontalTankSockets = {
    manway: socket('manway', [-0.5, manway + 0.22, 0]),
    inlet: socket('inlet', [0.55, inlet + 0.42, 0]),
    drain: socket('drain', [1.3, AXIS_HEIGHT - RADIUS - 0.42, 0]),
    gauge: socket('gauge', [-1.2, AXIS_HEIGHT + 0.08, columnZ + 0.14]),
  }
  return { root, sockets, bundle }
}

export function createModel(): HorizontalTankController {
  const { root, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'industrial-horizontal-tank',
    reach: 0.24,
    sockets: Object.values(sockets),
  })

  let state: HorizontalTankState = 'live'
  let elapsed = 0
  const applyState = (next: HorizontalTankState): HorizontalTankState => {
    state = next
    const live = next === 'live'
    bundle.materials.cyan.emissiveIntensity = live ? 1.7 : 0
    bundle.materials.amber.emissiveIntensity = live ? 2.1 : 0
    root.name = live
      ? 'AXR_INDUSTRIAL_HORIZONTAL-TANK_ROOT_LIVE'
      : 'AXR_INDUSTRIAL_HORIZONTAL-TANK_ROOT_ISOLATED'
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
      if (state !== 'live') return
      bundle.materials.cyan.emissiveIntensity = 1.6 + Math.sin(elapsed * 1.4) * 0.2
      bundle.materials.amber.emissiveIntensity = 2.0 + Math.sin(elapsed * 2.6) * 0.24
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: HorizontalTankState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'live')
  return createCargoPreview(model, {
    target: [0, AXIS_HEIGHT * 0.85, 0],
    distance: 7.6,
    yaw: 0.78,
    pitch: 0.26,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createIsolatedPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'isolated' })
