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
 * Axiom Relay electric chain hoist, suspended from a top hook.
 *
 * A hoist is a motor, a gearbox, a chain, and a hook, and the read depends on
 * all four being present and correctly proportioned: the motor is the largest
 * mass, the gear case sits between it and the chain, the load chain hangs dead
 * plumb from a guide, and the slack chain drops into a bag on the other side.
 *
 * The pendant control on its own cable is what tells you the thing is operated
 * from the floor. Without it, the same shape reads as a fixed winch.
 */

const BODY_W = 0.56
const BODY_H = 0.34
const BODY_D = 0.32
const DROP = 0.52

interface HoistSockets {
  top_hook: Object3D
  load_hook: Object3D
  pendant: Object3D
  power_in: Object3D
}

export type HoistState = 'idle' | 'lifting'

export interface HoistController {
  root: Group
  parts: { body: Group; load: Group }
  sockets: HoistSockets
  readonly state: HoistState
  setState(state: HoistState): HoistState
  update(deltaSeconds: number): void
  dispose(): void
}

/** Load chain: alternating links, each rotated a quarter turn from the last. */
function chain(parent: Group, m: CargoMaterials, x: number, top: number, length: number): void {
  const pitch = 0.075
  const stock = 0.026
  // A link is a pitch plus a stock at each jaw, which is what interlocking
  // means. Cut to the pitch itself the neighbours met over 3 mm, the chamfer ate
  // the whole of it, and the run read as a column of loose blocks with daylight
  // between them.
  const link = pitch + stock * 2
  const links = Math.max(2, Math.round(length / pitch))
  for (let index = 0; index < links; index += 1) {
    const y = top - index * pitch
    box(parent, m.steel, [stock, link, 0.05], [x, y, 0], {
      chamfer: 0.011, fillet: 0.005, bevel: 0.004,
      rotation: [0, index % 2 === 0 ? 0 : Math.PI / 2, 0],
    })
  }
}

function bodyBuild(body: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  // Suspension: a top hook on a swivel yoke. Each stage laps the one below it by
  // 30 mm; stacked on top faces the swivel boss stood 45 mm clear of the case
  // and the whole column hung off nothing.
  const bodyTop = BODY_H * 0.5
  body.add(cylinder(m.graphiteEdge, 0.07, 0.09, [0, bodyTop + 0.015, 0], AXIS_Y, 12))
  body.add(cylinder(m.steel, 0.042, 0.14, [0, bodyTop + 0.1, 0], AXIS_Y, 10))
  for (const sz of [-1, 1]) {
    box(body, m.graphiteEdge, [0.07, 0.2, 0.05], [0, bodyTop + 0.23, sz * 0.06], {
      chamfer: 0.02, fillet: 0.008, bevel: 0.006,
    })
  }
  body.add(cylinder(m.steel, 0.026, 0.2, [0, bodyTop + 0.3, 0], AXIS_Z, 10))

  // Gear case in the middle, motor to the left, chain guide to the right.
  const caseFace = BODY_D * 0.5
  box(body, m.shell, [BODY_W * 0.42, BODY_H, BODY_D], [0, 0, 0], {
    chamfer: 0.055, fillet: 0.02, bevel: 0.014, capChamfer: 0.035,
  })
  body.add(cylinder(m.shellShade, BODY_H * 0.52, BODY_W * 0.42, [-BODY_W * 0.42, 0, 0], AXIS_X, 16))
  body.add(cylinder(m.graphiteEdge, BODY_H * 0.55, 0.05, [-BODY_W * 0.22, 0, 0], AXIS_X, 16))
  body.add(cylinder(m.graphite, BODY_H * 0.4, 0.06, [-BODY_W * 0.63, 0, 0], AXIS_X, 14))
  for (let index = 0; index < 9; index += 1) {
    const angle = (Math.PI * 2 * index) / 9
    box(body, m.shellShade, [BODY_W * 0.36, 0.035, 0.03], [
      -BODY_W * 0.42, Math.cos(angle) * BODY_H * 0.53, Math.sin(angle) * BODY_H * 0.53,
    ], { chamfer: 0.008, fillet: 0.004, bevel: 0.003, rotation: [angle, 0, 0] })
  }
  box(body, m.graphite, [BODY_W * 0.3, BODY_H * 0.86, BODY_D * 0.8], [BODY_W * 0.34, 0, 0], {
    chamfer: 0.03, fillet: 0.018, bevel: 0.013,
  })
  // The guide's face is 0.168 wide and its corner clip narrows it further at top
  // and bottom, so the vent and the hazard band below it are both sized off that
  // panel. At the old clip and vent size the surround was wider than the box it
  // was cut into and the band ran off the corner into open air.
  const guideFace = BODY_D * 0.4
  louvreVent(body, m, [BODY_W * 0.15, BODY_H * 0.22], [BODY_W * 0.34, BODY_H * 0.11, guideFace], 3, 'front')
  // The panel line stops short of the manifest plate. Run full height it spent
  // its top 110 mm buried under the plate with only the groove's shoulders
  // showing either side.
  seam(body, m.shell, BODY_H * 0.34, [0, -BODY_H * 0.19, caseFace], 'front', 'along', 0.02, 0.012)

  // Chain sprocket housing and the slack-chain bag.
  box(body, m.graphiteEdge, [0.12, 0.12, 0.14], [BODY_W * 0.16, -BODY_H * 0.5 - 0.03, 0], {
    chamfer: 0.03, fillet: 0.011, bevel: 0.009,
  })
  // The bag hangs 120 mm under the motor on two hanger straps, so the dead end
  // of the chain has somewhere to be seen. Butted straight to the motor case
  // both slack links sat inside the mouth collar and no chain appeared at all.
  const bagMouth = -BODY_H * 0.5 - 0.12
  box(body, m.fabric, [0.2, 0.34, 0.18], [-BODY_W * 0.44, bagMouth - 0.17, 0], {
    chamfer: 0.06, fillet: 0.022, bevel: 0.012,
  })
  box(body, m.graphiteEdge, [0.22, 0.045, 0.2], [-BODY_W * 0.44, bagMouth, 0], {
    chamfer: 0.02, fillet: 0.008, bevel: 0.006,
  })
  for (const sx of [-1, 1]) {
    box(body, m.steel, [0.018, 0.14, 0.016], [-BODY_W * 0.44 + sx * 0.085, bagMouth + 0.06, 0], {
      chamfer: 0.006, fillet: 0.003, bevel: 0.003,
    })
  }
  chain(body, m, -BODY_W * 0.44, -BODY_H * 0.5 - 0.05, 0.12)

  const label = addLabelDecal(bundle, { variant: 310 })
  plaque(body, m, label, [0.18, 0.07], [0, BODY_H * 0.18, caseFace], 'front', m.shellLight)
  // Lamp and slash flank the panel line rather than sharing the centre with it.
  // The slash is sized to the case's cap chamfer: at its old width it hung a
  // third of its own span over the bevel and stood 21 mm off the surface there.
  statusLens(body, m, [0.05, 0.02], [BODY_W * 0.08, -BODY_H * 0.2, caseFace], m.cyan, 'front')
  paintMark(body, m.amberPaint, slashProfile(0.026, 0.07, 0.45), [-BODY_W * 0.09, -BODY_H * 0.2, caseFace], 'front', 0.008)
  const stripe = addStripeDecal(bundle, { count: 4, lean: 1 })
  plaque(body, m, stripe, [0.09, 0.035], [BODY_W * 0.34, -BODY_H * 0.27, guideFace], 'front', m.ink)
  for (const sz of [-1, 1]) bolt(body, m.steel, [0, BODY_H * 0.36, sz * caseFace], 0.014, sz > 0 ? 'front' : 'back')

  // Pendant control on its own cable, hanging beside the hoist. The lead is
  // seated 26 mm up inside the chain guide and 40 mm down inside the pendant
  // shell: stopped on either surface the control reads as a detached box.
  const pendantY = -0.72
  const pendantX = BODY_W * 0.46
  const leadX = BODY_W * 0.38
  const leadTop = -BODY_H * 0.5 + 0.05
  const leadFoot = pendantY + 0.08
  const leadRun = Math.hypot(pendantX - leadX, leadTop - leadFoot)
  body.add(cylinder(m.rubber, 0.013, leadRun, [
    (leadX + pendantX) * 0.5, (leadTop + leadFoot) * 0.5, 0.06,
  ], [0, 0, Math.asin((pendantX - leadX) / leadRun)], 6))
  body.add(cylinder(m.graphiteEdge, 0.026, 0.05, [leadX, -BODY_H * 0.5 + 0.02, 0.06], AXIS_Y, 8))
  box(body, m.shellShade, [0.09, 0.24, 0.06], [pendantX, pendantY, 0.06], {
    chamfer: 0.024, fillet: 0.009, bevel: 0.008, capChamfer: 0.016,
  })
  for (const sy of [-1, 1]) {
    box(body, sy > 0 ? m.amberPaint : m.graphiteEdge, [0.05, 0.05, 0.03], [pendantX, pendantY + sy * 0.05, 0.095], {
      chamfer: 0.012, fillet: 0.005, bevel: 0.004,
    })
  }
  box(body, m.redPaint, [0.04, 0.04, 0.028], [pendantX, pendantY - 0.09, 0.095], {
    chamfer: 0.014, fillet: 0.005, bevel: 0.004,
  })
}

function build(): { root: Group; body: Group; load: Group; sockets: HoistSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(61_600, { condition: 0.7 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_INDUSTRIAL_HOIST_ROOT_IDLE'
  const body = new Group()
  body.name = 'AXR_INDUSTRIAL_HOIST_PART_BODY_DEFAULT'
  const load = new Group()
  load.name = 'AXR_INDUSTRIAL_HOIST_PART_LOAD_IDLE'
  root.add(body, load)

  bodyBuild(body, m, bundle)
  // The load assembly owns the chain and the hook, so raising it is one
  // translation. The block hangs from the chain's last link rather than from a
  // nominal drop, which is what closes the gap the two would otherwise leave.
  const chainTop = -BODY_H * 0.5 - 0.1
  const shacklePin = chainTop - DROP + 0.05
  chain(load, m, BODY_W * 0.16, chainTop, DROP)
  hookBlock(load, m, [BODY_W * 0.16, shacklePin, 0], 0.42)

  const sockets: HoistSockets = {
    // Both lifting anchors are the points the hardware actually bears on: the
    // yoke's cross pin, and the bight of the hook 0.86 of a scale below its
    // shackle. The pair used to sit in clear air above and below the prop.
    top_hook: socket('top_hook', [0, BODY_H * 0.5 + 0.3, 0]),
    load_hook: socket('load_hook', [BODY_W * 0.16, shacklePin - 0.86 * 0.42, 0]),
    pendant: socket('pendant', [BODY_W * 0.46, -0.84, 0.06]),
    power_in: socket('power_in', [-BODY_W * 0.72, 0, 0]),
  }
  return { root, body, load, sockets, bundle }
}

export function createModel(): HoistController {
  const { root, body, load, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'industrial-hoist',
    assemblies: [load],
    reach: 0.1,
    sockets: Object.values(sockets),
  })

  let state: HoistState = 'idle'
  let elapsed = 0
  let travel = 0
  return {
    root,
    parts: { body, load },
    sockets,
    get state() {
      return state
    },
    setState: (next: HoistState) => {
      state = next
      root.name = next === 'lifting'
        ? 'AXR_INDUSTRIAL_HOIST_ROOT_LIFTING'
        : 'AXR_INDUSTRIAL_HOIST_ROOT_IDLE'
      load.name = next === 'lifting'
        ? 'AXR_INDUSTRIAL_HOIST_PART_LOAD_LIFTING'
        : 'AXR_INDUSTRIAL_HOIST_PART_LOAD_IDLE'
      return state
    },
    update: (deltaSeconds: number) => {
      const step = Math.min(Math.max(deltaSeconds, 0), 0.05)
      elapsed += step
      if (state === 'lifting') {
        // A slow raise that eases at both ends and holds at the top.
        travel = Math.min(1, travel + step * 0.28)
      } else {
        travel = Math.max(0, travel - step * 0.4)
      }
      const smooth = travel * travel * (3 - 2 * travel)
      load.position.y = smooth * (DROP - 0.3)
      bundle.materials.cyan.emissiveIntensity = state === 'lifting'
        ? 1.7 + Math.abs(Math.sin(elapsed * 6)) * 0.9
        : 1.5 + Math.sin(elapsed * 1.4) * 0.2
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: HoistState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'idle')
  return createCargoPreview(model, {
    // The prop runs y 0.50 down to -1.23. Framed on -0.5 at three metres the
    // whole suspension yoke fell off the top of every catalogue frame.
    target: [0, -0.38, 0],
    distance: 3.4,
    yaw: 0.7,
    pitch: 0.12,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createLiftingPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'lifting' })
