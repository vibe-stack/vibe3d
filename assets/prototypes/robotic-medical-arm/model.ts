import {
  CatmullRomCurve3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import {
  bakeOcclusion,
  bakeSurfaceAttributes,
  createWearMaterial,
  cylinder,
  extrudeProfile,
  mergeStaticByMaterial,
  prism,
  WEAR_ATTRIBUTES,
  type WearProfile,
  type Vec2,
  type Vec3,
} from '../../../src/asset-forge/generator/index.ts'

const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]
const X_AXIS: Vec3 = [0, 0, Math.PI / 2]
// Link meshes extend along local -X. A -35 degree pivot therefore sends the
// upper link toward 145 degrees in world space, matching the reference's
// up-left reach from the wall shoulder.
const SHOULDER_ANGLE = -Math.PI * 0.195
const ELBOW_ANGLE = Math.PI * 0.55
const TOOL_ANGLE = -Math.PI * 0.085

interface ArmMaterials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  graphiteEdge: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  amberGlow: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
  darkGlass: MeshPhysicalMaterial
  grime: MeshPhysicalMaterial
}

interface ArmRig {
  root: Group
  shoulderPivot: Group
  elbowPivot: Group
  toolPivot: Group
  tipSlide: Group
  materials: ArmMaterials
  wearMaterial: MeshPhysicalMaterial
}

function makeMaterials(): ArmMaterials {
  return {
    shell: new MeshPhysicalMaterial({
      name: 'medical arm / worn ceramic paint', color: 0xcbd2d3, roughness: 0.38,
      metalness: 0.34, clearcoat: 0.24, clearcoatRoughness: 0.38,
    }),
    shellShade: new MeshPhysicalMaterial({
      name: 'medical arm / shadowed painted alloy', color: 0x8e999d, roughness: 0.45,
      metalness: 0.42, clearcoat: 0.12,
    }),
    graphite: new MeshPhysicalMaterial({
      name: 'medical arm / exposed graphite steel', color: 0x0b1116, roughness: 0.47,
      metalness: 0.72, clearcoat: 0.08,
    }),
    graphiteEdge: new MeshPhysicalMaterial({
      name: 'medical arm / machined dark edge', color: 0x202b31, roughness: 0.39,
      metalness: 0.78,
    }),
    steel: new MeshPhysicalMaterial({
      name: 'medical arm / polished steel', color: 0x77848b, roughness: 0.26,
      metalness: 0.94, clearcoat: 0.5,
    }),
    amber: new MeshPhysicalMaterial({
      name: 'medical arm / amber signal', color: 0xff9f18, roughness: 0.22,
      metalness: 0.12, emissive: new Color(0xff7b08), emissiveIntensity: 2.7,
    }),
    amberGlow: new MeshPhysicalMaterial({
      name: 'medical arm / sterilizer cartridge', color: 0x6e3506, roughness: 0.12,
      metalness: 0, transmission: 0.72, thickness: 0.5,
      transparent: true, opacity: 0.46, clearcoat: 0.42, clearcoatRoughness: 0.16,
      emissive: new Color(0xff6a00), emissiveIntensity: 0.55,
    }),
    cyan: new MeshPhysicalMaterial({
      name: 'medical arm / cyan status', color: 0x65e9ff, roughness: 0.2,
      metalness: 0.05, emissive: new Color(0x22cfea), emissiveIntensity: 3.4,
    }),
    darkGlass: new MeshPhysicalMaterial({
      name: 'medical arm / smoked lens', color: 0x091017, roughness: 0.17,
      metalness: 0.35, clearcoat: 0.7,
    }),
    grime: new MeshPhysicalMaterial({
      name: 'medical arm / seam grime', color: 0x4c4a45, roughness: 0.92,
      metalness: 0.12, clearcoat: 0,
    }),
  }
}

function add(parent: Group, ...objects: Mesh[]): void {
  parent.add(...objects)
}

function tube(
  material: MeshPhysicalMaterial,
  points: Vec3[],
  radius: number,
  segments = 28,
  radialSegments = 7,
): Mesh {
  const path = new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z)), false, 'centripetal')
  return new Mesh(new TubeGeometry(path, segments, radius, radialSegments, false), material)
}

interface ConduitRun {
  path: CatmullRomCurve3
  hose: Mesh
  ribs: Mesh
  radius: number
}

function createConduit(
  hoseMaterial: MeshPhysicalMaterial,
  ribMaterial: MeshPhysicalMaterial,
  points: Vec3[],
  radius: number,
): ConduitRun {
  const path = new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z)), false, 'centripetal')
  const hose = new Mesh(new TubeGeometry(path, 40, radius, 8, false), hoseMaterial)
  const ribGeometries: TorusGeometry[] = []
  const localZ = new Vector3(0, 0, 1)
  for (let index = 1; index < 20; index += 1) {
    const t = index / 20
    const point = path.getPointAt(t)
    const tangent = path.getTangentAt(t).normalize()
    const orientation = new Quaternion().setFromUnitVectors(localZ, tangent)
    // The rib's inner radius cuts 0.01 m into the hose skin. It is molded onto
    // the conduit rather than hovering around it, and follows the exact tangent.
    const rib = new TorusGeometry(radius * 0.91, radius * 0.17, 4, 10)
    rib.applyQuaternion(orientation)
    rib.translate(point.x, point.y, point.z)
    ribGeometries.push(rib)
  }
  const merged = mergeGeometries(ribGeometries, false)
  for (const geometry of ribGeometries) geometry.dispose()
  if (!merged) throw new Error('Unable to merge conduit ribs')
  return { path, hose, ribs: new Mesh(merged, ribMaterial), radius }
}

function memberBetween(
  material: MeshPhysicalMaterial,
  start: Vector3,
  end: Vector3,
  radius: number,
  segments = 10,
): Mesh {
  const midpoint = start.clone().add(end).multiplyScalar(0.5)
  const direction = end.clone().sub(start)
  const length = direction.length()
  const mesh = cylinder(material, radius, length, [midpoint.x, midpoint.y, midpoint.z], [0, 0, 0], segments)
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize())
  return mesh
}

function collarAt(
  material: MeshPhysicalMaterial,
  run: ConduitRun,
  t: number,
  thickness = 0.032,
): Mesh {
  const point = run.path.getPointAt(t)
  const tangent = run.path.getTangentAt(t).normalize()
  const geometry = new TorusGeometry(run.radius * 0.93, thickness, 5, 14)
  geometry.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), tangent))
  geometry.translate(point.x, point.y, point.z)
  return new Mesh(geometry, material)
}

function addBundleSaddle(
  parent: Group,
  materials: ArmMaterials,
  runA: ConduitRun,
  runB: ConduitRun,
  t: number,
): void {
  const pointA = runA.path.getPointAt(t)
  const pointB = runB.path.getPointAt(t)
  const bridgeStart = pointA.clone().lerp(pointB, 0.2)
  const bridgeEnd = pointA.clone().lerp(pointB, 0.8)
  const bridgeMid = pointA.clone().add(pointB).multiplyScalar(0.5)
  const shellFoot = new Vector3(bridgeMid.x, 0.58, bridgeMid.z)
  parent.add(
    collarAt(materials.steel, runA, t, 0.034),
    collarAt(materials.steel, runB, t, 0.034),
    memberBetween(materials.graphiteEdge, bridgeStart, bridgeEnd, 0.058, 10),
    memberBetween(materials.graphiteEdge, shellFoot, bridgeMid, 0.068, 10),
    prism(materials.graphiteEdge, [0.34, 0.14, 0.62], [shellFoot.x, 0.59, shellFoot.z], {
      chamfer: 0.04, fillet: 0.018, bevel: 0.018,
    }),
  )
}

function addDisc(
  parent: Group,
  materials: ArmMaterials,
  position: Vec3,
  radius: number,
  depth: number,
  faceZ: number,
): void {
  add(parent,
    cylinder(materials.shellShade, radius * 1.14, depth * 0.82, position, Z_AXIS, 20),
    cylinder(materials.graphite, radius, depth, position, Z_AXIS, 20),
    cylinder(materials.grime, radius * 0.94, 0.035, [position[0], position[1], faceZ - 0.035], Z_AXIS, 20),
    cylinder(materials.steel, radius * 0.84, 0.045, [position[0], position[1], faceZ - 0.01], Z_AXIS, 20),
    cylinder(materials.graphiteEdge, radius * 0.73, 0.06, [position[0], position[1], faceZ + 0.015], Z_AXIS, 20),
    cylinder(materials.darkGlass, radius * 0.47, 0.075, [position[0], position[1], faceZ + 0.05], Z_AXIS, 18),
  )
}

function addBolt(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number, radius = 0.055): void {
  // A deep shank keeps every fastener physically seated through its host face.
  const bolt = cylinder(material, radius, 0.14, [x, y, z], Z_AXIS, 10)
  parent.add(bolt)
}

function addWallCassette(root: Group, materials: ArmMaterials): void {
  const wall = new Group()
  wall.name = 'robotic-medical-arm / wall cassette'
  wall.position.set(2.15, 3.12, -0.43)
  root.add(wall)

  add(wall,
    prism(materials.graphite, [2.18, 3.5, 0.42], [0.12, 0, -0.18], {
      chamfer: 0.28, fillet: 0.09, bevel: 0.06, bevelSegments: 2,
    }),
    prism(materials.shellShade, [2.08, 3.62, 0.36], [0, 0, 0.02], {
      chamfer: 0.31, fillet: 0.11, bevel: 0.07, bevelSegments: 2,
    }),
    prism(materials.shell, [1.93, 3.45, 0.22], [-0.06, 0.02, 0.22], {
      chamfer: 0.28, fillet: 0.11, bevel: 0.06, bevelSegments: 2,
    }),
    prism(materials.graphite, [1.5, 2.78, 0.12], [-0.18, -0.02, 0.43], {
      chamfer: 0.2, fillet: 0.065, bevel: 0.025,
    }),
  )

  // Shoulder-support clevis and lower cable/service chase are visibly fixed
  // into the cassette, so no mass reads as hovering in alternate views.
  add(wall,
    prism(materials.graphiteEdge, [0.46, 0.96, 0.42], [-0.28, -1.38, 0.42], {
      chamfer: [0.07, 0.07, 0.02, 0.02], fillet: 0.025, bevel: 0.025,
    }),
    prism(materials.shellShade, [0.7, 0.26, 0.48], [-0.28, -1.73, 0.34], {
      chamfer: 0.06, fillet: 0.025, bevel: 0.025,
    }),
  )
  for (const x of [-0.72, 0.38]) {
    for (const y of [-1.04, 1.04]) addBolt(wall, materials.steel, x, y, 0.46)
  }
  addBolt(wall, materials.steel, 0.62, 0.02, 0.46)
  add(wall, prism(materials.amber, [0.11, 0.45, 0.055], [-0.74, 0.23, 0.525], {
    chamfer: 0.025, fillet: 0.012, bevel: 0.01,
  }))
}

function upperShellProfile(): Vec2[] {
  return [
    [-1.7, -0.4], [-1.55, -0.55], [1.38, -0.55], [1.68, -0.35],
    [1.7, 0.22], [1.45, 0.56], [-1.38, 0.62], [-1.7, 0.39],
  ]
}

function lowerShellProfile(): Vec2[] {
  return [
    [-1.48, -0.34], [-1.27, -0.48], [1.25, -0.48], [1.48, -0.27],
    [1.44, 0.31], [1.22, 0.48], [-1.21, 0.5], [-1.48, 0.27],
  ]
}

function addUpperArm(shoulderPivot: Group, materials: ArmMaterials): Group {
  const arm = new Group()
  arm.name = 'robotic-medical-arm / upper arm'
  shoulderPivot.add(arm)

  add(arm,
    prism(materials.graphite, [3.35, 0.46, 0.68], [-1.65, -0.03, 0], {
      chamfer: 0.11, fillet: 0.045, bevel: 0.035,
    }),
    extrudeProfile(materials.shell, upperShellProfile(), 0.76, [-1.64, 0.04, 0], {
      fillet: 0.1, arcSegments: 2, bevel: 0.07, bevelSegments: 2,
    }),
    // Dark side recess and the distinctive long amber status strip.
    prism(materials.darkGlass, [2.05, 0.25, 0.055], [-1.45, -0.29, 0.407], {
      chamfer: 0.1, fillet: 0.035, bevel: 0.012,
    }),
    prism(materials.amber, [1.62, 0.105, 0.062], [-1.58, -0.29, 0.455], {
      chamfer: 0.045, fillet: 0.02, bevel: 0.012,
    }),
    prism(materials.graphiteEdge, [0.028, 0.64, 0.032], [-0.38, 0.02, 0.392], {
      chamfer: 0.006, fillet: 0.004, bevel: 0.004,
    }),
    prism(materials.grime, [0.055, 0.61, 0.018], [-0.35, 0.02, 0.386], {
      chamfer: 0.01, fillet: 0.004, bevel: 0.004,
    }),
    prism(materials.graphiteEdge, [0.8, 0.035, 0.035], [-2.72, 0.42, 0.392], {
      chamfer: 0.008, fillet: 0.004, bevel: 0.004,
    }),
    prism(materials.shellShade, [0.92, 0.16, 0.05], [-1.12, 0.38, 0.385], {
      chamfer: 0.055, fillet: 0.02, bevel: 0.012,
    }),
    prism(materials.steel, [1.22, 0.024, 0.032], [-2.12, -0.515, 0.382], {
      chamfer: 0.005, fillet: 0.003, bevel: 0.003,
    }),
    prism(materials.steel, [1.08, 0.024, 0.032], [-1.95, 0.59, 0.382], {
      chamfer: 0.005, fillet: 0.003, bevel: 0.003,
    }),
  )
  addDisc(arm, materials, [-0.05, 0.19, 0], 0.28, 0.82, 0.43)
  addBolt(arm, materials.steel, -2.92, -0.28, 0.35, 0.045)
  addBolt(arm, materials.steel, -0.43, -0.36, 0.35, 0.042)
  add(arm, cylinder(materials.cyan, 0.07, 0.1, [-3.08, 0.03, 0.405], Z_AXIS, 12))

  // Twin molded conduits run continuously from a shoulder plenum into the
  // elbow port. Every corrugation follows the true spline tangent and cuts into
  // the hose skin; shared saddles connect both runs back to the arm shell.
  const cableA = createConduit(materials.graphiteEdge, materials.graphite, [
    [0.18, 0.43, -0.24], [-0.25, 0.92, -0.24], [-1.25, 1.08, -0.24],
    [-2.3, 0.98, -0.24], [-3.18, 0.43, -0.24],
  ], 0.105)
  const cableB = createConduit(materials.graphite, materials.graphiteEdge, [
    [0.18, 0.55, 0.06], [-0.18, 1.15, 0.06], [-1.25, 1.36, 0.06],
    [-2.38, 1.2, 0.06], [-3.18, 0.54, 0.06],
  ], 0.1)
  arm.add(cableA.hose, cableA.ribs, cableB.hose, cableB.ribs)
  for (const t of [0.27, 0.52, 0.74]) addBundleSaddle(arm, materials, cableA, cableB, t)

  // Arm-integrated plenums swallow the cable ends. End collars follow the
  // spline tangent and intersect both conduit and port shell.
  add(arm,
    prism(materials.graphiteEdge, [0.5, 0.44, 0.66], [0.03, 0.48, -0.09], {
      chamfer: 0.1, fillet: 0.035, bevel: 0.03,
    }),
    prism(materials.graphiteEdge, [0.48, 0.44, 0.66], [-3.07, 0.48, -0.09], {
      chamfer: 0.1, fillet: 0.035, bevel: 0.03,
    }),
    collarAt(materials.steel, cableA, 0.018, 0.032),
    collarAt(materials.steel, cableB, 0.018, 0.032),
    collarAt(materials.steel, cableA, 0.982, 0.032),
    collarAt(materials.steel, cableB, 0.982, 0.032),
  )

  const elbowPivot = new Group()
  elbowPivot.name = 'robotic-medical-arm / elbow pivot'
  elbowPivot.position.set(-3.18, 0, 0)
  elbowPivot.rotation.z = ELBOW_ANGLE
  arm.add(elbowPivot)
  return elbowPivot
}

function addLowerArm(elbowPivot: Group, materials: ArmMaterials): Group {
  addDisc(elbowPivot, materials, [0, 0, 0], 0.43, 0.9, 0.47)
  add(elbowPivot,
    prism(materials.graphite, [3.16, 0.42, 0.66], [-1.56, 0, 0], {
      chamfer: 0.1, fillet: 0.04, bevel: 0.035,
    }),
    extrudeProfile(materials.shell, lowerShellProfile(), 0.76, [-1.55, 0.02, 0], {
      fillet: 0.1, arcSegments: 2, bevel: 0.065, bevelSegments: 2,
    }),
    prism(materials.shellShade, [2.32, 0.06, 0.54], [-1.5, 0.455, 0], {
      chamfer: 0.02, fillet: 0.015, bevel: 0.012,
    }),
    prism(materials.graphiteEdge, [2.26, 0.2, 0.06], [-1.38, -0.31, 0.407], {
      chamfer: 0.06, fillet: 0.025, bevel: 0.01,
    }),
    prism(materials.graphiteEdge, [0.025, 0.6, 0.032], [-0.5, 0.01, 0.392], {
      chamfer: 0.005, fillet: 0.004, bevel: 0.004,
    }),
    prism(materials.grime, [0.052, 0.57, 0.018], [-0.47, 0.01, 0.386], {
      chamfer: 0.01, fillet: 0.004, bevel: 0.004,
    }),
    prism(materials.graphiteEdge, [0.7, 0.03, 0.032], [-2.56, 0.31, 0.392], {
      chamfer: 0.006, fillet: 0.004, bevel: 0.004,
    }),
    prism(materials.shellShade, [0.82, 0.15, 0.05], [-1.7, 0.33, 0.385], {
      chamfer: 0.05, fillet: 0.018, bevel: 0.012,
    }),
    prism(materials.steel, [1.15, 0.024, 0.032], [-1.88, -0.455, 0.382], {
      chamfer: 0.005, fillet: 0.003, bevel: 0.003,
    }),
    prism(materials.steel, [0.94, 0.024, 0.032], [-1.58, 0.455, 0.382], {
      chamfer: 0.005, fillet: 0.003, bevel: 0.003,
    }),
  )
  addBolt(elbowPivot, materials.steel, -2.18, -0.25, 0.35, 0.045)
  addBolt(elbowPivot, materials.steel, -0.55, 0.35, 0.35, 0.042)
  addBolt(elbowPivot, materials.steel, -1.48, 0.34, 0.35, 0.038)
  addBolt(elbowPivot, materials.steel, -2.55, 0.18, 0.35, 0.04)

  const serviceCable = tube(materials.graphite, [
    [-0.02, -0.3, -0.2], [-0.45, -0.55, -0.2], [-1.68, -0.58, -0.2], [-2.79, -0.22, -0.2],
  ], 0.075, 24, 7)
  elbowPivot.add(serviceCable)

  const toolPivot = new Group()
  toolPivot.name = 'robotic-medical-arm / wrist and instrument pivot'
  toolPivot.position.set(-3.02, 0, 0)
  toolPivot.rotation.z = TOOL_ANGLE
  elbowPivot.add(toolPivot)
  return toolPivot
}

function addTool(toolPivot: Group, materials: ArmMaterials): Group {
  addDisc(toolPivot, materials, [0, 0, 0], 0.34, 0.78, 0.41)
  add(toolPivot,
    cylinder(materials.shellShade, 0.38, 0.5, [-0.18, 0, 0], X_AXIS, 18),
    cylinder(materials.shell, 0.34, 0.36, [-0.4, 0, 0], X_AXIS, 18),
    cylinder(materials.graphite, 0.29, 0.34, [-0.64, 0, 0], X_AXIS, 18),
    cylinder(materials.steel, 0.315, 0.09, [-0.84, 0, 0], X_AXIS, 18),
    cylinder(materials.amberGlow, 0.29, 0.78, [-1.25, 0, 0], X_AXIS, 18),
    cylinder(materials.steel, 0.31, 0.12, [-1.68, 0, 0], X_AXIS, 18),
    cylinder(materials.steel, 0.305, 0.035, [-0.98, 0, 0], X_AXIS, 18),
    cylinder(materials.graphiteEdge, 0.302, 0.035, [-1.16, 0, 0], X_AXIS, 18),
    cylinder(materials.graphiteEdge, 0.302, 0.035, [-1.38, 0, 0], X_AXIS, 18),
    cylinder(materials.steel, 0.305, 0.035, [-1.56, 0, 0], X_AXIS, 18),
    cylinder(materials.cyan, 0.055, 0.1, [-0.42, 0.31, 0], [0, 0, 0], 12),
  )
  // Internal emitter core is visible through the amber sterilizer sleeve.
  add(toolPivot,
    cylinder(materials.amber, 0.105, 0.72, [-1.25, 0, 0], X_AXIS, 12),
    cylinder(materials.graphiteEdge, 0.12, 0.08, [-1.04, 0, 0], X_AXIS, 12),
    cylinder(materials.graphiteEdge, 0.12, 0.08, [-1.46, 0, 0], X_AXIS, 12),
  )

  // Rigid U-shaped coolant line, joined to the wrist manifold and cartridge.
  const coolant = tube(materials.steel, [
    [-0.14, 0.28, 0.38], [-0.31, 0.66, 0.38], [-1.12, 0.66, 0.38], [-1.42, 0.28, 0.38],
  ], 0.062, 22, 8)
  toolPivot.add(coolant)
  add(toolPivot,
    cylinder(materials.graphite, 0.12, 0.16, [-0.14, 0.28, 0.38], X_AXIS, 12),
    cylinder(materials.graphite, 0.12, 0.16, [-1.42, 0.28, 0.38], X_AXIS, 12),
  )

  const tipSlide = new Group()
  tipSlide.name = 'robotic-medical-arm / articulated instrument tip'
  add(tipSlide,
    cylinder(materials.graphite, 0.15, 0.36, [-1.91, 0, 0], X_AXIS, 14),
    cylinder(materials.steel, 0.095, 0.42, [-2.24, 0, 0], X_AXIS, 12),
    cylinder(materials.graphiteEdge, 0.11, 0.055, [-2.45, 0, 0], X_AXIS, 12),
    cylinder(materials.darkGlass, 0.045, 0.38, [-2.66, 0, 0], X_AXIS, 10),
  )
  toolPivot.add(tipSlide)
  return tipSlide
}

function buildArm(): ArmRig {
  const materials = makeMaterials()
  const root = new Group()
  root.name = 'robotic-medical-arm'
  addWallCassette(root, materials)

  // The broad shoulder stack overlaps the wall cassette by 0.18 m and is held
  // by a visible rear collar, making the mounting relationship explicit.
  add(root,
    cylinder(materials.graphite, 1.12, 0.34, [1.15, 3.18, 0.17], Z_AXIS, 24),
    cylinder(materials.shellShade, 1.02, 0.48, [1.15, 3.18, 0.42], Z_AXIS, 24),
    cylinder(materials.shell, 0.88, 0.62, [1.15, 3.18, 0.68], Z_AXIS, 24),
    cylinder(materials.graphite, 0.65, 0.69, [1.15, 3.18, 0.77], Z_AXIS, 22),
    cylinder(materials.graphiteEdge, 1.18, 0.18, [1.15, 3.18, 0.88], Z_AXIS, 24),
    cylinder(materials.shellShade, 1.08, 0.14, [1.15, 3.18, 1.02], Z_AXIS, 24),
    cylinder(materials.steel, 0.99, 0.05, [1.15, 3.18, 1.11], Z_AXIS, 24),
  )

  // Oblique nested barrels are the characteristic root mass in the reference:
  // the angled axis visibly bridges the wall turntable and upper-arm clevis.
  add(root,
    cylinder(materials.shellShade, 0.76, 1.05, [1.08, 3.24, 0.82], [1.17, 0, -0.32], 22),
    cylinder(materials.shell, 0.67, 1.12, [1.02, 3.31, 0.92], [1.17, 0, -0.32], 22),
    cylinder(materials.graphiteEdge, 0.55, 0.34, [0.91, 3.4, 1.26], [1.17, 0, -0.32], 20),
  )
  add(root,
    extrudeProfile(materials.graphite, [
      [-0.82, -0.59], [-0.61, -0.9], [0.22, -0.97], [0.79, -0.55],
      [0.85, 0.2], [0.47, 0.84], [-0.25, 0.99], [-0.81, 0.49],
    ], 0.44, [1.08, 3.2, 1.28], { fillet: 0.12, arcSegments: 2, bevel: 0.05 }),
    extrudeProfile(materials.shellShade, [
      [-0.72, -0.52], [-0.54, -0.78], [0.18, -0.84], [0.67, -0.48],
      [0.73, 0.17], [0.4, 0.72], [-0.22, 0.86], [-0.7, 0.43],
    ], 0.32, [1.08, 3.2, 1.4], { fillet: 0.11, arcSegments: 2, bevel: 0.045 }),
    extrudeProfile(materials.shell, [
      [-0.6, -0.43], [-0.43, -0.65], [0.14, -0.7], [0.55, -0.39],
      [0.6, 0.13], [0.31, 0.58], [-0.18, 0.7], [-0.57, 0.35],
    ], 0.18, [1.06, 3.21, 1.57], { fillet: 0.09, arcSegments: 2, bevel: 0.035 }),
  )
  add(root,
    prism(materials.graphite, [0.98, 0.5, 0.72], [0.91, 3.39, 1.08], {
      chamfer: 0.13, fillet: 0.05, bevel: 0.045, rotation: [0, 0, 2.4],
    }),
    prism(materials.shellShade, [0.72, 0.66, 0.78], [0.88, 3.43, 1.08], {
      chamfer: 0.16, fillet: 0.055, bevel: 0.045, rotation: [0, 0, 2.4],
    }),
    cylinder(materials.shellShade, 0.55, 0.94, [0.78, 3.52, 1.12], Z_AXIS, 20),
    cylinder(materials.graphite, 0.44, 1.02, [0.78, 3.52, 1.2], Z_AXIS, 18),
  )

  const shoulderPivot = new Group()
  shoulderPivot.name = 'robotic-medical-arm / shoulder pivot'
  shoulderPivot.position.set(0.78, 3.52, 1.15)
  shoulderPivot.rotation.z = SHOULDER_ANGLE
  root.add(shoulderPivot)
  const elbowPivot = addUpperArm(shoulderPivot, materials)
  const toolPivot = addLowerArm(elbowPivot, materials)
  const tipSlide = addTool(toolPivot, materials)

  // Wear is derived while every articulated part is still separate. The
  // resulting attributes remain object-local, so calibration motion cannot
  // make scratches or grime swim across the jointed assembly.
  root.updateMatrixWorld(true)
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [materials.shell, { rub: 1.34, grime: 1.18, scratch: 1.2 }],
    [materials.shellShade, { rub: 1.08, grime: 1.35, scratch: 0.96 }],
  ])
  bakeOcclusion(root, { reach: 0.32 })
  bakeSurfaceAttributes(root, profiles)
  const wearMaterial = createWearMaterial({
    name: 'robotic-medical-arm / worn articulated surfaces',
    clearcoat: 0.18,
    clearcoatRoughness: 0.4,
  })
  const worn = new Set(profiles.keys())
  root.traverse((object) => {
    if (object instanceof Mesh && !Array.isArray(object.material) && worn.has(object.material as MeshPhysicalMaterial)) {
      object.material = wearMaterial
    }
  })

  // Batch only within rigid motion islands. Each group's transforms are baked
  // locally after occlusion and surface identity, while nested pivots remain
  // separate and retain their calibration degrees of freedom.
  const batchRigid = (group: Group, label: string, nested?: Group): void => {
    if (nested) group.remove(nested)
    mergeStaticByMaterial(group, {
      retainedAttributes: (resolved) => resolved === wearMaterial ? WEAR_ATTRIBUTES : [],
      meshName: (material) => `robotic-medical-arm / ${label} / ${material.name}`,
    })
    if (nested) group.add(nested)
  }
  const upperArm = shoulderPivot.getObjectByName('robotic-medical-arm / upper arm') as Group
  batchRigid(tipSlide, 'instrument tip')
  batchRigid(toolPivot, 'instrument', tipSlide)
  batchRigid(elbowPivot, 'distal arm', toolPivot)
  batchRigid(upperArm, 'upper arm', elbowPivot)
  root.remove(shoulderPivot)
  batchRigid(root, 'wall and shoulder')
  root.add(shoulderPivot)

  return { root, shoulderPivot, elbowPivot, toolPivot, tipSlide, materials, wearMaterial }
}

function disposeRig(rig: ArmRig): void {
  rig.root.traverse((object) => {
    if (object instanceof Mesh) object.geometry.dispose()
  })
  for (const material of Object.values(rig.materials)) material.dispose()
  rig.wearMaterial.dispose()
}

export function createModel(): { root: Group; dispose: () => void } {
  const rig = buildArm()
  return { root: rig.root, dispose: () => disposeRig(rig) }
}

interface ArmPreview {
  scene: Scene
  root: Group
  camera: PerspectiveCamera
  update: (deltaSeconds: number) => void
  triggerCalibration: () => void
  dispose: () => void
}

function previewCamera(aspect: number, position: Vec3, target: Vec3, fov = 28): PerspectiveCamera {
  const camera = new PerspectiveCamera(fov, aspect, 0.18, 60)
  camera.position.set(...position)
  camera.lookAt(...target)
  camera.updateProjectionMatrix()
  return camera
}

function makePreview(options: { aspect: number }, view: 'beauty' | 'side' | 'rear' | 'low'): ArmPreview {
  const rig = buildArm()
  const scene = new Scene()
  scene.name = `robotic-medical-arm / ${view} preview`
  scene.background = new Color(0x000000)
  scene.add(rig.root)
  scene.add(new HemisphereLight(0x9fb4c0, 0x05070a, 0.32))
  const key = new DirectionalLight(0xfff0df, 2.18)
  key.position.set(-6, 10, 12)
  const fill = new DirectionalLight(0x7ba9c7, 0.44)
  fill.position.set(8, 3, 9)
  const rim = new DirectionalLight(0x9ab7ca, 1.08)
  rim.position.set(7, 9, -8)
  scene.add(key, fill, rim)

  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const camera = view === 'side'
    ? previewCamera(aspect, [10.8, 4.8, 10.5], [-1.0, 3.0, 0.35], 29)
    : view === 'rear'
      ? previewCamera(aspect, [0.3, 4.5, -22], [-1.25, 2.8, 0.15], 30)
      : view === 'low'
        ? previewCamera(aspect, [-4.7, -3.2, 16], [-1.25, 2.75, 0.5], 31)
        : previewCamera(aspect, [-2.8, 6.1, 18.5], [-1.3, 2.75, 0.45], 28)
  scene.add(camera)

  let calibrationElapsed = -1
  const duration = 5.4
  const baseShoulder = SHOULDER_ANGLE
  const baseElbow = ELBOW_ANGLE
  const baseTool = TOOL_ANGLE
  const update = (deltaSeconds: number): void => {
    if (calibrationElapsed < 0) return
    calibrationElapsed = Math.min(duration, calibrationElapsed + Math.min(Math.max(deltaSeconds, 0), 0.05))
    const phase = calibrationElapsed / duration
    const sweep = Math.sin(phase * Math.PI * 2)
    const lift = Math.sin(phase * Math.PI)
    rig.shoulderPivot.rotation.z = baseShoulder + sweep * 0.075
    rig.elbowPivot.rotation.z = baseElbow - lift * 0.18
    rig.toolPivot.rotation.z = baseTool + sweep * 0.22
    rig.tipSlide.position.x = -lift * 0.12
    rig.materials.amber.emissiveIntensity = 2.7 + Math.max(0, Math.sin(phase * Math.PI * 8)) * 2.2
    rig.materials.cyan.emissiveIntensity = 3.4 + Math.max(0, Math.sin(phase * Math.PI * 4)) * 1.5
    if (calibrationElapsed >= duration) {
      calibrationElapsed = -1
      rig.shoulderPivot.rotation.z = baseShoulder
      rig.elbowPivot.rotation.z = baseElbow
      rig.toolPivot.rotation.z = baseTool
      rig.tipSlide.position.x = 0
      rig.materials.amber.emissiveIntensity = 2.7
      rig.materials.cyan.emissiveIntensity = 3.4
    }
  }

  return {
    scene,
    root: rig.root,
    camera,
    update,
    triggerCalibration: () => { calibrationElapsed = 0 },
    dispose: () => {
      scene.remove(rig.root)
      disposeRig(rig)
    },
  }
}

export function createPreview(options: { aspect: number }): ArmPreview {
  return makePreview(options, 'beauty')
}

export function createSidePreview(options: { aspect: number }): ArmPreview {
  return makePreview(options, 'side')
}

export function createRearPreview(options: { aspect: number }): ArmPreview {
  return makePreview(options, 'rear')
}

export function createLowPreview(options: { aspect: number }): ArmPreview {
  return makePreview(options, 'low')
}

function conduitClosePreview(options: { aspect: number }, position: Vec3): ArmPreview {
  const preview = makePreview(options, 'beauty')
  preview.camera.position.set(...position)
  preview.camera.fov = 25
  preview.camera.near = 0.35
  preview.camera.lookAt(-0.05, 4.85, 0.85)
  preview.camera.updateProjectionMatrix()
  return preview
}

export function createConduitSidePreview(options: { aspect: number }): ArmPreview {
  return conduitClosePreview(options, [7.4, 5.7, 7.2])
}

export function createConduitRearPreview(options: { aspect: number }): ArmPreview {
  return conduitClosePreview(options, [0.4, 5.4, -8.4])
}

export function createConduitLowPreview(options: { aspect: number }): ArmPreview {
  return conduitClosePreview(options, [-0.8, 0.9, 7.2])
}

export function createToolClosePreview(options: { aspect: number }): ArmPreview {
  const preview = makePreview(options, 'beauty')
  preview.camera.position.set(-3.3, 2.6, 8.2)
  preview.camera.fov = 24
  preview.camera.near = 0.3
  preview.camera.lookAt(-3.8, 1.55, 0.9)
  preview.camera.updateProjectionMatrix()
  return preview
}

export function createCalibrationPreview(options: { aspect: number; time?: number }): ArmPreview {
  const preview = makePreview(options, 'beauty')
  preview.triggerCalibration()
  const targetTime = Math.min(5.35, Math.max(0, options.time ?? 0))
  for (let elapsed = 0; elapsed < targetTime; elapsed += 0.05) {
    preview.update(Math.min(0.05, targetTime - elapsed))
  }
  return preview
}
