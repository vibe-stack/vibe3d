import {
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
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
  cylinder,
  extrudeProfile,
  groove,
  mergeStaticByMaterial,
  prism,
  WEAR_ATTRIBUTES,
  type Corners,
  type Vec2,
  type Vec3,
} from '../../../src/asset-forge/generator/index.ts'
import { acquireGateMaterials, type GateMaterials } from './materials.ts'

/**
 * Storm Point large blast gate.
 *
 * The reference is treated as one machine: two deep armored towers contain a
 * pair of full-height retracting leaves. The lintel is a drive housing, the
 * inner jambs are door pockets, and every brace, lamp, seam and lock is seated
 * on one of those load-bearing masses.
 */
const JAMB_X = 6.15
const OUTER_X = 12.5
const TOWER_FRONT = 2.55
const TOWER_BACK = -2.9
const SILL_TOP = 1.65
const DOOR_TOP = 11.35
const LINTEL_TOP = 14.2
const DOOR_FRONT = 1.0
const DOOR_BACK = -0.9
const LEAF_TRAVEL = 5.5

type Bounds = { x: [number, number]; y: [number, number]; z: [number, number] }
type BoxOptions = {
  chamfer?: number | Corners
  fillet?: number
  bevel?: number
  arcSegments?: number
  rotation?: Vec3
}

function box(parent: Group, material: MeshPhysicalMaterial, bounds: Bounds, options: BoxOptions = {}): void {
  const size: Vec3 = [
    bounds.x[1] - bounds.x[0],
    bounds.y[1] - bounds.y[0],
    bounds.z[1] - bounds.z[0],
  ]
  const centre: Vec3 = [
    (bounds.x[0] + bounds.x[1]) * 0.5,
    (bounds.y[0] + bounds.y[1]) * 0.5,
    (bounds.z[0] + bounds.z[1]) * 0.5,
  ]
  parent.add(prism(material, size, centre, {
    fillet: 0.06,
    bevel: 0.07,
    arcSegments: 1,
    ...options,
  }))
}

function span(side: number, inner: number, outer: number): [number, number] {
  return side > 0 ? [inner, outer] : [-outer, -inner]
}

function mirror(side: number, corners: Corners): Corners {
  return side > 0 ? corners : [corners[1], corners[0], corners[3], corners[2]]
}

function mirroredProfile(side: number, points: Vec2[]): Vec2[] {
  return side > 0 ? points : points.map(([x, y]): Vec2 => [-x, y]).reverse()
}

/** Continuous pillar facade. Its y/z section is proud -> chamfered recess ->
 * proud, while its x/z section forms sloped inner and outer returns. Every grid
 * cell is a planar quad with one hard normal: no triangulated shading noise and
 * no stack of decorative rectangles. */
function towerFacade(
  parent: Group,
  material: MeshPhysicalMaterial,
  sideMaterial: MeshPhysicalMaterial,
  recessMaterial: MeshPhysicalMaterial,
  side: number,
): void {
  const geometry = new BufferGeometry()
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const planes: number[] = []
  const sidePositions: number[] = []
  const sideNormals: number[] = []
  const sideUvs: number[] = []
  const sidePlanes: number[] = []
  const recessPositions: number[] = []
  const recessNormals: number[] = []
  const recessUvs: number[] = []
  const recessPlanes: number[] = []
  const rows = [
    { y: 3.25, inner: JAMB_X + 0.5, outer: OUTER_X - 0.78, z: 3.48 },
    { y: 4.0, inner: JAMB_X + 0.5, outer: OUTER_X - 0.78, z: 3.48 },
    { y: 4.42, inner: JAMB_X + 0.5, outer: OUTER_X - 0.78, z: 3.48 },
    { y: 6.45, inner: JAMB_X + 0.5, outer: OUTER_X - 0.78, z: 3.48 },
    { y: 6.88, inner: JAMB_X + 0.5, outer: OUTER_X - 0.78, z: 3.48 },
    { y: 7.55, inner: JAMB_X + 0.5, outer: OUTER_X - 0.78, z: 3.48 },
    { y: 8.35, inner: JAMB_X + 1.35, outer: OUTER_X - 1.5, z: 2.5 },
    { y: 12.45, inner: JAMB_X + 1.35, outer: OUTER_X - 1.5, z: 2.5 },
    { y: 13.25, inner: JAMB_X + 0.55, outer: OUTER_X - 1.05, z: 3.48 },
    { y: 13.92, inner: JAMB_X + 0.68, outer: OUTER_X - 1.25, z: 3.5 },
    { y: 14.32, inner: JAMB_X + 0.86, outer: OUTER_X - 1.5, z: 3.54 },
    { y: 16.0, inner: JAMB_X + 1.08, outer: OUTER_X - 2.08, z: 3.57 },
    { y: 16.38, inner: JAMB_X + 1.18, outer: OUTER_X - 2.32, z: 3.58 },
    { y: 16.95, inner: JAMB_X + 1.25, outer: OUTER_X - 2.5, z: 3.58 },
    { y: 17.55, inner: JAMB_X + 1.7, outer: OUTER_X - 2.75, z: 3.58 },
  ]
  // One hard front plane bounded by two explicit side chamfers. Repeating
  // incremental offsets here makes the pillar read rounded, which it is not.
  const columnDepth = [-0.34, 0.12, 0.12, 0.12, 0.12, 0.12, -0.36]
  const vertex = (rowIndex: number, column: number): Vec3 => {
    const row = rows[rowIndex]
    const t = column / (columnDepth.length - 1)
    const positiveX = row.inner + (row.outer - row.inner) * t
    const x = side > 0 ? positiveX : -positiveX
    const inLowerBay = row.y >= 4.42 && row.y <= 6.45
    const inUpperBay = row.y >= 14.32 && row.y <= 16.0
    const bay = inLowerBay || inUpperBay
    const center = t >= 0.34 && t <= 0.66
    const shoulder = t >= 0.17 && t <= 0.83
    const recess = bay ? (center ? -0.38 : shoulder ? -0.2 : 0) : 0
    return [x, row.y, row.z + columnDepth[column] + recess]
  }
  const push = (point: Vec3, normal: Vec3): void => {
    positions.push(...point)
    normals.push(...normal)
    // Vertical armor is brushed along its load axis. Keeping Y in U prevents
    // the shader's high-frequency V grain from becoming horizontal streaks.
    uvs.push(point[1] * 0.32, point[0] * 0.32)
    planes.push(point[1], point[0])
  }
  const pushSide = (point: Vec3, normal: Vec3): void => {
    sidePositions.push(...point)
    sideNormals.push(...normal)
    sideUvs.push(point[2] * 0.32, point[1] * 0.32)
    sidePlanes.push(point[2], point[1])
  }
  const pushRecess = (point: Vec3, normal: Vec3): void => {
    recessPositions.push(...point)
    recessNormals.push(...normal)
    recessUvs.push(point[1] * 0.32, point[0] * 0.32)
    recessPlanes.push(point[1], point[0])
  }
  for (let row = 0; row < rows.length - 1; row += 1) {
    for (let column = 0; column < columnDepth.length - 1; column += 1) {
      const a = vertex(row, column)
      const b = vertex(row, column + 1)
      const c = vertex(row + 1, column + 1)
      const d = vertex(row + 1, column)
      const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
      const ad: Vec3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]]
      let normal: Vec3 = [
        ab[1] * ad[2] - ab[2] * ad[1],
        ab[2] * ad[0] - ab[0] * ad[2],
        ab[0] * ad[1] - ab[1] * ad[0],
      ]
      if (normal[2] < 0) normal = [-normal[0], -normal[1], -normal[2]]
      const length = Math.hypot(...normal)
      normal = [normal[0] / length, normal[1] / length, normal[2] / length]
      const floorBand = (
        (rows[row].y >= 4.42 && rows[row + 1].y <= 6.45)
        || (rows[row].y >= 14.32 && rows[row + 1].y <= 16.0)
      ) && column >= 2 && column <= 3
      const undercutBand = (
        (rows[row].y === 7.55 && rows[row + 1].y === 8.35)
        || (rows[row].y === 12.45 && rows[row + 1].y === 13.25)
      )
      // The sloped undercuts are structural returns, not painted hero faces.
      // Keeping them on the plain graphite mesh avoids stretched brush grain
      // and gives the proud/recessed/p proud section a crisp value break.
      const emit = floorBand ? pushRecess : undercutBand ? pushSide : push
      if (side > 0) {
        emit(a, normal); emit(b, normal); emit(c, normal); emit(a, normal); emit(c, normal); emit(d, normal)
      } else {
        emit(a, normal); emit(c, normal); emit(b, normal); emit(a, normal); emit(d, normal); emit(c, normal)
      }
    }
  }
  const boundary: Vec3[] = []
  for (let column = 0; column < columnDepth.length; column += 1) boundary.push(vertex(0, column))
  for (let row = 1; row < rows.length; row += 1) boundary.push(vertex(row, columnDepth.length - 1))
  for (let column = columnDepth.length - 2; column >= 0; column -= 1) boundary.push(vertex(rows.length - 1, column))
  for (let row = rows.length - 2; row > 0; row -= 1) boundary.push(vertex(row, 0))
  if (side < 0) boundary.reverse()
  for (let index = 0; index < boundary.length; index += 1) {
    const a = boundary[index]
    const b = boundary[(index + 1) % boundary.length]
    const backA: Vec3 = [a[0], a[1], TOWER_BACK + 0.1]
    const backB: Vec3 = [b[0], b[1], TOWER_BACK + 0.1]
    const ab: Vec3 = [backA[0] - a[0], backA[1] - a[1], backA[2] - a[2]]
    const ad: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    let normal: Vec3 = [
      ab[1] * ad[2] - ab[2] * ad[1],
      ab[2] * ad[0] - ab[0] * ad[2],
      ab[0] * ad[1] - ab[1] * ad[0],
    ]
    const length = Math.hypot(...normal)
    normal = [normal[0] / length, normal[1] / length, normal[2] / length]
    pushSide(a, normal); pushSide(backA, normal); pushSide(backB, normal)
    pushSide(a, normal); pushSide(backB, normal); pushSide(b, normal)
  }
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('aPlane', new Float32BufferAttribute(planes, 2))
  parent.add(new Mesh(geometry, material))
  const sideGeometry = new BufferGeometry()
  sideGeometry.setAttribute('position', new Float32BufferAttribute(sidePositions, 3))
  sideGeometry.setAttribute('normal', new Float32BufferAttribute(sideNormals, 3))
  sideGeometry.setAttribute('uv', new Float32BufferAttribute(sideUvs, 2))
  sideGeometry.setAttribute('aPlane', new Float32BufferAttribute(sidePlanes, 2))
  parent.add(new Mesh(sideGeometry, sideMaterial))
  const recessGeometry = new BufferGeometry()
  recessGeometry.setAttribute('position', new Float32BufferAttribute(recessPositions, 3))
  recessGeometry.setAttribute('normal', new Float32BufferAttribute(recessNormals, 3))
  recessGeometry.setAttribute('uv', new Float32BufferAttribute(recessUvs, 2))
  recessGeometry.setAttribute('aPlane', new Float32BufferAttribute(recessPlanes, 2))
  parent.add(new Mesh(recessGeometry, recessMaterial))
}

/** Rear pillar shell with an actual recessed service trunk. This closes the
 * tower as authored machinery rather than leaving the front facade attached to
 * an empty back cap. */
function towerRearFacade(
  parent: Group,
  material: MeshPhysicalMaterial,
  recessMaterial: MeshPhysicalMaterial,
  side: number,
): void {
  const shellPositions: number[] = []
  const shellNormals: number[] = []
  const shellUvs: number[] = []
  const shellPlanes: number[] = []
  const recessPositions: number[] = []
  const recessNormals: number[] = []
  const recessUvs: number[] = []
  const recessPlanes: number[] = []
  const rows = [3.28, 4.1, 4.52, 7.45, 8.08, 13.38, 14.05, 16.18, 17.46]
  const columns = [0, 0.16, 0.31, 0.69, 0.84, 1]
  const inner = JAMB_X + 0.52
  const outer = OUTER_X - 0.78
  const point = (row: number, column: number): Vec3 => {
    const t = columns[column]
    const x = side * (inner + (outer - inner) * t)
    const inTrunk = rows[row] >= 4.52 && rows[row] <= 14.05
    const center = t >= 0.3 && t <= 0.7
    const shoulder = t >= 0.15 && t <= 0.85
    const depth = inTrunk ? (center ? -0.48 : shoulder ? -0.19 : 0) : 0
    return [x, rows[row], TOWER_BACK + 0.16 + depth]
  }
  const emit = (target: 'shell' | 'recess', a: Vec3, b: Vec3, c: Vec3, d: Vec3): void => {
    const positions = target === 'shell' ? shellPositions : recessPositions
    const normals = target === 'shell' ? shellNormals : recessNormals
    const uvs = target === 'shell' ? shellUvs : recessUvs
    const planes = target === 'shell' ? shellPlanes : recessPlanes
    const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const ad: Vec3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]]
    let normal: Vec3 = [
      ab[1] * ad[2] - ab[2] * ad[1],
      ab[2] * ad[0] - ab[0] * ad[2],
      ab[0] * ad[1] - ab[1] * ad[0],
    ]
    if (normal[2] > 0) normal = [-normal[0], -normal[1], -normal[2]]
    const length = Math.hypot(...normal)
    normal = [normal[0] / length, normal[1] / length, normal[2] / length]
    const ordered = side > 0 ? [a, c, b, a, d, c] : [a, b, c, a, c, d]
    for (const vertex of ordered) {
      positions.push(...vertex)
      normals.push(...normal)
      uvs.push(vertex[1] * 0.32, vertex[0] * 0.32)
      planes.push(vertex[1], vertex[0])
    }
  }
  for (let row = 0; row < rows.length - 1; row += 1) {
    for (let column = 0; column < columns.length - 1; column += 1) {
      const floor = rows[row] >= 4.52 && rows[row + 1] <= 14.05 && column === 2
      emit(floor ? 'recess' : 'shell',
        point(row, column), point(row, column + 1),
        point(row + 1, column + 1), point(row + 1, column))
    }
  }
  const make = (
    positions: number[], normals: number[], uvs: number[], planes: number[],
    surface: MeshPhysicalMaterial,
  ): void => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
    geometry.setAttribute('aPlane', new Float32BufferAttribute(planes, 2))
    parent.add(new Mesh(geometry, surface))
  }
  make(shellPositions, shellNormals, shellUvs, shellPlanes, material)
  make(recessPositions, recessNormals, recessUvs, recessPlanes, recessMaterial)
}

function bolt(parent: Group, m: GateMaterials, x: number, y: number, z: number, radius = 0.1): void {
  parent.add(cylinder(m.steel, radius, 0.09, [x, y, z], [Math.PI / 2, 0, 0], 6))
}

function boltRun(
  parent: Group,
  m: GateMaterials,
  from: Vec2,
  to: Vec2,
  count: number,
  z: number,
  radius = 0.09,
): void {
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1)
    bolt(parent, m, from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, z, radius)
  }
}

function seam(parent: Group, m: GateMaterials, length: number, position: Vec3, horizontal = false): void {
  parent.add(groove(m.shellShadow, length, 0.11, 0.055, position, horizontal ? [0, 0, Math.PI / 2] : undefined))
}

function beamBetween(
  parent: Group,
  material: MeshPhysicalMaterial,
  from: Vec2,
  to: Vec2,
  z: number,
  width: number,
  depth: number,
): void {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const length = Math.hypot(dx, dy)
  const beam = prism(material, [length, width, depth], [
    (from[0] + to[0]) * 0.5,
    (from[1] + to[1]) * 0.5,
    z,
  ], { chamfer: 0.12, fillet: 0.05, bevel: 0.07 })
  beam.rotation.z = Math.atan2(dy, dx)
  parent.add(beam)
}

function plinthBody(parent: Group, material: MeshPhysicalMaterial, side: number): void {
  const geometry = new BufferGeometry()
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const planes: number[] = []
  const rows = [
    { y: 0, inner: JAMB_X - 0.35, outer: OUTER_X + 0.25, z: 4.32 },
    { y: 0.5, inner: JAMB_X - 0.35, outer: OUTER_X + 0.25, z: 4.32 },
    { y: 2.25, inner: JAMB_X - 0.35, outer: OUTER_X + 0.25, z: 3.5 },
    { y: 2.95, inner: JAMB_X + 0.05, outer: OUTER_X - 0.45, z: 3.34 },
  ]
  const point = (row: number, column: number): Vec3 => {
    const spec = rows[row]
    const positiveX = spec.inner + (spec.outer - spec.inner) * (column / 2)
    return [side > 0 ? positiveX : -positiveX, spec.y, spec.z]
  }
  const emit = (a: Vec3, b: Vec3, c: Vec3, d: Vec3): void => {
    const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const ad: Vec3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]]
    let normal: Vec3 = [
      ab[1] * ad[2] - ab[2] * ad[1],
      ab[2] * ad[0] - ab[0] * ad[2],
      ab[0] * ad[1] - ab[1] * ad[0],
    ]
    if (normal[2] < 0) normal = [-normal[0], -normal[1], -normal[2]]
    const length = Math.hypot(...normal)
    normal = [normal[0] / length, normal[1] / length, normal[2] / length]
    const ordered = side > 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c]
    for (const vertex of ordered) {
      positions.push(...vertex)
      normals.push(...normal)
      uvs.push(vertex[0] * 0.32, vertex[1] * 0.32)
      planes.push(vertex[0], vertex[1])
    }
  }
  for (let row = 0; row < rows.length - 1; row += 1) {
    for (let column = 0; column < 2; column += 1) emit(
      point(row, column), point(row, column + 1),
      point(row + 1, column + 1), point(row + 1, column),
    )
  }
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('aPlane', new Float32BufferAttribute(planes, 2))
  parent.add(new Mesh(geometry, material))
}

/** The plinth's outer side is authored as a continuous recessed shell. The old
 * plinth was front-only, so orbiting the asset exposed an empty/flat flank. */
function plinthOuterSide(
  parent: Group,
  material: MeshPhysicalMaterial,
  recessMaterial: MeshPhysicalMaterial,
  side: number,
): void {
  const shellPositions: number[] = []
  const shellNormals: number[] = []
  const shellUvs: number[] = []
  const shellPlanes: number[] = []
  const recessPositions: number[] = []
  const recessNormals: number[] = []
  const recessUvs: number[] = []
  const recessPlanes: number[] = []
  const rows = [
    { y: 0, outer: OUTER_X + 0.25, front: 4.32 },
    { y: 0.5, outer: OUTER_X + 0.25, front: 4.32 },
    { y: 0.72, outer: OUTER_X + 0.25, front: 4.08 },
    { y: 1.9, outer: OUTER_X + 0.25, front: 3.62 },
    { y: 2.25, outer: OUTER_X + 0.25, front: 3.5 },
    { y: 2.95, outer: OUTER_X - 0.45, front: 3.34 },
  ]
  const columns = [0, 0.12, 0.28, 0.72, 0.88, 1]
  const back = -3.02
  const point = (row: number, column: number): Vec3 => {
    const spec = rows[row]
    const t = columns[column]
    const z = back + (spec.front - back) * t
    const inBay = spec.y >= 0.72 && spec.y <= 1.9
    const center = t >= 0.27 && t <= 0.73
    const shoulder = t >= 0.11 && t <= 0.89
    const setback = inBay ? (center ? 0.3 : shoulder ? 0.13 : 0) : 0
    return [side * (spec.outer - setback), spec.y, z]
  }
  const emit = (target: 'shell' | 'recess', a: Vec3, b: Vec3, c: Vec3, d: Vec3): void => {
    const positions = target === 'shell' ? shellPositions : recessPositions
    const normals = target === 'shell' ? shellNormals : recessNormals
    const uvs = target === 'shell' ? shellUvs : recessUvs
    const planes = target === 'shell' ? shellPlanes : recessPlanes
    const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const ad: Vec3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]]
    let normal: Vec3 = [
      ab[1] * ad[2] - ab[2] * ad[1],
      ab[2] * ad[0] - ab[0] * ad[2],
      ab[0] * ad[1] - ab[1] * ad[0],
    ]
    if (normal[0] * side < 0) normal = [-normal[0], -normal[1], -normal[2]]
    const length = Math.hypot(...normal)
    normal = [normal[0] / length, normal[1] / length, normal[2] / length]
    const ordered = side > 0 ? [a, c, b, a, d, c] : [a, b, c, a, c, d]
    for (const vertex of ordered) {
      positions.push(...vertex)
      normals.push(...normal)
      uvs.push(vertex[2] * 0.32, vertex[1] * 0.32)
      planes.push(vertex[2], vertex[1])
    }
  }
  for (let row = 0; row < rows.length - 1; row += 1) {
    for (let column = 0; column < columns.length - 1; column += 1) {
      const floor = rows[row].y >= 0.72 && rows[row + 1].y <= 1.9 && column === 2
      emit(floor ? 'recess' : 'shell',
        point(row, column), point(row, column + 1),
        point(row + 1, column + 1), point(row + 1, column))
    }
  }
  const make = (
    positions: number[], normals: number[], uvs: number[], planes: number[],
    surface: MeshPhysicalMaterial,
  ): void => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
    geometry.setAttribute('aPlane', new Float32BufferAttribute(planes, 2))
    parent.add(new Mesh(geometry, surface))
  }
  make(shellPositions, shellNormals, shellUvs, shellPlanes, material)
  make(recessPositions, recessNormals, recessUvs, recessPlanes, recessMaterial)
}

function addPlinth(root: Group, m: GateMaterials, side: number): void {
  plinthBody(root, m.graphite, side)
  plinthOuterSide(root, m.graphite, m.ink, side)

  // Close the plinth shell beneath its cap so rear/low orbit views cannot see
  // through to the bright front skin.
  box(root, m.graphite, {
    x: span(side, JAMB_X + 0.05, OUTER_X - 0.45),
    y: [2.84, 2.98],
    z: [-3.04, 3.36],
  }, { chamfer: 0.04, fillet: 0.001, bevel: 0.02, arcSegments: 1 })

  const cap = mirroredProfile(side, [
    [JAMB_X - 0.1, 2.55],
    [OUTER_X - 0.2, 2.55],
    [OUTER_X - 0.8, 3.45],
    [JAMB_X + 0.2, 3.45],
  ])
  root.add(extrudeProfile(m.graphiteLight, cap, 6.85, [0, 0, 0.43], { fillet: 0.12, bevel: 0.24, arcSegments: 2 }))

  // Outer maintenance housing continues the dark front plinth around the side.
  // A recessed vent and two retaining lands keep the side readable in orbit view.
  const sideX = side * (OUTER_X + 0.3)
  const sideHousing = prism(m.graphiteLight, [3.8, 1.42, 0.34], [sideX, 1.18, 0.38], {
    chamfer: [0.24, 0.24, 0.14, 0.14], fillet: 0.001, bevel: 0.045, arcSegments: 1,
    rotation: [0, Math.PI / 2, 0],
  })
  root.add(sideHousing)
  const sideVent = prism(m.ink, [2.85, 0.72, 0.14], [sideX + side * 0.19, 1.16, 0.38], {
    chamfer: 0.12, fillet: 0.001, bevel: 0.025, arcSegments: 1,
    rotation: [0, Math.PI / 2, 0],
  })
  root.add(sideVent)
  for (const z of [-0.62, 0.38, 1.38]) {
    const rib = prism(m.steel, [0.12, 0.54, 0.1], [sideX + side * 0.27, 1.16, z], {
      chamfer: 0.025, fillet: 0.001, bevel: 0.014, arcSegments: 1, rotation: [0, Math.PI / 2, 0],
    })
    root.add(rib)
  }

  // The rear bumper is a real termination of the plinth rather than an open
  // extrusion. Its inset is deliberately sparse and serviceable.
  box(root, m.graphite, {
    x: span(side, JAMB_X - 0.12, OUTER_X + 0.12),
    y: [0.5, 1.92],
    z: [-3.32, -2.94],
  }, { chamfer: mirror(side, [0.18, 0.18, 0.08, 0.08]), fillet: 0.001, bevel: 0.04, arcSegments: 1 })
  box(root, m.graphite, {
    x: span(side, JAMB_X - 0.32, OUTER_X + 0.26),
    y: [0, 0.64],
    z: [-3.66, -2.9],
  }, { chamfer: mirror(side, [0.16, 0.16, 0.05, 0.05]), fillet: 0.001, bevel: 0.035, arcSegments: 1 })
  box(root, m.ink, {
    x: span(side, JAMB_X + 0.65, OUTER_X - 0.8),
    y: [0.87, 1.52],
    z: [-3.4, -3.3],
  }, { chamfer: 0.1, fillet: 0.001, bevel: 0.02, arcSegments: 1 })

}

/** Door-pocket mechanism recessed into the inner edge of a tower. The cavity,
 * splayed lips, rails and retainers form one load path instead of a lamp box
 * and loose rods pasted onto the facade. */
function addJambGuide(root: Group, m: GateMaterials, side: number): void {
  const well = span(side, JAMB_X + 0.06, JAMB_X + 1.28)
  const railA = side * (JAMB_X + 0.38)
  const railB = side * (JAMB_X + 0.91)

  // Deep cavity floor. The black field is more than a metre behind the armor
  // lips, which gives the inner edge real negative space from oblique views.
  box(root, m.ink, {
    x: well,
    y: [3.36, 14.18],
    z: [1.98, 2.14],
  }, { fillet: 0.001, bevel: 0.03, arcSegments: 1 })

  // Captive side cheeks run from the cavity floor to the tower face. Their
  // unequal widths create a splayed entry rather than a square Minecraft slot.
  box(root, m.graphite, {
    x: span(side, JAMB_X + 0.02, JAMB_X + 0.23),
    y: [3.42, 14.12],
    z: [2.08, 3.47],
  }, { chamfer: mirror(side, [0.08, 0.02, 0.18, 0.04]), fillet: 0.001, bevel: 0.045, arcSegments: 1 })
  box(root, m.graphite, {
    x: span(side, JAMB_X + 1.08, JAMB_X + 1.34),
    y: [3.42, 14.12],
    z: [2.08, 3.43],
  }, { chamfer: mirror(side, [0.02, 0.1, 0.04, 0.2]), fillet: 0.001, bevel: 0.045, arcSegments: 1 })

  // Paired square guide rails are seated on the cavity floor. Thin central
  // steel lands catch highlights while the dark shoulders retain the door.
  for (const railX of [railA, railB]) {
    box(root, m.graphiteLight, {
      x: [railX - 0.13, railX + 0.13],
      y: [3.76, 13.82],
      z: [2.12, 2.42],
    }, { chamfer: 0.035, fillet: 0.001, bevel: 0.03, arcSegments: 1 })
    box(root, m.steel, {
      x: [railX - 0.045, railX + 0.045],
      y: [3.84, 13.74],
      z: [2.4, 2.51],
    }, { chamfer: 0.015, fillet: 0.001, bevel: 0.015, arcSegments: 1 })
  }

  // Repeated bridge retainers physically join both rails. Their hex fasteners
  // sit on the retainer face at exactly the same depth—nothing floats.
  for (const y of [4.25, 6.45, 8.65, 10.85, 13.05]) {
    box(root, m.graphiteLight, {
      x: span(side, JAMB_X + 0.22, JAMB_X + 1.07),
      y: [y - 0.14, y + 0.14],
      z: [2.4, 2.59],
    }, { chamfer: 0.045, fillet: 0.001, bevel: 0.025, arcSegments: 1 })
    bolt(root, m, railA, y, 2.64, 0.065)
    bolt(root, m, railB, y, 2.64, 0.065)
  }

  // Angled throat caps close the pocket into the lintel and sill. These make
  // the guide read as a continuous machined recess rather than an open box.
  beamBetween(root, m.graphiteLight,
    [side * (JAMB_X + 0.16), 3.48], [side * (JAMB_X + 1.17), 3.74],
    2.46, 0.26, 0.34)
  beamBetween(root, m.graphiteLight,
    [side * (JAMB_X + 0.16), 14.06], [side * (JAMB_X + 1.17), 13.8],
    2.46, 0.26, 0.34)
}

function addTower(root: Group, m: GateMaterials, side: number): void {
  towerFacade(root, m.shell, m.graphiteLight, m.ink, side)
  towerRearFacade(root, m.shellShadow, m.ink, side)

  // Rear service trunk mechanics. These rails sit inside the recessed floor
  // authored by towerRearFacade and bridge back into its chamfered shoulders.
  const rearCentre = side * ((JAMB_X + 0.52 + OUTER_X - 0.78) * 0.5)
  const rearRails = [rearCentre - 0.58, rearCentre + 0.58]
  for (const railX of rearRails) {
    box(root, m.graphiteLight, {
      x: [railX - 0.13, railX + 0.13],
      y: [4.88, 13.62],
      z: [-3.38, -3.16],
    }, { chamfer: 0.035, fillet: 0.001, bevel: 0.025, arcSegments: 1 })
    box(root, m.steel, {
      x: [railX - 0.04, railX + 0.04],
      y: [5.0, 13.5],
      z: [-3.47, -3.36],
    }, { chamfer: 0.012, fillet: 0.001, bevel: 0.012, arcSegments: 1 })
  }
  for (const y of [5.28, 7.88, 10.48, 13.08]) {
    box(root, m.graphite, {
      x: [Math.min(...rearRails) - 0.18, Math.max(...rearRails) + 0.18],
      y: [y - 0.13, y + 0.13],
      z: [-3.52, -3.32],
    }, { chamfer: 0.045, fillet: 0.001, bevel: 0.025, arcSegments: 1 })
    for (const railX of rearRails) bolt(root, m, railX, y, -3.57, 0.06)
  }
  // End hatches close the service trunk into the crown and footing.
  for (const [y0, y1] of [[3.58, 4.24], [14.52, 15.52]] as const) {
    box(root, m.graphiteLight, {
      x: [rearCentre - 0.72, rearCentre + 0.72],
      y: [y0, y1],
      z: [-3.03, -2.55],
    }, { chamfer: 0.11, fillet: 0.001, bevel: 0.035, arcSegments: 1 })
    bolt(root, m, rearCentre - 0.48, (y0 + y1) * 0.5, -3.08, 0.055)
    bolt(root, m, rearCentre + 0.48, (y0 + y1) * 0.5, -3.08, 0.055)
  }

  addJambGuide(root, m, side)

  // The status lamp belongs to the armored pillar face beside the door pocket,
  // not inside its guide mechanism as in the previous blockout.
  const lampX = span(side, JAMB_X + 1.58, JAMB_X + 2.34)
  box(root, m.graphiteLight, { x: lampX, y: [8.0, 13.1], z: [2.45, 2.84] }, {
    chamfer: mirror(side, [0.13, 0.2, 0.13, 0.2]), fillet: 0.001, bevel: 0.05, arcSegments: 1,
  })
  box(root, m.field, {
    x: [lampX[0] + 0.16, lampX[1] - 0.16],
    y: [8.35, 12.75],
    z: [2.82, 2.94],
  }, { chamfer: 0.1, fillet: 0.001, bevel: 0.035, arcSegments: 1 })

  box(root, m.graphite, {
    x: span(side, JAMB_X + 1.58, OUTER_X - 2.62),
    y: [17.35, 18.45],
    z: [TOWER_BACK + 0.7, 3.24],
  }, { chamfer: mirror(side, [0.32, 0.18, 0.02, 0.02]), fillet: 0.001, bevel: 0.05, arcSegments: 1 })
  box(root, m.shellLight, {
    x: span(side, JAMB_X + 1.78, OUTER_X - 2.82),
    y: [18.25, 18.65],
    z: [TOWER_BACK + 0.95, 3.0],
  }, { chamfer: mirror(side, [0.18, 0.12, 0.01, 0.01]), fillet: 0.001, bevel: 0.04, arcSegments: 1 })

  // Outer-side service trunk: two long armor rails surround one deep utility
  // strip, following the same vertical load path as the rear service recess.
  const outerSideX = side * (OUTER_X - 0.7)
  // Lower side bay occupies the broad flank between the footing and main
  // utility trunk. Its frame is embedded through the tower side wall.
  const lowerSideFloor = prism(m.ink, [3.72, 2.55, 0.16], [outerSideX, 5.16, 0.05], {
    chamfer: [0.24, 0.24, 0.16, 0.16], fillet: 0.001, bevel: 0.035, arcSegments: 1,
    rotation: [0, Math.PI / 2, 0],
  })
  root.add(lowerSideFloor)
  for (const z of [-1.5, 1.6]) {
    const lowerLand = prism(m.graphiteLight, [0.24, 2.12, 0.18], [outerSideX + side * 0.1, 5.16, z], {
      chamfer: 0.07, fillet: 0.001, bevel: 0.025, arcSegments: 1,
      rotation: [0, Math.PI / 2, 0],
    })
    root.add(lowerLand)
  }
  const lowerBridge = prism(m.graphiteLight, [3.28, 0.22, 0.16], [outerSideX + side * 0.1, 5.17, 0.05], {
    chamfer: 0.055, fillet: 0.001, bevel: 0.025, arcSegments: 1,
    rotation: [0, Math.PI / 2, 0],
  })
  root.add(lowerBridge)
  const lowerHatch = prism(m.shellShadow, [1.52, 1.22, 0.14], [outerSideX + side * 0.2, 5.17, 0.05], {
    chamfer: 0.16, fillet: 0.001, bevel: 0.035, arcSegments: 1,
    rotation: [0, Math.PI / 2, 0],
  })
  root.add(lowerHatch)

  const sideFloor = prism(m.ink, [3.95, 7.25, 0.16], [outerSideX, 10.55, 0.05], {
    chamfer: [0.28, 0.28, 0.18, 0.18], fillet: 0.001, bevel: 0.035, arcSegments: 1,
    rotation: [0, Math.PI / 2, 0],
  })
  root.add(sideFloor)
  for (const z of [-1.62, 1.72]) {
    const land = prism(m.graphiteLight, [0.24, 6.62, 0.18], [outerSideX + side * 0.1, 10.55, z], {
      chamfer: 0.07, fillet: 0.001, bevel: 0.025, arcSegments: 1,
      rotation: [0, Math.PI / 2, 0],
    })
    root.add(land)
  }
  // Cross retainers and captive conduit rails turn the outer-side void into a
  // connected service lattice. Every piece intersects either a side land or
  // the recessed floor beneath it.
  for (const y of [7.45, 9.55, 11.65, 13.62]) {
    const retainer = prism(m.graphiteLight, [3.5, 0.22, 0.16], [outerSideX + side * 0.1, y, 0.05], {
      chamfer: 0.055, fillet: 0.001, bevel: 0.025, arcSegments: 1,
      rotation: [0, Math.PI / 2, 0],
    })
    root.add(retainer)
  }
  for (const z of [-0.84, 0.94]) {
    const conduit = prism(m.steel, [0.12, 6.54, 0.1], [outerSideX + side * 0.2, 10.55, z], {
      chamfer: 0.025, fillet: 0.001, bevel: 0.014, arcSegments: 1,
      rotation: [0, Math.PI / 2, 0],
    })
    root.add(conduit)
  }

  const mastX = side * (JAMB_X + 2.75)
  root.add(cylinder(m.graphite, 0.14, 0.5, [mastX, 18.9, -0.1], undefined, 6))
  root.add(cylinder(m.steel, 0.045, 1.6, [mastX, 19.65, -0.1], undefined, 6))
}

function addLintel(root: Group, m: GateMaterials): void {
  const upper = ([
    [-7.0, 14.05],
    [-6.15, 15.2],
    [-5.6, 15.55],
    [5.6, 15.55],
    [6.15, 15.2],
    [7.0, 14.05],
  ] as Vec2[]).reverse()
  root.add(extrudeProfile(m.graphite, upper, 5.8, [0, 0, 0.15], { fillet: 0.11, bevel: 0.2, arcSegments: 2 }))

  box(root, m.graphiteLight, {
    x: [-7.7, 7.7],
    y: [11.4, LINTEL_TOP],
    z: [-2.25, 3.35],
  }, { chamfer: [0.35, 0.35, 0.18, 0.18], bevel: 0.12, arcSegments: 2 })
  box(root, m.ink, { x: [-7.25, 7.25], y: [11.55, 12.2], z: [3.32, 3.45] }, { chamfer: 0.12 })
  box(root, m.graphite, { x: [-6.8, 6.8], y: [12.35, 13.85], z: [3.33, 3.5] }, { chamfer: 0.16 })

  // Overlapping access plates and deep breaks articulate the drive housing
  // without changing its reference silhouette.
  for (const [from, to] of [[-6.15, -2.25], [-2.05, 2.4], [2.6, 6.15]] as const) {
    box(root, m.graphiteLight, {
      x: [from, to],
      y: [14.23, 15.18],
      z: [3.0, 3.16],
    }, { chamfer: 0.12, bevel: 0.06 })
    bolt(root, m, from + 0.25, 14.5, 3.2, 0.07)
    bolt(root, m, to - 0.25, 14.5, 3.2, 0.07)
  }

  // Three status lamps are the only repeated detail on the beam in reference.
  box(root, m.ink, { x: [-2.75, 2.75], y: [12.7, 13.35], z: [3.48, 3.56] }, { chamfer: 0.16 })
  for (const x of [-1.75, 0, 1.75]) {
    box(root, m.field, { x: [x - 0.38, x + 0.38], y: [12.88, 13.17], z: [3.54, 3.64] }, { chamfer: 0.09 })
  }

  for (const side of [-1, 1] as const) {
    const capX = span(side, 5.65, 6.72)
    box(root, m.shell, { x: capX, y: [11.85, 14.35], z: [3.34, 3.68] }, { chamfer: mirror(side, [0.35, 0.2, 0.12, 0.28]), bevel: 0.1 })
    boltRun(root, m, [side * 6.0, 12.2], [side * 6.0, 14.0], 3, 3.72)
  }

  // Rear drive covers use the same three-bay hierarchy as the front lintel and
  // terminate in one central service spine. They are embedded into the beam's
  // back wall, not floated behind it.
  for (const [from, to] of [[-6.9, -2.45], [-2.22, 2.22], [2.45, 6.9]] as const) {
    box(root, m.shellShadow, {
      x: [from, to],
      y: [12.0, 13.68],
      z: [-2.42, -2.15],
    }, { chamfer: 0.18, fillet: 0.001, bevel: 0.05, arcSegments: 1 })
    bolt(root, m, from + 0.28, 12.3, -2.47, 0.06)
    bolt(root, m, to - 0.28, 12.3, -2.47, 0.06)
  }
  box(root, m.graphite, {
    x: [-0.22, 0.22],
    y: [11.62, 14.0],
    z: [-2.5, -2.18],
  }, { chamfer: 0.07, fillet: 0.001, bevel: 0.03, arcSegments: 1 })
}

function addSill(root: Group, m: GateMaterials): void {
  box(root, m.graphite, {
    x: [-JAMB_X - 0.2, JAMB_X + 0.2],
    y: [0, SILL_TOP],
    z: [DOOR_BACK - 0.55, DOOR_FRONT + 1.0],
  }, { chamfer: [0.25, 0.25, 0.08, 0.08], bevel: 0.1 })
  box(root, m.ink, {
    x: [-JAMB_X + 0.15, JAMB_X - 0.15],
    y: [SILL_TOP - 0.32, SILL_TOP - 0.07],
    z: [DOOR_FRONT - 0.15, DOOR_FRONT + 0.35],
  }, { bevel: 0.04 })
  for (let i = 0; i < 15; i += 1) {
    const x = -5.05 + i * 0.72
    box(root, m.steel, {
      x: [x - 0.14, x + 0.14],
      y: [SILL_TOP - 0.29, SILL_TOP - 0.11],
      z: [DOOR_FRONT - 0.05, DOOR_FRONT + 0.38],
    }, { bevel: 0.025, fillet: 0.02 })
  }
}

function addFrameBraces(root: Group, m: GateMaterials): void {
  for (const side of [-1, 1] as const) {
    const lower: Vec2 = [side * (JAMB_X - 0.08), 1.95]
    const upper: Vec2 = [side * (JAMB_X + 2.15), 8.35]
    beamBetween(root, m.graphite, lower, upper, TOWER_FRONT + 1.18, 0.64, 0.48)
    beamBetween(root, m.steel, lower, upper, TOWER_FRONT + 1.44, 0.15, 0.09)
    for (const [x, y] of [lower, upper]) {
      box(root, m.graphiteLight, {
        x: [x - 0.34, x + 0.34], y: [y - 0.34, y + 0.34],
        z: [TOWER_FRONT + 1.08, TOWER_FRONT + 1.54],
      }, { chamfer: 0.12, bevel: 0.07 })
      bolt(root, m, x, y, TOWER_FRONT + 1.59, 0.14)
    }
  }
}

interface DoorLeaf {
  side: number
  group: Group
}

function doorPlateProfile(side: number): Vec2[] {
  return mirroredProfile(side, [
    [0.08, SILL_TOP + 0.05],
    [JAMB_X - 0.08, SILL_TOP + 0.05],
    [JAMB_X - 0.08, DOOR_TOP - 0.05],
    [0.08, DOOR_TOP - 0.05],
  ])
}

function addDoorLeaf(root: Group, m: GateMaterials, side: number): DoorLeaf {
  const group = new Group()
  group.name = `storm-point-large-gate / ${side > 0 ? 'right' : 'left'} retracting leaf`
  root.add(group)

  group.add(extrudeProfile(m.graphite, doorPlateProfile(side), DOOR_FRONT - DOOR_BACK + 0.22, [0, 0, 0.02], {
    fillet: 0.08,
    bevel: 0.12,
  }))

  // Rear armor moves with the leaf. Two continuous tapered slabs leave a deep
  // horizontal service reveal and tie into center/outer drive stiles.
  const rearUpper = mirroredProfile(side, [
    [0.38, 7.72], [JAMB_X - 0.46, 7.72],
    [JAMB_X - 0.28, 7.95], [JAMB_X - 0.28, 10.72],
    [JAMB_X - 0.5, 10.94], [0.6, 10.94], [0.38, 10.7],
  ])
  group.add(extrudeProfile(m.shellShadow, rearUpper, 0.18, [0, 0, -1.09], {
    fillet: 0.04, bevel: 0.055, arcSegments: 1,
  }))
  const rearLower = mirroredProfile(side, [
    [0.38, 2.02], [JAMB_X - 0.52, 2.02],
    [JAMB_X - 0.3, 2.3], [JAMB_X - 0.3, 7.12],
    [JAMB_X - 0.58, 7.44], [0.68, 7.44], [0.38, 6.94],
  ])
  group.add(extrudeProfile(m.shell, rearLower, 0.2, [0, 0, -1.1], {
    fillet: 0.045, bevel: 0.06, arcSegments: 1,
  }))
  box(group, m.graphiteLight, {
    x: span(side, 0.06, 0.5),
    y: [SILL_TOP + 0.05, DOOR_TOP - 0.05],
    z: [-1.28, -1.05],
  }, { chamfer: 0.08, fillet: 0.001, bevel: 0.035, arcSegments: 1 })
  box(group, m.graphite, {
    x: span(side, JAMB_X - 0.78, JAMB_X - 0.36),
    y: [SILL_TOP + 0.2, DOOR_TOP - 0.2],
    z: [-1.27, -1.05],
  }, { chamfer: 0.07, fillet: 0.001, bevel: 0.03, arcSegments: 1 })

  // Upper and lower armor panels are separate interlocking slabs over one leaf
  // body; the black reveals make their depth legible without random overlays.
  const upper = mirroredProfile(side, [
    [0.18, 7.65], [JAMB_X - 0.48, 7.65],
    [JAMB_X - 0.28, 7.9], [JAMB_X - 0.28, 10.7],
    [JAMB_X - 0.52, 10.95], [0.42, 10.95], [0.18, 10.7],
  ])
  group.add(extrudeProfile(m.ink, upper, 0.16, [0, 0, DOOR_FRONT + 0.03], { fillet: 0.05, bevel: 0.07 }))
  const upperFace = mirroredProfile(side, [
    [0.42, 7.9], [JAMB_X - 0.68, 7.9],
    [JAMB_X - 0.48, 8.1], [JAMB_X - 0.48, 10.5],
    [JAMB_X - 0.7, 10.72], [0.62, 10.72], [0.42, 10.5],
  ])
  group.add(extrudeProfile(m.shellLight, upperFace, 0.28, [0, 0, DOOR_FRONT + 0.23], { fillet: 0.07, bevel: 0.12 }))
  const upperInset = mirroredProfile(side, [
    [0.72, 8.15], [JAMB_X - 0.92, 8.15], [JAMB_X - 0.72, 8.34],
    [JAMB_X - 0.72, 10.22], [JAMB_X - 0.94, 10.43], [0.9, 10.43],
  ])
  group.add(extrudeProfile(m.shell, upperInset, 0.14, [0, 0, DOOR_FRONT + 0.34], { fillet: 0.05, bevel: 0.07 }))

  const lower = mirroredProfile(side, [
    [0.18, 2.0], [JAMB_X - 0.5, 2.0],
    [JAMB_X - 0.28, 2.28], [JAMB_X - 0.28, 7.12],
    [JAMB_X - 0.55, 7.48], [0.5, 7.48], [0.18, 6.95],
  ])
  group.add(extrudeProfile(m.ink, lower, 0.16, [0, 0, DOOR_FRONT + 0.03], { fillet: 0.06, bevel: 0.08 }))
  const lowerFace = mirroredProfile(side, [
    [0.42, 2.24], [JAMB_X - 1.14, 2.24],
    [JAMB_X - 0.54, 2.72], [JAMB_X - 0.5, 6.92],
    [JAMB_X - 0.74, 7.22], [0.68, 7.22], [0.42, 6.78],
  ])
  group.add(extrudeProfile(m.shell, lowerFace, 0.3, [0, 0, DOOR_FRONT + 0.24], { fillet: 0.07, bevel: 0.13 }))
  const lowerInset = mirroredProfile(side, [
    [0.78, 2.56], [JAMB_X - 1.38, 2.56],
    [JAMB_X - 0.86, 2.96], [JAMB_X - 0.78, 6.58],
    [JAMB_X - 1.0, 6.86], [0.96, 6.86], [0.78, 6.55],
  ])
  group.add(extrudeProfile(m.shellLight, lowerInset, 0.15, [0, 0, DOOR_FRONT + 0.37], { fillet: 0.05, bevel: 0.08 }))

  // Heavy lower-door guide follows the reference's load path from the sill up
  // into the center reveal. It is a structural beam with a steel wear land and
  // seated endpoint housings, not a diagonal decal.
  const lowerGuide: Vec2 = [side * (JAMB_X - 0.78), 2.18]
  const upperGuide: Vec2 = [side * (JAMB_X - 2.12), 7.08]
  beamBetween(group, m.graphite, lowerGuide, upperGuide, DOOR_FRONT + 0.62, 0.48, 0.34)
  beamBetween(group, m.steel, lowerGuide, upperGuide, DOOR_FRONT + 0.81, 0.11, 0.07)
  for (const [x, y] of [lowerGuide, upperGuide]) {
    box(group, m.graphiteLight, {
      x: [x - 0.25, x + 0.25],
      y: [y - 0.25, y + 0.25],
      z: [DOOR_FRONT + 0.55, DOOR_FRONT + 0.88],
    }, { chamfer: 0.09, fillet: 0.001, bevel: 0.045, arcSegments: 1 })
    bolt(group, m, x, y, DOOR_FRONT + 0.93, 0.095)
  }

  // Deep maintenance slots and paired fasteners are cut into the nested door
  // slabs. Their placement follows the reference's sparse, functional rhythm.
  group.add(groove(m.ink, 0.72, 0.2, 0.085, [side * 2.05, 9.55, DOOR_FRONT + 0.47], [0, 0, Math.PI / 2]))
  group.add(groove(m.ink, 0.62, 0.18, 0.08, [side * 2.35, 3.55, DOOR_FRONT + 0.5], [0, 0, Math.PI / 2]))
  boltRun(group, m, [side * 1.05, 6.35], [side * (JAMB_X - 1.12), 6.35], 3, DOOR_FRONT + 0.52, 0.075)

  // Center stile and outer hinge/drive stile belong to the moving leaf.
  box(group, m.graphite, {
    x: span(side, 0.04, 0.48),
    y: [SILL_TOP + 0.03, DOOR_TOP - 0.03],
    z: [DOOR_FRONT + 0.15, DOOR_FRONT + 0.52],
  }, { chamfer: 0.1, bevel: 0.07 })
  box(group, m.graphiteLight, {
    x: span(side, JAMB_X - 0.82, JAMB_X - 0.38),
    y: [SILL_TOP + 0.2, DOOR_TOP - 0.2],
    z: [DOOR_FRONT + 0.18, DOOR_FRONT + 0.47],
  }, { chamfer: 0.08 })

  // Sparse authored seams and fasteners follow actual plate perimeters.
  seam(group, m, 4.25, [side * 2.8, 9.3, DOOR_FRONT + 0.37], true)
  seam(group, m, 3.8, [side * 2.75, 4.65, DOOR_FRONT + 0.39])
  boltRun(group, m, [side * 0.8, 10.4], [side * (JAMB_X - 0.95), 10.4], 4, DOOR_FRONT + 0.42)
  boltRun(group, m, [side * 0.8, 2.6], [side * (JAMB_X - 0.95), 2.6], 4, DOOR_FRONT + 0.44)

  return { side, group }
}

function addInterlock(parent: Group, m: GateMaterials): Group {
  const lock = new Group()
  lock.name = 'storm-point-large-gate / retracting interlock'
  parent.add(lock)
  box(lock, m.graphite, {
    x: [-0.42, 0.28],
    y: [9.05, 11.62],
    z: [DOOR_FRONT + 0.18, DOOR_FRONT + 0.58],
  }, { chamfer: 0.1, bevel: 0.07 })
  box(lock, m.graphiteLight, {
    x: [-0.24, 0.1],
    y: [9.18, 11.55],
    z: [DOOR_FRONT + 0.56, DOOR_FRONT + 0.68],
  }, { chamfer: 0.05, bevel: 0.04 })
  box(lock, m.graphite, {
    x: [-1.32, 1.18],
    y: [6.75, 9.3],
    z: [DOOR_FRONT + 0.38, DOOR_FRONT + 0.86],
  }, { chamfer: 0.62, fillet: 0.08, bevel: 0.1, arcSegments: 2 })
  box(lock, m.ink, {
    x: [-1.02, 0.88],
    y: [7.05, 9.0],
    z: [DOOR_FRONT + 0.84, DOOR_FRONT + 0.94],
  }, { chamfer: 0.48, bevel: 0.05 })
  box(lock, m.field, {
    x: [-0.8, 0.66],
    y: [7.28, 8.77],
    z: [DOOR_FRONT + 0.93, DOOR_FRONT + 1.02],
  }, { chamfer: 0.37, bevel: 0.05 })
  box(lock, m.graphite, {
    x: [-0.53, 0.39],
    y: [7.55, 8.5],
    z: [DOOR_FRONT + 1.0, DOOR_FRONT + 1.09],
  }, { chamfer: 0.25, bevel: 0.05 })
  box(lock, m.field, {
    x: [-0.2, 0.06],
    y: [7.88, 8.17],
    z: [DOOR_FRONT + 1.08, DOOR_FRONT + 1.15],
  }, { chamfer: 0.06 })
  return lock
}

export interface GateController {
  root: Group
  update(deltaSeconds: number): void
  toggleGate(): void
  isOpen(): boolean
  dispose(): void
}

function smoothstep(value: number): number {
  const t = Math.min(1, Math.max(0, value))
  return t * t * (3 - 2 * t)
}

export function createModel(): GateController {
  const { materials, handles, profiles, wearMaterial } = acquireGateMaterials()
  const root = new Group()
  root.name = 'storm-point-large-gate'
  // The reference is slightly taller and less sprawling than the raw authored
  // dimensions. A uniform horizontal presentation scale preserves every joint
  // and animation while correcting the overall portal aspect.
  root.scale.x = 0.94
  const statics = new Group()
  statics.name = 'storm-point-large-gate / structural frame'
  root.add(statics)

  addPlinth(statics, materials, -1)
  addPlinth(statics, materials, 1)
  addTower(statics, materials, -1)
  addTower(statics, materials, 1)
  addLintel(statics, materials)
  addSill(statics, materials)
  addFrameBraces(statics, materials)

  const left = addDoorLeaf(root, materials, -1)
  const right = addDoorLeaf(root, materials, 1)
  const interlock = addInterlock(root, materials)

  bakeOcclusion(root, { reach: 0.46 })
  bakeSurfaceAttributes(root, profiles)
  const worn = new Set(profiles.keys())
  const mergeGroup = (group: Group, label: string): BufferGeometry[] => {
    const merged = mergeStaticByMaterial(group, {
      resolveMaterial: (source) => worn.has(source as MeshPhysicalMaterial) ? wearMaterial : source,
      retainedAttributes: (resolved) => resolved === wearMaterial ? WEAR_ATTRIBUTES : [],
      meshName: (material) => `storm-point-large-gate / ${label} / ${material.name}`,
    })
    const meshes = group.children.filter((object): object is Mesh => object instanceof Mesh)
    return meshes.map((mesh, index) => {
      const indexed = mergeVertices(merged[index], 1e-5)
      mesh.geometry = indexed
      merged[index].dispose()
      return indexed
    })
  }

  const geometries = [
    ...mergeGroup(statics, 'frame'),
    ...mergeGroup(left.group, 'left leaf'),
    ...mergeGroup(right.group, 'right leaf'),
    ...mergeGroup(interlock, 'interlock'),
  ]

  let progress = 0
  let target = 0
  const idleOrange = new Color(0xff6208)
  const alarmRed = new Color(0xff1208)
  const setSignal = (mix: number): void => {
    materials.field.color.lerpColors(idleOrange, alarmRed, mix)
    materials.field.emissive.lerpColors(idleOrange, alarmRed, mix)
    materials.field.emissiveIntensity = mix > 0.5 ? 0.78 : 0.54
  }
  setSignal(0)

  const pose = (): void => {
    // The center bolt rises into the lintel first. Only once its top face meets
    // the ceiling do the two complete leaves retract into their jamb pockets.
    const release = smoothstep(progress / 0.28)
    const travel = smoothstep((progress - 0.28) / 0.72) * LEAF_TRAVEL
    interlock.position.y = 2.05 * release
    left.group.position.x = -travel
    right.group.position.x = travel
  }
  pose()

  return {
    root,
    update(deltaSeconds: number) {
      const delta = Math.min(0.05, Math.max(0, deltaSeconds))
      const was = progress
      const step = delta / 3.1
      if (target > progress) progress = Math.min(target, progress + step)
      else if (target < progress) progress = Math.max(target, progress - step)
      const moving = Math.abs(progress - target) > 1e-5 || Math.abs(progress - was) > 1e-5
      root.userData.gateMoving = moving
      setSignal(moving ? 1 : 0)
      pose()
    },
    toggleGate() {
      target = target < 0.5 ? 1 : 0
      root.userData.gateMoving = true
      setSignal(1)
    },
    isOpen: () => target > 0.5,
    dispose() {
      for (const geometry of geometries) geometry.dispose()
      wearMaterial.dispose()
      for (const handle of handles) handle.release()
    },
  }
}

export function createPreview(options: { aspect: number; time?: number }): {
  scene: Scene
  root: Group
  camera: PerspectiveCamera
  update: (deltaSeconds: number) => void
  toggleGate: () => void
  isOpen: () => boolean
  dispose: () => void
} {
  const controller = createModel()
  const scene = new Scene()
  scene.name = 'storm-point-large-gate / reference-matched preview'
  scene.background = new Color(0x000000)
  scene.add(controller.root)

  scene.add(new HemisphereLight(0x91a4b5, 0x070a0d, 0.3))
  const key = new DirectionalLight(0xfff1e5, 2.45)
  key.position.set(-13, 22, 28)
  // Baked short-range occlusion carries the structural contact. A realtime
  // shadow map produced dense stripe acne on the shallow shoulder undersides.
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.left = -22
  key.shadow.camera.right = 22
  key.shadow.camera.top = 24
  key.shadow.camera.bottom = -5
  key.shadow.camera.near = 8
  key.shadow.camera.far = 90
  key.shadow.bias = -0.00012
  key.shadow.normalBias = 0.085
  scene.add(key)
  const fill = new DirectionalLight(0x8aa8c0, 0.42)
  fill.position.set(20, 8, 16)
  scene.add(fill)
  const rim = new DirectionalLight(0xaac4d2, 0.48)
  rim.position.set(12, 15, -20)
  scene.add(rim)

  const signalLights: PointLight[] = []
  for (const side of [-1, 1]) {
    const light = new PointLight(0xff5c08, 0.32, 7, 2)
    light.position.set(side * 6.35, 10.5, 4.1)
    scene.add(light)
    signalLights.push(light)
  }

  controller.root.traverse((object) => {
    if (object instanceof Mesh) {
      object.castShadow = true
      object.receiveShadow = true
    }
  })

  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1.165
  const camera = new PerspectiveCamera(28, aspect, 1, 180)
  camera.name = 'storm-point-large-gate / reference camera'
  camera.position.set(-12.5, 10.2, 47)
  camera.lookAt(0, 9.1, 0)
  scene.add(camera)

  const preroll = options.time ?? 0
  if (preroll > 0) {
    controller.toggleGate()
    for (let t = 0; t < preroll; t += 1 / 60) controller.update(1 / 60)
  }

  const update = (deltaSeconds: number): void => {
    controller.update(deltaSeconds)
    const signal = controller.root.userData.gateMoving ? 0xff1208 : 0xff5c08
    for (const light of signalLights) light.color.setHex(signal)
  }

  return {
    scene,
    root: controller.root,
    camera,
    update,
    toggleGate: controller.toggleGate,
    isOpen: controller.isOpen,
    dispose: () => {
      scene.remove(controller.root)
      controller.dispose()
    },
  }
}

/** QA-only orbit views used by Forge; the browser registry continues to use
 * createPreview and its reference-matched front camera. */
export function createSidePreview(options: { aspect: number; time?: number }): ReturnType<typeof createPreview> {
  const preview = createPreview(options)
  preview.camera.position.set(39, 5.2, 4.5)
  preview.camera.lookAt(0, 7.2, 0)
  preview.camera.updateProjectionMatrix()
  return preview
}

export function createRearPreview(options: { aspect: number; time?: number }): ReturnType<typeof createPreview> {
  const preview = createPreview(options)
  preview.camera.position.set(12.5, 10.2, -47)
  preview.camera.lookAt(0, 9.1, 0)
  preview.camera.updateProjectionMatrix()
  return preview
}
