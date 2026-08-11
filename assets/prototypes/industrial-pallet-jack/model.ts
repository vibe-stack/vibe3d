import {
  CatmullRomCurve3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
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
  rubber: MeshPhysicalMaterial
  grime: MeshPhysicalMaterial
}

interface Controller {
  root: Group
  update: (delta: number) => void
  toggleJack: (force?: boolean) => boolean
  dispose: () => void
}

interface Preview extends Controller {
  scene: Scene
  camera: PerspectiveCamera
}

let exportedEnabled = false
const listeners = new Set<(enabled: boolean) => void>()

export function toggleJack(force = !exportedEnabled) {
  exportedEnabled = force
  for (const listener of listeners) listener(force)
  return force
}

function materials() {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 26801 })
  const shade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 26802 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 26803 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 26804 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 26805 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 26806 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 26807 })
  const rubber = library.acquire({ recipeId: 'MAT-05', palette: 'GRAPHITE-800', condition: 'worked', seed: 26808 })
  return {
    handles: [shell, shade, graphite, ink, steel, amber, cyan, rubber],
    m: {
      shell: tuneMaterial(shell, 0xcbd0cf, 0.46, 0.28, { clearcoat: 0.12 }),
      shade: tuneMaterial(shade, 0x8d9799, 0.56, 0.42),
      graphite: tuneMaterial(graphite, 0x232a31, 0.56, 0.62),
      ink: tuneMaterial(ink, 0x07090b, 0.86, 0.08),
      steel: tuneMaterial(steel, 0x98a1a4, 0.3, 0.84),
      amber: tuneMaterial(amber, 0xe87908, 0.2, 0.04, { emissive: 0.76 }),
      cyan: tuneMaterial(cyan, 0x35cbd8, 0.22, 0.04, { emissive: 0.82 }),
      rubber: tuneMaterial(rubber, 0x111418, 0.92, 0.02),
      grime: new MeshPhysicalMaterial({
        name: 'industrial-pallet-jack / localized contact grime',
        color: 0x1d1a17,
        roughness: 0.94,
        metalness: 0.03,
      }),
    } satisfies Materials,
  }
}

function box(
  parent: Group,
  material: MeshPhysicalMaterial,
  size: Vec3,
  position: Vec3,
  chamfer = 0.08,
  bevel = 0.025,
  rotation: Vec3 = [0, 0, 0],
) {
  const mesh = prism(material, size, position, {
    chamfer,
    fillet: Math.min(0.05, Math.max(0.008, chamfer * 0.28)),
    bevel,
    rotation,
  })
  parent.add(mesh)
  return mesh
}

function tube(material: MeshPhysicalMaterial, points: Vec3[], radius = 0.08, segments = 30) {
  return new Mesh(
    new TubeGeometry(
      new CatmullRomCurve3(points.map((point) => new Vector3(...point)), false, 'centripetal'),
      segments,
      radius,
      8,
      false,
    ),
    material,
  )
}

function addForks(fixed: Group, m: Materials) {
  for (const x of [-0.72, 0.72]) {
    box(fixed, m.graphite, [0.62, 0.22, 5.5], [x, 0.22, 1.45], 0.16, 0.04)
    box(fixed, m.shell, [0.52, 0.22, 3.82], [x, 0.39, 0.55], 0.14, 0.035)
    box(fixed, m.shade, [0.42, 0.08, 2.95], [x, 0.53, 0.45], 0.07, 0.018)
    box(fixed, m.graphite, [0.34, 0.08, 1.7], [x, 0.53, 1.45], 0.06, 0.016)
    box(fixed, m.ink, [0.44, 0.06, 0.98], [x, 0.4, 3.45], 0.06, 0.016)
    for (const dx of [-0.24, 0.24]) box(fixed, m.shell, [0.09, 0.16, 1.06], [x + dx, 0.46, 3.45], 0.035, 0.01)
    for (const dz of [-0.49, 0.49]) box(fixed, m.shell, [0.56, 0.16, 0.09], [x, 0.46, 3.45 + dz], 0.035, 0.01)
    for (const z of [3.34, 3.64]) {
      fixed.add(cylinder(m.amber, 0.105, 0.34, [x, 0.43, z], X_AXIS, 14))
      fixed.add(cylinder(m.steel, 0.045, 0.6, [x, 0.43, z], X_AXIS, 12))
      for (const dx of [-0.29, 0.29]) fixed.add(cylinder(m.graphite, 0.08, 0.08, [x + dx, 0.43, z], X_AXIS, 12))
    }
    box(fixed, m.steel, [0.44, 0.06, 0.16], [x, 0.08, -1.22], 0.04, 0.012)
  }
  box(fixed, m.graphite, [0.44, 0.38, 4.3], [0, 0.32, 0.82], 0.12, 0.03)
  box(fixed, m.ink, [0.3, 0.12, 3.5], [0, 0.54, 0.9], 0.06, 0.016)
}

function addBody(fixed: Group, m: Materials) {
  box(fixed, m.graphite, [3.1, 0.64, 2.12], [0, 0.44, -1.36], 0.28, 0.068)
  box(fixed, m.ink, [2.5, 0.22, 1.68], [0, 0.13, -1.36], 0.14, 0.035)
  box(fixed, m.shade, [2.9, 1.62, 1.98], [0, 1.22, -1.56], 0.45, 0.108)
  box(fixed, m.shell, [2.56, 1.42, 1.7], [0, 1.26, -1.42], 0.39, 0.094)
  box(fixed, m.shade, [2.34, 1.62, 1.66], [0, 2.42, -1.57], 0.4, 0.096)
  box(fixed, m.shell, [2.02, 1.42, 1.4], [0, 2.45, -1.43], 0.35, 0.085)
  for (const x of [-0.78, 0.78]) box(fixed, m.shell, [0.72, 0.72, 1.0], [x, 0.74, -0.55], 0.22, 0.055)
  box(fixed, m.graphite, [2.64, 0.42, 0.58], [0, 0.58, -0.62], 0.16, 0.04)
  box(fixed, m.graphite, [1.38, 1.12, 0.24], [0, 2.35, -0.61], 0.17, 0.042)
  box(fixed, m.ink, [1.06, 0.78, 0.12], [0, 2.36, -0.47], 0.13, 0.032)
  box(fixed, m.amber, [0.32, 0.46, 0.08], [0, 2.38, -0.39], 0.06, 0.016)
  box(fixed, m.graphite, [0.72, 0.3, 0.14], [0, 0.72, -0.43], 0.08, 0.02)
  box(fixed, m.cyan, [0.4, 0.1, 0.07], [0, 0.73, -0.33], 0.035, 0.01)
  for (const side of [-1, 1]) {
    box(fixed, m.shell, [0.56, 1.94, 1.5], [side * 1.08, 1.5, -1.4], 0.24, 0.058)
    box(fixed, m.graphite, [0.16, 0.86, 0.76], [side * 1.38, 1.3, -1.3], 0.06, 0.016)
    box(fixed, m.cyan, [0.08, 0.4, 0.34], [side * 1.48, 1.62, -1.22], 0.035, 0.01)
    fixed.add(cylinder(m.graphite, 0.42, 0.24, [side * 1.12, 0.4, -2.05], X_AXIS, 16))
    fixed.add(cylinder(m.rubber, 0.32, 0.38, [side * 1.12, 0.3, -2.05], X_AXIS, 16))
    fixed.add(cylinder(m.steel, 0.12, 0.48, [side * 1.12, 0.3, -2.05], X_AXIS, 12))
  }
  box(fixed, m.graphite, [1.2, 0.22, 0.82], [0, 2.84, -1.48], 0.12, 0.03)
  box(fixed, m.ink, [0.78, 0.1, 0.5], [0, 2.98, -1.48], 0.07, 0.018)
  box(fixed, m.graphite, [0.72, 0.22, 0.26], [0, 2.74, -0.68], 0.08, 0.02)
  for (const x of [-0.92, 0.92]) {
    box(fixed, m.graphite, [0.28, 0.64, 0.38], [x, 0.87, -2.02], 0.1, 0.025)
    fixed.add(cylinder(m.steel, 0.16, 0.46, [x, 1.0, -2.0], X_AXIS, 14))
  }
  fixed.add(cylinder(m.graphite, 0.5, 1.9, [0, 1.08, -2.08], X_AXIS, 18))
  fixed.add(cylinder(m.shell, 0.39, 2.04, [0, 1.08, -2.08], X_AXIS, 18))
  fixed.add(cylinder(m.steel, 0.19, 2.18, [0, 1.08, -2.08], X_AXIS, 14))
  fixed.add(cylinder(m.graphite, 0.54, 0.28, [-1.5, 0.62, -1.85], X_AXIS, 18))
  fixed.add(cylinder(m.rubber, 0.42, 0.34, [-1.52, 0.5, -1.85], X_AXIS, 18))
  fixed.add(cylinder(m.steel, 0.16, 0.44, [-1.54, 0.5, -1.85], X_AXIS, 14))
  box(fixed, m.graphite, [0.2, 0.86, 0.76], [-1.5, 1.35, -1.18], 0.07, 0.018)
  for (const y of [1.1, 1.36, 1.62]) box(fixed, m.ink, [0.1, 0.12, 0.46], [-1.62, y, -1.12], 0.035, 0.01)
}

function addHandle(handle: Group, m: Materials) {
  handle.add(cylinder(m.graphite, 0.35, 1.7, [0, 0, 0], X_AXIS, 18))
  box(handle, m.graphite, [0.74, 3.48, 0.54], [0, 1.74, 0], 0.18, 0.045)
  box(handle, m.shade, [0.52, 3.1, 0.4], [0, 1.78, 0], 0.14, 0.035)
  box(handle, m.graphite, [0.9, 1.36, 0.62], [0, 3.9, 0], 0.2, 0.05)
  box(handle, m.shell, [0.58, 1.08, 0.52], [0, 3.96, 0.02], 0.17, 0.042)
  box(handle, m.ink, [0.32, 0.62, 0.12], [0, 3.98, 0.34], 0.09, 0.022)
  box(handle, m.amber, [0.18, 0.38, 0.08], [0, 4.02, 0.43], 0.05, 0.014)
  box(handle, m.cyan, [0.3, 0.08, 0.08], [0, 4.48, 0.33], 0.03, 0.008)
  for (const x of [-0.72, 0.72]) {
    box(handle, m.rubber, [0.3, 1.24, 0.32], [x, 4.48, 0], 0.12, 0.03)
    box(handle, m.steel, [0.3, 0.22, 0.22], [x * 0.72, 3.94, 0], 0.06, 0.016)
  }
  box(handle, m.rubber, [0.3, 0.9, 0.32], [-0.45, 5.1, 0], 0.12, 0.03, [0, 0, -0.72])
  box(handle, m.rubber, [0.3, 0.9, 0.32], [0.45, 5.1, 0], 0.12, 0.03, [0, 0, 0.72])
  box(handle, m.rubber, [0.92, 0.3, 0.32], [0, 5.43, 0], 0.12, 0.03)
}

function addService(fixed: Group, m: Materials) {
  fixed.add(
    tube(
      m.rubber,
      [
        [0.82, 2.7, -1.55],
        [1.28, 2.68, -1.55],
        [1.36, 1.92, -1.68],
        [1.2, 1.05, -1.78],
      ],
      0.075,
      26,
    ),
  )
  for (const y of [1.15, 1.48, 1.81]) box(fixed, m.graphite, [0.18, 0.12, 0.38], [1.28, y, -0.73], 0.04, 0.012)
  box(fixed, m.amber, [0.08, 0.54, 0.12], [-1.28, 1.35, -0.72], 0.03, 0.008)
  box(fixed, m.grime, [1.3, 0.045, 0.16], [0, 0.1, -0.45], 0.025, 0.006)
}

function build() {
  const { m, handles } = materials()
  const root = new Group()
  root.name = 'industrial pallet jack'
  const fixed = new Group()
  const handle = new Group()
  handle.name = 'bounded articulated control handle'
  handle.position.set(0, 1.08, -2.08)
  root.add(fixed, handle)
  addForks(fixed, m)
  addBody(fixed, m)
  addService(fixed, m)
  addHandle(handle, m)

  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [m.shell, { rub: 0.045, grime: 0.025, scratch: 0.008 }],
    [m.shade, { rub: 0.1, grime: 0.045, scratch: 0.014 }],
    [m.graphite, { rub: 0.055, grime: 0.045, scratch: 0.01 }],
    [m.steel, { rub: 0.16, grime: 0.04, scratch: 0.022 }],
  ])
  bakeOcclusion(root, { reach: 0.17 })
  bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({
    name: 'industrial-pallet-jack / localized wear',
    clearcoat: 0.08,
    clearcoatRoughness: 0.55,
  })
  root.traverse((object) => {
    if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear
  })
  const options = {
    retainedAttributes: (material: unknown): readonly string[] => (material === wear ? WEAR_ATTRIBUTES : []),
    meshName: (material: { name?: string }) => material.name ?? 'pallet jack batch',
  }
  const geometries = [...mergeStaticByMaterial(fixed, options), ...mergeStaticByMaterial(handle, options)]
  return { root, handle, m, handles, wear, geometries }
}

export function createModel(): Controller {
  const result = build()
  let enabled = false
  let elapsed = 0
  const listener = (value: boolean) => {
    enabled = value
  }
  listeners.add(listener)
  return {
    root: result.root,
    update: (delta: number) => {
      if (!enabled) return
      elapsed += Math.min(Math.max(delta, 0), 0.05)
      result.handle.rotation.x = -0.11 + Math.sin(elapsed * 0.72) * 0.11
    },
    toggleJack: (force = !enabled) => {
      enabled = force
      return force
    },
    dispose: () => {
      listeners.delete(listener)
      for (const geometry of result.geometries) geometry.dispose()
      result.wear.dispose()
      for (const resource of result.handles) resource.release()
      result.m.grime.dispose()
    },
  }
}

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low'; active?: boolean } = {}): Preview {
  const model = createModel()
  if (options.active) {
    model.toggleJack(true)
    for (let i = 0; i < 30; i += 1) model.update(0.05)
  }
  const scene = new Scene()
  scene.background = new Color(0x030506)
  scene.add(model.root, new HemisphereLight(0xcbd2d4, 0x07090c, 0.82))
  const key = new DirectionalLight(0xffead6, 2.8)
  key.position.set(-9, 12, 12)
  scene.add(key)
  const fill = new DirectionalLight(0x789bc5, 1.1)
  fill.position.set(10, 7, 9)
  scene.add(fill)
  const rim = new DirectionalLight(0x8bb3bc, 0.9)
  rim.position.set(8, 10, -11)
  scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x090d10, roughness: 0.92, metalness: 0.04 })
  const floorGeometry = new PlaneGeometry(18, 18)
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.004
  floor.userData.excludeFromExport = true
  scene.add(floor)
  const camera = new PerspectiveCamera(35, options.aspect ?? 1, 0.16, 100)
  if (options.mode === 'side') camera.position.set(-10.5, 3.8, 0)
  else if (options.mode === 'rear') camera.position.set(8.2, 4.5, -10.5)
  else if (options.mode === 'low') camera.position.set(-7.8, 0.8, 10.2)
  else camera.position.set(-9.2, 5.2, 12.2)
  camera.lookAt(0, options.mode === 'low' ? 1.6 : 2.55, 0.35)
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

export const createPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
export const createToggledPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty', active: true })
