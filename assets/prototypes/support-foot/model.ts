import {
  Color,
  CylinderGeometry,
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

interface Materials { shell: MeshPhysicalMaterial; shade: MeshPhysicalMaterial; graphite: MeshPhysicalMaterial; ink: MeshPhysicalMaterial; steel: MeshPhysicalMaterial; amber: MeshPhysicalMaterial; cyan: MeshPhysicalMaterial; grime: MeshPhysicalMaterial }
interface Controller { root: Group; update: (deltaSeconds: number) => void; dispose: () => void }
interface Preview extends Controller { scene: Scene; camera: PerspectiveCamera }

function acquireMaterials(): { materials: Materials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 73101 })
  const shade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 73102 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 73103 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 73104 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 73105 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 73106 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 73107 })
  return { handles: [shell, shade, graphite, ink, steel, amber, cyan], materials: {
    shell: tuneMaterial(shell, 0xc8d0d2, 0.46, 0.3, { clearcoat: 0.13 }),
    shade: tuneMaterial(shade, 0x879398, 0.56, 0.42),
    graphite: tuneMaterial(graphite, 0x222b34, 0.55, 0.64),
    ink: tuneMaterial(ink, 0x06090c, 0.86, 0.1),
    steel: tuneMaterial(steel, 0x9ca5a8, 0.3, 0.84),
    amber: tuneMaterial(amber, 0xd57507, 0.2, 0.05, { emissive: 0.68, clearcoat: 0.25 }),
    cyan: tuneMaterial(cyan, 0x35cbd8, 0.22, 0.04, { emissive: 0.74 }),
    grime: new MeshPhysicalMaterial({ name: 'support-foot / contact grime', color: 0x201b17, roughness: 0.95, metalness: 0.03 }),
  } }
}

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.08, bevel = 0.025, rotation: Vec3 = [0, 0, 0]): Mesh {
  const mesh = prism(material, size, position, { chamfer, fillet: Math.min(0.05, Math.max(0.008, chamfer * 0.28)), bevel, rotation })
  parent.add(mesh)
  return mesh
}

function addBase(parent: Group, m: Materials): void {
  box(parent, m.graphite, [3.7, 0.46, 3.7], [0, 0.23, 0], 0.34, 0.075)
  box(parent, m.steel, [3.25, 0.06, 3.25], [0, 0.03, 0], 0.26, 0.05)
  box(parent, m.ink, [3.05, 0.18, 3.05], [0, 0.48, 0], 0.22, 0.05)
  for (const x of [-1.47, 1.47]) for (const z of [-1.47, 1.47]) {
    parent.add(cylinder(m.ink, 0.17, 0.07, [x, 0.48, z], [0, 0, 0], 16))
    parent.add(cylinder(m.steel, 0.072, 0.045, [x, 0.51, z], [0, 0, 0], 10))
  }
  for (const x of [-1.42, 1.42]) box(parent, m.amber, [0.34, 0.075, 0.07], [x, 0.25, 1.855], 0.035, 0.01)
  box(parent, m.cyan, [0.52, 0.065, 0.065], [0, 0.24, -1.855], 0.03, 0.009)
}

function addBody(parent: Group, m: Materials): void {
  const bodyGeometry = new CylinderGeometry(1.58, 2.02, 2.25, 4, 1, false)
  bodyGeometry.rotateY(Math.PI / 4)
  const body = new Mesh(bodyGeometry, m.shell)
  body.position.set(0, 1.58, 0)
  parent.add(body)
  const lowerGeometry = new CylinderGeometry(1.94, 2.08, 0.34, 4, 1, false)
  lowerGeometry.rotateY(Math.PI / 4)
  const lower = new Mesh(lowerGeometry, m.shade)
  lower.position.set(0, 0.62, 0)
  parent.add(lower)

  // Four corner load spines and seated diagonal braces.
  for (const x of [-1.28, 1.28]) for (const z of [-1.16, 1.16]) {
    box(parent, m.graphite, [0.3, 1.22, 0.3], [x, 1.05, z], 0.08, 0.024, [0, 0, x * -0.3])
    box(parent, m.steel, [0.075, 0.38, 0.075], [x * 0.86, 1.5, z], 0.024, 0.008)
  }
  box(parent, m.graphite, [2.72, 0.22, 2.72], [0, 2.68, 0], 0.2, 0.05)
}

function addTop(parent: Group, m: Materials): void {
  box(parent, m.graphite, [2.76, 0.4, 2.76], [0, 2.86, 0], 0.24, 0.06)
  box(parent, m.shell, [3.28, 0.32, 3.28], [0, 3.12, 0], 0.34, 0.075)
  box(parent, m.graphite, [1.72, 0.1, 1.72], [0, 3.315, 0], 0.14, 0.034)
  box(parent, m.steel, [1.38, 0.055, 1.38], [0, 3.39, 0], 0.11, 0.026)
  for (const x of [-1.3, 1.3]) for (const z of [-1.3, 1.3]) {
    parent.add(cylinder(m.ink, 0.14, 0.055, [x, 3.3, z], [0, 0, 0], 16))
    parent.add(cylinder(m.steel, 0.065, 0.035, [x, 3.337, z], [0, 0, 0], 10))
  }
}

function addFrontService(parent: Group, m: Materials): void {
  box(parent, m.graphite, [1.14, 1.7, 0.24], [0, 1.67, 1.34], 0.16, 0.04)
  box(parent, m.ink, [0.82, 1.39, 0.12], [0, 1.72, 1.5], 0.12, 0.03)
  box(parent, m.shade, [0.56, 1.14, 0.09], [0, 1.82, 1.61], 0.1, 0.026)
  box(parent, m.amber, [0.3, 0.91, 0.065], [0, 1.85, 1.69], 0.065, 0.016)
  for (let i = -3; i <= 3; i += 1) box(parent, m.ink, [0.33, 0.045, 0.055], [0, 1.85 + i * 0.112, 1.745], 0.012, 0.004)
  box(parent, m.graphite, [0.92, 0.36, 0.25], [0, 0.78, 1.31], 0.12, 0.03)
  box(parent, m.amber, [0.5, 0.16, 0.085], [0, 0.8, 1.5], 0.06, 0.016)
  for (const x of [-0.44, 0.44]) for (const y of [1.0, 2.4]) parent.add(cylinder(m.steel, 0.045, 0.075, [x, y, 1.63], [Math.PI / 2, 0, 0], 8))
}

function addSideService(parent: Group, m: Materials): void {
  box(parent, m.graphite, [0.24, 1.52, 1.12], [1.35, 1.66, 0.15], 0.13, 0.032)
  box(parent, m.shade, [0.12, 1.27, 0.82], [1.52, 1.68, 0.15], 0.11, 0.026)
  box(parent, m.cyan, [0.06, 0.16, 0.56], [1.61, 2.32, 0.15], 0.025, 0.008)
  box(parent, m.graphite, [0.13, 0.42, 0.12], [1.61, 1.62, 0.67], 0.035, 0.01)
  for (let i = -2; i <= 2; i += 1) box(parent, m.ink, [0.06, 0.04, 0.42], [1.61, 1.05 + i * 0.09, 0.15], 0.012, 0.004)
}

function build() {
  const acquired = acquireMaterials()
  const root = new Group(); root.name = 'structural support foot'; root.userData.staticMechanism = true
  const fixed = new Group(); root.add(fixed)
  addBase(fixed, acquired.materials); addBody(fixed, acquired.materials); addTop(fixed, acquired.materials); addFrontService(fixed, acquired.materials); addSideService(fixed, acquired.materials)
  box(fixed, acquired.materials.grime, [2.9, 0.035, 2.9], [0, 0.018, 0], 0.16, 0.03)
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [acquired.materials.shell, { rub: 0.08, grime: 0.03, scratch: 0.012 }],
    [acquired.materials.shade, { rub: 0.09, grime: 0.035, scratch: 0.014 }],
    [acquired.materials.graphite, { rub: 0.055, grime: 0.04, scratch: 0.01 }],
    [acquired.materials.steel, { rub: 0.15, grime: 0.035, scratch: 0.02 }],
  ])
  bakeOcclusion(root, { reach: 0.14 }); bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'support-foot / localized wear', clearcoat: 0.08, clearcoatRoughness: 0.56 })
  root.traverse((object) => { if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear })
  const geometries = mergeStaticByMaterial(fixed, { retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [], meshName: (material: { name?: string }) => material.name ?? 'support foot batch' })
  return { root, geometries, wear, handles: acquired.handles, materials: acquired.materials }
}

export function createModel(): Controller {
  const built = build()
  return { root: built.root, update: () => {}, dispose: () => { for (const geometry of built.geometries) geometry.dispose(); built.wear.dispose(); built.materials.grime.dispose(); for (const handle of built.handles) handle.release() } }
}

function preview(options: { aspect?: number; mode?: 'side' | 'rear' | 'low' } = {}): Preview {
  const model = createModel(); const scene = new Scene(); scene.background = new Color(0x030506); scene.add(model.root, new HemisphereLight(0xd1d7d8, 0x070a0d, 0.86))
  const key = new DirectionalLight(0xffead7, 2.8); key.position.set(-7, 9, 10); scene.add(key)
  const fill = new DirectionalLight(0x789cc6, 1.05); fill.position.set(8, 5, 7); scene.add(fill)
  const rim = new DirectionalLight(0x89adb5, 0.9); rim.position.set(5, 7, -8); scene.add(rim)
  let floorGeometry: PlaneGeometry | undefined; let floorMaterial: MeshPhysicalMaterial | undefined
  if (options.mode) { floorMaterial = new MeshPhysicalMaterial({ color: 0x090d10, roughness: 0.94, metalness: 0.03 }); floorGeometry = new PlaneGeometry(12, 12); const floor = new Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.004; floor.userData.excludeFromExport = true; scene.add(floor) }
  const camera = new PerspectiveCamera(33, options.aspect ?? 1, 0.12, 60)
  if (options.mode === 'side') camera.position.set(-7, 2.1, 0)
  else if (options.mode === 'rear') camera.position.set(5.7, 3.1, -6.8)
  else if (options.mode === 'low') camera.position.set(-5.2, 0.58, 6.4)
  else camera.position.set(-5.5, 3.8, 6.8)
  camera.lookAt(0, options.mode === 'low' ? 1.5 : 1.8, 0); scene.add(camera)
  return { ...model, scene, camera, dispose: () => { floorGeometry?.dispose(); floorMaterial?.dispose(); model.dispose() } }
}

export const createPreview = (options: { aspect?: number } = {}) => preview(options)
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
