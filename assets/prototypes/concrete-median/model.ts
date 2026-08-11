import {
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Shape,
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

const Y_AXIS: Vec3 = [0, 0, 0]
const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]
const X_AXIS: Vec3 = [0, 0, Math.PI / 2]

interface Materials {
  concrete: MeshPhysicalMaterial
  concreteShade: MeshPhysicalMaterial
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
  const concrete = library.acquire({ recipeId: 'MAT-07', palette: 'SHELL-200', condition: 'worked', seed: 28301 })
  const concreteShade = library.acquire({ recipeId: 'MAT-07', palette: 'SHELL-500', condition: 'worked', seed: 28302 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 28303 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 28304 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 28305 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 28306 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 28307 })
  return {
    handles: [concrete, concreteShade, graphite, ink, steel, amber, cyan],
    materials: {
      concrete: tuneMaterial(concrete, 0xaeb1ab, 0.88, 0.03),
      concreteShade: tuneMaterial(concreteShade, 0x7f8581, 0.84, 0.08),
      graphite: tuneMaterial(graphite, 0x252b30, 0.58, 0.58, { clearcoat: 0.05 }),
      ink: tuneMaterial(ink, 0x06080a, 0.84, 0.12),
      steel: tuneMaterial(steel, 0x8f9799, 0.36, 0.8),
      amber: tuneMaterial(amber, 0xd47b0d, 0.22, 0.03, { emissive: 0.52, clearcoat: 0.24 }),
      cyan: tuneMaterial(cyan, 0x2aa6b3, 0.3, 0.06, { emissive: 0.38, clearcoat: 0.18 }),
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

function addMedianBody(root: Group, m: Materials): void {
  box(root, m.ink, [7.82, 0.16, 1.82], [0, 0.08, 0], 0.09, 0.024)
  box(root, m.graphite, [7.7, 0.42, 1.72], [0, 0.28, 0], 0.14, 0.038)

  const profile = new Shape()
  profile.moveTo(-0.74, 0.4)
  profile.lineTo(-0.58, 1.78)
  profile.lineTo(-0.46, 2.25)
  profile.lineTo(-0.34, 2.42)
  profile.lineTo(0.34, 2.42)
  profile.lineTo(0.46, 2.25)
  profile.lineTo(0.58, 1.78)
  profile.lineTo(0.74, 0.4)
  profile.closePath()
  const geometry = new ExtrudeGeometry(profile, {
    depth: 7.42,
    steps: 1,
    curveSegments: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.045,
    bevelThickness: 0.045,
  })
  geometry.translate(0, 0, -3.71)
  const body = new Mesh(geometry, m.concrete)
  body.name = 'continuous tapered concrete barrier shell'
  body.rotation.y = Math.PI / 2
  root.add(body)

  // End shoulders and narrow top cap reinforce the continuous load silhouette.
  for (const x of [-3.55, 3.55]) box(root, m.concreteShade, [0.38, 1.98, 1.5], [x, 1.36, 0], 0.11, 0.032)
  box(root, m.concreteShade, [7.05, 0.14, 0.82], [0, 2.36, 0], 0.08, 0.022)
}

function addReflectorBank(root: Group, m: Materials, front = true): void {
  const direction = front ? 1 : -1
  const z = direction * 0.64
  box(root, m.graphite, [6.92, 0.5, 0.18], [0, 1.6, z], 0.1, 0.028)
  box(root, m.ink, [6.56, 0.32, 0.1], [0, 1.6, z + direction * 0.13], 0.07, 0.018)
  const centers = [-2.65, -1.82, -1.0, 0, 1.0, 1.82, 2.65]
  for (const x of centers) {
    const center = x === 0
    const width = center ? 1.22 : 0.62
    box(root, m.graphite, [width + 0.18, center ? 0.4 : 0.3, 0.12], [x, 1.6, z + direction * 0.22], center ? 0.1 : 0.06, 0.02)
    box(root, m.amber, [width, center ? 0.25 : 0.18, 0.07], [x, 1.6, z + direction * 0.31], center ? 0.075 : 0.045, 0.014)
  }
  for (const x of [-3.25, -2.28, -1.4, 1.4, 2.28, 3.25]) {
    root.add(cylinder(m.steel, 0.035, 0.07, [x, 1.6, z + direction * 0.36], Z_AXIS, 8))
  }
}

function addServiceDetails(root: Group, m: Materials): void {
  // Lower recessed load slots and circular access ports are swallowed by the concrete face.
  for (const x of [-1.75, 1.75]) {
    box(root, m.graphite, [1.0, 0.34, 0.2], [x, 0.55, 0.77], 0.1, 0.028)
    box(root, m.ink, [0.68, 0.16, 0.1], [x, 0.56, 0.91], 0.05, 0.014)
    box(root, m.steel, [0.42, 0.07, 0.06], [x, 0.56, 0.99], 0.025, 0.008)
  }
  for (const x of [-1.25, 1.25]) {
    root.add(cylinder(m.graphite, 0.11, 0.09, [x, 0.91, 0.75], Z_AXIS, 12))
    root.add(cylinder(m.ink, 0.055, 0.1, [x, 0.91, 0.84], Z_AXIS, 10))
  }
  // Three top anchor recesses are embedded in the cap.
  for (const x of [-2.65, 0, 2.65]) {
    root.add(cylinder(m.graphite, 0.09, 0.06, [x, 2.46, 0], Y_AXIS, 12))
    root.add(cylinder(m.ink, 0.045, 0.065, [x, 2.49, 0], Y_AXIS, 10))
  }
  // Side-face service panel visible from the hero angle.
  box(root, m.graphite, [0.18, 1.02, 0.54], [-3.79, 1.15, 0], 0.09, 0.026)
  box(root, m.ink, [0.11, 0.72, 0.34], [-3.91, 1.17, 0], 0.07, 0.02)
  box(root, m.cyan, [0.04, 0.38, 0.07], [-3.99, 1.35, 0], 0.018, 0.006)
  root.add(cylinder(m.steel, 0.08, 0.08, [-3.98, 0.97, 0], X_AXIS, 12))
  for (const x of [-3.47, 3.47]) box(root, m.amber, [0.25, 0.08, 1.46], [x, 0.62, 0], 0.025, 0.008)
}

function build(): {
  root: Group
  handles: MaterialHandle[]
  wear: MeshPhysicalMaterial
  geometries: Array<{ dispose: () => void }>
} {
  const acquired = acquireMaterials()
  const root = new Group()
  root.name = 'concrete median'
  addMedianBody(root, acquired.materials)
  addReflectorBank(root, acquired.materials, true)
  addReflectorBank(root, acquired.materials, false)
  addServiceDetails(root, acquired.materials)

  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [acquired.materials.graphite, { rub: 0.05, grime: 0.04, scratch: 0.009 }],
    [acquired.materials.steel, { rub: 0.14, grime: 0.045, scratch: 0.02 }],
  ])
  bakeOcclusion(root, { reach: 0.06 })
  bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'concrete-median / maintained metal wear', clearcoat: 0.05, clearcoatRoughness: 0.65 })
  root.traverse((object) => {
    if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear
  })
  const geometries = mergeStaticByMaterial(root, {
    retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material: { name?: string }): string => material.name ?? 'concrete-median batch',
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
  scene.add(new HemisphereLight(0xc7cdcc, 0x080a0c, 0.8))
  const key = new DirectionalLight(0xffead8, 2.7); key.position.set(-7, 9, 10); scene.add(key)
  const fill = new DirectionalLight(0x7799bd, 0.95); fill.position.set(8, 5, 6); scene.add(fill)
  const rim = new DirectionalLight(0x8eb4b9, 0.72); rim.position.set(5, 7, -8); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x090c0f, roughness: 0.95, metalness: 0.02 })
  const floorGeometry = new PlaneGeometry(18, 14)
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.006
  floor.userData.excludeFromExport = true
  scene.add(floor)
  const camera = new PerspectiveCamera(31, options.aspect ?? 1, 0.14, 80)
  if (options.mode === 'side') camera.position.set(-8.8, 2.7, 0.1)
  else if (options.mode === 'rear') camera.position.set(6.9, 3.2, -6.9)
  else if (options.mode === 'low') camera.position.set(-6.8, 0.7, 6.0)
  else camera.position.set(-11.8, 5.35, 11.2)
  camera.lookAt(0, options.mode === 'low' ? 1.0 : 1.2, 0)
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
