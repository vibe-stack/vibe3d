import { Group, Object3D } from 'three/webgpu'

import { cylinder, prism } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  AXIS_Y,
  AXIS_Z,
  LAYER_CLEARANCE,
  acquireCargoMaterials,
  addLabelDecal,
  addStripeDecal,
  box,
  boltRun,
  cavityLiner,
  createCargoPreview,
  finishModel,
  groundPad,
  paintMark,
  plaque,
  recessedHandle,
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
 * Axiom Relay equipment chest — a standing tool chest with drawers.
 *
 * The only asset in the wave that opens *toward* the operator instead of
 * upward, which is what stops the crate family from becoming monotonous. Five
 * drawer fronts at different depths, a lidded top well, a locking bar down the
 * face, and a plinth with levelling feet.
 *
 * The drawers are separate assemblies with their own transforms, so a dresser
 * can pull one out to make a chest look worked without editing geometry.
 */

const WIDTH = 0.96
const DEPTH = 0.56
const HEIGHT = 1.06
const PLINTH = 0.12
const TOP = 0.14

interface ChestSockets {
  drawer_top: Object3D
  drawer_mid: Object3D
  top_well: Object3D
  lock_bar: Object3D
}

export type ChestState = 'closed' | 'worked'

export interface EquipmentChestController {
  root: Group
  parts: { body: Group; drawers: Group[] }
  sockets: ChestSockets
  readonly state: ChestState
  setState(state: ChestState): ChestState
  update(deltaSeconds: number): void
  dispose(): void
}

const DRAWERS = [0.1, 0.1, 0.14, 0.18, 0.22]

function drawerFront(drawer: Group, m: CargoMaterials, height: number, index: number): void {
  box(drawer, m.shellLight, [WIDTH - 0.08, height - 0.012, 0.05], [0, 0, DEPTH * 0.5 - 0.02], {
    chamfer: 0.028, fillet: 0.01, bevel: 0.009, capChamfer: [0.018, 0],
  })
  box(drawer, m.shellShade, [WIDTH - 0.24, height - 0.05, 0.02], [0, 0, DEPTH * 0.5 + 0.012], {
    chamfer: 0.02, fillet: 0.008, bevel: 0.006,
  })
  // Full-width pull, recessed into the front so a closed chest stays flush.
  //
  // Its top edge and the sub-panel's are both fractions of the drawer height,
  // and the two cross at 0.167, so on the 0.18 drawer the pull's ledge came to
  // rest 2 mm under the sub-panel's and the pair mottled along the 20 mm they
  // share. Clamped a face clearance off that edge, the pull keeps the side of it
  // that it already sits on at all four of the other heights.
  const panelTop = (height - 0.05) * 0.5
  const reach = height * 0.35
  const pullTop = reach > panelTop ? Math.max(reach, panelTop + 0.004) : Math.min(reach, panelTop - 0.004)
  const pullY = pullTop - height * 0.17
  box(drawer, m.ink, [WIDTH - 0.3, height * 0.34, 0.03], [0, pullY, DEPTH * 0.5 + 0.016], {
    chamfer: 0.016, fillet: 0.006, bevel: 0.005,
  })
  box(drawer, m.graphiteEdge, [WIDTH - 0.34, height * 0.16, 0.026], [0, pullY, DEPTH * 0.5 + 0.03], {
    chamfer: 0.01, fillet: 0.004, bevel: 0.004,
  })
  // The box behind the front, so an open drawer is not a floating panel. Built
  // as a tray: as a solid block it contained the dark liner meant to line it,
  // and a drawer pulled out showed a lid rather than an inside.
  cavityLiner(drawer, m.shellShade, [WIDTH - 0.18, height - 0.05, DEPTH - 0.12], [0, 0, 0.02], 0.02, 'top')
  box(drawer, m.ink, [WIDTH - 0.18, 0.014, DEPTH - 0.12], [0, -(height - 0.05) * 0.5 + 0.005, 0.02], {
    chamfer: 0.01, fillet: 0.005, bevel: 0.004,
  })
  if (index === 1) {
    // Inboard of the locking bar at x 0.3825, which all but hid it.
    box(drawer, m.amberPaint, [0.07, height * 0.3, 0.022], [WIDTH * 0.5 - 0.18, -height * 0.18, DEPTH * 0.5 + 0.026], {
      chamfer: 0.008, fillet: 0.004, bevel: 0.003,
    })
  }
}

function body(bodyGroup: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  const caseHeight = HEIGHT - PLINTH - TOP
  const caseY = PLINTH + caseHeight * 0.5

  // The plinth stands on the levelling feet, so it starts above them. Taken all
  // the way to the floor it swallowed all four and the chest sat on the plinth.
  const foot = 0.03
  box(bodyGroup, m.graphite, [WIDTH - 0.04, PLINTH - foot, DEPTH - 0.04], [0, foot + (PLINTH - foot) * 0.5, 0], {
    chamfer: 0.032, fillet: 0.016, bevel: 0.012, capChamfer: 0.028,
  })
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const legX = sx * (WIDTH * 0.5 - 0.1)
      const legZ = sz * (DEPTH * 0.5 - 0.1)
      bodyGroup.add(cylinder(m.steel, 0.028, 0.055, [legX, 0.0325, legZ], AXIS_Y, 8))
      groundPad(bodyGroup, m.rubber, [0.07, 0.07], [legX, 0, legZ], 0.02)
    }
  }

  // Carcass: open at the front, so the drawers sit in a real cavity.
  //
  // The sides are 4 mm thinner than the 0.05 they read as, taken off the inside,
  // because that inner face was on the ink liner's - and the liner is what an
  // open drawer shows. The back panel then runs between those inner faces rather
  // than out to the same rear corner as the sides: carried to the full width its
  // ends sat on their outer faces and its rear face on their rear caps, both
  // pairs in plain view from behind. Every outer face is where it was.
  const wall = 0.046
  for (const sx of [-1, 1]) {
    box(bodyGroup, m.shell, [wall, caseHeight, DEPTH], [sx * (WIDTH - wall) * 0.5, caseY, 0], {
      chamfer: 0.045, fillet: 0.016, bevel: 0.014,
    })
  }
  box(bodyGroup, m.shell, [WIDTH - wall * 2, caseHeight, 0.05], [0, caseY, -(DEPTH * 0.5 - 0.025)], {
    chamfer: 0.045, fillet: 0.016, bevel: 0.014,
  })
  // Five thin faces rather than one block: as a solid it enclosed every drawer
  // tray put into it, which is the whole point of the cavity. It is seated 10 mm
  // forward of the cavity's own centre so its back corner clears the back
  // panel's, which the panel's new ends brought to within 2 mm of it; it still
  // laps both the panel and the sides.
  cavityLiner(bodyGroup, m.ink, [WIDTH - 0.1, caseHeight - 0.04, DEPTH - 0.1], [0, caseY, -0.01], 0.02, 'front')

  // Top well with its own lid band.
  box(bodyGroup, m.shellLight, [WIDTH, TOP, DEPTH], [0, HEIGHT - TOP * 0.5, 0], {
    chamfer: 0.055, fillet: 0.02, bevel: 0.016, capChamfer: 0.035,
  })
  const wellBand = 0.024
  box(bodyGroup, m.ink, [WIDTH - 0.22, wellBand, DEPTH - 0.18], [0, HEIGHT - 0.006, 0], {
    chamfer: 0.05, fillet: 0.016, bevel: 0.01,
  })
  // The lid seam is cut in the band, not in the slab under it - at the slab's
  // own top face the whole groove ran inside the band and only its tips showed.
  seam(bodyGroup, m.shellLight, DEPTH - 0.12, [0, HEIGHT - 0.006 + wellBand * 0.5, 0], 'top', 'along', 0.026, 0.014)
  for (const sx of [-1, 1]) {
    recessedHandle(bodyGroup, m, [0.24, 0.09], [sx * WIDTH * 0.5, HEIGHT - TOP * 0.5, 0], sx > 0 ? 'right' : 'left')
  }

  // Locking bar down the face, carried on a bracket into the plinth and another
  // into the top slab, and standing one layer clear of the drawer fronts. Hung
  // from nothing it floated 27.5 mm off them over its whole 890 mm.
  const barX = WIDTH * 0.5 - 0.07
  const drawerFace = DEPTH * 0.5 + 0.005
  const barZ = drawerFace + LAYER_CLEARANCE + 0.0225
  for (const y of [PLINTH - 0.015, HEIGHT - 0.075]) {
    box(bodyGroup, m.graphiteEdge, [0.075, 0.07, 0.1], [barX, y, DEPTH * 0.5 + 0.01], {
      chamfer: 0.018, fillet: 0.007, bevel: 0.006,
    })
  }
  bodyGroup.add(prism(m.graphiteEdge, [0.055, HEIGHT - PLINTH - 0.05, 0.045], [barX, PLINTH + (HEIGHT - PLINTH) * 0.5 - 0.02, barZ], {
    chamfer: 0.016, fillet: 0.006, bevel: 0.006,
  }))
  box(bodyGroup, m.amberPaint, [0.075, 0.11, 0.05], [barX, HEIGHT - 0.26, DEPTH * 0.5 + 0.07], {
    chamfer: 0.018, fillet: 0.007, bevel: 0.006,
  })
  bodyGroup.add(cylinder(m.steel, 0.014, 0.09, [barX, HEIGHT - 0.26, DEPTH * 0.5 + 0.1], AXIS_Z, 8))
  bodyGroup.add(cylinder(m.steel, 0.016, 0.11, [barX, PLINTH - 0.015, barZ - 0.005], AXIS_X, 8))

  // Both graphics go on the top slab: over the drawer stack the label straddled
  // the 30 mm void between the top drawer and the slab's underside.
  const label = addLabelDecal(bundle, { variant: 180 })
  plaque(bodyGroup, m, label, [0.24, 0.08], [-WIDTH * 0.5 + 0.22, HEIGHT - TOP * 0.5, DEPTH * 0.5], 'front', m.shellLight)
  statusLens(bodyGroup, m, [0.05, 0.02], [-0.04, HEIGHT - TOP * 0.5, DEPTH * 0.5], m.cyan, 'front')
  const stripe = addStripeDecal(bundle, { count: 4, lean: 1 })
  plaque(bodyGroup, m, stripe, [0.4, 0.04], [0, foot + (PLINTH - foot) * 0.5, DEPTH * 0.5 - 0.02], 'front', m.ink)
  paintMark(bodyGroup, m.amberPaint, slashProfile(0.05, 0.11, 0.45), [-WIDTH * 0.5 + 0.1, HEIGHT * 0.5, -DEPTH * 0.5], 'back', 0.009)
  boltRun(bodyGroup, m.steel, [-WIDTH * 0.3, HEIGHT * 0.35, -DEPTH * 0.5], [WIDTH * 0.3, HEIGHT * 0.35, -DEPTH * 0.5], 4, 0.014, 'back')
}

function build(): { root: Group; bodyGroup: Group; drawers: Group[]; sockets: ChestSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(58_600, { condition: 0.58 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_EQUIPMENT-CHEST_ROOT_CLOSED'
  const bodyGroup = new Group()
  bodyGroup.name = 'AXR_CARGO_EQUIPMENT-CHEST_PART_BODY_DEFAULT'
  root.add(bodyGroup)
  body(bodyGroup, m, bundle)

  const drawers: Group[] = []
  let cursor = PLINTH + 0.03
  for (const [index, height] of DRAWERS.entries()) {
    const drawer = new Group()
    drawer.name = `AXR_CARGO_EQUIPMENT-CHEST_PART_DRAWER-${index + 1}_CLOSED`
    drawer.position.set(0, cursor + height * 0.5, 0)
    root.add(drawer)
    drawerFront(drawer, m, height, index)
    drawers.push(drawer)
    cursor += height
  }

  const sockets: ChestSockets = {
    drawer_top: socket('drawer_top', [0, PLINTH + DRAWERS[0] * 0.5, DEPTH * 0.5 + 0.1]),
    drawer_mid: socket('drawer_mid', [0, PLINTH + 0.34, DEPTH * 0.5 + 0.1]),
    top_well: socket('top_well', [0, HEIGHT + 0.04, 0]),
    lock_bar: socket('lock_bar', [WIDTH * 0.5 - 0.07, HEIGHT - 0.26, DEPTH * 0.5 + 0.14]),
  }
  return { root, bodyGroup, drawers, sockets, bundle }
}

export function createModel(): EquipmentChestController {
  const { root, bodyGroup, drawers, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'equipment-chest',
    assemblies: drawers,
    reach: 0.12,
    sockets: Object.values(sockets),
  })

  let state: ChestState = 'closed'
  let blend = 0
  let elapsed = 0
  // Only two drawers open, at different extents. A chest with every drawer out
  // reads as vandalised; two reads as somebody working.
  const pull = [0, 0.26, 0, 0.13, 0]
  const applyBlend = (): void => {
    for (const [index, drawer] of drawers.entries()) {
      drawer.position.z = pull[index] * blend
      drawer.name = `AXR_CARGO_EQUIPMENT-CHEST_PART_DRAWER-${index + 1}_${pull[index] * blend > 0.02 ? 'OPEN' : 'CLOSED'}`
    }
  }

  return {
    root,
    parts: { body: bodyGroup, drawers },
    sockets,
    get state() {
      return state
    },
    setState: (next: ChestState) => {
      state = next
      root.name = next === 'worked'
        ? 'AXR_CARGO_EQUIPMENT-CHEST_ROOT_WORKED'
        : 'AXR_CARGO_EQUIPMENT-CHEST_ROOT_CLOSED'
      blend = next === 'worked' ? 1 : 0
      applyBlend()
      return state
    },
    update: (deltaSeconds: number) => {
      const step = Math.min(Math.max(deltaSeconds, 0), 0.05)
      elapsed += step
      const target = state === 'worked' ? 1 : 0
      if (Math.abs(target - blend) > 1e-4) {
        blend += Math.sign(target - blend) * Math.min(Math.abs(target - blend), step * 1.6)
        applyBlend()
      }
      bundle.materials.cyan.emissiveIntensity = 1.6 + Math.sin(elapsed * 1.8) * 0.2
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: ChestState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'closed')
  return createCargoPreview(model, {
    target: [0, HEIGHT * 0.5, 0],
    distance: 3.3,
    yaw: 0.72,
    pitch: 0.26,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createWorkedPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'worked' })
