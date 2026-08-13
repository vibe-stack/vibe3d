import { Group, Object3D } from 'three/webgpu'

import { cylinder, extrudeProfile, type Vec2 } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  AXIS_Z,
  acquireCargoMaterials,
  addLabelDecal,
  box,
  createCargoPreview,
  finishModel,
  groundPad,
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
 * Axiom Relay cargo holdall.
 *
 * A packed soft bag with a hard end cap and a rigid spine, which is what lets it
 * be thrown into a hold without folding. The body is a lofted section that
 * bulges at the waist and pinches at both ends; the webbing, buckles, and end
 * cap are the hard-surface detail that keeps it in the same catalogue as the
 * alloy crates.
 *
 * The compression straps are placed where they would actually pull - across the
 * bulge, not across the flat - so the bag reads as full rather than as a
 * cushion with belts drawn on it.
 */

const LENGTH = 0.92
const HEIGHT = 0.42
const DEPTH = 0.44

interface CargoBagSockets {
  carry_handle: Object3D
  shoulder_strap: Object3D
  end_cap: Object3D
}

export interface CargoBagController {
  root: Group
  sockets: CargoBagSockets
  update(deltaSeconds: number): void
  dispose(): void
}

/** Side elevation of a packed holdall: flat base, bulged crown, pinched ends. */
function bodyProfile(): Vec2[] {
  const hl = LENGTH * 0.5
  const h = HEIGHT
  return [
    [hl * 0.9, 0.03],
    [hl, h * 0.3],
    [hl * 0.94, h * 0.66],
    [hl * 0.66, h * 0.9],
    [hl * 0.24, h],
    [-hl * 0.28, h * 0.99],
    [-hl * 0.68, h * 0.88],
    [-hl * 0.95, h * 0.62],
    [-hl, h * 0.28],
    [-hl * 0.9, 0.03],
    [-hl * 0.8, 0],
    [hl * 0.8, 0],
  ]
}

/**
 * A compression strap: crown run, two side runs, and a buckle.
 *
 * `crown` is the height the fabric reaches at this station, so the run beds 4 mm
 * into it. The crown run itself is kept inside the bag's own crown width - a
 * strap sized to the bag's full depth overhangs the chamfered top and reads as a
 * pair of fins rather than as webbing lying on fabric - but the side runs and
 * the buckle are set out from `DEPTH`, because the flank is a flat face at
 * `DEPTH * 0.5` all the way down. Keyed off the crown's width instead they sat
 * 27 mm inside the fabric and only the amber tongue ever showed.
 */
function strap(root: Group, m: CargoMaterials, x: number, crown: number, depth: number): void {
  box(root, m.webbing, [0.06, 0.014, depth * 0.66], [x, crown + 0.003, 0], {
    chamfer: 0.005, fillet: 0.003, bevel: 0.003,
  })
  for (const sz of [-1, 1]) {
    box(root, m.webbing, [0.06, crown * 0.72, 0.014], [x, crown * 0.42, sz * (DEPTH * 0.5 - 0.005)], {
      chamfer: 0.005, fillet: 0.003, bevel: 0.003,
    })
  }
  box(root, m.graphiteEdge, [0.075, 0.06, 0.028], [x, crown * 0.4, DEPTH * 0.5 + 0.004], {
    chamfer: 0.016, fillet: 0.006, bevel: 0.005,
  })
  box(root, m.amberPaint, [0.05, 0.026, 0.018], [x, crown * 0.4, DEPTH * 0.5 + 0.02], {
    chamfer: 0.008, fillet: 0.004, bevel: 0.004,
  })
}

function build(): { root: Group; sockets: CargoBagSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(55_800, { condition: 0.72 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_CARGO-BAG_ROOT_DEFAULT'

  root.add(extrudeProfile(m.shellShade, bodyProfile(), DEPTH, [0, 0, 0], {
    fillet: 0.06,
    bevel: 0.07,
    capChamfer: 0.09,
    arcSegments: 2,
  }))
  // Rigid base pan: the bag stands because of this, not because fabric is stiff.
  // It is therefore the part in contact, and it takes the floor - drawn at 0.016
  // it put its underside 1.5 mm *below* the deck with the fabric base's own
  // down-facing plane a hair above it.
  groundPad(root, m.graphiteEdge, [LENGTH * 0.82, DEPTH * 0.78], [0, 0, 0], 0.035)

  // Hard end cap on one end only, so the two ends never read the same.
  const capX = LENGTH * 0.5 - 0.02
  box(root, m.shellShade, [0.05, HEIGHT * 0.66, DEPTH * 0.72], [capX, HEIGHT * 0.4, 0], {
    chamfer: 0.055, fillet: 0.02, bevel: 0.014,
  })
  box(root, m.graphite, [0.03, HEIGHT * 0.42, DEPTH * 0.48], [capX + 0.03, HEIGHT * 0.4, 0], {
    chamfer: 0.04, fillet: 0.014, bevel: 0.01,
  })
  statusLens(root, m, [0.05, 0.02], [capX + 0.045, HEIGHT * 0.55, 0], m.cyan, 'right')
  root.add(cylinder(m.steel, 0.016, 0.06, [capX + 0.04, HEIGHT * 0.22, 0], AXIS_X, 8))

  // Where the loft's crown actually is at the three stations that carry webbing.
  // The profile's nominal top is HEIGHT, but the 90 mm cap chamfer and the bevel
  // pull the surface as much as 32 mm below it and the fall is not symmetric, so
  // fractions of HEIGHT put the straps 20 and 39 mm under the fabric and the
  // whole handle inside the bag - a holdall with no handle on it in any tile.
  const CROWN_AFT = 0.388
  const CROWN_FORE = 0.42
  const CROWN_GRIP = 0.418

  // Spine, running the crown between the two compression straps. Short enough to
  // stay on the dome: a bar the length of the bag rides 20 mm of air at one end
  // and buries itself 60 mm at the other.
  box(root, m.fabric, [LENGTH * 0.36, 0.03, 0.09], [-0.03, CROWN_GRIP - 0.01, 0], {
    chamfer: 0.012, fillet: 0.005, bevel: 0.005,
  })
  strap(root, m, -LENGTH * 0.26, CROWN_AFT, DEPTH * 0.9)
  strap(root, m, LENGTH * 0.1, CROWN_FORE, DEPTH * 0.92)

  // Carry handle: two short webbing risers meeting in a wrapped grip. Kept low,
  // because a tall loop on a packed bag stands up only when it is being carried.
  for (const sz of [-1, 1]) {
    box(root, m.fabric, [0.055, 0.05, 0.05], [-0.02, CROWN_GRIP + 0.005, sz * 0.07], {
      chamfer: 0.014, fillet: 0.006, bevel: 0.005,
    })
  }
  root.add(cylinder(m.rubber, 0.02, 0.15, [-0.02, CROWN_GRIP + 0.025, 0], AXIS_Z, 10))
  root.add(cylinder(m.steel, 0.01, 0.04, [-0.02, CROWN_GRIP + 0.025, 0.07], AXIS_Z, 8))

  // Shoulder strap anchor at the soft end, on the flank the loft reaches there.
  // The bag pinches to z = 0.199 at that station, so set out from DEPTH * 0.3
  // the whole anchor sat inside the fabric with 18 mm of the D-ring poking out
  // of the end of the bag.
  const anchorZ = 0.199
  box(root, m.graphiteEdge, [0.055, 0.05, 0.03], [-LENGTH * 0.46, HEIGHT * 0.6, anchorZ], {
    chamfer: 0.014, fillet: 0.006, bevel: 0.005,
  })
  root.add(cylinder(m.steel, 0.018, 0.026, [-LENGTH * 0.46, HEIGHT * 0.6, anchorZ + 0.015], AXIS_X, 8))

  const label = addLabelDecal(bundle, { variant: 51, ground: 0xc9b99e })
  plaque(root, m, label, [0.2, 0.09], [-0.12, HEIGHT * 0.44, DEPTH * 0.5], 'front', m.fabric)
  paintMark(root, m.orangePaint, slashProfile(0.05, 0.11, 0.42), [0.2, HEIGHT * 0.5, DEPTH * 0.5], 'front', 0.008)

  const sockets: CargoBagSockets = {
    carry_handle: socket('carry_handle', [-0.02, HEIGHT * 1.02, 0]),
    shoulder_strap: socket('shoulder_strap', [-LENGTH * 0.5, HEIGHT * 0.6, DEPTH * 0.3]),
    end_cap: socket('end_cap', [capX + 0.08, HEIGHT * 0.4, 0]),
  }
  return { root, sockets, bundle }
}

export function createModel(): CargoBagController {
  const { root, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'cargo-bag',
    reach: 0.12,
    sockets: Object.values(sockets),
  })
  let elapsed = 0
  return {
    root,
    sockets,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      bundle.materials.cyan.emissiveIntensity = 1.55 + Math.sin(elapsed * 2.1) * 0.2
    },
    dispose: finished.dispose,
  }
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  createCargoPreview(createModel(), {
    target: [0, HEIGHT * 0.58, 0],
    distance: 2.1,
    yaw: 0.76,
    pitch: 0.32,
    fov: 30,
    ...options,
  })
