import { Group, Object3D } from 'three/webgpu'

import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  AXIS_Y,
  FACE_CLEARANCE,
  acquireCargoMaterials,
  addLabelDecal,
  bolt,
  box,
  createCargoPreview,
  finishModel,
  member,
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
 * Axiom Relay overhead cable tray — a ladder-rack run with a branch tee.
 *
 * A ceiling-mounted module rather than a floor prop, and it is what makes a
 * depot ceiling read as serviced. The run carries a real cable bundle strapped
 * down at intervals, a drop-out to a junction box, and a branch tee that gives
 * a level builder somewhere to turn a corner.
 *
 * Cables are the point. An empty tray is a ladder; the bundle, its ties, and the
 * slack loop at the drop-out are what say power and data pass overhead.
 */

const RUN = 3.2
const WIDTH = 0.44
const SIDE = 0.09
const DROP = 0.5
/** Outer face of a side rail, which is what a graphic on the run is seated on. */
const RAIL_FACE = WIDTH * 0.5 + 0.014
/** The rolled stiffening lip's section, and the flank it leaves clear beneath it. */
const LIP = 0.02
const LIP_TOP = SIDE * 0.5 - FACE_CLEARANCE
const MARK_Y = (LIP_TOP - LIP - SIDE * 0.5) * 0.5
/** The two planes a hanger rod is threaded between: the strut and the ceiling plate. */
const STRUT_Y = SIDE * 0.5 + 0.005
const CEILING_Y = SIDE * 0.5 + DROP + 0.05

interface TraySockets {
  run_start: Object3D
  run_end: Object3D
  branch_end: Object3D
  drop_out: Object3D
}

export interface CableTrayController {
  root: Group
  sockets: TraySockets
  update(deltaSeconds: number): void
  dispose(): void
}

/** One straight tray section: two side rails and evenly spaced rungs. */
function traySection(
  root: Group,
  m: CargoMaterials,
  length: number,
  centre: [number, number, number],
  yaw: number,
): void {
  const group = new Group()
  group.name = 'industrial-cable-tray / section'
  group.position.set(...centre)
  group.rotation.y = yaw
  root.add(group)

  for (const sz of [-1, 1]) {
    box(group, m.shell, [length, SIDE, 0.028], [0, 0, sz * WIDTH * 0.5], {
      chamfer: 0.014, fillet: 0.006, bevel: 0.006, capChamfer: 0.01,
    })
    // The stiffener is a rolled lip on the rail, so it has to stand clear of the
    // two rail planes it runs beside rather than a millimetre or two off them:
    // its own top sits a face clearance under the rail's top and its outer face
    // the same clearance proud of the rail's, both measured off its 20 × 16 mm
    // section. Drawn 1 mm over the top and 2 mm outboard it fought the rail down
    // the whole 3.2 m of the run.
    box(group, m.shellShade, [length, LIP, 0.016], [
      0, LIP_TOP - LIP * 0.5, sz * (RAIL_FACE + FACE_CLEARANCE - 0.008),
    ], {
      chamfer: 0.006, fillet: 0.003, bevel: 0.003,
    })
  }
  const rungs = Math.max(2, Math.round(length / 0.24))
  for (let index = 0; index < rungs; index += 1) {
    const x = (index / (rungs - 1) - 0.5) * (length - 0.08)
    box(group, m.shellShade, [0.03, 0.016, WIDTH - 0.02], [x, -SIDE * 0.28, 0], {
      chamfer: 0.006, fillet: 0.003, bevel: 0.003,
    })
  }
}

/** The cable bundle in a section, with ties at a believable pitch. */
function bundle(
  root: Group,
  m: CargoMaterials,
  length: number,
  centre: [number, number, number],
  yaw: number,
): void {
  const group = new Group()
  group.position.set(...centre)
  group.rotation.y = yaw
  root.add(group)

  const cables: Array<[number, number, number]> = [
    [-0.11, 0.026, 0.028], [-0.04, 0.03, 0.03], [0.04, 0.026, 0.028],
    [0.11, 0.022, 0.024], [0.0, 0.075, 0.022], [-0.075, 0.072, 0.02],
  ]
  for (const [z, y, radius] of cables) {
    group.add(cylinder(m.rubber, radius, length - 0.04, [0, y - SIDE * 0.24, z], AXIS_X, 6))
  }
  // The last two cables ride above the rest and the strap is laid under both, so
  // its top face takes a face clearance off the lower of their two crowns - a
  // 6-facet cable's crown being radius·cos(π/6), not its radius. Drawn at a flat
  // 0.065 it stopped 2.7 mm under one of them, and every tie in the run fought
  // that cable over its whole width.
  const strap = 0.11
  const strapTop = Math.min(...cables.slice(4)
    .map(([, y, radius]) => y - SIDE * 0.24 + radius * Math.cos(Math.PI / 6))) - FACE_CLEARANCE
  const ties = Math.max(2, Math.round(length / 0.62))
  for (let index = 0; index < ties; index += 1) {
    const x = (index / Math.max(1, ties - 1) - 0.5) * (length - 0.5)
    box(group, m.graphiteEdge, [0.02, strap, WIDTH - 0.1], [x, strapTop - strap * 0.5, 0], {
      chamfer: 0.006, fillet: 0.003, bevel: 0.003,
    })
  }
}

function build(): { root: Group; sockets: TraySockets; bundle: CargoMaterialBundle } {
  const materials = acquireCargoMaterials(60_800, { condition: 0.6 })
  const m = materials.materials

  const root = new Group()
  root.name = 'AXR_INDUSTRIAL_CABLE-TRAY_ROOT_DEFAULT'

  traySection(root, m, RUN, [0, 0, 0], 0)
  bundle(root, m, RUN, [0, 0, 0], 0)

  // Branch tee running off the +Z side, a third of the way along.
  const branchX = -RUN * 0.18
  const branchLength = 1.1
  traySection(root, m, branchLength, [branchX, 0, WIDTH * 0.5 + branchLength * 0.5], Math.PI / 2)
  bundle(root, m, branchLength * 0.8, [branchX, 0, WIDTH * 0.5 + branchLength * 0.5], Math.PI / 2)
  // The tee cover is centred on the crossing. Offset by a fraction of the tray
  // width it swallowed the near rail whole and left the far one 10 mm proud.
  box(root, m.shellLight, [WIDTH + 0.06, SIDE + 0.02, WIDTH + 0.06], [branchX, 0, 0], {
    chamfer: 0.03, fillet: 0.012, bevel: 0.008,
  })

  // Threaded hangers up to the ceiling, with their own strut channel. The strut
  // bites into the rail it clamps and each rod runs between the two mid-planes
  // it is threaded into, rather than sitting 5 mm clear of both.
  for (const x of [-RUN * 0.4, -RUN * 0.05, RUN * 0.32]) {
    box(root, m.graphiteEdge, [0.06, 0.05, WIDTH + 0.16], [x, STRUT_Y, 0], {
      chamfer: 0.014, fillet: 0.005, bevel: 0.005,
    })
    for (const sz of [-1, 1]) {
      root.add(cylinder(m.steel, 0.014, CEILING_Y - STRUT_Y, [
        x, (CEILING_Y + STRUT_Y) * 0.5, sz * (WIDTH * 0.5 + 0.06),
      ], AXIS_Y, 6))
      box(root, m.graphite, [0.09, 0.03, 0.09], [x, CEILING_Y, sz * (WIDTH * 0.5 + 0.06)], {
        chamfer: 0.022, fillet: 0.008, bevel: 0.006,
      })
      bolt(root, m.steel, [x, CEILING_Y + 0.015, sz * (WIDTH * 0.5 + 0.06)], 0.014, 'top')
    }
  }

  // Drop-out to a junction box, with a slack loop of conduit.
  const boxX = RUN * 0.3
  box(root, m.graphite, [0.34, 0.4, 0.2], [boxX, -0.42, 0], {
    chamfer: 0.055, fillet: 0.02, bevel: 0.013, capChamfer: 0.035,
  })
  box(root, m.shellShade, [0.26, 0.3, 0.03], [boxX, -0.42, 0.11], { chamfer: 0.04, fillet: 0.014, bevel: 0.009 })
  statusLens(root, m, [0.07, 0.03], [boxX, -0.3, 0.125], m.cyan, 'front')
  for (const sx of [-1, 1]) bolt(root, m.steel, [boxX + sx * 0.12, -0.54, 0.125], 0.014, 'front')
  root.add(cylinder(m.rubber, 0.035, 0.26, [boxX, -0.14, 0.03], AXIS_Y, 8))
  root.add(cylinder(m.rubber, 0.035, 0.2, [boxX + 0.08, -0.06, 0.03], [0, 0, 0.9], 8))
  root.add(cylinder(m.graphiteEdge, 0.05, 0.06, [boxX, -0.24, 0.03], AXIS_Y, 8))
  member(root, m.steel, [boxX - 0.06, -0.2, 0], [boxX + 0.06, -0.2, 0], 0.02, 0.02)

  // Run identity, sized to the 0.09 rail it is applied to - at 0.07 the plate
  // stood 10 mm off the rail's edge top and bottom with nothing behind it.
  const label = addLabelDecal(materials, { variant: 270 })
  plaque(root, m, label, [0.22, 0.04], [-RUN * 0.32, 0, RAIL_FACE], 'front', m.shellLight)
  // Both rails carry the run mark. A ladder tray is seen straight through, so a
  // graphic on one flank leaves the whole prop unmarked from the other side.
  // The mark goes on the flank the lip leaves clear: centred on the rail its top
  // 7 mm ran behind the lip, and a paint stroke stands 4 mm off the face it is
  // applied to, which is exactly where the lip's own outer face is.
  for (const sz of [-1, 1]) {
    paintMark(root, m.amberPaint, slashProfile(0.045, 0.055, 0.45), [
      RUN * 0.06, MARK_Y, sz * RAIL_FACE,
    ], sz > 0 ? 'front' : 'back', 0.008)
  }

  const sockets: TraySockets = {
    run_start: socket('run_start', [-RUN * 0.5, 0, 0]),
    run_end: socket('run_end', [RUN * 0.5, 0, 0]),
    branch_end: socket('branch_end', [branchX, 0, WIDTH * 0.5 + branchLength]),
    drop_out: socket('drop_out', [boxX, -0.62, 0]),
  }
  return { root, sockets, bundle: materials }
}

export function createModel(): CableTrayController {
  const { root, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'industrial-cable-tray',
    reach: 0.1,
    sockets: Object.values(sockets),
  })
  let elapsed = 0
  return {
    root,
    sockets,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      bundle.materials.cyan.emissiveIntensity = 1.6 + Math.sin(elapsed * 2.3) * 0.24
    },
    dispose: finished.dispose,
  }
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  createCargoPreview(createModel(), {
    target: [0, -0.05, 0.35],
    distance: 6.6,
    yaw: 0.72,
    pitch: 0.16,
    fov: 30,
    ...options,
  })
