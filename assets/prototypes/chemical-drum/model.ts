import { Group, Object3D } from 'three/webgpu'

import { cylinder, extrudeProfile } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_Y,
  AXIS_Z,
  acquireCargoMaterials,
  addStripeDecal,
  bolt,
  box,
  createCargoPreview,
  drum,
  finishModel,
  hexagon,
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
 * Axiom Relay chemical drum.
 *
 * Same shell family as the fuel drum, opposite story. It carries no dispense
 * valve at all - a sealed chemical is transferred by pump through the crown, not
 * tapped from the side - and it is the only prop in the wave with a critical-red
 * band, because a leaking one is an evacuation and everything about its dressing
 * has to say so before anybody gets close enough to read a plaque.
 */

const RADIUS = 0.34
const BODY = 0.88
const BASE = 0.06

interface ChemicalDrumSockets {
  crown_port: Object3D
  sample_port: Object3D
  stack_top: Object3D
  fx_status: Object3D
}

export type ChemicalDrumState = 'sealed' | 'breached'

export interface ChemicalDrumController {
  root: Group
  sockets: ChemicalDrumSockets
  readonly state: ChemicalDrumState
  setState(state: ChemicalDrumState): ChemicalDrumState
  update(deltaSeconds: number): void
  dispose(): void
}

function build(): { root: Group; sockets: ChemicalDrumSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(54_200, { condition: 0.7 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_CHEMICAL-DRUM_ROOT_SEALED'

  // A skid ring rather than a bund: this drum is palletised in groups, so it
  // needs a foot that clears a strap, not a tray of its own.
  root.add(cylinder(m.graphite, RADIUS + 0.02, BASE, [0, BASE * 0.5, 0], AXIS_Y, 20))
  root.add(cylinder(m.rubber, RADIUS - 0.02, 0.02, [0, 0.01, 0], AXIS_Y, 18))

  drum(root, m, RADIUS, BODY, [0, BASE, 0], {
    hoops: [0.3, 0.58, 0.84],
    chime: 0.024,
    band: m.ironOxide,
  })

  // Hazard band around the waist. Four seated plaques rather than one wrap, so
  // the graphic never has to stretch around a curve it was not drawn for.
  for (let index = 0; index < 4; index += 1) {
    const angle = (Math.PI / 2) * index + Math.PI / 4
    const stripe = addStripeDecal(bundle, { count: 4, lean: 1, bar: 0xeb514e })
    radialPlaque(root, m, stripe, [0.28, 0.09], RADIUS, BASE + BODY * 0.46, angle)
  }

  // Crown: bolted lid ring, one large pump port, one small sample port.
  const crown = BASE + BODY
  root.add(cylinder(m.ironOxide, RADIUS + 0.01, 0.055, [0, crown - 0.005, 0], AXIS_Y, 20))
  root.add(cylinder(m.graphite, RADIUS - 0.06, 0.05, [0, crown + 0.014, 0], AXIS_Y, 18))
  for (let index = 0; index < 8; index += 1) {
    const angle = (Math.PI / 4) * index
    bolt(root, m.steel, [Math.sin(angle) * (RADIUS - 0.03), crown + 0.024, Math.cos(angle) * (RADIUS - 0.03)], 0.017, 'top')
  }
  root.add(extrudeProfile(m.redPaint, hexagon(0.09), 0.06, [0, crown + 0.052, 0.05], {
    fillet: 0.012, bevel: 0.008, rotation: [Math.PI / 2, 0, 0],
  }))
  root.add(cylinder(m.ink, 0.045, 0.07, [0, crown + 0.075, 0.05], AXIS_Y, 10))
  root.add(cylinder(m.steel, 0.032, 0.05, [0, crown + 0.045, -0.16], AXIS_Y, 8))
  root.add(cylinder(m.amberPaint, 0.02, 0.045, [0, crown + 0.065, -0.16], AXIS_Y, 6))

  // Contents monitor: a small sealed bezel that has to be checked, not operated.
  box(root, m.graphite, [0.15, 0.13, 0.045], [0, BASE + BODY * 0.74, RADIUS + 0.012], {
    chamfer: 0.035, fillet: 0.012, bevel: 0.01,
  })
  statusLens(root, m, [0.07, 0.05], [0, BASE + BODY * 0.74, RADIUS + 0.034], m.amber, 'front')
  root.add(cylinder(m.steel, 0.012, 0.05, [0, BASE + BODY * 0.66, RADIUS + 0.03], AXIS_Z, 8))

  paintMark(root, m.redPaint, slashProfile(0.09, 0.3, 0.42), [-0.07, BASE + BODY * 0.2, RADIUS + 0.002], 'front', 0.011)
  paintMark(root, m.redPaint, slashProfile(0.045, 0.3, 0.42), [0.05, BASE + BODY * 0.2, RADIUS + 0.002], 'front', 0.011)

  const sockets: ChemicalDrumSockets = {
    crown_port: socket('crown_port', [0, crown + 0.13, 0.05]),
    sample_port: socket('sample_port', [0, crown + 0.1, -0.16]),
    stack_top: socket('stack_top', [0, crown + 0.05, 0]),
    fx_status: socket('fx_status', [0, BASE + BODY * 0.74, RADIUS + 0.07]),
  }
  return { root, sockets, bundle }
}

export function createModel(): ChemicalDrumController {
  const { root, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'chemical-drum',
    reach: 0.13,
    sockets: Object.values(sockets),
  })

  let state: ChemicalDrumState = 'sealed'
  let elapsed = 0
  const applyState = (next: ChemicalDrumState): ChemicalDrumState => {
    state = next
    root.name = next === 'breached'
      ? 'AXR_CARGO_CHEMICAL-DRUM_ROOT_BREACHED'
      : 'AXR_CARGO_CHEMICAL-DRUM_ROOT_SEALED'
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
      // A breached drum alarms fast; a sealed one just idles.
      const rate = state === 'breached' ? 7.5 : 1.6
      const floor = state === 'breached' ? 1.5 : 1.9
      bundle.materials.amber.emissiveIntensity = floor + Math.abs(Math.sin(elapsed * rate)) * 1.1
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: ChemicalDrumState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'sealed')
  return createCargoPreview(model, {
    target: [0, (BASE + BODY) * 0.52, 0],
    distance: 2.5,
    yaw: 0.38,
    pitch: 0.29,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createBreachedPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'breached' })
