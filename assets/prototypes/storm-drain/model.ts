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

const SLOPE = -0.34
const Y_AXIS: Vec3 = [0, 0, 0]
const X_AXIS: Vec3 = [0, 0, Math.PI / 2]

interface Materials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
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
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 28401 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 28402 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 28403 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 28404 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 28405 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 28406 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 28407 })
  return {
    handles: [shell, shellShade, graphite, ink, steel, amber, cyan],
    materials: {
      shell: tuneMaterial(shell, 0xb9bfbd, 0.62, 0.2, { clearcoat: 0.06 }),
      shellShade: tuneMaterial(shellShade, 0x8b9494, 0.66, 0.34),
      graphite: tuneMaterial(graphite, 0x252c32, 0.56, 0.62, { clearcoat: 0.06 }),
      ink: tuneMaterial(ink, 0x050709, 0.84, 0.1),
      steel: tuneMaterial(steel, 0x8f989b, 0.36, 0.82),
      amber: tuneMaterial(amber, 0xd9790b, 0.2, 0.03, { emissive: 0.58, clearcoat: 0.24 }),
      cyan: tuneMaterial(cyan, 0x2699a6, 0.32, 0.06, { emissive: 0.34, clearcoat: 0.18 }),
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

function addGroundedShell(root: Group, m: Materials): void {
  box(root, m.ink, [4.92, 0.14, 3.28], [0, 0.07, 0], 0.1, 0.028)
  box(root, m.graphite, [4.72, 0.3, 3.06], [0, 0.24, 0], 0.14, 0.038)
  box(root, m.graphite, [4.28, 1.62, 2.62], [0, 1.08, -0.08], 0.3, 0.08)
  box(root, m.ink, [3.62, 1.36, 2.18], [0, 1.11, 0.04], 0.26, 0.07)
  // Broad pale shoulders close both side walls and carry the top deck.
  for (const x of [-2.05, 2.05]) {
    box(root, m.shellShade, [0.72, 1.86, 2.82], [x, 1.19, -0.06], 0.2, 0.055)
    box(root, m.shell, [0.54, 1.68, 2.62], [x, 1.27, -0.04], 0.14, 0.04)
    box(root, m.shell, [0.78, 0.36, 2.9], [x, 0.39, -0.02], 0.13, 0.036)
  }
  for (const x of [-1.86, 1.86]) {
    box(root, m.graphite, [0.78, 0.14, 0.72], [x, 0.12, 1.25], 0.08, 0.022)
    box(root, m.graphite, [0.78, 0.14, 0.72], [x, 0.12, -1.25], 0.08, 0.022)
  }
}

function addTopDeck(root: Group, m: Materials): void {
  box(root, m.shellShade, [4.12, 0.24, 2.16], [0, 2.02, -0.34], 0.22, 0.06)
  box(root, m.graphite, [3.52, 0.18, 1.7], [0, 2.18, -0.38], 0.15, 0.042)
  box(root, m.ink, [2.76, 0.1, 1.12], [0, 2.3, -0.38], 0.12, 0.034)
  box(root, m.graphite, [2.46, 0.08, 0.88], [0, 2.37, -0.38], 0.1, 0.028)
  for (const x of [-1.42, 1.42]) for (const z of [-0.92, 0.12]) {
    root.add(cylinder(m.steel, 0.055, 0.06, [x, 2.31, z], Y_AXIS, 10))
    root.add(cylinder(m.ink, 0.025, 0.07, [x, 2.35, z], Y_AXIS, 8))
  }
}

function addSlopedIntake(root: Group, m: Materials): void {
  const rotation: Vec3 = [SLOPE, 0, 0]
  // Backing first, then a four-rail load frame and seven disjoint structural bars.
  box(root, m.ink, [3.58, 1.48, 0.2], [0, 1.14, 1.18], 0.16, 0.045, rotation)
  box(root, m.graphite, [3.82, 0.18, 0.34], [0, 1.82, 0.95], 0.08, 0.022, rotation)
  box(root, m.graphite, [3.82, 0.18, 0.34], [0, 0.46, 1.42], 0.08, 0.022, rotation)
  box(root, m.graphite, [0.22, 1.5, 0.34], [-1.79, 1.14, 1.18], 0.08, 0.022, rotation)
  box(root, m.graphite, [0.22, 1.5, 0.34], [1.79, 1.14, 1.18], 0.08, 0.022, rotation)
  for (let i = -3; i <= 3; i += 1) {
    box(root, m.graphite, [0.2, 1.27, 0.28], [i * 0.48, 1.14, 1.24], 0.065, 0.018, rotation)
  }
  // Warm inner floor catches light through the real negative-space rhythm.
  box(root, m.amber, [3.18, 0.86, 0.08], [0, 1.05, 1.1], 0.08, 0.022, rotation)
  // The graphite bars sit physically in front of the amber backing.
  for (let i = -3; i <= 3; i += 1) {
    box(root, m.graphite, [0.2, 1.27, 0.1], [i * 0.48, 1.14, 1.42], 0.06, 0.018, rotation)
  }
  for (const x of [-1.64, 1.64]) for (const y of [0.52, 1.72]) {
    root.add(cylinder(m.steel, 0.04, 0.07, [x, y, 1.47 - (y - 0.52) * 0.28], [Math.PI / 2 + SLOPE, 0, 0], 8))
  }
}

function addOperationalDetails(root: Group, m: Materials): void {
  // Amber segmented status strip captured under the top deck lip.
  box(root, m.graphite, [3.5, 0.26, 0.24], [0, 1.93, 1.06], 0.08, 0.022, [SLOPE, 0, 0])
  for (let i = -5; i <= 5; i += 1) {
    box(root, m.amber, [0.23, 0.11, 0.07], [i * 0.27, 1.95, 1.21], 0.035, 0.01, [SLOPE, 0, 0])
  }
  // Three grounded front retention shoes bridge into the lower frame.
  for (const x of [-1.25, 0, 1.25]) {
    box(root, m.graphite, [0.28, 0.48, 0.46], [x, 0.38, 1.46], 0.08, 0.022, [SLOPE, 0, 0])
    box(root, m.steel, [0.1, 0.28, 0.07], [x, 0.47, 1.7], 0.035, 0.01, [SLOPE, 0, 0])
  }
  // Right-side service cassette and cyan load path witness.
  box(root, m.graphite, [0.22, 0.82, 1.06], [2.38, 1.02, -0.18], 0.12, 0.034)
  box(root, m.ink, [0.12, 0.48, 0.64], [2.52, 1.02, -0.18], 0.09, 0.026)
  root.add(cylinder(m.graphite, 0.15, 0.09, [2.61, 1.0, -0.18], X_AXIS, 12))
  root.add(cylinder(m.steel, 0.065, 0.1, [2.68, 1.0, -0.18], X_AXIS, 10))
  box(root, m.cyan, [0.07, 0.58, 0.08], [2.66, 1.4, -0.18], 0.025, 0.008)
}

function build(): {
  root: Group
  handles: MaterialHandle[]
  wear: MeshPhysicalMaterial
  geometries: Array<{ dispose: () => void }>
} {
  const acquired = acquireMaterials()
  const root = new Group()
  root.name = 'storm drain'
  addGroundedShell(root, acquired.materials)
  addTopDeck(root, acquired.materials)
  addSlopedIntake(root, acquired.materials)
  addOperationalDetails(root, acquired.materials)

  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [acquired.materials.graphite, { rub: 0.055, grime: 0.04, scratch: 0.01 }],
    [acquired.materials.steel, { rub: 0.15, grime: 0.04, scratch: 0.02 }],
  ])
  bakeOcclusion(root, { reach: 0.07 })
  bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'storm-drain / maintained metal wear', clearcoat: 0.05, clearcoatRoughness: 0.62 })
  root.traverse((object) => {
    if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear
  })
  const geometries = mergeStaticByMaterial(root, {
    retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material: { name?: string }): string => material.name ?? 'storm-drain batch',
  })
  return { root, handles: acquired.handles, wear, geometries }
}

export function createModel(): Controller {
  const built = build()
  return {
    root: built.root,
    update: () => {},
    dispose: () => {
      for (const geometry of built.geometries) geometry.dispose()
      built.wear.dispose()
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
  const rim = new DirectionalLight(0x8db4b9, 0.75); rim.position.set(5, 7, -8); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x090c0f, roughness: 0.95, metalness: 0.02 })
  const floorGeometry = new PlaneGeometry(14, 14)
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.006
  floor.userData.excludeFromExport = true
  scene.add(floor)
  const camera = new PerspectiveCamera(32, options.aspect ?? 1, 0.14, 80)
  if (options.mode === 'side') camera.position.set(-6.6, 2.5, 0)
  else if (options.mode === 'rear') camera.position.set(5.8, 3.0, -6.0)
  else if (options.mode === 'low') camera.position.set(-4.8, 0.55, 5.8)
  else camera.position.set(-8.8, 5.2, 9.8)
  camera.lookAt(0, options.mode === 'low' ? 1.0 : 1.22, 0.08)
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
