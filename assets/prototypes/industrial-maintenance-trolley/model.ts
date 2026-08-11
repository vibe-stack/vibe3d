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
  fabric: MeshPhysicalMaterial
  grime: MeshPhysicalMaterial
}

interface TrolleyController {
  root: Group
  update: (deltaSeconds: number) => void
  toggleService: (enabled?: boolean) => boolean
  dispose: () => void
}
interface Preview extends TrolleyController { scene: Scene; camera: PerspectiveCamera }

let exportedEnabled = false
const listeners = new Set<(value: boolean) => void>()

export function toggleService(enabled = !exportedEnabled): boolean {
  exportedEnabled = enabled
  for (const listener of listeners) listener(enabled)
  return exportedEnabled
}

function acquireMaterials(): { materials: Materials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 25301 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 25302 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 25303 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 25304 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 25305 })
  const rubber = library.acquire({ recipeId: 'MAT-05', palette: 'GRAPHITE-800', condition: 'worked', seed: 25306 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 25307 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 25308 })
  return {
    handles: [shell, shellShade, graphite, ink, steel, rubber, amber, cyan],
    materials: {
      shell: tuneMaterial(shell, 0xcbd0cf, 0.46, 0.28, { clearcoat: 0.13 }),
      shellShade: tuneMaterial(shellShade, 0x8e989a, 0.54, 0.42, { clearcoat: 0.08 }),
      graphite: tuneMaterial(graphite, 0x232a31, 0.54, 0.63, { clearcoat: 0.08 }),
      ink: tuneMaterial(ink, 0x07090b, 0.84, 0.1),
      steel: tuneMaterial(steel, 0x949da0, 0.3, 0.86, { clearcoat: 0.08 }),
      rubber: tuneMaterial(rubber, 0x111418, 0.92, 0.02),
      amber: tuneMaterial(amber, 0xe47708, 0.2, 0.04, { emissive: 0.72, clearcoat: 0.28 }),
      cyan: tuneMaterial(cyan, 0x34cad8, 0.22, 0.04, { emissive: 0.85, clearcoat: 0.22 }),
      fabric: new MeshPhysicalMaterial({ name: 'industrial-maintenance-trolley / grip fabric', color: 0x10151a, roughness: 0.96, metalness: 0 }),
      grime: new MeshPhysicalMaterial({ name: 'industrial-maintenance-trolley / contact grime', color: 0x1d1a17, roughness: 0.93, metalness: 0.03 }),
    },
  }
}

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.08, bevel = 0.025, rotation: Vec3 = [0, 0, 0]): Mesh {
  const mesh = prism(material, size, position, { chamfer, fillet: Math.min(0.05, Math.max(0.008, chamfer * 0.28)), bevel, rotation })
  parent.add(mesh); return mesh
}

function pipe(material: MeshPhysicalMaterial, points: Vec3[], radius: number, segments = 24): Mesh {
  return new Mesh(new TubeGeometry(new CatmullRomCurve3(points.map((p) => new Vector3(...p)), false, 'centripetal'), segments, radius, 8, false), material)
}

function boltZ(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number): void { parent.add(cylinder(material, 0.045, 0.1, [x, y, z], Z_AXIS, 8)) }

function addCasters(fixed: Group, m: Materials): void {
  for (const x of [-2.06, 2.06]) for (const z of [-0.86, 0.86]) {
    box(fixed, m.graphite, [0.52, 0.42, 0.48], [x, 0.78, z], 0.11, 0.028)
    fixed.add(cylinder(m.graphite, 0.28, 0.24, [x, 0.9, z], [0, 0, 0], 12))
    for (const dx of [-0.25, 0.25]) box(fixed, m.steel, [0.14, 0.66, 0.24], [x + dx, 0.57, z], 0.05, 0.014)
    fixed.add(cylinder(m.rubber, 0.42, 0.32, [x, 0.42, z], X_AXIS, 18))
    fixed.add(cylinder(m.steel, 0.17, 0.38, [x, 0.42, z], X_AXIS, 12))
    box(fixed, m.rubber, [0.54, 0.045, 0.16], [x, 0.0225, z], 0.05, 0.012)
  }
}

function addChassis(fixed: Group, m: Materials): void {
  box(fixed, m.graphite, [3.86, 0.58, 2.5], [0, 0.93, 0], 0.22, 0.055)
  box(fixed, m.shellShade, [3.54, 0.32, 2.18], [0, 1.24, 0], 0.17, 0.042)
  box(fixed, m.ink, [3.18, 0.14, 1.86], [0, 1.43, 0], 0.12, 0.028)
  for (const x of [-1.55, 1.55]) box(fixed, m.graphite, [0.58, 0.78, 2.48], [x, 1.12, 0], 0.14, 0.035)
  box(fixed, m.grime, [2.86, 0.05, 0.12], [0, 1.47, 1.02], 0.03, 0.008)
}

function addCabinet(fixed: Group, drawer: Group, m: Materials): void {
  // Compact dark core with disjoint pale structural faces; no hidden nested full shell.
  box(fixed, m.graphite, [3.08, 2.78, 1.72], [0, 2.9, -0.03], 0.28, 0.065)
  box(fixed, m.shell, [3.26, 2.9, 0.34], [0, 2.96, 0.92], 0.26, 0.06)
  box(fixed, m.shellShade, [3.18, 2.72, 0.24], [0, 2.96, -0.96], 0.22, 0.052)
  box(fixed, m.shell, [0.34, 2.9, 1.7], [1.62, 2.96, -0.03], 0.22, 0.052)
  box(fixed, m.shell, [0.28, 0.58, 1.7], [-1.62, 4.12, -0.03], 0.16, 0.04)
  box(fixed, m.shell, [0.28, 0.62, 1.7], [-1.62, 1.82, -0.03], 0.16, 0.04)
  // Four disjoint rails form a true deep long-side service opening around a rearward backing.
  box(fixed, m.ink, [2.36, 1.5, 0.12], [0, 2.92, 1.18], 0.17, 0.04, [-0.05, 0, 0])
  for (const y of [2.15, 3.69]) box(fixed, m.graphite, [2.82, 0.3, 0.48], [0, y, 1.43], 0.13, 0.032, [-0.05, 0, 0])
  for (const x of [-1.26, 1.26]) box(fixed, m.graphite, [0.32, 1.44, 0.48], [x, 2.92, 1.43], 0.13, 0.032, [-0.05, 0, 0])
  // Dense long-side tool bay: every tool bottoms into the bay ledge and rear backing.
  fixed.add(cylinder(m.graphite, 0.25, 0.76, [-0.86, 2.82, 1.38], [0, 0, 0], 16))
  fixed.add(cylinder(m.amber, 0.27, 0.12, [-0.86, 2.98, 1.39], [0, 0, 0], 16))
  for (const [x, h] of [[-0.32, 0.9], [0.06, 1.04], [0.44, 0.82], [0.76, 1.12]] as Array<[number, number]>) {
    box(fixed, m.graphite, [0.18, h, 0.14], [x, 2.93, 1.38], 0.045, 0.012)
    box(fixed, m.steel, [0.13, 0.18, 0.1], [x, 3.28, 1.48], 0.035, 0.01)
  }
  box(fixed, m.amber, [0.14, 1.08, 0.1], [1.08, 3.02, 1.38], 0.045, 0.012)
  box(fixed, m.graphite, [2.38, 0.18, 0.28], [0, 2.25, 1.38], 0.06, 0.016)
  box(fixed, m.graphite, [0.42, 0.2, 0.14], [0, 3.7, 1.5], 0.06, 0.016)
  box(fixed, m.steel, [0.22, 0.1, 0.1], [0, 3.73, 1.61], 0.035, 0.01)
  box(fixed, m.graphite, [1.36, 0.22, 0.18], [0, 3.66, 1.44], 0.07, 0.02)
  box(fixed, m.amber, [1.18, 0.1, 0.08], [0, 3.68, 1.56], 0.035, 0.01)
  for (const x of [-1.2, 1.2]) for (const y of [2.16, 3.72]) boltZ(fixed, m.steel, x, y, 1.53)
  // A bounded lower drawer remains mechanically captured by full side rails.
  box(fixed, m.ink, [2.72, 0.84, 0.18], [0, 1.9, 1.28], 0.13, 0.032)
  box(drawer, m.graphite, [2.44, 0.62, 0.38], [0, 1.9, 1.39], 0.12, 0.03)
  box(drawer, m.cyan, [0.72, 0.08, 0.06], [0, 1.94, 1.62], 0.03, 0.008)
  for (const x of [-1.3, 1.3]) box(fixed, m.steel, [0.14, 0.54, 0.46], [x, 1.9, 1.31], 0.04, 0.012)
}

function addSideServiceBay(fixed: Group, m: Materials): void {
  // Four frontmost rails surround a recessed end-console backing and captured cartridge.
  box(fixed, m.ink, [0.12, 1.56, 1.24], [-1.9, 3.06, 0.02], 0.17, 0.042, [0, 0, -0.08])
  for (const y of [2.2, 3.92]) box(fixed, m.graphite, [0.24, 0.3, 1.62], [-2.08, y, 0.02], 0.13, 0.032, [0, 0, -0.08])
  for (const z of [-0.67, 0.67]) box(fixed, m.graphite, [0.24, 1.48, 0.3], [-2.08, 3.06, z], 0.13, 0.032, [0, 0, -0.08])
  box(fixed, m.amber, [0.1, 0.82, 0.68], [-2.01, 3.18, 0.02], 0.14, 0.034, [0, 0, -0.08])
  box(fixed, m.graphite, [0.12, 0.22, 0.38], [-2.04, 3.72, 0.02], 0.06, 0.016)
  box(fixed, m.steel, [0.08, 0.1, 0.2], [-2.12, 3.75, 0.02], 0.035, 0.01)
  fixed.add(pipe(m.steel, [[-2.18, 2.62, -0.54], [-2.34, 2.62, -0.54], [-2.34, 2.62, 0.54], [-2.18, 2.62, 0.54]], 0.075, 18))
}

function addTopDeckAndHandle(fixed: Group, m: Materials): void {
  box(fixed, m.graphite, [3.42, 0.28, 2.2], [0, 4.54, -0.03], 0.18, 0.044)
  box(fixed, m.fabric, [2.92, 0.12, 1.72], [0, 4.75, -0.03], 0.16, 0.03)
  for (const x of [-1.5, 1.5]) box(fixed, m.graphite, [0.18, 0.44, 2.14], [x, 4.72, -0.03], 0.07, 0.018)
  fixed.add(pipe(m.steel, [[-1.38, 4.68, -0.84], [-1.5, 5.08, -0.84], [-1.18, 5.4, -0.84], [1.18, 5.4, -0.84], [1.5, 5.08, -0.84], [1.38, 4.68, -0.84]], 0.11, 36))
  box(fixed, m.fabric, [1.32, 0.26, 0.26], [0, 5.4, -0.84], 0.11, 0.03)
  for (const x of [-1.38, 1.38]) box(fixed, m.graphite, [0.34, 0.34, 0.34], [x, 4.72, -0.84], 0.08, 0.022)
}

function addRearService(fixed: Group, m: Materials): void {
  box(fixed, m.graphite, [2.58, 1.72, 0.2], [0, 3.05, -1.12], 0.17, 0.04)
  box(fixed, m.shellShade, [2.28, 1.4, 0.12], [0, 3.05, -1.25], 0.14, 0.032)
  for (let i = -3; i <= 3; i += 1) box(fixed, m.ink, [0.18, 0.72, 0.08], [i * 0.29, 3.05, -1.34], 0.035, 0.01)
}

function build(): { root: Group; drawer: Group; materials: Materials; handles: MaterialHandle[]; wear: MeshPhysicalMaterial; geometries: Array<{ dispose: () => void }> } {
  const acquired = acquireMaterials(); const m = acquired.materials
  const root = new Group(); root.name = 'industrial maintenance trolley'
  const fixed = new Group(); fixed.name = 'fixed grounded caster package'
  const body = new Group(); body.name = 'long low maintenance chassis and tool bay'
  const drawer = new Group(); drawer.name = 'bounded service drawer'
  body.scale.set(1.24, 0.9, 1)
  drawer.scale.set(1.24, 0.9, 1)
  root.add(fixed, body, drawer)
  addCasters(fixed, m); addChassis(body, m); addCabinet(body, drawer, m); addSideServiceBay(body, m); addTopDeckAndHandle(body, m); addRearService(body, m)
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [m.shell, { rub: 0.09, grime: 0.04, scratch: 0.014 }], [m.shellShade, { rub: 0.11, grime: 0.05, scratch: 0.017 }],
    [m.graphite, { rub: 0.065, grime: 0.05, scratch: 0.011 }], [m.steel, { rub: 0.17, grime: 0.04, scratch: 0.025 }],
  ])
  bakeOcclusion(root, { reach: 0.17 }); bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'industrial-maintenance-trolley / localized form wear', clearcoat: 0.08, clearcoatRoughness: 0.55 })
  root.traverse((o) => { if (o instanceof Mesh && !Array.isArray(o.material) && profiles.has(o.material)) o.material = wear })
  const options = { retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [], meshName: (material: { name?: string }): string => material.name ?? 'industrial-maintenance-trolley batch' }
  const geometries = [...mergeStaticByMaterial(fixed, options), ...mergeStaticByMaterial(body, options), ...mergeStaticByMaterial(drawer, options)]
  return { root, drawer, materials: m, handles: acquired.handles, wear, geometries }
}

export function createModel(): TrolleyController {
  const rig = build(); let enabled = false
  const listener = (value: boolean) => { enabled = value }; listeners.add(listener)
  return {
    root: rig.root,
    update: (deltaSeconds: number) => { const d = Math.min(Math.max(deltaSeconds, 0), 0.05); const target = enabled ? 0.48 : 0; const blend = 1 - Math.exp(-d * 7); rig.drawer.position.z += (target - rig.drawer.position.z) * blend },
    toggleService: (value = !enabled) => { enabled = value; return enabled },
    dispose: () => { listeners.delete(listener); for (const g of rig.geometries) g.dispose(); rig.wear.dispose(); for (const h of rig.handles) h.release(); rig.materials.fabric.dispose(); rig.materials.grime.dispose() },
  }
}

function makePreview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low'; active?: boolean } = {}): Preview {
  const model = createModel(); if (options.active) { model.toggleService(true); for (let i = 0; i < 30; i += 1) model.update(0.05) }
  const scene = new Scene(); scene.background = new Color(0x030506); scene.add(model.root); scene.add(new HemisphereLight(0xc9d0d2, 0x07090c, 0.82))
  const key = new DirectionalLight(0xffead6, 2.8); key.position.set(-7, 10, 10); scene.add(key)
  const fill = new DirectionalLight(0x769ac4, 1.15); fill.position.set(8, 6, 8); scene.add(fill)
  const rim = new DirectionalLight(0x88aeb8, 0.95); rim.position.set(7, 8, -9); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x090d10, roughness: 0.92, metalness: 0.04 }); const floorGeometry = new PlaneGeometry(16, 16)
  const floor = new Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.004; floor.userData.excludeFromExport = true; scene.add(floor)
  const camera = new PerspectiveCamera(34, options.aspect ?? 1, 0.14, 90)
  if (options.mode === 'side') camera.position.set(-8.8, 2.9, 0.2); else if (options.mode === 'rear') camera.position.set(7.8, 3.4, -7.8); else if (options.mode === 'low') camera.position.set(-7.4, 0.95, 7.3); else camera.position.set(-7.8, 4.3, 7.4)
  camera.lookAt(0, options.mode === 'low' ? 2.05 : 2.4, 0.02); scene.add(camera)
  return { ...model, scene, camera, dispose: () => { floorGeometry.dispose(); floorMaterial.dispose(); model.dispose() } }
}

export const createPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'low' })
export const createToggledPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'beauty', active: true })
