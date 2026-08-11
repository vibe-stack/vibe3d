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
  TorusGeometry,
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

const X_AXIS: Vec3 = [0, 0, Math.PI / 2]
const FRONT: Vec3 = [Math.PI / 2, 0, 0]

interface Materials {
  shell: MeshPhysicalMaterial
  shade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  bronze: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
}

interface Controller {
  root: Group
  update: (delta: number) => void
  toggleValve: (force?: boolean) => boolean
  dispose: () => void
}

interface Preview extends Controller { scene: Scene; camera: PerspectiveCamera }

let exportedEnabled = false
const listeners = new Set<(enabled: boolean) => void>()

export function toggleValve(force = !exportedEnabled) {
  exportedEnabled = force
  for (const listener of listeners) listener(force)
  return force
}

function materials() {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 27101 })
  const shade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 27102 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 27103 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 27104 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 27105 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 27106 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 27107 })
  return {
    handles: [shell, shade, graphite, ink, steel, amber, cyan],
    m: {
      shell: tuneMaterial(shell, 0xc9cecc, 0.46, 0.3, { clearcoat: 0.1 }),
      shade: tuneMaterial(shade, 0x8c9699, 0.55, 0.42),
      graphite: tuneMaterial(graphite, 0x222a31, 0.56, 0.6),
      ink: tuneMaterial(ink, 0x07090b, 0.86, 0.08),
      steel: tuneMaterial(steel, 0x9ba3a5, 0.3, 0.84),
      bronze: new MeshPhysicalMaterial({ name: 'industrial-pipe-valve / bronze', color: 0x9b6429, roughness: 0.32, metalness: 0.78 }),
      amber: tuneMaterial(amber, 0xe97908, 0.22, 0.04, { emissive: 0.66 }),
      cyan: tuneMaterial(cyan, 0x38cbd5, 0.22, 0.04, { emissive: 0.72 }),
    } satisfies Materials,
  }
}

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.08, bevel = 0.025, rotation: Vec3 = [0, 0, 0]) {
  const mesh = prism(material, size, position, { chamfer, fillet: Math.min(0.05, Math.max(0.008, chamfer * 0.28)), bevel, rotation })
  parent.add(mesh)
  return mesh
}

function flange(parent: Group, m: Materials, x: number, y: number, radius = 0.82) {
  parent.add(cylinder(m.graphite, radius, 0.42, [x, y, 0], X_AXIS, 24))
  parent.add(cylinder(m.steel, radius + 0.12, 0.16, [x, y, 0], X_AXIS, 24))
  parent.add(cylinder(m.shade, radius + 0.18, 0.1, [x, y, 0], X_AXIS, 24))
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2
    parent.add(cylinder(m.steel, 0.075, 0.15, [x + 0.12, y + Math.cos(a) * (radius + 0.03), Math.sin(a) * (radius + 0.03)], X_AXIS, 10))
  }
}

function addPipe(fixed: Group, m: Materials) {
  fixed.add(cylinder(m.shell, 0.61, 5.7, [0.65, 1.82, 0], X_AXIS, 24))
  fixed.add(cylinder(m.graphite, 0.7, 0.54, [-1.9, 1.82, 0], X_AXIS, 24))
  fixed.add(cylinder(m.graphite, 0.7, 0.54, [2.9, 1.82, 0], X_AXIS, 24))
  flange(fixed, m, -2.18, 1.82)
  flange(fixed, m, 3.45, 1.82)

  const elbowPath = new CatmullRomCurve3([
    new Vector3(-2.55, 1.82, 0),
    new Vector3(-3.12, 1.72, 0),
    new Vector3(-3.55, 1.25, 0),
    new Vector3(-3.62, 0.62, 0),
  ])
  const elbowGeometry = new TubeGeometry(elbowPath, 20, 0.61, 12, false)
  const elbow = new Mesh(elbowGeometry, m.shell)
  fixed.add(elbow)
  fixed.add(cylinder(m.graphite, 0.72, 0.34, [-3.62, 0.38, 0], [0, 0, 0], 24))
  fixed.add(cylinder(m.steel, 0.86, 0.14, [-3.62, 0.17, 0], [0, 0, 0], 24))
  fixed.add(cylinder(m.shade, 0.94, 0.09, [-3.62, 0.065, 0], [0, 0, 0], 24))
}

function support(parent: Group, m: Materials, x: number) {
  box(parent, m.graphite, [1.1, 0.24, 1.15], [x, 0.12, 0], 0.1, 0.025)
  box(parent, m.steel, [0.88, 0.08, 0.93], [x, 0.28, 0], 0.05, 0.014)
  box(parent, m.graphite, [0.72, 0.78, 0.58], [x, 0.68, 0], 0.12, 0.03)
  box(parent, m.shell, [0.42, 0.68, 0.4], [x, 0.78, 0], 0.1, 0.025)
  box(parent, m.shade, [0.28, 0.74, 0.46], [x - 0.3, 0.7, 0], 0.08, 0.02, [0, 0, -0.38])
  box(parent, m.shade, [0.28, 0.74, 0.46], [x + 0.3, 0.7, 0], 0.08, 0.02, [0, 0, 0.38])
  box(parent, m.cyan, [0.12, 0.32, 0.08], [x, 0.68, 0.34], 0.035, 0.01)
  for (const dx of [-0.38, 0.38]) parent.add(cylinder(m.steel, 0.08, 0.12, [x + dx, 0.34, 0.36], [0, 0, 0], 10))
}

function addValveBody(fixed: Group, m: Materials) {
  box(fixed, m.shell, [2.05, 1.86, 2.08], [0, 1.92, 0], 0.4, 0.1)
  box(fixed, m.shade, [2.24, 0.26, 2.18], [0, 1.05, 0], 0.12, 0.03)
  for (const x of [-1.12, 1.12]) fixed.add(cylinder(m.graphite, 0.84, 0.4, [x, 1.82, 0], X_AXIS, 24))
  box(fixed, m.graphite, [1.28, 1.08, 0.3], [0, 1.82, 1.08], 0.2, 0.05)
  box(fixed, m.ink, [0.94, 0.75, 0.14], [0, 1.82, 1.25], 0.14, 0.035)
  fixed.add(cylinder(m.bronze, 0.11, 0.88, [0, 1.82, 1.28], X_AXIS, 12))
  box(fixed, m.amber, [0.72, 0.54, 0.06], [0, 1.82, 1.39], 0.11, 0.026)
  for (const x of [-0.52, 0.52]) box(fixed, m.amber, [0.08, 0.56, 0.07], [x, 1.82, 1.42], 0.025, 0.007)
  for (const x of [-0.48, 0.48]) for (const y of [1.42, 2.22]) fixed.add(cylinder(m.steel, 0.07, 0.11, [x, y, 1.45], FRONT, 10))
  box(fixed, m.graphite, [1.28, 0.38, 1.22], [0, 3.14, 0], 0.15, 0.038)
  fixed.add(cylinder(m.graphite, 0.58, 0.44, [0, 3.45, 0], [0, 0, 0], 24))
  fixed.add(cylinder(m.steel, 0.38, 0.5, [0, 3.78, 0], [0, 0, 0], 18))
  box(fixed, m.amber, [0.5, 0.1, 0.08], [0, 3.2, 0.64], 0.03, 0.008)
}

function addWheel(wheel: Group, m: Materials) {
  wheel.position.y = 4.08
  const rim = new Mesh(new TorusGeometry(1.18, 0.16, 10, 32), m.graphite)
  rim.rotation.x = Math.PI / 2
  wheel.add(rim)
  wheel.add(cylinder(m.graphite, 0.32, 0.25, [0, 0, 0], [0, 0, 0], 20))
  wheel.add(cylinder(m.amber, 0.18, 0.1, [0, 0.18, 0], [0, 0, 0], 14))
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2
    box(wheel, m.amber, [0.82, 0.11, 0.13], [Math.cos(a) * 0.55, 0.04, Math.sin(a) * 0.55], 0.04, 0.012, [0, -a, 0])
    box(wheel, m.amber, [0.3, 0.08, 0.08], [Math.cos(a) * 1.18, 0.08, Math.sin(a) * 1.18], 0.025, 0.007, [0, -a, 0])
  }
}

function build() {
  const { m, handles } = materials()
  const root = new Group(); root.name = 'industrial pipe valve'
  const fixed = new Group(); const wheel = new Group(); wheel.name = 'bounded valve handwheel'
  root.add(fixed, wheel)
  addPipe(fixed, m)
  support(fixed, m, -2.1); support(fixed, m, 2.55)
  addValveBody(fixed, m); addWheel(wheel, m)
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [m.shell, { rub: 0.08, grime: 0.04, scratch: 0.014 }],
    [m.shade, { rub: 0.1, grime: 0.04, scratch: 0.015 }],
    [m.graphite, { rub: 0.05, grime: 0.04, scratch: 0.01 }],
    [m.steel, { rub: 0.15, grime: 0.035, scratch: 0.02 }],
  ])
  bakeOcclusion(root, { reach: 0.18 })
  bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'industrial-pipe-valve / localized wear', clearcoat: 0.08, clearcoatRoughness: 0.56 })
  root.traverse((object) => { if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear })
  const options = { retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [], meshName: (material: { name?: string }) => material.name ?? 'pipe valve batch' }
  const geometries = [...mergeStaticByMaterial(fixed, options), ...mergeStaticByMaterial(wheel, options)]
  return { root, wheel, m, handles, wear, geometries }
}

export function createModel(): Controller {
  const result = build(); let enabled = false; let time = 0
  const listener = (value: boolean) => { enabled = value }; listeners.add(listener)
  return {
    root: result.root,
    update: (delta: number) => { if (!enabled) return; time += Math.min(Math.max(delta, 0), 0.05); result.wheel.rotation.y = Math.sin(time * 0.55) * 0.14 },
    toggleValve: (force = !enabled) => { enabled = force; return force },
    dispose: () => {
      listeners.delete(listener)
      for (const geometry of result.geometries) geometry.dispose()
      result.wear.dispose(); for (const handle of result.handles) handle.release(); result.m.bronze.dispose()
    },
  }
}

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low'; active?: boolean } = {}): Preview {
  const model = createModel(); if (options.active) { model.toggleValve(true); for (let i = 0; i < 30; i += 1) model.update(0.05) }
  const scene = new Scene(); scene.background = new Color(0x030506); scene.add(model.root, new HemisphereLight(0xcbd2d4, 0x07090c, 0.82))
  const key = new DirectionalLight(0xffead6, 2.8); key.position.set(-9, 12, 12); scene.add(key)
  const fill = new DirectionalLight(0x789bc5, 1.1); fill.position.set(11, 7, 8); scene.add(fill)
  const rim = new DirectionalLight(0x8bb3bc, 0.9); rim.position.set(7, 10, -12); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x090d10, roughness: 0.92, metalness: 0.04 }); const floorGeometry = new PlaneGeometry(18, 18)
  const floor = new Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.004; floor.userData.excludeFromExport = true; scene.add(floor)
  const camera = new PerspectiveCamera(33, options.aspect ?? 1, 0.14, 100)
  if (options.mode === 'side') camera.position.set(-10.5, 3, 0)
  else if (options.mode === 'rear') camera.position.set(8.5, 3.4, -10.5)
  else if (options.mode === 'low') camera.position.set(-8.8, 0.9, 10.2)
  else camera.position.set(-8.8, 4.4, 10.5)
  camera.lookAt(-0.1, options.mode === 'low' ? 1.7 : 2.15, 0); scene.add(camera)
  return { ...model, scene, camera, dispose: () => { floorGeometry.dispose(); floorMaterial.dispose(); model.dispose() } }
}

export const createPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
export const createToggledPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty', active: true })
