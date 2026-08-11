import {
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  Path,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Shape,
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

interface PanelController {
  root: Group
  update: (deltaSeconds: number) => void
  dispose: () => void
}

interface Preview extends PanelController {
  scene: Scene
  camera: PerspectiveCamera
}

function acquireMaterials(): { materials: Materials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 38501 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 38502 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 38503 })
  const graphiteShade = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-900', condition: 'maintained', seed: 38504 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 38505 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 38506 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 38507 })
  const amberDim = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-500', condition: 'maintained', seed: 38508 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 38509 })
  return {
    handles: [shell, shellShade, graphite, graphiteShade, ink, steel, amber, amberDim, cyan],
    materials: {
      shell: tuneMaterial(shell, 0xd9dad7, 0.42, 0.24, { clearcoat: 0.14 }),
      shellShade: tuneMaterial(shellShade, 0x929a9d, 0.53, 0.4, { clearcoat: 0.08 }),
      graphite: tuneMaterial(graphite, 0x252b31, 0.49, 0.58, { clearcoat: 0.1 }),
      graphiteShade: tuneMaterial(graphiteShade, 0x101419, 0.67, 0.42, { clearcoat: 0.05 }),
      ink: tuneMaterial(ink, 0x020304, 0.86, 0.06),
      steel: tuneMaterial(steel, 0x7e878d, 0.34, 0.84, { clearcoat: 0.08 }),
      amber: tuneMaterial(amber, 0xf39a07, 0.16, 0.02, { emissive: 0.78, clearcoat: 0.28 }),
      amberDim: tuneMaterial(amberDim, 0x3b2104, 0.46, 0.03, { emissive: 0.055, clearcoat: 0.1 }),
      cyan: tuneMaterial(cyan, 0x42d6df, 0.19, 0.03, { emissive: 0.75, clearcoat: 0.22 }),
    },
  }
}

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.08, bevel = 0.025, rotation: Vec3 = [0, 0, 0]): Mesh {
  const mesh = prism(material, size, position, {
    chamfer,
    fillet: Math.min(0.055, Math.max(0.008, chamfer * 0.28)),
    bevel,
    rotation,
  })
  parent.add(mesh)
  return mesh
}

function bolt(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number, radius = 0.08): void {
  parent.add(cylinder(material, radius, 0.1, [x, y, z], Z_AXIS, 10))
}

function addChamferedContour(target: Shape | Path, width: number, height: number, cut: number, clockwise = false): void {
  const x = width / 2
  const y = height / 2
  const points: Array<[number, number]> = clockwise
    ? [[-x + cut, -y], [-x, -y + cut], [-x, y - cut], [-x + cut, y], [x - cut, y], [x, y - cut], [x, -y + cut], [x - cut, -y]]
    : [[-x + cut, -y], [x - cut, -y], [x, -y + cut], [x, y - cut], [x - cut, y], [-x + cut, y], [-x, y - cut], [-x, -y + cut]]
  target.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i += 1) target.lineTo(points[i][0], points[i][1])
  target.closePath()
}

function frame(material: MeshPhysicalMaterial, outer: [number, number, number], inner: [number, number, number], depth: number, position: Vec3): Mesh {
  const shape = new Shape()
  addChamferedContour(shape, outer[0], outer[1], outer[2])
  const hole = new Path()
  addChamferedContour(hole, inner[0], inner[1], inner[2], true)
  shape.holes.push(hole)
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.045,
    bevelThickness: 0.045,
    curveSegments: 1,
    steps: 1,
  })
  geometry.computeVertexNormals()
  const mesh = new Mesh(geometry, material)
  mesh.position.set(position[0], position[1], position[2])
  return mesh
}

function addBackplate(parent: Group, m: Materials): void {
  box(parent, m.shellShade, [4.0, 5.7, 0.3], [0, 2.85, -0.72], 0.28, 0.07)
  box(parent, m.shell, [3.78, 5.48, 0.22], [0, 2.85, -0.52], 0.24, 0.06)
  for (const x of [-1.63, 1.63]) for (const y of [0.34, 5.36]) {
    box(parent, m.shellShade, [0.34, 0.34, 0.12], [x, y, -0.29], 0.09, 0.022)
    bolt(parent, m.steel, x, y, -0.18, 0.085)
    bolt(parent, m.ink, x, y, -0.1, 0.038)
  }
  box(parent, m.graphiteShade, [3.48, 5.1, 0.18], [0, 2.84, -0.28], 0.25, 0.06)
}

function addDoorMass(parent: Group, m: Materials): void {
  box(parent, m.graphiteShade, [3.36, 5.0, 0.18], [0.06, 2.85, -0.12], 0.28, 0.065)
  parent.add(frame(m.graphite, [3.26, 4.92, 0.28], [2.86, 4.52, 0.24], 0.28, [0.06, 2.85, -0.14]))
  box(parent, m.shellShade, [2.7, 4.38, 0.38], [-0.18, 2.83, 0.08], 0.3, 0.075)
  box(parent, m.shell, [2.48, 4.12, 0.3], [-0.26, 2.94, 0.32], 0.26, 0.062)
  parent.add(frame(m.shellShade, [2.46, 4.08, 0.24], [2.2, 3.82, 0.2], 0.12, [-0.26, 2.94, 0.5]))
  // Right graphite service field is an integrated deep mass under the front armor, not a sticker.
  box(parent, m.graphiteShade, [0.76, 4.18, 0.36], [1.14, 2.86, 0.26], 0.2, 0.05)
  box(parent, m.graphite, [0.56, 3.8, 0.24], [1.2, 2.86, 0.52], 0.16, 0.04)
  // Lower service plinth captures the door and both lower fasteners.
  box(parent, m.graphiteShade, [2.72, 0.88, 0.42], [-0.12, 0.82, 0.44], 0.22, 0.055)
  box(parent, m.graphite, [2.36, 0.58, 0.24], [-0.12, 0.87, 0.71], 0.15, 0.038)
  for (const x of [-0.95, 0.7]) bolt(parent, m.steel, x, 0.84, 0.87, 0.07)
  box(parent, m.ink, [0.64, 0.24, 0.16], [-0.12, 0.52, 0.78], 0.07, 0.018)
  box(parent, m.cyan, [0.56, 0.1, 0.07], [-0.12, 1.18, 0.81], 0.035, 0.01)
}

function addHinge(parent: Group, m: Materials): void {
  parent.add(cylinder(m.graphiteShade, 0.16, 3.78, [-1.42, 2.9, 0.32], [0, 0, 0], 14))
  for (const y of [1.28, 2.15, 3.02, 3.89, 4.56]) {
    parent.add(cylinder(m.graphite, 0.21, 0.2, [-1.42, y, 0.32], [0, 0, 0], 14))
  }
  for (const y of [1.28, 4.56]) box(parent, m.graphite, [0.42, 0.42, 0.25], [-1.56, y, 0.24], 0.1, 0.025)
  for (const y of [1.28, 4.56]) bolt(parent, m.steel, -1.64, y, 0.43, 0.055)
}

function addInspectionWindow(parent: Group, m: Materials): void {
  box(parent, m.ink, [1.8, 1.8, 0.18], [-0.18, 3.8, 0.59], 0.32, 0.075)
  parent.add(frame(m.graphite, [1.92, 1.92, 0.3], [1.52, 1.52, 0.24], 0.24, [-0.18, 3.8, 0.67]))
  parent.add(frame(m.graphiteShade, [1.58, 1.58, 0.24], [1.28, 1.28, 0.2], 0.18, [-0.18, 3.8, 0.91]))
  box(parent, m.ink, [1.22, 1.22, 0.1], [-0.18, 3.8, 1.03], 0.24, 0.055)
  parent.add(frame(m.amber, [1.08, 1.08, 0.18], [0.9, 0.9, 0.15], 0.09, [-0.18, 3.8, 1.11]))
  parent.add(cylinder(m.amber, 0.19, 0.1, [-0.18, 3.8, 1.22], Z_AXIS, 6))
  parent.add(cylinder(m.graphiteShade, 0.13, 0.12, [-0.18, 3.8, 1.3], Z_AXIS, 6))
  parent.add(cylinder(m.steel, 0.07, 0.1, [-0.18, 3.8, 1.39], Z_AXIS, 6))
}

function addCentralLock(parent: Group, m: Materials): void {
  parent.add(cylinder(m.graphiteShade, 0.58, 0.18, [-0.1, 1.88, 0.78], Z_AXIS, 6))
  parent.add(cylinder(m.steel, 0.48, 0.12, [-0.1, 1.88, 0.91], Z_AXIS, 6))
  parent.add(cylinder(m.amber, 0.4, 0.1, [-0.1, 1.88, 1.02], Z_AXIS, 6))
  parent.add(cylinder(m.graphite, 0.3, 0.12, [-0.1, 1.88, 1.11], Z_AXIS, 6))
  parent.add(cylinder(m.ink, 0.16, 0.1, [-0.1, 1.88, 1.21], Z_AXIS, 3))
}

function addRightService(parent: Group, m: Materials): void {
  box(parent, m.ink, [0.22, 2.92, 0.12], [1.25, 2.82, 0.72], 0.08, 0.02)
  for (const y of [1.72, 2.05, 2.38, 3.48, 3.81, 4.14]) {
    box(parent, m.graphiteShade, [0.11, 0.26, 0.08], [1.25, y, 0.83], 0.035, 0.009, [0, 0, 0.18])
  }
  box(parent, m.amber, [0.12, 0.72, 0.08], [1.25, 2.96, 0.84], 0.04, 0.01)
  for (const x of [-1.0, -0.78, 0.55, 0.77]) box(parent, m.amber, [0.06, 0.2, 0.055], [x, 5.18, 0.48], 0.018, 0.005, [0, 0, -0.28])
}

function build(): { root: Group; handles: MaterialHandle[]; geometries: Array<{ dispose: () => void }> } {
  const acquired = acquireMaterials()
  const root = new Group()
  root.name = 'door control panel'
  const fixed = new Group()
  fixed.name = 'static grounded layered access control assembly'
  root.add(fixed)
  addBackplate(fixed, acquired.materials)
  addDoorMass(fixed, acquired.materials)
  addHinge(fixed, acquired.materials)
  addInspectionWindow(fixed, acquired.materials)
  addCentralLock(fixed, acquired.materials)
  addRightService(fixed, acquired.materials)
  const geometries = mergeStaticByMaterial(fixed, {
    meshName: (material: { name?: string }): string => material.name ?? 'door control panel batch',
  })
  return { root, handles: acquired.handles, geometries }
}

export function createModel(): PanelController {
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
  const key = new DirectionalLight(0xffead7, 2.8); key.position.set(-7, 9, 10); scene.add(key)
  const fill = new DirectionalLight(0x789ac2, 0.84); fill.position.set(8, 5, 7); scene.add(fill)
  const rim = new DirectionalLight(0xabc6c8, 1.0); rim.position.set(7, 8, -8); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x000000, roughness: 0.98, metalness: 0 })
  const floorGeometry = new PlaneGeometry(12, 12)
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.006
  floor.userData.excludeFromExport = true
  if (options.mode !== 'beauty') scene.add(floor)
  const camera = new PerspectiveCamera(31, options.aspect ?? 1, 0.12, 80)
  if (options.mode === 'side') camera.position.set(-7, 2.9, 0.3)
  else if (options.mode === 'rear') camera.position.set(6.2, 3.1, -7)
  else if (options.mode === 'low') camera.position.set(-5.3, 0.7, 7)
  else camera.position.set(-4.4, 3.5, 10.6)
  camera.lookAt(0, options.mode === 'low' ? 2.25 : 2.85, 0.15)
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
