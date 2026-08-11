import {
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  TubeGeometry,
  Vector3,
} from 'three/webgpu'

import {
  MaterialLibrary,
  WEAR_ATTRIBUTES,
  bakeOcclusion,
  bakeSurfaceAttributes,
  createWearMaterial,
  mergeStaticByMaterial,
  prism,
  tuneMaterial,
  type MaterialHandle,
  type Vec3,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'

interface SentryMaterials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
}

interface SentryController {
  root: Group
  update: (deltaSeconds: number) => void
  toggleTracking: (enabled?: boolean) => boolean
  dispose: () => void
}

interface SentryPreview extends SentryController {
  scene: Scene
  camera: PerspectiveCamera
}

let exportedTracking = false
const trackingListeners = new Set<(enabled: boolean) => void>()

/** Toggle bounded sensor tracking. It is deterministic and disabled by default. */
export function toggleTracking(enabled = !exportedTracking): boolean {
  exportedTracking = enabled
  for (const listener of trackingListeners) listener(enabled)
  return exportedTracking
}

function acquireMaterials(): { materials: SentryMaterials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 23101 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 23102 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 23103 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'worked', seed: 23104 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 23105 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 23106 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 23107 })
  const amberMaterial = tuneMaterial(amber, 0xd96205, 0.2, 0.02, { emissive: 0.31, clearcoat: 0.58 })
  amberMaterial.transparent = true
  amberMaterial.opacity = 0.29
  amberMaterial.transmission = 0.3
  amberMaterial.thickness = 0.12
  return {
    handles: [shell, shellShade, graphite, ink, steel, amber, cyan],
    materials: {
      shell: tuneMaterial(shell, 0xc2c5c4, 0.48, 0.24, { clearcoat: 0.12 }),
      shellShade: tuneMaterial(shellShade, 0x7f898e, 0.54, 0.4, { clearcoat: 0.08 }),
      graphite: tuneMaterial(graphite, 0x222a32, 0.49, 0.62, { clearcoat: 0.1 }),
      ink: tuneMaterial(ink, 0x070a0d, 0.74, 0.18),
      steel: tuneMaterial(steel, 0x949da0, 0.3, 0.86, { clearcoat: 0.08 }),
      amber: amberMaterial,
      cyan: tuneMaterial(cyan, 0x22cce4, 0.22, 0.02, { emissive: 1.22 }),
    },
  }
}

function box(
  parent: Group,
  material: MeshPhysicalMaterial,
  size: Vec3,
  position: Vec3,
  rotation: Vec3 = [0, 0, 0],
  chamfer = 0.1,
  bevel = 0.028,
): Mesh {
  const mesh = prism(material, size, position, {
    rotation,
    chamfer,
    fillet: Math.min(0.06, chamfer * 0.3),
    bevel,
  })
  parent.add(mesh)
  return mesh
}

function cylinderY(parent: Group, material: MeshPhysicalMaterial, radius: number, height: number, position: Vec3, segments = 12): Mesh {
  const mesh = new Mesh(new CylinderGeometry(radius, radius, height, segments, 1, false), material)
  mesh.position.set(...position)
  parent.add(mesh)
  return mesh
}

function cylinderX(parent: Group, material: MeshPhysicalMaterial, radius: number, depth: number, position: Vec3, segments = 12): Mesh {
  const mesh = new Mesh(new CylinderGeometry(radius, radius, depth, segments, 1, false), material)
  mesh.rotation.z = Math.PI / 2
  mesh.position.set(...position)
  parent.add(mesh)
  return mesh
}

function cylinderZ(parent: Group, material: MeshPhysicalMaterial, radius: number, depth: number, position: Vec3, segments = 12): Mesh {
  const mesh = new Mesh(new CylinderGeometry(radius, radius, depth, segments, 1, false), material)
  mesh.rotation.x = Math.PI / 2
  mesh.position.set(...position)
  parent.add(mesh)
  return mesh
}

const Y_AXIS = new Vector3(0, 1, 0)

function memberBetween(parent: Group, material: MeshPhysicalMaterial, start: Vector3, end: Vector3, radius: number, segments = 10): Mesh {
  const direction = end.clone().sub(start)
  const mesh = new Mesh(new CylinderGeometry(radius, radius, direction.length(), segments, 1, false), material)
  mesh.position.copy(start).add(end).multiplyScalar(0.5)
  mesh.quaternion.copy(new Quaternion().setFromUnitVectors(Y_AXIS, direction.normalize()))
  parent.add(mesh)
  return mesh
}

function orientUnitCylinder(mesh: Mesh, start: Vector3, end: Vector3): void {
  const direction = end.clone().sub(start)
  mesh.position.copy(start).add(end).multiplyScalar(0.5)
  mesh.quaternion.copy(new Quaternion().setFromUnitVectors(Y_AXIS, direction.clone().normalize()))
  mesh.scale.set(1, direction.length(), 1)
}

function addHandle(parent: Group, m: SentryMaterials, x: number, y: number, z: number, rotationY = 0): void {
  const c = Math.cos(rotationY)
  const s = Math.sin(rotationY)
  const left = new Vector3(x - c * 0.55, y, z + s * 0.55)
  const right = new Vector3(x + c * 0.55, y, z - s * 0.55)
  const lift = new Vector3(0, 0.42, 0)
  memberBetween(parent, m.graphite, left, left.clone().add(lift), 0.09, 8)
  memberBetween(parent, m.graphite, right, right.clone().add(lift), 0.09, 8)
  memberBetween(parent, m.graphite, left.clone().add(lift), right.clone().add(lift), 0.09, 8)
}

function addBase(parent: Group, m: SentryMaterials): void {
  const sole = new Mesh(new CylinderGeometry(4.42, 4.56, 0.34, 8, 1, false), m.ink)
  sole.position.y = 0.17
  parent.add(sole)
  const lower = new Mesh(new CylinderGeometry(4.28, 4.42, 1.16, 8, 1, false), m.graphite)
  lower.position.y = 0.8
  parent.add(lower)
  const armor = new Mesh(new CylinderGeometry(4.02, 4.27, 1.38, 8, 1, false), m.shell)
  armor.position.y = 1.28
  parent.add(armor)
  const shoulder = new Mesh(new CylinderGeometry(3.48, 3.95, 0.54, 8, 1, false), m.shellShade)
  shoulder.position.y = 2.12
  parent.add(shoulder)

  // Four broad load-bearing feet break the base out of the smooth plinth silhouette.
  for (let index = 0; index < 4; index += 1) {
    const angle = Math.PI / 4 + index * Math.PI / 2
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    const yaw = -angle + Math.PI / 2
    box(parent, m.ink, [2.7, 0.3, 1.48], [c * 4.2, 0.15, s * 4.2], [0, yaw, 0], 0.22, 0.05)
    box(parent, m.shell, [2.5, 0.66, 1.34], [c * 4.13, 0.49, s * 4.13], [0, yaw, 0], 0.25, 0.058)
    box(parent, m.graphite, [1.1, 0.25, 0.82], [c * 5.02, 0.43, s * 5.02], [0, yaw, 0], 0.14, 0.034)
    box(parent, m.amber, [0.38, 0.1, 0.07], [c * 5.48, 0.48, s * 5.48], [0, yaw, 0], 0.03, 0.008)
  }

  // Armored corner blocks and top service wedges make every diagonal face load-bearing.
  for (let index = 0; index < 4; index += 1) {
    const angle = index * Math.PI / 2
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    const yaw = -angle + Math.PI / 2
    box(parent, m.shellShade, [1.42, 1.42, 0.82], [c * 4.05, 1.04, s * 4.05], [0, yaw, 0], 0.2, 0.048)
    box(parent, m.graphite, [0.52, 0.82, 0.14], [c * 4.48, 1.04, s * 4.48], [0, yaw, 0], 0.09, 0.022)
  }

  // Four deep authored equipment panels on the primary faces.
  const faces = [
    { x: 0, z: 4.05, yaw: 0 },
    { x: 4.05, z: 0, yaw: Math.PI / 2 },
    { x: 0, z: -4.05, yaw: Math.PI },
    { x: -4.05, z: 0, yaw: -Math.PI / 2 },
  ]
  for (const [index, face] of faces.entries()) {
    box(parent, m.graphite, [2.05, 1.2, 0.34], [face.x, 1.12, face.z], [0, face.yaw, 0], 0.19, 0.045)
    box(parent, m.ink, [1.52, 0.72, 0.18], [face.x + Math.sin(face.yaw) * 0.23, 1.13, face.z + Math.cos(face.yaw) * 0.23], [0, face.yaw, 0], 0.13, 0.03)
    if (index % 2 === 0) {
      for (const offset of [-0.38, 0, 0.38]) {
        box(parent, m.shellShade, [0.16, 0.38, 0.08], [face.x + Math.cos(face.yaw) * offset + Math.sin(face.yaw) * 0.34, 1.13, face.z - Math.sin(face.yaw) * offset + Math.cos(face.yaw) * 0.34], [0, face.yaw, 0], 0.025, 0.006)
      }
    } else {
      box(parent, m.cyan, [0.5, 0.1, 0.07], [face.x + Math.sin(face.yaw) * 0.35, 1.36, face.z + Math.cos(face.yaw) * 0.35], [0, face.yaw, 0], 0.025, 0.006)
      box(parent, m.amber, [0.28, 0.12, 0.07], [face.x - Math.sin(face.yaw) * 0.35, 0.91, face.z - Math.cos(face.yaw) * 0.35], [0, face.yaw, 0], 0.025, 0.006)
    }
  }

  // The reference-facing facade is three separate seated cabinets, not one smooth wall.
  box(parent, m.graphite, [5.82, 1.5, 0.24], [0, 1.12, 3.76], [0, 0, 0], 0.21, 0.05)
  for (const x of [-2.25, 2.25]) {
    box(parent, m.shellShade, [1.58, 1.32, 0.38], [x, 1.13, 3.96], [0, 0, 0], 0.19, 0.045)
    box(parent, m.graphite, [1.08, 0.7, 0.2], [x, 1.14, 4.22], [0, 0, 0], 0.12, 0.028)
    box(parent, m.ink, [0.62, 0.16, 0.08], [x, 1.14, 4.36], [0, 0, 0], 0.025, 0.006)
    cylinderZ(parent, m.steel, 0.07, 0.1, [x - 0.5, 0.78, 4.22], 8)
    cylinderZ(parent, m.steel, 0.07, 0.1, [x + 0.5, 1.5, 4.22], 8)
  }

  // Front cable port with both hoses entering hard collars.
  box(parent, m.graphite, [1.44, 1.28, 0.38], [0, 0.97, 4.28], [0, 0, 0], 0.18, 0.042)
  box(parent, m.ink, [0.96, 0.78, 0.2], [0, 0.93, 4.53], [0, 0, 0], 0.12, 0.028)
  for (const x of [-0.26, 0.26]) {
    cylinderZ(parent, m.steel, 0.16, 0.18, [x, 0.92, 4.67], 10)
    cylinderZ(parent, m.graphite, 0.095, 0.22, [x, 0.92, 4.79], 8)
  }
  box(parent, m.amber, [0.5, 0.15, 0.08], [0, 1.55, 4.52], [0, 0, 0], 0.04, 0.01)

  addHandle(parent, m, -2.7, 2.08, 2.55, -Math.PI / 4)
  addHandle(parent, m, 2.7, 2.08, 2.55, Math.PI / 4)
  addHandle(parent, m, -2.7, 2.08, -2.55, Math.PI / 4)
  addHandle(parent, m, 2.7, 2.08, -2.55, -Math.PI / 4)
}

function addAzimuth(parent: Group, m: SentryMaterials): void {
  const lower = new Mesh(new CylinderGeometry(2.78, 2.98, 0.38, 16, 1, false), m.graphite)
  lower.position.y = 2.33
  parent.add(lower)
  const track = new Mesh(new CylinderGeometry(2.58, 2.72, 0.34, 16, 1, false), m.steel)
  track.position.y = 2.65
  parent.add(track)
  const upper = new Mesh(new CylinderGeometry(2.4, 2.58, 0.44, 16, 1, false), m.ink)
  upper.position.y = 2.93
  parent.add(upper)
  const bearingDeck = new Mesh(new CylinderGeometry(2.22, 2.38, 0.34, 12, 1, false), m.graphite)
  bearingDeck.position.y = 3.24
  parent.add(bearingDeck)
  box(parent, m.shellShade, [3.3, 0.26, 1.62], [0, 3.42, 0], [0, 0, 0], 0.14, 0.034)
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4
    cylinderY(parent, index % 2 === 0 ? m.amber : m.steel, 0.07, 0.09, [Math.cos(angle) * 2.69, 2.62, Math.sin(angle) * 2.69], 8)
  }
}

function addYoke(parent: Group, m: SentryMaterials): void {
  box(parent, m.graphite, [3.72, 0.38, 1.42], [0, 3.54, -0.08], [0, 0, 0], 0.16, 0.038)
  box(parent, m.shellShade, [3.1, 0.2, 1.14], [0, 3.76, -0.08], [0, 0, 0], 0.1, 0.024)
  for (const side of [-1, 1] as const) {
    box(parent, m.graphite, [0.78, 2.86, 1.24], [side * 2.64, 4.62, -0.04], [0, 0, side * -0.08], 0.23, 0.054)
    box(parent, m.shellShade, [0.4, 1.84, 0.76], [side * 2.64, 4.46, 0.05], [0, 0, side * -0.08], 0.12, 0.028)
    memberBetween(parent, m.graphite, new Vector3(side * 1.92, 3.72, -0.5), new Vector3(side * 2.64, 5.34, -0.18), 0.15, 10)
    cylinderX(parent, m.ink, 0.86, 0.94, [side * 2.64, 5.54, 0.1], 16)
    cylinderX(parent, m.steel, 0.65, 1.08, [side * 2.64, 5.54, 0.1], 16)
    cylinderX(parent, m.graphite, 0.44, 1.2, [side * 2.64, 5.54, 0.1], 14)
    cylinderX(parent, m.ink, 0.19, 1.28, [side * 2.64, 5.54, 0.1], 10)
    box(parent, m.ink, [0.46, 0.24, 0.58], [side * 2.64, 3.84, 0.36], [0, 0, 0], 0.06, 0.015)
    box(parent, m.amber, [0.12, 0.46, 0.07], [side * 3.09, 4.55, 0.52], [0, 0, 0], 0.028, 0.007)
  }
}

function addHead(parent: Group, m: SentryMaterials): void {
  // Deep stepped housing, with a narrow rear service cassette and tapered side masses.
  box(parent, m.shell, [4.36, 2.14, 4.76], [0, 0.02, -0.53], [0, 0, 0], 0.33, 0.074)
  box(parent, m.shellShade, [3.96, 1.86, 4.34], [0, 0.04, -0.57], [0, 0, 0], 0.3, 0.068)
  box(parent, m.graphite, [3.48, 0.22, 2.68], [0, 1.15, -0.55], [0, 0, 0], 0.12, 0.028)
  box(parent, m.graphite, [3.62, 0.22, 2.8], [0, -1.11, -0.34], [0, 0, 0], 0.12, 0.028)
  box(parent, m.shellShade, [3.48, 1.66, 1.72], [0, 0.06, -2.98], [0, 0, 0], 0.24, 0.056)
  box(parent, m.graphite, [2.86, 1.18, 0.4], [0, 0.05, -3.94], [0, 0, 0], 0.19, 0.045)
  box(parent, m.shell, [1.1, 1.24, 0.5], [-1.46, 0.04, -3.76], [0, 0, 0], 0.15, 0.036)

  // Thick dark throat and physically separated amber glazing.
  box(parent, m.ink, [3.34, 1.22, 0.14], [0, 0.01, 1.83], [0, 0, 0], 0.14, 0.034)
  // Four deep rails form a true open bezel; the glazing is behind their front edges.
  box(parent, m.graphite, [3.82, 0.3, 0.8], [0, 0.72, 1.98], [0, 0, 0], 0.12, 0.028)
  box(parent, m.graphite, [3.82, 0.3, 0.8], [0, -0.72, 1.98], [0, 0, 0], 0.12, 0.028)
  box(parent, m.graphite, [0.34, 1.3, 0.8], [-1.74, 0.01, 1.98], [0, 0, 0], 0.1, 0.024)
  box(parent, m.graphite, [0.34, 1.3, 0.8], [1.74, 0.01, 1.98], [0, 0, 0], 0.1, 0.024)
  cylinderZ(parent, m.graphite, 0.48, 0.06, [0, 0.01, 1.91], 16)
  cylinderZ(parent, m.steel, 0.32, 0.06, [0, 0.01, 1.94], 16)
  cylinderZ(parent, m.amber, 0.17, 0.04, [0, 0.01, 1.97], 14)
  for (const x of [-1.08, 1.08]) box(parent, m.amber, [0.11, 0.72, 0.05], [x, 0.01, 2.0], [0, 0, 0], 0.024, 0.006)
  box(parent, m.amber, [2.72, 0.86, 0.1], [0, 0.01, 2.03], [0, 0, 0], 0.11, 0.026)

  // Asymmetric side service, vents and fasteners.
  for (const side of [-1, 1] as const) {
    box(parent, m.graphite, [0.22, 1.14, 1.52], [side * 2.18, 0.01, -0.05], [0, 0, 0], 0.08, 0.02)
    box(parent, m.ink, [0.13, 0.76, 0.72], [side * 2.32, 0.04, -0.16], [0, 0, 0], 0.04, 0.01)
    for (const z of [-0.42, -0.14, 0.14, 0.42]) {
      box(parent, m.ink, [0.09, 0.46, 0.12], [side * 2.39, 0.03, z], [0, 0, 0], 0.018, 0.005)
    }
    for (const y of [-0.63, 0.63]) cylinderX(parent, m.steel, 0.075, 0.12, [side * 2.38, y, 0.72], 8)
  }
  box(parent, m.graphite, [0.2, 0.66, 0.13], [-2.38, 0.04, 0.88], [0, 0, 0], 0.035, 0.009)
  box(parent, m.amber, [0.08, 0.42, 0.08], [-2.5, 0.04, 0.88], [0, 0, 0], 0.02, 0.005)
  box(parent, m.graphite, [0.18, 0.72, 1.08], [2.38, 0.04, -1.18], [0, 0, 0], 0.05, 0.012)
  for (const z of [-1.48, -1.28, -1.08, -0.88]) {
    box(parent, m.ink, [0.08, 0.46, 0.1], [2.5, 0.04, z], [0, 0, 0], 0.018, 0.005)
  }

  // Continuous carry frame: two swept legs, crossbar and rear support.
  memberBetween(parent, m.graphite, new Vector3(-1.76, 0.92, -1.65), new Vector3(-1.02, 1.94, -1.25), 0.13, 8)
  memberBetween(parent, m.graphite, new Vector3(1.76, 0.92, -1.65), new Vector3(1.02, 1.94, -1.25), 0.13, 8)
  memberBetween(parent, m.graphite, new Vector3(-1.02, 1.94, -1.25), new Vector3(1.02, 1.94, -1.25), 0.13, 8)
  memberBetween(parent, m.graphite, new Vector3(-1.76, 0.92, -1.65), new Vector3(1.76, 0.92, -1.65), 0.12, 8)
}

function addServiceCables(parent: Group, m: SentryMaterials): void {
  for (const side of [-1, 1] as const) {
    const cable = new CatmullRomCurve3([
      new Vector3(side * 0.72, 3.14, -0.52),
      new Vector3(side * 1.12, 3.42, -0.68),
      new Vector3(side * 1.43, 4.08, -0.64),
      new Vector3(side * 1.62, 4.64, -0.46),
    ])
    parent.add(new Mesh(new TubeGeometry(cable, 18, 0.065, 6, false), m.ink))
    cylinderX(parent, m.steel, 0.12, 0.22, [side * 0.72, 3.14, -0.52], 8)
    cylinderX(parent, m.steel, 0.12, 0.22, [side * 1.62, 4.64, -0.46], 8)
  }
}

function mergeWearBatch(group: Group, m: SentryMaterials, wearMaterial: MeshPhysicalMaterial, label: string): Array<{ dispose: () => void }> {
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [m.shell, { rub: 0.5, grime: 0.5, scratch: 0.08 }],
    [m.shellShade, { rub: 0.42, grime: 0.57, scratch: 0.065 }],
    [m.graphite, { rub: 0.31, grime: 0.65, scratch: 0.045 }],
    [m.ink, { rub: 0.22, grime: 0.72, scratch: 0.03 }],
    [m.steel, { rub: 0.24, grime: 0.42, scratch: 0.04 }],
  ])
  bakeOcclusion(group, { reach: 0.25 })
  bakeSurfaceAttributes(group, profiles)
  group.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return
    if (profiles.has(object.material as MeshPhysicalMaterial)) object.material = wearMaterial
  })
  return mergeStaticByMaterial(group, {
    retainedAttributes: (material) => material === wearMaterial ? WEAR_ATTRIBUTES : [],
    meshName: (material) => `military-sentry-emplacement / ${label} / ${material.name}`,
  })
}

function build(): {
  root: Group
  pan: Group
  tilt: Group
  actuatorMeshes: Mesh[]
  lowerActuatorPoints: Vector3[]
  upperActuatorPoints: Vector3[]
  materials: SentryMaterials
  handles: MaterialHandle[]
  wearMaterial: MeshPhysicalMaterial
  geometries: Array<{ dispose: () => void }>
} {
  const acquired = acquireMaterials()
  const root = new Group()
  root.name = 'military-sentry-emplacement'
  const baseStatic = new Group()
  const pan = new Group()
  const panStatic = new Group()
  const tilt = new Group()
  const tiltStatic = new Group()
  root.add(baseStatic, pan)
  pan.add(panStatic, tilt)
  pan.position.y = 0
  tilt.position.set(0, 5.54, 0.1)
  tilt.add(tiltStatic)
  addBase(baseStatic, acquired.materials)
  addAzimuth(panStatic, acquired.materials)
  addYoke(panStatic, acquired.materials)
  addServiceCables(panStatic, acquired.materials)
  addHead(tiltStatic, acquired.materials)

  const actuatorMeshes: Mesh[] = []
  const lowerActuatorPoints: Vector3[] = []
  const upperActuatorPoints: Vector3[] = []
  for (const side of [-1, 1] as const) {
    const lower = new Vector3(side * 2.36, 3.8, 0.44)
    const upper = new Vector3(side * 2.42, -0.5, 0.52)
    lowerActuatorPoints.push(lower)
    upperActuatorPoints.push(upper)
    cylinderX(panStatic, acquired.materials.steel, 0.16, 0.5, [lower.x, lower.y, lower.z], 10)
    cylinderX(tiltStatic, acquired.materials.steel, 0.15, 0.5, [upper.x, upper.y, upper.z], 10)
    const actuator = new Mesh(new CylinderGeometry(0.1, 0.1, 1, 10, 1, false), acquired.materials.steel)
    pan.add(actuator)
    actuatorMeshes.push(actuator)
  }

  root.updateMatrixWorld(true)
  const wearMaterial = createWearMaterial({
    name: 'military-sentry-emplacement / localized baked wear',
    clearcoat: 0.12,
    clearcoatRoughness: 0.5,
  })
  const geometries = [
    ...mergeWearBatch(baseStatic, acquired.materials, wearMaterial, 'base'),
    ...mergeWearBatch(panStatic, acquired.materials, wearMaterial, 'pan and yoke'),
    ...mergeWearBatch(tiltStatic, acquired.materials, wearMaterial, 'sensor head'),
  ]
  return {
    root,
    pan,
    tilt,
    actuatorMeshes,
    lowerActuatorPoints,
    upperActuatorPoints,
    materials: acquired.materials,
    handles: acquired.handles,
    wearMaterial,
    geometries,
  }
}

export function createModel(): SentryController {
  const rig = build()
  let enabled = false
  let elapsed = 0
  const updateActuators = () => {
    rig.tilt.updateMatrix()
    for (let index = 0; index < rig.actuatorMeshes.length; index += 1) {
      const upper = rig.upperActuatorPoints[index].clone().applyMatrix4(rig.tilt.matrix)
      orientUnitCylinder(rig.actuatorMeshes[index], rig.lowerActuatorPoints[index], upper)
    }
  }
  updateActuators()
  const applyTracking = (value: boolean) => { enabled = value }
  trackingListeners.add(applyTracking)
  return {
    root: rig.root,
    update: (deltaSeconds) => {
      if (!enabled) return
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      rig.pan.rotation.y = Math.sin(elapsed * 0.24) * 0.16
      rig.tilt.rotation.x = Math.sin(elapsed * 0.31 + 0.5) * 0.075
      rig.materials.amber.emissiveIntensity = 0.31 + Math.sin(elapsed * 1.4) * 0.04
      updateActuators()
    },
    toggleTracking: (value = !enabled) => {
      enabled = value
      return enabled
    },
    dispose: () => {
      trackingListeners.delete(applyTracking)
      for (const actuator of rig.actuatorMeshes) actuator.geometry.dispose()
      for (const geometry of rig.geometries) geometry.dispose()
      rig.wearMaterial.dispose()
      for (const handle of rig.handles) handle.release()
    },
  }
}

function camera(aspect: number, position: Vec3, target: Vec3, fov = 31): PerspectiveCamera {
  const result = new PerspectiveCamera(fov, aspect, 0.25, 120)
  result.position.set(...position)
  result.lookAt(...target)
  return result
}

function makePreview(options: { aspect: number }, view: 'beauty' | 'side' | 'rear' | 'low' | 'tracking'): SentryPreview {
  const controller = createModel()
  if (view === 'tracking') {
    controller.toggleTracking(true)
    for (let index = 0; index < 170; index += 1) controller.update(1 / 30)
  }
  const scene = new Scene()
  scene.background = new Color(0x010204)
  scene.add(controller.root, new HemisphereLight(0xb8c7cf, 0x050608, 0.76))
  const key = new DirectionalLight(0xffefd9, 3.1); key.position.set(-11, 16, 13)
  const fill = new DirectionalLight(0x789bc4, 1.05); fill.position.set(12, 9, 11)
  const rim = new DirectionalLight(0xa0bac6, 1.3); rim.position.set(10, 14, -14)
  scene.add(key, fill, rim)
  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const previewCamera = view === 'side'
    ? camera(aspect, [18, 6.5, 0], [0, 3.4, 0], 32)
    : view === 'rear'
      ? camera(aspect, [10.5, 7.6, -18], [0, 3.5, 0], 31)
      : view === 'low'
        ? camera(aspect, [-13.4, 1.2, 16.7], [0, 3.65, 0], 32)
        : view === 'tracking'
          ? camera(aspect, [-9.6, 8.8, 22.2], [0, 3.85, -0.15], 31)
          : camera(aspect, [-9.8, 9.0, 22.8], [0, 3.8, -0.18], 31)
  scene.add(previewCamera)
  return {
    scene,
    root: controller.root,
    camera: previewCamera,
    update: controller.update,
    toggleTracking: controller.toggleTracking,
    dispose: () => { scene.remove(controller.root); controller.dispose() },
  }
}

export function createPreview(options: { aspect: number }): SentryPreview { return makePreview(options, 'beauty') }
export function createSidePreview(options: { aspect: number }): SentryPreview { return makePreview(options, 'side') }
export function createRearPreview(options: { aspect: number }): SentryPreview { return makePreview(options, 'rear') }
export function createLowPreview(options: { aspect: number }): SentryPreview { return makePreview(options, 'low') }
export function createTrackingPreview(options: { aspect: number }): SentryPreview { return makePreview(options, 'tracking') }
