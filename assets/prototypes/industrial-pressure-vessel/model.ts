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
  facetRadius,
  finishModel,
  member,
  nozzle,
  radialMark,
  radialPlaque,
  slashProfile,
  socket,
  statusLens,
  type CargoMaterialBundle,
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
/** Facet counts of the shell and of the skirt under it. */
const SIDES = 22
const SKIRT_SIDES = 20
const FACET = (Math.PI * 2) / SIDES
/** The chords the two bodies render as, which is what anything applied seats on. */
const SKIN = facetRadius(RADIUS, SIDES)
const SKIRT_SKIN = facetRadius(RADIUS + 0.05, SKIRT_SIDES)

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

function build(): { root: Group; sockets: VesselSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(60_600, { condition: 0.6 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_INDUSTRIAL_PRESSURE-VESSEL_ROOT_PRESSURISED'

  // Skirt support with two access covers and a base ring. The skirt starts
  // inside the base ring rather than sharing its underside, which is two
  // down-facing planes on the same plane.
  root.add(cylinder(m.graphite, RADIUS + 0.05, SKIRT - 0.02, [0, (SKIRT + 0.02) * 0.5, 0], AXIS_Y, SKIRT_SIDES))
  root.add(cylinder(m.graphiteEdge, RADIUS + 0.16, 0.07, [0, 0.035, 0], AXIS_Y, SKIRT_SIDES))
  root.add(cylinder(m.graphiteEdge, RADIUS + 0.09, 0.06, [0, SKIRT - 0.03, 0], AXIS_Y, SKIRT_SIDES))
  // Covers, not openings: a 300 mm block dropped on a solid skirt stands 109 mm
  // out of it and reads as a lump, not a recess. A plate seated so its own
  // corners bite the curve reads as a bolted inspection hatch, which is what a
  // skirt actually has. They move off +Z, where the drain comes through.
  const coverStand = Math.sqrt(SKIRT_SKIN ** 2 - 0.16 ** 2) - 0.004 + 0.02
  for (const sign of [1, -1]) {
    box(root, m.ink, [0.32, 0.34, 0.04], [sign * coverStand, SKIRT * 0.5 - 0.04, 0], {
      chamfer: 0.06, fillet: 0.02, bevel: 0.01, rotation: [0, Math.PI / 2, 0],
    })
  }
  for (let index = 0; index < 8; index += 1) {
    const angle = (Math.PI / 4) * index
    bolt(root, m.steel, [Math.sin(angle) * (RADIUS + 0.11), 0.07, Math.cos(angle) * (RADIUS + 0.11)], 0.022, 'top')
  }

  // Shell with heavy girth welds; the dished ends are stepped discs.
  root.add(cylinder(m.shell, RADIUS, BARREL, [0, SKIRT + BARREL * 0.5, 0], AXIS_Y, SIDES))
  for (const fraction of [0.3, 0.7]) {
    root.add(cylinder(m.shellShade, RADIUS + 0.018, 0.07, [0, SKIRT + BARREL * fraction, 0], AXIS_Y, SIDES))
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
    bolt(root, m.steel, [Math.sin(angle) * 0.3, crown + 0.0375, Math.cos(angle) * 0.3], 0.018, 'top')
  }

  // Relief valve and vent riser: the hero mass. The riser leans back over the
  // shell towards its cap; raked the other way it left its own foot 280 mm from
  // the valve stub and its head 290 mm from the cap it should carry.
  box(root, m.shellShade, [0.26, 0.34, 0.26], [0.36, crown + 0.2, 0], {
    chamfer: 0.07, fillet: 0.024, bevel: 0.014, capChamfer: 0.05,
  })
  root.add(cylinder(m.redPaint, 0.11, 0.12, [0.36, crown + 0.42, 0], AXIS_Y, 10))
  root.add(cylinder(m.steel, 0.05, 0.16, [0.36, crown + 0.54, 0], AXIS_Y, 8))
  root.add(cylinder(m.steel, 0.07, 0.9, [0.36, crown + 0.9, -0.18], [-0.34, 0, 0], 10))
  root.add(cylinder(m.ink, 0.095, 0.09, [0.36, crown + 1.32, -0.32], AXIS_Y, 10))
  nozzle(root, m, [0.36, crown + 0.03, 0], AXIS_Y, 0.075, 0.14)

  // Process nozzles on the flanks and a drain at the skirt. A branch is stood
  // off so that half its neck is inside the shell: measured from the nominal
  // radius each one stopped a few millimetres short of the facet it grows from.
  const branch = (reach: number, skin: number): number => skin - 0.03 + reach * 0.5
  const flank = branch(0.34, SKIN)
  nozzle(root, m, [0, SKIRT + BARREL * 0.74, flank], AXIS_Z, 0.09, 0.34)
  nozzle(root, m, [0, SKIRT + BARREL * 0.24, -flank], AXIS_Z, 0.09, 0.34)
  nozzle(root, m, [branch(0.3, SKIN), SKIRT + BARREL * 0.5, 0], AXIS_X, 0.06, 0.3)
  const drain = branch(0.34, Math.sqrt(SKIRT_SKIN ** 2 - 0.055 ** 2))
  root.add(cylinder(m.steel, 0.055, 0.34, [0, SKIRT * 0.5, drain], AXIS_Z, 10))
  root.add(cylinder(m.orangePaint, 0.075, 0.055, [0, SKIRT * 0.5, drain + 0.1775], AXIS_Z, 6))

  // Instrument bridle: two lenses on a bracket stood off the shell on stubs.
  // The bracket is 220 mm across, so it is centred on the meridian it faces -
  // parked off to one side its far edge left the curve, and the lenses were
  // bezelled onto its 80 mm edge and overhung it by 30 mm each side.
  const bridleX = -(RADIUS + 0.1)
  box(root, m.graphite, [0.09, 0.42, 0.22], [bridleX, SKIRT + BARREL * 0.56, 0], {
    chamfer: 0.04, fillet: 0.014, bevel: 0.011,
  })
  statusLens(root, m, [0.09, 0.09], [bridleX - 0.045, SKIRT + BARREL * 0.62, 0], m.cyan, 'left')
  statusLens(root, m, [0.06, 0.035], [bridleX - 0.045, SKIRT + BARREL * 0.5, 0], m.amber, 'left')
  for (const fraction of [0.48, 0.64]) {
    member(root, m.steel, [bridleX + 0.045, SKIRT + BARREL * fraction, 0], [-(SKIN - 0.05), SKIRT + BARREL * fraction, 0], 0.03, 0.03)
  }

  // Graphics on facet centres, with the strokes cut to the arc one facet spans.
  const label = addLabelDecal(bundle, { variant: 260 })
  radialPlaque(root, m, label, [0.42, 0.2], RADIUS, SKIRT + BARREL * 0.5, 2.5 * FACET, m.ink, SIDES)
  const stripe = addStripeDecal(bundle, { count: 5, lean: 1, bar: 0xeb514e })
  radialPlaque(root, m, stripe, [0.34, 0.08], RADIUS + 0.05, SKIRT * 0.72, -1.5 * (Math.PI * 2) / SKIRT_SIDES, m.ink, SKIRT_SIDES)
  for (const [width, side] of [[0.075, -1], [0.038, 1]] as const) {
    radialMark(root, m.redPaint, slashProfile(width, 0.25, 0.42), RADIUS, SKIRT + BARREL * 0.86, side * 0.5 * FACET, SIDES, 0.012)
  }

  const sockets: VesselSockets = {
    crown_flange: socket('crown_flange', [0, crown + 0.12, 0]),
    relief_vent: socket('relief_vent', [0.36, crown + 1.4, -0.32]),
    process_inlet: socket('process_inlet', [0, SKIRT + BARREL * 0.74, flank + 0.18]),
    drain: socket('drain', [0, SKIRT * 0.5, drain + 0.26]),
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
