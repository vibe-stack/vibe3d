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
  createCargoPreview,
  finishModel,
  member,
  paintMark,
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
 * Axiom Relay vertical pressure vessel.
 *
 * A thick-walled column, and every detail says so: heavy flanged nozzles instead
 * of welded stubs, a bolted blind flange at the crown, a relief valve piped to a
 * vent riser, and a skirt support with access openings rather than legs. Thin
 * pipework on a pressure vessel is the fastest way to make it read as a water
 * tank.
 *
 * The relief valve is the hero detail. It is the one part of a vessel that an
 * operator actually looks at, so it gets the largest single mass above the
 * crown and the only saturated colour on the prop.
 */

const RADIUS = 0.66
const BARREL = 2.15
const SKIRT = 0.62

interface VesselSockets {
  crown_flange: Object3D
  relief_vent: Object3D
  process_inlet: Object3D
  drain: Object3D
}

export type VesselState = 'pressurised' | 'vented'

export interface PressureVesselController {
  root: Group
  sockets: VesselSockets
  readonly state: VesselState
  setState(state: VesselState): VesselState
  update(deltaSeconds: number): void
  dispose(): void
}

/** A flanged nozzle: neck, two flange discs, and a ring of studs. */
function nozzle(
  root: Group,
  m: CargoMaterials,
  position: [number, number, number],
  rotation: [number, number, number],
  radius: number,
  reach: number,
): void {
  root.add(cylinder(m.steel, radius, reach, position, rotation, 12))
  root.add(cylinder(m.graphiteEdge, radius * 1.7, 0.055, position, rotation, 12))
  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI / 3) * index
    const offset = radius * 1.4
    root.add(cylinder(m.steel, 0.014, 0.075, [
      position[0] + (rotation[0] !== 0 ? Math.sin(angle) * offset : 0),
      position[1] + (rotation[0] !== 0 ? 0 : Math.cos(angle) * offset),
      position[2] + (rotation[0] !== 0 ? Math.cos(angle) * offset : Math.sin(angle) * offset),
    ], rotation, 6))
  }
}

function build(): { root: Group; sockets: VesselSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(60_600, { condition: 0.6 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_INDUSTRIAL_PRESSURE-VESSEL_ROOT_PRESSURISED'

  // Skirt support with two access openings and a base ring.
  root.add(cylinder(m.graphite, RADIUS + 0.05, SKIRT, [0, SKIRT * 0.5, 0], AXIS_Y, 20))
  root.add(cylinder(m.graphiteEdge, RADIUS + 0.16, 0.07, [0, 0.035, 0], AXIS_Y, 20))
  root.add(cylinder(m.graphiteEdge, RADIUS + 0.09, 0.06, [0, SKIRT - 0.03, 0], AXIS_Y, 20))
  for (const sign of [1, -1]) {
    box(root, m.ink, [0.32, 0.34, 0.3], [0, SKIRT * 0.5 - 0.04, sign * RADIUS], {
      chamfer: 0.08, fillet: 0.026, bevel: 0.012,
    })
  }
  for (let index = 0; index < 8; index += 1) {
    const angle = (Math.PI / 4) * index
    bolt(root, m.steel, [Math.sin(angle) * (RADIUS + 0.11), 0.07, Math.cos(angle) * (RADIUS + 0.11)], 0.022, 'top')
  }

  // Shell with heavy girth welds; the dished ends are stepped discs.
  root.add(cylinder(m.shell, RADIUS, BARREL, [0, SKIRT + BARREL * 0.5, 0], AXIS_Y, 22))
  for (const fraction of [0.3, 0.7]) {
    root.add(cylinder(m.shellShade, RADIUS + 0.018, 0.07, [0, SKIRT + BARREL * fraction, 0], AXIS_Y, 22))
  }
  for (const [y, radius] of [[SKIRT - 0.02, RADIUS * 0.9], [SKIRT + BARREL + 0.02, RADIUS * 0.9], [SKIRT + BARREL + 0.14, RADIUS * 0.6]] as const) {
    root.add(cylinder(m.shell, radius, 0.14, [0, y, 0], AXIS_Y, 20))
  }

  const crown = SKIRT + BARREL + 0.22
  // Crown blind flange with its stud ring.
  root.add(cylinder(m.graphiteEdge, 0.34, 0.075, [0, crown, 0], AXIS_Y, 16))
  root.add(cylinder(m.shellLight, 0.28, 0.06, [0, crown + 0.06, 0], AXIS_Y, 16))
  for (let index = 0; index < 10; index += 1) {
    const angle = (Math.PI / 5) * index
    bolt(root, m.steel, [Math.sin(angle) * 0.3, crown + 0.045, Math.cos(angle) * 0.3], 0.018, 'top')
  }

  // Relief valve and vent riser: the hero mass.
  box(root, m.shellShade, [0.26, 0.34, 0.26], [0.36, crown + 0.2, 0], {
    chamfer: 0.07, fillet: 0.024, bevel: 0.014, capChamfer: 0.05,
  })
  root.add(cylinder(m.redPaint, 0.11, 0.12, [0.36, crown + 0.42, 0], AXIS_Y, 10))
  root.add(cylinder(m.steel, 0.05, 0.16, [0.36, crown + 0.54, 0], AXIS_Y, 8))
  root.add(cylinder(m.steel, 0.07, 0.9, [0.36, crown + 0.9, -0.18], [0.34, 0, 0], 10))
  root.add(cylinder(m.ink, 0.095, 0.09, [0.36, crown + 1.32, -0.32], AXIS_Y, 10))
  nozzle(root, m, [0.36, crown + 0.03, 0], AXIS_Y, 0.075, 0.14)

  // Process nozzles on the flanks and a drain at the skirt.
  nozzle(root, m, [0, SKIRT + BARREL * 0.74, RADIUS + 0.16], AXIS_Z, 0.09, 0.34)
  nozzle(root, m, [0, SKIRT + BARREL * 0.24, -(RADIUS + 0.16)], AXIS_Z, 0.09, 0.34)
  nozzle(root, m, [RADIUS + 0.16, SKIRT + BARREL * 0.5, 0], AXIS_X, 0.06, 0.3)
  root.add(cylinder(m.steel, 0.055, 0.34, [0, SKIRT * 0.5, RADIUS + 0.24], AXIS_Z, 10))
  root.add(cylinder(m.orangePaint, 0.075, 0.055, [0, SKIRT * 0.5, RADIUS + 0.42], AXIS_Z, 6))

  // Instrument bridle: a small column of two lenses on a bracket.
  box(root, m.graphite, [0.16, 0.42, 0.08], [-RADIUS - 0.04, SKIRT + BARREL * 0.56, 0.2], {
    chamfer: 0.04, fillet: 0.014, bevel: 0.011,
  })
  statusLens(root, m, [0.09, 0.09], [-RADIUS - 0.1, SKIRT + BARREL * 0.62, 0.2], m.cyan, 'left')
  statusLens(root, m, [0.06, 0.035], [-RADIUS - 0.1, SKIRT + BARREL * 0.46, 0.2], m.amber, 'left')
  member(root, m.steel, [-RADIUS - 0.04, SKIRT + BARREL * 0.36, 0.2], [-RADIUS + 0.02, SKIRT + BARREL * 0.36, 0.2], 0.03, 0.03)

  const label = addLabelDecal(bundle, { variant: 260 })
  radialPlaque(root, m, label, [0.42, 0.2], RADIUS, SKIRT + BARREL * 0.5, 0.62, m.ink)
  const stripe = addStripeDecal(bundle, { count: 5, lean: 1, bar: 0xeb514e })
  radialPlaque(root, m, stripe, [0.34, 0.08], RADIUS + 0.05, SKIRT * 0.72, -0.5, m.ink)
  paintMark(root, m.redPaint, slashProfile(0.1, 0.34, 0.42), [-0.16, SKIRT + BARREL * 0.86, RADIUS + 0.004], 'front', 0.012)
  paintMark(root, m.redPaint, slashProfile(0.05, 0.34, 0.42), [-0.02, SKIRT + BARREL * 0.86, RADIUS + 0.004], 'front', 0.012)

  const sockets: VesselSockets = {
    crown_flange: socket('crown_flange', [0, crown + 0.12, 0]),
    relief_vent: socket('relief_vent', [0.36, crown + 1.4, -0.32]),
    process_inlet: socket('process_inlet', [0, SKIRT + BARREL * 0.74, RADIUS + 0.34]),
    drain: socket('drain', [0, SKIRT * 0.5, RADIUS + 0.5]),
  }
  return { root, sockets, bundle }
}

export function createModel(): PressureVesselController {
  const { root, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'industrial-pressure-vessel',
    reach: 0.2,
    sockets: Object.values(sockets),
  })

  let state: VesselState = 'pressurised'
  let elapsed = 0
  const applyState = (next: VesselState): VesselState => {
    state = next
    root.name = next === 'vented'
      ? 'AXR_INDUSTRIAL_PRESSURE-VESSEL_ROOT_VENTED'
      : 'AXR_INDUSTRIAL_PRESSURE-VESSEL_ROOT_PRESSURISED'
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
      const live = state === 'pressurised'
      bundle.materials.cyan.emissiveIntensity = live ? 1.7 + Math.sin(elapsed * 1.2) * 0.2 : 0.5
      bundle.materials.amber.emissiveIntensity = live
        ? 2.0 + Math.sin(elapsed * 2.4) * 0.22
        : 1.4 + Math.abs(Math.sin(elapsed * 5.5)) * 1.2
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: VesselState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'pressurised')
  return createCargoPreview(model, {
    target: [0, (SKIRT + BARREL) * 0.55, 0],
    distance: 8.4,
    yaw: 0.66,
    pitch: 0.22,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createVentedPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'vented' })
