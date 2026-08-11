import {
  Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshPhysicalMaterial,
  PerspectiveCamera, Scene,
} from 'three/webgpu'
import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

import {
  MaterialLibrary, WEAR_ATTRIBUTES, WEAR_BAND, WEAR_FLOOR, bakeOcclusion, bakeSurfaceAttributes,
  createWearMaterial, cylinder, downTriangle, filletRing, flatPlate, mergeStaticByMaterial, prism,
  tuneMaterial,
  type MaterialHandle, type RingPoint, type Vec2, type Vec3, type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'
import {
  facePoint, faceProfile, facePrism, ringPolygons, wallFace, type WallFace,
} from '../axiom-modular-kit/parts.ts'

/**
 * Respawn Beacon - asset.universal-gameplay.information-respawn.respawn-beacon
 *
 * A chamfered-square tower: wide service plate, splayed flare, vertical drum
 * carrying one lit recall cell per cardinal face, and an open crown whose well
 * is the beacon's long-range signal. Pivot is the ground contact at the axis;
 * the operational faces are radial, so all four read the same.
 *
 * Envelope 1.50 x 1.50 x 1.70 m (h/w 1.13, the plate's own ratio). The brief's 1.0 x 1.0 x 1.8 blockout is a
 * starting figure to confirm in the placement pass; these numbers come from the
 * reference plate instead. Its silhouette is 1.13 as tall as it is wide and only
 * about half as wide across the drum as across the base plate, so the base and
 * its corner wedges - not the drum - are what the far read is made of.
 */

const CLIP = 0.36
const RING_ARC = 1
/** Distance from the axis to a chamfer face, as a multiple of the half width. */
const DIAG = (2 - CLIP) / Math.SQRT2

const GROUND = 0
const TRAY_HALF = 0.75
const PLINTH_TOP = 0.185
const DRUM_TOP = 1.480
const COLLAR_TOP = 1.520
const TOP = 1.70

const DRUM_HALF = 0.372
/** Half width of the flat cardinal face, so cell rings can be sized to it. */
const DRUM_FACE = DRUM_HALF * (1 - CLIP)
const CORE_HALF = 0.245
const CORE_CLIP = 0.14

/** The recall cell: a tall portal running nearly half the beacon's height. */
const CELL_HALF = 0.165
const CELL_SILL = 0.560
const CELL_HEAD = 1.390
/** Where the flare finishes and the operational faces turn vertical. */
const FLARE_TOP = 0.560
const FLARE_BOTTOM = 0.232
const FLARE_HALF = 0.580

const YAWS = [0, Math.PI / 2, Math.PI, -Math.PI / 2] as const
const DIAGONALS = [Math.PI / 4, (3 * Math.PI) / 4, -(3 * Math.PI) / 4, -Math.PI / 4] as const

interface BeaconMaterials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  cobalt: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
  cyanDeep: MeshPhysicalMaterial
}

// ---------------------------------------------------------------------------
// The one shape this asset is made of.
// ---------------------------------------------------------------------------

/** A level of the lofted shell: a chamfered square at a height. */
interface Level {
  readonly y: number
  readonly half: number
  /** Corner cut as a fraction of the half width. */
  readonly clip?: number
  readonly fillet?: number
}

interface Ring extends Required<Level> {
  readonly edge: number
}

/**
 * The chamfered square, filleted so its eight corners carry a real highlight
 * band. Every level produces the same vertex count, which is what lets the loft
 * below connect any two of them.
 */
function octRing(half: number, clip: number, fillet: number): RingPoint[] {
  const c = Math.min(clip * half, half * 0.58)
  const polygon: Vec2[] = [
    [half, half - c], [half - c, half],
    [-half + c, half], [-half, half - c],
    [-half, -half + c], [-half + c, -half],
    [half - c, -half], [half, -half + c],
  ]
  return filletRing(polygon, Math.min(fillet, c * 0.4), RING_ARC)
}

/**
 * Inserts interior rings into any band tall enough to have a clean middle, so
 * the wear pass has somewhere to put unworn metal. Without them a two-metre
 * wall is nothing but its own top and bottom edge rings and reads worn all over.
 */
function expandLevels(levels: readonly Level[]): Ring[] {
  const out: Ring[] = []
  for (const [index, level] of levels.entries()) {
    const clip = level.clip ?? CLIP
    const fillet = level.fillet ?? 0.02
    out.push({ ...level, clip, fillet, edge: 1 })
    const next = levels[index + 1]
    if (!next) break
    const span = next.y - level.y
    if (span <= WEAR_BAND * 3) continue
    const nextClip = next.clip ?? CLIP
    for (const t of [WEAR_BAND / span, 1 - WEAR_BAND / span]) {
      out.push({
        y: level.y + span * t,
        half: level.half + (next.half - level.half) * t,
        clip: clip + (nextClip - clip) * t,
        fillet,
        edge: WEAR_FLOOR,
      })
    }
  }
  return out
}

interface LoftOptions {
  capTop?: boolean
  capBottom?: boolean
  /** Turns the top cap into a rim around an open well of this depth. */
  bore?: { half: number; clip?: number; depth: number }
}

/**
 * Lofts the level list into one closed shell.
 *
 * Every band gets its own vertex rings rather than sharing them, so a 4 mm
 * transition band reads as a hard chamfer facet and a 600 mm wall reads as a
 * flat wall - one continuous smoothed tube would turn the whole tower into a
 * single soft gradient.
 */
function octLoft(material: MeshPhysicalMaterial, levels: readonly Level[], options: LoftOptions = {}): Mesh {
  const bands = expandLevels(levels)
  const rings = bands.map((band) => octRing(band.half, band.clip, band.fillet))
  const count = rings[0].length

  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const edges: number[] = []
  const planes: number[] = []
  const indices: number[] = []

  const arc: number[] = []
  let travelled = 0
  for (let i = 0; i < count; i += 1) {
    arc.push(travelled)
    const next = rings[0][(i + 1) % count]
    travelled += Math.hypot(next.x - rings[0][i].x, next.y - rings[0][i].y)
  }

  // Ring order is counter-clockwise in the profile plane, which maps to
  // +x toward +z in world; (lower_i, upper_i, upper_j) then faces outward.
  const wall = (lower: RingPoint[], upper: RingPoint[], yLower: number, yUpper: number, edgeLower: number, edgeUpper: number, inward = false): void => {
    const base = positions.length / 3
    const rise = yUpper - yLower
    for (const [side, ring] of [[0, lower], [1, upper]] as const) {
      const y = side === 0 ? yLower : yUpper
      const edge = side === 0 ? edgeLower : edgeUpper
      for (let i = 0; i < count; i += 1) {
        const point = ring[i]
        const run = (upper[i].x - lower[i].x) * point.nx + (upper[i].y - lower[i].y) * point.ny
        const length = Math.hypot(rise, run) || 1
        const flip = inward ? -1 : 1
        positions.push(point.x, y, point.y)
        normals.push((point.nx * rise * flip) / length, (-run * flip) / length, (point.ny * rise * flip) / length)
        uvs.push(arc[i] / travelled, y)
        edges.push(edge)
        planes.push(arc[i], y)
      }
    }
    for (let i = 0; i < count; i += 1) {
      const j = (i + 1) % count
      indices.push(base + i, base + count + i, base + count + j)
      indices.push(base + i, base + count + j, base + j)
    }
  }

  for (let k = 0; k + 1 < bands.length; k += 1) {
    wall(rings[k], rings[k + 1], bands[k].y, bands[k + 1].y, bands[k].edge, bands[k + 1].edge)
  }

  /** Horizontal fan or annulus. `up` picks which way it faces. */
  const cap = (ring: RingPoint[], y: number, up: boolean, inner?: RingPoint[], innerY = y): void => {
    const base = positions.length / 3
    const push = (x: number, z: number, edge: number): void => {
      positions.push(x, up ? (inner ? y : y) : y, z)
      normals.push(0, up ? 1 : -1, 0)
      uvs.push(x, z)
      edges.push(edge)
      planes.push(x, z)
    }
    for (const point of ring) push(point.x, point.y, 1)
    if (inner) {
      for (const point of inner) push(point.x, point.y, 1)
      for (let i = 0; i < count; i += 1) {
        const j = (i + 1) % count
        if (up) {
          indices.push(base + i, base + count + i, base + count + j)
          indices.push(base + i, base + count + j, base + j)
        } else {
          indices.push(base + i, base + count + j, base + count + i)
          indices.push(base + i, base + j, base + count + j)
        }
      }
      return
    }
    const centre = positions.length / 3
    push(0, 0, 0.12)
    for (let i = 0; i < count; i += 1) {
      const j = (i + 1) % count
      if (up) indices.push(centre, base + j, base + i)
      else indices.push(centre, base + i, base + j)
    }
    void innerY
  }

  const last = bands.length - 1
  if (options.capBottom) cap(rings[0], bands[0].y, false)
  if (options.bore) {
    const bore = options.bore
    const inner = octRing(bore.half, bore.clip ?? CLIP, 0.02)
    cap(rings[last], bands[last].y, true, inner)
    wall(inner, inner, bands[last].y, bands[last].y - bore.depth, 1, WEAR_FLOOR, true)
    cap(inner, bands[last].y - bore.depth, true)
  } else if (options.capTop) {
    cap(rings[last], bands[last].y, true)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('aEdge', new Float32BufferAttribute(edges, 1))
  geometry.setAttribute('aPlane', new Float32BufferAttribute(planes, 2))
  geometry.setIndex(indices)
  return new Mesh(geometry, material)
}

/** A part placed on a radial face, tilted in that face's own vertical plane. */
function radialPrism(
  root: Group, material: MeshPhysicalMaterial, size: Vec3,
  yaw: number, radius: number, y: number,
  options: { chamfer?: number; fillet?: number; bevel?: number; tilt?: number } = {},
): void {
  const mesh = prism(material, size, [Math.sin(yaw) * radius, y, Math.cos(yaw) * radius], {
    chamfer: options.chamfer,
    fillet: options.fillet ?? 0.018,
    bevel: options.bevel ?? 0.014,
  })
  mesh.rotation.set(options.tilt ?? 0, yaw, 0, 'YXZ')
  root.add(mesh)
}

// ---------------------------------------------------------------------------
// Chassis
// ---------------------------------------------------------------------------

function addBase(root: Group, m: BeaconMaterials): void {
  // Ground tray: the widest thing on the asset, so it is what the far
  // silhouette is made of and it carries the handling hardware.
  root.add(octLoft(m.graphite, [
    { y: GROUND, half: TRAY_HALF - 0.020 },
    { y: GROUND + 0.018, half: TRAY_HALF },
    { y: GROUND + 0.042, half: TRAY_HALF },
    { y: GROUND + 0.058, half: TRAY_HALF - 0.018 },
  ], { capBottom: true, capTop: true }))

  root.add(octLoft(m.shell, [
    { y: 0.056, half: 0.694 },
    { y: 0.078, half: 0.700 },
    { y: 0.166, half: 0.700 },
    { y: PLINTH_TOP, half: 0.688 },
  ]))

  root.add(octLoft(m.graphite, [
    { y: 0.178, half: 0.700 },
    { y: 0.196, half: 0.712 },
    { y: 0.214, half: 0.708 },
    { y: 0.232, half: 0.686 },
  ], { capTop: true }))

  for (const [index, yaw] of YAWS.entries()) {
    const face = wallFace([0, 0, 0], yaw)
    // Service strap: the access panel that explains how the plinth opens.
    facePrism(root, face, m.graphite, [0.30, 0.116, 0.055], 0, 0.118, 0.700, { chamfer: 0.040 })
    facePrism(root, face, m.ink, [0.185, 0.036, 0.030], 0, 0.136, 0.729, { chamfer: 0.014 })
    facePrism(root, face, m.cyanDeep, [0.115, 0.015, 0.016], 0, 0.136, 0.740, { fillet: 0.005 })
    facePrism(root, face, m.steel, [0.185, 0.024, 0.026], 0, 0.082, 0.729, { chamfer: 0.010 })

    // Livery band, and identity stencilling on one face only.
    facePrism(root, face, m.cobalt, [0.60, 0.038, 0.014], 0, 0.162, 0.706, { fillet: 0.007 })
    if (index === 1) {
      for (const [u, w, h] of [[0.20, 0.05, 0.070], [0.29, 0.05, 0.050], [0.36, 0.03, 0.036]] as const) {
        facePrism(root, face, m.shellShade, [w, h, 0.010], u, 0.108, 0.706, { fillet: 0.006 })
      }
    }
    for (const u of [-0.235, 0.235]) {
      for (const y of [0.072, 0.160]) {
        root.add(cylinder(m.steel, 0.015, 0.022, facePoint(face, u, y, 0.706), [Math.PI / 2, 0, -yaw], 8))
      }
    }
  }

  // Lifting eyes on the chamfer corners: the reason the tray overhangs at all.
  for (const yaw of DIAGONALS) {
    radialPrism(root, m.graphite, [0.235, 0.044, 0.20], yaw, 0.790, 0.030, { chamfer: 0.044 })
    for (const side of [-1, 1] as const) {
      const x = Math.sin(yaw) * 0.815 + Math.cos(yaw) * side * 0.062
      const z = Math.cos(yaw) * 0.815 - Math.sin(yaw) * side * 0.062
      root.add(prism(m.steel, [0.028, 0.066, 0.030], [x, 0.074, z], { fillet: 0.010, rotation: [0, yaw, 0] }))
    }
    radialPrism(root, m.steel, [0.152, 0.026, 0.030], yaw, 0.815, 0.100, { fillet: 0.011 })
  }
}

/**
 * The flare. The plate's body is one continuous white mass that splays toward
 * the ground, and it splays most at the chamfer corners - so the taper is
 * authored as a shrinking corner cut rather than as applied wedges, which kept
 * detaching from the drum. It also finishes below the cell sill, which leaves
 * every operational face dead vertical for the details that sit on it.
 */
function addFlare(root: Group, m: BeaconMaterials): void {
  // One lofted mass, not four applied wedges - anything applied to the corners
  // separates from the drum under any light and reads as a stuck-on fin. The
  // corner cut opens faster than the width shrinks, so the chamfers splay
  // harder than the faces do and the corners still lead the shape.
  root.add(octLoft(m.shell, [
    { y: FLARE_BOTTOM, half: FLARE_HALF, clip: 0.06 },
    { y: 0.290, half: 0.556, clip: 0.10 },
    { y: 0.430, half: 0.436, clip: 0.24 },
    { y: FLARE_TOP, half: DRUM_HALF, clip: CLIP },
  ]))
  root.add(octLoft(m.graphite, [
    { y: 0.212, half: 0.584, clip: 0.05 },
    { y: 0.234, half: 0.588, clip: 0.05 },
    { y: 0.258, half: 0.568, clip: 0.07 },
  ]))
}

function addDrum(root: Group, m: BeaconMaterials): void {
  // The drum is genuinely open: four ring-built walls and four chamfer panels
  // standing off a dark inner core, so each cell is an alcove with real depth
  // rather than a bright decal on a solid.
  root.add(octLoft(m.ink, [
    { y: 0.596, half: CORE_HALF, clip: CORE_CLIP },
    { y: DRUM_TOP, half: CORE_HALF, clip: CORE_CLIP },
  ], { capTop: true, capBottom: true }))

  // Alcove floor: it caps the flare below and gives all four cells one lit pad,
  // which is the landing mark the beacon is named for.
  root.add(octLoft(m.graphite, [
    { y: 0.512, half: CORE_HALF + 0.058, clip: CORE_CLIP },
    { y: 0.585, half: CORE_HALF + 0.050, clip: CORE_CLIP },
  ], { capTop: true }))
  root.add(cylinder(m.cyanDeep, 0.222, 0.014, [0, 0.594, 0], [0, 0, 0], 24))
  root.add(cylinder(m.ink, 0.168, 0.016, [0, 0.603, 0], [0, 0, 0], 24))
  root.add(cylinder(m.cyan, 0.116, 0.018, [0, 0.611, 0], [0, 0, 0], 20))

  const wallDepth = DRUM_HALF - CORE_HALF
  for (const yaw of DIAGONALS) {
    radialPrism(root, m.shell, [DRUM_HALF * CLIP * Math.SQRT2, DRUM_TOP - FLARE_TOP, wallDepth],
      yaw, DRUM_HALF * DIAG - wallDepth / 2, (FLARE_TOP + DRUM_TOP) / 2, { fillet: 0.014, bevel: 0.02 })
  }
  for (const yaw of YAWS) addCell(root, m, wallFace([0, 0, 0], yaw), yaw)
}

/**
 * One recall cell. The aperture is a ring of four bars and four corner
 * pentagons, so the clipped opening is real geometry and nothing propagates
 * across the rest of the wall.
 */
function addCell(root: Group, m: BeaconMaterials, face: WallFace, yaw: number): void {
  const depth = DRUM_HALF - CORE_HALF
  const w = DRUM_HALF - depth / 2
  const clip: [number, number, number, number] = [0.068, 0.068, 0.068, 0.068]

  for (const polygon of ringPolygons({
    uL: -CELL_HALF, uR: CELL_HALF, yB: CELL_SILL, yT: CELL_HEAD, clip,
    OL: -DRUM_FACE, OR: DRUM_FACE, OB: FLARE_TOP, OT: DRUM_TOP,
  })) {
    faceProfile(root, face, m.shell, polygon, depth, w, { fillet: 0.016, bevel: 0.02 })
  }

  // Bezel: one continuous clipped-corner frame standing proud of the wall, so
  // the mouth is framed by a real lip rather than by four loose bars.
  for (const polygon of ringPolygons({
    uL: -CELL_HALF, uR: CELL_HALF, yB: CELL_SILL, yT: CELL_HEAD, clip,
    OL: -0.232, OR: 0.232, OB: 0.494, OT: 1.442, outerClip: [0.070, 0.070, 0.070, 0.070],
  })) {
    faceProfile(root, face, m.graphite, polygon, 0.046, DRUM_HALF + 0.021, { fillet: 0.011, bevel: 0.013 })
  }
  facePrism(root, face, m.steel, [0.16, 0.026, 0.022], 0, 1.412, DRUM_HALF + 0.054, { fillet: 0.008 })
  facePrism(root, face, m.ink, [0.120, 0.020, 0.018], 0, 0.524, DRUM_HALF + 0.052, { fillet: 0.006 })

  // Inside the alcove: a lit back wall, descent chevrons stepping toward the
  // viewer, and a header lamp under the lintel.
  root.add(flatPlate(m.cyanDeep, [0.300, 0.80], facePoint(face, 0, 0.975, CORE_HALF + 0.016), [0, yaw, 0], false))
  for (const [index, y] of [0.80, 0.98, 1.16].entries()) {
    const chevron = downTriangle(m.cyan, 0.250 - index * 0.022, 0.098, facePoint(face, 0, y, CORE_HALF + 0.030 + index * 0.010))
    chevron.rotation.y = yaw
    root.add(chevron)
  }
  facePrism(root, face, m.cyan, [0.240, 0.020, 0.07], 0, 1.336, 0.291, { fillet: 0.007 })
  facePrism(root, face, m.ink, [0.278, 0.040, 0.065], 0, 1.364, 0.297, { fillet: 0.010 })
}

/**
 * Chamfer-corner buttresses. Their lower leg follows the skirt's rake and the
 * upper rail stands vertical, which is what opens the gap between rail and drum
 * that reads as structure rather than as a moulding.
 */
function addButtresses(root: Group, m: BeaconMaterials): void {
  // The rail rakes back a little less than the flare it stands on, so the gap
  // between the two opens toward the top - that gap is what makes the corner
  // read as an applied strut instead of a moulding on the white mass.
  const rake = -0.05
  const footRake = -0.545
  for (const [index, yaw] of DIAGONALS.entries()) {
    // The foot rakes with the flare and the rail above it stands nearly plumb.
    // Carrying the dark strut all the way down to the plate is what keeps the
    // flare from reading as one bare white plateau.
    radialPrism(root, m.graphite, [0.150, 0.400, 0.115], yaw, 0.500, 0.415, { chamfer: 0.032, tilt: footRake })
    radialPrism(root, m.graphite, [0.125, 0.890, 0.105], yaw, 0.492, 1.005, { chamfer: 0.028, tilt: rake })
    radialPrism(root, m.graphite, [0.170, 0.070, 0.145], yaw, 0.575, 0.252, { chamfer: 0.032 })
    radialPrism(root, m.graphite, [0.150, 0.078, 0.130], yaw, 0.506, 0.578, { chamfer: 0.030 })
    radialPrism(root, m.graphite, [0.155, 0.086, 0.150], yaw, 0.435, 1.452, { chamfer: 0.036 })

    // Piston: the moving part that explains why the rails are there at all.
    const piston = cylinder(m.steel, 0.032, 0.520, [0, 0, 0], [0, 0, 0], 12)
    piston.position.set(Math.sin(yaw) * 0.537, 1.020, Math.cos(yaw) * 0.537)
    piston.rotation.set(rake, yaw, 0, 'YXZ')
    root.add(piston)
    for (const [y, r] of [[0.800, 0.527], [1.240, 0.504]] as const) {
      radialPrism(root, m.graphite, [0.096, 0.070, 0.090], yaw, r, y, { chamfer: 0.022, tilt: rake })
    }
    if (index % 2 === 0) {
      radialPrism(root, m.cyanDeep, [0.022, 0.220, 0.010], yaw, 0.527, 1.020, { fillet: 0.005, tilt: rake })
    } else {
      radialPrism(root, m.cobalt, [0.068, 0.105, 0.010], yaw, 0.525, 1.020, { fillet: 0.007, tilt: rake })
    }
  }
}

function addCrown(root: Group, m: BeaconMaterials): void {
  root.add(octLoft(m.shell, [
    { y: 1.450, half: DRUM_HALF },
    { y: 1.482, half: 0.378 },
    { y: COLLAR_TOP, half: 0.382 },
  ]))
  // The outer band stays SHELL so the crown never becomes a black cap; only the
  // rim lip and the inside of the well go dark.
  root.add(octLoft(m.shell, [
    { y: 1.514, half: 0.366 },
    { y: 1.542, half: 0.376 },
    { y: 1.620, half: 0.374 },
  ]))
  root.add(octLoft(m.graphite, [
    { y: 1.614, half: 0.375 },
    { y: 1.632, half: 0.378 },
    { y: 1.668, half: 0.376 },
    { y: TOP, half: 0.356 },
  ], { bore: { half: 0.278, depth: 0.192 } }))

  // The signal itself: a glowing well sunk inside the crown, read at distance
  // as a ring of light rather than as a bare lamp.
  root.add(octLoft(m.cyanDeep, [
    { y: 1.512, half: 0.256 },
    { y: 1.628, half: 0.252 },
  ], { capTop: true }))
  root.add(octLoft(m.cyan, [
    { y: 1.626, half: 0.196 },
    { y: 1.660, half: 0.190 },
  ], { capTop: true }))

  // Segment straps across the rim, so the crown reads as an assembly.
  for (const yaw of DIAGONALS) {
    radialPrism(root, m.graphite, [0.108, 0.050, 0.150], yaw, 0.320, 1.678, { chamfer: 0.024 })
  }
  for (const [index, yaw] of YAWS.entries()) {
    const face = wallFace([0, 0, 0], yaw)
    facePrism(root, face, m.graphite, [0.22, 0.058, 0.028], 0, 1.572, 0.376, { chamfer: 0.024 })
    if (index === 0 || index === 2) {
      facePrism(root, face, m.cyanDeep, [0.12, 0.016, 0.014], 0, 1.572, 0.392, { fillet: 0.006 })
    }
  }
}

// ---------------------------------------------------------------------------

function acquireMaterials(): {
  materials: BeaconMaterials
  handles: MaterialHandle[]
  profiles: Map<MeshPhysicalMaterial, WearProfile>
} {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-02', palette: 'SHELL-200', condition: 'maintained', seed: 5101 })
  const shellShade = library.acquire({ recipeId: 'MAT-02', palette: 'SHELL-300', condition: 'maintained', seed: 5102 })
  const graphite = library.acquire({ recipeId: 'MAT-01', palette: 'GRAPHITE-800', condition: 'maintained', seed: 5103 })
  const ink = library.acquire({ recipeId: 'MAT-01', palette: 'INK-950', condition: 'maintained', seed: 5104 })
  const steel = library.acquire({ recipeId: 'MAT-01', palette: 'STEEL-400', condition: 'maintained', seed: 5105 })
  const cobalt = library.acquire({ recipeId: 'MAT-17', palette: 'COBALT-500', condition: 'maintained', seed: 5106 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 5107 })
  const cyanDeep = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 5108 })

  const materials: BeaconMaterials = {
    shell: tuneMaterial(shell, 0xd2d6d7, 0.40, 0.06, { clearcoat: 0.28, clearcoatRoughness: 0.4 }),
    shellShade: tuneMaterial(shellShade, 0xa8aeb2, 0.46, 0.08, { clearcoat: 0.2 }),
    graphite: tuneMaterial(graphite, 0x2c2e2f, 0.44, 0.56, { clearcoat: 0.20 }),
    ink: tuneMaterial(ink, 0x0b0c0d, 0.70, 0.24),
    steel: tuneMaterial(steel, 0x919596, 0.33, 0.90, { clearcoat: 0.18 }),
    cobalt: tuneMaterial(cobalt, 0x2f6fb5, 0.42, 0.14, { clearcoat: 0.3 }),
    // The signal has to survive a 2 W key without going white. Emissive alone
    // was not the problem: a light, saturated albedo lit at that level washes
    // out on its own, so the albedo goes nearly black and the hue is carried
    // entirely by the emissive, which no light can bleach.
    cyan: tuneMaterial(cyan, 0x2fc9ee, 0.30, 0, { emissive: 1.55 }),
    cyanDeep: tuneMaterial(cyanDeep, 0x0a86b8, 0.34, 0, { emissive: 0.78 }),
  }
  materials.cyan.color.setHex(0x07202a)
  materials.cyanDeep.color.setHex(0x051720)

  // A maintained gameplay landmark: contact darkening in the seams does the
  // work, and the emissive signal materials stay off the wear graph entirely.
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [materials.shell, { rub: 0.16, grime: 0.12, scratch: 0.14 }],
    [materials.shellShade, { rub: 0.18, grime: 0.16, scratch: 0.16 }],
    [materials.graphite, { rub: 0.07, grime: 0.0, scratch: 0.05 }],
    [materials.steel, { rub: 0.16, grime: 0.0, scratch: 0.14 }],
    [materials.cobalt, { rub: 0.16, grime: 0.10, scratch: 0.16 }],
  ])

  return { materials, handles: [shell, shellShade, graphite, ink, steel, cobalt, cyan, cyanDeep], profiles }
}

export function createModel(): {
  root: Group
  update: (deltaSeconds: number) => void
  dispose: () => void
} {
  const { materials, handles, profiles } = acquireMaterials()
  const root = new Group()
  root.name = 'respawn-beacon'
  root.userData.assetId = 'asset.universal-gameplay.information-respawn.respawn-beacon'

  addBase(root, materials)
  addFlare(root, materials)
  addDrum(root, materials)
  addButtresses(root, materials)
  addCrown(root, materials)

  root.updateMatrixWorld(true)
  bakeOcclusion(root, { reach: 0.22 })
  bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'respawn-beacon / maintained coated shell', clearcoat: 0.1, clearcoatRoughness: 0.5 })
  root.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return
    if (profiles.has(object.material as MeshPhysicalMaterial)) object.material = wear
  })
  const merged = mergeStaticByMaterial(root, {
    retainedAttributes: (material) => (material === wear ? WEAR_ATTRIBUTES : []),
    meshName: (material) => `respawn-beacon / ${material.name}`,
  })
  const meshes = root.children.filter((object): object is Mesh => object instanceof Mesh)
  const geometries = meshes.map((mesh, index) => {
    const indexed = mergeVertices(merged[index], 1e-5)
    mesh.geometry = indexed
    merged[index].dispose()
    return indexed
  })

  let elapsed = 0
  return {
    root,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      // Slow charge cycle on the crown, a faster recall pulse in the cells.
      materials.cyan.emissiveIntensity = 3.1 + Math.sin(elapsed * 1.15) * 0.35
      materials.cyanDeep.emissiveIntensity = 1.5 + Math.sin(elapsed * 2.1 + 0.8) * 0.22
    },
    dispose: () => {
      for (const geometry of geometries) geometry.dispose()
      wear.dispose()
      for (const handle of handles) handle.release()
    },
  }
}

export function createPreview(options: { aspect: number }): {
  scene: Scene
  root: Group
  camera: PerspectiveCamera
  update: (deltaSeconds: number) => void
  dispose: () => void
} {
  const controller = createModel()
  const scene = new Scene()
  scene.name = 'respawn-beacon / reference-matched preview'
  scene.background = new Color(0x000000)
  scene.add(controller.root)

  scene.add(new HemisphereLight(0x93a8b6, 0x080a0d, 0.5))
  const key = new DirectionalLight(0xfff3e4, 2.1)
  key.position.set(-6, 11, 9)
  const fill = new DirectionalLight(0x9dc0da, 0.7)
  fill.position.set(9, 4, 7)
  const rim = new DirectionalLight(0x8fb0c8, 0.9)
  rim.position.set(5, 7, -10)
  scene.add(key, fill, rim)

  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const target: Vec3 = [0, 0.88, 0]
  const azimuth = 0.35
  const pitch = 0.47
  const distance = 6.4
  const camera = new PerspectiveCamera(26, aspect, 0.2, 40)
  camera.name = 'respawn-beacon / reference camera'
  camera.position.set(
    target[0] + Math.sin(azimuth) * Math.cos(pitch) * distance,
    target[1] + Math.sin(pitch) * distance,
    target[2] + Math.cos(azimuth) * Math.cos(pitch) * distance,
  )
  camera.lookAt(...target)
  scene.add(camera)

  return {
    scene,
    root: controller.root,
    camera,
    update: controller.update,
    dispose: () => {
      scene.remove(controller.root)
      controller.dispose()
    },
  }
}
