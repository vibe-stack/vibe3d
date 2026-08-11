import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
} from 'three/webgpu'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

import {
  bakeOcclusion,
  bakeSurfaceAttributes,
  createWearMaterial,
  mergeStaticByMaterial,
  MaterialLibrary,
  tuneMaterial,
  WEAR_ATTRIBUTES,
  type WearProfile,
  type MaterialHandle,
  cylinder,
  flatPlate,
  prism,
  type Corners,
  type Vec3,
} from '../../../src/asset-forge/generator/index.ts'

/**
 * Proportions solved from the reference render rather than guessed. The bench is
 * a cast three-seat civic unit: two end supports made of a tall rear pillar, a
 * forward arm, and a separate front leg over an open truss bay; a dark seat rail
 * carrying three pale pads; and a tilted back panel with one long amber grille.
 *
 * Length is ~2.4x the overall height and the seat sits a little under half way
 * up, which is what keeps it reading as a bench and not a sofa.
 */
const END_X = 4.85
const END_T = 0.72
const OUTER_X = END_X + END_T * 0.5

const PILLAR_BACK = -2.0
const PILLAR_FRONT = 0.05
const LEG_FRONT = 2.3
const PLINTH_BACK = -2.14
const PLINTH_FRONT = 2.42

const PLINTH_TOP = 0.3
const RISER_TOP = 0.62
const RAIL_BOTTOM = 2.02
const RAIL_TOP = 2.36
const PAD_TOP = 2.66
const ARM_TOP = 2.95
const BACK_BOTTOM = 2.66
const BACK_TOP = 4.92
const PILLAR_TOP = 4.7

const SPAN_X = 4.56
const BACK_HALF = 4.4
const BACK_TILT = -0.13
const BACK_THICKNESS = 0.42
const BACK_CENTRE_Y = (BACK_BOTTOM + BACK_TOP) * 0.5
const BACK_CENTRE_Z = -1.42

interface BenchMaterials {
  shell: MeshPhysicalMaterial
  shellLight: MeshPhysicalMaterial
  shellShadow: MeshPhysicalMaterial
  cushion: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  graphiteEdge: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  amberDim: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
  yellow: MeshPhysicalMaterial
}

/** Extruded along X, so the ring lies in the ZY plane and its corner cuts land
 *  on the profile of the end support - which is the silhouette that reads. */
function profilePrism(
  material: MeshPhysicalMaterial,
  depth: number,
  height: number,
  thickness: number,
  position: Vec3,
  options: { chamfer?: number | Corners; fillet?: number; bevel?: number; tilt?: number; arcSegments?: number } = {},
): ReturnType<typeof prism> {
  return prism(material, [depth, height, thickness], position, {
    chamfer: options.chamfer,
    fillet: options.fillet,
    bevel: options.bevel,
    arcSegments: options.arcSegments,
    rotation: [options.tilt ?? 0, Math.PI / 2, 0],
  })
}

/** The stepped cast foot: a long plinth under both legs, with two raised pads. */
function addFoot(parent: Group, m: BenchMaterials, side: -1 | 1): void {
  const x = side * END_X
  const depth = PLINTH_FRONT - PLINTH_BACK
  const centreZ = (PLINTH_FRONT + PLINTH_BACK) * 0.5

  parent.add(
    profilePrism(m.graphite, depth, PLINTH_TOP, END_T + 0.5, [x, PLINTH_TOP * 0.5, centreZ], {
      chamfer: [0.22, 0.3, 0.3, 0.22],
      fillet: 0.07,
      bevel: 0.09,
    }),
  )
  // One continuous riser between plinth and cheek. Two separate pads read as
  // stilts under the mass; the reference has a single stepped foot.
  parent.add(
    profilePrism(m.graphite, depth - 0.5, 0.26, END_T + 0.2, [x, PLINTH_TOP + 0.12, centreZ], {
      chamfer: [0.16, 0.22, 0.08, 0.08],
      fillet: 0.05,
      bevel: 0.05,
    }),
  )
  // Anchor slots cut into the plinth top, ahead of and behind the riser.
  for (const [z, w] of [[PLINTH_BACK + 0.24, 0.6], [PLINTH_FRONT - 0.22, 0.52]] as const) {
    parent.add(flatPlate(m.ink, [0.52, w], [x - side * 0.02, PLINTH_TOP + 0.005, z], [-Math.PI / 2, 0, 0]))
  }
}

/** The dark truss under the seat, seen through the open bay beside each cheek. */
function addBay(parent: Group, m: BenchMaterials, side: -1 | 1): void {
  const x = side * (END_X - END_T * 0.5 - 0.34)
  const centreZ = 0.1
  const centreY = (RISER_TOP + RAIL_BOTTOM) * 0.5 + 0.24

  // Bottom stringer plus a V of braces: the load path a cast bench would
  // actually need, and the shape the reference shows through the open bay.
  for (const tilt of [0.66, -0.66]) {
    parent.add(
      profilePrism(m.graphite, 2.3, 0.22, 0.24, [x, centreY, centreZ], {
        fillet: 0.05,
        bevel: 0.04,
        tilt,
      }),
    )
  }
  parent.add(
    profilePrism(m.graphite, 3.1, 0.2, 0.22, [x, RISER_TOP + 0.42, centreZ], {
      chamfer: 0.06,
      fillet: 0.04,
      bevel: 0.035,
    }),
  )
}

/**
 * One end support: a single deep cast cheek from the plinth up to the armrest,
 * with a narrower pillar continuing above it to carry the back panel. The two
 * ends deliberately differ - only the near one carries the hazard triangle -
 * because a perfect mirror is the clearest tell of a generated part.
 */
function addEndSupport(parent: Group, m: BenchMaterials, side: -1 | 1): void {
  const x = side * END_X
  const outer = side * OUTER_X
  const cheekDepth = LEG_FRONT - PILLAR_BACK
  const cheekZ = (LEG_FRONT + PILLAR_BACK) * 0.5
  const pillarDepth = PILLAR_FRONT - PILLAR_BACK
  const pillarZ = (PILLAR_FRONT + PILLAR_BACK) * 0.5

  // The cheek. Its graded corner cuts are the whole silhouette: a big cut on
  // the bottom-front so the mass tapers into the plinth, a smaller one at the
  // top-front for the armrest nose, and near-square corners at the back where
  // the pillar continues upward.
  parent.add(
    profilePrism(m.shell, cheekDepth, ARM_TOP - PLINTH_TOP, END_T, [x, (PLINTH_TOP + ARM_TOP) * 0.5, cheekZ], {
      chamfer: [0.02, 1.34, 0.62, 0.26],
      fillet: 0.07,
      bevel: 0.08,
      arcSegments: 2,
    }),
  )
  // Scribed border on the outer cheek: four thin cuts, not a filled plate. A
  // filled panel of a different value reads as a card stuck to the side, which
  // is exactly what it looked like before - the reference has a cut line.
  const scribeDepth = cheekDepth - 1.1
  const scribeHeight = ARM_TOP - PLINTH_TOP - 0.95
  const scribeZ = cheekZ - 0.16
  const scribeY = (PLINTH_TOP + ARM_TOP) * 0.5 - 0.14
  const scribeFace: Vec3 = [outer + side * 0.014, scribeY, scribeZ]
  for (const [dz, dy, w, h] of [
    [0, scribeHeight * 0.5, scribeDepth, 0.045],
    [0, -scribeHeight * 0.5, scribeDepth, 0.045],
    [scribeDepth * 0.5, 0, 0.045, scribeHeight],
    [-scribeDepth * 0.5, 0, 0.045, scribeHeight],
  ] as const) {
    parent.add(
      flatPlate(m.shellShadow, [w, h], [scribeFace[0], scribeFace[1] + dy, scribeFace[2] + dz * side], [0, side * Math.PI * 0.5, 0]),
    )
  }

  // Armrest cap: a lighter band along the top of the cheek.
  parent.add(
    profilePrism(m.shellLight, 1.26, 0.09, END_T - 0.1, [x, ARM_TOP - 0.005, PILLAR_FRONT + 0.62], {
      chamfer: [0.1, 0.62, 0.62, 0.1],
      fillet: 0.05,
      bevel: 0.03,
    }),
  )

  // Rear pillar, narrower in depth than the cheek, carrying the back panel.
  parent.add(
    profilePrism(m.shell, pillarDepth, PILLAR_TOP - ARM_TOP, END_T, [x, (ARM_TOP + PILLAR_TOP) * 0.5, pillarZ], {
      chamfer: [0.34, 0.62, 0.02, 0.02],
      fillet: 0.07,
      bevel: 0.075,
      arcSegments: 2,
    }),
  )
  parent.add(
    flatPlate(m.shellShadow, [pillarDepth - 0.42, 0.045], [outer - side * 0.016, ARM_TOP + 0.34, pillarZ], [0, side * Math.PI * 0.5, 0]),
  )

  // Dark clamp strip where the back panel bolts to the pillar: the strongest
  // value break anywhere on the end support, and it runs with the back's tilt.
  parent.add(
    prism(m.graphite, [0.34, BACK_TOP - BACK_BOTTOM - 0.14, 0.1], [side * 4.46, BACK_CENTRE_Y - 0.02, -1.16], {
      chamfer: [0.1, 0.1, 0.05, 0.05],
      fillet: 0.04,
      bevel: 0.025,
      rotation: [BACK_TILT, 0, 0],
    }),
  )

  // Front-face service pill and the cyan power indicator beneath it.
  parent.add(
    prism(m.graphiteEdge, [0.3, 0.66, 0.1], [x + side * 0.1, 1.78, LEG_FRONT + 0.06], {
      chamfer: 0.12,
      fillet: 0.05,
      bevel: 0.035,
    }),
  )
  parent.add(
    prism(m.ink, [0.34, 0.22, 0.09], [x + side * 0.1, 1.34, LEG_FRONT + 0.06], {
      chamfer: 0.06,
      fillet: 0.035,
      bevel: 0.024,
    }),
  )
  parent.add(
    prism(m.cyan, [0.26, 0.08, 0.04], [x + side * 0.1, 1.34, LEG_FRONT + 0.12], {
      chamfer: 0.03,
      fillet: 0.02,
      bevel: 0.012,
    }),
  )

  // Cast bolt at the pillar shoulder, on the outer cheek.
  parent.add(cylinder(m.ink, 0.08, 0.05, [outer + side * 0.01, PILLAR_TOP - 0.5, pillarZ + 0.2], [0, 0, side * Math.PI * 0.5]))
  parent.add(cylinder(m.graphiteEdge, 0.05, 0.05, [outer + side * 0.035, PILLAR_TOP - 0.5, pillarZ + 0.2], [0, 0, side * Math.PI * 0.5]))

  if (side === -1) {
    // Hazard triangle on one cheek only, seated in a dark recessed plate.
    const plateZ = cheekZ - 0.42
    const plateY = 1.24
    parent.add(
      prism(m.ink, [0.86, 0.78, 0.06], [outer - 0.02, plateY, plateZ], {
        chamfer: 0.16,
        fillet: 0.06,
        bevel: 0.035,
        rotation: [0, -Math.PI / 2, 0],
      }),
    )
    // Outline triangle: three bars, so it reads as a stencilled marking.
    for (const [angle, ox, oy] of [
      [0, 0, -0.2],
      [1.0472, -0.17, 0.1],
      [-1.0472, 0.17, 0.1],
    ] as const) {
      parent.add(flatPlate(m.yellow, [0.46, 0.1], [outer - 0.055, plateY + oy, plateZ + ox], [0, -Math.PI / 2, angle], false))
    }
  }
}

function addSeat(parent: Group, m: BenchMaterials): void {
  const railZ = 0.26
  const railDepth = 3.68

  // Dark structural rail under the pads. Its front face is the value break that
  // separates the pale seat from the pale end supports.
  parent.add(
    prism(m.graphite, [SPAN_X * 2, RAIL_TOP - RAIL_BOTTOM, railDepth], [0, (RAIL_BOTTOM + RAIL_TOP) * 0.5, railZ], {
      chamfer: 0.16,
      fillet: 0.06,
      bevel: 0.05,
    }),
  )
  parent.add(
    prism(m.graphiteEdge, [SPAN_X * 2 - 0.04, 0.12, railDepth + 0.1], [0, RAIL_TOP - 0.03, railZ], {
      chamfer: 0.14,
      fillet: 0.05,
      bevel: 0.04,
    }),
  )

  // Three pads, gapped, with a soft roll on every edge. The pad is the only
  // upholstered surface on the bench, so it takes the largest fillet.
  const padDepth = 3.4
  const padZ = 0.32
  const padWidth = 2.9
  for (const [index, cx] of [-2.98, 0, 2.98].entries()) {
    parent.add(
      prism(m.cushion, [padWidth, PAD_TOP - RAIL_TOP + 0.06, padDepth], [cx, (RAIL_TOP + PAD_TOP) * 0.5, padZ], {
        chamfer: 0.06,
        fillet: 0.13,
        bevel: 0.1,
        arcSegments: 2,
      }),
    )
    // A hairline seam plate in the gap keeps the pads from floating apart.
    if (index < 2) {
      parent.add(
        prism(m.graphiteEdge, [0.1, 0.16, padDepth - 0.2], [cx + 1.49, RAIL_TOP + 0.06, padZ], {
          fillet: 0.03,
          bevel: 0.02,
        }),
      )
    }
  }
}

/** The service box slung under the seat: bolted access hatch plus a vent cage. */
function addUnderframe(parent: Group, m: BenchMaterials): void {
  const top = RAIL_BOTTOM + 0.04
  const bottom = 0.72
  const centreY = (top + bottom) * 0.5
  const height = top - bottom
  const frontZ = 1.46

  parent.add(
    prism(m.graphite, [5.7, height, 2.3], [0.5, centreY, 0.28], {
      chamfer: [0.1, 0.1, 0.4, 0.4],
      fillet: 0.08,
      bevel: 0.06,
    }),
  )
  // Recessed frame, then the bolted hatch plate standing inside it. The plate
  // is dark enough that it has to stay off the wear graph, or a panel this thin
  // rubs through to bare metal across its whole face.
  parent.add(
    prism(m.ink, [4.94, height - 0.26, 0.14], [0.5, centreY - 0.02, frontZ], {
      chamfer: 0.26,
      fillet: 0.08,
      bevel: 0.045,
    }),
  )
  parent.add(
    prism(m.graphiteEdge, [4.6, height - 0.44, 0.08], [0.5, centreY - 0.02, frontZ + 0.1], {
      chamfer: 0.22,
      fillet: 0.07,
      bevel: 0.04,
    }),
  )
  for (const [bx, by] of [
    [-2.0, 0.24],
    [-2.0, -0.26],
    [2.06, 0.26],
    [2.06, -0.24],
  ] as const) {
    parent.add(cylinder(m.ink, 0.06, 0.04, [0.5 + bx, centreY + by, frontZ + 0.14], [Math.PI / 2, 0, 0]))
  }

  // Vent cage outboard of the hatch, its slats cut across the dark opening.
  const ventX = -3.3
  parent.add(
    prism(m.ink, [1.5, height - 0.1, 2.1], [ventX, centreY - 0.03, 0.24], {
      chamfer: [0.08, 0.08, 0.34, 0.34],
      fillet: 0.06,
      bevel: 0.04,
    }),
  )
  for (const y of [-0.26, -0.08, 0.1, 0.28]) {
    parent.add(
      prism(m.graphiteEdge, [1.36, 0.06, 0.08], [ventX, centreY + y, 1.32], { fillet: 0.02, bevel: 0.016 }),
    )
  }
}

/**
 * The back panel and its signature amber grille. The grille is authored as a
 * dark perforated screen with emissive holes, not a bright bar: the reference
 * reads as light escaping through a mesh, and a solid strip loses that entirely.
 */
function addBackrest(parent: Group, m: BenchMaterials): void {
  const panel = new Group()
  panel.name = 'civic-bench / back panel'
  panel.position.set(0, BACK_CENTRE_Y, BACK_CENTRE_Z)
  panel.rotation.x = BACK_TILT
  parent.add(panel)

  const height = BACK_TOP - BACK_BOTTOM
  const front = BACK_THICKNESS * 0.5

  panel.add(
    prism(m.shell, [BACK_HALF * 2, height, BACK_THICKNESS], [0, 0, 0], {
      chamfer: [0.3, 0.3, 0.12, 0.12],
      fillet: 0.09,
      bevel: 0.08,
      arcSegments: 2,
    }),
  )
  // Top cap, slightly lighter, so the panel reads as a pressed shell with a
  // capped top edge rather than one extruded slab.
  panel.add(
    prism(m.shellLight, [BACK_HALF * 2 - 0.26, 0.08, BACK_THICKNESS + 0.02], [0, height * 0.5 - 0.14, 0], {
      chamfer: 0.28,
      fillet: 0.06,
      bevel: 0.03,
    }),
  )
  // Two vertical panel seams divide the back into three bays, matching the pads.
  for (const x of [-1.66, 1.7]) {
    panel.add(flatPlate(m.shellShadow, [0.05, height - 0.3], [x, -0.02, front + 0.008]))
    panel.add(flatPlate(m.shellShadow, [0.05, height - 0.34], [x, -0.02, -front - 0.008], [0, Math.PI, 0]))
  }
  // Recessed grab hatch at the top centre.
  panel.add(
    prism(m.graphiteEdge, [0.94, 0.22, 0.06], [0.1, height * 0.5 - 0.3, front - 0.01], {
      chamfer: 0.06,
      fillet: 0.035,
      bevel: 0.02,
    }),
  )
  panel.add(flatPlate(m.ink, [0.78, 0.1], [0.1, height * 0.5 - 0.3, front + 0.028]))

  // Grille. A dark perforated screen with emissive holes, not a bright bar:
  // the reference reads as light escaping through a mesh, and a solid strip
  // loses that entirely. Each layer clears the one behind it by 0.02 or more,
  // which is what keeps the perforations from being swallowed by the screen.
  const grilleY = -0.14
  const grilleHalf = 3.66
  const grilleHeight = 0.62
  const skew = 0.4

  // Bright lip above and below the opening rather than a solid bezel plate,
  // so nothing stands between the camera and the perforations.
  for (const [ly, lh] of [
    [grilleHeight * 0.5 + 0.07, 0.05],
    [-grilleHeight * 0.5 - 0.07, 0.05],
  ] as const) {
    panel.add(
      prism(m.shellLight, [grilleHalf * 2 + 0.1, lh, 0.05], [0, grilleY + ly, front + 0.012], {
        chamfer: 0.02,
        fillet: 0.016,
        bevel: 0.014,
      }),
    )
  }
  panel.add(
    prism(m.ink, [grilleHalf * 2, grilleHeight, 0.06], [0, grilleY, front + 0.02], {
      chamfer: [0.3, 0.3, 0.3, 0.3],
      fillet: 0.035,
      bevel: 0.018,
    }),
  )
  // Warm screen behind the perforations, so the holes sit in a lit cavity
  // instead of floating on black.
  panel.add(
    prism(m.amberDim, [grilleHalf * 2 - 0.34, grilleHeight - 0.1, 0.03], [0, grilleY, front + 0.055], {
      chamfer: 0.24,
      fillet: 0.02,
      bevel: 0.012,
    }),
  )

  const columns = 56
  const rows = 5
  const pitch = (grilleHalf * 2 - 0.5) / (columns - 1)
  for (let row = 0; row < rows; row += 1) {
    const y = grilleY + (row - (rows - 1) * 0.5) * 0.105
    const stagger = row % 2 === 0 ? 0 : pitch * 0.5
    for (let column = 0; column < columns; column += 1) {
      const x = -grilleHalf + 0.24 + column * pitch + stagger
      // The opening is cut on a slant at both ends, so the rows step in.
      const rise = (row / (rows - 1) - 0.5) * 2
      if (x > grilleHalf - 0.2 - skew * rise) continue
      if (x < -grilleHalf + 0.2 - skew * rise) continue
      panel.add(cylinder(m.amber, 0.038, 0.02, [x, y, front + 0.085], [Math.PI / 2, 0, 0], 6))
    }
  }
}

function acquireBenchMaterials(): {
  materials: BenchMaterials
  handles: MaterialHandle[]
  profiles: Map<MeshPhysicalMaterial, WearProfile>
} {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-11', palette: 'SHELL-200', condition: 'used', wear: 0.07, dirt: 0.06, seed: 2101, uvScale: [1.6, 1.6] })
  const shellLight = library.acquire({ recipeId: 'MAT-11', palette: 'SHELL-200', condition: 'used', wear: 0.05, dirt: 0.05, seed: 2102, uvScale: [1.6, 1.6] })
  const shellShadow = library.acquire({ recipeId: 'MAT-11', palette: 'SLATE-650', condition: 'used', wear: 0.09, dirt: 0.09, seed: 2103, uvScale: [2, 2] })
  const cushion = library.acquire({ recipeId: 'MAT-07', palette: 'SHELL-200', condition: 'used', wear: 0.06, dirt: 0.07, seed: 2701, uvScale: [2.4, 2.4] })
  const graphite = library.acquire({ recipeId: 'MAT-12', palette: 'GRAPHITE-800', condition: 'used', wear: 0.12, dirt: 0.14, seed: 2201, uvScale: [2.2, 2.2] })
  const graphiteEdge = library.acquire({ recipeId: 'MAT-12', palette: 'SLATE-650', condition: 'used', wear: 0.13, dirt: 0.12, seed: 2202, uvScale: [2.2, 2.2] })
  const ink = library.acquire({ recipeId: 'MAT-02', palette: 'INK-950', condition: 'used', wear: 0.08, dirt: 0.16, seed: 2203, uvScale: [2.2, 2.2] })
  const yellow = library.acquire({ recipeId: 'MAT-17', palette: 'AMBER-400', condition: 'used', wear: 0.07, dirt: 0.05, seed: 2204, uvScale: [2, 2] })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'clean', dirt: 0.01, seed: 2901 })
  const amberDim = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'clean', dirt: 0.01, seed: 2902 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'clean', dirt: 0.02, seed: 2903 })

  const materials = {
    shell: tuneMaterial(shell, 0x9dabaf, 0.5, 0.14, { clearcoat: 0.25 }),
    shellLight: tuneMaterial(shellLight, 0xb2bec1, 0.46, 0.14, { clearcoat: 0.25 }),
    shellShadow: tuneMaterial(shellShadow, 0x6f797c, 0.58, 0.12, { clearcoat: 0.15 }),
    cushion: tuneMaterial(cushion, 0xd6d4c9, 0.66, 0.02),
    graphite: tuneMaterial(graphite, 0x323a43, 0.44, 0.42, { clearcoat: 0.25 }),
    graphiteEdge: tuneMaterial(graphiteEdge, 0x414a54, 0.42, 0.42, { clearcoat: 0.25 }),
    ink: tuneMaterial(ink, 0x0e1216, 0.62, 0.26),
    amber: tuneMaterial(amber, 0xffa927, 0.3, 0, { emissive: 2.6 }),
    amberDim: tuneMaterial(amberDim, 0x8a4a08, 0.4, 0, { emissive: 0.9 }),
    cyan: tuneMaterial(cyan, 0x24c6d8, 0.3, 0, { emissive: 0.85 }),
    yellow: tuneMaterial(yellow, 0xe9ad1a, 0.42, 0.3, { clearcoat: 0.2 }),
  }

  // Only the broad painted masses go on the wear graph. The wear system places
  // its rub band a fixed 0.075 from every rim, so any part thinner than about
  // 0.5 has no clean middle left and rubs through to bare metal across its
  // whole face - which turned this bench's plinths, braces, slats, and recess
  // plates into pale speckled metal. The dark hardware is cast, not painted,
  // and stays on plain PBR where it holds its value.
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [materials.shell, { rub: 0.9, grime: 0.9, scratch: 0.8 }],
    [materials.shellLight, { rub: 0.75, grime: 0.7, scratch: 0.7 }],
    [materials.shellShadow, { rub: 0.6, grime: 1.15, scratch: 0.5 }],
    // Upholstery scuffs and soils but never rubs through to metal.
    [materials.cushion, { rub: 0.12, grime: 1.05, scratch: 0.2 }],
  ])

  const handles = [shell, shellLight, shellShadow, cushion, graphite, graphiteEdge, ink, yellow, amber, amberDim, cyan]
  return { handles, materials, profiles }
}

export function createModel(): { root: Group; dispose: () => void } {
  const { materials, handles, profiles } = acquireBenchMaterials()
  const root = new Group()
  root.name = 'civic-bench'

  for (const side of [-1, 1] as const) {
    addFoot(root, materials, side)
    addBay(root, materials, side)
    addEndSupport(root, materials, side)
  }
  addUnderframe(root, materials)
  addSeat(root, materials)
  addBackrest(root, materials)

  bakeOcclusion(root)
  bakeSurfaceAttributes(root, profiles)

  const wearMaterial = createWearMaterial({ name: 'civic-bench / worn shell' })
  const worn = new Set(profiles.keys())
  const mergedGeometries = mergeStaticByMaterial(root, {
    resolveMaterial: (source) => (worn.has(source as MeshPhysicalMaterial) ? wearMaterial : source),
    retainedAttributes: (resolved) => (resolved === wearMaterial ? WEAR_ATTRIBUTES : []),
    meshName: (material) => `civic-bench / ${material.name}`,
  })
  const staticMeshes = root.children.filter((object): object is Mesh => object instanceof Mesh)
  const batchedGeometries = staticMeshes.map((mesh, index) => {
    const source = mergedGeometries[index]
    const indexed = mergeVertices(source, 1e-5)
    mesh.geometry = indexed
    source.dispose()
    return indexed
  })

  return {
    root,
    dispose: () => {
      for (const geometry of batchedGeometries) geometry.dispose()
      wearMaterial.dispose()
      for (const handle of handles) handle.release()
    },
  }
}

export function createPreview(options: { aspect: number }): {
  scene: Scene
  root: Group
  camera: PerspectiveCamera
  dispose: () => void
} {
  const controller = createModel()
  const scene = new Scene()
  scene.name = 'civic-bench / reference-matched preview'
  scene.background = new Color(0x000000)
  scene.add(controller.root)

  // The reference is a hard key from the upper front-left with real falloff:
  // near-white top planes, mid-grey fronts, and undersides crushed toward
  // black. Ambient fill at any strength flattens exactly that relationship, so
  // it stays low and the key carries a shadow map instead.
  const hemi = new HemisphereLight(0x8ea3b4, 0x080b0e, 0.16)
  scene.add(hemi)

  const key = new DirectionalLight(0xfff4e8, 2.35)
  key.position.set(-8.5, 19, 8.5)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.left = -9
  key.shadow.camera.right = 9
  key.shadow.camera.top = 9
  key.shadow.camera.bottom = -9
  key.shadow.camera.near = 4
  key.shadow.camera.far = 44
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.03
  scene.add(key)

  const fill = new DirectionalLight(0x8ea8c0, 0.26)
  fill.position.set(12, 3, 8)
  scene.add(fill)

  // A low bounce so the service box under the seat keeps its bolted plate
  // instead of crushing to a black hole.
  const bounce = new DirectionalLight(0x7d8f9e, 0.34)
  bounce.position.set(-3, -6, 9)
  scene.add(bounce)

  const rim = new DirectionalLight(0xa8bece, 0.34)
  rim.position.set(7, 7, -11)
  scene.add(rim)

  // The grille throws a little warm light onto its own recess and the panel
  // around it - without it the emissive strip reads as a decal.
  for (const sx of [-2.4, 0, 2.4]) {
    const spill = new PointLight(0xff9c2a, 0.22, 2.2, 2)
    spill.position.set(sx, BACK_CENTRE_Y - 0.12, BACK_CENTRE_Z + 0.5)
    scene.add(spill)
  }

  controller.root.traverse((object) => {
    if ((object as { isMesh?: boolean }).isMesh) {
      object.castShadow = true
      object.receiveShadow = true
    }
  })

  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1.25
  const camera = new PerspectiveCamera(30, aspect, 1, 120)
  camera.name = 'civic-bench / reference camera'
  const yaw = (34 * Math.PI) / 180
  const pitch = (14 * Math.PI) / 180
  const distance = 20
  const target = 2.4
  const horizontal = distance * Math.cos(pitch)
  camera.position.set(-horizontal * Math.sin(yaw), target + distance * Math.sin(pitch), horizontal * Math.cos(yaw))
  camera.lookAt(0, target, 0)
  scene.add(camera)

  return {
    scene,
    root: controller.root,
    camera,
    dispose: () => {
      scene.remove(controller.root)
      controller.dispose()
    },
  }
}
