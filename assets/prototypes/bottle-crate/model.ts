import {
  Color,
  CylinderGeometry,
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
  magenta: MeshPhysicalMaterial
  magentaDim: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
}

interface CrateController {
  root: Group
  update: (deltaSeconds: number) => void
  dispose: () => void
}

interface Preview extends CrateController {
  scene: Scene
  camera: PerspectiveCamera
}

function acquireMaterials(): { materials: Materials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 38301 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 38302 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 38303 })
  const graphiteShade = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-900', condition: 'maintained', seed: 38304 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 38305 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 38306 })
  const magenta = library.acquire({ recipeId: 'MAT-09', palette: 'MAGENTA-400', condition: 'active', seed: 38307 })
  const magentaDim = library.acquire({ recipeId: 'MAT-09', palette: 'MAGENTA-500', condition: 'maintained', seed: 38308 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 38309 })
  return {
    handles: [shell, shellShade, graphite, graphiteShade, ink, steel, magenta, magentaDim, cyan],
    materials: {
      shell: tuneMaterial(shell, 0xd8d9d6, 0.43, 0.24, { clearcoat: 0.14 }),
      shellShade: tuneMaterial(shellShade, 0x929a9d, 0.54, 0.38, { clearcoat: 0.08 }),
      graphite: tuneMaterial(graphite, 0x252b31, 0.5, 0.56, { clearcoat: 0.09 }),
      graphiteShade: tuneMaterial(graphiteShade, 0x111519, 0.66, 0.42, { clearcoat: 0.05 }),
      ink: tuneMaterial(ink, 0x030405, 0.84, 0.07),
      steel: tuneMaterial(steel, 0x7e878d, 0.34, 0.83, { clearcoat: 0.08 }),
      magenta: tuneMaterial(magenta, 0xdd278f, 0.18, 0.03, { emissive: 0.68, clearcoat: 0.28 }),
      magentaDim: tuneMaterial(magentaDim, 0x45102f, 0.46, 0.04, { emissive: 0.065, clearcoat: 0.12 }),
      cyan: tuneMaterial(cyan, 0x42d5df, 0.2, 0.03, { emissive: 0.72, clearcoat: 0.2 }),
    },
  }
}

function box(
  parent: Group,
  material: MeshPhysicalMaterial,
  size: Vec3,
  position: Vec3,
  chamfer = 0.08,
  bevel = 0.025,
  rotation: Vec3 = [0, 0, 0],
): Mesh {
  const mesh = prism(material, size, position, {
    chamfer,
    fillet: Math.min(0.06, Math.max(0.008, chamfer * 0.28)),
    bevel,
    rotation,
  })
  parent.add(mesh)
  return mesh
}

function bolt(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number, radius = 0.065): void {
  parent.add(cylinder(material, radius, 0.1, [x, y, z], Z_AXIS, 9))
}

function frustum(parent: Group, material: MeshPhysicalMaterial, bottomRadius: number, topRadius: number, height: number, position: Vec3, segments = 14): Mesh {
  const geometry = new CylinderGeometry(topRadius, bottomRadius, height, segments, 1, false)
  const mesh = new Mesh(geometry, material)
  mesh.position.set(position[0], position[1], position[2])
  parent.add(mesh)
  return mesh
}

function addBottle(parent: Group, m: Materials, x: number, z: number, scale = 1): void {
  const baseY = 0.68
  parent.add(cylinder(m.graphiteShade, 0.58 * scale, 0.12 * scale, [x, baseY + 0.06 * scale, z], [0, 0, 0], 16))
  parent.add(cylinder(m.ink, 0.52 * scale, 1.58 * scale, [x, baseY + 0.91 * scale, z], [0, 0, 0], 16))
  frustum(parent, m.graphiteShade, 0.52 * scale, 0.28 * scale, 0.42 * scale, [x, baseY + 1.91 * scale, z], 16)
  parent.add(cylinder(m.graphiteShade, 0.29 * scale, 0.2 * scale, [x, baseY + 2.19 * scale, z], [0, 0, 0], 16))
  parent.add(cylinder(m.magentaDim, 0.32 * scale, 0.22 * scale, [x, baseY + 2.4 * scale, z], [0, 0, 0], 16))
  parent.add(cylinder(m.graphite, 0.28 * scale, 0.08 * scale, [x, baseY + 2.55 * scale, z], [0, 0, 0], 16))

  // A broad patterned lower sleeve and a physically framed vertical level witness.
  parent.add(cylinder(m.magentaDim, 0.55 * scale, 0.54 * scale, [x, baseY + 0.52 * scale, z], [0, 0, 0], 16))
  for (let i = 0; i < 5; i += 1) {
    box(parent, m.graphiteShade, [0.16 * scale, 0.05 * scale, 0.08 * scale], [x - 0.34 * scale + i * 0.17 * scale, baseY + 0.52 * scale, z + 0.55 * scale], 0.015, 0.004, [0, 0, i % 2 === 0 ? 0.48 : -0.48])
  }
  box(parent, m.graphite, [0.22 * scale, 1.05 * scale, 0.16 * scale], [x, baseY + 1.31 * scale, z + 0.52 * scale], 0.07, 0.018)
  box(parent, m.magenta, [0.08 * scale, 0.78 * scale, 0.08 * scale], [x, baseY + 1.34 * scale, z + 0.63 * scale], 0.028, 0.008)
}

function addGroundedFrame(parent: Group, m: Materials): void {
  box(parent, m.graphiteShade, [5.22, 0.52, 3.45], [0, 0.34, 0], 0.26, 0.065)
  box(parent, m.ink, [4.26, 0.16, 2.68], [0, 0.08, 0], 0.12, 0.03)
  for (const x of [-2.17, 2.17]) for (const z of [-1.3, 1.3]) {
    box(parent, m.graphite, [0.84, 0.22, 0.78], [x, 0.11, z], 0.18, 0.045)
    box(parent, m.cyan, [0.34, 0.06, 0.14], [x, 0.24, z + (z > 0 ? 0.34 : -0.34)], 0.04, 0.01)
  }
  box(parent, m.graphiteShade, [4.62, 3.9, 0.3], [0, 2.45, -1.5], 0.26, 0.06)
  box(parent, m.graphite, [4.08, 3.35, 0.16], [0, 2.48, -1.31], 0.22, 0.05)
}

function addCornerFrame(parent: Group, m: Materials): void {
  for (const x of [-2.22, 2.22]) {
    box(parent, m.shellShade, [0.68, 4.12, 3.1], [x, 2.44, -0.03], 0.34, 0.08)
    box(parent, m.shell, [0.5, 3.72, 2.84], [x, 2.58, -0.01], 0.28, 0.065)
    box(parent, m.graphite, [0.26, 1.56, 0.4], [x, 2.04, 1.43], 0.09, 0.022)
    box(parent, m.magenta, [0.1, 0.72, 0.08], [x, 2.04, 1.67], 0.032, 0.009)
    for (const y of [0.75, 4.24]) bolt(parent, m.steel, x, y, 1.53, 0.075)
  }
  box(parent, m.shellShade, [4.74, 0.72, 3.15], [0, 4.48, -0.04], 0.3, 0.075)
  box(parent, m.shell, [4.34, 0.52, 2.84], [0, 4.64, -0.02], 0.24, 0.06)
  box(parent, m.graphiteShade, [4.62, 0.62, 3.2], [0, 0.64, -0.02], 0.24, 0.06)
  box(parent, m.graphite, [3.7, 0.18, 2.6], [0, 0.8, 0.0], 0.1, 0.025)
}

function addFrontRetention(parent: Group, m: Materials): void {
  box(parent, m.graphiteShade, [4.0, 0.2, 0.28], [0, 1.58, 1.56], 0.07, 0.018)
  box(parent, m.graphiteShade, [4.0, 0.2, 0.28], [0, 2.44, 1.56], 0.07, 0.018)
  for (const x of [-1.34, 0, 1.34]) {
    box(parent, m.graphite, [0.15, 1.56, 0.2], [x, 1.74, 1.63], 0.045, 0.012)
    box(parent, m.steel, [0.05, 1.1, 0.07], [x, 1.77, 1.76], 0.018, 0.005)
  }
  box(parent, m.graphite, [2.1, 0.22, 0.24], [0, 3.9, 1.48], 0.07, 0.018)
  box(parent, m.shell, [3.46, 0.32, 0.35], [0, 4.15, 1.36], 0.1, 0.025)
}

function addTopCargo(parent: Group, m: Materials): void {
  box(parent, m.graphiteShade, [3.86, 0.18, 2.5], [0, 4.86, -0.05], 0.12, 0.03)
  for (const x of [-1.35, 0, 1.35]) {
    parent.add(cylinder(m.magentaDim, 0.34, 0.22, [x, 4.98, -0.12], [0, 0, 0], 16))
    parent.add(cylinder(m.graphite, 0.28, 0.08, [x, 5.13, -0.12], [0, 0, 0], 16))
  }
  box(parent, m.graphite, [3.78, 0.18, 0.18], [0, 5.04, 1.05], 0.06, 0.015)
  box(parent, m.graphite, [3.78, 0.18, 0.18], [0, 5.04, -1.15], 0.06, 0.015)
  for (const x of [-1.86, 1.86]) box(parent, m.graphite, [0.18, 0.18, 2.24], [x, 5.04, -0.05], 0.06, 0.015)
  box(parent, m.graphite, [2.18, 0.24, 0.22], [0, 5.28, -0.72], 0.08, 0.02)
  box(parent, m.magenta, [1.08, 0.28, 0.26], [0, 5.29, -0.72], 0.09, 0.022)
}

function addSideService(parent: Group, m: Materials): void {
  box(parent, m.graphiteShade, [0.22, 2.55, 1.3], [2.56, 2.47, 0.12], 0.18, 0.045)
  box(parent, m.ink, [0.12, 1.68, 0.82], [2.7, 2.48, 0.16], 0.12, 0.03)
  for (const y of [1.9, 2.24, 2.58, 2.92]) box(parent, m.magentaDim, [0.08, 0.18, 0.56], [2.78, y, 0.16], 0.028, 0.008)
  box(parent, m.cyan, [0.07, 0.12, 0.54], [2.79, 3.5, 0.18], 0.028, 0.008)
  box(parent, m.graphite, [0.22, 1.1, 0.42], [-2.5, 2.0, 0.92], 0.1, 0.025)
  box(parent, m.magenta, [0.08, 0.74, 0.14], [-2.64, 2.0, 0.92], 0.028, 0.008)
}

function build(): { root: Group; handles: MaterialHandle[]; geometries: Array<{ dispose: () => void }> } {
  const acquired = acquireMaterials()
  const root = new Group()
  root.name = 'bottle crate'
  const fixed = new Group()
  fixed.name = 'static grounded retained bottle crate'
  root.add(fixed)
  addGroundedFrame(fixed, acquired.materials)
  addCornerFrame(fixed, acquired.materials)
  for (const x of [-1.34, 0, 1.34]) addBottle(fixed, acquired.materials, x, 0.77)
  addFrontRetention(fixed, acquired.materials)
  addTopCargo(fixed, acquired.materials)
  addSideService(fixed, acquired.materials)
  const geometries = mergeStaticByMaterial(fixed, {
    meshName: (material: { name?: string }): string => material.name ?? 'bottle crate batch',
  })
  return { root, handles: acquired.handles, geometries }
}

export function createModel(): CrateController {
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
  scene.add(new HemisphereLight(0xd8d9d6, 0x050709, 0.58))
  const key = new DirectionalLight(0xffe8d5, 2.85); key.position.set(-7, 9, 10); scene.add(key)
  const fill = new DirectionalLight(0x7798c2, 0.88); fill.position.set(8, 5, 7); scene.add(fill)
  const rim = new DirectionalLight(0xabc7ca, 1.05); rim.position.set(7, 8, -8); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x040608, roughness: 0.94, metalness: 0.03 })
  const floorGeometry = new PlaneGeometry(14, 14)
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.006
  floor.userData.excludeFromExport = true
  scene.add(floor)
  const camera = new PerspectiveCamera(33, options.aspect ?? 1, 0.12, 90)
  if (options.mode === 'side') camera.position.set(-7.4, 3.1, 0.2)
  else if (options.mode === 'rear') camera.position.set(6.6, 3.4, -7.5)
  else if (options.mode === 'low') camera.position.set(-5.6, 0.72, 7.2)
  else camera.position.set(7.9, 5.55, 12.8)
  camera.lookAt(0, options.mode === 'low' ? 2.2 : 2.65, 0.1)
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
