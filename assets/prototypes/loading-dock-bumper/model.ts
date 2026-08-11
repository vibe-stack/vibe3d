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
  cyan: MeshPhysicalMaterial
}

interface DockBumperController {
  root: Group
  update: (deltaSeconds: number) => void
  dispose: () => void
}

interface Preview extends DockBumperController {
  scene: Scene
  camera: PerspectiveCamera
}

function acquireMaterials(): { materials: Materials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 38101 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 38102 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 38103 })
  const graphiteShade = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-900', condition: 'maintained', seed: 38104 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 38105 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 38106 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 38107 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 38108 })
  return {
    handles: [shell, shellShade, graphite, graphiteShade, ink, steel, amber, cyan],
    materials: {
      shell: tuneMaterial(shell, 0xd7d9d5, 0.42, 0.24, { clearcoat: 0.16 }),
      shellShade: tuneMaterial(shellShade, 0x949b9c, 0.53, 0.38, { clearcoat: 0.1 }),
      graphite: tuneMaterial(graphite, 0x0c0f12, 0.74, 0.14, { clearcoat: 0.025 }),
      graphiteShade: tuneMaterial(graphiteShade, 0x0d1013, 0.76, 0.16, { clearcoat: 0.03 }),
      ink: tuneMaterial(ink, 0x030405, 0.8, 0.08),
      steel: tuneMaterial(steel, 0x737c82, 0.34, 0.82, { clearcoat: 0.1 }),
      amber: tuneMaterial(amber, 0xf28a08, 0.17, 0.03, { emissive: 0.78, clearcoat: 0.3 }),
      cyan: tuneMaterial(cyan, 0x50d6df, 0.2, 0.03, { emissive: 0.72, clearcoat: 0.25 }),
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
    fillet: Math.min(0.065, Math.max(0.008, chamfer * 0.3)),
    bevel,
    rotation,
  })
  parent.add(mesh)
  return mesh
}

function bolt(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number, radius = 0.1): void {
  parent.add(cylinder(material, radius, 0.13, [x, y, z], Z_AXIS, 10))
}

function addRearMount(parent: Group, m: Materials): void {
  box(parent, m.graphiteShade, [6.3, 4.5, 0.28], [-0.18, 2.25, -0.72], 0.34, 0.075)
  box(parent, m.ink, [5.88, 4.08, 0.18], [-0.18, 2.25, -0.54], 0.28, 0.055)

  for (const x of [-2.83, 2.47]) for (const y of [0.48, 4.02]) {
    box(parent, m.graphite, [0.52, 0.72, 0.12], [x, y, -0.32], 0.17, 0.038)
    bolt(parent, m.steel, x, y, -0.22, 0.13)
    bolt(parent, m.ink, x, y, -0.13, 0.065)
  }

  // Rear center spine closes the wall-side load path; the full plate itself reaches ground.
  box(parent, m.graphite, [0.5, 3.56, 0.34], [-0.18, 2.25, -0.87], 0.15, 0.038)
}

function addCapturedShell(parent: Group, m: Materials): void {
  // Four overlapping rails form the actual pale cradle; the mounting plate remains visible through it.
  box(parent, m.shellShade, [5.38, 0.64, 1.02], [0.24, 3.76, 0.12], 0.24, 0.06)
  box(parent, m.shellShade, [5.38, 0.64, 1.02], [0.24, 0.68, 0.12], 0.24, 0.06)
  box(parent, m.shell, [0.72, 3.36, 1.1], [-2.2, 2.22, 0.16], 0.25, 0.06)
  box(parent, m.shell, [0.72, 3.36, 1.1], [2.68, 2.22, 0.16], 0.25, 0.06)
  box(parent, m.shellShade, [0.42, 2.24, 0.5], [-1.95, 2.22, 0.36], 0.14, 0.035)
  box(parent, m.shellShade, [0.42, 2.24, 0.5], [2.43, 2.22, 0.36], 0.14, 0.035)

  // The reference exposes a real wall-side service cavity and triangular carrier on the left.
  box(parent, m.ink, [0.7, 2.34, 0.22], [-2.66, 2.22, 0.18], 0.16, 0.038)
  box(parent, m.graphiteShade, [0.16, 2.42, 0.34], [-3.0, 2.22, 0.2], 0.06, 0.016)
  box(parent, m.shell, [0.22, 1.22, 0.28], [-2.55, 1.25, 0.34], 0.07, 0.018, [0, 0, -0.48])
  box(parent, m.shell, [0.22, 1.22, 0.28], [-2.55, 3.19, 0.34], 0.07, 0.018, [0, 0, 0.48])

  // Broad captured brace blocks bridge plate and cradle without thin cantilevered plates.
  for (const x of [-2.22, 2.7]) for (const y of [0.96, 3.48]) {
    box(parent, m.shell, [0.88, 0.58, 0.72], [x, y, -0.02], 0.2, 0.048, [0, 0, x < 0 === y < 2 ? -0.28 : 0.28])
    bolt(parent, m.steel, x, y, 0.39, 0.078)
  }
  box(parent, m.cyan, [0.38, 0.08, 0.08], [-2.18, 0.9, 0.51], 0.025, 0.008)
}

function addRoundedContour(
  target: Shape | Path,
  width: number,
  height: number,
  radius: number,
  clockwise = false,
  offsetX = 0,
  offsetY = 0,
): void {
  const x = width / 2
  const y = height / 2
  if (!clockwise) {
    target.moveTo(offsetX - x + radius, offsetY - y)
    target.lineTo(offsetX + x - radius, offsetY - y)
    target.quadraticCurveTo(offsetX + x, offsetY - y, offsetX + x, offsetY - y + radius)
    target.lineTo(offsetX + x, offsetY + y - radius)
    target.quadraticCurveTo(offsetX + x, offsetY + y, offsetX + x - radius, offsetY + y)
    target.lineTo(offsetX - x + radius, offsetY + y)
    target.quadraticCurveTo(offsetX - x, offsetY + y, offsetX - x, offsetY + y - radius)
    target.lineTo(offsetX - x, offsetY - y + radius)
    target.quadraticCurveTo(offsetX - x, offsetY - y, offsetX - x + radius, offsetY - y)
  } else {
    target.moveTo(offsetX - x + radius, offsetY - y)
    target.quadraticCurveTo(offsetX - x, offsetY - y, offsetX - x, offsetY - y + radius)
    target.lineTo(offsetX - x, offsetY + y - radius)
    target.quadraticCurveTo(offsetX - x, offsetY + y, offsetX - x + radius, offsetY + y)
    target.lineTo(offsetX + x - radius, offsetY + y)
    target.quadraticCurveTo(offsetX + x, offsetY + y, offsetX + x, offsetY + y - radius)
    target.lineTo(offsetX + x, offsetY - y + radius)
    target.quadraticCurveTo(offsetX + x, offsetY - y, offsetX + x - radius, offsetY - y)
  }
  target.closePath()
}

function createBoredFace(material: MeshPhysicalMaterial): Mesh {
  const shape = new Shape()
  const x = 2.46; const y = 1.76; const cut = 0.34
  shape.moveTo(-x + cut, -y)
  shape.lineTo(x - cut, -y)
  shape.lineTo(x, -y + cut)
  shape.lineTo(x, y - cut)
  shape.lineTo(x - cut, y)
  shape.lineTo(-x + cut, y)
  shape.lineTo(-x, y - cut)
  shape.lineTo(-x, -y + cut)
  shape.closePath()
  for (const y of [-0.88, 0, 0.88]) {
    const hole = new Path()
    addRoundedContour(hole, 2.9, 0.62, 0.2, true, 0, y)
    shape.holes.push(hole)
  }
  for (const x of [-1.98, 1.98]) {
    const lampHole = new Path()
    addRoundedContour(lampHole, 0.38, 2.26, 0.1, true, x, 0)
    shape.holes.push(lampHole)
  }
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.46,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.09,
    bevelThickness: 0.085,
    curveSegments: 4,
    steps: 1,
  })
  geometry.computeVertexNormals()
  const face = new Mesh(geometry, material)
  face.name = 'continuous bumper face with three genuine apertures'
  face.position.set(0.35, 2.22, 1.34)
  return face
}

function addBumperFace(parent: Group, m: Materials): void {
  // One continuous extruded load shell contains three real voids. Deep backings sit well behind it.
  box(parent, m.graphiteShade, [4.86, 3.5, 1.12], [0.35, 2.22, 0.8], 0.4, 0.1)
  for (const y of [1.34, 2.22, 3.1]) {
    box(parent, m.ink, [2.9, 0.62, 0.24], [0.35, y, 1.58], 0.17, 0.045)
  }
  parent.add(createBoredFace(m.graphite))

  // Small face fasteners are recessed in the structural shoulders.
  for (const x of [-1.74, 2.44]) for (const y of [0.92, 3.52]) bolt(parent, m.steel, x, y, 1.69, 0.065)
}

function addLampWell(parent: Group, m: Materials, x: number): void {
  box(parent, m.graphiteShade, [0.54, 2.48, 0.14], [x, 2.22, 1.31], 0.13, 0.032)
  box(parent, m.ink, [0.38, 2.26, 0.12], [x, 2.22, 1.44], 0.1, 0.024)
  box(parent, m.amber, [0.28, 2.1, 0.08], [x, 2.22, 1.7], 0.085, 0.02)
  for (const y of [1.38, 1.94, 2.5, 3.06]) {
    box(parent, m.amber, [0.24, 0.36, 0.07], [x, y, 1.76], 0.065, 0.018)
  }
}

function build(): {
  root: Group
  materials: Materials
  handles: MaterialHandle[]
  geometries: Array<{ dispose: () => void }>
} {
  const acquired = acquireMaterials()
  const m = acquired.materials
  const root = new Group()
  root.name = 'loading dock bumper'
  const fixed = new Group()
  fixed.name = 'static grounded wall bumper assembly'
  root.add(fixed)

  addRearMount(fixed, m)
  addCapturedShell(fixed, m)
  addBumperFace(fixed, m)
  addLampWell(fixed, m, -1.63)
  addLampWell(fixed, m, 2.33)

  const geometries = mergeStaticByMaterial(fixed, {
    meshName: (material: { name?: string }): string => material.name ?? 'loading dock bumper batch',
  })
  return { root, materials: m, handles: acquired.handles, geometries }
}

export function createModel(): DockBumperController {
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
  scene.add(new HemisphereLight(0xd4d6d3, 0x06080a, 0.54))
  const key = new DirectionalLight(0xffead9, 2.65); key.position.set(-8, 9, 11); scene.add(key)
  const fill = new DirectionalLight(0x759bc6, 0.82); fill.position.set(9, 5, 8); scene.add(fill)
  const rim = new DirectionalLight(0xb2c5c7, 1.25); rim.position.set(7, 8, -9); scene.add(rim)
  let floorMaterial: MeshPhysicalMaterial | undefined
  let floorGeometry: PlaneGeometry | undefined
  if (options.mode && options.mode !== 'beauty') {
    floorMaterial = new MeshPhysicalMaterial({ color: 0x050708, roughness: 0.94, metalness: 0.04 })
    floorGeometry = new PlaneGeometry(15, 15)
    const floor = new Mesh(floorGeometry, floorMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.006
    floor.userData.excludeFromExport = true
    scene.add(floor)
  }

  const camera = new PerspectiveCamera(33, options.aspect ?? 1, 0.12, 90)
  if (options.mode === 'side') camera.position.set(-8.4, 3.2, 0.5)
  else if (options.mode === 'rear') camera.position.set(7.5, 3.3, -8.4)
  else if (options.mode === 'low') camera.position.set(-6.5, 0.78, 8.4)
  else camera.position.set(-6.1, 4.4, 10.8)
  camera.lookAt(0.05, options.mode === 'low' ? 1.95 : 2.2, 0.32)
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

export const createPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'low' })
