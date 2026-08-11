import {
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  Path,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Shape,
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

interface Materials { shell: MeshPhysicalMaterial; shade: MeshPhysicalMaterial; graphite: MeshPhysicalMaterial; ink: MeshPhysicalMaterial; steel: MeshPhysicalMaterial; bronze: MeshPhysicalMaterial; amber: MeshPhysicalMaterial; cyan: MeshPhysicalMaterial }
interface Controller { root: Group; update: (delta: number) => void; togglePressure: (force?: boolean) => boolean; dispose: () => void }
interface Preview extends Controller { scene: Scene; camera: PerspectiveCamera }

let exportedEnabled = false
const listeners = new Set<(enabled: boolean) => void>()
export function togglePressure(force = !exportedEnabled) { exportedEnabled = force; for (const listener of listeners) listener(force); return force }

function createMaterials() {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 27701 })
  const shade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 27702 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 27703 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 27704 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 27705 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 27706 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 27707 })
  return {
    handles: [shell, shade, graphite, ink, steel, amber, cyan],
    m: {
      shell: tuneMaterial(shell, 0xcbd0cf, 0.46, 0.28, { clearcoat: 0.12 }), shade: tuneMaterial(shade, 0x8b9598, 0.56, 0.42),
      graphite: tuneMaterial(graphite, 0x222930, 0.56, 0.61), ink: tuneMaterial(ink, 0x07090b, 0.86, 0.08),
      steel: tuneMaterial(steel, 0x9ba3a5, 0.3, 0.84), bronze: new MeshPhysicalMaterial({ name: 'industrial-pressure-gauge / bronze', color: 0x956128, roughness: 0.34, metalness: 0.76 }),
      amber: tuneMaterial(amber, 0xd9770a, 0.28, 0.04, { emissive: 0.48 }), cyan: tuneMaterial(cyan, 0x38cad5, 0.22, 0.04, { emissive: 0.7 }),
    } satisfies Materials,
  }
}

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.08, bevel = 0.025, rotation: Vec3 = [0, 0, 0]) {
  const mesh = prism(material, size, position, { chamfer, fillet: Math.min(0.05, Math.max(0.008, chamfer * 0.28)), bevel, rotation }); parent.add(mesh); return mesh
}

function annulus(parent: Group, material: MeshPhysicalMaterial, outer: number, inner: number, depth: number, at: Vec3, segments = 48) {
  const shape = new Shape()
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
  const hole = new Path()
  hole.absarc(0, 0, inner, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.025, bevelThickness: 0.025, curveSegments: segments })
  geometry.translate(at[0], at[1], at[2] - depth * 0.5)
  const mesh = new Mesh(geometry, material)
  parent.add(mesh)
  return mesh
}

function addBack(fixed: Group, m: Materials) {
  box(fixed, m.graphite, [2.05, 3.36, 0.34], [2.12, 2.62, -0.56], 0.2, 0.05)
  box(fixed, m.ink, [1.64, 2.92, 0.14], [2.12, 2.62, -0.76], 0.15, 0.035)
  box(fixed, m.graphite, [1.42, 0.72, 0.5], [1.35, 2.55, -0.24], 0.16, 0.04)
  for (const x of [1.55, 2.75]) for (const y of [1.45, 3.78]) {
    fixed.add(cylinder(m.ink, 0.15, 0.1, [x, y, -0.34], FRONT, 16))
    const ring = new Mesh(new TorusGeometry(0.15, 0.035, 6, 16), m.steel)
    ring.position.set(x, y, -0.27)
    fixed.add(ring)
  }
  box(fixed, m.shade, [0.78, 1.02, 0.22], [2.18, 2.6, -0.94], 0.14, 0.035)
  box(fixed, m.graphite, [0.16, 1.22, 0.15], [1.74, 2.6, -1.06], 0.05, 0.014, [0, 0, -0.58])
  box(fixed, m.shade, [0.16, 1.5, 0.12], [2.38, 2.55, -0.3], 0.045, 0.012, [0, 0, -0.62])
}

function addBody(fixed: Group, m: Materials) {
  fixed.add(cylinder(m.shell, 2.03, 0.82, [0, 2.55, 0], FRONT, 16))
  fixed.add(cylinder(m.shade, 1.69, 0.28, [0, 2.55, 0.29], FRONT, 20))
  annulus(fixed, m.graphite, 1.77, 1.34, 0.2, [0, 2.55, 0.52])
  annulus(fixed, m.ink, 1.41, 1.26, 0.14, [0, 2.55, 0.66])
  fixed.add(cylinder(m.bronze, 1.25, 0.09, [0, 2.55, 0.73], FRONT, 48))
  fixed.add(cylinder(m.amber, 1.08, 0.025, [0, 2.55, 0.79], FRONT, 48))

  for (let i = 0; i < 28; i += 1) {
    const a = (i / 28) * Math.PI * 2
    const major = i % 4 === 0
    const r = major ? 0.94 : 1.02
    const length = major ? 0.3 : 0.18
    box(fixed, m.ink, [0.055, length, 0.055], [Math.cos(a) * r, 2.55 + Math.sin(a) * r, 0.92], 0.012, 0.004, [0, 0, a - Math.PI / 2])
  }
  for (let i = 0; i < 4; i += 1) {
    const a = i * Math.PI / 2 + Math.PI / 4
    const x = Math.cos(a) * 1.57; const y = 2.55 + Math.sin(a) * 1.57
    fixed.add(cylinder(m.ink, 0.16, 0.19, [x, y, 0.69], FRONT, 12))
    fixed.add(cylinder(m.steel, 0.075, 0.21, [x, y, 0.82], FRONT, 10))
  }
  for (let i = 0; i < 4; i += 1) {
    const a = i * Math.PI / 2
    box(fixed, m.graphite, [0.68, 0.4, 0.32], [Math.cos(a) * 1.72, 2.55 + Math.sin(a) * 1.72, 0.58], 0.12, 0.03, [0, 0, a])
  }
  for (const a of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
    box(fixed, m.shell, [0.82, 0.42, 0.34], [Math.cos(a) * 1.78, 2.55 + Math.sin(a) * 1.78, 0.24], 0.14, 0.034, [0, 0, a])
  }
  box(fixed, m.cyan, [0.08, 0.48, 0.06], [0.82, 3.95, 0.62], 0.02, 0.006, [0, 0, -0.52])
  fixed.add(cylinder(m.amber, 0.11, 0.06, [0, 1.63, 0.86], FRONT, 16))
}

function addService(fixed: Group, m: Materials) {
  box(fixed, m.graphite, [0.58, 1.52, 0.28], [1.5, 2.55, 0.68], 0.14, 0.034)
  box(fixed, m.ink, [0.34, 1.16, 0.12], [1.5, 2.55, 0.9], 0.08, 0.02)
  box(fixed, m.bronze, [0.17, 0.86, 0.08], [1.5, 2.55, 1.01], 0.06, 0.016)
  box(fixed, m.amber, [0.1, 0.68, 0.05], [1.5, 2.55, 1.07], 0.04, 0.012)
  for (const y of [1.96, 3.14]) for (const x of [1.34, 1.66]) fixed.add(cylinder(m.steel, 0.05, 0.12, [x, y, 1.02], FRONT, 8))

  fixed.add(cylinder(m.graphite, 0.45, 0.34, [0, 0.75, 0], [0, 0, 0], 6))
  fixed.add(cylinder(m.steel, 0.31, 0.25, [0, 0.47, 0], [0, 0, 0], 20))
  fixed.add(cylinder(m.graphite, 0.42, 0.38, [0, 0.24, 0], [0, 0, 0], 20))
  for (let i = 0; i < 16; i += 1) {
    const a = i * Math.PI / 8
    box(fixed, m.ink, [0.07, 0.26, 0.08], [Math.cos(a) * 0.39, 0.24, Math.sin(a) * 0.39], 0.02, 0.006, [0, -a, 0])
  }
  fixed.add(cylinder(m.cyan, 0.35, 0.06, [0, 0.08, 0], [0, 0, 0], 20))
  fixed.add(cylinder(m.ink, 0.2, 0.16, [0, 0.08, 0], [0, 0, 0], 12))
}

function addNeedle(needle: Group, m: Materials) {
  needle.position.set(0, 2.55, 0.95); needle.rotation.z = -0.82
  box(needle, m.graphite, [0.14, 1.38, 0.08], [0, 0.55, 0], 0.035, 0.01)
  box(needle, m.ink, [0.12, 0.48, 0.08], [0, -0.18, 0], 0.03, 0.008)
  needle.add(cylinder(m.graphite, 0.22, 0.12, [0, 0, 0], FRONT, 16))
  needle.add(cylinder(m.steel, 0.07, 0.14, [0, 0, 0.08], FRONT, 12))
  needle.add(cylinder(m.amber, 0.12, 0.08, [0, -0.92, 0], FRONT, 12))
}

function build() {
  const { m, handles } = createMaterials(); const root = new Group(); root.name = 'industrial pressure gauge'; const fixed = new Group(); const needle = new Group(); needle.name = 'bounded pressure needle'; root.add(fixed, needle)
  addBack(fixed, m); addBody(fixed, m); addService(fixed, m); addNeedle(needle, m)
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([[m.shell, { rub: 0.07, grime: 0.035, scratch: 0.012 }], [m.shade, { rub: 0.09, grime: 0.04, scratch: 0.014 }], [m.graphite, { rub: 0.05, grime: 0.04, scratch: 0.01 }], [m.steel, { rub: 0.15, grime: 0.035, scratch: 0.02 }]])
  bakeOcclusion(root, { reach: 0.13 }); bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'industrial-pressure-gauge / localized wear', clearcoat: 0.08, clearcoatRoughness: 0.56 })
  root.traverse((object) => { if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear })
  const options = { retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [], meshName: (material: { name?: string }) => material.name ?? 'pressure gauge batch' }
  const geometries = [...mergeStaticByMaterial(fixed, options), ...mergeStaticByMaterial(needle, options)]
  return { root, needle, handles, wear, geometries, bronze: m.bronze }
}

export function createModel(): Controller {
  const result = build(); let enabled = false; let time = 0; const listener = (value: boolean) => { enabled = value }; listeners.add(listener)
  return { root: result.root, update: (delta: number) => { if (!enabled) return; time += Math.min(Math.max(delta, 0), 0.05); result.needle.rotation.z = -0.82 + Math.sin(time * 0.62) * 0.18 }, togglePressure: (force = !enabled) => { enabled = force; return force }, dispose: () => { listeners.delete(listener); for (const geometry of result.geometries) geometry.dispose(); result.wear.dispose(); result.bronze.dispose(); for (const handle of result.handles) handle.release() } }
}

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low'; active?: boolean } = {}): Preview {
  const model = createModel(); if (options.active) { model.togglePressure(true); for (let i = 0; i < 30; i += 1) model.update(0.05) }
  const scene = new Scene(); scene.background = new Color(0x030506); scene.add(model.root, new HemisphereLight(0xcbd2d4, 0x07090c, 0.82))
  const key = new DirectionalLight(0xffead6, 2.8); key.position.set(-8, 10, 11); scene.add(key); const fill = new DirectionalLight(0x789bc5, 1.1); fill.position.set(9, 7, 8); scene.add(fill); const rim = new DirectionalLight(0x8bb3bc, 0.9); rim.position.set(7, 10, -11); scene.add(rim)
  let floorMaterial: MeshPhysicalMaterial | undefined; let floorGeometry: PlaneGeometry | undefined
  if (options.mode && options.mode !== 'beauty') { floorMaterial = new MeshPhysicalMaterial({ color: 0x090d10, roughness: 0.92, metalness: 0.04 }); floorGeometry = new PlaneGeometry(12, 12); const floor = new Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.004; floor.userData.excludeFromExport = true; scene.add(floor) }
  const camera = new PerspectiveCamera(34, options.aspect ?? 1, 0.14, 90)
  if (options.mode === 'side') camera.position.set(-7.6, 2.5, 0); else if (options.mode === 'rear') camera.position.set(6.2, 2.8, -7.5); else if (options.mode === 'low') camera.position.set(-5.8, 0.65, 7.0); else camera.position.set(-3.3, 3.7, 8.4)
  camera.lookAt(0.15, options.mode === 'low' ? 1.9 : 2.45, 0); scene.add(camera)
  return { ...model, scene, camera, dispose: () => { floorGeometry?.dispose(); floorMaterial?.dispose(); model.dispose() } }
}

export const createPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
export const createToggledPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty', active: true })
