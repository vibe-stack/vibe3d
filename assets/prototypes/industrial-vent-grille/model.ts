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

interface Materials {
  shell: MeshPhysicalMaterial
  shade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
}

interface Controller { root: Group; update: (delta: number) => void; dispose: () => void }
interface Preview extends Controller { scene: Scene; camera: PerspectiveCamera }

function materials() {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 27501 })
  const shade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 27502 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 27503 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 27504 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 27505 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 27506 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 27507 })
  return {
    handles: [shell, shade, graphite, ink, steel, amber, cyan],
    m: {
      shell: tuneMaterial(shell, 0xcbd0cf, 0.46, 0.28, { clearcoat: 0.11 }),
      shade: tuneMaterial(shade, 0x8c9699, 0.56, 0.42),
      graphite: tuneMaterial(graphite, 0x222a31, 0.56, 0.61),
      ink: tuneMaterial(ink, 0x07090b, 0.86, 0.08),
      steel: tuneMaterial(steel, 0x9aa3a6, 0.3, 0.84),
      amber: tuneMaterial(amber, 0xd96f08, 0.28, 0.05, { emissive: 0.5 }),
      cyan: tuneMaterial(cyan, 0x38cad5, 0.22, 0.04, { emissive: 0.68 }),
    } satisfies Materials,
  }
}

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.08, bevel = 0.025, rotation: Vec3 = [0, 0, 0]) {
  const mesh = prism(material, size, position, { chamfer, fillet: Math.min(0.05, Math.max(0.008, chamfer * 0.28)), bevel, rotation })
  parent.add(mesh)
  return mesh
}

function addShell(root: Group, m: Materials) {
  box(root, m.graphite, [5.7, 4.5, 0.46], [0, 2.25, -0.2], 0.24, 0.06)
  box(root, m.shell, [5.48, 0.58, 0.62], [0, 4.21, 0.02], 0.18, 0.045)
  box(root, m.shell, [5.48, 0.58, 0.62], [0, 0.29, 0.02], 0.18, 0.045)
  box(root, m.shell, [0.58, 3.42, 0.62], [-2.45, 2.25, 0.02], 0.18, 0.045)
  box(root, m.shell, [0.58, 3.42, 0.62], [2.45, 2.25, 0.02], 0.18, 0.045)
  // Captured corner armor and true dark fastener wells.
  for (const x of [-2.38, 2.38]) for (const y of [0.42, 4.08]) {
    box(root, m.shade, [0.5, 0.5, 0.22], [x, y, 0.39], 0.12, 0.03)
    root.add(cylinder(m.ink, 0.09, 0.1, [x, y, 0.39], FRONT, 12))
    root.add(cylinder(m.steel, 0.04, 0.11, [x, y, 0.46], FRONT, 10))
  }
  // Split panel seams sit proud of the shell rather than coplanar with it.
  box(root, m.shade, [0.05, 0.42, 0.08], [0, 4.2, 0.37], 0.015, 0.005)
  box(root, m.shade, [0.05, 0.42, 0.08], [0, 0.3, 0.37], 0.015, 0.005)
}

function addCavity(root: Group, m: Materials) {
  box(root, m.graphite, [4.64, 3.46, 0.66], [0, 2.25, 0.3], 0.26, 0.065)
  box(root, m.ink, [4.24, 3.08, 0.2], [0, 2.25, 0.44], 0.18, 0.045)
  box(root, m.amber, [3.86, 2.72, 0.06], [0, 2.25, 0.5], 0.12, 0.03)
  // Physical filter mesh: crossed ribs well behind the front louver plane.
  for (let i = -10; i <= 10; i += 1) {
    box(root, m.ink, [0.055, 2.7, 0.04], [i * 0.18, 2.25, 0.55], 0.012, 0.004, [0, 0, 0.18])
    box(root, m.graphite, [0.055, 2.7, 0.04], [i * 0.18, 2.25, 0.56], 0.012, 0.004, [0, 0, -0.18])
  }
  // Eight overlapping airfoil slats with seated center braces.
  for (let i = 0; i < 8; i += 1) {
    const y = 0.98 + i * 0.36
    box(root, m.graphite, [4.02, 0.24, 0.22], [0, y, 0.65], 0.07, 0.02, [0.12, 0, 0])
    box(root, m.ink, [3.86, 0.055, 0.055], [0, y + 0.08, 0.77], 0.018, 0.005)
    box(root, m.ink, [0.16, 0.32, 0.2], [0, y, 0.68], 0.04, 0.012)
  }
  for (let i = 0; i < 7; i += 1) {
    box(root, m.amber, [3.72, 0.075, 0.035], [0, 1.16 + i * 0.36, 0.7], 0.018, 0.005)
  }
}

function addService(root: Group, m: Materials) {
  box(root, m.graphite, [0.42, 1.42, 0.22], [-2.35, 2.25, 0.62], 0.12, 0.03)
  box(root, m.ink, [0.2, 1.02, 0.1], [-2.35, 2.25, 0.8], 0.07, 0.018)
  box(root, m.amber, [0.08, 0.34, 0.06], [-2.35, 2.35, 0.88], 0.02, 0.006)
  box(root, m.graphite, [0.42, 1.42, 0.22], [2.35, 2.25, 0.62], 0.12, 0.03)
  box(root, m.ink, [0.2, 1.02, 0.1], [2.35, 2.25, 0.8], 0.07, 0.018)
  for (const y of [1.92, 2.25, 2.58]) box(root, m.amber, [0.08, 0.18, 0.06], [2.35, y, 0.88], 0.02, 0.006)
  box(root, m.cyan, [0.07, 0.58, 0.06], [2.53, 2.25, 0.64], 0.018, 0.005)
}

function build() {
  const { m, handles } = materials(); const root = new Group(); root.name = 'industrial vent grille'
  addShell(root, m); addCavity(root, m); addService(root, m)
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [m.shell, { rub: 0.07, grime: 0.04, scratch: 0.012 }],
    [m.shade, { rub: 0.09, grime: 0.04, scratch: 0.014 }],
    [m.graphite, { rub: 0.05, grime: 0.045, scratch: 0.01 }],
    [m.steel, { rub: 0.15, grime: 0.035, scratch: 0.02 }],
  ])
  bakeOcclusion(root, { reach: 0.14 }); bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'industrial-vent-grille / localized wear', clearcoat: 0.08, clearcoatRoughness: 0.57 })
  root.traverse((object) => { if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear })
  const geometries = mergeStaticByMaterial(root, { retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [], meshName: (material: { name?: string }) => material.name ?? 'vent grille batch' })
  return { root, handles, wear, geometries }
}

export function createModel(): Controller {
  const result = build()
  return { root: result.root, update: () => {}, dispose: () => { for (const geometry of result.geometries) geometry.dispose(); result.wear.dispose(); for (const handle of result.handles) handle.release() } }
}

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low' } = {}): Preview {
  const model = createModel(); const scene = new Scene(); scene.background = new Color(0x030506); scene.add(model.root, new HemisphereLight(0xcbd2d4, 0x07090c, 0.82))
  const key = new DirectionalLight(0xffead6, 2.8); key.position.set(-8, 10, 11); scene.add(key)
  const fill = new DirectionalLight(0x789bc5, 1.1); fill.position.set(9, 7, 8); scene.add(fill)
  const rim = new DirectionalLight(0x8bb3bc, 0.9); rim.position.set(7, 10, -11); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x090d10, roughness: 0.92, metalness: 0.04 }); const floorGeometry = new PlaneGeometry(14, 14)
  const floor = new Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.004; floor.userData.excludeFromExport = true; scene.add(floor)
  const camera = new PerspectiveCamera(33, options.aspect ?? 1, 0.14, 90)
  if (options.mode === 'side') camera.position.set(-9.8, 2.3, 0)
  else if (options.mode === 'rear') camera.position.set(7.8, 2.7, -9.6)
  else if (options.mode === 'low') camera.position.set(-7.8, 0.7, 9.5)
  else camera.position.set(-7.9, 3.8, 9.7)
  camera.lookAt(0, options.mode === 'low' ? 1.8 : 2.25, 0); scene.add(camera)
  return { ...model, scene, camera, dispose: () => { floorGeometry.dispose(); floorMaterial.dispose(); model.dispose() } }
}

export const createPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
