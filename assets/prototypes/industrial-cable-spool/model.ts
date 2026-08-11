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
  cable: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
  grime: MeshPhysicalMaterial
}

interface SpoolController {
  root: Group
  update: (deltaSeconds: number) => void
  toggleSpool: (enabled?: boolean) => boolean
  dispose: () => void
}

interface Preview extends SpoolController { scene: Scene; camera: PerspectiveCamera }

let exportedEnabled = false
const listeners = new Set<(value: boolean) => void>()

export function toggleSpool(enabled = !exportedEnabled): boolean {
  exportedEnabled = enabled
  for (const listener of listeners) listener(enabled)
  return exportedEnabled
}

function acquireMaterials(): { materials: Materials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 25201 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 25202 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 25203 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 25204 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 25205 })
  const cable = library.acquire({ recipeId: 'MAT-07', palette: 'AMBER-400', condition: 'worked', seed: 25206 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 25207 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 25208 })
  return {
    handles: [shell, shellShade, graphite, ink, steel, cable, amber, cyan],
    materials: {
      shell: tuneMaterial(shell, 0xcbd0cf, 0.47, 0.3, { clearcoat: 0.12 }),
      shellShade: tuneMaterial(shellShade, 0x8f989a, 0.54, 0.42, { clearcoat: 0.08 }),
      graphite: tuneMaterial(graphite, 0x232a30, 0.53, 0.64, { clearcoat: 0.08 }),
      ink: tuneMaterial(ink, 0x080a0c, 0.82, 0.12),
      steel: tuneMaterial(steel, 0x929b9e, 0.3, 0.86, { clearcoat: 0.08 }),
      cable: tuneMaterial(cable, 0xd97708, 0.48, 0.06, { clearcoat: 0.18 }),
      amber: tuneMaterial(amber, 0xef7e08, 0.2, 0.04, { emissive: 0.76, clearcoat: 0.26 }),
      cyan: tuneMaterial(cyan, 0x35d0de, 0.22, 0.04, { emissive: 0.9, clearcoat: 0.22 }),
      grime: new MeshPhysicalMaterial({ name: 'industrial-cable-spool / contact grime', color: 0x1c1a17, roughness: 0.92, metalness: 0.04 }),
    },
  }
}

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.08, bevel = 0.025, rotation: Vec3 = [0, 0, 0]): Mesh {
  const mesh = prism(material, size, position, { chamfer, fillet: Math.min(0.05, Math.max(0.008, chamfer * 0.28)), bevel, rotation })
  parent.add(mesh)
  return mesh
}

function pipe(material: MeshPhysicalMaterial, points: Vec3[], radius: number, segments = 28): Mesh {
  return new Mesh(new TubeGeometry(new CatmullRomCurve3(points.map((p) => new Vector3(...p)), false, 'centripetal'), segments, radius, 8, false), material)
}

function boltZ(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number): void {
  parent.add(cylinder(material, 0.055, 0.11, [x, y, z], Z_AXIS, 8))
}

function addBase(fixed: Group, m: Materials): void {
  box(fixed, m.graphite, [5.72, 0.5, 3.25], [0, 0.35, 0], 0.2, 0.05)
  box(fixed, m.shellShade, [5.22, 0.28, 2.7], [0, 0.68, 0], 0.16, 0.04)
  box(fixed, m.ink, [3.36, 0.15, 2.08], [0, 0.82, 0], 0.12, 0.03)
  for (const x of [-2.45, 2.45]) for (const z of [-1.18, 1.18]) {
    box(fixed, m.graphite, [0.94, 0.2, 0.72], [x, 0.1, z], 0.14, 0.035)
    box(fixed, m.steel, [0.36, 0.06, 0.34], [x, 0.03, z], 0.08, 0.016)
  }
  box(fixed, m.cyan, [1.02, 0.12, 0.12], [0, 0.56, 1.68], 0.04, 0.012)
}

function addTower(fixed: Group, m: Materials, x: number): void {
  const sign = Math.sign(x)
  // Four disjoint load members form a true open tower around the axle instead of a masking slab.
  for (const z of [-1.12, 1.12]) {
    box(fixed, m.graphite, [0.74, 2.74, 0.56], [x, 2.3, z], 0.2, 0.05)
    box(fixed, m.shell, [0.52, 2.42, 0.38], [x - sign * 0.08, 2.38, z], 0.16, 0.04)
  }
  box(fixed, m.graphite, [0.74, 0.58, 2.5], [x, 0.98, 0], 0.17, 0.042)
  box(fixed, m.graphite, [0.74, 0.58, 2.5], [x, 3.74, 0], 0.17, 0.042)
  box(fixed, m.shell, [0.52, 0.34, 2.22], [x - sign * 0.08, 3.78, 0], 0.13, 0.032)
  box(fixed, m.shellShade, [0.18, 2.26, 0.32], [x - sign * 0.4, 2.35, -1.12], 0.1, 0.026)
  box(fixed, m.amber, [0.18, 0.38, 0.12], [x - sign * 0.4, 3.91, 1.41], 0.05, 0.014)
  for (const y of [1.18, 3.36]) for (const z of [-1.0, 1.0]) boltZ(fixed, m.steel, x - sign * 0.4, y, z)
}

function addDrum(fixed: Group, drum: Group, m: Materials): void {
  // All drum and winding parts share one captured rotating group around the X axle.
  drum.position.y = 2.48
  drum.add(cylinder(m.ink, 1.16, 3.4, [0, 0, 0], X_AXIS, 24))
  for (const x of [-1.74, 1.74]) {
    drum.add(cylinder(m.graphite, 1.68, 0.28, [x, 0, 0], X_AXIS, 24))
    drum.add(cylinder(m.shellShade, 1.77, 0.18, [x + (x < 0 ? -0.18 : 0.18), 0, 0], X_AXIS, 24))
    drum.add(cylinder(m.shell, 1.64, 0.12, [x + (x < 0 ? -0.3 : 0.3), 0, 0], X_AXIS, 24))
  }
  for (let i = 0; i < 20; i += 1) {
    const torus = new Mesh(new TorusGeometry(1.29, 0.105, 6, 24), m.cable)
    torus.rotation.y = Math.PI / 2
    torus.position.x = -1.42 + i * 0.15
    drum.add(torus)
  }
  // Fixed axle collars physically capture both sides of the rotating package.
  fixed.add(cylinder(m.steel, 0.28, 4.6, [0, 2.48, 0], X_AXIS, 16))
  for (const x of [-2.14, 2.14]) {
    fixed.add(cylinder(m.ink, 0.68, 0.34, [x, 2.48, 0], X_AXIS, 20))
    fixed.add(cylinder(m.graphite, 0.5, 0.46, [x + (x < 0 ? -0.12 : 0.12), 2.48, 0], X_AXIS, 20))
  }
  fixed.add(cylinder(m.graphite, 0.32, 0.54, [-2.5, 2.48, 0], X_AXIS, 16))
  fixed.add(cylinder(m.amber, 0.22, 0.18, [-2.8, 2.48, 0], X_AXIS, 16))
}

function addGuidesAndPayout(fixed: Group, m: Materials): void {
  // Top guide spans both towers and terminates inside four collar blocks.
  box(fixed, m.steel, [4.32, 0.18, 0.18], [0, 4.2, 0.7], 0.06, 0.016)
  for (const x of [-2.18, -1.84, 1.84, 2.18]) box(fixed, m.graphite, [0.32, 0.42, 0.42], [x, 4.2, 0.7], 0.08, 0.022)
  // Continuous payout cable runs from the left swivel to a grounded service elbow.
  fixed.add(pipe(m.cable, [[-2.78, 2.48, 0], [-3.1, 2.35, 0.3], [-3.25, 1.55, 0.78], [-3.15, 0.62, 0.94]], 0.13, 32))
  for (const p of [[-2.78, 2.48, 0], [-3.15, 0.62, 0.94]] as Vec3[]) {
    fixed.add(cylinder(m.graphite, 0.23, 0.34, p, X_AXIS, 16))
  }
  box(fixed, m.graphite, [0.72, 0.34, 0.72], [-3.15, 0.26, 0.94], 0.12, 0.03)
  box(fixed, m.steel, [0.36, 0.08, 0.34], [-3.15, 0.04, 0.94], 0.08, 0.018)
  box(fixed, m.grime, [3.8, 0.05, 0.12], [0, 0.88, 1.34], 0.03, 0.008)
}

function build(): { root: Group; drum: Group; materials: Materials; handles: MaterialHandle[]; wear: MeshPhysicalMaterial; geometries: Array<{ dispose: () => void }> } {
  const acquired = acquireMaterials(); const m = acquired.materials
  const root = new Group(); root.name = 'industrial cable spool'
  const fixed = new Group(); fixed.name = 'fixed spool chassis and axle capture'
  const drum = new Group(); drum.name = 'bounded rotating drum and cable windings'
  root.add(fixed, drum)
  addBase(fixed, m); addTower(fixed, m, -2.18); addTower(fixed, m, 2.18); addDrum(fixed, drum, m); addGuidesAndPayout(fixed, m)
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [m.shell, { rub: 0.1, grime: 0.04, scratch: 0.016 }], [m.shellShade, { rub: 0.12, grime: 0.05, scratch: 0.018 }],
    [m.graphite, { rub: 0.07, grime: 0.05, scratch: 0.012 }], [m.steel, { rub: 0.18, grime: 0.04, scratch: 0.024 }],
  ])
  bakeOcclusion(root, { reach: 0.18 }); bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'industrial-cable-spool / localized form wear', clearcoat: 0.08, clearcoatRoughness: 0.55 })
  root.traverse((o) => { if (o instanceof Mesh && !Array.isArray(o.material) && profiles.has(o.material)) o.material = wear })
  const options = { retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [], meshName: (material: { name?: string }): string => material.name ?? 'industrial-cable-spool batch' }
  const geometries = [...mergeStaticByMaterial(fixed, options), ...mergeStaticByMaterial(drum, options)]
  return { root, drum, materials: m, handles: acquired.handles, wear, geometries }
}

export function createModel(): SpoolController {
  const rig = build(); let enabled = false
  const listener = (value: boolean) => { enabled = value }; listeners.add(listener)
  return {
    root: rig.root,
    update: (deltaSeconds: number) => { if (enabled) rig.drum.rotation.x += Math.min(Math.max(deltaSeconds, 0), 0.05) * 0.45 },
    toggleSpool: (value = !enabled) => { enabled = value; return enabled },
    dispose: () => { listeners.delete(listener); for (const g of rig.geometries) g.dispose(); rig.wear.dispose(); for (const h of rig.handles) h.release(); rig.materials.grime.dispose() },
  }
}

function makePreview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low'; active?: boolean } = {}): Preview {
  const model = createModel(); if (options.active) { model.toggleSpool(true); for (let i = 0; i < 30; i += 1) model.update(0.05) }
  const scene = new Scene(); scene.background = new Color(0x030506); scene.add(model.root); scene.add(new HemisphereLight(0xc9d0d2, 0x07090c, 0.82))
  const key = new DirectionalLight(0xffead6, 2.8); key.position.set(-8, 10, 10); scene.add(key)
  const fill = new DirectionalLight(0x769ac4, 1.15); fill.position.set(9, 6, 8); scene.add(fill)
  const rim = new DirectionalLight(0x88aeb8, 0.95); rim.position.set(7, 8, -9); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x090d10, roughness: 0.92, metalness: 0.04 }); const floorGeometry = new PlaneGeometry(18, 18)
  const floor = new Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.004; floor.userData.excludeFromExport = true; scene.add(floor)
  const camera = new PerspectiveCamera(34, options.aspect ?? 1, 0.14, 90)
  if (options.mode === 'side') camera.position.set(-8.5, 3.2, 0.1); else if (options.mode === 'rear') camera.position.set(7.6, 3.8, -8.8); else if (options.mode === 'low') camera.position.set(-7.2, 1.0, 8.2); else camera.position.set(-6.2, 4.7, 9.8)
  camera.lookAt(-0.15, options.mode === 'low' ? 2.0 : 2.35, 0.05); scene.add(camera)
  return { ...model, scene, camera, dispose: () => { floorGeometry.dispose(); floorMaterial.dispose(); model.dispose() } }
}

export const createPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'low' })
export const createToggledPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'beauty', active: true })
