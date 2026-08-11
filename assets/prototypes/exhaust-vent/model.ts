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
  cylinder,
  mergeStaticByMaterial,
  prism,
  tuneMaterial,
  type MaterialHandle,
  type Vec3,
} from '../../../src/asset-forge/generator/index.ts'

const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]

interface Materials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  graphiteShade: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  amberDim: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
}

interface VentController {
  root: Group
  update: (deltaSeconds: number) => void
  dispose: () => void
}

interface Preview extends VentController {
  scene: Scene
  camera: PerspectiveCamera
}

function acquireMaterials(): { materials: Materials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 38601 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 38602 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 38603 })
  const graphiteShade = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-900', condition: 'maintained', seed: 38604 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 38605 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 38606 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 38607 })
  const amberDim = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-500', condition: 'maintained', seed: 38608 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 38609 })
  return {
    handles: [shell, shellShade, graphite, graphiteShade, ink, steel, amber, amberDim, cyan],
    materials: {
      shell: tuneMaterial(shell, 0xd7d9d7, 0.43, 0.24, { clearcoat: 0.14 }),
      shellShade: tuneMaterial(shellShade, 0x929a9c, 0.53, 0.4, { clearcoat: 0.08 }),
      graphite: tuneMaterial(graphite, 0x252b31, 0.5, 0.58, { clearcoat: 0.1 }),
      graphiteShade: tuneMaterial(graphiteShade, 0x101419, 0.67, 0.42, { clearcoat: 0.05 }),
      ink: tuneMaterial(ink, 0x020304, 0.86, 0.06),
      steel: tuneMaterial(steel, 0x7c858b, 0.34, 0.84, { clearcoat: 0.08 }),
      amber: tuneMaterial(amber, 0xef8805, 0.16, 0.02, { emissive: 0.74, clearcoat: 0.27 }),
      amberDim: tuneMaterial(amberDim, 0x653103, 0.42, 0.03, { emissive: 0.1, clearcoat: 0.12 }),
      cyan: tuneMaterial(cyan, 0x43d6df, 0.19, 0.03, { emissive: 0.72, clearcoat: 0.2 }),
    },
  }
}

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.08, bevel = 0.025, rotation: Vec3 = [0, 0, 0]): Mesh {
  const mesh = prism(material, size, position, {
    chamfer,
    fillet: Math.min(0.06, Math.max(0.008, chamfer * 0.28)),
    bevel,
    rotation,
  })
  parent.add(mesh)
  return mesh
}

function bolt(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number, radius = 0.085): void {
  parent.add(cylinder(material, radius, 0.1, [x, y, z], Z_AXIS, 10))
}

function addBackplate(parent: Group, m: Materials): void {
  box(parent, m.shellShade, [5.8, 5.25, 0.28], [0, 2.625, -0.76], 0.32, 0.075)
  box(parent, m.shell, [5.56, 5.02, 0.22], [0, 2.625, -0.56], 0.28, 0.065)
  box(parent, m.graphiteShade, [4.72, 4.42, 0.18], [0, 2.62, -0.35], 0.28, 0.065)
  for (const x of [-2.5, 2.5]) for (const y of [0.4, 4.85]) {
    box(parent, m.shellShade, [0.38, 0.38, 0.12], [x, y, -0.24], 0.1, 0.025)
    bolt(parent, m.steel, x, y, -0.13, 0.095)
    bolt(parent, m.ink, x, y, -0.05, 0.042)
  }
  box(parent, m.graphite, [2.34, 0.14, 0.14], [0, 5.06, -0.3], 0.05, 0.012)
}

function addHood(parent: Group, m: Materials): void {
  box(parent, m.graphiteShade, [4.46, 4.36, 1.12], [0.05, 2.62, 0.16], 0.5, 0.11)
  // Pale load shell uses independent top and side masses around the genuine front aperture.
  box(parent, m.shellShade, [4.24, 0.98, 1.9], [0.05, 4.15, 0.72], 0.34, 0.082, [-0.1, 0, 0])
  box(parent, m.shell, [3.86, 0.64, 1.76], [0.05, 4.34, 0.83], 0.26, 0.065, [-0.1, 0, 0])
  box(parent, m.shellShade, [0.88, 3.42, 1.82], [-1.78, 2.72, 0.72], 0.32, 0.078, [0, 0, -0.07])
  box(parent, m.shellShade, [0.88, 3.42, 1.82], [1.88, 2.72, 0.72], 0.32, 0.078, [0, 0, 0.07])
  box(parent, m.shell, [0.58, 2.98, 1.7], [-1.74, 2.74, 0.84], 0.24, 0.06)
  box(parent, m.shell, [0.58, 2.98, 1.7], [1.84, 2.74, 0.84], 0.24, 0.06)
  // Dark lower plinth joins both cheeks and captures the bottom connector.
  box(parent, m.graphiteShade, [4.08, 0.92, 1.42], [0.05, 0.96, 0.6], 0.28, 0.07)
  box(parent, m.graphite, [3.7, 0.58, 1.36], [0.05, 1.12, 0.7], 0.2, 0.05)
}

function addFilter(parent: Group, m: Materials): void {
  box(parent, m.ink, [3.5, 2.8, 0.18], [0.05, 2.65, 1.16], 0.28, 0.065)
  // Four narrow illuminated filter cassettes replace the broad orange plane.
  for (const y of [1.98, 2.63, 3.28, 3.93]) {
    box(parent, m.amberDim, [3.16, 0.28, 0.07], [0.05, y, 1.34], 0.08, 0.02)
    for (let column = 0; column < 10; column += 1) {
      const x = -1.38 + column * 0.318
      box(parent, m.graphiteShade, [0.026, 0.24, 0.035], [x, y, 1.42], 0.008, 0.002, [0, 0, 0.62])
      box(parent, m.graphiteShade, [0.026, 0.24, 0.035], [x, y, 1.44], 0.008, 0.002, [0, 0, -0.62])
    }
  }
  // Exactly four deep, downward-canted louvers reveal narrow amber bands between them.
  for (const y of [1.7, 2.35, 3.0, 3.65]) {
    box(parent, m.graphite, [3.42, 0.22, 0.64], [0.05, y, 1.58], 0.11, 0.028, [0.28, 0, 0])
  }
}

function addServices(parent: Group, m: Materials): void {
  box(parent, m.ink, [1.22, 0.28, 0.14], [0.05, 1.02, 1.4], 0.09, 0.022)
  box(parent, m.amber, [0.92, 0.14, 0.07], [0.05, 1.05, 1.5], 0.045, 0.012)
  box(parent, m.graphite, [0.36, 0.54, 0.18], [-1.26, 1.1, 1.39], 0.1, 0.025)
  box(parent, m.graphite, [0.36, 0.54, 0.18], [1.36, 1.1, 1.39], 0.1, 0.025)
  for (const x of [-1.26, 1.36]) bolt(parent, m.steel, x, 1.1, 1.53, 0.055)
  box(parent, m.amber, [0.12, 0.72, 0.08], [-2.53, 2.9, -0.18], 0.04, 0.01)
  box(parent, m.cyan, [0.08, 0.28, 0.06], [2.55, 2.2, -0.18], 0.026, 0.007)

  // Captured lower loop: the closed torus disappears beneath the central collar.
  parent.add(cylinder(m.graphiteShade, 0.13, 0.3, [0.05, 0.47, 0.62], [0, 0, 0], 12))
  parent.add(cylinder(m.steel, 0.16, 0.16, [0.05, 0.29, 0.62], [0, 0, 0], 12))
  const loop = new Mesh(new TorusGeometry(0.14, 0.04, 8, 20), m.graphiteShade)
  loop.position.set(0.05, 0.19, 0.62)
  parent.add(loop)
}

function build(): { root: Group; handles: MaterialHandle[]; geometries: Array<{ dispose: () => void }> } {
  const acquired = acquireMaterials()
  const root = new Group()
  root.name = 'exhaust vent'
  const fixed = new Group()
  fixed.name = 'static grounded wall exhaust vent'
  root.add(fixed)
  addBackplate(fixed, acquired.materials)
  addHood(fixed, acquired.materials)
  addFilter(fixed, acquired.materials)
  addServices(fixed, acquired.materials)
  const geometries = mergeStaticByMaterial(fixed, {
    meshName: (material: { name?: string }): string => material.name ?? 'exhaust vent batch',
  })
  return { root, handles: acquired.handles, geometries }
}

export function createModel(): VentController {
  const rig = build()
  return {
    root: rig.root,
    update: () => {},
    dispose: () => {
      for (const geometry of rig.geometries) geometry.dispose()
      for (const handle of rig.handles) handle.release()
    },
  }
}

function makePreview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low' } = {}): Preview {
  const model = createModel()
  const scene = new Scene()
  scene.background = new Color(0x020304)
  scene.add(model.root)
  scene.add(new HemisphereLight(0xd8d9d6, 0x050709, 0.56))
  const key = new DirectionalLight(0xffead7, 2.75); key.position.set(-7, 9, 10); scene.add(key)
  const fill = new DirectionalLight(0x789ac2, 0.84); fill.position.set(8, 5, 7); scene.add(fill)
  const rim = new DirectionalLight(0xabc6c8, 1.0); rim.position.set(7, 8, -8); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x000000, roughness: 0.98, metalness: 0 })
  const floorGeometry = new PlaneGeometry(12, 12)
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.006
  floor.userData.excludeFromExport = true
  if (options.mode !== 'beauty') scene.add(floor)
  const camera = new PerspectiveCamera(32, options.aspect ?? 1, 0.12, 80)
  if (options.mode === 'side') camera.position.set(-7.1, 2.7, 0.3)
  else if (options.mode === 'rear') camera.position.set(6.2, 3, -7.2)
  else if (options.mode === 'low') camera.position.set(-5.4, 0.65, 7.1)
  else camera.position.set(-3.7, 3.45, 11.8)
  camera.lookAt(0, options.mode === 'low' ? 2.15 : 2.62, 0.15)
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
