import {
  Color,
  CylinderGeometry,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Shape,
  SphereGeometry,
} from 'three/webgpu'

import {
  MaterialLibrary,
  mergeStaticByMaterial,
  prism,
  tuneMaterial,
  type MaterialHandle,
  type Vec3,
} from '../../../src/asset-forge/generator/index.ts'

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
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 30201 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 30202 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 30203 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 30204 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 30205 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 30206 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 30207 })
  return {
    handles: [shell, shellShade, graphite, ink, steel, amber, cyan],
    materials: {
      shell: tuneMaterial(shell, 0xcbd0d0, 0.62, 0.12),
      shellShade: tuneMaterial(shellShade, 0x90999b, 0.58, 0.26),
      graphite: tuneMaterial(graphite, 0x262d35, 0.48, 0.68),
      ink: tuneMaterial(ink, 0x07090b, 0.84, 0.12),
      steel: tuneMaterial(steel, 0x8e9799, 0.3, 0.84),
      amber: tuneMaterial(amber, 0xb9791f, 0.58, 0.08, { emissive: 0.08, clearcoat: 0.08 }),
      cyan: tuneMaterial(cyan, 0x2fc4d0, 0.24, 0.05, { emissive: 0.68 }),
    },
  }
}

function box(
  parent: Group,
  material: MeshPhysicalMaterial,
  size: Vec3,
  position: Vec3,
  chamfer = 0.06,
  bevel = 0.02,
): Mesh {
  const mesh = prism(material, size, position, {
    chamfer,
    fillet: Math.min(0.045, Math.max(0.007, chamfer * 0.3)),
    bevel,
  })
  parent.add(mesh)
  return mesh
}

function addFrontGuard(root: Group, material: MeshPhysicalMaterial, x: number): void {
  const shape = new Shape()
  shape.moveTo(-0.46, 0)
  shape.lineTo(0.46, 0)
  shape.lineTo(0.34, 0.72)
  shape.lineTo(-0.3, 0.72)
  shape.closePath()
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.92,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.045,
    bevelThickness: 0.045,
  })
  geometry.translate(0, 0, -0.46)
  const guard = new Mesh(geometry, material)
  guard.position.set(x, 0.18, 2.08)
  root.add(guard)
}

function addPerimeter(root: Group, m: Materials): void {
  box(root, m.ink, [7.05, 0.1, 5.35], [0, 0.05, 0], 0.14, 0.03)
  box(root, m.graphite, [6.86, 0.16, 5.18], [0, 0.14, 0], 0.15, 0.035)

  for (const x of [-3.12, 3.12]) {
    box(root, m.shellShade, [0.84, 0.58, 4.96], [x, 0.43, -0.03], 0.2, 0.05)
    box(root, m.shell, [0.68, 0.47, 4.76], [x, 0.53, -0.06], 0.17, 0.043)
    addFrontGuard(root, m.graphite, x)
    box(root, m.ink, [0.62, 0.45, 0.7], [x, 0.54, 2.13], 0.13, 0.034)
    box(root, m.cyan, [0.12, 0.08, 0.44], [x * 0.985, 0.56, 0.75], 0.025, 0.007)
  }
}

function addWalkway(root: Group, m: Materials): void {
  // Rear pale paving pair and steel approach strips.
  box(root, m.graphite, [5.42, 0.12, 1.16], [0, 0.28, -1.98], 0.08, 0.022)
  box(root, m.shell, [5.15, 0.18, 1.0], [0, 0.4, -1.98], 0.07, 0.02)
  box(root, m.shellShade, [0.34, 0.08, 0.92], [-2.35, 0.52, -1.98], 0.035, 0.009)
  box(root, m.shellShade, [0.34, 0.08, 0.92], [2.35, 0.52, -1.98], 0.035, 0.009)
  for (const x of [-2.35, 2.35]) {
    for (let index = 0; index < 6; index += 1) {
      const stud = new Mesh(new SphereGeometry(0.035, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), m.steel)
      stud.position.set(x, 0.57, -2.35 + index * 0.15)
      root.add(stud)
    }
  }

  // One coherent intermediate maintenance ramp, captured by dark side rails.
  box(root, m.graphite, [5.46, 0.13, 1.55], [0, 0.27, -0.62], 0.08, 0.022)
  box(root, m.shellShade, [5.15, 0.2, 1.33], [0, 0.4, -0.62], 0.07, 0.02)
  for (const x of [-2.52, 2.52]) {
    box(root, m.graphite, [0.14, 0.09, 3.42], [x, 0.47, -0.63], 0.035, 0.009)
  }

  // Amber tactile panel with a deep graphite capture tray.
  box(root, m.graphite, [5.48, 0.15, 1.72], [0, 0.27, 0.92], 0.1, 0.025)
  box(root, m.amber, [5.16, 0.18, 1.45], [0, 0.4, 0.92], 0.07, 0.02)
  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < 15; column += 1) {
      const bump = new Mesh(new SphereGeometry(0.065, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), m.amber)
      bump.position.set(-2.3 + column * 0.33, 0.49, 0.37 + row * 0.22)
      root.add(bump)
    }
  }
}

function addFrontDrain(root: Group, m: Materials): void {
  box(root, m.graphite, [5.7, 0.16, 0.78], [0, 0.27, 2.08], 0.08, 0.022)
  box(root, m.steel, [5.4, 0.1, 0.57], [0, 0.39, 2.08], 0.06, 0.016)
  for (let index = 0; index < 20; index += 1) {
    box(root, m.ink, [0.15, 0.06, 0.43], [-2.47 + index * 0.26, 0.425, 2.08], 0.04, 0.01)
  }
  for (const x of [-1.65, 0, 1.65]) {
    box(root, m.graphite, [0.44, 0.11, 0.18], [x, 0.39, 2.43], 0.045, 0.012)
    box(root, m.amber, [0.2, 0.045, 0.065], [x, 0.45, 2.53], 0.018, 0.005)
  }
  for (const x of [-2.3, 2.3]) {
    for (const z of [1.87, 2.39]) {
      const bolt = new Mesh(new CylinderGeometry(0.06, 0.06, 0.06, 12), m.steel)
      bolt.position.set(x, 0.405, z)
      root.add(bolt)
    }
  }
}

function build(): { root: Group; handles: MaterialHandle[]; geometries: Array<{ dispose: () => void }> } {
  const acquired = acquireMaterials()
  const root = new Group()
  root.name = 'curb ramp'
  addPerimeter(root, acquired.materials)
  addWalkway(root, acquired.materials)
  addFrontDrain(root, acquired.materials)
  const geometries = mergeStaticByMaterial(root, {
    meshName: (material: { name?: string }): string => material.name ?? 'curb-ramp batch',
  })
  return { root, handles: acquired.handles, geometries }
}

export function createModel(): Controller {
  const built = build()
  return {
    root: built.root,
    update: () => {},
    dispose: () => {
      for (const geometry of built.geometries) geometry.dispose()
      for (const handle of built.handles) handle.release()
    },
  }
}

function makePreview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low' } = {}): Preview {
  const model = createModel()
  const scene = new Scene()
  scene.background = new Color(0x020304)
  scene.add(model.root)
  scene.add(new HemisphereLight(0xc8cfd1, 0x07090c, 0.82))
  const key = new DirectionalLight(0xffead7, 2.75); key.position.set(-8, 10, 10); scene.add(key)
  const fill = new DirectionalLight(0x7698c1, 1.02); fill.position.set(9, 6, 8); scene.add(fill)
  const rim = new DirectionalLight(0x8eb6bd, 0.78); rim.position.set(5, 8, -9); scene.add(rim)
  const floorMaterial = new MeshBasicMaterial({ color: 0x010203 })
  const floorGeometry = new PlaneGeometry(16, 14)
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.006
  floor.userData.excludeFromExport = true
  scene.add(floor)
  const camera = new PerspectiveCamera(31, options.aspect ?? 1, 0.12, 80)
  if (options.mode === 'side') camera.position.set(-8.3, 2.15, 0.1)
  else if (options.mode === 'rear') camera.position.set(6.8, 2.9, -7.8)
  else if (options.mode === 'low') camera.position.set(-6.7, 0.55, 7.2)
  else camera.position.set(-8.5, 5.8, 10.6)
  camera.lookAt(0, options.mode === 'low' ? 0.34 : 0.25, 0)
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
