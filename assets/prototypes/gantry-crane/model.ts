import {
  BufferGeometry,
  CatmullRomCurve3,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  DirectionalLight,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  LinearFilter,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  Shape,
  SRGBColorSpace,
  TubeGeometry,
  UnsignedByteType,
  Vector3,
} from 'three/webgpu'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

import {
  MaterialLibrary,
  WEAR_ATTRIBUTES,
  bakeOcclusion,
  bakeSurfaceAttributes,
  createWearMaterial,
  cylinder,
  mergeStaticByMaterial,
  prism,
  tuneMaterial,
  type MaterialHandle,
  type Vec3,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'

const LEG_X = 5.08
const BEAM_Y = 7.42

type Point = readonly [number, number]

interface LoftRing {
  z: number
  points: ReadonlyArray<Point>
}

interface CraneMaterials {
  shell: MeshPhysicalMaterial
  shellLight: MeshPhysicalMaterial
  shellShadow: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  graphiteEdge: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  amberDim: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
  hazard: MeshPhysicalMaterial
}

interface CraneMotion {
  trolley: Group
  lower: Group
  cables: Mesh[]
}

interface MaterialBundle {
  materials: CraneMaterials
  handles: MaterialHandle[]
  profiles: Map<MeshPhysicalMaterial, WearProfile>
  hazardTexture: DataTexture
}

function profileBody(
  material: MeshPhysicalMaterial,
  points: ReadonlyArray<Point>,
  depth: number,
  position: Vec3,
  bevel = 0.045,
): Mesh {
  const shape = new Shape()
  shape.moveTo(points[0][0], points[0][1])
  for (let index = 1; index < points.length; index += 1) shape.lineTo(points[index][0], points[index][1])
  shape.closePath()
  const coreDepth = Math.max(0.01, depth - bevel * 2)
  const geometry = new ExtrudeGeometry(shape, {
    depth: coreDepth,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 1,
    steps: 1,
  })
  geometry.translate(0, 0, -coreDepth * 0.5)
  const mesh = new Mesh(geometry, material)
  mesh.position.set(...position)
  return mesh
}

function scaleProfile(points: ReadonlyArray<Point>, scaleX: number, scaleY: number): Point[] {
  const centerX = points.reduce((sum, point) => sum + point[0], 0) / points.length
  const centerY = points.reduce((sum, point) => sum + point[1], 0) / points.length
  return points.map(([x, y]) => [
    centerX + (x - centerX) * scaleX,
    centerY + (y - centerY) * scaleY,
  ] as const)
}

function loftBody(
  material: MeshPhysicalMaterial,
  rings: ReadonlyArray<LoftRing>,
  position: Vec3,
): Mesh {
  const ringSize = rings[0].points.length
  if (rings.some((ring) => ring.points.length !== ringSize)) throw new Error('Loft rings must have matching topology')
  const positions: number[] = []
  const uvs: number[] = []
  for (let ringIndex = 0; ringIndex < rings.length; ringIndex += 1) {
    const ring = rings[ringIndex]
    for (let pointIndex = 0; pointIndex < ringSize; pointIndex += 1) {
      const point = ring.points[pointIndex]
      positions.push(point[0], point[1], ring.z)
      uvs.push(pointIndex / ringSize, ringIndex / Math.max(1, rings.length - 1))
    }
  }
  const backCenterX = rings[0].points.reduce((sum, point) => sum + point[0], 0) / ringSize
  const backCenterY = rings[0].points.reduce((sum, point) => sum + point[1], 0) / ringSize
  const frontRing = rings[rings.length - 1]
  const frontCenterX = frontRing.points.reduce((sum, point) => sum + point[0], 0) / ringSize
  const frontCenterY = frontRing.points.reduce((sum, point) => sum + point[1], 0) / ringSize
  const backCenterIndex = positions.length / 3
  positions.push(backCenterX, backCenterY, rings[0].z)
  uvs.push(0.5, 0.5)
  const frontCenterIndex = positions.length / 3
  positions.push(frontCenterX, frontCenterY, frontRing.z)
  uvs.push(0.5, 0.5)

  const indices: number[] = []
  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
    const offset = ringIndex * ringSize
    const nextOffset = offset + ringSize
    for (let pointIndex = 0; pointIndex < ringSize; pointIndex += 1) {
      const next = (pointIndex + 1) % ringSize
      indices.push(offset + pointIndex, offset + next, nextOffset + next)
      indices.push(offset + pointIndex, nextOffset + next, nextOffset + pointIndex)
    }
  }
  const frontOffset = (rings.length - 1) * ringSize
  for (let pointIndex = 0; pointIndex < ringSize; pointIndex += 1) {
    const next = (pointIndex + 1) % ringSize
    indices.push(backCenterIndex, next, pointIndex)
    indices.push(frontCenterIndex, frontOffset + pointIndex, frontOffset + next)
  }
  const indexed = new BufferGeometry()
  indexed.setAttribute('position', new Float32BufferAttribute(positions, 3))
  indexed.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  indexed.setIndex(indices)
  // Hard-surface lofts need authored plane breaks. Shared ring vertices make
  // the armor look inflated, so split the facets before deriving normals.
  const geometry = indexed.toNonIndexed()
  indexed.dispose()
  geometry.computeVertexNormals()
  const mesh = new Mesh(geometry, material)
  mesh.position.set(...position)
  return mesh
}

function armoredBody(
  material: MeshPhysicalMaterial,
  points: ReadonlyArray<Point>,
  depth: number,
  position: Vec3,
  frontScaleX = 0.84,
  frontScaleY = 0.86,
  transition = 0.2,
): Mesh {
  const halfDepth = depth * 0.5
  return loftBody(material, [
    { z: -halfDepth, points },
    { z: halfDepth - transition, points },
    { z: halfDepth - transition * 0.42, points: scaleProfile(points, 0.94, 0.95) },
    { z: halfDepth, points: scaleProfile(points, frontScaleX, frontScaleY) },
  ], position)
}

function mirror(points: ReadonlyArray<Point>): Point[] {
  // Reflection flips polygon winding; reverse the ring so front caps and side
  // facets keep outward normals after mirroring.
  return points.map(([x, y]) => [-x, y] as const).reverse()
}

function createHookProfile(): Point[] {
  // Authored open J-hook silhouette: straight forged neck, broad load-bearing
  // heel, a deep throat, and an upturned safety tip. The concave profile is
  // triangulated by ExtrudeGeometry rather than approximated with a torus arc.
  return [
    [0.12, 0.76], [0.32, 0.76], [0.4, 0.54], [0.46, 0.34],
    [0.52, 0.1], [0.48, -0.2], [0.34, -0.45], [0.1, -0.6],
    [-0.18, -0.56], [-0.4, -0.4], [-0.55, -0.15], [-0.57, 0.12],
    [-0.5, 0.35], [-0.38, 0.58], [-0.32, 0.48], [-0.38, 0.31],
    [-0.39, 0.12], [-0.34, -0.08], [-0.2, -0.27], [0, -0.36],
    [0.16, -0.3], [0.27, -0.15], [0.3, 0.05], [0.27, 0.23],
    [0.18, 0.36], [0.12, 0.48],
  ]
}

function addMember(
  parent: Group,
  material: MeshPhysicalMaterial,
  start: Vec3,
  end: Vec3,
  width: number,
  depth: number,
): void {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const length = Math.hypot(dx, dy)
  parent.add(prism(material, [length, width, depth], [
    (start[0] + end[0]) * 0.5,
    (start[1] + end[1]) * 0.5,
    (start[2] + end[2]) * 0.5,
  ], {
    chamfer: Math.min(0.05, width * 0.18),
    fillet: 0.02,
    bevel: 0.025,
    rotation: [0, 0, Math.atan2(dy, dx)],
  }))
}

function addBolt(
  parent: Group,
  material: MeshPhysicalMaterial,
  x: number,
  y: number,
  hostFrontZ: number,
  radius = 0.055,
): void {
  parent.add(cylinder(material, radius, 0.045, [x, y, hostFrontZ + 0.022], [Math.PI / 2, 0, 0], 8))
}

function addPinJoint(
  parent: Group,
  m: CraneMaterials,
  x: number,
  y: number,
  z: number,
  radius = 0.14,
): void {
  parent.add(cylinder(m.graphiteEdge, radius, 0.2, [x, y, z], [Math.PI / 2, 0, 0], 12))
  parent.add(cylinder(m.ink, radius * 0.43, 0.225, [x, y, z + 0.015], [Math.PI / 2, 0, 0], 10))
}

function createHazardTexture(): DataTexture {
  const width = 128
  const height = 32
  const pixels = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const amber = Math.floor((x + y * 0.78) / 15) % 2 === 0
      const offset = (y * width + x) * 4
      pixels[offset] = amber ? 224 : 22
      pixels[offset + 1] = amber ? 146 : 27
      pixels[offset + 2] = amber ? 20 : 29
      pixels[offset + 3] = 255
    }
  }
  const texture = new DataTexture(pixels, width, height, RGBAFormat, UnsignedByteType)
  texture.name = 'gantry-crane / hazard stripe decal'
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

function addHazardDecal(
  parent: Group,
  m: CraneMaterials,
  x: number,
  y: number,
  width: number,
  plaqueFrontZ: number,
): void {
  parent.add(prism(m.ink, [width, 0.42, 0.12], [x, y, plaqueFrontZ - 0.06], {
    chamfer: 0.06,
    fillet: 0.025,
    bevel: 0.025,
  }))
  const decal = new Mesh(new PlaneGeometry(width - 0.12, 0.3, 1, 1), m.hazard)
  decal.name = 'gantry-crane / seated hazard decal'
  decal.position.set(x, y, plaqueFrontZ + 0.016)
  parent.add(decal)
}

function addAccessHatch(
  parent: Group,
  m: CraneMaterials,
  x: number,
  y: number,
  hostFrontZ: number,
): void {
  parent.add(profileBody(m.ink, [
    [-0.36, -0.34], [0.36, -0.34], [0.36, 0.27], [0.28, 0.35],
    [-0.28, 0.35], [-0.36, 0.27],
  ], 0.09, [x, y, hostFrontZ + 0.052], 0.025))
  parent.add(profileBody(m.shellShadow, [
    [-0.27, -0.25], [0.27, -0.25], [0.27, 0.2], [0.2, 0.27],
    [-0.2, 0.27], [-0.27, 0.2],
  ], 0.055, [x, y, hostFrontZ + 0.11], 0.018))
  parent.add(prism(m.graphiteEdge, [0.2, 0.055, 0.045], [x, y + 0.1, hostFrontZ + 0.155], {
    chamfer: 0.018,
    fillet: 0.008,
    bevel: 0.008,
  }))
  for (const dx of [-0.27, 0.27]) {
    for (const dy of [-0.24, 0.24]) addBolt(parent, m.ink, x + dx, y + dy, hostFrontZ + 0.102, 0.035)
  }
}

function addBase(parent: Group, m: CraneMaterials, side: -1 | 1): void {
  const x = side * LEG_X

  // One connected multi-tier plinth, split visually by inset service seams.
  const plinthProfile: Point[] = [
    [-1.34, -0.3], [-1.18, -0.48], [1.18, -0.48], [1.34, -0.3],
    [1.26, 0.31], [1.02, 0.46], [-1.02, 0.46], [-1.26, 0.31],
  ]
  parent.add(armoredBody(m.graphite, plinthProfile, 2.42, [x, 0.48, 0], 0.88, 0.82, 0.2))
  parent.add(armoredBody(m.graphiteEdge, [
    [-1.12, -0.19], [-1.02, -0.29], [1.02, -0.29], [1.12, -0.19],
    [1.07, 0.17], [0.94, 0.27], [-0.94, 0.27], [-1.07, 0.17],
  ], 2.46, [x, 0.68, 0], 0.9, 0.84, 0.14))
  for (const seamX of [-0.84, 0.84]) {
    parent.add(prism(m.ink, [0.055, 0.45, 0.035], [x + seamX, 0.47, 1.235], {
      chamfer: 0.012,
      fillet: 0.006,
      bevel: 0.006,
    }))
  }

  // Dark machinery core plus two solid armor cheeks. The negative space between
  // them is the recessed drive bay visible in the reference.
  parent.add(armoredBody(m.graphite, [
    [-0.94, -1.0], [0.94, -1.0], [0.94, 0.38], [0.58, 1.1],
    [-0.58, 1.1], [-0.94, 0.38],
  ], 1.74, [x, 1.78, 0], 0.8, 0.86, 0.22))
  const leftCheek: Point[] = [
    [-1.03, -0.98], [-0.34, -0.98], [-0.34, 0.34], [-0.58, 1.16],
    [-0.84, 0.94], [-1.03, 0.42],
  ]
  parent.add(armoredBody(m.shell, leftCheek, 1.94, [x, 1.78, 0], 0.76, 0.84, 0.24))
  parent.add(armoredBody(m.shellLight, mirror(leftCheek), 1.94, [x, 1.78, 0], 0.76, 0.84, 0.24))

  // Recessed central ramp and real service hatch; no invented white buttons.
  parent.add(profileBody(m.ink, [
    [-0.3, -0.73], [0.3, -0.73], [0.3, 0.28], [0.18, 0.72],
    [-0.18, 0.72], [-0.3, 0.28],
  ], 0.16, [x, 1.82, 0.94], 0.025))
  parent.add(profileBody(m.graphiteEdge, [
    [-0.21, -0.64], [0.21, -0.64], [0.21, 0.22], [0.12, 0.58],
    [-0.12, 0.58], [-0.21, 0.22],
  ], 0.075, [x, 1.82, 1.055], 0.018))
  addAccessHatch(parent, m, x + side * 0.55, 1.42, 0.99)
  // Plate split and load-fastener group are recessed into the outer cheek.
  addMember(parent, m.ink, [x - side * 0.91, 2.12, 0.99], [x - side * 0.38, 2.12, 0.99], 0.028, 0.04)
  addBolt(parent, m.ink, x - side * 0.84, 2.48, 1.0, 0.04)
  addBolt(parent, m.ink, x - side * 0.48, 2.7, 1.0, 0.04)

  parent.add(prism(m.ink, [0.28, 0.5, 0.11], [x - side * 0.73, 1.09, 1.02], {
    chamfer: 0.06,
    fillet: 0.025,
    bevel: 0.022,
  }))
  parent.add(prism(m.amber, [0.12, 0.27, 0.055], [x - side * 0.73, 1.09, 1.102], {
    chamfer: 0.035,
    fillet: 0.014,
    bevel: 0.012,
  }))
  addHazardDecal(parent, m, x, 0.7, 1.42, 1.27)

  // Paired lower outriggers frame the mast and terminate in pinned feet.
  const inner = -side
  addMember(parent, m.graphiteEdge, [x + inner * 0.78, 0.82, 0.87], [x + inner * 0.5, 3.02, 0.87], 0.3, 0.24)
  addMember(parent, m.shellLight, [x + inner * 0.76, 0.88, 1.02], [x + inner * 0.47, 2.98, 1.02], 0.18, 0.17)
  addPinJoint(parent, m, x + inner * 0.5, 2.96, 1.08, 0.12)
  addPinJoint(parent, m, x + inner * 0.77, 0.9, 1.08, 0.11)
}

function addTower(parent: Group, m: CraneMaterials, side: -1 | 1): void {
  const x = side * LEG_X
  const centerY = 4.66

  // A rear spine and two exposed load rails form the tower. The channel between
  // them is genuinely recessed instead of painted onto a broad front slab.
  parent.add(prism(m.ink, [1.04, 4.42, 0.34], [x, centerY, -0.48], {
    chamfer: 0.06,
    fillet: 0.025,
    bevel: 0.025,
  }))
  for (const rail of [-0.31, 0.31]) {
    parent.add(prism(m.graphite, [0.2, 4.38, 0.72], [x + rail, centerY, -0.02], {
      chamfer: 0.055,
      fillet: 0.02,
      bevel: 0.025,
    }))
  }
  const leftTowerCheek: Point[] = [
    [-0.64, -2.16], [-0.34, -2.16], [-0.31, -0.42],
    [-0.36, 1.34], [-0.43, 2.18], [-0.64, 2.08],
  ]
  parent.add(armoredBody(m.shell, leftTowerCheek, 1.24, [x, centerY, 0.01], 0.93, 0.98, 0.12))
  parent.add(armoredBody(m.shellShadow, mirror(leftTowerCheek), 1.24, [x, centerY, 0.01], 0.93, 0.98, 0.12))
  // Recessed course lines break the long cheeks without adding button-like
  // plates. Their backs overlap the cheek front so they cannot float.
  for (const seamY of [3.86 + side * 0.12, 5.35 - side * 0.1]) {
    parent.add(prism(m.ink, [0.22, 0.028, 0.04], [x - 0.49, seamY, 0.64], {
      chamfer: 0.008,
      fillet: 0.004,
      bevel: 0.004,
    }))
    parent.add(prism(m.ink, [0.22, 0.028, 0.04], [x + 0.49, seamY + 0.28, 0.64], {
      chamfer: 0.008,
      fillet: 0.004,
      bevel: 0.004,
    }))
  }
  parent.add(prism(m.ink, [0.54, 4.17, 0.1], [x, centerY, 0.25], {
    chamfer: 0.045,
    fillet: 0.018,
    bevel: 0.018,
  }))
  parent.add(prism(m.steel, [0.085, 4.02, 0.07], [x, centerY, 0.36], {
    chamfer: 0.02,
    fillet: 0.01,
    bevel: 0.01,
  }))

  for (const y of [3.42, 5.18]) {
    parent.add(prism(m.graphiteEdge, [0.7, 0.18, 0.18], [x, y, 0.43], {
      chamfer: 0.045,
      fillet: 0.018,
      bevel: 0.018,
    }))
    addBolt(parent, m.ink, x - 0.25, y, 0.53, 0.042)
    addBolt(parent, m.ink, x + 0.25, y, 0.53, 0.042)
  }

  // Upper brace is a doubled pinned linkage, not a free diagonal slab.
  const inner = -side
  for (const z of [0.45, 0.72]) {
    addMember(parent, m.graphiteEdge, [x + inner * 0.43, 5.78, z], [x + inner * 1.48, 6.66, z], 0.18, 0.15)
  }
  addPinJoint(parent, m, x + inner * 0.43, 5.78, 0.86, 0.13)
  addPinJoint(parent, m, x + inner * 1.48, 6.66, 0.86, 0.13)
}

function addEndPod(parent: Group, m: CraneMaterials, side: -1 | 1): void {
  const x = side * LEG_X
  const pod: Point[] = [
    [-0.9, -0.66], [-0.68, -1.02], [0.62, -1.02], [0.88, -0.7],
    [0.88, 0.64], [0.64, 1.0], [-0.6, 1.0], [-0.9, 0.7],
  ]
  parent.add(armoredBody(m.shell, pod, 2.02, [x, BEAM_Y, 0], 0.78, 0.84, 0.3))
  parent.add(profileBody(m.shellShadow, [
    [-0.58, -0.45], [-0.42, -0.62], [0.42, -0.62], [0.58, -0.45],
    [0.58, 0.46], [0.42, 0.62], [-0.42, 0.62], [-0.58, 0.46],
  ], 0.12, [x, BEAM_Y, 1.035], 0.028))
  parent.add(profileBody(m.ink, [
    [-0.32, -0.34], [-0.22, -0.45], [0.22, -0.45], [0.32, -0.34],
    [0.32, 0.34], [0.22, 0.45], [-0.22, 0.45], [-0.32, 0.34],
  ], 0.08, [x, BEAM_Y, 1.105], 0.022))
  if (side < 0) {
    parent.add(profileBody(m.amber, [
      [-0.12, -0.27], [0.12, -0.27], [0.12, 0.27], [-0.12, 0.27],
    ], 0.05, [x, BEAM_Y, 1.17], 0.02))
  } else {
    for (const offsetY of [-0.24, -0.12, 0, 0.12, 0.24]) {
      parent.add(prism(m.amberDim, [0.3, 0.055, 0.045], [x, BEAM_Y + offsetY, 1.17], {
        chamfer: 0.015,
        fillet: 0.006,
        bevel: 0.006,
      }))
    }
  }

  // Ribbed sloped top hood.
  parent.add(armoredBody(m.graphite, [
    [-0.7, -0.2], [-0.5, -0.38], [0.53, -0.38], [0.72, -0.18],
    [0.58, 0.24], [-0.5, 0.24],
  ], 2.08, [x, BEAM_Y + 1.04, -0.02], 0.82, 0.8, 0.22))
  for (const ribX of [-0.36, 0, 0.36]) {
    parent.add(prism(m.graphiteEdge, [0.065, 0.52, 2.12], [x + ribX, BEAM_Y + 1.03, -0.02], {
      chamfer: 0.018,
      fillet: 0.008,
      bevel: 0.008,
      rotation: [0, 0, -0.2],
    }))
  }
  parent.add(prism(m.cyan, [0.32, 0.055, 0.045], [x + side * 0.35, BEAM_Y + 0.45, 1.18], {
    chamfer: 0.018,
    fillet: 0.008,
    bevel: 0.008,
  }))
  for (const dx of [-0.62, 0.62]) {
    for (const dy of [-0.62, 0.62]) addBolt(parent, m.ink, x + dx, BEAM_Y + dy, 1.18, 0.045)
  }
  // Inner service latch sits on the armor course that transfers beam load.
  const latchX = x - side * 0.52
  parent.add(profileBody(m.ink, [
    [-0.11, -0.18], [0.11, -0.18], [0.11, 0.18], [-0.11, 0.18],
  ], 0.055, [latchX, BEAM_Y - 0.33, 1.04], 0.014))
  parent.add(prism(m.steel, [0.055, 0.2, 0.035], [latchX, BEAM_Y - 0.33, 1.08], {
    chamfer: 0.012,
    fillet: 0.006,
    bevel: 0.006,
  }))
}

function addBeam(parent: Group, m: CraneMaterials): void {
  parent.add(armoredBody(m.graphite, [
    [-4.94, -0.72], [4.94, -0.72], [4.94, 0.72], [-4.94, 0.72],
  ], 1.3, [0, BEAM_Y, -0.25], 0.96, 0.84, 0.18))
  const leftCourse: Point[] = [
    [-4.68, -0.5], [-4.57, -0.64], [-0.92, -0.64], [-0.78, -0.5],
    [-0.78, 0.46], [-0.94, 0.61], [-4.57, 0.61], [-4.68, 0.48],
  ]
  const rightCourse = mirror(leftCourse)
  parent.add(armoredBody(m.shell, leftCourse, 1.72, [0, BEAM_Y, 0.1], 0.985, 0.76, 0.25))
  parent.add(armoredBody(m.shellLight, rightCourse, 1.48, [0, BEAM_Y, 0.06], 0.985, 0.78, 0.2))
  // A narrow central backplate closes the girder behind the moving carriage
  // without flattening the two interlocking armor courses into one facade.
  parent.add(armoredBody(m.shellShadow, [
    [-0.92, -0.54], [0.92, -0.54], [0.92, 0.52], [-0.92, 0.52],
  ], 1.28, [0, BEAM_Y, -0.14], 0.86, 0.74, 0.16))

  // Recessed rails carry the visual load; amber sits inside the lower rail.
  parent.add(prism(m.graphite, [9.42, 0.19, 0.18], [0, BEAM_Y + 0.67, 0.48], {
    chamfer: 0.035,
    fillet: 0.015,
    bevel: 0.015,
  }))
  parent.add(prism(m.ink, [9.38, 0.24, 0.2], [0, BEAM_Y - 0.61, 0.7], {
    chamfer: 0.035,
    fillet: 0.015,
    bevel: 0.015,
  }))
  parent.add(prism(m.amberDim, [9.02, 0.075, 0.055], [0, BEAM_Y - 0.61, 0.83], {
    chamfer: 0.025,
    fillet: 0.01,
    bevel: 0.01,
  }))

  for (const seamX of [-3.15, -1.72, 1.72, 3.15]) {
    const seamFront = seamX < 0 ? 0.985 : 0.825
    parent.add(prism(m.shellShadow, [0.045, 0.92, 0.035], [seamX, BEAM_Y + 0.03, seamFront], {
      chamfer: 0.012,
      fillet: 0.005,
      bevel: 0.005,
    }))
  }
  for (const boltX of [-4.2, -3.7, -1.9, 1.9, 3.7, 4.2]) {
    addBolt(parent, m.graphite, boltX, BEAM_Y + 0.34, boltX < 0 ? 0.98 : 0.82, 0.045)
  }
  for (const bracketX of [-3.05, 3.05]) {
    parent.add(profileBody(m.ink, [
      [-0.2, -0.11], [0.2, -0.11], [0.15, 0.14], [-0.15, 0.14],
    ], 0.16, [bracketX, BEAM_Y - 0.76, 0.45], 0.025))
    addPinJoint(parent, m, bracketX, BEAM_Y - 0.77, 0.61, 0.085)
  }
  // Service covers and their fasteners are localized near the end machinery,
  // where the reference shows access hardware rather than arbitrary noise.
  for (const coverX of [-3.86, 3.86]) {
    const hostFront = coverX < 0 ? 0.98 : 0.82
    parent.add(profileBody(m.ink, [
      [-0.16, -0.22], [0.16, -0.22], [0.16, 0.22], [-0.16, 0.22],
    ], 0.055, [coverX, BEAM_Y - 0.02, hostFront + 0.04], 0.015))
    parent.add(profileBody(m.shellShadow, [
      [-0.11, -0.16], [0.11, -0.16], [0.11, 0.16], [-0.11, 0.16],
    ], 0.035, [coverX, BEAM_Y - 0.02, hostFront + 0.085], 0.01))
    addBolt(parent, m.ink, coverX - 0.12, BEAM_Y - 0.18, hostFront + 0.1, 0.026)
    addBolt(parent, m.ink, coverX + 0.12, BEAM_Y + 0.14, hostFront + 0.1, 0.026)
  }
}

function addCableLoop(parent: Group, material: MeshPhysicalMaterial, x: number, z: number): void {
  const curve = new CatmullRomCurve3([
    new Vector3(x - 0.43, BEAM_Y - 0.7, z),
    new Vector3(x - 0.32, BEAM_Y - 1.16, z + 0.03),
    new Vector3(x, BEAM_Y - 1.38, z + 0.05),
    new Vector3(x + 0.32, BEAM_Y - 1.16, z + 0.03),
    new Vector3(x + 0.43, BEAM_Y - 0.7, z),
  ])
  parent.add(new Mesh(new TubeGeometry(curve, 14, 0.033, 5, false), material))
}

function addTrolley(frame: Group, m: CraneMaterials): CraneMotion {
  const trolley = new Group()
  trolley.name = 'gantry-crane / travelling trolley'
  frame.add(trolley)
  const x = 0.18

  // Beam-wrapping carriage is split into a top hood, two structural jaws, a
  // front service plate, and a dark underside cradle. Their overlap makes the
  // rail interface readable from both the beauty and side views.
  trolley.add(armoredBody(m.shell, [
    [-0.88, -0.22], [-0.66, -0.42], [0.66, -0.42], [0.88, -0.2],
    [0.7, 0.24], [-0.65, 0.24],
  ], 1.96, [x, BEAM_Y + 0.7, -0.02], 0.8, 0.78, 0.2))
  for (const jawSide of [-1, 1]) {
    trolley.add(armoredBody(jawSide < 0 ? m.shell : m.shellShadow, [
      [-0.16, -0.7], [0.16, -0.7], [0.16, 0.58], [0.08, 0.7], [-0.16, 0.64],
    ], 1.78, [x + jawSide * 0.73, BEAM_Y - 0.02, 0], 0.72, 0.86, 0.2))
  }
  trolley.add(armoredBody(m.shellLight, [
    [-0.7, -0.43], [-0.56, -0.57], [0.56, -0.57], [0.7, -0.43],
    [0.7, 0.38], [0.56, 0.52], [-0.56, 0.52], [-0.7, 0.38],
  ], 0.3, [x, BEAM_Y + 0.02, 0.78], 0.84, 0.82, 0.08))
  trolley.add(profileBody(m.ink, [
    [-0.62, -0.28], [-0.48, -0.43], [0.48, -0.43], [0.62, -0.28],
    [0.62, 0.24], [0.48, 0.39], [-0.48, 0.39], [-0.62, 0.24],
  ], 0.1, [x, BEAM_Y + 0.03, 1.005], 0.025))
  trolley.add(profileBody(m.amber, [
    [-0.38, -0.11], [-0.3, -0.18], [0.3, -0.18], [0.38, -0.11],
    [0.38, 0.1], [0.3, 0.17], [-0.3, 0.17], [-0.38, 0.1],
  ], 0.055, [x, BEAM_Y + 0.03, 1.075], 0.018))
  for (const dx of [-0.55, 0.55]) {
    for (const dy of [-0.34, 0.34]) addBolt(trolley, m.ink, x + dx, BEAM_Y + 0.03 + dy, 0.94, 0.035)
  }
  trolley.add(prism(m.graphite, [1.45, 0.3, 1.34], [x, 6.47, 0.02], {
    chamfer: 0.08,
    fillet: 0.03,
    bevel: 0.035,
  }))
  for (const side of [-1, 1]) {
    trolley.add(profileBody(m.graphiteEdge, [
      [-0.14, -0.38], [0.14, -0.38], [0.14, 0.38], [-0.14, 0.38],
    ], 0.35, [x + side * 0.63, 6.52, 0.04], 0.035))
    addPinJoint(trolley, m, x + side * 0.63, 6.55, 0.92, 0.12)
  }

  // Motor overlaps the cradle; the round drum and status lens are inset into
  // its front face rather than suspended as cards.
  const motorFront = 0.68
  trolley.add(armoredBody(m.shellShadow, [
    [-0.72, -0.42], [-0.54, -0.61], [0.48, -0.61], [0.72, -0.36],
    [0.72, 0.34], [0.48, 0.56], [-0.48, 0.56], [-0.72, 0.38],
  ], 1.22, [x, 5.78, 0.05], 0.78, 0.8, 0.2))
  trolley.add(armoredBody(m.shell, [
    [-0.58, -0.33], [-0.43, -0.48], [0.4, -0.48], [0.58, -0.29],
    [0.58, 0.27], [0.4, 0.43], [-0.42, 0.43], [-0.58, 0.3],
  ], 1.16, [x, 5.78, 0.05], 0.72, 0.76, 0.16))
  trolley.add(cylinder(m.ink, 0.42, 0.18, [x - 0.25, 5.75, motorFront + 0.07], [Math.PI / 2, 0, 0], 16))
  trolley.add(cylinder(m.graphiteEdge, 0.29, 0.22, [x - 0.25, 5.75, motorFront + 0.17], [Math.PI / 2, 0, 0], 16))
  trolley.add(cylinder(m.steel, 0.11, 0.25, [x - 0.25, 5.75, motorFront + 0.27], [Math.PI / 2, 0, 0], 12))
  trolley.add(prism(m.ink, [0.42, 0.23, 0.1], [x + 0.35, 6.08, motorFront + 0.015], {
    chamfer: 0.055,
    fillet: 0.02,
    bevel: 0.018,
  }))
  trolley.add(prism(m.amberDim, [0.26, 0.09, 0.065], [x + 0.35, 6.08, motorFront + 0.09], {
    chamfer: 0.028,
    fillet: 0.012,
    bevel: 0.01,
  }))
  for (const dx of [-0.48, 0.48]) {
    for (const dy of [-0.33, 0.33]) addBolt(trolley, m.ink, x + dx, 5.78 + dy, motorFront - 0.02, 0.032)
  }

  const cableLength = 0.24
  const cableCenterY = 5.23
  const cables: Mesh[] = []
  for (const cableX of [x - 0.2, x + 0.2]) {
    trolley.add(cylinder(m.graphiteEdge, 0.105, 0.24, [cableX, 5.34, 0.23], [Math.PI / 2, 0, 0], 12))
    trolley.add(cylinder(m.steel, 0.043, 0.27, [cableX, 5.34, 0.24], [Math.PI / 2, 0, 0], 10))
    const cable = cylinder(m.steel, 0.042, cableLength, [cableX, cableCenterY, 0.14], [0, 0, 0], 8)
    cables.push(cable)
    trolley.add(cable)
  }

  const lower = new Group()
  lower.name = 'gantry-crane / lowering hook assembly'
  trolley.add(lower)
  for (const side of [-1, 1]) {
    addMember(lower, m.graphiteEdge, [x + side * 0.34, 4.47, 0.04], [x + side * 0.2, 5.24, 0.04], 0.15, 0.28)
    addPinJoint(lower, m, x + side * 0.2, 5.14, 0.19, 0.075)
  }
  lower.add(armoredBody(m.graphite, [
    [-0.49, -0.23], [-0.29, -0.46], [0.28, -0.46], [0.49, -0.22],
    [0.49, 0.22], [0.28, 0.44], [-0.29, 0.44], [-0.49, 0.22],
  ], 0.78, [x, 4.35, 0.04], 0.78, 0.78, 0.14))
  lower.add(armoredBody(m.shellShadow, [
    [-0.36, -0.16], [-0.22, -0.32], [0.21, -0.32], [0.36, -0.16],
    [0.36, 0.16], [0.21, 0.3], [-0.22, 0.3], [-0.36, 0.16],
  ], 0.82, [x, 4.35, 0.04], 0.72, 0.72, 0.12))
  lower.add(prism(m.ink, [0.52, 0.22, 0.09], [x, 4.36, 0.485], {
    chamfer: 0.055,
    fillet: 0.02,
    bevel: 0.018,
  }))
  lower.add(prism(m.amberDim, [0.34, 0.085, 0.055], [x, 4.36, 0.555], {
    chamfer: 0.025,
    fillet: 0.01,
    bevel: 0.01,
  }))
  const clevisArm: Point[] = [
    [-0.065, -0.3], [0.065, -0.3], [0.08, 0.22], [0.045, 0.31],
    [-0.045, 0.31], [-0.08, 0.22],
  ]
  lower.add(profileBody(m.graphiteEdge, clevisArm, 0.28, [x - 0.18, 3.78, 0.04], 0.018))
  lower.add(profileBody(m.graphiteEdge, clevisArm, 0.28, [x + 0.18, 3.78, 0.04], 0.018))
  lower.add(cylinder(m.steel, 0.13, 0.54, [x, 3.72, 0.04], [Math.PI / 2, 0, 0], 14))
  lower.add(cylinder(m.ink, 0.058, 0.58, [x, 3.72, 0.04], [Math.PI / 2, 0, 0], 10))
  const hookProfile = createHookProfile()
  lower.add(profileBody(m.steel, hookProfile, 0.34, [x - 0.22, 3.08, 0.04], 0.035))

  addCableLoop(trolley, m.ink, x - 1.35, 0.26)
  addCableLoop(trolley, m.ink, x + 1.35, 0.26)
  return { trolley, lower, cables }
}

function acquireMaterials(): MaterialBundle {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'used', seed: 7201 })
  const shellLight = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-100', condition: 'used', seed: 7202 })
  const shellShadow = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-400', condition: 'used', seed: 7203 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'used', seed: 7204 })
  const graphiteEdge = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-700', condition: 'used', seed: 7205 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'used', seed: 7206 })
  const steel = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-600', condition: 'used', seed: 7207 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'clean', seed: 7208 })
  const amberDim = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'clean', seed: 7209 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'clean', seed: 7210 })
  const hazardTexture = createHazardTexture()
  const hazard = new MeshPhysicalMaterial({
    name: 'gantry-crane / hazard decal material',
    color: 0xffffff,
    map: hazardTexture,
    roughness: 0.56,
    metalness: 0.08,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
  const materials: CraneMaterials = {
    shell: tuneMaterial(shell, 0xaeb4b3, 0.54, 0.2, { clearcoat: 0.2 }),
    shellLight: tuneMaterial(shellLight, 0xc6cac6, 0.5, 0.17, { clearcoat: 0.22 }),
    shellShadow: tuneMaterial(shellShadow, 0x737b7c, 0.62, 0.24, { clearcoat: 0.12 }),
    graphite: tuneMaterial(graphite, 0x222b31, 0.5, 0.48, { clearcoat: 0.16 }),
    graphiteEdge: tuneMaterial(graphiteEdge, 0x3b454d, 0.43, 0.54, { clearcoat: 0.18 }),
    ink: tuneMaterial(ink, 0x0a0e12, 0.7, 0.3),
    steel: tuneMaterial(steel, 0x626a70, 0.38, 0.68, { clearcoat: 0.16 }),
    amber: tuneMaterial(amber, 0xffa51a, 0.24, 0, { emissive: 3 }),
    amberDim: tuneMaterial(amberDim, 0xea7e0b, 0.29, 0, { emissive: 1.45 }),
    cyan: tuneMaterial(cyan, 0x50e5e0, 0.24, 0, { emissive: 1.4 }),
    hazard,
  }
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [materials.shell, { rub: 0.86, grime: 0.86, scratch: 0.94 }],
    [materials.shellLight, { rub: 0.76, grime: 0.74, scratch: 0.86 }],
    [materials.shellShadow, { rub: 0.7, grime: 0.92, scratch: 0.8 }],
    [materials.graphiteEdge, { rub: 0.66, grime: 0.82, scratch: 0.78 }],
    [materials.steel, { rub: 0.72, grime: 0.7, scratch: 0.9 }],
  ])
  return {
    materials,
    profiles,
    hazardTexture,
    handles: [shell, shellLight, shellShadow, graphite, graphiteEdge, ink, steel, amber, amberDim, cyan],
  }
}

export function createModel(): {
  root: Group
  update: (deltaSeconds: number) => void
  triggerLiftCycle: () => void
  dispose: () => void
} {
  const { materials, profiles, handles, hazardTexture } = acquireMaterials()
  const root = new Group()
  root.name = 'gantry-crane'

  for (const side of [-1, 1] as const) {
    addBase(root, materials, side)
    addTower(root, materials, side)
    addEndPod(root, materials, side)
  }
  addBeam(root, materials)
  const motion = addTrolley(root, materials)

  bakeOcclusion(root, { reach: 0.42 })
  bakeSurfaceAttributes(root, profiles)
  const wearMaterial = createWearMaterial({ name: 'gantry-crane / worn industrial surfaces' })
  const worn = new Set(profiles.keys())
  root.remove(motion.trolley)
  motion.trolley.remove(motion.lower)
  for (const cable of motion.cables) motion.trolley.remove(cable)

  const batch = (group: Group, label: string): ReturnType<typeof mergeVertices>[] => {
    const merged = mergeStaticByMaterial(group, {
      resolveMaterial: (source) => worn.has(source as MeshPhysicalMaterial) ? wearMaterial : source,
      retainedAttributes: (resolved) => resolved === wearMaterial ? WEAR_ATTRIBUTES : [],
      meshName: (material) => `gantry-crane / ${label} / ${material.name}`,
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
    ...batch(root, 'frame'),
    ...batch(motion.trolley, 'trolley'),
    ...batch(motion.lower, 'hook'),
  ]
  motion.trolley.add(motion.lower, ...motion.cables)
  root.add(motion.trolley)

  let cycleElapsed = -1
  const cycleDuration = 6.4
  const amberBase = new Color(0xffa51a)
  const amberDimBase = new Color(0xea7e0b)
  const alarmRed = new Color(0xff2c18)
  const cableBaseY = 5.23
  const cableBaseLength = 0.24
  const smooth = (value: number): number => value * value * (3 - 2 * value)
  const resetMotion = (): void => {
    motion.trolley.position.x = 0
    motion.lower.position.y = 0
    for (const cable of motion.cables) {
      cable.position.y = cableBaseY
      cable.scale.y = 1
    }
    materials.amber.color.copy(amberBase)
    materials.amber.emissive.copy(amberBase)
    materials.amberDim.color.copy(amberDimBase)
    materials.amberDim.emissive.copy(amberDimBase)
  }

  return {
    root,
    update: (deltaSeconds: number) => {
      if (cycleElapsed < 0) return
      cycleElapsed = Math.min(cycleDuration, cycleElapsed + Math.min(Math.max(deltaSeconds, 0), 0.05))
      const phase = cycleElapsed / cycleDuration
      const alarmBlend = smooth(Math.min(1, cycleElapsed / 0.18))
        * smooth(Math.min(1, (cycleDuration - cycleElapsed) / 0.18))
      materials.amber.color.lerpColors(amberBase, alarmRed, alarmBlend)
      materials.amber.emissive.lerpColors(amberBase, alarmRed, alarmBlend)
      materials.amberDim.color.lerpColors(amberDimBase, alarmRed, alarmBlend)
      materials.amberDim.emissive.lerpColors(amberDimBase, alarmRed, alarmBlend)
      let travel = 0
      let lower = 0
      if (phase < 0.25) travel = smooth(phase / 0.25) * 2.35
      else if (phase < 0.5) {
        travel = 2.35
        lower = smooth((phase - 0.25) / 0.25) * 1.25
      } else if (phase < 0.75) {
        travel = 2.35
        lower = (1 - smooth((phase - 0.5) / 0.25)) * 1.25
      } else travel = (1 - smooth((phase - 0.75) / 0.25)) * 2.35
      motion.trolley.position.x = travel
      motion.lower.position.y = -lower
      for (const cable of motion.cables) {
        cable.position.y = cableBaseY - lower * 0.5
        cable.scale.y = (cableBaseLength + lower) / cableBaseLength
      }
      if (cycleElapsed >= cycleDuration) {
        cycleElapsed = -1
        resetMotion()
      }
    },
    triggerLiftCycle: () => {
      cycleElapsed = 0
      resetMotion()
    },
    dispose: () => {
      for (const geometry of geometries) geometry.dispose()
      for (const cable of motion.cables) cable.geometry.dispose()
      wearMaterial.dispose()
      materials.hazard.dispose()
      hazardTexture.dispose()
      for (const handle of handles) handle.release()
    },
  }
}

export function createPreview(options: { aspect: number }): {
  scene: Scene
  root: Group
  camera: PerspectiveCamera
  update: (deltaSeconds: number) => void
  triggerLiftCycle: () => void
  dispose: () => void
} {
  const controller = createModel()
  const scene = new Scene()
  scene.name = 'gantry-crane / reference-matched preview'
  scene.background = new Color(0x000000)
  scene.add(controller.root)

  scene.add(new HemisphereLight(0x91a4b0, 0x080b0f, 0.42))
  const key = new DirectionalLight(0xffeee0, 2.3)
  key.position.set(-10, 14, 14)
  scene.add(key)
  const fill = new DirectionalLight(0x83a8be, 0.58)
  fill.position.set(11, 5, 10)
  scene.add(fill)
  const rim = new DirectionalLight(0xa8bdca, 0.7)
  rim.position.set(7, 12, -10)
  scene.add(rim)

  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const camera = new PerspectiveCamera(27, aspect, 0.5, 100)
  camera.name = 'gantry-crane / reference camera'
  camera.position.set(-10.8, 7.7, 21.5)
  camera.lookAt(0, 4.35, 0)
  camera.updateProjectionMatrix()
  scene.add(camera)

  return {
    scene,
    root: controller.root,
    camera,
    update: controller.update,
    triggerLiftCycle: controller.triggerLiftCycle,
    dispose: () => {
      scene.remove(controller.root)
      controller.dispose()
    },
  }
}

export function createLoweredPreview(options: { aspect: number }): ReturnType<typeof createPreview> {
  const preview = createPreview(options)
  preview.triggerLiftCycle()
  for (let step = 0; step < 50; step += 1) preview.update(0.05)
  return preview
}
