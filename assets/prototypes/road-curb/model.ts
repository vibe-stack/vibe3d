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
  Shape,
  ExtrudeGeometry,
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
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'maintained', seed: 28101 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 28102 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 28103 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 28104 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 28105 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 28106 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 28107 })
  return {
    handles: [shell, shellShade, graphite, ink, steel, amber, cyan],
    materials: {
      shell: tuneMaterial(shell, 0xb9bfbd, 0.56, 0.22, { clearcoat: 0.09 }),
      shellShade: tuneMaterial(shellShade, 0x939a99, 0.6, 0.36, { clearcoat: 0.06 }),
      graphite: tuneMaterial(graphite, 0x20262b, 0.55, 0.64, { clearcoat: 0.07 }),
      ink: tuneMaterial(ink, 0x07090b, 0.8, 0.14),
      steel: tuneMaterial(steel, 0x8f989b, 0.34, 0.82, { clearcoat: 0.08 }),
      amber: tuneMaterial(amber, 0xe68513, 0.2, 0.03, { emissive: 0.78, clearcoat: 0.28 }),
      cyan: tuneMaterial(cyan, 0x38d6df, 0.22, 0.04, { emissive: 0.8, clearcoat: 0.24 }),
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

function boltZ(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number, radius = 0.05): void {
  parent.add(cylinder(material, radius, 0.09, [x, y, z], Z_AXIS, 8))
}

function boltX(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number): void {
  parent.add(cylinder(material, 0.055, 0.1, [x, y, z], X_AXIS, 8))
}

function addEndPillar(parent: Group, material: MeshPhysicalMaterial, side: -1 | 1): void {
  const points: Array<[number, number]> = [
    [2.96, 0.18],
    [3.58, 0.18],
    [3.72, 0.54],
    [3.72, 1.52],
    [3.58, 1.96],
    [3.28, 1.96],
    [3.08, 1.56],
    [3.08, 0.58],
  ]
  const ordered = side < 0 ? points.map(([x, y]) => [-x, y] as [number, number]).reverse() : points
  const shape = new Shape()
  shape.moveTo(ordered[0][0], ordered[0][1])
  for (let i = 1; i < ordered.length; i += 1) shape.lineTo(ordered[i][0], ordered[i][1])
  shape.closePath()
  const geometry = new ExtrudeGeometry(shape, { depth: 1.06, steps: 1, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.045, bevelThickness: 0.045, curveSegments: 1 })
  const pillar = new Mesh(geometry, material)
  pillar.position.z = -0.53
  parent.add(pillar)
}

function addStructure(root: Group, m: Materials): void {
  // One continuous grounded load path closes the rear and supports the recessed service face.
  box(root, m.ink, [7.4, 0.16, 1.2], [0, 0.08, 0], 0.08, 0.022)
  box(root, m.graphite, [7.28, 0.36, 1.14], [0, 0.28, 0], 0.1, 0.028)
  box(root, m.shellShade, [7.04, 1.66, 0.9], [0, 1.08, -0.08], 0.16, 0.045)
  box(root, m.shell, [6.72, 0.92, 1.06], [0, 1.52, -0.01], 0.18, 0.052)
  addEndPillar(root, m.shell, -1)
  addEndPillar(root, m.shell, 1)
  box(root, m.graphite, [6.78, 0.28, 1.08], [0, 0.42, 0.01], 0.08, 0.024)
  // Center split is a real dark reveal rather than an overlaid coplanar line.
  box(root, m.graphite, [0.075, 1.08, 1.07], [0, 1.47, 0], 0.024, 0.008)
}

function addFrontServiceFace(root: Group, m: Materials): void {
  const front = 0.3
  // The service band is one continuous deep cassette enclosed by a thick load frame.
  box(root, m.ink, [6.06, 0.76, 0.2], [0, 0.76, front], 0.1, 0.026)
  box(root, m.graphite, [6.14, 0.18, 0.26], [0, 1.07, front + 0.14], 0.06, 0.018)
  box(root, m.graphite, [6.14, 0.18, 0.26], [0, 0.45, front + 0.14], 0.06, 0.018)
  box(root, m.graphite, [0.22, 0.76, 0.26], [-2.96, 0.76, front + 0.14], 0.06, 0.018)
  box(root, m.graphite, [0.22, 0.76, 0.26], [2.96, 0.76, front + 0.14], 0.06, 0.018)
  box(root, m.graphite, [2.7, 0.45, 0.12], [-1.49, 0.76, front + 0.12], 0.08, 0.022)
  box(root, m.graphite, [2.7, 0.45, 0.12], [1.49, 0.76, front + 0.12], 0.08, 0.022)
  box(root, m.ink, [2.28, 0.29, 0.06], [-1.52, 0.76, front + 0.22], 0.06, 0.018)
  box(root, m.ink, [2.28, 0.29, 0.06], [1.52, 0.76, front + 0.22], 0.06, 0.018)
  box(root, m.graphite, [0.34, 0.65, 0.22], [0, 0.75, front + 0.13], 0.06, 0.018)
  box(root, m.ink, [0.17, 0.34, 0.07], [0, 0.72, front + 0.28], 0.035, 0.01)

  // Deep perforated intake on the left panel.
  box(root, m.graphite, [1.64, 0.27, 0.08], [-1.68, 0.76, front + 0.31], 0.07, 0.018)
  for (let row = -1; row <= 1; row += 1) {
    for (let column = -5; column <= 5; column += 1) {
      boltZ(root, m.ink, -1.68 + column * 0.13, 0.76 + row * 0.075, front + 0.37, 0.027)
    }
  }
  // Right access cassette and clearly seated fasteners.
  box(root, m.graphite, [1.9, 0.28, 0.08], [1.52, 0.76, front + 0.31], 0.055, 0.016)
  for (const x of [0.76, 2.28]) for (const y of [0.67, 0.85]) boltZ(root, m.steel, x, y, front + 0.38, 0.03)
  for (const x of [-2.62, -0.4]) for (const y of [0.65, 0.87]) boltZ(root, m.steel, x, y, front + 0.38, 0.03)

  // Center amber marker and its captured shoulder housing.
  box(root, m.graphite, [0.24, 0.74, 0.22], [0, 1.25, front + 0.18], 0.04, 0.012)
  box(root, m.amber, [0.08, 0.4, 0.07], [0, 1.27, front + 0.34], 0.018, 0.006)
  // Restrained support witnesses at the shell-end seams.
  for (const x of [-3.02, 3.02]) {
    box(root, m.cyan, [0.035, 0.62, 0.045], [x, 1.5, 0.555], 0.012, 0.004)
  }
}

function addSideAndRearHardware(root: Group, m: Materials): void {
  // End faces carry recessed service plates with fasteners embedded into the load piers.
  for (const x of [-3.62, 3.62]) {
    box(root, m.shellShade, [0.08, 0.72, 0.38], [x, 1.08, 0.04], 0.04, 0.012)
    boltX(root, m.steel, x + (x < 0 ? -0.05 : 0.05), 1.32, 0.04)
    boltX(root, m.steel, x + (x < 0 ? -0.05 : 0.05), 0.84, 0.04)
  }
  // Closed rear service anatomy, shallow but physically proud of the rear shell.
  box(root, m.graphite, [2.26, 0.56, 0.12], [1.52, 0.8, -0.53], 0.08, 0.022)
  box(root, m.shellShade, [1.84, 0.34, 0.08], [1.52, 0.8, -0.63], 0.06, 0.016)
  box(root, m.ink, [1.48, 0.12, 0.07], [-1.55, 0.8, -0.57], 0.04, 0.012)
  for (const x of [-2.12, -1.74, -1.36, -0.98]) box(root, m.graphite, [0.12, 0.34, 0.08], [x, 0.8, -0.62], 0.03, 0.009)
}

function build(): {
  root: Group
  handles: MaterialHandle[]
  wear: MeshPhysicalMaterial
  geometries: Array<{ dispose: () => void }>
} {
  const acquired = acquireMaterials()
  const root = new Group()
  root.name = 'road curb'
  addStructure(root, acquired.materials)
  addFrontServiceFace(root, acquired.materials)
  addSideAndRearHardware(root, acquired.materials)

  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [acquired.materials.shell, { rub: 0.06, grime: 0.025, scratch: 0.009 }],
    [acquired.materials.shellShade, { rub: 0.07, grime: 0.035, scratch: 0.01 }],
    [acquired.materials.steel, { rub: 0.12, grime: 0.04, scratch: 0.018 }],
  ])
  bakeOcclusion(root, { reach: 0.14 })
  bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'road-curb / localized structural wear', clearcoat: 0.07, clearcoatRoughness: 0.58 })
  root.traverse((object) => {
    if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear
  })
  const geometries = mergeStaticByMaterial(root, {
    retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material: { name?: string }): string => material.name ?? 'road-curb batch',
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
  scene.add(new HemisphereLight(0xcbd2d2, 0x080a0d, 0.8))
  const key = new DirectionalLight(0xffeadb, 2.55); key.position.set(-7, 8, 9); scene.add(key)
  const fill = new DirectionalLight(0x7394bd, 1.0); fill.position.set(8, 4, 6); scene.add(fill)
  const rim = new DirectionalLight(0x90b8bc, 0.75); rim.position.set(5, 6, -8); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x0a0d10, roughness: 0.94, metalness: 0.03 })
  const floorGeometry = new PlaneGeometry(18, 12)
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.006
  floor.userData.excludeFromExport = true
  scene.add(floor)
  const camera = new PerspectiveCamera(30, options.aspect ?? 1, 0.12, 80)
  if (options.mode === 'side') camera.position.set(-7.6, 2.5, 0.15)
  else if (options.mode === 'rear') camera.position.set(5.8, 2.7, -6.1)
  else if (options.mode === 'low') camera.position.set(-5.8, 0.62, 5.2)
  else camera.position.set(-10.2, 4.25, 9.8)
  camera.lookAt(0, options.mode === 'low' ? 0.85 : 1.05, 0.02)
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
