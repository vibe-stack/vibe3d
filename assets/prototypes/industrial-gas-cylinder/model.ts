import {
  CapsuleGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  TorusGeometry,
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
const SIDE: Vec3 = [0, 0, Math.PI / 2]

interface Materials {
  shell: MeshPhysicalMaterial
  shade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  bronze: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
  grime: MeshPhysicalMaterial
}

interface Controller {
  root: Group
  update: (delta: number) => void
  toggleValve: (force?: boolean) => boolean
  dispose: () => void
}

interface Preview extends Controller {
  scene: Scene
  camera: PerspectiveCamera
}

let exportedEnabled = false
const listeners = new Set<(enabled: boolean) => void>()

export function toggleValve(force = !exportedEnabled) {
  exportedEnabled = force
  for (const listener of listeners) listener(force)
  return force
}

function createMaterials() {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 26901 })
  const shade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 26902 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 26903 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 26904 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 26905 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 26906 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 26907 })
  return {
    handles: [shell, shade, graphite, ink, steel, amber, cyan],
    m: {
      shell: tuneMaterial(shell, 0xcbd0cf, 0.46, 0.28, { clearcoat: 0.12 }),
      shade: tuneMaterial(shade, 0x8d9799, 0.56, 0.42),
      graphite: tuneMaterial(graphite, 0x232a31, 0.56, 0.62),
      ink: tuneMaterial(ink, 0x07090b, 0.86, 0.08),
      steel: tuneMaterial(steel, 0x98a1a4, 0.3, 0.84),
      bronze: new MeshPhysicalMaterial({ name: 'industrial-gas-cylinder / bronze valve', color: 0x8a5a26, roughness: 0.32, metalness: 0.82 }),
      amber: tuneMaterial(amber, 0xe87908, 0.22, 0.04, { emissive: 0.66 }),
      cyan: tuneMaterial(cyan, 0x35cbd8, 0.22, 0.04, { emissive: 0.78 }),
      grime: new MeshPhysicalMaterial({ name: 'industrial-gas-cylinder / localized grime', color: 0x1d1a17, roughness: 0.94, metalness: 0.03 }),
    } satisfies Materials,
  }
}

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.08, bevel = 0.025, rotation: Vec3 = [0, 0, 0]) {
  const mesh = prism(material, size, position, {
    chamfer,
    fillet: Math.min(0.05, Math.max(0.008, chamfer * 0.28)),
    bevel,
    rotation,
  })
  parent.add(mesh)
  return mesh
}

function addBody(fixed: Group, m: Materials) {
  const capsule = new Mesh(new CapsuleGeometry(1.08, 3.72, 10, 24), m.shell)
  capsule.position.y = 2.98
  fixed.add(capsule)
  fixed.add(cylinder(m.graphite, 1.2, 0.48, [0, 0.28, 0], [0, 0, 0], 32))
  fixed.add(cylinder(m.ink, 1.02, 0.12, [0, 0.06, 0], [0, 0, 0], 32))
  for (let i = 0; i < 4; i += 1) {
    const angle = Math.PI / 4 + (i / 4) * Math.PI * 2
    box(fixed, m.graphite, [0.58, 0.3, 0.58], [Math.cos(angle) * 1.05, 0.2, Math.sin(angle) * 1.05], 0.13, 0.035, [0, -angle, 0])
  }
  fixed.add(cylinder(m.graphite, 1.17, 0.42, [0, 2.34, 0], [0, 0, 0], 32))
  fixed.add(cylinder(m.ink, 1.19, 0.14, [0, 2.34, 0], [0, 0, 0], 32))
  for (const x of [-1.1, 1.1]) {
    box(fixed, m.graphite, [0.36, 0.9, 0.34], [x, 2.35, 0], 0.12, 0.03)
    box(fixed, m.steel, [0.14, 0.54, 0.18], [x * 1.08, 2.35, 0], 0.05, 0.014)
  }
  // Full open belt handles, rather than decorative blocks on the shell.
  for (const side of [-1, 1]) {
    box(fixed, m.graphite, [0.5, 0.16, 0.2], [side * 1.34, 2.72, 0], 0.05, 0.014)
    box(fixed, m.graphite, [0.5, 0.16, 0.2], [side * 1.34, 1.98, 0], 0.05, 0.014)
    box(fixed, m.graphite, [0.18, 0.88, 0.2], [side * 1.58, 2.35, 0], 0.06, 0.016)
    box(fixed, m.amber, [0.08, 0.36, 0.08], [side * 1.69, 2.35, 0.12], 0.02, 0.006)
  }
  // Shallow integrated shell fields, hinge seam and molded lower fluting.
  box(fixed, m.shade, [0.82, 1.74, 0.06], [-0.48, 4.05, 1.04], 0.15, 0.02)
  box(fixed, m.shell, [0.7, 1.6, 0.065], [-0.48, 4.05, 1.09], 0.13, 0.018)
  box(fixed, m.shade, [0.8, 1.24, 0.06], [-0.48, 1.3, 1.04], 0.14, 0.018)
  box(fixed, m.shell, [0.68, 1.1, 0.065], [-0.48, 1.3, 1.09], 0.12, 0.016)
  box(fixed, m.shade, [0.04, 2.28, 0.045], [-0.18, 4.02, 1.075], 0.012, 0.004)
  for (const y of [3.18, 4.45]) {
    box(fixed, m.graphite, [0.22, 0.38, 0.085], [-0.18, y, 1.1], 0.045, 0.011)
    fixed.add(cylinder(m.steel, 0.035, 0.07, [-0.18, y, 1.16], FRONT, 10))
  }
  for (const x of [-0.74, -0.42, -0.1, 0.22, 0.54]) {
    box(fixed, m.shade, [0.16, 1.0, 0.045], [x, 1.2, 1.065 - Math.abs(x) * 0.14], 0.055, 0.012)
  }
  for (const y of [3.25, 3.52, 3.79]) {
    box(fixed, m.amber, [0.42, 0.13, 0.055], [-0.58, y, 1.095], 0.025, 0.007, [0, 0, -0.52])
  }
  box(fixed, m.amber, [0.72, 0.11, 0.07], [0, 5.51, 1.0], 0.035, 0.009)
  box(fixed, m.amber, [0.56, 0.07, 0.06], [0, 0.52, 1.04], 0.025, 0.007)
}

function addGauge(fixed: Group, m: Materials) {
  box(fixed, m.shade, [0.88, 2.2, 0.13], [0.48, 3.72, 1.0], 0.2, 0.045)
  box(fixed, m.graphite, [0.72, 2.02, 0.14], [0.48, 3.72, 1.1], 0.17, 0.04)
  box(fixed, m.ink, [0.5, 1.78, 0.09], [0.48, 3.72, 1.22], 0.12, 0.028)
  box(fixed, m.graphite, [0.39, 1.58, 0.045], [0.48, 3.72, 1.29], 0.09, 0.02)
  for (let i = -6; i <= 6; i += 1) {
    box(fixed, m.amber, [0.28, 0.085, 0.045], [0.48, 3.72 + i * 0.112, 1.34], 0.022, 0.005)
  }
  box(fixed, m.graphite, [0.64, 0.42, 0.25], [0.48, 2.46, 1.08], 0.11, 0.026)
  box(fixed, m.amber, [0.26, 0.2, 0.08], [0.48, 2.46, 1.24], 0.045, 0.012)
  box(fixed, m.cyan, [0.3, 0.1, 0.08], [0.48, 1.22, 1.16], 0.04, 0.011)
  box(fixed, m.graphite, [0.78, 0.68, 0.3], [0.48, 1.08, 1.02], 0.15, 0.038)
  fixed.add(cylinder(m.bronze, 0.19, 0.44, [0.48, 1.06, 1.33], FRONT, 18))
  fixed.add(cylinder(m.ink, 0.25, 0.18, [0.48, 1.06, 1.55], FRONT, 18))
  fixed.add(cylinder(m.bronze, 0.11, 0.26, [0.48, 1.06, 1.73], FRONT, 16))
}

function addTop(fixed: Group, valve: Group, m: Materials) {
  fixed.add(cylinder(m.graphite, 1.02, 0.38, [0, 5.55, 0], [0, 0, 0], 32))
  fixed.add(cylinder(m.steel, 0.82, 0.16, [0, 5.78, 0], [0, 0, 0], 28))
  const lowerRing = new Mesh(new TorusGeometry(0.74, 0.1, 10, 36), m.graphite)
  lowerRing.rotation.x = Math.PI / 2
  lowerRing.position.y = 5.88
  fixed.add(lowerRing)
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4
    const x = Math.cos(angle) * 0.66
    const z = Math.sin(angle) * 0.66
    box(fixed, m.shade, [0.24, 1.14, 0.27], [x, 6.47, z], 0.085, 0.022, [0, -angle, 0])
    box(fixed, m.graphite, [0.42, 0.58, 0.42], [x * 1.08, 6.57, z * 1.08], 0.12, 0.03, [0, -angle, 0])
    box(fixed, m.graphite, [0.48, 0.25, 0.46], [x, 7.0, z], 0.12, 0.03, [0, -angle, 0])
  }
  const upperRing = new Mesh(new TorusGeometry(0.72, 0.1, 10, 36), m.graphite)
  upperRing.rotation.x = Math.PI / 2
  upperRing.position.y = 7.05
  fixed.add(upperRing)
  fixed.add(cylinder(m.bronze, 0.29, 0.82, [0, 6.34, 0], [0, 0, 0], 20))
  fixed.add(cylinder(m.graphite, 0.4, 0.18, [0, 6.76, 0], [0, 0, 0], 24))
  fixed.add(cylinder(m.bronze, 0.18, 0.66, [0.46, 6.36, 0], SIDE, 18))
  fixed.add(cylinder(m.graphite, 0.14, 0.24, [0.82, 6.36, 0], SIDE, 16))
  fixed.add(cylinder(m.bronze, 0.18, 0.18, [0.98, 6.36, 0], SIDE, 16))
  valve.position.y = 6.88
  valve.add(cylinder(m.amber, 0.4, 0.13, [0, 0, 0], [0, 0, 0], 24))
  valve.add(cylinder(m.ink, 0.17, 0.15, [0, 0.02, 0], [0, 0, 0], 18))
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2
    box(valve, m.graphite, [0.1, 0.15, 0.27], [Math.sin(angle) * 0.24, 0.02, Math.cos(angle) * 0.24], 0.025, 0.007, [0, -angle, 0])
  }
}

function build() {
  const { m, handles } = createMaterials()
  const root = new Group()
  root.name = 'industrial gas cylinder'
  const fixed = new Group()
  const valve = new Group()
  valve.name = 'bounded top valve assembly'
  root.add(fixed, valve)
  addBody(fixed, m)
  addGauge(fixed, m)
  addTop(fixed, valve, m)
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [m.steel, { rub: 0.15, grime: 0.035, scratch: 0.02 }],
  ])
  bakeOcclusion(root, { reach: 0.15 })
  bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'industrial-gas-cylinder / localized wear', clearcoat: 0.08, clearcoatRoughness: 0.55 })
  root.traverse((object) => {
    if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear
  })
  const options = {
    retainedAttributes: (material: unknown): readonly string[] => (material === wear ? WEAR_ATTRIBUTES : []),
    meshName: (material: { name?: string }) => material.name ?? 'gas cylinder batch',
  }
  const geometries = [...mergeStaticByMaterial(fixed, options), ...mergeStaticByMaterial(valve, options)]
  return { root, valve, m, handles, wear, geometries }
}

export function createModel(): Controller {
  const result = build()
  let enabled = false
  let time = 0
  const listener = (value: boolean) => { enabled = value }
  listeners.add(listener)
  return {
    root: result.root,
    update: (delta: number) => {
      if (!enabled) return
      time += Math.min(Math.max(delta, 0), 0.05)
      result.valve.rotation.y = Math.sin(time * 0.7) * 0.12
    },
    toggleValve: (force = !enabled) => { enabled = force; return force },
    dispose: () => {
      listeners.delete(listener)
      for (const geometry of result.geometries) geometry.dispose()
      result.wear.dispose()
      for (const handle of result.handles) handle.release()
      result.m.bronze.dispose()
      result.m.grime.dispose()
    },
  }
}

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low'; active?: boolean } = {}): Preview {
  const model = createModel()
  if (options.active) { model.toggleValve(true); for (let i = 0; i < 30; i += 1) model.update(0.05) }
  const scene = new Scene()
  scene.background = new Color(0x030506)
  scene.add(model.root, new HemisphereLight(0xcbd2d4, 0x07090c, 0.82))
  const key = new DirectionalLight(0xffead6, 2.8); key.position.set(-8, 12, 11); scene.add(key)
  const fill = new DirectionalLight(0x789bc5, 1.1); fill.position.set(9, 7, 9); scene.add(fill)
  const rim = new DirectionalLight(0x8bb3bc, 0.9); rim.position.set(7, 10, -11); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x030506, roughness: 0.96, metalness: 0.02 })
  const floorGeometry = new PlaneGeometry(15, 15)
  const floor = new Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.004; floor.userData.excludeFromExport = true; scene.add(floor)
  const camera = new PerspectiveCamera(31, options.aspect ?? 1, 0.14, 90)
  if (options.mode === 'side') camera.position.set(-10.2, 4.1, 0)
  else if (options.mode === 'rear') camera.position.set(8.4, 4.8, -10.4)
  else if (options.mode === 'low') camera.position.set(-7.8, 1.1, 10.2)
  else camera.position.set(-8.8, 5.55, 11.4)
  camera.lookAt(0, options.mode === 'low' ? 3.1 : 3.7, 0)
  scene.add(camera)
  return { ...model, scene, camera, dispose: () => { floorGeometry.dispose(); floorMaterial.dispose(); model.dispose() } }
}

export const createPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
export const createToggledPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty', active: true })
