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
  type MaterialHandle,
  type Vec3,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'

const AXIS_X: Vec3 = [0, 0, Math.PI / 2]

interface Materials {
  shell: MeshPhysicalMaterial
  shade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
  grime: MeshPhysicalMaterial
}

interface Controller { root: Group; update: (deltaSeconds: number) => void; dispose: () => void }
interface Preview extends Controller { scene: Scene; camera: PerspectiveCamera }

function acquireMaterials(): { materials: Materials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 72801 })
  const shade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 72802 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 72803 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 72804 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 72805 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 72806 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 72807 })
  return {
    handles: [shell, shade, graphite, ink, steel, amber, cyan],
    materials: {
      shell: tuneMaterial(shell, 0xcbd0cf, 0.45, 0.3, { clearcoat: 0.14 }),
      shade: tuneMaterial(shade, 0x8d989b, 0.56, 0.42),
      graphite: tuneMaterial(graphite, 0x222b34, 0.55, 0.64),
      ink: tuneMaterial(ink, 0x06090c, 0.86, 0.1),
      steel: tuneMaterial(steel, 0x9da5a7, 0.3, 0.84),
      amber: tuneMaterial(amber, 0xd97708, 0.2, 0.05, { emissive: 0.66, clearcoat: 0.25 }),
      cyan: tuneMaterial(cyan, 0x34c9d7, 0.22, 0.04, { emissive: 0.72 }),
      grime: new MeshPhysicalMaterial({ name: 'industrial-pipe-straight / contact grime', color: 0x211c18, roughness: 0.95, metalness: 0.03 }),
    },
  }
}

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.08, bevel = 0.025, rotation: Vec3 = [0, 0, 0]): Mesh {
  const mesh = prism(material, size, position, { chamfer, fillet: Math.min(0.05, Math.max(0.008, chamfer * 0.28)), bevel, rotation })
  parent.add(mesh)
  return mesh
}

function ringX(parent: Group, material: MeshPhysicalMaterial, radius: number, tube: number, at: Vec3, radial = 12, tubular = 32): void {
  const ring = new Mesh(new TorusGeometry(radius, tube, radial, tubular), material)
  ring.position.set(...at)
  ring.rotation.y = Math.PI / 2
  parent.add(ring)
}

function boltX(parent: Group, material: MeshPhysicalMaterial, at: Vec3, radius = 0.055): void {
  parent.add(cylinder(material, radius, 0.1, at, AXIS_X, 8))
}

function addPipe(parent: Group, m: Materials): void {
  // Three continuous shell courses with real dark seams, rather than one unarticulated tube.
  for (const [x, length] of [[-2.05, 1.75], [0, 2.18], [2.05, 1.75]] as const) {
    parent.add(cylinder(m.shell, 0.7, length, [x, 1.55, 0], AXIS_X, 24))
    box(parent, m.shade, [length * 0.9, 0.055, 0.12], [x, 2.19, 0.2], 0.02, 0.006)
  }
  for (const x of [-1.1, 1.1]) ringX(parent, m.graphite, 0.7, 0.035, [x, 1.55, 0])

  // Central inspection strap and physically framed amber witness.
  parent.add(cylinder(m.shade, 0.735, 0.22, [0, 1.55, 0], AXIS_X, 24))
  box(parent, m.graphite, [0.28, 0.72, 0.12], [0, 1.55, 0.73], 0.08, 0.022)
  box(parent, m.ink, [0.18, 0.5, 0.08], [0, 1.55, 0.82], 0.05, 0.014)
  box(parent, m.amber, [0.09, 0.34, 0.045], [0, 1.55, 0.88], 0.025, 0.008)
}

function addClamp(parent: Group, m: Materials, x: number): void {
  parent.add(cylinder(m.graphite, 0.87, 0.34, [x, 1.55, 0], AXIS_X, 24))
  parent.add(cylinder(m.ink, 0.77, 0.4, [x, 1.55, 0], AXIS_X, 24))
  ringX(parent, m.steel, 0.8, 0.045, [x - 0.19, 1.55, 0])
  ringX(parent, m.steel, 0.8, 0.045, [x + 0.19, 1.55, 0])
  box(parent, m.graphite, [0.44, 0.7, 0.22], [x, 1.47, 0.78], 0.1, 0.026)
  box(parent, m.ink, [0.26, 0.47, 0.1], [x, 1.47, 0.95], 0.06, 0.016)
  for (const y of [1.32, 1.47, 1.62]) box(parent, m.amber, [0.1, 0.08, 0.05], [x, y, 1.02], 0.022, 0.006)
  box(parent, m.cyan, [0.12, 0.06, 0.045], [x, 1.23, 1.02], 0.02, 0.006)
}

function addEnd(parent: Group, m: Materials, side: -1 | 1): void {
  const x = side * 3.1
  box(parent, m.shell, [0.32, 1.96, 1.96], [x, 1.55, 0], 0.34, 0.075)
  box(parent, m.shade, [0.18, 1.54, 1.54], [x - side * 0.18, 1.55, 0], 0.25, 0.06)
  parent.add(cylinder(m.graphite, 0.93, 0.45, [x - side * 0.18, 1.55, 0], AXIS_X, 24))
  parent.add(cylinder(m.ink, 0.76, 0.5, [x - side * 0.42, 1.55, 0], AXIS_X, 24))
  ringX(parent, m.amber, 0.68, 0.065, [x + side * 0.12, 1.55, 0])
  ringX(parent, m.steel, 0.84, 0.055, [x + side * 0.17, 1.55, 0])
  ringX(parent, m.ink, 0.33, 0.28, [x + side * 0.1, 1.55, 0], 10, 28)
  parent.add(cylinder(m.ink, 0.58, 0.02, [x + side * 0.11, 1.55, 0], AXIS_X, 28))
  for (const y of [0.9, 2.2]) for (const z of [-0.66, 0.66]) boltX(parent, m.steel, [x + side * 0.2, y, z], 0.05)
  for (const y of [1.16, 1.94]) box(parent, m.graphite, [0.14, 0.22, 0.18], [x + side * 0.2, y, side * 0.79], 0.04, 0.012)
}

function addPedestal(parent: Group, m: Materials, x: number): void {
  box(parent, m.graphite, [1.04, 0.18, 0.88], [x, 0.09, 0], 0.13, 0.032)
  box(parent, m.steel, [0.7, 0.055, 0.58], [x, 0.028, 0], 0.1, 0.02)
  box(parent, m.graphite, [0.62, 0.34, 0.68], [x, 0.35, 0], 0.12, 0.03)
  box(parent, m.graphite, [0.2, 0.76, 0.54], [x - 0.22, 0.76, 0], 0.08, 0.022, [0, 0, -0.36])
  box(parent, m.graphite, [0.2, 0.76, 0.54], [x + 0.22, 0.76, 0], 0.08, 0.022, [0, 0, 0.36])
  box(parent, m.ink, [0.34, 0.46, 0.58], [x, 0.82, 0], 0.09, 0.024)
  box(parent, m.cyan, [0.1, 0.23, 0.05], [x, 0.42, 0.37], 0.025, 0.008)
  for (const dx of [-0.38, 0.38]) for (const z of [-0.3, 0.3]) box(parent, m.steel, [0.1, 0.07, 0.1], [x + dx, 0.2, z], 0.025, 0.008)
}

function build() {
  const acquired = acquireMaterials()
  const root = new Group()
  root.name = 'industrial straight pipe'
  root.userData.staticMechanism = true
  const fixed = new Group()
  root.add(fixed)
  addPipe(fixed, acquired.materials)
  for (const x of [-1.55, 1.55]) { addClamp(fixed, acquired.materials, x); addPedestal(fixed, acquired.materials, x) }
  addEnd(fixed, acquired.materials, -1)
  addEnd(fixed, acquired.materials, 1)

  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [acquired.materials.shell, { rub: 0.08, grime: 0.03, scratch: 0.012 }],
    [acquired.materials.shade, { rub: 0.08, grime: 0.035, scratch: 0.013 }],
    [acquired.materials.graphite, { rub: 0.055, grime: 0.04, scratch: 0.01 }],
    [acquired.materials.steel, { rub: 0.15, grime: 0.035, scratch: 0.02 }],
  ])
  bakeOcclusion(root, { reach: 0.14 })
  bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'industrial-pipe-straight / localized wear', clearcoat: 0.08, clearcoatRoughness: 0.56 })
  root.traverse((object) => { if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear })
  const geometries = mergeStaticByMaterial(fixed, {
    retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material: { name?: string }) => material.name ?? 'straight pipe batch',
  })
  return { root, geometries, wear, handles: acquired.handles, materials: acquired.materials }
}

export function createModel(): Controller {
  const built = build()
  return {
    root: built.root,
    update: () => {},
    dispose: () => {
      for (const geometry of built.geometries) geometry.dispose()
      built.wear.dispose()
      built.materials.grime.dispose()
      for (const handle of built.handles) handle.release()
    },
  }
}

function preview(options: { aspect?: number; mode?: 'side' | 'rear' | 'low' } = {}): Preview {
  const model = createModel()
  const scene = new Scene()
  scene.background = new Color(0x030506)
  scene.add(model.root, new HemisphereLight(0xd1d7d8, 0x070a0d, 0.86))
  const key = new DirectionalLight(0xffead7, 2.8); key.position.set(-8, 9, 10); scene.add(key)
  const fill = new DirectionalLight(0x789cc6, 1.05); fill.position.set(9, 5, 7); scene.add(fill)
  const rim = new DirectionalLight(0x89adb5, 0.9); rim.position.set(6, 7, -9); scene.add(rim)
  let floorGeometry: PlaneGeometry | undefined; let floorMaterial: MeshPhysicalMaterial | undefined
  if (options.mode) {
    floorMaterial = new MeshPhysicalMaterial({ color: 0x090d10, roughness: 0.94, metalness: 0.03 })
    floorGeometry = new PlaneGeometry(16, 16)
    const floor = new Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.004; floor.userData.excludeFromExport = true; scene.add(floor)
  }
  const camera = new PerspectiveCamera(34, options.aspect ?? 1, 0.14, 80)
  if (options.mode === 'side') camera.position.set(-8.4, 2.1, 0)
  else if (options.mode === 'rear') camera.position.set(6.9, 3.0, -8.4)
  else if (options.mode === 'low') camera.position.set(-6.6, 0.62, 7.8)
  else camera.position.set(-7.8, 3.7, 9.3)
  camera.lookAt(0, options.mode === 'low' ? 1.0 : 1.35, 0)
  scene.add(camera)
  return { ...model, scene, camera, dispose: () => { floorGeometry?.dispose(); floorMaterial?.dispose(); model.dispose() } }
}

export const createPreview = (options: { aspect?: number } = {}) => preview(options)
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
