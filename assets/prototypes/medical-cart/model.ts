import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
} from 'three/webgpu'

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

const X_AXIS: Vec3 = [0, 0, Math.PI / 2]
const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]

interface Materials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  rubber: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
  glass: MeshPhysicalMaterial
  fabric: MeshPhysicalMaterial
}

interface CartController {
  root: Group
  update: (deltaSeconds: number) => void
  toggleService: (enabled?: boolean) => boolean
  dispose: () => void
}

interface Preview extends CartController {
  scene: Scene
  camera: PerspectiveCamera
}

let exportedService = false
const serviceListeners = new Set<(enabled: boolean) => void>()

/** Toggle the bounded top service drawer. New carts remain closed. */
export function toggleService(enabled = !exportedService): boolean {
  exportedService = enabled
  for (const listener of serviceListeners) listener(enabled)
  return exportedService
}

function acquireMaterials(): { materials: Materials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-06', palette: 'SHELL-200', condition: 'worked', seed: 24201 })
  const shellShade = library.acquire({ recipeId: 'MAT-06', palette: 'SHELL-500', condition: 'worked', seed: 24202 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 24203 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 24204 })
  const steel = library.acquire({ recipeId: 'MAT-08', palette: 'STEEL', condition: 'worked', seed: 24205 })
  const rubber = library.acquire({ recipeId: 'MAT-05', palette: 'GRAPHITE-800', condition: 'worked', seed: 24206 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 24207 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 24208 })
  const glass = library.acquire({ recipeId: 'MAT-08', palette: 'SHELL-200', condition: 'maintained', seed: 24209 })
  return {
    handles: [shell, shellShade, graphite, ink, steel, rubber, amber, cyan, glass],
    materials: {
      shell: tuneMaterial(shell, 0xd0d3d1, 0.42, 0.24, { clearcoat: 0.14 }),
      shellShade: tuneMaterial(shellShade, 0x969fa1, 0.5, 0.4, { clearcoat: 0.08 }),
      graphite: tuneMaterial(graphite, 0x222b35, 0.5, 0.62, { clearcoat: 0.1 }),
      ink: tuneMaterial(ink, 0x080b0e, 0.76, 0.14),
      steel: tuneMaterial(steel, 0x9aa2a4, 0.28, 0.88, { clearcoat: 0.08 }),
      rubber: tuneMaterial(rubber, 0x101419, 0.88, 0.03),
      amber: tuneMaterial(amber, 0xd56b05, 0.22, 0.04, { emissive: 0.72, clearcoat: 0.24 }),
      cyan: tuneMaterial(cyan, 0x38d5de, 0.2, 0.03, { emissive: 0.9, clearcoat: 0.24 }),
      glass: tuneMaterial(glass, 0xd7f0ef, 0.16, 0.04, { clearcoat: 0.62 }),
      fabric: new MeshPhysicalMaterial({ name: 'medical-cart / folded sterile fabric', color: 0x6099a9, roughness: 0.92, metalness: 0.01 }),
    },
  }
}

function box(
  parent: Group,
  material: MeshPhysicalMaterial,
  size: Vec3,
  position: Vec3,
  chamfer = 0.07,
  bevel = 0.022,
  rotation: Vec3 = [0, 0, 0],
): Mesh {
  const mesh = prism(material, size, position, {
    chamfer,
    fillet: Math.min(0.045, Math.max(0.008, chamfer * 0.3)),
    bevel,
    rotation,
  })
  parent.add(mesh)
  return mesh
}

function boltZ(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number, radius = 0.035): void {
  parent.add(cylinder(material, radius, 0.08, [x, y, z], Z_AXIS, 8))
}

function addCaster(fixed: Group, m: Materials, x: number, z: number, front: boolean): void {
  // Wheel reaches y=0; fork, bearing, and chassis shoe all overlap vertically.
  fixed.add(cylinder(m.rubber, 0.3, 0.19, [x, 0.3, z], X_AXIS, 18))
  // A narrow tire contact patch makes the parked datum numerically and visibly exact at y=0.
  box(fixed, m.rubber, [0.18, 0.04, 0.16], [x, 0.02, z], 0.025, 0.006)
  fixed.add(cylinder(m.steel, 0.19, 0.21, [x, 0.3, z], X_AXIS, 16))
  fixed.add(cylinder(m.graphite, 0.08, 0.25, [x, 0.3, z], X_AXIS, 12))
  for (const dx of [-0.17, 0.17]) box(fixed, m.graphite, [0.1, 0.54, 0.18], [x + dx, 0.51, z], 0.045, 0.012, [front ? -0.08 : 0.08, 0, 0])
  fixed.add(cylinder(m.steel, 0.12, 0.24, [x, 0.77, z], [0, 0, 0], 12))
  box(fixed, m.graphite, [0.54, 0.18, 0.54], [x, 0.82, z], 0.09, 0.024)
  if (front) box(fixed, m.amber, [0.34, 0.1, 0.18], [x, 0.6, z + 0.2], 0.045, 0.012)
}

function addChassis(fixed: Group, m: Materials): void {
  for (const x of [-1.2, 1.2]) for (const z of [-0.76, 0.76]) addCaster(fixed, m, x, z, z > 0)
  box(fixed, m.graphite, [3.3, 0.56, 2.32], [0, 1.0, 0], 0.23, 0.058)
  box(fixed, m.ink, [2.88, 0.24, 1.96], [0, 0.76, 0], 0.16, 0.04)
  box(fixed, m.graphite, [2.6, 0.22, 0.32], [0, 0.94, 1.12], 0.1, 0.027)
  for (const x of [-1.08, 1.08]) box(fixed, m.shellShade, [0.34, 0.72, 1.72], [x, 1.28, 0], 0.12, 0.032)
  // Heavy front pull loop is seated to two chassis sockets rather than hovering under the drawers.
  box(fixed, m.graphite, [2.2, 0.18, 0.18], [0, 0.82, 1.48], 0.06, 0.016)
  for (const x of [-1.02, 1.02]) box(fixed, m.graphite, [0.18, 0.18, 0.82], [x, 0.82, 1.12], 0.06, 0.016)
}

function addCabinet(fixed: Group, m: Materials): void {
  box(fixed, m.shellShade, [2.9, 2.7, 2.02], [0, 2.42, 0], 0.23, 0.055)
  box(fixed, m.shell, [2.68, 2.48, 1.88], [0, 2.48, 0.03], 0.2, 0.05)
  for (const x of [-1.34, 1.34]) for (const z of [-0.82, 0.82]) {
    box(fixed, m.shellShade, [0.42, 2.42, 0.42], [x, 2.42, z], 0.13, 0.034)
    box(fixed, m.graphite, [0.44, 0.34, 0.46], [x, 1.23, z], 0.1, 0.026)
  }

  // Front drawer field has deep graphite returns and seated pale faces.
  box(fixed, m.ink, [2.38, 2.14, 0.18], [-0.08, 2.46, 1.03], 0.16, 0.038)
  for (const [y, h] of [[2.42, 0.68], [1.65, 0.64]] as const) {
    box(fixed, m.shell, [2.18, h, 0.18], [-0.08, y, 1.18], 0.12, 0.032)
    box(fixed, m.graphite, [0.84, 0.2, 0.14], [-0.08, y + 0.05, 1.32], 0.08, 0.022)
    box(fixed, m.amber, [0.62, 0.07, 0.04], [-0.08, y + 0.13, 1.42], 0.025, 0.007)
  }
  for (const y of [1.3, 3.58]) for (const x of [-1.17, 1.01]) boltZ(fixed, m.steel, x, y, 1.15)

  // Chassis-integrated side service bay: a large dark aperture, continuous frame, two shelves and one tall bin.
  box(fixed, m.ink, [0.12, 1.82, 1.5], [1.62, 2.54, -0.08], 0.1, 0.026)
  for (const z of [-0.76, 0.6]) box(fixed, m.graphite, [0.24, 1.98, 0.18], [1.65, 2.54, z], 0.07, 0.018)
  for (const y of [1.62, 3.46]) box(fixed, m.graphite, [0.24, 0.18, 1.54], [1.65, y, -0.08], 0.07, 0.018)
  for (const y of [2.0, 2.92]) box(fixed, m.graphite, [0.34, 0.16, 1.26], [1.7, y - 0.34, -0.08], 0.06, 0.016)
  box(fixed, m.shell, [0.62, 0.82, 1.04], [1.84, 2.04, -0.05], 0.14, 0.036)
  box(fixed, m.graphite, [0.64, 0.18, 1.06], [1.84, 1.67, -0.05], 0.06, 0.016)
  box(fixed, m.shellShade, [0.44, 0.5, 0.74], [1.76, 2.94, -0.12], 0.11, 0.03)
  box(fixed, m.amber, [0.09, 1.1, 0.14], [1.84, 2.56, 0.62], 0.035, 0.009)

  // Closed rear service face avoids a hollow facade.
  box(fixed, m.shell, [2.34, 1.76, 0.16], [0, 2.48, -1.02], 0.16, 0.04)
  box(fixed, m.graphite, [1.56, 0.78, 0.12], [0.42, 2.48, -1.14], 0.12, 0.03)
  for (let i = 0; i < 5; i += 1) box(fixed, m.ink, [1.18, 0.055, 0.07], [0.42, 2.27 + i * 0.11, -1.22], 0.02, 0.005)
  box(fixed, m.cyan, [0.5, 0.11, 0.045], [-0.82, 2.48, -1.2], 0.03, 0.008)
}

function addTop(fixed: Group, m: Materials): void {
  box(fixed, m.graphite, [3.16, 0.4, 2.18], [0, 3.93, 0], 0.22, 0.055)
  box(fixed, m.shell, [2.92, 0.24, 1.96], [0, 4.08, 0], 0.18, 0.045)
  for (const x of [-1.4, 1.4]) box(fixed, m.amber, [0.3, 0.11, 0.08], [x, 4.0, 0.92], 0.04, 0.01)

  // Continuous safety rails have four short posts each; no rail floats above the worktop.
  for (const x of [-1.42, 1.42]) {
    box(fixed, m.graphite, [0.16, 0.28, 1.74], [x, 4.34, 0], 0.06, 0.016)
    for (const z of [-0.68, 0.68]) box(fixed, m.graphite, [0.18, 0.5, 0.18], [x, 4.25, z], 0.055, 0.015)
  }
  for (const z of [-0.83, 0.83]) {
    box(fixed, m.graphite, [2.78, 0.16, 0.16], [0, 4.48, z], 0.055, 0.015)
    for (const x of [-1.1, 1.1]) box(fixed, m.graphite, [0.18, 0.44, 0.18], [x, 4.28, z], 0.055, 0.015)
  }

  // Seated top supplies: three capped bottles, a handled hard case, and a tray with folded fabric.
  for (const x of [-1.0, -0.62, -0.24]) {
    fixed.add(cylinder(m.shell, 0.16, 0.62, [x, 4.43, -0.36], [0, 0, 0], 12))
    fixed.add(cylinder(m.graphite, 0.17, 0.14, [x, 4.79, -0.36], [0, 0, 0], 12))
    box(fixed, x === -0.62 ? m.cyan : m.amber, [0.08, 0.24, 0.04], [x, 4.45, -0.18], 0.02, 0.005)
  }
  box(fixed, m.graphite, [0.92, 0.68, 0.7], [0.47, 4.45, -0.38], 0.14, 0.034)
  box(fixed, m.shell, [0.72, 0.44, 0.54], [0.47, 4.47, -0.25], 0.1, 0.026)
  box(fixed, m.steel, [0.5, 0.11, 0.12], [0.47, 4.88, -0.38], 0.04, 0.01)
  for (const x of [0.27, 0.67]) box(fixed, m.steel, [0.1, 0.48, 0.1], [x, 4.7, -0.38], 0.035, 0.009)
  box(fixed, m.shellShade, [0.94, 0.36, 0.74], [0.95, 4.28, 0.44], 0.11, 0.03)
  box(fixed, m.fabric, [0.7, 0.24, 0.52], [0.95, 4.52, 0.44], 0.1, 0.026, [0, 0, 0.08])
  for (const x of [0.54, 0.9, 1.26]) {
    box(fixed, m.shell, [0.22, 0.5, 0.12], [x, 4.47, 0.72], 0.045, 0.012, [0.08, 0, x - 0.9])
    box(fixed, m.cyan, [0.08, 0.18, 0.04], [x, 4.47, 0.79], 0.018, 0.005)
  }
  box(fixed, m.graphite, [1.12, 0.18, 0.12], [0.9, 4.25, 0.82], 0.05, 0.014)
}

function addMovingDrawer(drawer: Group, m: Materials): void {
  drawer.name = 'bounded upper medical supply drawer'
  drawer.position.set(-0.08, 3.2, 1.03)
  box(drawer, m.graphite, [2.28, 0.76, 1.56], [0, 0, -0.68], 0.12, 0.032)
  box(drawer, m.shell, [2.18, 0.72, 0.18], [0, 0, 0.15], 0.12, 0.032)
  box(drawer, m.graphite, [0.84, 0.2, 0.14], [0, 0.05, 0.29], 0.08, 0.022)
  box(drawer, m.amber, [0.62, 0.07, 0.04], [0, 0.13, 0.39], 0.025, 0.007)
}

function build(): {
  root: Group
  drawer: Group
  materials: Materials
  handles: MaterialHandle[]
  wear: MeshPhysicalMaterial
  geometries: Array<{ dispose: () => void }>
} {
  const acquired = acquireMaterials()
  const m = acquired.materials
  const root = new Group()
  root.name = 'medical cart'
  const fixed = new Group()
  fixed.name = 'grounded rolling chassis, cabinet, rails, and supplies'
  const drawer = new Group()
  root.add(fixed, drawer)
  addChassis(fixed, m)
  addCabinet(fixed, m)
  addTop(fixed, m)
  addMovingDrawer(drawer, m)

  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [m.shell, { rub: 0.06, grime: 0.025, scratch: 0.01 }],
    [m.shellShade, { rub: 0.08, grime: 0.04, scratch: 0.014 }],
    [m.graphite, { rub: 0.065, grime: 0.04, scratch: 0.01 }],
    [m.steel, { rub: 0.19, grime: 0.04, scratch: 0.024 }],
    [m.rubber, { rub: 0.05, grime: 0.17, scratch: 0.009 }],
  ])
  bakeOcclusion(root, { reach: 0.16 })
  bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'medical-cart / localized contact wear', clearcoat: 0.08, clearcoatRoughness: 0.52 })
  root.traverse((object) => {
    if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear
  })
  const options = {
    retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material: { name?: string }): string => material.name ?? 'medical-cart batch',
  }
  const geometries = [...mergeStaticByMaterial(fixed, options), ...mergeStaticByMaterial(drawer, options)]
  return { root, drawer, materials: m, handles: acquired.handles, wear, geometries }
}

export function createModel(): CartController {
  const rig = build()
  let enabled = false
  const listener = (value: boolean) => { enabled = value }
  serviceListeners.add(listener)
  return {
    root: rig.root,
    update: (deltaSeconds: number) => {
      const delta = Math.min(Math.max(deltaSeconds, 0), 0.05)
      const target = enabled ? 0.58 : 0
      const blend = 1 - Math.exp(-delta * 7)
      rig.drawer.position.z += (1.03 + target - rig.drawer.position.z) * blend
    },
    toggleService: (value = !enabled) => { enabled = value; return enabled },
    dispose: () => {
      serviceListeners.delete(listener)
      for (const geometry of rig.geometries) geometry.dispose()
      rig.wear.dispose()
      for (const handle of rig.handles) handle.release()
      rig.materials.fabric.dispose()
    },
  }
}

function makePreview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low'; active?: boolean } = {}): Preview {
  const model = createModel()
  if (options.active) {
    model.toggleService(true)
    for (let i = 0; i < 30; i += 1) model.update(0.05)
  }
  const scene = new Scene()
  scene.background = new Color(0x030506)
  scene.add(model.root)
  scene.add(new HemisphereLight(0xcbd3d4, 0x07090c, 0.84))
  const key = new DirectionalLight(0xffead8, 2.7)
  key.position.set(-7, 10, 9)
  scene.add(key)
  const fill = new DirectionalLight(0x7197c2, 1.12)
  fill.position.set(8, 6, 7)
  scene.add(fill)
  const rim = new DirectionalLight(0x86aab5, 0.9)
  rim.position.set(7, 8, -8)
  scene.add(rim)

  const floorMaterial = new MeshPhysicalMaterial({ color: 0x090d10, roughness: 0.93, metalness: 0.03 })
  const floorGeometry = new PlaneGeometry(16, 16)
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.004
  floor.userData.excludeFromExport = true
  scene.add(floor)

  const camera = new PerspectiveCamera(34, options.aspect ?? 1, 0.14, 100)
  if (options.mode === 'side') camera.position.set(-7.3, 2.7, 0.2)
  else if (options.mode === 'rear') camera.position.set(6.0, 3.3, -7.2)
  else if (options.mode === 'low') camera.position.set(-5.8, 1.05, 7.4)
  else camera.position.set(5.2, 4.2, 7.2)
  camera.lookAt(0, options.mode === 'low' ? 2.0 : 2.5, 0.12)
  scene.add(camera)
  return {
    ...model,
    scene,
    camera,
    dispose: () => {
      floorGeometry.dispose()
      floorMaterial.dispose()
      model.dispose()
    },
  }
}

export const createPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'low' })
export const createToggledPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'beauty', active: true })
