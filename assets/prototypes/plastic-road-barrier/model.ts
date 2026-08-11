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

const X_AXIS: Vec3 = [0, 0, Math.PI / 2]
const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]

interface Materials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
  red: MeshPhysicalMaterial
  redGlow: MeshPhysicalMaterial
}

interface Controller {
  root: Group
  update: (deltaSeconds: number) => void
  dispose: () => void
}

interface Preview extends Controller {
  scene: Scene
  camera: PerspectiveCamera
}

function acquireMaterials(): { materials: Materials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 28501 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 28502 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 28503 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 28504 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 28505 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 28506 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 28507 })
  return {
    handles: [shell, shellShade, graphite, ink, steel, amber, cyan],
    materials: {
      shell: tuneMaterial(shell, 0xc0c5c3, 0.58, 0.2, { clearcoat: 0.08 }),
      shellShade: tuneMaterial(shellShade, 0x909897, 0.64, 0.34),
      graphite: tuneMaterial(graphite, 0x242b31, 0.56, 0.62, { clearcoat: 0.06 }),
      ink: tuneMaterial(ink, 0x06080a, 0.84, 0.1),
      steel: tuneMaterial(steel, 0x929a9c, 0.36, 0.82),
      amber: tuneMaterial(amber, 0xd58313, 0.24, 0.03, { emissive: 0.4, clearcoat: 0.22 }),
      cyan: tuneMaterial(cyan, 0x2997a4, 0.3, 0.06, { emissive: 0.34, clearcoat: 0.18 }),
      red: new MeshPhysicalMaterial({ name: 'plastic-road-barrier / hazard red paint', color: 0xb92c18, roughness: 0.42, metalness: 0.04, clearcoat: 0.12 }),
      redGlow: new MeshPhysicalMaterial({ name: 'plastic-road-barrier / hazard red lamp', color: 0xb9250e, emissive: 0x580400, emissiveIntensity: 0.3, roughness: 0.3, metalness: 0.02, clearcoat: 0.22 }),
    },
  }
}

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.06, bevel = 0.02, rotation: Vec3 = [0, 0, 0]): Mesh {
  const mesh = prism(material, size, position, {
    chamfer,
    fillet: Math.min(0.045, Math.max(0.006, chamfer * 0.3)),
    bevel,
    rotation,
  })
  parent.add(mesh)
  return mesh
}

function addStructure(root: Group, m: Materials): void {
  box(root, m.ink, [7.5, 0.14, 1.28], [0, 0.07, 0], 0.09, 0.024)
  box(root, m.graphite, [7.38, 0.58, 1.2], [0, 0.35, 0], 0.14, 0.038)
  box(root, m.shellShade, [5.98, 0.32, 1.12], [0, 0.68, 0], 0.11, 0.032)
  // End towers are continuous from the base shoulders through the top rail.
  for (const x of [-3.16, 3.16]) {
    box(root, m.shellShade, [1.06, 0.64, 1.14], [x, 0.82, 0], 0.2, 0.055)
    box(root, m.shellShade, [0.92, 1.78, 1.1], [x, 1.5, 0], 0.18, 0.05)
    box(root, m.shell, [0.72, 1.58, 1.02], [x, 1.55, 0], 0.13, 0.038)
    box(root, m.graphite, [1.18, 0.64, 1.24], [x, 0.36, 0], 0.14, 0.038)
  }
  box(root, m.shellShade, [5.78, 1.28, 0.9], [0, 1.13, -0.03], 0.18, 0.05)
  box(root, m.shell, [5.5, 1.08, 0.82], [0, 1.18, 0], 0.14, 0.04)
  box(root, m.shell, [5.68, 0.28, 0.9], [0, 2.21, 0], 0.1, 0.03)
}

function addLightBar(root: Group, m: Materials): void {
  box(root, m.ink, [5.56, 0.43, 0.14], [0, 1.91, 0.49], 0.09, 0.026)
  box(root, m.graphite, [5.2, 0.27, 0.18], [0, 1.91, 0.6], 0.08, 0.022)
  root.add(cylinder(m.redGlow, 0.1, 4.58, [0, 1.91, 0.73], X_AXIS, 12))
  for (const x of [-2.34, -1.76, -1.18, -0.59, 0, 0.59, 1.18, 1.76, 2.34]) {
    root.add(cylinder(m.graphite, 0.125, 0.055, [x, 1.91, 0.73], X_AXIS, 12))
  }
  root.add(cylinder(m.graphite, 0.15, 0.3, [-2.44, 1.91, 0.73], X_AXIS, 12))
  root.add(cylinder(m.graphite, 0.15, 0.3, [2.44, 1.91, 0.73], X_AXIS, 12))
}

function addFrontPanel(root: Group, m: Materials): void {
  box(root, m.shellShade, [5.38, 1.08, 0.12], [0, 1.08, 0.5], 0.12, 0.034)
  box(root, m.shell, [5.02, 0.88, 0.1], [0, 1.08, 0.59], 0.1, 0.028)
  for (const x of [-1.9, -0.95, 0, 0.95, 1.9]) {
    box(root, m.red, [0.6, 0.74, 0.018], [x, 1.08, 0.65], 0.018, 0.003, [0, 0, -0.42])
  }
  box(root, m.red, [0.28, 0.42, 0.018], [2.46, 0.98, 0.65], 0.016, 0.003, [0, 0, -0.42])
  for (const x of [-2.42, 2.42]) for (const y of [0.79, 1.37]) {
    root.add(cylinder(m.steel, 0.04, 0.07, [x, y, 0.72], Z_AXIS, 8))
  }
  // Lower service ports are recessed into the continuous dark base.
  for (const x of [-1.8, 1.8]) {
    box(root, m.graphite, [0.74, 0.32, 0.17], [x, 0.34, 0.66], 0.09, 0.026)
    box(root, m.ink, [0.48, 0.16, 0.09], [x, 0.34, 0.78], 0.05, 0.014)
    root.add(cylinder(m.steel, 0.045, 0.07, [x - 0.14, 0.34, 0.85], Z_AXIS, 8))
  }
}

function addTowerHardware(root: Group, m: Materials): void {
  for (const x of [-3.16, 3.16]) {
    const side = x < 0 ? -1 : 1
    box(root, m.graphite, [0.58, 0.34, 0.16], [x, 1.82, 0.57], 0.055, 0.018)
    box(root, m.ink, [0.4, 0.16, 0.08], [x, 1.82, 0.68], 0.035, 0.01)
    box(root, m.amber, [0.25, 0.13, 0.07], [x, 1.48, 0.67], 0.04, 0.012)
    box(root, m.shellShade, [0.1, 0.78, 0.54], [x + side * 0.39, 1.05, 0.04], 0.05, 0.014)
  }
  // Left side access panel and right side service witness keep rear/side views authored.
  box(root, m.graphite, [0.16, 0.78, 0.56], [-3.58, 1.12, -0.06], 0.09, 0.026)
  box(root, m.ink, [0.09, 0.48, 0.34], [-3.69, 1.12, -0.06], 0.07, 0.02)
  box(root, m.cyan, [0.04, 0.32, 0.06], [3.7, 1.13, -0.04], 0.018, 0.006)
}

function build(): {
  root: Group
  handles: MaterialHandle[]
  wear: MeshPhysicalMaterial
  materials: Materials
  geometries: Array<{ dispose: () => void }>
} {
  const acquired = acquireMaterials()
  const root = new Group()
  root.name = 'plastic road barrier'
  addStructure(root, acquired.materials)
  addLightBar(root, acquired.materials)
  addFrontPanel(root, acquired.materials)
  addTowerHardware(root, acquired.materials)

  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [acquired.materials.graphite, { rub: 0.055, grime: 0.04, scratch: 0.01 }],
    [acquired.materials.steel, { rub: 0.14, grime: 0.04, scratch: 0.018 }],
  ])
  bakeOcclusion(root, { reach: 0.06 })
  bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'plastic-road-barrier / maintained metal wear', clearcoat: 0.05, clearcoatRoughness: 0.62 })
  root.traverse((object) => {
    if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear
  })
  const geometries = mergeStaticByMaterial(root, {
    retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material: { name?: string }): string => material.name ?? 'plastic-road-barrier batch',
  })
  return { root, handles: acquired.handles, wear, materials: acquired.materials, geometries }
}

export function createModel(): Controller {
  const built = build()
  return {
    root: built.root,
    update: () => {},
    dispose: () => {
      for (const geometry of built.geometries) geometry.dispose()
      built.wear.dispose()
      built.materials.red.dispose()
      built.materials.redGlow.dispose()
      for (const handle of built.handles) handle.release()
    },
  }
}

function makePreview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low' } = {}): Preview {
  const model = createModel()
  const scene = new Scene()
  scene.background = new Color(0x020405)
  scene.add(model.root)
  scene.add(new HemisphereLight(0xc8cfce, 0x080a0c, 0.8))
  const key = new DirectionalLight(0xffead8, 2.75); key.position.set(-7, 9, 10); scene.add(key)
  const fill = new DirectionalLight(0x7698bd, 0.98); fill.position.set(8, 5, 6); scene.add(fill)
  const rim = new DirectionalLight(0x8db4b9, 0.72); rim.position.set(5, 7, -8); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x090c0f, roughness: 0.95, metalness: 0.02 })
  const floorGeometry = new PlaneGeometry(18, 12)
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.006
  floor.userData.excludeFromExport = true
  scene.add(floor)
  const camera = new PerspectiveCamera(31, options.aspect ?? 1, 0.14, 80)
  if (options.mode === 'side') camera.position.set(-8.4, 2.7, 0.05)
  else if (options.mode === 'rear') camera.position.set(6.7, 3.1, -6.8)
  else if (options.mode === 'low') camera.position.set(-6.8, 0.68, 5.8)
  else camera.position.set(-9.8, 4.5, 9.2)
  camera.lookAt(0, options.mode === 'low' ? 1.0 : 1.18, 0)
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

export const createPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'low' })
