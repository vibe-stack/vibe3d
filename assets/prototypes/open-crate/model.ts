import { Group, Object3D } from 'three/webgpu'

import { cylinder, prism } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  AXIS_Y,
  acquireCargoMaterials,
  addLabelDecal,
  addStripeDecal,
  box,
  boltRun,
  createCargoPreview,
  finishModel,
  groundPad,
  plaque,
  recessedHandle,
  seam,
  socket,
  statusLens,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay open crate — a looted or in-service crate with its lid thrown back.
 *
 * The whole point of this asset is the interior, so the interior is real: a dark
 * liner set in from the shell, four moulded bays with radiused corners, a
 * suspension pad, and a partial load. An open crate whose inside is a black box
 * is worse than no open crate at all, because the player's eye goes straight
 * into it looking for loot.
 */

const WIDTH = 1.06
const DEPTH = 0.78
const HEIGHT = 0.64
const SKIRT = 0.1
const LID = 0.14
const WALL = 0.07
/**
 * How far the hinge pin stands behind the shell's back face.
 *
 * The lid turns about its group origin, and that origin was 40 mm *inside* the
 * back wall, so the leaf's own back edge swept straight through the rim on its
 * way open - the one motion this prop exists to show.
 */
const PIN = 0.012

interface OpenCrateSockets {
  loot_bay_a: Object3D
  loot_bay_b: Object3D
  lid_hinge: Object3D
  stack_top: Object3D
}

export interface OpenCrateController {
  root: Group
  parts: { hull: Group; lid: Group }
  sockets: OpenCrateSockets
  update(deltaSeconds: number): void
  dispose(): void
}

function interior(hull: Group, m: CargoMaterials): void {
  const rimY = HEIGHT - LID
  const innerW = WIDTH - WALL * 2
  const innerD = DEPTH - WALL * 2
  const floorY = SKIRT + 0.07

  // Liner walls, built as four plates so the cavity has thickness at the rim.
  // Each bites 10 mm into the shell wall behind it: sized flush to the shell's
  // inner face the two land on one plane and the cavity has no corner at all.
  box(hull, m.ink, [innerW, 0.02, innerD], [0, floorY, 0], { chamfer: 0.03, fillet: 0.01, bevel: 0.008 })
  for (const sz of [-1, 1]) {
    box(hull, m.graphite, [innerW, rimY - floorY, 0.04], [0, (rimY + floorY) * 0.5, sz * (innerD * 0.5 - 0.01)], {
      chamfer: 0.02, fillet: 0.008, bevel: 0.007,
    })
  }
  for (const sx of [-1, 1]) {
    box(hull, m.graphite, [0.04, rimY - floorY, innerD], [sx * (innerW * 0.5 - 0.01), (rimY + floorY) * 0.5, 0], {
      chamfer: 0.02, fillet: 0.008, bevel: 0.007,
    })
  }

  // Moulded suspension tray. The dark bay floor is the whole footprint and the
  // rubber is a raised cross over it, which is the only arrangement that reads
  // as four bays: four dark blocks laid on a solid pad stand proud of it, so the
  // "bays cut into the pad" rendered as four lumps sitting on top of one.
  const trayY = floorY + 0.035
  box(hull, m.ink, [innerW - 0.05, 0.06, innerD - 0.05], [0, trayY, 0], {
    chamfer: 0.04, fillet: 0.014, bevel: 0.01,
  })
  const bayFloor = trayY + 0.03
  box(hull, m.rubber, [innerW - 0.05, 0.05, 0.06], [0, bayFloor + 0.005, 0], {
    chamfer: 0.018, fillet: 0.008, bevel: 0.007,
  })
  box(hull, m.rubber, [0.06, 0.056, innerD - 0.05], [0, bayFloor + 0.008, 0], {
    chamfer: 0.018, fillet: 0.008, bevel: 0.007,
  })

  // A partial load: two capped canisters seated in the near bays, one bay empty
  // so the crate reads as being worked rather than as a display case.
  for (const sx of [-1, 1]) {
    const x = sx * innerW * 0.23
    const z = innerD * 0.22
    hull.add(cylinder(m.shellShade, 0.088, 0.22, [x, bayFloor + 0.095, z], AXIS_Y, 14))
    hull.add(cylinder(m.graphiteEdge, 0.094, 0.03, [x, bayFloor + 0.185, z], AXIS_Y, 14))
    hull.add(cylinder(m.amberPaint, 0.05, 0.028, [x, bayFloor + 0.21, z], AXIS_Y, 8))
    hull.add(cylinder(m.ink, 0.096, 0.022, [x, bayFloor + 0.055, z], AXIS_Y, 14))
  }
  box(hull, m.graphiteEdge, [innerW * 0.36, 0.09, innerD * 0.3], [-innerW * 0.23, bayFloor + 0.035, -innerD * 0.22], {
    chamfer: 0.03, fillet: 0.012, bevel: 0.009,
  })
}

function hullBody(hull: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  const bodyHeight = HEIGHT - SKIRT - LID
  const bodyY = SKIRT + bodyHeight * 0.5

  box(hull, m.graphite, [WIDTH - 0.02, SKIRT, DEPTH - 0.02], [0, SKIRT * 0.5, 0], {
    chamfer: 0.05, fillet: 0.016, bevel: 0.013, capChamfer: 0.03,
  })
  // The shell is authored as four walls plus a floor, so the opening is a real
  // cavity rather than a solid block with a dark plate laid on top.
  for (const sz of [-1, 1]) {
    box(hull, m.shell, [WIDTH, bodyHeight, WALL], [0, bodyY, sz * (DEPTH * 0.5 - WALL * 0.5)], {
      chamfer: 0.055, fillet: 0.018, bevel: 0.016,
    })
  }
  for (const sx of [-1, 1]) {
    box(hull, m.shell, [WALL, bodyHeight, DEPTH - WALL * 2], [sx * (WIDTH * 0.5 - WALL * 0.5), bodyY, 0], {
      chamfer: 0.055, fillet: 0.018, bevel: 0.016,
    })
  }

  // Corner armour, 10 mm proud of the walls it caps. Drawn 0.12 square its outer
  // faces were exactly the shell's on both axes - eight coplanar pairs, and the
  // corners photographed as speckle rather than as steel.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(hull, m.graphiteEdge, [0.14, bodyHeight, 0.14], [
        sx * (WIDTH * 0.5 - 0.06), bodyY, sz * (DEPTH * 0.5 - 0.06),
      ], { chamfer: 0.042, fillet: 0.013, bevel: 0.01 })
      groundPad(hull, m.amberPaint, [0.13, 0.13], [
        sx * (WIDTH * 0.5 - 0.06), 0, sz * (DEPTH * 0.5 - 0.06),
      ], 0.055)
    }
  }

  const frontZ = DEPTH * 0.5
  seam(hull, m.shell, WIDTH - 0.28, [0, bodyY + 0.09, frontZ], 'front', 'across', 0.026, 0.016)
  const label = addLabelDecal(bundle, { variant: 13 })
  plaque(hull, m, label, [0.28, 0.12], [-0.2, bodyY - 0.06, frontZ], 'front', m.shellLight)
  statusLens(hull, m, [0.09, 0.035], [0.28, bodyY - 0.06, frontZ], m.amber, 'front')
  // On the skirt's own face; measured from the shell's, the plate stood 11 mm
  // clear of the band it is printed on.
  const stripe = addStripeDecal(bundle, { count: 3, lean: -1 })
  plaque(hull, m, stripe, [0.3, 0.07], [0, SKIRT * 0.5, (DEPTH - 0.02) * 0.5], 'front', m.ink)
  // Below the rim, not above it: at 0.22 above the body centre the whole run
  // cleared the top of the wall it fastens and hung in the air over the opening.
  boltRun(hull, m.steel, [-0.36, bodyY + 0.15, -frontZ], [0.36, bodyY + 0.15, -frontZ], 5, 0.015, 'back')

  for (const sx of [-1, 1]) {
    recessedHandle(hull, m, [0.26, 0.1], [sx * WIDTH * 0.5, bodyY, 0], sx > 0 ? 'right' : 'left')
  }
}

function lidBody(lid: Group, m: CargoMaterials): void {
  // The leaf's own centre, measured from a pin that now sits behind the crate
  // rather than 40 mm inside it.
  const leafZ = DEPTH * 0.5 + PIN
  box(lid, m.shellLight, [WIDTH + 0.02, LID, DEPTH + 0.02], [0, LID * 0.5, leafZ], {
    chamfer: 0.07, fillet: 0.022, bevel: 0.016, capChamfer: 0.045,
  })
  box(lid, m.ink, [WIDTH - 0.26, 0.03, DEPTH - 0.2], [0, LID - 0.008, leafZ], {
    chamfer: 0.05, fillet: 0.016, bevel: 0.01,
  })
  // Underside gasket, which is the face a thrown-back lid actually shows.
  box(lid, m.rubber, [WIDTH - 0.14, 0.02, DEPTH - 0.14], [0, -0.006, leafZ], {
    chamfer: 0.035, fillet: 0.012, bevel: 0.008,
  })
  // Knuckles on the pin itself. Drawn 77 mm above the axis and 20 mm inside the
  // leaf, the barrel was neither visible nor where the lid actually turns.
  for (const x of [-0.3, 0.3]) {
    lid.add(prism(m.graphiteEdge, [0.13, 0.09, 0.05], [x, 0, 0.002], {
      chamfer: 0.018, fillet: 0.009, bevel: 0.007,
    }))
    lid.add(cylinder(m.steel, 0.022, 0.17, [x, 0, 0], AXIS_X, 8))
  }
}

function build(): { root: Group; hull: Group; lid: Group; sockets: OpenCrateSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(53_000, { condition: 0.66 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_OPEN-CRATE_ROOT_OPEN'
  const hull = new Group()
  hull.name = 'AXR_CARGO_OPEN-CRATE_PART_HULL_DEFAULT'
  const lid = new Group()
  lid.name = 'AXR_CARGO_OPEN-CRATE_PART_LID_OPEN'
  root.add(hull, lid)

  hullBody(hull, m, bundle)
  interior(hull, m)
  lid.position.set(0, HEIGHT - LID, -(DEPTH * 0.5 + PIN))
  lidBody(lid, m)
  lid.rotation.x = -1.92

  // The bay floor, which is where something dropped into the crate lands. The
  // rear -X bay is already full, so its anchor sits on the stock box in it
  // rather than inside it.
  const bayFloor = SKIRT + 0.135
  const sockets: OpenCrateSockets = {
    loot_bay_a: socket('loot_bay_a', [(WIDTH - WALL * 2) * 0.23, bayFloor + 0.01, -(DEPTH - WALL * 2) * 0.22]),
    loot_bay_b: socket('loot_bay_b', [-(WIDTH - WALL * 2) * 0.23, bayFloor + 0.08, -(DEPTH - WALL * 2) * 0.22]),
    lid_hinge: socket('lid_hinge', [0, HEIGHT - LID, -(DEPTH * 0.5 + PIN)]),
    stack_top: socket('stack_top', [0, HEIGHT - LID, 0]),
  }
  return { root, hull, lid, sockets, bundle }
}

export function createModel(): OpenCrateController {
  const { root, hull, lid, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'open-crate',
    assemblies: [lid],
    reach: 0.15,
    sockets: Object.values(sockets),
  })
  let elapsed = 0
  return {
    root,
    parts: { hull, lid },
    sockets,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      bundle.materials.amber.emissiveIntensity = 2.1 + Math.sin(elapsed * 2.6) * 0.3
    },
    dispose: finished.dispose,
  }
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  createCargoPreview(createModel(), {
    target: [0, HEIGHT * 0.52, 0],
    distance: 2.75,
    yaw: 0.7,
    pitch: 0.42,
    fov: 30,
    ...options,
  })
