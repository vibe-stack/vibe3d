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
  type MaterialHandle,
  type Vec3,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'

const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]

interface Materials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
  grime: MeshPhysicalMaterial
}

interface IntakeController {
  root: Group
  update: (deltaSeconds: number) => void
  toggleIntake: (enabled?: boolean) => boolean
  dispose: () => void
}

interface Preview extends IntakeController {
  scene: Scene
  camera: PerspectiveCamera
}

let exportedEnabled = false
const listeners = new Set<(value: boolean) => void>()

export function toggleIntake(enabled = !exportedEnabled): boolean {
  exportedEnabled = enabled
  for (const listener of listeners) listener(enabled)
  return exportedEnabled
}

function acquireMaterials(): { materials: Materials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 25101 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 25102 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 25103 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 25104 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 25105 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 25106 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 25107 })
  return {
    handles: [shell, shellShade, graphite, ink, steel, amber, cyan],
    materials: {
      shell: tuneMaterial(shell, 0xcbd0cf, 0.48, 0.28, { clearcoat: 0.12 }),
      shellShade: tuneMaterial(shellShade, 0x8c9698, 0.56, 0.42, { clearcoat: 0.08 }),
      graphite: tuneMaterial(graphite, 0x242b31, 0.55, 0.62, { clearcoat: 0.08 }),
      ink: tuneMaterial(ink, 0x07090b, 0.82, 0.12),
      steel: tuneMaterial(steel, 0x929b9e, 0.32, 0.84, { clearcoat: 0.08 }),
      amber: tuneMaterial(amber, 0xd86d05, 0.2, 0.04, { emissive: 0.62, clearcoat: 0.25 }),
      cyan: tuneMaterial(cyan, 0x30c9d8, 0.22, 0.04, { emissive: 0.82, clearcoat: 0.22 }),
      grime: new MeshPhysicalMaterial({ name: 'industrial-air-intake / seam grime', color: 0x1c1b18, roughness: 0.92, metalness: 0.04 }),
    },
  }
}

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.08, bevel = 0.025, rotation: Vec3 = [0, 0, 0]): Mesh {
  const mesh = prism(material, size, position, {
    chamfer,
    fillet: Math.min(0.05, Math.max(0.008, chamfer * 0.28)),
    bevel,
    rotation,
  })
  parent.add(mesh)
  return mesh
}

function boltZ(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number): void {
  parent.add(cylinder(material, 0.055, 0.1, [x, y, z], Z_AXIS, 8))
}

function addGroundedChassis(fixed: Group, m: Materials): void {
  box(fixed, m.graphite, [4.72, 0.52, 3.42], [0, 0.38, 0], 0.2, 0.05)
  box(fixed, m.ink, [3.96, 0.18, 2.7], [0, 0.12, 0], 0.12, 0.03)
  for (const x of [-1.92, 1.92]) for (const z of [-1.26, 1.26]) {
    box(fixed, m.graphite, [1.14, 0.2, 0.92], [x, 0.1, z], 0.16, 0.04)
    box(fixed, m.steel, [0.44, 0.06, 0.4], [x, 0.03, z], 0.08, 0.018)
    boltZ(fixed, m.steel, x, 0.22, z + 0.34)
  }
  box(fixed, m.shellShade, [4.18, 3.08, 2.92], [0, 2.02, -0.05], 0.48, 0.1)
  box(fixed, m.shell, [3.92, 2.82, 2.72], [0, 2.14, -0.02], 0.4, 0.09)
  box(fixed, m.graphite, [4.22, 0.38, 3.06], [0, 0.73, -0.02], 0.16, 0.04)
  for (const x of [-1.84, 1.84]) box(fixed, m.graphite, [0.42, 2.28, 0.36], [x, 1.83, 1.34], 0.12, 0.03)
}

function addFrontIntake(fixed: Group, rotor: Group, m: Materials): void {
  // The mouth is a real cavity: backing, thick throat rails, then captured louvers at separate depths.
  box(fixed, m.ink, [3.24, 2.28, 0.18], [0, 2.08, 1.14], 0.3, 0.07)
  box(fixed, m.graphite, [3.74, 0.38, 0.48], [0, 3.25, 1.48], 0.18, 0.045)
  box(fixed, m.graphite, [3.74, 0.38, 0.48], [0, 0.91, 1.48], 0.18, 0.045)
  box(fixed, m.graphite, [0.42, 2.18, 0.48], [-1.66, 2.08, 1.48], 0.17, 0.042)
  box(fixed, m.graphite, [0.42, 2.18, 0.48], [1.66, 2.08, 1.48], 0.17, 0.042)
  box(fixed, m.amber, [3.08, 1.86, 0.1], [0, 2.08, 1.3], 0.2, 0.03)
  // Two-direction welded filter lattice creates the reference's visible honeycomb-like depth.
  for (let i = -6; i <= 6; i += 1) {
    box(fixed, m.graphite, [0.055, 2.12, 0.07], [i * 0.24, 2.08, 1.43], 0.018, 0.005, [0, 0, 0.62])
    box(fixed, m.graphite, [0.055, 2.12, 0.07], [i * 0.24, 2.08, 1.45], 0.018, 0.005, [0, 0, -0.62])
  }
  box(rotor, m.graphite, [2.72, 0.1, 0.08], [0, 2.08, 1.36], 0.04, 0.012)
  for (let i = 0; i < 3; i += 1) {
    const y = 1.48 + i * 0.6
    box(fixed, m.amber, [2.94, 0.2, 0.38], [0, y, 1.66], 0.07, 0.02, [0.16, 0, 0])
    box(fixed, m.graphite, [3.12, 0.12, 0.26], [0, y - 0.15, 1.54], 0.04, 0.012)
  }
  for (const x of [-1.47, 1.47]) for (const y of [1.04, 3.12]) boltZ(fixed, m.steel, x, y, 1.74)
  box(fixed, m.graphite, [1.28, 0.42, 0.22], [0, 0.72, 1.68], 0.1, 0.026)
  box(fixed, m.amber, [0.62, 0.14, 0.1], [0, 0.74, 1.85], 0.04, 0.012)
}

function addServiceSurfaces(fixed: Group, m: Materials): void {
  // Top exhaust cassette.
  box(fixed, m.shellShade, [2.44, 0.16, 1.54], [0, 3.62, -0.15], 0.2, 0.04)
  box(fixed, m.graphite, [2.08, 0.14, 1.2], [0, 3.72, -0.15], 0.16, 0.035)
  box(fixed, m.ink, [1.82, 0.08, 0.96], [0, 3.81, -0.15], 0.12, 0.022)
  for (let i = -3; i <= 3; i += 1) box(fixed, m.graphite, [0.14, 0.12, 0.88], [i * 0.24, 3.87, -0.15], 0.035, 0.01)
  // Side access panels, buttresses and cooling slots.
  for (const x of [-2.0, 2.0]) {
    box(fixed, m.graphite, [0.18, 1.76, 1.56], [x, 2.03, -0.18], 0.18, 0.04)
    box(fixed, m.shellShade, [0.13, 1.4, 1.22], [x + (x < 0 ? -0.08 : 0.08), 2.02, -0.18], 0.13, 0.032)
    for (const y of [1.54, 2.06, 2.58]) box(fixed, m.ink, [0.08, 0.16, 0.64], [x + (x < 0 ? -0.16 : 0.16), y, -0.18], 0.04, 0.012)
    box(fixed, m.graphite, [0.42, 1.54, 0.48], [x, 1.28, 0.94], 0.12, 0.03, [0, 0, x < 0 ? -0.18 : 0.18])
  }
  box(fixed, m.cyan, [0.54, 0.12, 0.1], [-1.56, 0.88, 1.58], 0.04, 0.012)
  box(fixed, m.grime, [2.8, 0.06, 0.12], [0, 0.68, 1.49], 0.03, 0.008)
}

function build(): {
  root: Group
  rotor: Group
  materials: Materials
  handles: MaterialHandle[]
  wear: MeshPhysicalMaterial
  geometries: Array<{ dispose: () => void }>
} {
  const acquired = acquireMaterials()
  const m = acquired.materials
  const root = new Group()
  root.name = 'industrial air intake'
  const fixed = new Group()
  fixed.name = 'fixed armored intake chassis'
  const rotor = new Group()
  rotor.name = 'bounded internal intake rotor'
  root.add(fixed, rotor)
  addGroundedChassis(fixed, m)
  addFrontIntake(fixed, rotor, m)
  addServiceSurfaces(fixed, m)

  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [m.shell, { rub: 0.065, grime: 0.028, scratch: 0.01 }],
    [m.shellShade, { rub: 0.08, grime: 0.038, scratch: 0.012 }],
    [m.graphite, { rub: 0.045, grime: 0.035, scratch: 0.008 }],
    [m.steel, { rub: 0.16, grime: 0.04, scratch: 0.022 }],
  ])
  bakeOcclusion(root, { reach: 0.16 })
  bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'industrial-air-intake / localized form wear', clearcoat: 0.08, clearcoatRoughness: 0.55 })
  root.traverse((object) => {
    if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear
  })
  const options = {
    retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material: { name?: string }): string => material.name ?? 'industrial-air-intake batch',
  }
  const geometries = [...mergeStaticByMaterial(fixed, options), ...mergeStaticByMaterial(rotor, options)]
  return { root, rotor, materials: m, handles: acquired.handles, wear, geometries }
}

export function createModel(): IntakeController {
  const rig = build()
  let enabled = false
  const listener = (value: boolean) => { enabled = value }
  listeners.add(listener)
  return {
    root: rig.root,
    update: (deltaSeconds: number) => {
      if (!enabled) return
      rig.rotor.rotation.z += Math.min(Math.max(deltaSeconds, 0), 0.05) * 1.1
    },
    toggleIntake: (value = !enabled) => { enabled = value; return enabled },
    dispose: () => {
      listeners.delete(listener)
      for (const geometry of rig.geometries) geometry.dispose()
      rig.wear.dispose()
      for (const handle of rig.handles) handle.release()
      rig.materials.grime.dispose()
    },
  }
}

function makePreview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low'; active?: boolean } = {}): Preview {
  const model = createModel()
  if (options.active) {
    model.toggleIntake(true)
    for (let i = 0; i < 30; i += 1) model.update(0.05)
  }
  const scene = new Scene()
  scene.background = new Color(0x030506)
  scene.add(model.root)
  scene.add(new HemisphereLight(0xc9d0d2, 0x07090c, 0.82))
  const key = new DirectionalLight(0xffead6, 2.8); key.position.set(-7, 9, 10); scene.add(key)
  const fill = new DirectionalLight(0x789bc5, 1.1); fill.position.set(8, 5, 7); scene.add(fill)
  const rim = new DirectionalLight(0x8bb3bc, 0.9); rim.position.set(6, 7, -8); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x090d10, roughness: 0.92, metalness: 0.04 })
  const floorGeometry = new PlaneGeometry(14, 14)
  const floor = new Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.004; floor.userData.excludeFromExport = true; scene.add(floor)
  const camera = new PerspectiveCamera(34, options.aspect ?? 1, 0.14, 80)
  if (options.mode === 'side') camera.position.set(-7.2, 2.8, 0.1)
  else if (options.mode === 'rear') camera.position.set(6.4, 3.3, -7.5)
  else if (options.mode === 'low') camera.position.set(-5.8, 0.95, 7.2)
  else camera.position.set(-5.6, 3.8, 7.6)
  camera.lookAt(0, options.mode === 'low' ? 1.75 : 2.05, 0.05)
  scene.add(camera)
  return { ...model, scene, camera, dispose: () => { floorGeometry.dispose(); floorMaterial.dispose(); model.dispose() } }
}

export const createPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'low' })
export const createToggledPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'beauty', active: true })
