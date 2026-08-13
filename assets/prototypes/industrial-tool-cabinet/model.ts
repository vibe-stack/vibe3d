import { Group, Object3D } from 'three/webgpu'

import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  AXIS_Y,
  FACE_CLEARANCE,
  acquireCargoMaterials,
  addLabelDecal,
  addStripeDecal,
  bolt,
  box,
  boltRun,
  cavityLiner,
  createCargoPreview,
  finishModel,
  groundPad,
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
 * Axiom Relay tool cabinet — a tall two-door floor cabinet.
 *
 * The workshop's wall of storage: full-height double doors on piano hinges, a
 * three-point espagnolette lock down the right leaf, adjustable shelves inside,
 * and a louvred lower panel so damp kit dries out. It stands on a plinth with
 * levelling feet rather than castors, because it is bolted to a wall in service.
 *
 * The doors are separate assemblies with their hinge lines at the outer edges,
 * so the cabinet can be dressed open with contents visible.
 */

const WIDTH = 0.92
const DEPTH = 0.46
const HEIGHT = 1.96
const PLINTH = 0.1
/**
 * The carcass, stepped inside the cap band that crowns it.
 *
 * The cap is built to the cabinet's nominal width, depth and height, so a side
 * wall or a back panel built to the same three figures meets it on all three
 * planes and meets the other one as well. Each therefore steps inside the cap,
 * and by a different amount on each axis: a chamfer rounds a corner off both of
 * its planes at once, so two masses moved the same distance in x and in z leave
 * their 45-degree facets exactly where they were.
 */
const CASE_X = WIDTH * 0.5 - FACE_CLEARANCE
const CASE_FRONT = DEPTH * 0.5 - FACE_CLEARANCE * 2
const CASE_BACK = DEPTH * 0.5 - FACE_CLEARANCE * 4
const CASE_TOP = HEIGHT - FACE_CLEARANCE * 2
const BACK_X = WIDTH * 0.5 - FACE_CLEARANCE * 2
const BACK_Z = DEPTH * 0.5 - FACE_CLEARANCE
const BACK_TOP = HEIGHT - FACE_CLEARANCE * 3
/** The back panel and the head rail are one plate, so both seat off one figure. */
const PANEL = 0.035
/** Front face of the head rail, which is what closes the top of the door opening. */
const RAIL_Z = DEPTH * 0.5 - 0.055 + PANEL * 0.5
/** Wall thickness of the interior lining. */
const LINING = 0.02

interface CabinetSockets {
  shelf_top: Object3D
  shelf_mid: Object3D
  handle: Object3D
  wall_anchor: Object3D
}

export type CabinetState = 'closed' | 'open'

export interface ToolCabinetController {
  root: Group
  parts: { body: Group; doorLeft: Group; doorRight: Group }
  sockets: CabinetSockets
  readonly state: CabinetState
  setState(state: CabinetState): CabinetState
  update(deltaSeconds: number): void
  dispose(): void
}

const SHELVES = [0.5, 0.9, 1.3, 1.66]

function bodyBuild(body: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  // The plinth stands on the levelling feet, so it starts above them. Taken all
  // the way down it swallowed all four and the cabinet sat on the plinth.
  const foot = 0.025
  box(body, m.graphite, [WIDTH - 0.04, PLINTH - foot, DEPTH - 0.04], [0, foot + (PLINTH - foot) * 0.5, 0], {
    chamfer: 0.028, fillet: 0.014, bevel: 0.011, capChamfer: 0.025,
  })
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const legX = sx * (WIDTH * 0.5 - 0.08)
      const legZ = sz * (DEPTH * 0.5 - 0.08)
      // The levelling foot beds into its pad rather than standing beside it, and
      // the pad drops a face clearance below the sole it beds on its own, so the
      // foot keeps its drawn length and clears the rubber's sole by 5 mm.
      body.add(cylinder(m.steel, 0.024, 0.05, [legX, 0.026, legZ], AXIS_Y, 8))
      groundPad(body, m.rubber, [0.06, 0.06], [legX, 0, legZ], 0.016)
    }
  }

  const caseY = PLINTH + (HEIGHT - PLINTH) * 0.5
  for (const sx of [-1, 1]) {
    box(body, m.shell, [0.035, CASE_TOP - PLINTH, CASE_FRONT + CASE_BACK], [
      sx * (CASE_X - 0.0175), (CASE_TOP + PLINTH) * 0.5, (CASE_FRONT - CASE_BACK) * 0.5,
    ], {
      chamfer: 0.03, fillet: 0.011, bevel: 0.01,
    })
  }
  box(body, m.shell, [BACK_X * 2, BACK_TOP - PLINTH, PANEL], [
    0, (BACK_TOP + PLINTH) * 0.5, -(BACK_Z - PANEL * 0.5),
  ], {
    chamfer: 0.03, fillet: 0.011, bevel: 0.01,
  })
  box(body, m.shellLight, [WIDTH, 0.05, DEPTH], [0, HEIGHT - 0.025, 0], {
    chamfer: 0.035, fillet: 0.013, bevel: 0.01, capChamfer: 0.022,
  })
  // Head rail behind the door plane. The leaves top out at 1.88 and the cap band
  // starts at 1.91, so without it the front carried a 30 mm slot into the
  // carcass across its whole width.
  box(body, m.shell, [BACK_X * 2, 0.08, PANEL], [0, HEIGHT - 0.09, RAIL_Z - PANEL * 0.5], {
    chamfer: 0.02, fillet: 0.009, bevel: 0.008,
  })
  // Five thin faces rather than one block: as a solid it enclosed every shelf,
  // lip and stock box set inside it, and its front cap landed on the same plane
  // as both the shelf fronts and the shelf lips.
  // Its two ends are taken off the members it runs between rather than off the
  // carcass depth: sized to that, its open edge stood 2.5 mm proud of the head
  // rail, and once the back panel came in off the cap the back leaf reached
  // straight through it.
  const linerFront = RAIL_Z - FACE_CLEARANCE
  const linerBack = -(BACK_Z - FACE_CLEARANCE) + LINING
  cavityLiner(body, m.ink, [WIDTH - 0.09, HEIGHT - PLINTH - 0.08, linerFront - linerBack], [
    0, caseY, (linerFront + linerBack) * 0.5,
  ], LINING, 'front')

  // Shelves on a punched pilaster, so the interior reads adjustable.
  for (const y of SHELVES) {
    box(body, m.graphite, [WIDTH - 0.1, 0.02, DEPTH - 0.08], [0, y, -0.01], {
      chamfer: 0.02, fillet: 0.008, bevel: 0.006,
    })
    box(body, m.graphiteEdge, [WIDTH - 0.1, 0.03, 0.02], [0, y + 0.02, DEPTH * 0.5 - 0.06], {
      chamfer: 0.008, fillet: 0.004, bevel: 0.003,
    })
  }
  for (const sx of [-1, 1]) {
    box(body, m.graphiteEdge, [0.03, HEIGHT - PLINTH - 0.14, 0.02], [sx * (WIDTH * 0.5 - 0.05), caseY, -(DEPTH * 0.5 - 0.05)], {
      chamfer: 0.008, fillet: 0.003, bevel: 0.003,
    })
  }
  // A little stock, so an opened cabinet is not an empty box.
  for (let index = 0; index < 3; index += 1) {
    box(body, m.shellLight, [0.16 + index * 0.03, 0.11, DEPTH - 0.14], [
      -0.24 + index * 0.22, SHELVES[1] + 0.07, -0.02,
    ], { chamfer: 0.024, fillet: 0.009, bevel: 0.008, rotation: [0, index * 0.05 - 0.05, 0] })
  }
  body.add(cylinder(m.orangePaint, 0.05, 0.2, [0.22, SHELVES[2] + 0.11, -0.02], AXIS_Y, 12))
  body.add(cylinder(m.graphiteEdge, 0.055, 0.03, [0.22, SHELVES[2] + 0.2, -0.02], AXIS_Y, 12))

  const stripe = addStripeDecal(bundle, { count: 4, lean: 1 })
  plaque(body, m, stripe, [0.34, 0.03], [0, foot + (PLINTH - foot) * 0.5, (DEPTH - 0.04) * 0.5], 'front', m.ink)
  boltRun(body, m.steel, [-WIDTH * 0.3, HEIGHT - 0.12, -BACK_Z], [WIDTH * 0.3, HEIGHT - 0.12, -BACK_Z], 4, 0.013, 'back')
}

/** One door leaf, hinged on its outboard edge. */
function doorBuild(
  door: Group,
  m: CargoMaterials,
  bundle: CargoMaterialBundle,
  side: -1 | 1,
  lock: boolean,
): void {
  const leaf = (WIDTH - 0.08) * 0.5
  const height = HEIGHT - PLINTH - 0.08
  const centre = side * leaf * 0.5
  const skin = 0.016
  const panel = 0.025
  // The lock furniture belongs 60 mm from the leading edge, which is the edge
  // away from the hinge: subtracting the offset put the whole espagnolette,
  // lever and all, against the hinge stile at the cabinet's outer corner.
  const stile = centre + side * (leaf * 0.5 - 0.06)

  box(door, m.shell, [leaf, height, 0.032], [centre, PLINTH + height * 0.5, 0], {
    chamfer: 0.03, fillet: 0.011, bevel: 0.01,
  })
  box(door, m.shellShade, [leaf - 0.1, height - 0.34, 0.014], [centre, PLINTH + height * 0.5 + 0.06, 0.018], {
    chamfer: 0.026, fillet: 0.01, bevel: 0.007,
  })
  // Cut in the recessed panel it crosses, and short enough to stay on it: on the
  // skin plane the whole groove sat 9 mm inside the panel and never read.
  seam(door, m.shellLight, leaf - 0.14, [centre, PLINTH + 0.3, panel], 'front', 'across', 0.018, 0.011)
  louvreVent(door, m, [leaf - 0.2, 0.16], [centre, PLINTH + 0.16, skin], 4, 'front')

  if (lock) {
    // Espagnolette: a full-height rod with two throw points and a lever.
    door.add(cylinder(m.steel, 0.014, height - 0.14, [stile, PLINTH + height * 0.5, 0.03], AXIS_Y, 8))
    // The lower keeper lands on the louvre's surround rather than on the skin,
    // so it is seated off that surround's own front face - 32.5 mm proud of the
    // position the vent was given. On the rod's plane it stood 1.5 mm over the
    // surround and the two fought across the whole keeper.
    const keeperZ = skin + 0.0325 + FACE_CLEARANCE - 0.02
    for (const y of [PLINTH + 0.12, HEIGHT - 0.18]) {
      box(door, m.graphiteEdge, [0.05, 0.07, 0.04], [stile, y, keeperZ], {
        chamfer: 0.012, fillet: 0.005, bevel: 0.004,
      })
    }
    box(door, m.graphite, [0.09, 0.16, 0.04], [stile, 1.06, 0.038], {
      chamfer: 0.022, fillet: 0.008, bevel: 0.007,
    })
    box(door, m.amberPaint, [0.13, 0.035, 0.03], [stile - side * 0.05, 1.06, 0.056], {
      chamfer: 0.01, fillet: 0.004, bevel: 0.004,
    })
    statusLens(door, m, [0.04, 0.016], [stile, 1.2, panel], m.cyan, 'front')
  } else {
    const label = addLabelDecal(bundle, { variant: 290 })
    plaque(door, m, label, [0.22, 0.09], [centre, 1.34, panel], 'front', m.shellLight)
    paintMark(door, m.amberPaint, slashProfile(0.04, 0.08, 0.45), [centre + side * 0.11, 1.14, panel], 'front', 0.008)
  }

  // Piano hinge down the outer edge: a rod plus knuckles. The rod is the axis
  // the leaf swings about, which is the group origin - taken as `side * leaf` it
  // is the *leading* edge, and both leaves put their barrel on the centre seam.
  door.add(cylinder(m.steel, 0.011, height - 0.06, [0, PLINTH + height * 0.5, -0.012], AXIS_Y, 6))
  for (let index = 0; index < 6; index += 1) {
    const y = PLINTH + 0.14 + index * (height - 0.28) / 5
    box(door, m.graphiteEdge, [0.05, 0.06, 0.03], [side * 0.02, y, -0.008], {
      chamfer: 0.01, fillet: 0.004, bevel: 0.004,
    })
    bolt(door, m.steel, [side * 0.03, y, skin], 0.009, 'front')
  }
}

function build(): {
  root: Group
  body: Group
  doorLeft: Group
  doorRight: Group
  sockets: CabinetSockets
  bundle: CargoMaterialBundle
} {
  const bundle = acquireCargoMaterials(61_200, { condition: 0.62 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_INDUSTRIAL_TOOL-CABINET_ROOT_CLOSED'
  const body = new Group()
  body.name = 'AXR_INDUSTRIAL_TOOL-CABINET_PART_BODY_DEFAULT'
  const doorLeft = new Group()
  doorLeft.name = 'AXR_INDUSTRIAL_TOOL-CABINET_PART_DOOR-LEFT_CLOSED'
  const doorRight = new Group()
  doorRight.name = 'AXR_INDUSTRIAL_TOOL-CABINET_PART_DOOR-RIGHT_CLOSED'
  root.add(body, doorLeft, doorRight)

  bodyBuild(body, m, bundle)
  const hinge = WIDTH * 0.5 - 0.04
  doorLeft.position.set(-hinge, 0, DEPTH * 0.5 - 0.01)
  doorRight.position.set(hinge, 0, DEPTH * 0.5 - 0.01)
  doorBuild(doorLeft, m, bundle, 1, false)
  doorBuild(doorRight, m, bundle, -1, true)

  const sockets: CabinetSockets = {
    shelf_top: socket('shelf_top', [0, SHELVES[3] + 0.02, -0.01]),
    shelf_mid: socket('shelf_mid', [0, SHELVES[1] + 0.02, -0.01]),
    handle: socket('handle', [0.08, 1.06, DEPTH * 0.5 + 0.08]),
    wall_anchor: socket('wall_anchor', [0, HEIGHT - 0.12, -(DEPTH * 0.5 + 0.02)]),
  }
  return { root, body, doorLeft, doorRight, sockets, bundle }
}

export function createModel(): ToolCabinetController {
  const { root, body, doorLeft, doorRight, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'industrial-tool-cabinet',
    assemblies: [doorLeft, doorRight],
    reach: 0.13,
    sockets: Object.values(sockets),
  })

  let state: CabinetState = 'closed'
  let blend = 0
  let elapsed = 0
  // A leaf hinged on the left swings out through +Z on a *negative* Y rotation.
  // With the signs the other way round each leaf opened into the carcass and
  // came out through its own side wall.
  const applyBlend = (): void => {
    doorLeft.rotation.y = -blend * 2.0
    doorRight.rotation.y = blend * 2.0
    doorLeft.name = blend > 0.02
      ? 'AXR_INDUSTRIAL_TOOL-CABINET_PART_DOOR-LEFT_OPEN'
      : 'AXR_INDUSTRIAL_TOOL-CABINET_PART_DOOR-LEFT_CLOSED'
    doorRight.name = doorLeft.name.replace('DOOR-LEFT', 'DOOR-RIGHT')
  }

  return {
    root,
    parts: { body, doorLeft, doorRight },
    sockets,
    get state() {
      return state
    },
    setState: (next: CabinetState) => {
      state = next
      root.name = next === 'open'
        ? 'AXR_INDUSTRIAL_TOOL-CABINET_ROOT_OPEN'
        : 'AXR_INDUSTRIAL_TOOL-CABINET_ROOT_CLOSED'
      blend = next === 'open' ? 1 : 0
      applyBlend()
      return state
    },
    update: (deltaSeconds: number) => {
      const step = Math.min(Math.max(deltaSeconds, 0), 0.05)
      elapsed += step
      const target = state === 'open' ? 1 : 0
      if (Math.abs(target - blend) > 1e-4) {
        blend += Math.sign(target - blend) * Math.min(Math.abs(target - blend), step * 0.9)
        applyBlend()
      }
      bundle.materials.cyan.emissiveIntensity = 1.6 + Math.sin(elapsed * 1.7) * 0.2
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: CabinetState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'closed')
  return createCargoPreview(model, {
    target: [0, HEIGHT * 0.5, 0],
    distance: 5.0,
    yaw: 0.7,
    pitch: 0.2,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createOpenPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'open' })
