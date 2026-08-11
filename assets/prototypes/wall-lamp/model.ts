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
  amberGlass: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
}

interface LampController {
  root: Group
  update: (deltaSeconds: number) => void
  dispose: () => void
}

interface Preview extends LampController {
  scene: Scene
  camera: PerspectiveCamera
}

function acquireMaterials(): { materials: Materials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 38401 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 38402 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 38403 })
  const graphiteShade = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-900', condition: 'maintained', seed: 38404 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 38405 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 38406 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 38407 })
  const amberDim = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-500', condition: 'maintained', seed: 38408 })
  const amberGlassHandle = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'maintained', seed: 38410 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 38409 })
  const amberGlass = tuneMaterial(amberGlassHandle, 0xe67c05, 0.22, 0.02, { emissive: 0.26, clearcoat: 0.4 })
  amberGlass.transparent = true
  amberGlass.opacity = 0.64
  amberGlass.transmission = 0.12
  amberGlass.thickness = 0.08
  return {
    handles: [shell, shellShade, graphite, graphiteShade, ink, steel, amber, amberDim, amberGlassHandle, cyan],
    materials: {
      shell: tuneMaterial(shell, 0xd8dad7, 0.42, 0.24, { clearcoat: 0.16 }),
      shellShade: tuneMaterial(shellShade, 0x969da0, 0.52, 0.4, { clearcoat: 0.09 }),
      graphite: tuneMaterial(graphite, 0x252a30, 0.5, 0.58, { clearcoat: 0.1 }),
      graphiteShade: tuneMaterial(graphiteShade, 0x111519, 0.66, 0.42, { clearcoat: 0.05 }),
      ink: tuneMaterial(ink, 0x020304, 0.86, 0.06),
      steel: tuneMaterial(steel, 0x7b858b, 0.34, 0.84, { clearcoat: 0.08 }),
      amber: tuneMaterial(amber, 0xf6a008, 0.14, 0.02, { emissive: 0.86, clearcoat: 0.32 }),
      amberDim: tuneMaterial(amberDim, 0xa85a05, 0.27, 0.02, { emissive: 0.34, clearcoat: 0.2 }),
      amberGlass,
      cyan: tuneMaterial(cyan, 0x43d6df, 0.19, 0.03, { emissive: 0.72, clearcoat: 0.22 }),
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
    bevelSize: 0.06,
    bevelThickness: 0.06,
    curveSegments: 1,
    steps: 1,
  })
  geometry.computeVertexNormals()
  const mesh = new Mesh(geometry, material)
  mesh.position.set(position[0], position[1], position[2])
  return mesh
}

function addBackplate(parent: Group, m: Materials): void {
  box(parent, m.shellShade, [4.55, 5.2, 0.3], [0, 2.6, -0.82], 0.32, 0.075)
  box(parent, m.shell, [4.3, 4.96, 0.22], [0, 2.6, -0.61], 0.28, 0.065)
  box(parent, m.graphiteShade, [3.82, 4.46, 0.24], [0, 2.58, -0.42], 0.3, 0.07)
  for (const x of [-1.88, 1.88]) for (const y of [0.42, 4.78]) {
    box(parent, m.shellShade, [0.38, 0.38, 0.12], [x, y, -0.38], 0.1, 0.025)
    bolt(parent, m.steel, x, y, -0.27, 0.1)
    bolt(parent, m.ink, x, y, -0.19, 0.045)
  }
}

function addProjectedHousing(parent: Group, m: Materials): void {
  box(parent, m.graphiteShade, [3.86, 4.16, 1.22], [0.05, 2.56, 0.2], 0.46, 0.1)
  box(parent, m.shellShade, [3.66, 3.82, 1.42], [0.05, 2.78, 0.48], 0.5, 0.11)
  // Pale load cheeks remain disjoint so the black lower machinery is a real structural mass.
  box(parent, m.shell, [0.58, 3.02, 1.5], [-1.5, 2.92, 0.56], 0.24, 0.06, [0, 0, -0.08])
  box(parent, m.shell, [0.58, 3.02, 1.5], [1.6, 2.92, 0.56], 0.24, 0.06, [0, 0, 0.08])
  box(parent, m.shell, [3.18, 0.76, 1.48], [0.05, 4.18, 0.48], 0.25, 0.062, [-0.08, 0, 0])
  box(parent, m.graphite, [3.38, 1.18, 1.46], [0.05, 1.35, 0.55], 0.3, 0.075, [0.05, 0, 0])
  box(parent, m.graphiteShade, [2.86, 0.5, 1.48], [0.05, 0.83, 0.56], 0.18, 0.045)
}

function addLens(parent: Group, m: Materials): void {
  box(parent, m.ink, [3.04, 2.05, 0.2], [0.05, 2.88, 1.25], 0.3, 0.07)
  box(parent, m.amberDim, [2.84, 1.84, 0.12], [0.05, 2.88, 1.42], 0.24, 0.055)
  // A single optical volume keeps Dawn artifact-free; the bright perimeter establishes prismatic depth.
  box(parent, m.amberDim, [2.68, 1.66, 0.045], [0.05, 2.88, 1.57], 0.22, 0.05)
  box(parent, m.amber, [2.58, 0.07, 0.055], [0.05, 3.64, 1.61], 0.025, 0.007)
  box(parent, m.amber, [2.58, 0.07, 0.055], [0.05, 2.12, 1.61], 0.025, 0.007)
  box(parent, m.amber, [0.07, 1.38, 0.055], [-1.22, 2.88, 1.61], 0.025, 0.007)
  box(parent, m.amber, [0.07, 1.38, 0.055], [1.32, 2.88, 1.61], 0.025, 0.007)
  parent.add(frame(m.graphite, [3.34, 2.34, 0.3], [2.86, 1.86, 0.22], 0.36, [0.05, 2.88, 1.46]))
  parent.add(frame(m.graphiteShade, [3.1, 2.1, 0.25], [2.82, 1.82, 0.2], 0.18, [0.05, 2.88, 1.82]))
}

function addUpperVent(parent: Group, m: Materials): void {
  box(parent, m.graphiteShade, [2.22, 0.34, 0.54], [0.05, 4.46, 1.08], 0.13, 0.032, [-0.16, 0, 0])
  box(parent, m.ink, [1.72, 0.18, 0.32], [0.05, 4.5, 1.34], 0.07, 0.018, [-0.16, 0, 0])
  for (let i = -4; i <= 4; i += 1) box(parent, m.graphite, [0.1, 0.14, 0.26], [i * 0.18 + 0.05, 4.52, 1.44], 0.025, 0.007, [-0.16, 0, 0])
}

function addLowerServices(parent: Group, m: Materials): void {
  box(parent, m.ink, [0.68, 0.72, 0.18], [0.05, 1.25, 1.34], 0.16, 0.04)
  box(parent, m.graphite, [0.42, 0.28, 0.2], [0.05, 1.5, 1.51], 0.09, 0.022)
  box(parent, m.cyan, [0.22, 0.12, 0.06], [0.05, 1.5, 1.64], 0.04, 0.01, [0, 0, Math.PI / 4])
  box(parent, m.graphiteShade, [0.82, 0.18, 0.18], [0.05, 0.88, 1.45], 0.06, 0.015)
  for (const x of [-1.35, -0.9, 0.9, 1.35]) bolt(parent, m.steel, x, 1.05, 1.34, 0.055)
  box(parent, m.cyan, [0.08, 0.42, 0.06], [-1.48, 2.05, 1.38], 0.025, 0.007)
}

function build(): { root: Group; handles: MaterialHandle[]; geometries: Array<{ dispose: () => void }> } {
  const acquired = acquireMaterials()
  const root = new Group()
  root.name = 'wall lamp'
  const fixed = new Group()
  fixed.name = 'static grounded wall lamp assembly'
  root.add(fixed)
  addBackplate(fixed, acquired.materials)
  addProjectedHousing(fixed, acquired.materials)
  addLens(fixed, acquired.materials)
  addUpperVent(fixed, acquired.materials)
  addLowerServices(fixed, acquired.materials)
  const geometries = mergeStaticByMaterial(fixed, {
    meshName: (material: { name?: string }): string => material.name ?? 'wall lamp batch',
  })
  return { root, handles: acquired.handles, geometries }
}

export function createModel(): LampController {
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
  scene.add(new HemisphereLight(0xd7d8d5, 0x050709, 0.54))
  const key = new DirectionalLight(0xffead8, 2.7); key.position.set(-7, 9, 10); scene.add(key)
  const fill = new DirectionalLight(0x7699c1, 0.82); fill.position.set(8, 5, 7); scene.add(fill)
  const rim = new DirectionalLight(0xabc5c8, 1.0); rim.position.set(7, 8, -8); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x000000, roughness: 0.98, metalness: 0.0 })
  const floorGeometry = new PlaneGeometry(13, 13)
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.006
  floor.userData.excludeFromExport = true
  if (options.mode !== 'beauty') scene.add(floor)
  const camera = new PerspectiveCamera(32, options.aspect ?? 1, 0.12, 80)
  if (options.mode === 'side') camera.position.set(-7.2, 2.7, 0.4)
  else if (options.mode === 'rear') camera.position.set(6.4, 2.9, -7.2)
  else if (options.mode === 'low') camera.position.set(-5.6, 0.7, 7.2)
  else camera.position.set(-5.8, 3.6, 9.4)
  camera.lookAt(0, options.mode === 'low' ? 2.2 : 2.62, 0.2)
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
