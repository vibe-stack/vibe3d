import { Group, Object3D } from 'three/webgpu'

import { cylinder, extrudeProfile } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_Y,
  AXIS_Z,
  FACE_CLEARANCE,
  acquireCargoMaterials,
  addLabelDecal,
  bolt,
  box,
  createCargoPreview,
  drum,
  finishModel,
  hexagon,
  radialFitting,
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
const HOOPS = [0.34, 0.68]

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
  // Corner bumpers on the tray's four chamfers. The tray is what stands on the
  // deck, so a bumper beds a face clearance up inside it; drawn flush the four
  // of them laid a second sole on the tray's own.
  for (let index = 0; index < 4; index += 1) {
    const angle = (Math.PI / 2) * index + Math.PI / 4
    box(root, m.amberPaint, [0.16, 0.05, 0.09], [
      Math.cos(angle) * (RADIUS + 0.03), FACE_CLEARANCE + 0.025, Math.sin(angle) * (RADIUS + 0.03),
    ], { chamfer: 0.02, fillet: 0.008, bevel: 0.007, rotation: [0, -angle, 0] })
  }

  const shell = drum(root, m, RADIUS, BODY, [0, BASE, 0], { hoops: HOOPS, chime: 0.026 })
  // The two rolling hoops stand 21 mm proud of the flank, so the band between
  // them is the only height a graphic can be seated at without being swallowed.
  const fieldFoot = BASE + BODY * HOOPS[0] + 0.026
  const fieldHead = BASE + BODY * HOOPS[1] - 0.026
  const fieldY = (fieldFoot + fieldHead) * 0.5

  // Crown: a recessed deck with a hex fill cap and two lift lugs.
  const crown = BASE + BODY
  root.add(cylinder(m.graphite, RADIUS - 0.02, 0.05, [0, crown - 0.005, 0], AXIS_Y, 20))
  root.add(cylinder(m.ink, RADIUS - 0.09, 0.045, [0, crown + 0.012, 0], AXIS_Y, 18))
  root.add(extrudeProfile(m.orangePaint, hexagon(0.085), 0.055, [0, crown + 0.04, 0], {
    fillet: 0.012, bevel: 0.008, rotation: [Math.PI / 2, 0, 0],
  }))
  root.add(cylinder(m.steel, 0.03, 0.06, [0, crown + 0.06, 0], AXIS_Y, 8))
  // The lugs flank the fill cap, so they belong on the crown's axis. Mirrored in
  // x but given the same z, the pair sat 120 mm off the cap it is paired with.
  for (const sx of [-1, 1]) {
    box(root, m.steel, [0.11, 0.045, 0.05], [sx * (RADIUS - 0.11), crown + 0.028, 0], {
      chamfer: 0.016, fillet: 0.006, bevel: 0.005,
    })
    root.add(cylinder(m.ink, 0.018, 0.055, [sx * (RADIUS - 0.11), crown + 0.04, 0], AXIS_Y, 8))
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
  // relief and what keeps the flank from reading as a blank cylinder. Measured
  // off the chord the shell renders rather than off the nominal radius, where
  // the strake's back cap lands 0.3 mm outside the skin and the two trade places
  // from frame to frame.
  for (let index = 0; index < 3; index += 1) {
    const angle = 0.55 + index * 1.15
    box(root, m.shellShade, [0.035, BODY - 0.24, 0.02], [
      Math.sin(angle) * (shell.radius + 0.012), BASE + BODY * 0.5, Math.cos(angle) * (shell.radius + 0.012),
    ], { chamfer: 0.01, fillet: 0.004, bevel: 0.004, rotation: [0, angle, 0] })
  }

  const column = gaugeColumn(root, m)
  dispenseValve(root, m)

  // Identity: an orange fluid mark on the flank opposite the gauge, plus the
  // manifest plaque where a forklift driver reads it. All three are placed by
  // angle around the shell rather than at a corner like [r*0.72, y, r*0.72],
  // which is a flat card stood at 45 degrees to a curve - buried at one end and
  // clear of the silhouette at the other. The pair of slashes is set between two
  // strakes for the same reason the plaque is: a strake is prouder than paint.
  const stroke = (fieldHead - fieldFoot) - 0.03
  radialMark(root, m.orangePaint, slashProfile(0.06, stroke, 0.22), RADIUS, fieldY, Math.PI + 0.4, 20, 0.016)
  radialMark(root, m.orangePaint, slashProfile(0.042, stroke, 0.22), RADIUS, fieldY, Math.PI + 0.1, 20, 0.016)
  const label = addLabelDecal(bundle, { variant: 5 })
  radialPlaque(root, m, label, [0.1, 0.07], RADIUS, fieldY, 1.1, m.shellLight)
  const lamp = radialFitting(RADIUS, BASE + BODY * 0.8, -Math.PI / 4)
  statusLens(root, m, [0.06, 0.024], lamp.position, m.amber, 'front', 0, lamp.rotation)

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
    // The drum stands on a plinth the camera looks down onto, so more of the
    // prop reads below its mid-height than above it; on 0.52 the plinth's near
    // edge sat exactly on the bottom of the frame.
    target: [0, (BASE + BODY) * 0.45, 0],
    distance: 2.6,
    yaw: 0.42,
    pitch: 0.28,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createEmptyPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'empty' })
