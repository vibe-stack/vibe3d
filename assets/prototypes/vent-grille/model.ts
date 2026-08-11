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
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 38201 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 38202 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 38203 })
  const graphiteShade = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-900', condition: 'maintained', seed: 38204 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 38205 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 38206 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 38207 })
  const amberDim = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-500', condition: 'maintained', seed: 38208 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 38209 })
  return {
    handles: [shell, shellShade, graphite, graphiteShade, ink, steel, amber, amberDim, cyan],
    materials: {
      shell: tuneMaterial(shell, 0xd6d9d7, 0.43, 0.25, { clearcoat: 0.14 }),
      shellShade: tuneMaterial(shellShade, 0x969fa1, 0.52, 0.38, { clearcoat: 0.08 }),
      graphite: tuneMaterial(graphite, 0x242a30, 0.5, 0.54, { clearcoat: 0.1 }),
      graphiteShade: tuneMaterial(graphiteShade, 0x111519, 0.65, 0.4, { clearcoat: 0.05 }),
      ink: tuneMaterial(ink, 0x020304, 0.86, 0.06),
      steel: tuneMaterial(steel, 0x788187, 0.34, 0.84, { clearcoat: 0.08 }),
      amber: tuneMaterial(amber, 0xf28b06, 0.17, 0.03, { emissive: 0.75, clearcoat: 0.26 }),
      amberDim: tuneMaterial(amberDim, 0x8a4505, 0.43, 0.02, { emissive: 0.2, clearcoat: 0.1 }),
      cyan: tuneMaterial(cyan, 0x47d7df, 0.2, 0.03, { emissive: 0.7, clearcoat: 0.2 }),
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
    fillet: Math.min(0.055, Math.max(0.008, chamfer * 0.28)),
    bevel,
    rotation,
  })
  parent.add(mesh)
  return mesh
}

function bolt(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number): void {
  parent.add(cylinder(material, 0.12, 0.13, [x, y, z], Z_AXIS, 10))
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

function extrudedFrame(
  material: MeshPhysicalMaterial,
  outer: [number, number, number],
  inner: [number, number, number],
  depth: number,
  position: Vec3,
): Mesh {
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

function addOuterPlate(parent: Group, m: Materials): void {
  parent.add(extrudedFrame(m.shell, [6.7, 5.4, 0.3], [5.28, 4.16, 0.3], 0.34, [0, 2.7, -0.48]))
  parent.add(extrudedFrame(m.shellShade, [5.48, 4.4, 0.36], [4.8, 3.72, 0.28], 0.28, [0, 2.7, -0.1]))
  for (const x of [-2.98, 2.98]) for (const y of [0.48, 4.92]) {
    box(parent, m.shellShade, [0.48, 0.48, 0.2], [x, y, 0.02], 0.13, 0.032)
    bolt(parent, m.steel, x, y, 0.18)
    parent.add(cylinder(m.ink, 0.05, 0.14, [x, y, 0.26], Z_AXIS, 8))
  }
  box(parent, m.shellShade, [1.18, 0.18, 0.22], [0, 5.18, -0.05], 0.07, 0.02)
  box(parent, m.graphite, [0.56, 0.12, 0.18], [0, 5.03, 0.12], 0.04, 0.012)
  box(parent, m.shellShade, [1.18, 0.18, 0.22], [0, 0.22, -0.05], 0.07, 0.02)
  box(parent, m.graphite, [0.56, 0.12, 0.18], [0, 0.37, 0.12], 0.04, 0.012)
  for (const x of [-3.13, 3.13]) {
    box(parent, m.shellShade, [0.18, 2.8, 0.12], [x, 2.7, -0.05], 0.055, 0.015)
    box(parent, m.graphite, [0.11, 0.66, 0.08], [x, 1.0, 0.03], 0.035, 0.01)
  }
}

function addFilterCore(parent: Group, m: Materials): void {
  // Closed amber backing behind two layers of dark lattice gives the filter a dense illuminated core.
  box(parent, m.ink, [4.58, 3.62, 0.2], [0, 2.625, 0.08], 0.24, 0.055)
  box(parent, m.amberDim, [4.32, 3.34, 0.08], [0, 2.625, 0.22], 0.18, 0.04)
  for (let row = 0; row < 7; row += 1) for (let column = 0; column < 9; column += 1) {
    const x = -1.86 + column * 0.465
    const y = 1.26 + row * 0.455
    box(parent, m.graphiteShade, [0.04, 0.56, 0.05], [x, y, 0.32], 0.012, 0.004, [0, 0, 0.58])
    box(parent, m.graphiteShade, [0.04, 0.56, 0.05], [x, y, 0.34], 0.012, 0.004, [0, 0, -0.58])
  }
  parent.add(extrudedFrame(m.graphite, [5.02, 4.04, 0.28], [4.5, 3.52, 0.24], 0.42, [0, 2.625, 0.3]))
}

function addLouvers(parent: Group, m: Materials): void {
  const yPositions = [1.16, 1.65, 2.14, 2.63, 3.12, 3.61, 4.1]
  for (const y of yPositions) {
    box(parent, m.graphite, [4.3, 0.23, 0.68], [0, y, 0.8], 0.09, 0.024, [0.25, 0, 0])
    box(parent, m.graphiteShade, [4.0, 0.05, 0.09], [0, y + 0.14, 1.12], 0.016, 0.005, [0.27, 0, 0])
  }
  box(parent, m.graphiteShade, [0.1, 3.42, 0.18], [0, 2.62, 1.03], 0.03, 0.009)
  for (const y of [1.16, 2.14, 3.12, 4.1]) parent.add(cylinder(m.graphiteShade, 0.045, 0.07, [0, y, 1.2], Z_AXIS, 8))
}

function addServiceLandmarks(parent: Group, m: Materials): void {
  // Left recessed service well and right three-bar status channel sit inside the pale plate.
  box(parent, m.graphiteShade, [0.48, 1.54, 0.12], [-2.9, 2.7, -0.04], 0.13, 0.032)
  box(parent, m.ink, [0.3, 1.25, 0.08], [-2.9, 2.7, 0.05], 0.09, 0.022)
  box(parent, m.amber, [0.1, 0.4, 0.055], [-2.9, 2.92, 0.12], 0.04, 0.01)
  box(parent, m.amber, [0.16, 0.14, 0.055], [-2.9, 2.37, 0.12], 0.05, 0.012, [0, 0, Math.PI / 4])
  box(parent, m.graphiteShade, [0.34, 1.44, 0.12], [2.9, 2.7, -0.03], 0.1, 0.026)
  for (const y of [2.3, 2.7, 3.1]) box(parent, m.amber, [0.09, 0.22, 0.055], [2.9, y, 0.08], 0.03, 0.009)
  box(parent, m.cyan, [0.1, 0.26, 0.05], [-3.17, 3.45, -0.01], 0.03, 0.008)
}

function build(): {
  root: Group
  handles: MaterialHandle[]
  geometries: Array<{ dispose: () => void }>
} {
  const acquired = acquireMaterials()
  const root = new Group()
  root.name = 'industrial vent grille'
  const fixed = new Group()
  fixed.name = 'static grounded vent grille assembly'
  root.add(fixed)
  addOuterPlate(fixed, acquired.materials)
  addFilterCore(fixed, acquired.materials)
  addLouvers(fixed, acquired.materials)
  addServiceLandmarks(fixed, acquired.materials)
  const geometries = mergeStaticByMaterial(fixed, {
    meshName: (material: { name?: string }): string => material.name ?? 'vent grille batch',
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
  scene.add(new HemisphereLight(0xd8d9d6, 0x050709, 0.58))
  const key = new DirectionalLight(0xffebd7, 2.85); key.position.set(-7, 9, 10); scene.add(key)
  const fill = new DirectionalLight(0x789bc3, 0.85); fill.position.set(8, 5, 7); scene.add(fill)
  const rim = new DirectionalLight(0xabc5c8, 1.0); rim.position.set(7, 8, -8); scene.add(rim)
  let floorMaterial: MeshPhysicalMaterial | undefined
  let floorGeometry: PlaneGeometry | undefined
  if (options.mode && options.mode !== 'beauty') {
    floorMaterial = new MeshPhysicalMaterial({ color: 0x020304, roughness: 0.96, metalness: 0.02 })
    floorGeometry = new PlaneGeometry(14, 14)
    const floor = new Mesh(floorGeometry, floorMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.006
    floor.userData.excludeFromExport = true
    scene.add(floor)
  }
  const camera = new PerspectiveCamera(32, options.aspect ?? 1, 0.12, 80)
  if (options.mode === 'side') camera.position.set(-8, 2.8, 0.5)
  else if (options.mode === 'rear') camera.position.set(6.6, 3.0, -8.2)
  else if (options.mode === 'low') camera.position.set(-5.8, 0.72, 7.8)
  else camera.position.set(-4.7, 3.55, 13.6)
  camera.lookAt(0, options.mode === 'low' ? 2.2 : 2.62, 0.25)
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
