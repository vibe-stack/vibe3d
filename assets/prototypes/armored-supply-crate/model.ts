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
  type BufferGeometry,
} from 'three/webgpu'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

import {
  bakeOcclusion,
  bakeSurfaceAttributes,
  createWearMaterial,
  cylinder,
  extrudeProfile,
  flatPlate,
  groove,
  MaterialLibrary,
  mergeStaticByMaterial,
  prism,
  tuneMaterial,
  WEAR_ATTRIBUTES,
  type MaterialHandle,
  type StaticBatchOptions,
  type Vec2,
  type Vec3,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'

/**
 * A dropped armoured supply container, solved from the reference render rather
 * than guessed. The read is a single dark shell held inside a pale armour frame:
 * a capped top and base, two vertical side rails, four near-black corner
 * brackets, and - the landmark that carries the whole prop - a large octagonal
 * opening cut through that frame, its edge rolled into a mint lip, with the
 * shell's recessed front face sitting well behind it.
 *
 * The container is a little over half again as wide as it is tall, and roughly
 * as deep as it is tall, which is what keeps it reading as a two-man freight box
 * instead of a wall panel.
 */
const HALF_W = 1.38
const TOP_Y = 2.0

/** Front plane of the armour frame; the shell's face sits 0.14 behind it. */
const FRAME_Z = 0.95
const BODY_Z = 0.74

/** Face-local origin. Every front-face feature is authored around this height. */
const FACE_Y = 0.99

/** The octagonal opening. Its straight edges are exactly the inner edges of the
 *  caps and side rails, so the frame needs no separate border pieces.
 *
 *  Measured off the reference rather than eyeballed: the 45-degree cut is ~10%
 *  of face width there, not the 13% it was first built at, and an oversized cut
 *  turns the four corner gussets into the strongest shapes on the prop. */
const OPEN_X = 1.07
const OPEN_Y = 0.85
const OPEN_C = 0.28

const CAP_TOP_H = TOP_Y - (FACE_Y + OPEN_Y)
const CAP_BASE_H = FACE_Y - OPEN_Y
const RAIL_W = HALF_W - OPEN_X
const FRAME_D = FRAME_Z * 2
/** The caps stand 0.015 proud of the rails and gussets - enough for the cap to
 *  read as the front layer, not enough to become a shelf in the silhouette. */
const CAP_D = FRAME_D + 0.012

interface CrateMaterials {
  shell: MeshPhysicalMaterial
  shellDeep: MeshPhysicalMaterial
  lip: MeshPhysicalMaterial
  cap: MeshPhysicalMaterial
  sill: MeshPhysicalMaterial
  rail: MeshPhysicalMaterial
  bracket: MeshPhysicalMaterial
  trim: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  decal: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  amberLit: MeshPhysicalMaterial
}

/** Ring of the octagonal opening, optionally grown or shrunk along its normal. */
function openingProfile(inset: number): Vec2[] {
  const x = OPEN_X - inset
  const y = OPEN_Y - inset
  const c = OPEN_C
  return [
    [x, y - c],
    [x - c, y],
    [-x + c, y],
    [-x, y - c],
    [-x, -y + c],
    [-x + c, -y],
    [x - c, -y],
    [x, -y + c],
  ]
}

/**
 * One corner bracket of the frame: the pentagon left over between a cap, a side
 * rail, and the opening's 45-degree cut. Mirroring reverses the winding, so the
 * ring is flipped back to counter-clockwise or the fillet normals invert.
 */
function bracketProfile(sx: -1 | 1, sy: -1 | 1): Vec2[] {
  // Authored counter-clockwise for the top-left corner. The gusset stops at the
  // cap line rather than climbing over it: in the reference the pale cap is one
  // unbroken bar across the whole width, and the dark corners begin below it.
  const ring: Vec2[] = [
    [-HALF_W, OPEN_Y - OPEN_C],
    [-OPEN_X, OPEN_Y - OPEN_C],
    [-OPEN_X + OPEN_C, OPEN_Y],
    [-HALF_W, OPEN_Y],
  ]
  const placed = ring.map(([x, y]): Vec2 => [x * -sx, y * sy])
  // A single mirror reverses the winding; two restore it.
  return sx * sy < 0 ? placed : placed.slice().reverse()
}

/**
 * The pale armour frame: capped top and base, two side rails, four gussets.
 *
 * The caps run the full silhouette width and stand proud of everything else, so
 * the top edge reads as one unbroken pale bar with the dark corners beginning
 * below it - which is the reference's strongest single value statement.
 */
function addFrame(parent: Group, m: CrateMaterials): void {
  parent.add(
    prism(m.cap, [HALF_W * 2, CAP_TOP_H, CAP_D], [0, TOP_Y - CAP_TOP_H * 0.5, 0], {
      chamfer: [0.07, 0.07, 0.02, 0.02],
      fillet: 0.03,
      bevel: 0.018,
    }),
  )
  parent.add(
    prism(m.sill, [HALF_W * 2, CAP_BASE_H, CAP_D], [0, CAP_BASE_H * 0.5, 0], {
      chamfer: [0.02, 0.02, 0.06, 0.06],
      fillet: 0.03,
      bevel: 0.018,
    }),
  )
  // Side rails run between the two caps and are extruded along X, so their
  // corner cuts land on the depth profile - the edge that shapes the silhouette
  // when the crate is seen at an angle.
  for (const side of [-1, 1] as const) {
    parent.add(
      prism(m.rail, [FRAME_D, TOP_Y - CAP_TOP_H - CAP_BASE_H + 0.02, RAIL_W], [side * (HALF_W - RAIL_W * 0.5), FACE_Y, 0], {
        chamfer: 0.08,
        fillet: 0.04,
        bevel: 0.05,
        rotation: [0, Math.PI / 2, 0],
      }),
    )
  }
}

function addCornerBrackets(parent: Group, m: CrateMaterials): void {
  for (const sx of [-1, 1] as const) {
    for (const sy of [-1, 1] as const) {
      const ring = bracketProfile(sx, sy)
      parent.add(
        extrudeProfile(m.bracket, ring, FRAME_D, [0, FACE_Y, 0], {
          fillet: 0.035,
          bevel: 0.035,
        }),
      )
      // The bright diagonal stroke. This is the corner's whole read in the
      // reference: a near-white chamfer running the length of the 45-degree cut,
      // with a second, shorter stroke stepped in behind it. An L of trim along
      // the outer borders was tried first and reads as a painted panel line -
      // the light has to be on the diagonal, because that is the edge the key
      // actually catches on a bolted-on wedge.
      // Offset outward along the corner's own normal so the stroke lands on the
      // gusset. Step further than about 0.08 and the far end runs off the wedge
      // onto the cap and the rail, which reads as two crossed sticks.
      const step = 0.07 * Math.SQRT1_2
      parent.add(
        prism(m.trim, [OPEN_C * Math.SQRT2 - 0.09, 0.028, 0.04], [
          sx * (OPEN_X - OPEN_C * 0.5 + step),
          FACE_Y + sy * (OPEN_Y - OPEN_C * 0.5 + step),
          FRAME_Z + 0.015,
        ], {
          fillet: 0.014,
          bevel: 0.016,
          rotation: [0, 0, sx * sy > 0 ? -Math.PI / 4 : Math.PI / 4],
        }),
      )
      parent.add(
        prism(m.bracket, [RAIL_W, 0.24, 0.14], [sx * (HALF_W - RAIL_W * 0.5), FACE_Y + sy * (OPEN_Y - OPEN_C - 0.13), FRAME_Z - 0.07], {
          chamfer: [0.05, 0.05, 0.05, 0.05],
          fillet: 0.03,
          bevel: 0.03,
        }),
      )
      // The bracket wraps the corner: a matching plate on the side wall, and a
      // deliberately unequal pair of cast bolts on it.
      parent.add(
        prism(m.bracket, [0.4, 0.44, 0.09], [sx * (HALF_W - 0.005), FACE_Y + sy * 0.66, FRAME_Z - 0.28], {
          chamfer: [0.12, 0.05, 0.05, 0.12],
          fillet: 0.04,
          bevel: 0.03,
          rotation: [0, sx * Math.PI * 0.5, 0],
        }),
      )
      // Front-face bolt on the bracket, offset differently top and bottom so the
      // four corners are not a perfect mirror of one another.
      parent.add(
        cylinder(m.steel, 0.042, 0.03, [sx * (HALF_W - 0.15), FACE_Y + sy * (OPEN_Y - OPEN_C * 0.5 - (sy > 0 ? 0 : 0.03)), FRAME_Z + 0.03], [Math.PI * 0.5, 0, 0]),
      )
    }
  }
}

/** The rolled mint lip around the opening: eight mitred bars, four of them at
 *  45 degrees. A single ring cannot carry the corner facets, and the visible
 *  joints are what the reference shows anyway. */
function addOpeningLip(parent: Group, m: CrateMaterials): void {
  const width = 0.1
  const depth = 0.13
  const z = FRAME_Z - 0.12
  const straightX = (OPEN_X - OPEN_C) * 2 + width * 1.2
  const straightY = (OPEN_Y - OPEN_C) * 2 + width * 1.2
  const diagonal = OPEN_C * Math.SQRT2 + width * 1.2

  for (const sy of [-1, 1] as const) {
    parent.add(
      prism(m.lip, [straightX, width, depth], [0, FACE_Y + sy * OPEN_Y, z], { fillet: 0.03, bevel: 0.035 }),
    )
  }
  for (const sx of [-1, 1] as const) {
    parent.add(
      prism(m.lip, [width, straightY, depth], [sx * OPEN_X, FACE_Y, z], { fillet: 0.03, bevel: 0.035 }),
    )
  }
  for (const sx of [-1, 1] as const) {
    for (const sy of [-1, 1] as const) {
      const cx = sx * (OPEN_X - OPEN_C * 0.5)
      const cy = sy * (OPEN_Y - OPEN_C * 0.5)
      parent.add(
        prism(m.lip, [diagonal, width, depth], [cx, FACE_Y + cy, z], {
          fillet: 0.03,
          bevel: 0.035,
          rotation: [0, 0, sx * sy > 0 ? -Math.PI / 4 : Math.PI / 4],
        }),
      )
    }
  }
}

/** Everything sitting on the recessed shell face inside the opening. */
function addRecessDetail(parent: Group, m: CrateMaterials): void {
  const floor = BODY_Z
  // Inner panel, a shade deeper than the shell and tucked under the lip.
  parent.add(
    extrudeProfile(m.shellDeep, openingProfile(0.02), 0.05, [0, FACE_Y, floor + 0.005], {
      fillet: 0.04,
      bevel: 0.03,
    }),
  )
  const face = floor + 0.03
  const mark = face + 0.02

  // Two recessed bolt rings inboard of every 45-degree corner, stepped along the
  // diagonal so they follow the cut rather than sitting on an axis-aligned grid.
  for (const sx of [-1, 1] as const) {
    for (const sy of [-1, 1] as const) {
      const cx = sx * (OPEN_X - OPEN_C * 0.5 - 0.14)
      const cy = sy * (OPEN_Y - OPEN_C * 0.5 - 0.14)
      for (const along of [-0.2, 0.2] as const) {
        // The corner's diagonal runs along (sx, -sy) in face space.
        const x = cx + along * sx
        const y = FACE_Y + cy - along * sy
        parent.add(cylinder(m.steel, 0.066, 0.04, [x, y, face + 0.012], [Math.PI * 0.5, 0, 0], 12))
        parent.add(cylinder(m.ink, 0.042, 0.05, [x, y, face + 0.014], [Math.PI * 0.5, 0, 0], 12))
      }
    }
  }

  // Recessed grab handle at the top centre of the panel.
  parent.add(
    prism(m.ink, [0.66, 0.13, 0.04], [0.03, FACE_Y + 0.58, face + 0.005], {
      chamfer: 0.04,
      fillet: 0.025,
      bevel: 0.02,
    }),
  )
  parent.add(
    prism(m.cap, [0.58, 0.075, 0.05], [0.03, FACE_Y + 0.585, face + 0.035], {
      chamfer: 0.03,
      fillet: 0.02,
      bevel: 0.018,
    }),
  )

  // Stencilled unit number: a pale plate split by two cut dividers, which is how
  // the reference's "3960 42 7" reads at this distance.
  const stencil: Vec3 = [-0.38, FACE_Y + 0.24, mark]
  parent.add(flatPlate(m.decal, [0.52, 0.15], stencil, [0, 0, 0], false))
  // Seven digit strokes, grouped 4-2-1 with the group gaps wider than the digit
  // gaps - that grouping is the whole read of "3960 42 7" at silhouette scale.
  for (const dx of [-0.215, -0.16, -0.105, -0.05, 0.055, 0.11, 0.205]) {
    parent.add(flatPlate(m.ink, [0.026, 0.1], [stencil[0] + dx, stencil[1], mark + 0.004], [0, 0, 0], false))
  }
  for (const dx of [-0.005, 0.155]) {
    parent.add(flatPlate(m.ink, [0.012, 0.15], [stencil[0] + dx, stencil[1], mark + 0.004], [0, 0, 0], false))
  }
  parent.add(flatPlate(m.ink, [0.46, 0.026], [stencil[0], stencil[1] - 0.11, mark], [0, 0, 0], false))

  // Service placard on the opposite side, weighted with a few text bands.
  const placard: Vec3 = [0.62, FACE_Y + 0.3, mark]
  parent.add(flatPlate(m.decal, [0.21, 0.29], placard, [0, 0, 0], false))
  for (const [index, dy] of [0.095, 0.045, -0.005, -0.055, -0.1].entries()) {
    const w = index === 0 ? 0.16 : 0.14 - (index % 2) * 0.04
    parent.add(flatPlate(m.ink, [w, 0.014], [placard[0] - 0.015, placard[1] + dy, mark + 0.004], [0, 0, 0], false))
  }

  // Directional arrows near the top corners of the recess.
  for (const sx of [-1, 1] as const) {
    const ax = sx * 0.74
    const ay = FACE_Y + 0.62
    parent.add(flatPlate(m.decal, [0.15, 0.02], [ax, ay, mark], [0, 0, 0], false))
    parent.add(flatPlate(m.decal, [0.05, 0.05], [ax - sx * 0.09, ay, mark], [0, 0, Math.PI * 0.25], false))
  }

  // Warning strip along the bottom of the recess: three small amber plates,
  // spaced unevenly so they do not read as a generated array.
  for (const [x, w] of [[-0.44, 0.24], [0.02, 0.17], [0.42, 0.28]] as const) {
    parent.add(
      prism(m.amber, [w, 0.075, 0.03], [x, FACE_Y - 0.6, face + 0.015], { fillet: 0.015, bevel: 0.012 }),
    )
  }

  // A long weld seam running the height of the panel, off centre.
  parent.add(groove(m.shellDeep, 1.1, 0.03, 0.016, [-0.86, FACE_Y - 0.05, face + 0.004], [0, 0, Math.PI * 0.5]))
}

/**
 * Hardware on the top cap. Everything here is flush or inset: the reference's
 * top edge is an unbroken straight line, so nothing on this face is allowed to
 * break the silhouette.
 *
 * `prism` extrudes along its own local z, so a plate lying flat on the cap is
 * authored as [width, depth, thickness] and rolled a quarter turn about X - not
 * as [width, thickness, depth], which stands the plate on edge.
 */
function addTopHardware(parent: Group, m: CrateMaterials): void {
  const top = TOP_Y
  const flat: Vec3 = [-Math.PI * 0.5, 0, 0]

  // Central latch: a shallow seat inset into the cap carrying three dark slots.
  parent.add(
    prism(m.rail, [0.82, 0.46, 0.05], [0.04, top - 0.005, 0.1], {
      chamfer: 0.09,
      fillet: 0.035,
      bevel: 0.022,
      rotation: flat,
    }),
  )
  for (const dx of [-0.24, 0.02, 0.28]) {
    parent.add(
      prism(m.ink, [0.18, 0.24, 0.03], [0.04 + dx, top + 0.008, 0.1], {
        chamfer: 0.035,
        fillet: 0.02,
        bevel: 0.014,
        rotation: flat,
      }),
    )
  }

  // Two square anchor pads to one side, two round bolt bosses to the other, so
  // the cap is not symmetric across its length.
  for (const dx of [-0.94, -0.66]) {
    parent.add(
      prism(m.ink, [0.2, 0.2, 0.035], [dx, top + 0.004, 0.16], {
        chamfer: 0.045,
        fillet: 0.02,
        bevel: 0.016,
        rotation: flat,
      }),
    )
    parent.add(cylinder(m.steel, 0.055, 0.03, [dx, top - 0.002, 0.16]))
  }
  for (const dx of [0.72, 0.92]) {
    parent.add(cylinder(m.ink, 0.085, 0.05, [dx, top - 0.012, 0.18], [0, 0, 0], 10))
    parent.add(cylinder(m.steel, 0.05, 0.03, [dx, top - 0.004, 0.18], [0, 0, 0], 10))
  }

  // Lifting slot cut into the cap behind the latch.
  parent.add(groove(m.rail, 0.9, 0.07, 0.035, [0.04, top + 0.001, -0.34], [-Math.PI * 0.5, 0, Math.PI * 0.5]))
}

/** Latch tabs and a stencil band on the base cap and side rails. */
function addFrameHardware(parent: Group, m: CrateMaterials): void {
  // Base latch panel, mirroring the top one.
  parent.add(
    prism(m.rail, [0.86, 0.11, 0.05], [0.02, 0.115, FRAME_Z + 0.02], {
      chamfer: 0.05,
      fillet: 0.025,
      bevel: 0.022,
    }),
  )
  parent.add(flatPlate(m.ink, [0.7, 0.035], [0.02, 0.115, FRAME_Z + 0.05], [0, 0, 0], false))

  // Small vertical latch tabs on the side rails, two per side at different
  // heights so the left and right rails read as separate parts.
  for (const sx of [-1, 1] as const) {
    const heights = sx < 0 ? [0.62, 1.36] : [0.5, 1.24]
    for (const y of heights) {
      parent.add(
        prism(m.ink, [0.075, 0.21, 0.04], [sx * (HALF_W - RAIL_W * 0.5), y, FRAME_Z + 0.005], {
          chamfer: 0.025,
          fillet: 0.018,
          bevel: 0.015,
        }),
      )
      parent.add(
        prism(m.ink, [0.26, 0.2, 0.03], [sx * (HALF_W - 0.005), y, FRAME_Z - 0.42], {
          chamfer: 0.05,
          fillet: 0.025,
          bevel: 0.02,
          rotation: [0, sx * Math.PI * 0.5, 0],
        }),
      )
    }
  }
}

/**
 * The cargo bay behind the hatch. The caps and rails are full-depth, so they
 * already form four walls of the tube; this closes the back and lines it, and
 * puts one amber strip inside so the opening reads as a lit volume rather than
 * a black hole cut in the front.
 */
function addInterior(parent: Group, m: CrateMaterials): void {
  const back = -FRAME_Z + 0.1
  parent.add(
    prism(m.shell, [HALF_W * 2 - 0.02, TOP_Y - 0.02, 0.2], [0, TOP_Y * 0.5, back], {
      chamfer: 0.08,
      fillet: 0.04,
      bevel: 0.05,
    }),
  )
  parent.add(
    prism(m.ink, [OPEN_X * 2 - 0.04, OPEN_Y * 2 - 0.04, 0.05], [0, FACE_Y, back + 0.125], {
      chamfer: OPEN_C,
      fillet: 0.05,
      bevel: 0.03,
    }),
  )
  // Shelf and crated contents, kept coarse: they are only ever seen edge-on
  // through the open hatch, and anything finer is triangles nobody looks at.
  parent.add(
    prism(m.rail, [OPEN_X * 2 - 0.12, 0.07, 1.2], [0, FACE_Y - 0.02, back + 0.72], {
      chamfer: 0.05,
      fillet: 0.03,
      bevel: 0.025,
    }),
  )
  for (const [x, w, h] of [[-0.62, 0.7, 0.42], [0.28, 0.52, 0.5], [0.86, 0.34, 0.3]] as const) {
    parent.add(
      prism(m.bracket, [w, h, 0.62], [x, FACE_Y + 0.02 + h * 0.5, back + 0.55], {
        chamfer: 0.05,
        fillet: 0.03,
        bevel: 0.03,
      }),
    )
  }
  parent.add(
    prism(m.amberLit, [OPEN_X * 2 - 0.3, 0.05, 0.04], [0, FACE_Y + OPEN_Y - 0.12, back + 0.2], {
      fillet: 0.015,
      bevel: 0.012,
    }),
  )
}

function acquireCrateMaterials(): {
  materials: CrateMaterials
  handles: MaterialHandle[]
  profiles: Map<MeshPhysicalMaterial, WearProfile>
} {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-11', palette: 'FOREST-800', condition: 'used', wear: 0.12, dirt: 0.12, seed: 3101, uvScale: [1.8, 1.8] })
  const shellDeep = library.acquire({ recipeId: 'MAT-11', palette: 'FOREST-900', condition: 'used', wear: 0.1, dirt: 0.16, seed: 3102, uvScale: [2, 2] })
  const lip = library.acquire({ recipeId: 'MAT-11', palette: 'SEA-500', condition: 'used', wear: 0.16, dirt: 0.08, seed: 3103, uvScale: [2.4, 2.4] })
  const cap = library.acquire({ recipeId: 'MAT-11', palette: 'BONE-200', condition: 'used', wear: 0.14, dirt: 0.14, seed: 3104, uvScale: [1.6, 1.6] })
  const sill = library.acquire({ recipeId: 'MAT-11', palette: 'BONE-300', condition: 'used', wear: 0.16, dirt: 0.22, seed: 3106, uvScale: [1.6, 1.6] })
  const rail = library.acquire({ recipeId: 'MAT-11', palette: 'SLATE-400', condition: 'used', wear: 0.13, dirt: 0.12, seed: 3105, uvScale: [1.8, 1.8] })
  const bracket = library.acquire({ recipeId: 'MAT-12', palette: 'INK-900', condition: 'used', wear: 0.1, dirt: 0.14, seed: 3201 })
  const trim = library.acquire({ recipeId: 'MAT-12', palette: 'SEA-600', condition: 'used', wear: 0.12, dirt: 0.1, seed: 3206 })
  const ink = library.acquire({ recipeId: 'MAT-02', palette: 'INK-950', condition: 'used', wear: 0.06, dirt: 0.16, seed: 3202 })
  const steel = library.acquire({ recipeId: 'MAT-04', palette: 'STEEL-500', condition: 'used', wear: 0.2, dirt: 0.08, seed: 3203 })
  const decal = library.acquire({ recipeId: 'MAT-17', palette: 'BONE-100', condition: 'used', wear: 0.05, dirt: 0.06, seed: 3204 })
  const amber = library.acquire({ recipeId: 'MAT-17', palette: 'AMBER-500', condition: 'used', wear: 0.08, dirt: 0.08, seed: 3205 })
  const amberLit = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'clean', dirt: 0.01, seed: 3207 })

  const materials: CrateMaterials = {
    shell: tuneMaterial(shell, 0x162024, 0.58, 0.24, { clearcoat: 0.18 }),
    shellDeep: tuneMaterial(shellDeep, 0x232e30, 0.78, 0.06),
    lip: tuneMaterial(lip, 0x55695f, 0.52, 0.26, { clearcoat: 0.22 }),
    cap: tuneMaterial(cap, 0xd9cfb4, 0.46, 0.18, { clearcoat: 0.28 }),
    sill: tuneMaterial(sill, 0x9e9784, 0.54, 0.18, { clearcoat: 0.2 }),
    rail: tuneMaterial(rail, 0x2e3b43, 0.52, 0.24, { clearcoat: 0.2 }),
    bracket: tuneMaterial(bracket, 0x2b363e, 0.5, 0.38),
    // Corner trim is off the wear graph on purpose: it is 0.03 wide, so the rub
    // band reaches clean across it and turns every line into bare metal.
    trim: tuneMaterial(trim, 0x7c8c81, 0.44, 0.36, { clearcoat: 0.28 }),
    ink: tuneMaterial(ink, 0x0a0e0f, 0.62, 0.24),
    steel: tuneMaterial(steel, 0x99a0a2, 0.38, 0.72),
    decal: tuneMaterial(decal, 0xd8d5c9, 0.6, 0.06),
    amber: tuneMaterial(amber, 0x8f6d24, 0.56, 0.28),
    amberLit: tuneMaterial(amberLit, 0xffa42a, 0.3, 0, { emissive: 2.4 }),
  }

  // Only the broad painted masses go on the wear graph. The rub band is placed a
  // fixed distance from every rim, so thin hardware would rub through to bare
  // metal across its whole face and lose its value.
  // The shell is the darkest thing on the prop, so it takes the least wear of
  // anything: bare metal and dust both sit near 0.5 luminance, and at civic-bench
  // levels they swamp a 0.05-luminance paint and turn the whole face pale grey.
  // Only the pale armour frame, which is already near the wear colours, can carry
  // a full-strength profile.
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [materials.shell, { rub: 0.32, grime: 0.45, scratch: 0.4 }],
    [materials.lip, { rub: 0.22, grime: 0.4, scratch: 0.4 }],
    [materials.cap, { rub: 0.2, grime: 0.55, scratch: 0.5 }],
    [materials.sill, { rub: 0.16, grime: 1.0, scratch: 0.45 }],
    [materials.rail, { rub: 0.04, grime: 0.55, scratch: 0.28 }],
  ])

  const handles = [shell, shellDeep, lip, cap, sill, rail, bracket, trim, ink, steel, decal, amber, amberLit]
  return { handles, materials, profiles }
}

/** Hinge line: the outer edge of the hatch's left jamb, on the frame's face. */
const HINGE_X = -(OPEN_X + 0.03)
const HINGE_Z = BODY_Z + 0.04
const HATCH_OPEN_ANGLE = -1.92

export interface CrateController {
  root: Group
  update(deltaSeconds: number): void
  toggleHatch(): void
  isOpen(): boolean
  dispose(): void
}

export function createModel(): CrateController {
  const { materials, handles, profiles } = acquireCrateMaterials()
  const root = new Group()
  root.name = 'armored-supply-crate'

  // The hatch and everything printed on it ride one pivot on the left jamb. The
  // assembly cancels the pivot's offset so its parts stay authored in the same
  // face coordinates as the static frame around them.
  const hatchPivot = new Group()
  hatchPivot.name = 'armored-supply-crate / hatch hinge'
  hatchPivot.position.set(HINGE_X, 0, HINGE_Z)
  const hatch = new Group()
  hatch.name = 'armored-supply-crate / hatch'
  hatch.position.set(-HINGE_X, 0, -HINGE_Z)
  hatchPivot.add(hatch)

  addInterior(root, materials)
  addFrame(root, materials)
  addCornerBrackets(root, materials)
  addTopHardware(root, materials)
  addFrameHardware(root, materials)
  addOpeningLip(hatch, materials)
  addRecessDetail(hatch, materials)

  // Bake with the hatch shut and in place: the occlusion pass has to see the
  // frame and the hatch as neighbours, or the seam between them collects no
  // grime and the hatch reads as a decal floating on an open hole.
  root.add(hatchPivot)
  bakeOcclusion(root)
  bakeSurfaceAttributes(root, profiles)

  const wearMaterial = createWearMaterial({ name: 'armored-supply-crate / worn shell' })
  const worn = new Set(profiles.keys())
  const batchOptions: StaticBatchOptions = {
    resolveMaterial: (source) => (worn.has(source as MeshPhysicalMaterial) ? wearMaterial : source),
    retainedAttributes: (resolved) => (resolved === wearMaterial ? WEAR_ATTRIBUTES : []),
    meshName: (material) => `armored-supply-crate / ${material.name}`,
  }

  // Merge the static frame and the hatch independently, each flattened into its
  // own group's local space, so the pivot still moves every hatch triangle.
  root.remove(hatchPivot)
  const mergedStatic = mergeStaticByMaterial(root, batchOptions)
  const mergedHatch = mergeStaticByMaterial(hatch, batchOptions)
  root.add(hatchPivot)

  const reindex = (group: Group, merged: BufferGeometry[]): BufferGeometry[] =>
    group.children
      .filter((object): object is Mesh => object instanceof Mesh)
      .map((mesh, index) => {
        const source = merged[index]
        const indexed = mergeVertices(source, 1e-5)
        mesh.geometry = indexed
        source.dispose()
        return indexed
      })
  const batchedGeometries = [...reindex(root, mergedStatic), ...reindex(hatch, mergedHatch)]

  let angle = 0
  let target = 0

  return {
    root,
    update: (deltaSeconds: number) => {
      const delta = Math.min(Math.max(deltaSeconds, 0), 0.1)
      // Critically-damped-ish approach rather than a linear ramp: a heavy
      // armoured door leaves its stop quickly and eases into the end of travel.
      angle += (target - angle) * (1 - Math.exp(-delta * 3.4))
      hatchPivot.rotation.y = angle
    },
    toggleHatch: () => {
      target = target === 0 ? HATCH_OPEN_ANGLE : 0
    },
    isOpen: () => target !== 0,
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
  update: (deltaSeconds: number) => void
  toggleHatch: () => void
  isOpen: () => boolean
  dispose: () => void
} {
  const controller = createModel()
  const scene = new Scene()
  scene.name = 'armored-supply-crate / reference-matched preview'
  scene.background = new Color(0x0a0d10)
  scene.add(controller.root)

  // The reference is a bright warm interior: a hard key from the upper front
  // left, a cool bounce off the deck, and undersides that still hold detail.
  //
  // The exposure is deliberately low. The shell is a 0.05-luminance paint, and
  // the capture tone-maps with ACES, which desaturates and lifts anything it has
  // to roll off - at kit-standard intensities the whole dark face washed out to
  // pale grey while the pale frame stayed on the shoulder, collapsing the one
  // value break the prop is built around.
  scene.add(new HemisphereLight(0x93a8b8, 0x0a0d0f, 0.18))

  const key = new DirectionalLight(0xfff2e2, 1.35)
  key.position.set(-4.2, 10.5, 4.0)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.left = -3.4
  key.shadow.camera.right = 3.4
  key.shadow.camera.top = 3.4
  key.shadow.camera.bottom = -3.4
  key.shadow.camera.near = 2
  key.shadow.camera.far = 26
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.02
  scene.add(key)

  const fill = new DirectionalLight(0x93a8b8, 0.24)
  fill.position.set(-3.2, 1.6, 8.5)
  scene.add(fill)

  const rim = new DirectionalLight(0xa9c0d2, 0.26)
  rim.position.set(5, 5.5, -7)
  scene.add(rim)

  // Spill from the amber strip inside the bay. Preview lighting only - it never
  // travels with the exported mesh.
  const bayGlow = new PointLight(0xff9c2a, 0.9, 1.5, 2)
  bayGlow.position.set(0, FACE_Y + 0.34, -0.8)
  bayGlow.userData.excludeFromExport = true
  scene.add(bayGlow)

  controller.root.traverse((object) => {
    if ((object as { isMesh?: boolean }).isMesh) {
      object.castShadow = true
      object.receiveShadow = true
    }
  })

  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1.25
  const camera = new PerspectiveCamera(30, aspect, 0.6, 60)
  camera.name = 'armored-supply-crate / reference camera'
  // Near-frontal: the reference shows the whole front face with only a sliver of
  // the right wall, so the yaw stays small and the pitch stays gentle.
  const yaw = (-15 * Math.PI) / 180
  const pitch = (8 * Math.PI) / 180
  const distance = 7.4
  const target = 1.02
  const horizontal = distance * Math.cos(pitch)
  camera.position.set(-horizontal * Math.sin(yaw), target + distance * Math.sin(pitch), horizontal * Math.cos(yaw))
  camera.lookAt(0, target, 0)
  scene.add(camera)

  return {
    scene,
    root: controller.root,
    camera,
    update: controller.update,
    toggleHatch: controller.toggleHatch,
    isOpen: controller.isOpen,
    dispose: () => {
      scene.remove(controller.root)
      controller.dispose()
    },
  }
}
