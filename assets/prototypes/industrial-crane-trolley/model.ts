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
  hookBlock,
  louvreVent,
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
 * Axiom Relay crane trolley — a rope hoist carriage on its own beam section.
 *
 * The trolley is shipped with a stub of the beam it runs on, because a carriage
 * with nothing to grip reads as a machine that fell off something. Its wheels
 * clamp the bottom flange, the drum is across the travel direction, and two rope
 * falls run from the drum through the sheave block to a dead-end anchor - which
 * is what makes the hook block hang plumb under the drum's centre.
 *
 * Two falls, not one. A single rope makes the block spin, and the reeving is the
 * detail that separates a crane trolley from a winch on wheels.
 */

const BEAM = 3.0
const BEAM_H = 0.42
const FLANGE = 0.36
const DECK = 0.16
const DROP = 1.1

interface TrolleySockets {
  beam_start: Object3D
  beam_end: Object3D
  hook: Object3D
  festoon: Object3D
}

export type TrolleyState = 'parked' | 'hoisting'

export interface CraneTrolleyController {
  root: Group
  parts: { beam: Group; carriage: Group; load: Group }
  sockets: TrolleySockets
  readonly state: TrolleyState
  setState(state: TrolleyState): TrolleyState
  update(deltaSeconds: number): void
  dispose(): void
}

/** An I-beam stub: two flanges and a web, with a festoon rail alongside. */
function beamBuild(beam: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  for (const sy of [-1, 1]) {
    box(beam, m.graphite, [BEAM, 0.05, FLANGE], [0, sy * (BEAM_H * 0.5 - 0.025), 0], {
      chamfer: 0.018, fillet: 0.007, bevel: 0.007, capChamfer: 0.012,
    })
  }
  box(beam, m.graphiteEdge, [BEAM, BEAM_H - 0.1, 0.05], [0, 0, 0], {
    chamfer: 0.014, fillet: 0.006, bevel: 0.006,
  })
  // Web stiffeners, the rhythm that keeps a long beam from reading as a slab.
  for (let index = 0; index < 7; index += 1) {
    const x = (index / 6 - 0.5) * (BEAM - 0.4)
    for (const sz of [-1, 1]) {
      box(beam, m.shellShade, [0.035, BEAM_H - 0.12, 0.09], [x, 0, sz * 0.06], {
        chamfer: 0.012, fillet: 0.005, bevel: 0.005,
      })
    }
  }
  // Festoon rail and two cable trolleys hanging off it.
  box(beam, m.graphiteEdge, [BEAM, 0.04, 0.04], [0, -BEAM_H * 0.5 + 0.02, FLANGE * 0.5 + 0.06], {
    chamfer: 0.01, fillet: 0.004, bevel: 0.004,
  })
  for (const x of [-0.85, -0.35]) {
    box(beam, m.graphite, [0.08, 0.09, 0.06], [x, -BEAM_H * 0.5 - 0.02, FLANGE * 0.5 + 0.06], {
      chamfer: 0.02, fillet: 0.008, bevel: 0.006,
    })
    beam.add(cylinder(m.rubber, 0.018, 0.24, [x + 0.12, -BEAM_H * 0.5 - 0.12, FLANGE * 0.5 + 0.06], [0, 0, 1.1], 6))
  }
  const stripe = addStripeDecal(bundle, { count: 9, lean: 1 })
  plaque(beam, m, stripe, [BEAM - 0.5, 0.07], [0, BEAM_H * 0.5, 0], 'top', m.ink)
  const label = addLabelDecal(bundle, { variant: 320 })
  plaque(beam, m, label, [0.24, 0.09], [-BEAM * 0.36, 0, FLANGE * 0.5 + 0.005], 'front', m.shellLight)
}

/** The carriage: wheel bogies, drum, gearbox, and sheave block. */
function carriageBuild(carriage: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  const deckY = -BEAM_H * 0.5 - DECK * 0.5
  box(carriage, m.graphite, [0.78, DECK, FLANGE + 0.24], [0, deckY, 0], {
    chamfer: 0.045, fillet: 0.016, bevel: 0.013, capChamfer: 0.03,
  })
  // Side plates rising to the flange, with the running wheels on their inner
  // faces so the carriage visibly grips the beam.
  for (const sz of [-1, 1]) {
    box(carriage, m.shellShade, [0.78, BEAM_H * 0.7, 0.05], [0, -BEAM_H * 0.2, sz * (FLANGE * 0.5 + 0.06)], {
      chamfer: 0.03, fillet: 0.011, bevel: 0.01,
    })
    for (const sx of [-1, 1]) {
      carriage.add(cylinder(m.steel, 0.075, 0.06, [sx * 0.26, -BEAM_H * 0.5 + 0.05, sz * (FLANGE * 0.5 - 0.03)], AXIS_Z, 12))
      carriage.add(cylinder(m.ink, 0.03, 0.08, [sx * 0.26, -BEAM_H * 0.5 + 0.05, sz * (FLANGE * 0.5 - 0.03)], AXIS_Z, 8))
      bolt(carriage, m.steel, [sx * 0.32, -BEAM_H * 0.3, sz * (FLANGE * 0.5 + 0.085)], 0.016, sz > 0 ? 'front' : 'back')
    }
  }

  // Rope drum across the travel direction, with its gearbox and motor.
  const drumY = deckY - 0.16
  carriage.add(cylinder(m.shellShade, 0.13, 0.5, [0.02, drumY, 0], AXIS_Z, 16))
  for (const sz of [-1, 1]) {
    carriage.add(cylinder(m.graphiteEdge, 0.16, 0.04, [0.02, drumY, sz * 0.25], AXIS_Z, 16))
  }
  // Grooving: a run of shallow rings so the drum reads as rope-wound.
  for (let index = 0; index < 9; index += 1) {
    carriage.add(cylinder(m.steel, 0.134, 0.012, [0.02, drumY, -0.2 + index * 0.05], AXIS_Z, 16))
  }
  box(carriage, m.graphite, [0.24, 0.24, 0.2], [-0.32, drumY, 0.12], {
    chamfer: 0.05, fillet: 0.018, bevel: 0.013,
  })
  carriage.add(cylinder(m.shell, 0.11, 0.26, [-0.32, drumY, 0.34], AXIS_Z, 14))
  louvreVent(carriage, m, [0.14, 0.12], [-0.32, drumY, 0.48], 3, 'front')
  statusLens(carriage, m, [0.05, 0.02], [-0.32, drumY + 0.14, 0.24], m.cyan, 'top')
  seam(carriage, m.graphite, 0.18, [0, deckY + DECK * 0.5, 0.1], 'top', 'across', 0.02, 0.012)
  paintMark(carriage, m.amberPaint, slashProfile(0.05, 0.1, 0.45), [0.28, -BEAM_H * 0.2, FLANGE * 0.5 + 0.09], 'front', 0.009)
  const label = addLabelDecal(bundle, { variant: 322 })
  plaque(carriage, m, label, [0.2, 0.07], [-0.1, -BEAM_H * 0.2, FLANGE * 0.5 + 0.086], 'front', m.shellLight)
}

function build(): {
  root: Group
  beam: Group
  carriage: Group
  load: Group
  sockets: TrolleySockets
  bundle: CargoMaterialBundle
} {
  const bundle = acquireCargoMaterials(61_800, { condition: 0.72 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_INDUSTRIAL_CRANE-TROLLEY_ROOT_PARKED'
  const beam = new Group()
  beam.name = 'AXR_INDUSTRIAL_CRANE-TROLLEY_PART_BEAM_DEFAULT'
  const carriage = new Group()
  carriage.name = 'AXR_INDUSTRIAL_CRANE-TROLLEY_PART_CARRIAGE_DEFAULT'
  const load = new Group()
  load.name = 'AXR_INDUSTRIAL_CRANE-TROLLEY_PART_LOAD_LOWERED'
  root.add(beam, carriage, load)

  beamBuild(beam, m, bundle)
  carriageBuild(carriage, m, bundle)

  // Two rope falls from the drum down to the block, and a dead-end anchor.
  const drumY = -BEAM_H * 0.5 - DECK - 0.16
  for (const sz of [-1, 1]) {
    load.add(cylinder(m.steel, 0.016, DROP, [0.02, drumY - DROP * 0.5, sz * 0.085], AXIS_Y, 6))
  }
  hookBlock(load, m, [0.02, drumY - DROP, 0], 0.5)
  box(load, m.graphiteEdge, [0.16, 0.07, 0.24], [0.02, drumY - DROP + 0.06, 0], {
    chamfer: 0.024, fillet: 0.009, bevel: 0.008,
  })

  const sockets: TrolleySockets = {
    beam_start: socket('beam_start', [-BEAM * 0.5, 0, 0]),
    beam_end: socket('beam_end', [BEAM * 0.5, 0, 0]),
    hook: socket('hook', [0.02, drumY - DROP - 0.5, 0]),
    festoon: socket('festoon', [-0.6, -BEAM_H * 0.5 - 0.06, FLANGE * 0.5 + 0.06]),
  }
  return { root, beam, carriage, load, sockets, bundle }
}

export function createModel(): CraneTrolleyController {
  const { root, beam, carriage, load, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'industrial-crane-trolley',
    assemblies: [carriage, load],
    reach: 0.16,
    sockets: Object.values(sockets),
  })

  let state: TrolleyState = 'parked'
  let elapsed = 0
  let travel = 0
  return {
    root,
    parts: { beam, carriage, load },
    sockets,
    get state() {
      return state
    },
    setState: (next: TrolleyState) => {
      state = next
      root.name = next === 'hoisting'
        ? 'AXR_INDUSTRIAL_CRANE-TROLLEY_ROOT_HOISTING'
        : 'AXR_INDUSTRIAL_CRANE-TROLLEY_ROOT_PARKED'
      load.name = next === 'hoisting'
        ? 'AXR_INDUSTRIAL_CRANE-TROLLEY_PART_LOAD_RAISED'
        : 'AXR_INDUSTRIAL_CRANE-TROLLEY_PART_LOAD_LOWERED'
      return state
    },
    update: (deltaSeconds: number) => {
      const step = Math.min(Math.max(deltaSeconds, 0), 0.05)
      elapsed += step
      travel = state === 'hoisting'
        ? Math.min(1, travel + step * 0.3)
        : Math.max(0, travel - step * 0.45)
      const smooth = travel * travel * (3 - 2 * travel)
      load.position.y = smooth * (DROP - 0.24)
      // The carriage also creeps along the beam while hoisting, which is what a
      // trolley is for; parked, it settles back to the middle.
      carriage.position.x = smooth * 0.7
      load.position.x = smooth * 0.7
      bundle.materials.cyan.emissiveIntensity = state === 'hoisting'
        ? 1.7 + Math.abs(Math.sin(elapsed * 5.5)) * 0.9
        : 1.5 + Math.sin(elapsed * 1.3) * 0.2
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: TrolleyState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'parked')
  return createCargoPreview(model, {
    target: [0, -0.9, 0],
    distance: 6.2,
    yaw: 0.72,
    pitch: 0.16,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createHoistingPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'hoisting' })
