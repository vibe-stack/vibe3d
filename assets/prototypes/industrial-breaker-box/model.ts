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
  type Vec3,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'

const FRONT: Vec3 = [Math.PI / 2, 0, 0]
const X_AXIS: Vec3 = [0, 0, Math.PI / 2]

interface Materials {
  shell: MeshPhysicalMaterial
  shade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
}

interface Controller {
  root: Group
  update: (delta: number) => void
  toggleBreaker: (force?: boolean) => boolean
  dispose: () => void
}

interface Preview extends Controller { scene: Scene; camera: PerspectiveCamera }

let exportedEnabled = false
const listeners = new Set<(enabled: boolean) => void>()

export function toggleBreaker(force = !exportedEnabled) {
  exportedEnabled = force
  for (const listener of listeners) listener(force)
  return force
}

function createMaterials() {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 27301 })
  const shade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 27302 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 27303 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 27304 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 27305 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 27306 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 27307 })
  return {
    handles: [shell, shade, graphite, ink, steel, amber, cyan],
    m: {
      shell: tuneMaterial(shell, 0xcbd0cf, 0.46, 0.28, { clearcoat: 0.12 }),
      shade: tuneMaterial(shade, 0x899497, 0.56, 0.42),
      graphite: tuneMaterial(graphite, 0x222931, 0.56, 0.6),
      ink: tuneMaterial(ink, 0x07090b, 0.86, 0.08),
      steel: tuneMaterial(steel, 0x9ba3a5, 0.3, 0.84),
      amber: tuneMaterial(amber, 0xe87908, 0.22, 0.04, { emissive: 0.68 }),
      cyan: tuneMaterial(cyan, 0x35cbd8, 0.22, 0.04, { emissive: 0.72 }),
    } satisfies Materials,
  }
}

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.08, bevel = 0.025, rotation: Vec3 = [0, 0, 0]) {
  const mesh = prism(material, size, position, { chamfer, fillet: Math.min(0.05, Math.max(0.008, chamfer * 0.28)), bevel, rotation })
  parent.add(mesh)
  return mesh
}

function addShell(fixed: Group, m: Materials) {
  box(fixed, m.graphite, [4.55, 5.8, 0.78], [0, 3.06, -0.26], 0.24, 0.06)
  box(fixed, m.shell, [4.2, 5.46, 1.05], [0.12, 3.05, 0.1], 0.35, 0.085)
  box(fixed, m.shell, [3.72, 0.24, 0.82], [0.12, 5.48, 0.02], 0.13, 0.032)
  box(fixed, m.shell, [3.68, 0.24, 0.82], [0.12, 0.6, 0.02], 0.13, 0.032)
  for (const x of [-2.38, 2.38]) {
    for (const y of [1.08, 5.02]) {
      box(fixed, m.graphite, [0.42, 0.92, 0.42], [x, y, -0.27], 0.12, 0.03)
      box(fixed, m.steel, [0.14, 0.68, 0.14], [x * 1.025, y, -0.5], 0.04, 0.012)
      for (const dy of [-0.22, 0.22]) fixed.add(cylinder(m.ink, 0.055, 0.12, [x * 1.025, y + dy, -0.59], FRONT, 10))
      for (const dy of [-0.25, 0, 0.25]) fixed.add(cylinder(m.ink, 0.065, 0.08, [x, y + dy, -0.035], FRONT, 10))
    }
  }
  // Grounded lower cable-gland bank visually anchors an otherwise wall-mounted asset.
  for (const x of [-0.95, 0, 0.95]) {
    fixed.add(cylinder(m.graphite, 0.26, 0.42, [x, 0.21, 0.1], [0, 0, 0], 18))
    fixed.add(cylinder(m.ink, 0.18, 0.18, [x, 0.05, 0.1], [0, 0, 0], 16))
  }
  box(fixed, m.graphite, [0.42, 2.1, 0.22], [-2.05, 3.05, 0.18], 0.13, 0.032)
  for (let i = -4; i <= 4; i += 1) box(fixed, m.ink, [0.24, 0.09, 0.1], [-2.05, 3.05 + i * 0.18, 0.35], 0.02, 0.006)
}

function addFace(fixed: Group, m: Materials) {
  // Continuous pale capture frame makes the operator face a true inset cockpit.
  box(fixed, m.shell, [0.46, 3.74, 0.38], [-1.58, 3.22, 0.63], 0.14, 0.035)
  box(fixed, m.shell, [0.46, 3.74, 0.38], [2.08, 3.22, 0.63], 0.14, 0.035)
  box(fixed, m.shell, [3.92, 0.46, 0.38], [0.25, 5.06, 0.63], 0.14, 0.035)
  box(fixed, m.shell, [3.92, 0.46, 0.38], [0.25, 1.38, 0.63], 0.14, 0.035)
  box(fixed, m.graphite, [3.34, 3.42, 0.28], [0.25, 3.2, 0.58], 0.25, 0.06)
  box(fixed, m.ink, [2.96, 3.02, 0.16], [0.25, 3.2, 0.8], 0.2, 0.05)
  box(fixed, m.graphite, [3.28, 0.62, 0.25], [0.25, 5.04, 0.62], 0.14, 0.035)
  box(fixed, m.ink, [2.7, 0.34, 0.11], [0.25, 5.04, 0.81], 0.08, 0.02)
  box(fixed, m.amber, [2.28, 0.18, 0.07], [0.25, 5.04, 0.9], 0.045, 0.012)
  for (let i = -10; i <= 10; i += 1) box(fixed, m.amber, [0.055, 0.22, 0.05], [0.25 + i * 0.1, 5.04, 0.97], 0.012, 0.004)

  box(fixed, m.graphite, [0.58, 2.32, 0.2], [-0.82, 3.2, 0.9], 0.13, 0.032)
  box(fixed, m.ink, [0.32, 1.96, 0.09], [-0.82, 3.2, 1.05], 0.08, 0.02)
  for (let i = -5; i <= 5; i += 1) box(fixed, m.amber, [0.19, 0.09, 0.05], [-0.82, 3.2 + i * 0.15, 1.12], 0.02, 0.006, [0, 0, -0.18])

  box(fixed, m.graphite, [0.72, 2.22, 0.2], [1.2, 3.2, 0.9], 0.13, 0.032)
  box(fixed, m.ink, [0.46, 1.82, 0.09], [1.2, 3.2, 1.05], 0.08, 0.02)
  box(fixed, m.cyan, [0.07, 1.5, 0.05], [0.99, 3.2, 1.12], 0.018, 0.005)
  box(fixed, m.cyan, [0.07, 1.5, 0.05], [1.41, 3.2, 1.12], 0.018, 0.005)
  box(fixed, m.cyan, [0.42, 0.07, 0.05], [1.2, 3.95, 1.12], 0.018, 0.005)
  box(fixed, m.cyan, [0.42, 0.07, 0.05], [1.2, 2.45, 1.12], 0.018, 0.005)

  // Dedicated layered breaker throat and captured transverse hinge.
  box(fixed, m.graphite, [1.42, 2.36, 0.3], [0.1, 3.22, 1.0], 0.2, 0.05)
  box(fixed, m.ink, [1.02, 1.92, 0.15], [0.1, 3.22, 1.24], 0.14, 0.035)
  box(fixed, m.graphite, [0.26, 0.62, 0.32], [-0.58, 3.9, 1.22], 0.08, 0.02)
  box(fixed, m.graphite, [0.26, 0.62, 0.32], [0.78, 3.9, 1.22], 0.08, 0.02)
  fixed.add(cylinder(m.graphite, 0.11, 0.92, [0.1, 3.9, 1.35], X_AXIS, 14))

  box(fixed, m.shell, [1.42, 0.72, 0.26], [0.12, 0.83, 0.77], 0.13, 0.032)
  box(fixed, m.graphite, [0.64, 0.15, 0.12], [0.12, 0.75, 1.0], 0.04, 0.012)
  for (const x of [-0.5, 0.74]) fixed.add(cylinder(m.steel, 0.075, 0.13, [x, 0.88, 1.0], FRONT, 10))
}

function addLever(lever: Group, m: Materials) {
  lever.position.set(0.1, 3.28, 1.28)
  box(lever, m.graphite, [0.92, 1.55, 0.24], [0, -0.08, 0], 0.16, 0.04)
  box(lever, m.ink, [0.62, 1.18, 0.14], [0, -0.08, 0.2], 0.12, 0.03)
  const handle = new Group(); handle.rotation.x = -0.42; handle.position.set(0, 0.08, 0.3); lever.add(handle)
  box(handle, m.graphite, [0.54, 1.28, 0.44], [0, -0.38, 0.16], 0.12, 0.03)
  box(handle, m.shade, [0.44, 0.42, 0.5], [0, 0.17, 0.15], 0.1, 0.025)
  box(handle, m.amber, [0.08, 0.9, 0.08], [0, -0.38, 0.42], 0.02, 0.006)
  for (const x of [-0.34, 0.34]) lever.add(cylinder(m.steel, 0.08, 0.12, [x, 0.57, 0.18], FRONT, 10))
}

function build() {
  const { m, handles } = createMaterials(); const root = new Group(); root.name = 'industrial breaker box'
  const fixed = new Group(); const lever = new Group(); lever.name = 'bounded main breaker lever'; root.add(fixed, lever)
  addShell(fixed, m); addFace(fixed, m); addLever(lever, m)
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [m.shell, { rub: 0.08, grime: 0.04, scratch: 0.014 }],
    [m.shade, { rub: 0.1, grime: 0.04, scratch: 0.015 }],
    [m.graphite, { rub: 0.05, grime: 0.04, scratch: 0.01 }],
    [m.steel, { rub: 0.15, grime: 0.035, scratch: 0.02 }],
  ])
  bakeOcclusion(root, { reach: 0.16 }); bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'industrial-breaker-box / localized wear', clearcoat: 0.08, clearcoatRoughness: 0.56 })
  root.traverse((object) => { if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear })
  const options = { retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [], meshName: (material: { name?: string }) => material.name ?? 'breaker box batch' }
  const geometries = [...mergeStaticByMaterial(fixed, options), ...mergeStaticByMaterial(lever, options)]
  return { root, lever, handles, wear, geometries }
}

export function createModel(): Controller {
  const result = build(); let enabled = false; let time = 0
  const listener = (value: boolean) => { enabled = value }; listeners.add(listener)
  return {
    root: result.root,
    update: (delta: number) => { if (!enabled) return; time += Math.min(Math.max(delta, 0), 0.05); result.lever.rotation.x = Math.sin(time * 0.7) * 0.08 },
    toggleBreaker: (force = !enabled) => { enabled = force; return force },
    dispose: () => { listeners.delete(listener); for (const geometry of result.geometries) geometry.dispose(); result.wear.dispose(); for (const handle of result.handles) handle.release() },
  }
}

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low'; active?: boolean } = {}): Preview {
  const model = createModel(); if (options.active) { model.toggleBreaker(true); for (let i = 0; i < 30; i += 1) model.update(0.05) }
  const scene = new Scene(); scene.background = new Color(0x030506); scene.add(model.root, new HemisphereLight(0xcbd2d4, 0x07090c, 0.82))
  const key = new DirectionalLight(0xffead6, 2.8); key.position.set(-8, 11, 11); scene.add(key)
  const fill = new DirectionalLight(0x789bc5, 1.1); fill.position.set(9, 7, 8); scene.add(fill)
  const rim = new DirectionalLight(0x8bb3bc, 0.9); rim.position.set(7, 10, -11); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x090d10, roughness: 0.92, metalness: 0.04 }); const floorGeometry = new PlaneGeometry(14, 14)
  const floor = new Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.004; floor.userData.excludeFromExport = true; scene.add(floor)
  const camera = new PerspectiveCamera(34, options.aspect ?? 1, 0.14, 90)
  if (options.mode === 'side') camera.position.set(-8.4, 3.2, 0)
  else if (options.mode === 'rear') camera.position.set(6.8, 3.7, -8.5)
  else if (options.mode === 'low') camera.position.set(-6.5, 0.9, 8.0)
  else camera.position.set(-6.8, 4.3, 8.4)
  camera.lookAt(0, options.mode === 'low' ? 2.5 : 3.0, 0); scene.add(camera)
  return { ...model, scene, camera, dispose: () => { floorGeometry.dispose(); floorMaterial.dispose(); model.dispose() } }
}

export const createPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
export const createToggledPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty', active: true })
