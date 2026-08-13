import { Group, Object3D } from 'three/webgpu'

import { cylinder, extrudeProfile, type Vec2 } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_Y,
  AXIS_Z,
  acquireCargoMaterials,
  addLabelDecal,
  bolt,
  box,
  createCargoPreview,
  finishModel,
  member,
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
 * Axiom Relay bulk silo — a legged hopper silo with a discharge head.
 *
 * A silo is a cone hung in the air, and everything about it follows from that:
 * four braced legs tall enough for a vehicle to back under, a conical hopper, a
 * slide gate and discharge chute at the apex, and a filling line climbing one
 * leg to the roof. Sit the same cylinder on the ground and it is a tank.
 *
 * The cone is a real lofted taper rather than a stack of shrinking cylinders,
 * so its silhouette is one straight edge from shoulder to apex.
 */

const RADIUS = 1.05
const BARREL = 2.4
const CONE = 1.15
const LEG = 2.2
const LEG_R = 0.85
/** Hopper outlet radius, and so the radius the cone tapers from. */
const APEX_R = 0.2
/**
 * Where the hopper's flank passes the legs' own radius, plus a bite into it.
 *
 * The legs used to stop at the apex height, which is the *narrow* end of the
 * cone: at their 0.85 they were 879 mm below the surface they were supposed to
 * carry, and the whole silo stood on nothing.
 */
const LEG_TOP = LEG + ((LEG_R - APEX_R) / (RADIUS - APEX_R)) * CONE + 0.14
/** Facet count of the barrel, which its graphics measure from. */
const SIDES = 22
const FACET = (Math.PI * 2) / SIDES

interface SiloSockets {
  fill_head: Object3D
  discharge: Object3D
  gate_control: Object3D
  ladder_base: Object3D
}

export type SiloState = 'closed' | 'discharging'

export interface SiloController {
  root: Group
  parts: { body: Group; gate: Group }
  sockets: SiloSockets
  readonly state: SiloState
  setState(state: SiloState): SiloState
  update(deltaSeconds: number): void
  dispose(): void
}

/** Cone as a revolved trapezoid: one straight edge, cheap and correct. */
function cone(root: Group, m: CargoMaterials, top: number): void {
  const sides = 20
  for (let index = 0; index < sides; index += 1) {
    const angle = (Math.PI * 2 * index) / sides
    const midR = (RADIUS + APEX_R) * 0.5
    const slant = Math.hypot(CONE, RADIUS - APEX_R)
    const panel: Vec2[] = [
      [-(Math.PI * 2 * RADIUS) / sides * 0.52, slant * 0.5],
      [(Math.PI * 2 * RADIUS) / sides * 0.52, slant * 0.5],
      [(Math.PI * 2 * APEX_R) / sides * 0.6, -slant * 0.5],
      [-(Math.PI * 2 * APEX_R) / sides * 0.6, -slant * 0.5],
    ]
    const mesh = extrudeProfile(m.shellShade, panel, 0.05, [
      Math.sin(angle) * midR, top - CONE * 0.5, Math.cos(angle) * midR,
    ], { fillet: 0.012, bevel: 0.01 })
    mesh.rotation.set(0, angle, 0)
    mesh.rotateX(Math.atan2(RADIUS - APEX_R, CONE))
    root.add(mesh)
  }
}

function build(): {
  root: Group
  body: Group
  gate: Group
  sockets: SiloSockets
  bundle: CargoMaterialBundle
} {
  const bundle = acquireCargoMaterials(60_400, { condition: 0.72 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_INDUSTRIAL_SILO_ROOT_CLOSED'
  const body = new Group()
  body.name = 'AXR_INDUSTRIAL_SILO_PART_BODY_DEFAULT'
  const gate = new Group()
  gate.name = 'AXR_INDUSTRIAL_SILO_PART_GATE_CLOSED'
  root.add(body, gate)

  // Legs: four tubes on pad footings with a ring of cross bracing.
  for (let index = 0; index < 4; index += 1) {
    const angle = (Math.PI / 2) * index + Math.PI / 4
    const x = Math.sin(angle) * LEG_R
    const z = Math.cos(angle) * LEG_R
    // The tube starts inside its own pad rather than level with its underside,
    // which is two down-facing planes on one plane.
    body.add(cylinder(m.graphite, 0.09, LEG_TOP - 0.02, [x, (LEG_TOP + 0.02) * 0.5, z], AXIS_Y, 10))
    box(body, m.graphite, [0.3, 0.06, 0.3], [x, 0.03, z], { chamfer: 0.07, fillet: 0.024, bevel: 0.01, rotation: [0, angle, 0] })
    for (const dx of [-1, 1]) bolt(body, m.steel, [x + Math.cos(angle) * dx * 0.1, 0.06, z - Math.sin(angle) * dx * 0.1], 0.02, 'top')
    const next = angle + Math.PI / 2
    const nx = Math.sin(next) * LEG_R
    const nz = Math.cos(next) * LEG_R
    const span = Math.hypot(nx - x, nz - z)
    for (const [lift, tilt] of [[LEG_TOP * 0.36, 0.34], [LEG_TOP * 0.7, -0.34]] as const) {
      box(body, m.shellShade, [span, 0.05, 0.05], [(x + nx) * 0.5, lift, (z + nz) * 0.5], {
        chamfer: 0.014, fillet: 0.005, bevel: 0.005,
        rotation: [0, Math.atan2(-(nz - z), nx - x), tilt],
      })
    }
  }

  const shoulder = LEG + CONE
  cone(body, m, shoulder)
  body.add(cylinder(m.shell, RADIUS, BARREL, [0, shoulder + BARREL * 0.5, 0], AXIS_Y, SIDES))
  body.add(cylinder(m.graphiteEdge, RADIUS + 0.03, 0.1, [0, shoulder + 0.02, 0], AXIS_Y, SIDES))
  for (const fraction of [0.32, 0.66]) {
    body.add(cylinder(m.shellShade, RADIUS + 0.012, 0.05, [0, shoulder + BARREL * fraction, 0], AXIS_Y, SIDES))
  }
  // Roof: a shallow cap, a fill head, and a dust filter drum.
  body.add(cylinder(m.shellLight, RADIUS - 0.08, 0.16, [0, shoulder + BARREL + 0.06, 0], AXIS_Y, SIDES))
  body.add(cylinder(m.graphite, 0.24, 0.2, [0.32, shoulder + BARREL + 0.22, 0], AXIS_Y, 12))
  body.add(cylinder(m.amberPaint, 0.13, 0.07, [0.32, shoulder + BARREL + 0.35, 0], AXIS_Y, 10))
  body.add(cylinder(m.shellShade, 0.3, 0.44, [-0.4, shoulder + BARREL + 0.32, -0.1], AXIS_Y, 14))
  body.add(cylinder(m.graphiteEdge, 0.33, 0.06, [-0.4, shoulder + BARREL + 0.54, -0.1], AXIS_Y, 14))

  // Fill line climbing the +X leg to the roof head.
  const lineX = Math.sin(Math.PI / 4) * LEG_R + 0.16
  const lineZ = Math.cos(Math.PI / 4) * LEG_R + 0.16
  body.add(cylinder(m.steel, 0.075, shoulder + BARREL, [lineX, (shoulder + BARREL) * 0.5, lineZ], AXIS_Y, 10))
  body.add(cylinder(m.steel, 0.075, 0.8, [lineX * 0.5, shoulder + BARREL + 0.14, lineZ * 0.5], [0.9, -0.78, 0], 10))
  for (let index = 0; index < 4; index += 1) {
    const y = 0.6 + index * 1.1
    box(body, m.graphiteEdge, [0.13, 0.07, 0.13], [lineX, y, lineZ], {
      chamfer: 0.024, fillet: 0.009, bevel: 0.008,
    })
    // Above the shoulder the line is already bedded in the barrel; below it the
    // nearest structure is the leg, 130 mm inboard, so the clamp needs a
    // stand-off to grip. Three of the four were collars around open air.
    if (y > LEG_TOP) continue
    member(body, m.steel, [
      Math.sin(Math.PI / 4) * (LEG_R - 0.04), y, Math.cos(Math.PI / 4) * (LEG_R - 0.04),
    ], [lineX, y, lineZ], 0.05, 0.05)
  }

  // Discharge head under the cone: gate frame, chute, and controls. The blade
  // rides under the frame and the chute mouth hangs off the blade, so all three
  // read as separate parts - built on one centre the blade was a 35 mm plate
  // inside a 140 mm casting and never appeared.
  const apex = LEG
  const gateY = apex - 0.11
  body.add(cylinder(m.graphite, 0.24, 0.14, [0, apex + 0.07, 0], AXIS_Y, 12))
  box(body, m.graphiteEdge, [0.56, 0.14, 0.44], [0, apex - 0.03, 0], { chamfer: 0.04, fillet: 0.014, bevel: 0.011 })
  box(body, m.shellShade, [0.42, 0.28, 0.34], [0, gateY - 0.008 - 0.14, 0], {
    chamfer: 0.06, fillet: 0.02, bevel: 0.014, capChamfer: 0.05,
  })
  box(body, m.ink, [0.3, 0.06, 0.24], [0, apex - 0.4, 0], { chamfer: 0.05, fillet: 0.016, bevel: 0.008 })
  box(body, m.graphite, [0.2, 0.36, 0.14], [0.44, apex + 0.1, 0], { chamfer: 0.045, fillet: 0.016, bevel: 0.012 })
  statusLens(body, m, [0.08, 0.04], [0.44, apex + 0.22, 0.07], m.amber, 'front')
  member(body, m.steel, [0.38, apex - 0.03, 0], [0.1, apex - 0.03, 0], 0.04, 0.05)

  // Slide gate: its own assembly, so it can be pulled open.
  gate.position.set(0, gateY, 0)
  box(gate, m.steel, [0.5, 0.035, 0.4], [0, 0, 0], { chamfer: 0.02, fillet: 0.008, bevel: 0.006 })
  box(gate, m.amberPaint, [0.11, 0.055, 0.1], [-0.3, 0.01, 0], { chamfer: 0.022, fillet: 0.008, bevel: 0.007 })
  gate.add(cylinder(m.steel, 0.014, 0.18, [-0.38, 0.01, 0], AXIS_Z, 8))

  // Barrel graphics sit on facet centres, and each stroke is cut to the arc one
  // facet spans. Laid tangent to the nominal radius the chevron stood 25 mm off
  // the flank at its middle and further at its edges.
  const label = addLabelDecal(bundle, { variant: 250 })
  radialPlaque(body, m, label, [0.5, 0.24], RADIUS, shoulder + BARREL * 0.58, 2.5 * FACET, m.ink, SIDES)
  for (const [width, side] of [[0.12, -1], [0.06, 1]] as const) {
    radialMark(body, m.amberPaint, slashProfile(width, 0.44, 0.42), RADIUS, shoulder + BARREL * 0.3, side * 0.5 * FACET, SIDES)
  }

  const sockets: SiloSockets = {
    fill_head: socket('fill_head', [0.32, shoulder + BARREL + 0.44, 0]),
    discharge: socket('discharge', [0, apex - 0.46, 0]),
    gate_control: socket('gate_control', [0.44, apex + 0.22, 0.16]),
    ladder_base: socket('ladder_base', [lineX, 0.3, lineZ]),
  }
  return { root, body, gate, sockets, bundle }
}

export function createModel(): SiloController {
  const { root, body, gate, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'industrial-silo',
    assemblies: [gate],
    reach: 0.3,
    sockets: Object.values(sockets),
  })

  let state: SiloState = 'closed'
  let blend = 0
  let elapsed = 0
  const applyBlend = (): void => {
    gate.position.x = blend * 0.46
    gate.name = blend > 0.02
      ? 'AXR_INDUSTRIAL_SILO_PART_GATE_OPEN'
      : 'AXR_INDUSTRIAL_SILO_PART_GATE_CLOSED'
  }

  return {
    root,
    parts: { body, gate },
    sockets,
    get state() {
      return state
    },
    setState: (next: SiloState) => {
      state = next
      root.name = next === 'discharging'
        ? 'AXR_INDUSTRIAL_SILO_ROOT_DISCHARGING'
        : 'AXR_INDUSTRIAL_SILO_ROOT_CLOSED'
      blend = next === 'discharging' ? 1 : 0
      applyBlend()
      return state
    },
    update: (deltaSeconds: number) => {
      const step = Math.min(Math.max(deltaSeconds, 0), 0.05)
      elapsed += step
      const target = state === 'discharging' ? 1 : 0
      if (Math.abs(target - blend) > 1e-4) {
        blend += Math.sign(target - blend) * Math.min(Math.abs(target - blend), step * 0.6)
        applyBlend()
      }
      bundle.materials.amber.emissiveIntensity = state === 'discharging'
        ? 1.6 + Math.abs(Math.sin(elapsed * 4.2)) * 1.3
        : 1.9 + Math.sin(elapsed * 1.3) * 0.2
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: SiloState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'closed')
  return createCargoPreview(model, {
    // The fill line and its crown railing stand above the barrel, and framing on
    // 0.46 of the stack at 13.4 m cut 80 mm off the top of that pipework. The
    // prop's visible top is well above its structural mid-height, so the frame
    // is centred above it.
    target: [0, (LEG + CONE + BARREL) * 0.53, 0],
    distance: 13.9,
    yaw: 0.6,
    pitch: 0.2,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createDischargingPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'discharging' })
