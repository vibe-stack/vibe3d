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
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'maintained', seed: 28201 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'maintained', seed: 28202 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 28203 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 28204 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 28205 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 28206 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 28207 })
  return {
    handles: [shell, shellShade, graphite, ink, steel, amber, cyan],
    materials: {
      shell: tuneMaterial(shell, 0xbcc2c1, 0.56, 0.24, { clearcoat: 0.08 }),
      shellShade: tuneMaterial(shellShade, 0x8e9798, 0.62, 0.38, { clearcoat: 0.05 }),
      graphite: tuneMaterial(graphite, 0x242b31, 0.52, 0.66, { clearcoat: 0.08 }),
      ink: tuneMaterial(ink, 0x06080a, 0.82, 0.12),
      steel: tuneMaterial(steel, 0x90999c, 0.34, 0.82, { clearcoat: 0.08 }),
      amber: tuneMaterial(amber, 0xd97b0d, 0.2, 0.03, { emissive: 0.68, clearcoat: 0.28 }),
      cyan: tuneMaterial(cyan, 0x237c88, 0.34, 0.1, { emissive: 0.24, clearcoat: 0.16 }),
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

function boltZ(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number): void {
  parent.add(cylinder(material, 0.042, 0.08, [x, y, z], Z_AXIS, 8))
}

function addChassis(root: Group, m: Materials): void {
  box(root, m.ink, [7.9, 0.14, 1.84], [0, 0.07, 0], 0.08, 0.02)
  box(root, m.graphite, [7.76, 0.28, 1.72], [0, 0.22, 0], 0.11, 0.03)
  // Continuous inner body makes the drain closed from side/rear/low views.
  box(root, m.graphite, [7.46, 0.58, 1.5], [0, 0.48, 0], 0.16, 0.045)
  // Four broad armored end shoulders tie shell panels into the base.
  for (const x of [-3.63, 3.63]) {
    box(root, m.shellShade, [0.5, 0.68, 1.72], [x, 0.48, 0], 0.1, 0.032)
    box(root, m.shell, [0.38, 0.54, 1.6], [x, 0.53, 0], 0.075, 0.024)
  }
}

function addTopGrille(root: Group, m: Materials): void {
  // Backed cavity, thick perimeter, then disjoint grate ribs: no coplanar slot decals.
  box(root, m.ink, [7.05, 0.16, 1.33], [0, 0.77, 0], 0.16, 0.04)
  box(root, m.graphite, [7.18, 0.22, 0.24], [0, 0.83, -0.66], 0.07, 0.02)
  box(root, m.graphite, [7.18, 0.22, 0.24], [0, 0.83, 0.66], 0.07, 0.02)
  box(root, m.graphite, [0.3, 0.22, 1.22], [-3.43, 0.83, 0], 0.07, 0.02)
  box(root, m.graphite, [0.3, 0.22, 1.22], [3.43, 0.83, 0], 0.07, 0.02)
  for (let i = -15; i <= 15; i += 1) {
    box(root, m.graphite, [0.1, 0.16, 1.02], [i * 0.216, 0.87, 0], 0.04, 0.012)
  }
  for (const x of [-3.2, -2.1, -1.0, 0, 1.0, 2.1, 3.2]) {
    root.add(cylinder(m.ink, 0.07, 0.045, [x, 0.91, -0.69], [0, 0, 0], 10))
    root.add(cylinder(m.steel, 0.03, 0.04, [x, 0.925, -0.69], [0, 0, 0], 8))
    root.add(cylinder(m.ink, 0.07, 0.045, [x, 0.91, 0.69], [0, 0, 0], 10))
    root.add(cylinder(m.steel, 0.03, 0.04, [x, 0.925, 0.69], [0, 0, 0], 8))
  }
  // A narrow cyan service witness follows the front grille rail.
  for (const x of [-2.8, 2.8]) box(root, m.cyan, [0.72, 0.012, 0.018], [x, 0.94, 0.775], 0.006, 0.002)
}

function addLongSide(root: Group, m: Materials, front: boolean): void {
  const z = front ? 0.78 : -0.78
  const face = front ? 1 : -1
  for (const x of [-2.3, 0, 2.3]) {
    box(root, m.shell, [2.26, 0.5, 0.2], [x, 0.5, z], 0.12, 0.034)
    box(root, m.shellShade, [1.92, 0.1, 0.1], [x, 0.29, z + face * 0.11], 0.035, 0.01)
  }
  for (const x of [-1.22, 1.22]) box(root, m.graphite, [0.2, 0.48, 0.24], [x, 0.49, z + face * 0.08], 0.055, 0.016)
  if (front) {
    // Three amber marker cassettes seated into the upper side rail.
    for (const x of [-2.3, 0, 2.3]) {
      box(root, m.graphite, [0.84, 0.21, 0.22], [x, 0.72, 0.84], 0.075, 0.02)
      box(root, m.amber, [0.62, 0.095, 0.08], [x, 0.73, 0.99], 0.04, 0.011)
    }
    // Recessed lower service ports and fasteners.
    box(root, m.graphite, [0.42, 0.3, 0.06], [0.82, 0.42, 0.895], 0.07, 0.02)
    root.add(cylinder(m.ink, 0.07, 0.06, [0.82, 0.43, 0.93], Z_AXIS, 12))
    for (const x of [-1.22, 1.22]) {
      boltZ(root, m.steel, x, 0.59, 0.92)
      boltZ(root, m.steel, x, 0.39, 0.92)
    }
    // Physical cyan hazard strips at the outer armor panels.
    for (const baseX of [-3.0, 2.72]) {
      for (let i = 0; i < 4; i += 1) {
        box(root, m.cyan, [0.07, 0.24, 0.035], [baseX + i * 0.13, 0.48, 0.905], 0.018, 0.006, [0, 0, -0.42])
      }
    }
  } else {
    box(root, m.graphite, [1.52, 0.26, 0.12], [1.75, 0.48, -0.96], 0.07, 0.018)
    box(root, m.shellShade, [1.16, 0.12, 0.08], [1.75, 0.48, -1.07], 0.04, 0.012)
  }
}

function addEndFaces(root: Group, m: Materials): void {
  // Left drainage throat: pale outer arch at the endpoint, dark liner behind it,
  // and an ink backing farther inside. The depth order is visible from the hero view.
  box(root, m.ink, [0.1, 0.54, 1.08], [-3.48, 0.47, 0], 0.1, 0.028)
  box(root, m.graphite, [0.18, 0.18, 1.38], [-3.9, 0.73, 0], 0.06, 0.018)
  box(root, m.graphite, [0.18, 0.52, 0.18], [-3.9, 0.49, -0.6], 0.06, 0.018)
  box(root, m.graphite, [0.18, 0.52, 0.18], [-3.9, 0.49, 0.6], 0.06, 0.018)
  box(root, m.shell, [0.2, 0.2, 1.58], [-4.05, 0.78, 0], 0.07, 0.02)
  box(root, m.shell, [0.2, 0.66, 0.2], [-4.05, 0.49, -0.69], 0.07, 0.02)
  box(root, m.shell, [0.2, 0.66, 0.2], [-4.05, 0.49, 0.69], 0.07, 0.02)
  box(root, m.cyan, [0.025, 0.025, 1.18], [-4.16, 0.7, 0], 0.006, 0.002)
  box(root, m.cyan, [0.025, 0.42, 0.025], [-4.16, 0.49, -0.56], 0.006, 0.002)
  box(root, m.cyan, [0.025, 0.42, 0.025], [-4.16, 0.49, 0.56], 0.006, 0.002)
  // Right end is a closed bolted service plate.
  box(root, m.graphite, [0.18, 0.42, 1.18], [3.9, 0.5, 0], 0.1, 0.028)
  box(root, m.shellShade, [0.11, 0.28, 0.88], [4.01, 0.5, 0], 0.08, 0.022)
}

function build(): {
  root: Group
  handles: MaterialHandle[]
  wear: MeshPhysicalMaterial
  geometries: Array<{ dispose: () => void }>
} {
  const acquired = acquireMaterials()
  const root = new Group()
  root.name = 'trench drain'
  addChassis(root, acquired.materials)
  addTopGrille(root, acquired.materials)
  addLongSide(root, acquired.materials, true)
  addLongSide(root, acquired.materials, false)
  addEndFaces(root, acquired.materials)

  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [acquired.materials.shell, { rub: 0.05, grime: 0.025, scratch: 0.009 }],
    [acquired.materials.shellShade, { rub: 0.06, grime: 0.03, scratch: 0.01 }],
    [acquired.materials.steel, { rub: 0.14, grime: 0.04, scratch: 0.02 }],
  ])
  bakeOcclusion(root, { reach: 0.04 })
  bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'trench-drain / maintained roadway wear', clearcoat: 0.07, clearcoatRoughness: 0.6 })
  root.traverse((object) => {
    if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear
  })
  const geometries = mergeStaticByMaterial(root, {
    retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material: { name?: string }): string => material.name ?? 'trench-drain batch',
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
  scene.add(new HemisphereLight(0xcbd2d2, 0x07090b, 0.82))
  const key = new DirectionalLight(0xffead8, 2.7); key.position.set(-7, 8, 9); scene.add(key)
  const fill = new DirectionalLight(0x7399c0, 1.05); fill.position.set(8, 4, 6); scene.add(fill)
  const rim = new DirectionalLight(0x8db6bd, 0.78); rim.position.set(5, 6, -8); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x090c0f, roughness: 0.94, metalness: 0.03 })
  const floorGeometry = new PlaneGeometry(18, 12)
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.006
  floor.userData.excludeFromExport = true
  scene.add(floor)
  const camera = new PerspectiveCamera(30, options.aspect ?? 1, 0.12, 80)
  if (options.mode === 'side') camera.position.set(-8.8, 1.7, 0.05)
  else if (options.mode === 'rear') camera.position.set(6.8, 2.4, -6.4)
  else if (options.mode === 'low') camera.position.set(-6.8, 0.38, 5.6)
  else camera.position.set(-10.6, 5.25, 9.35)
  camera.lookAt(0, options.mode === 'low' ? 0.38 : 0.52, 0)
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
