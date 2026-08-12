import { Group, Object3D } from 'three/webgpu'

import { cylinder, extrudeProfile } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_Y,
  AXIS_Z,
  acquireCargoMaterials,
  addLabelDecal,
  bolt,
  box,
  createCargoPreview,
  drum,
  finishModel,
  hexagon,
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
 * Axiom Relay fuel drum.
 *
 * A pressurised transfer drum rather than an open barrel: it has a gauge column,
 * a dispense valve, and a bunded base, and its identity colour is thermal orange
 * because what is inside it burns. The gauge tube is the only emissive element
 * and it sits inside a bezel with graduation ticks either side, so the drum reads
 * as instrumented from across a yard and as serviceable up close.
 */

const RADIUS = 0.38
const BODY = 0.82
const BASE = 0.1

interface FuelDrumSockets {
  fill_cap: Object3D
  dispense: Object3D
  gauge: Object3D
  stack_top: Object3D
}

export type FuelDrumState = 'charged' | 'empty'

export interface FuelDrumController {
  root: Group
  sockets: FuelDrumSockets
  readonly state: FuelDrumState
  setState(state: FuelDrumState): FuelDrumState
  update(deltaSeconds: number): void
  dispose(): void
}

function gaugeColumn(root: Group, m: CargoMaterials): Group {
  const column = new Group()
  column.name = 'AXR_CARGO_FUEL-DRUM_PART_GAUGE_ACTIVE'
  root.add(column)
  const z = RADIUS + 0.012
  const y = BASE + BODY * 0.56

  box(column, m.graphite, [0.19, 0.46, 0.06], [0, y, z], { chamfer: 0.045, fillet: 0.014, bevel: 0.012 })
  box(column, m.ink, [0.115, 0.36, 0.05], [0, y + 0.02, z + 0.035], { chamfer: 0.03, fillet: 0.01, bevel: 0.008 })
  column.add(cylinder(m.orangePaint, 0.026, 0.3, [0, y + 0.02, z + 0.062], AXIS_Y, 10))
  column.add(cylinder(m.glass, 0.033, 0.31, [0, y + 0.02, z + 0.062], AXIS_Y, 12))
  // Graduation ticks, cut rather than painted so they survive at grazing angles.
  for (let index = 0; index < 7; index += 1) {
    box(column, m.steel, [0.03, 0.008, 0.012], [0.055, y - 0.13 + index * 0.05, z + 0.05], {
      chamfer: 0.003, fillet: 0.002, bevel: 0.002,
    })
  }
  for (const sy of [-1, 1]) {
    bolt(column, m.steel, [0, y + sy * 0.2, z + 0.032], 0.016, 'front')
  }
  return column
}

function dispenseValve(root: Group, m: CargoMaterials): void {
  const z = RADIUS + 0.012
  const y = BASE + 0.16
  box(root, m.graphiteEdge, [0.17, 0.19, 0.05], [0, y, z], { chamfer: 0.04, fillet: 0.014, bevel: 0.011 })
  root.add(cylinder(m.ink, 0.055, 0.07, [0, y, z + 0.045], AXIS_Z, 12))
  root.add(cylinder(m.orangePaint, 0.042, 0.045, [0, y, z + 0.08], AXIS_Z, 6))
  root.add(cylinder(m.steel, 0.014, 0.06, [0, y, z + 0.1], AXIS_Z, 8))
  root.add(cylinder(m.steel, 0.02, 0.1, [0, y - 0.09, z + 0.05], AXIS_Y, 8))
}

function build(): { root: Group; column: Group; sockets: FuelDrumSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(54_000, { condition: 0.6 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_FUEL-DRUM_ROOT_CHARGED'

  // Bunded base: a shallow catch tray with a lip, the detail that says this drum
  // holds something that must not reach the deck.
  box(root, m.graphite, [RADIUS * 2.1, BASE, RADIUS * 2.1], [0, BASE * 0.5, 0], {
    chamfer: RADIUS * 0.42, fillet: 0.03, bevel: 0.016, capChamfer: 0.03,
  })
  root.add(cylinder(m.ink, RADIUS + 0.03, 0.035, [0, BASE + 0.01, 0], AXIS_Y, 20))
  for (let index = 0; index < 4; index += 1) {
    const angle = (Math.PI / 2) * index + Math.PI / 4
    box(root, m.amberPaint, [0.16, 0.05, 0.09], [
      Math.cos(angle) * (RADIUS + 0.03), 0.025, Math.sin(angle) * (RADIUS + 0.03),
    ], { chamfer: 0.02, fillet: 0.008, bevel: 0.007, rotation: [0, -angle, 0] })
  }

  drum(root, m, RADIUS, BODY, [0, BASE, 0], { hoops: [0.34, 0.68], chime: 0.026 })

  // Crown: a recessed deck with a hex fill cap and two lift lugs.
  const crown = BASE + BODY
  root.add(cylinder(m.graphite, RADIUS - 0.02, 0.05, [0, crown - 0.005, 0], AXIS_Y, 20))
  root.add(cylinder(m.ink, RADIUS - 0.09, 0.045, [0, crown + 0.012, 0], AXIS_Y, 18))
  root.add(extrudeProfile(m.orangePaint, hexagon(0.085), 0.055, [0, crown + 0.04, 0], {
    fillet: 0.012, bevel: 0.008, rotation: [Math.PI / 2, 0, 0],
  }))
  root.add(cylinder(m.steel, 0.03, 0.06, [0, crown + 0.06, 0], AXIS_Y, 8))
  for (const sx of [-1, 1]) {
    box(root, m.steel, [0.11, 0.045, 0.05], [sx * (RADIUS - 0.11), crown + 0.028, 0.12], {
      chamfer: 0.016, fillet: 0.006, bevel: 0.005,
    })
    root.add(cylinder(m.ink, 0.018, 0.055, [sx * (RADIUS - 0.11), crown + 0.04, 0.12], AXIS_Y, 8))
  }
  // Carry lugs: a bracket and a bar running around the drum, not a pin poking
  // out of it. A radial rod on a cylinder reads as damage, never as a handle.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(root, m.graphiteEdge, [0.05, 0.09, 0.045], [sx * (RADIUS + 0.012), crown - 0.17, sz * 0.09], {
        chamfer: 0.016, fillet: 0.006, bevel: 0.005,
      })
    }
    root.add(cylinder(m.steel, 0.014, 0.2, [sx * (RADIUS + 0.032), crown - 0.2, 0], AXIS_Z, 8))
  }

  // Vertical panel seams: three welded strakes, the drum's only large-scale
  // relief and what keeps the flank from reading as a blank cylinder.
  for (let index = 0; index < 3; index += 1) {
    const angle = 0.55 + index * 1.15
    box(root, m.shellShade, [0.035, BODY - 0.24, 0.02], [
      Math.sin(angle) * (RADIUS + 0.005), BASE + BODY * 0.5, Math.cos(angle) * (RADIUS + 0.005),
    ], { chamfer: 0.01, fillet: 0.004, bevel: 0.004, rotation: [0, angle, 0] })
  }

  const column = gaugeColumn(root, m)
  dispenseValve(root, m)

  // Identity: an orange fluid mark on the flank opposite the gauge, plus the
  // manifest plaque where a forklift driver reads it.
  paintMark(root, m.orangePaint, slashProfile(0.11, 0.4, 0.4), [-0.1, BASE + BODY * 0.5, -RADIUS - 0.004], 'back', 0.012)
  paintMark(root, m.orangePaint, slashProfile(0.055, 0.4, 0.4), [0.04, BASE + BODY * 0.5, -RADIUS - 0.004], 'back', 0.012)
  const label = addLabelDecal(bundle, { variant: 5 })
  plaque(root, m, label, [0.26, 0.12], [RADIUS * 0.72, BASE + BODY * 0.52, RADIUS * 0.72], 'front', m.shellLight)
  statusLens(root, m, [0.06, 0.024], [-RADIUS * 0.72, BASE + BODY * 0.72, RADIUS * 0.72], m.amber, 'front')

  const sockets: FuelDrumSockets = {
    fill_cap: socket('fill_cap', [0, BASE + BODY + 0.09, 0]),
    dispense: socket('dispense', [0, BASE + 0.16, RADIUS + 0.14]),
    gauge: socket('gauge', [0, BASE + BODY * 0.56, RADIUS + 0.09]),
    stack_top: socket('stack_top', [0, BASE + BODY + 0.05, 0]),
  }
  return { root, column, sockets, bundle }
}

export function createModel(): FuelDrumController {
  const { root, column, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'fuel-drum',
    reach: 0.14,
    sockets: Object.values(sockets),
  })

  let state: FuelDrumState = 'charged'
  let elapsed = 0
  const applyState = (next: FuelDrumState): FuelDrumState => {
    state = next
    const live = state === 'charged'
    bundle.materials.amber.emissiveIntensity = live ? 2.1 : 0
    root.name = live ? 'AXR_CARGO_FUEL-DRUM_ROOT_CHARGED' : 'AXR_CARGO_FUEL-DRUM_ROOT_EMPTY'
    column.name = live
      ? 'AXR_CARGO_FUEL-DRUM_PART_GAUGE_ACTIVE'
      : 'AXR_CARGO_FUEL-DRUM_PART_GAUGE_EMPTY'
    return state
  }

  applyState('charged')
  return {
    root,
    sockets,
    get state() {
      return state
    },
    setState: applyState,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      if (state === 'charged') bundle.materials.amber.emissiveIntensity = 2.0 + Math.sin(elapsed * 1.8) * 0.25
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: FuelDrumState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'charged')
  return createCargoPreview(model, {
    target: [0, (BASE + BODY) * 0.52, 0],
    distance: 2.55,
    yaw: 0.42,
    pitch: 0.28,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createEmptyPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'empty' })
