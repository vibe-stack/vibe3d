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

interface MastMaterials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
}

interface MastController {
  root: Group
  update: (deltaSeconds: number) => void
  toggleTracking: (enabled?: boolean) => boolean
  dispose: () => void
}

interface MastPreview extends MastController {
  scene: Scene
  camera: PerspectiveCamera
}

let exportedTrackingState = false
const trackingListeners = new Set<(enabled: boolean) => void>()

/** Toggle the slow bounded antenna scan. The mast is static and tracking starts off. */
export function toggleTracking(enabled = !exportedTrackingState): boolean {
  exportedTrackingState = enabled
  for (const listener of trackingListeners) listener(enabled)
  return exportedTrackingState
}

function acquireMaterials(): { materials: MastMaterials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 22101 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 22102 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 22103 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'worked', seed: 22104 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 22105 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 22106 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 22107 })
  return {
    handles: [shell, shellShade, graphite, ink, steel, amber, cyan],
    materials: {
      shell: tuneMaterial(shell, 0xb9bec0, 0.48, 0.28, { clearcoat: 0.12 }),
      shellShade: tuneMaterial(shellShade, 0x737d82, 0.53, 0.42, { clearcoat: 0.08 }),
      graphite: tuneMaterial(graphite, 0x252d34, 0.5, 0.6, { clearcoat: 0.1 }),
      ink: tuneMaterial(ink, 0x070a0d, 0.74, 0.18),
      steel: tuneMaterial(steel, 0x8b959a, 0.31, 0.88, { clearcoat: 0.1 }),
      amber: tuneMaterial(amber, 0xd76003, 0.22, 0.04, { emissive: 1.08, clearcoat: 0.5 }),
      cyan: tuneMaterial(cyan, 0x22cce4, 0.24, 0.03, { emissive: 1.35 }),
    },
  }
}

function box(
  parent: Group,
  material: MeshPhysicalMaterial,
  size: Vec3,
  position: Vec3,
  rotation: Vec3 = [0, 0, 0],
  chamfer = 0.08,
  bevel = 0.026,
): Mesh {
  const mesh = prism(material, size, position, {
    rotation,
    chamfer,
    fillet: Math.min(0.055, chamfer * 0.31),
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

function cylinderZ(parent: Group, material: MeshPhysicalMaterial, radius: number, depth: number, position: Vec3, segments = 12): Mesh {
  const mesh = new Mesh(new CylinderGeometry(radius, radius, depth, segments, 1, false), material)
  mesh.rotation.x = Math.PI / 2
  mesh.position.set(...position)
  parent.add(mesh)
  return mesh
}

const Y_AXIS = new Vector3(0, 1, 0)

function memberBetween(
  parent: Group,
  material: MeshPhysicalMaterial,
  start: Vector3,
  end: Vector3,
  radius: number,
  segments = 10,
): Mesh {
  const direction = end.clone().sub(start)
  const length = direction.length()
  const geometry = new CylinderGeometry(radius, radius, length, segments, 1, false)
  const mesh = new Mesh(geometry, material)
  mesh.position.copy(start).add(end).multiplyScalar(0.5)
  mesh.quaternion.copy(new Quaternion().setFromUnitVectors(Y_AXIS, direction.normalize()))
  parent.add(mesh)
  return mesh
}

function addFoot(parent: Group, m: MastMaterials, angle: number): void {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const radial = 2.85
  const yaw = -angle + Math.PI / 2
  box(parent, m.ink, [2.3, 0.24, 1.28], [c * radial, 0.12, s * radial], [0, yaw, 0], 0.2, 0.045)
  box(parent, m.shell, [2.42, 0.62, 1.34], [c * radial, 0.45, s * radial], [0, yaw, 0], 0.25, 0.06)
  box(parent, m.shellShade, [1.5, 0.46, 1.15], [c * 2.0, 0.68, s * 2.0], [0, yaw, 0], 0.18, 0.043)
  box(parent, m.graphite, [1.08, 0.24, 0.78], [c * 3.58, 0.4, s * 3.58], [0, yaw, 0], 0.13, 0.032)
  box(parent, m.amber, [0.34, 0.09, 0.065], [c * 3.96, 0.42, s * 3.96], [0, yaw, 0], 0.03, 0.008)
  const anchor = new Mesh(new CylinderGeometry(0.18, 0.18, 0.34, 12, 1, false), m.steel)
  anchor.rotation.z = Math.PI / 2
  anchor.rotation.y = -angle
  anchor.position.set(c * 2.72, 0.84, s * 2.72)
  parent.add(anchor)
  cylinderY(parent, m.graphite, 0.27, 0.16, [c * 2.72, 0.78, s * 2.72], 12)
  cylinderY(parent, m.amber, 0.07, 0.08, [c * 2.72, 0.93, s * 2.72], 8)
}

function addBase(parent: Group, m: MastMaterials): void {
  for (let index = 0; index < 4; index += 1) addFoot(parent, m, Math.PI / 4 + index * Math.PI / 2)

  const lower = new Mesh(new CylinderGeometry(2.55, 2.78, 0.7, 8, 1, false), m.graphite)
  lower.position.y = 0.45
  parent.add(lower)
  const armor = new Mesh(new CylinderGeometry(2.28, 2.56, 1.28, 8, 1, false), m.shell)
  armor.position.y = 1.18
  parent.add(armor)
  const crown = new Mesh(new CylinderGeometry(1.72, 2.08, 0.54, 8, 1, false), m.shellShade)
  crown.position.y = 2.0
  parent.add(crown)
  const mastSocket = new Mesh(new CylinderGeometry(1.18, 1.42, 0.54, 8, 1, false), m.graphite)
  mastSocket.position.y = 2.33
  parent.add(mastSocket)

  // Front service bay is a genuine inset stack with visible internal hardware.
  box(parent, m.graphite, [1.72, 1.7, 0.38], [0, 1.22, 2.28], [0, 0, 0], 0.2, 0.048)
  box(parent, m.ink, [1.22, 1.16, 0.16], [0, 1.28, 2.53], [0, 0, 0], 0.14, 0.034)
  box(parent, m.shellShade, [0.16, 1.08, 0.18], [-0.72, 1.28, 2.52], [0, 0, 0], 0.04, 0.01)
  box(parent, m.shellShade, [0.16, 1.08, 0.18], [0.72, 1.28, 2.52], [0, 0, 0], 0.04, 0.01)
  box(parent, m.shellShade, [1.22, 0.16, 0.18], [0, 1.82, 2.52], [0, 0, 0], 0.04, 0.01)
  for (const x of [-0.25, 0.25]) {
    cylinderZ(parent, m.steel, 0.13, 0.12, [x, 1.48, 2.66], 10)
    box(parent, m.amber, [0.14, 0.32, 0.07], [x, 1.08, 2.67], [0, 0, 0], 0.026, 0.007)
  }
  box(parent, m.graphite, [1.08, 0.34, 0.26], [0, 0.66, 2.4], [0, 0, 0], 0.1, 0.024)
  for (const x of [-0.32, 0, 0.32]) box(parent, m.ink, [0.14, 0.14, 0.09], [x, 0.66, 2.57], [0, 0, 0], 0.026, 0.007)
  cylinderZ(parent, m.graphite, 0.18, 0.22, [-0.42, 1.12, 2.68], 10)
  cylinderZ(parent, m.graphite, 0.18, 0.22, [0.42, 1.12, 2.68], 10)
  memberBetween(parent, m.steel, new Vector3(-0.42, 1.12, 2.82), new Vector3(0.42, 1.12, 2.82), 0.06, 8)
  for (const x of [-0.42, 0.42]) cylinderZ(parent, m.amber, 0.075, 0.25, [x, 1.12, 2.84], 8)

  // Side ventilation and rear power cassette keep all faces authored.
  for (const side of [-1, 1] as const) {
    box(parent, m.graphite, [0.18, 0.94, 1.1], [side * 2.4, 1.2, 0], [0, 0, 0], 0.07, 0.018)
    for (let index = -2; index <= 2; index += 1) {
      box(parent, m.ink, [0.08, 0.62, 0.12], [side * 2.52, 1.2, index * 0.18], [0, 0, 0], 0.018, 0.005)
    }
  }
  box(parent, m.graphite, [1.42, 1.02, 0.2], [0, 1.16, -2.32], [0, 0, 0], 0.16, 0.038)
  box(parent, m.cyan, [0.66, 0.08, 0.05], [0, 1.54, -2.45], [0, 0, 0], 0.02, 0.006)
}

function addTruss(parent: Group, m: MastMaterials, y0: number, y1: number): void {
  const x = 0.72
  const z = 0.62
  for (const side of [-1, 1] as const) {
    box(parent, m.graphite, [0.18, y1 - y0, 0.22], [side * x, (y0 + y1) / 2, z], [0, 0, 0], 0.045, 0.012)
  }
  const levels = Math.max(5, Math.round((y1 - y0) / 0.62))
  for (let index = 0; index < levels; index += 1) {
    const ya = y0 + (index / levels) * (y1 - y0)
    const yb = y0 + ((index + 1) / levels) * (y1 - y0)
    memberBetween(parent, index % 2 === 0 ? m.steel : m.graphite, new Vector3(-x, ya, z + 0.02), new Vector3(x, yb, z + 0.02), 0.07, 8)
  }
}

function addMast(parent: Group, m: MastMaterials): void {
  box(parent, m.graphite, [0.7, 7.05, 0.7], [0, 5.95, 0], [0, 0, 0], 0.12, 0.03)
  addTruss(parent, m, 2.65, 9.3)

  // Asymmetric armored cabinets leave a continuous open truss lane visible.
  box(parent, m.shell, [0.94, 3.15, 1.28], [0.72, 4.15, -0.02], [0, 0, -0.025], 0.19, 0.045)
  box(parent, m.shellShade, [0.62, 2.26, 1.1], [-0.78, 3.85, -0.05], [0, 0, 0.03], 0.15, 0.036)
  box(parent, m.shellShade, [1.52, 2.55, 0.3], [0.02, 4.18, -0.7], [0, 0, 0], 0.17, 0.04)
  box(parent, m.graphite, [0.92, 1.92, 0.16], [0.02, 4.18, -0.9], [0, 0, 0], 0.11, 0.026)
  box(parent, m.shell, [0.74, 1.48, 1.24], [-0.78, 6.58, -0.02], [0, 0, 0], 0.16, 0.038)
  box(parent, m.shellShade, [0.8, 1.3, 1.24], [0.74, 7.34, -0.02], [0, 0, 0], 0.16, 0.038)
  box(parent, m.shell, [0.62, 0.94, 1.12], [-0.72, 8.35, -0.02], [0, 0, 0], 0.14, 0.034)
  box(parent, m.shell, [0.72, 1.08, 1.12], [0.7, 8.78, -0.02], [0, 0, 0], 0.15, 0.036)
  box(parent, m.graphite, [0.58, 0.72, 0.22], [0.7, 8.78, 0.67], [0, 0, 0], 0.09, 0.022)

  // Recessed vertical communications bay and alternating service modules.
  box(parent, m.graphite, [0.66, 2.22, 0.24], [0.72, 4.28, 0.75], [0, 0, 0], 0.13, 0.03)
  box(parent, m.ink, [0.38, 1.8, 0.12], [0.72, 4.28, 0.91], [0, 0, 0], 0.08, 0.02)
  box(parent, m.amber, [0.13, 1.22, 0.07], [0.72, 4.34, 1.01], [0, 0, 0], 0.035, 0.009)
  for (const y of [3.25, 3.72, 4.19, 4.66, 5.13]) {
    box(parent, m.graphite, [0.44, 0.08, 0.08], [-0.78, y, 0.62], [0, 0, 0], 0.018, 0.005)
  }
  box(parent, m.shell, [1.62, 1.02, 0.36], [0.16, 6.62, 0.84], [0, 0, 0], 0.16, 0.038)
  box(parent, m.graphite, [1.08, 0.62, 0.2], [0.16, 6.62, 1.07], [0, 0, 0], 0.12, 0.028)
  for (const x of [-0.28, 0.02, 0.32, 0.62]) box(parent, m.ink, [0.12, 0.36, 0.08], [x, 6.62, 1.2], [0, 0, 0], 0.02, 0.005)
  box(parent, m.shellShade, [1.48, 0.8, 0.34], [-0.1, 8.34, 0.78], [0, 0, 0], 0.14, 0.034)
  box(parent, m.graphite, [0.9, 0.38, 0.18], [-0.1, 8.38, 0.99], [0, 0, 0], 0.09, 0.022)
  box(parent, m.cyan, [0.42, 0.08, 0.055], [-0.1, 8.38, 1.11], [0, 0, 0], 0.02, 0.006)
  box(parent, m.shellShade, [1.62, 0.92, 0.3], [-0.12, 5.45, -0.74], [0, 0, 0], 0.15, 0.036)
  box(parent, m.graphite, [0.92, 0.44, 0.16], [-0.12, 5.45, -0.93], [0, 0, 0], 0.09, 0.022)
  for (const y of [3.35, 3.78, 4.21, 4.64, 5.07]) {
    box(parent, m.ink, [0.54, 0.075, 0.075], [0.02, y, -1.01], [0, 0, 0], 0.018, 0.005)
  }
  for (const y of [2.72, 4.2, 5.82, 7.2, 8.62, 9.32]) {
    box(parent, m.steel, [1.66, 0.12, 1.26], [0, y, 0], [0, 0, 0], 0.045, 0.012)
  }

  // Three guy struts form real load paths from broad foot anchors to a mast collar.
  const guyAngles = [Math.PI / 4, Math.PI * 3 / 4, Math.PI * 5 / 4, Math.PI * 7 / 4]
  for (const angle of guyAngles) {
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    const lower = new Vector3(c * 2.72, 0.84, s * 2.72)
    const upper = new Vector3(c * 1.02, 4.72, s * 1.02)
    memberBetween(parent, m.graphite, lower, upper, 0.13, 10)
    cylinderY(parent, m.steel, 0.18, 0.18, [lower.x, lower.y, lower.z], 10)
    cylinderY(parent, m.steel, 0.16, 0.18, [upper.x, upper.y, upper.z], 10)
    cylinderY(parent, m.amber, 0.085, 0.07, [c * 1.82, 2.6, s * 1.82], 8)
  }

  // Seated service cable runs between explicit collars on the mast spine.
  const cable = new CatmullRomCurve3([
    new Vector3(-0.54, 2.85, -0.54), new Vector3(-0.9, 3.5, -0.68),
    new Vector3(-0.82, 6.1, -0.66), new Vector3(-0.48, 8.82, -0.5),
  ])
  parent.add(new Mesh(new TubeGeometry(cable, 24, 0.055, 6, false), m.ink))
  for (const p of [new Vector3(-0.54, 2.85, -0.54), new Vector3(-0.48, 8.82, -0.5)]) {
    const collar = new Mesh(new CylinderGeometry(0.11, 0.11, 0.18, 10, 1, false), m.steel)
    collar.rotation.x = Math.PI / 2
    collar.position.copy(p)
    parent.add(collar)
  }
}

function addAntenna(parent: Group, m: MastMaterials, x: number, z: number, bottom: number, height: number, radius: number): void {
  cylinderY(parent, m.graphite, radius * 1.45, 0.3, [x, bottom + 0.15, z], 10)
  cylinderY(parent, m.steel, radius, height, [x, bottom + height / 2, z], 8)
  cylinderY(parent, m.graphite, radius * 1.25, 0.1, [x, bottom + height * 0.52, z], 8)
  cylinderY(parent, m.amber, radius * 1.12, 0.1, [x, bottom + height + 0.05, z], 8)
}

function addCrown(parent: Group, m: MastMaterials): void {
  const lower = new Mesh(new CylinderGeometry(0.92, 1.06, 0.58, 8, 1, false), m.shellShade)
  lower.position.y = 0.28
  parent.add(lower)
  const collar = new Mesh(new CylinderGeometry(0.68, 0.78, 0.5, 8, 1, false), m.graphite)
  collar.position.y = 0.75
  parent.add(collar)
  box(parent, m.shell, [2.68, 0.44, 1.08], [0, 1.08, 0], [0, 0, 0], 0.15, 0.036)
  box(parent, m.graphite, [2.02, 0.24, 1.3], [0, 1.42, 0], [0, 0, 0], 0.12, 0.03)
  for (const side of [-1, 1] as const) {
    box(parent, m.shellShade, [0.46, 0.52, 0.62], [side * 0.98, 0.72, 0], [0, 0, 0], 0.1, 0.024)
    box(parent, m.graphite, [0.28, 0.32, 0.7], [side * 1.08, 0.72, 0], [0, 0, 0], 0.07, 0.018)
  }
  for (const x of [-0.58, 0, 0.58]) {
    box(parent, m.shellShade, [0.28, 0.38, 0.34], [x, 1.52, -0.38], [0, 0, 0], 0.07, 0.018)
    cylinderZ(parent, m.steel, 0.095, 0.42, [x, 1.52, -0.38], 8)
  }
  cylinderY(parent, m.steel, 0.25, 1.25, [0, 1.9, 0], 12)
  cylinderY(parent, m.graphite, 0.34, 0.22, [0, 2.48, 0], 12)
  cylinderY(parent, m.amber, 0.15, 0.42, [0, 2.63, 0], 10)
  cylinderY(parent, m.graphite, 0.24, 0.18, [0, 2.93, 0], 10)

  // Nested crown services and bearing housings make the scan head mechanically legible.
  box(parent, m.graphite, [0.46, 0.66, 0.58], [-0.58, 1.8, 0.12], [0, 0, -0.08], 0.1, 0.024)
  box(parent, m.shellShade, [0.38, 0.54, 0.64], [0.58, 1.76, -0.08], [0, 0, 0.08], 0.09, 0.022)
  cylinderZ(parent, m.steel, 0.13, 0.72, [-0.58, 1.8, 0.12], 10)
  cylinderZ(parent, m.amber, 0.075, 0.76, [0.58, 1.76, -0.08], 8)

  addAntenna(parent, m, -1.08, 0.08, 0.9, 3.2, 0.055)
  addAntenna(parent, m, 1.08, 0.08, 1.0, 2.95, 0.05)
  addAntenna(parent, m, -0.12, -0.72, 1.12, 3.55, 0.065)
  addAntenna(parent, m, 0.22, 0.72, 1.08, 2.28, 0.048)
  addAntenna(parent, m, 0.72, -0.55, 1.26, 1.72, 0.042)
  for (const side of [-1, 1] as const) {
    memberBetween(parent, m.graphite, new Vector3(side * 0.46, 0.58, 0), new Vector3(side * 1.08, 1.12, 0.08), 0.065, 8)
  }
  box(parent, m.cyan, [0.42, 0.06, 0.055], [0, 0.66, 0.82], [0, 0, 0], 0.018, 0.005)
}

function mergeWearBatch(
  group: Group,
  m: MastMaterials,
  wearMaterial: MeshPhysicalMaterial,
  label: string,
): Array<{ dispose: () => void }> {
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [m.shell, { rub: 0.48, grime: 0.48, scratch: 0.075 }],
    [m.shellShade, { rub: 0.4, grime: 0.56, scratch: 0.065 }],
    [m.graphite, { rub: 0.3, grime: 0.64, scratch: 0.045 }],
    [m.ink, { rub: 0.22, grime: 0.7, scratch: 0.03 }],
    [m.steel, { rub: 0.24, grime: 0.4, scratch: 0.04 }],
  ])
  bakeOcclusion(group, { reach: 0.24 })
  bakeSurfaceAttributes(group, profiles)
  group.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return
    if (profiles.has(object.material as MeshPhysicalMaterial)) object.material = wearMaterial
  })
  return mergeStaticByMaterial(group, {
    retainedAttributes: (material) => material === wearMaterial ? WEAR_ATTRIBUTES : [],
    meshName: (material) => `military-communications-mast / ${label} / ${material.name}`,
  })
}

function build(): {
  root: Group
  crown: Group
  materials: MastMaterials
  handles: MaterialHandle[]
  wearMaterial: MeshPhysicalMaterial
  geometries: Array<{ dispose: () => void }>
} {
  const acquired = acquireMaterials()
  const root = new Group()
  root.name = 'military-communications-mast'
  const baseStatic = new Group()
  const mastStatic = new Group()
  const crown = new Group()
  const crownStatic = new Group()
  root.add(baseStatic, mastStatic, crown)
  crown.position.y = 9.56
  crown.add(crownStatic)
  addBase(baseStatic, acquired.materials)
  addMast(mastStatic, acquired.materials)
  addCrown(crownStatic, acquired.materials)
  root.updateMatrixWorld(true)
  const wearMaterial = createWearMaterial({
    name: 'military-communications-mast / baked localized wear',
    clearcoat: 0.12,
    clearcoatRoughness: 0.5,
  })
  const geometries = [
    ...mergeWearBatch(baseStatic, acquired.materials, wearMaterial, 'base'),
    ...mergeWearBatch(mastStatic, acquired.materials, wearMaterial, 'mast'),
    ...mergeWearBatch(crownStatic, acquired.materials, wearMaterial, 'tracking crown'),
  ]
  return { root, crown, materials: acquired.materials, handles: acquired.handles, wearMaterial, geometries }
}

export function createModel(): MastController {
  const rig = build()
  let elapsed = 0
  let enabled = false
  const applyTracking = (value: boolean) => { enabled = value }
  trackingListeners.add(applyTracking)
  return {
    root: rig.root,
    update: (deltaSeconds) => {
      if (!enabled) return
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      rig.crown.rotation.y = Math.sin(elapsed * 0.22) * 0.18
      rig.materials.amber.emissiveIntensity = 1.04 + Math.sin(elapsed * 1.3) * 0.1
    },
    toggleTracking: (value = !enabled) => {
      enabled = value
      return enabled
    },
    dispose: () => {
      trackingListeners.delete(applyTracking)
      for (const geometry of rig.geometries) geometry.dispose()
      rig.wearMaterial.dispose()
      for (const handle of rig.handles) handle.release()
    },
  }
}

function camera(aspect: number, position: Vec3, target: Vec3, fov = 31): PerspectiveCamera {
  const result = new PerspectiveCamera(fov, aspect, 0.25, 140)
  result.position.set(...position)
  result.lookAt(...target)
  return result
}

function makePreview(options: { aspect: number }, view: 'beauty' | 'side' | 'rear' | 'low' | 'tracking'): MastPreview {
  const controller = createModel()
  if (view === 'tracking') {
    controller.toggleTracking(true)
    for (let index = 0; index < 150; index += 1) controller.update(1 / 30)
  }
  const scene = new Scene()
  scene.background = new Color(0x010204)
  scene.add(controller.root, new HemisphereLight(0xb4c5cc, 0x050608, 0.75))
  const key = new DirectionalLight(0xfff0dc, 3.0); key.position.set(-10, 18, 14)
  const fill = new DirectionalLight(0x7898bd, 1.0); fill.position.set(12, 10, 10)
  const rim = new DirectionalLight(0x9bb8c8, 1.2); rim.position.set(10, 15, -14)
  scene.add(key, fill, rim)
  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const previewCamera = view === 'side'
    ? camera(aspect, [20, 8.6, 0.1], [0, 7.2, 0], 32)
    : view === 'rear'
      ? camera(aspect, [12, 10.2, -22], [0, 7.3, 0], 31)
      : view === 'low'
        ? camera(aspect, [-14.5, 1.5, 19], [0, 6.5, 0], 32)
        : view === 'tracking'
          ? camera(aspect, [-18.8, 12.2, 24.8], [0, 7.4, 0], 31)
          : camera(aspect, [-19.2, 12.5, 25.4], [0, 7.25, 0], 31)
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

export function createPreview(options: { aspect: number }): MastPreview { return makePreview(options, 'beauty') }
export function createSidePreview(options: { aspect: number }): MastPreview { return makePreview(options, 'side') }
export function createRearPreview(options: { aspect: number }): MastPreview { return makePreview(options, 'rear') }
export function createLowPreview(options: { aspect: number }): MastPreview { return makePreview(options, 'low') }
export function createTrackingPreview(options: { aspect: number }): MastPreview { return makePreview(options, 'tracking') }
