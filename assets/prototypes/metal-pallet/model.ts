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
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 72401 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 72402 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 72403 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 72404 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 72405 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 72406 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 72407 })
  return {
    handles: [shell, shellShade, graphite, ink, steel, amber, cyan],
    materials: {
      shell: tuneMaterial(shell, 0xcbd0cf, 0.46, 0.3, { clearcoat: 0.14 }),
      shellShade: tuneMaterial(shellShade, 0x899498, 0.56, 0.42),
      graphite: tuneMaterial(graphite, 0x242c34, 0.54, 0.64),
      ink: tuneMaterial(ink, 0x06090c, 0.86, 0.1),
      steel: tuneMaterial(steel, 0x9aa3a6, 0.3, 0.82),
      amber: tuneMaterial(amber, 0xd97708, 0.2, 0.06, { emissive: 0.62, clearcoat: 0.28 }),
      cyan: tuneMaterial(cyan, 0x37c8d6, 0.22, 0.05, { emissive: 0.72 }),
      grime: new MeshPhysicalMaterial({ name: 'metal-pallet / contact grime', color: 0x201c18, roughness: 0.95, metalness: 0.03 }),
    },
  }
}

function box(
  parent: Group,
  material: MeshPhysicalMaterial,
  size: Vec3,
  position: Vec3,
  chamfer = 0.08,
  bevel = 0.024,
  rotation: Vec3 = [0, 0, 0],
): Mesh {
  const mesh = prism(material, size, position, {
    chamfer,
    fillet: Math.min(0.045, Math.max(0.008, chamfer * 0.28)),
    bevel,
    rotation,
  })
  parent.add(mesh)
  return mesh
}

function frontBolt(parent: Group, material: MeshPhysicalMaterial, at: Vec3, radius = 0.055): void {
  parent.add(cylinder(material, radius, 0.075, at, [Math.PI / 2, 0, 0], 8))
}

function addBase(parent: Group, m: Materials): void {
  // Four load-bearing corners and continuous lower side rails. The center stays open.
  for (const x of [-2.22, 2.22]) for (const z of [-1.62, 1.62]) {
    box(parent, m.graphite, [0.86, 0.38, 0.78], [x, 0.19, z], 0.2, 0.052)
    box(parent, m.steel, [0.54, 0.055, 0.48], [x, 0.028, z], 0.12, 0.018)
  }
  box(parent, m.graphite, [3.56, 0.26, 0.42], [0, 0.18, -1.72], 0.09, 0.026)
  box(parent, m.graphite, [3.56, 0.26, 0.42], [0, 0.18, 1.72], 0.09, 0.026)
  box(parent, m.graphite, [0.42, 0.26, 2.52], [-2.35, 0.18, 0], 0.09, 0.026)
  box(parent, m.graphite, [0.42, 0.26, 2.52], [2.35, 0.18, 0], 0.09, 0.026)

  // Two true front-to-rear fork tunnels: four structural walls per channel, no backing slab.
  for (const x of [-1.16, 1.16]) {
    box(parent, m.ink, [1.28, 0.1, 3.0], [x, 0.07, 0], 0.045, 0.012)
    box(parent, m.graphite, [1.28, 0.12, 3.0], [x, 0.46, 0], 0.045, 0.012)
    box(parent, m.graphite, [0.12, 0.42, 3.0], [x - 0.7, 0.26, 0], 0.045, 0.012)
    box(parent, m.graphite, [0.12, 0.42, 3.0], [x + 0.7, 0.26, 0], 0.045, 0.012)
  }
  box(parent, m.grime, [4.1, 0.045, 2.96], [0, 0.035, 0], 0.02, 0.006)
}

function addPerimeter(parent: Group, m: Materials): void {
  // Broad pale armored ring, split so the fork apertures and undercuts stay legible.
  for (const x of [-2.2, 2.2]) {
    box(parent, m.shell, [0.78, 0.54, 3.48], [x, 0.57, 0], 0.23, 0.06)
    box(parent, m.shellShade, [0.2, 0.31, 2.66], [x * 1.075, 0.56, 0], 0.07, 0.02)
  }
  for (const z of [-1.56, 1.56]) {
    box(parent, m.shell, [3.64, 0.3, 0.72], [0, 0.7, z], 0.18, 0.05)
    box(parent, m.shell, [0.74, 0.3, 0.72], [0, 0.4, z], 0.15, 0.04)
    box(parent, m.shell, [0.62, 0.3, 0.72], [-1.78, 0.4, z], 0.15, 0.04)
    box(parent, m.shell, [0.62, 0.3, 0.72], [1.78, 0.4, z], 0.15, 0.04)
    box(parent, m.graphite, [3.42, 0.13, 0.18], [0, 0.82, z * 1.13], 0.055, 0.015)
  }
  for (const x of [-2.22, 2.22]) for (const z of [-1.58, 1.58]) {
    box(parent, m.shellShade, [0.68, 0.28, 0.68], [x, 0.82, z], 0.18, 0.045)
    box(parent, m.amber, [0.31, 0.1, 0.31], [x, 0.99, z], 0.1, 0.025)
    frontBolt(parent, m.steel, [x, 0.84, z + (z < 0 ? -0.36 : 0.36)], 0.05)
  }
}

function addDeck(parent: Group, m: Materials): void {
  // Four inset ribbed deck cassettes, matching the reference's dense but low-cost top rhythm.
  for (const x of [-1.08, 1.08]) for (const z of [-0.72, 0.72]) {
    box(parent, m.ink, [1.92, 0.14, 1.24], [x, 0.82, z], 0.12, 0.032)
    box(parent, m.graphite, [1.78, 0.12, 1.1], [x, 0.91, z], 0.09, 0.024)
    for (let i = -4; i <= 4; i += 1) box(parent, m.graphite, [1.56, 0.045, 0.055], [x, 0.987, z + i * 0.105], 0.018, 0.006)
  }
  box(parent, m.graphite, [0.22, 0.18, 2.92], [0, 0.96, 0], 0.06, 0.018)
  box(parent, m.graphite, [4.12, 0.18, 0.2], [0, 0.96, 0], 0.06, 0.018)
  for (const z of [-1.1, 1.1]) box(parent, m.amber, [0.08, 0.04, 0.44], [0, 1.045, z], 0.018, 0.006)
}

function addServiceHardware(parent: Group, m: Materials): void {
  // Recessed D-ring tie downs on the long face, with the lower half swallowed by the pocket.
  for (const x of [-1.73, 1.73]) {
    box(parent, m.ink, [0.5, 0.48, 0.11], [x, 0.62, 1.955], 0.12, 0.03)
    box(parent, m.graphite, [0.38, 0.34, 0.08], [x, 0.62, 2.03], 0.09, 0.022)
    const loop = new Mesh(new TorusGeometry(0.115, 0.027, 6, 14, Math.PI), m.steel)
    loop.position.set(x, 0.66, 2.09)
    loop.rotation.z = Math.PI
    parent.add(loop)
    box(parent, m.cyan, [0.08, 0.14, 0.045], [x + 0.18, 0.73, 2.09], 0.025, 0.008)
  }
  for (const z of [-1.95, 1.95]) for (const x of [-0.48, 0.48]) {
    box(parent, m.graphite, [0.44, 0.16, 0.07], [x, 0.29, z], 0.06, 0.016)
    box(parent, m.amber, [0.26, 0.065, 0.045], [x, 0.29, z + (z < 0 ? -0.045 : 0.045)], 0.025, 0.008)
  }
  for (const x of [-2.43, 2.43]) for (const z of [-0.62, 0.62]) frontBolt(parent, m.steel, [x, 0.54, z], 0.045)
}

function build() {
  const acquired = acquireMaterials()
  const root = new Group()
  root.name = 'metal pallet'
  root.userData.staticMechanism = true
  const fixed = new Group()
  root.add(fixed)
  addBase(fixed, acquired.materials)
  addPerimeter(fixed, acquired.materials)
  addDeck(fixed, acquired.materials)
  addServiceHardware(fixed, acquired.materials)

  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [acquired.materials.shell, { rub: 0.09, grime: 0.025, scratch: 0.012 }],
    [acquired.materials.shellShade, { rub: 0.08, grime: 0.03, scratch: 0.012 }],
    [acquired.materials.graphite, { rub: 0.055, grime: 0.035, scratch: 0.01 }],
    [acquired.materials.steel, { rub: 0.16, grime: 0.03, scratch: 0.02 }],
  ])
  bakeOcclusion(root, { reach: 0.13 })
  bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'metal-pallet / localized wear', clearcoat: 0.08, clearcoatRoughness: 0.58 })
  root.traverse((object) => {
    if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear
  })
  const geometries = mergeStaticByMaterial(fixed, {
    retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material: { name?: string }) => material.name ?? 'metal pallet batch',
  })
  return { root, handles: acquired.handles, materials: acquired.materials, wear, geometries }
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

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low' } = {}): Preview {
  const model = createModel()
  const scene = new Scene()
  scene.background = new Color(0x030506)
  scene.add(model.root, new HemisphereLight(0xd5d9da, 0x080b0e, 0.88))
  const key = new DirectionalLight(0xffead8, 2.8)
  key.position.set(-7, 9, 10)
  scene.add(key)
  const fill = new DirectionalLight(0x7c9ec5, 1.0)
  fill.position.set(8, 5, 7)
  scene.add(fill)
  const rim = new DirectionalLight(0x8aabb2, 0.9)
  rim.position.set(5, 6, -8)
  scene.add(rim)

  let floorGeometry: PlaneGeometry | undefined
  let floorMaterial: MeshPhysicalMaterial | undefined
  if (options.mode) {
    floorMaterial = new MeshPhysicalMaterial({ color: 0x090d10, roughness: 0.94, metalness: 0.03 })
    floorGeometry = new PlaneGeometry(14, 14)
    const floor = new Mesh(floorGeometry, floorMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.004
    floor.userData.excludeFromExport = true
    scene.add(floor)
  }

  const camera = new PerspectiveCamera(34, options.aspect ?? 1, 0.12, 60)
  if (options.mode === 'side') camera.position.set(-7.2, 2.2, 0)
  else if (options.mode === 'rear') camera.position.set(5.8, 2.4, -6.5)
  else if (options.mode === 'low') camera.position.set(-5.6, 0.58, 6.8)
  else camera.position.set(-6.7, 4.05, 8.0)
  camera.lookAt(0, options.mode === 'low' ? 0.45 : 0.62, 0)
  scene.add(camera)
  return {
    ...model,
    scene,
    camera,
    dispose: () => {
      floorGeometry?.dispose()
      floorMaterial?.dispose()
      model.dispose()
    },
  }
}

export const createPreview = (options: { aspect?: number } = {}) => preview({ ...options })
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
