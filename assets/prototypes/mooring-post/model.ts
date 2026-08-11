import {
  CatmullRomCurve3,
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
  TubeGeometry,
  Vector3,
} from 'three/webgpu'

import {
  WEAR_ATTRIBUTES,
  bakeOcclusion,
  bakeSurfaceAttributes,
  createWearMaterial,
  cylinder,
  mergeStaticByMaterial,
  prism,
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

function materials(): Materials {
  return {
    shell: new MeshPhysicalMaterial({ name: 'mooring post / pale armor', color: 0xbfc5c3, roughness: 0.5, metalness: 0.3, clearcoat: 0.1, clearcoatRoughness: 0.48 }),
    shellShade: new MeshPhysicalMaterial({ name: 'mooring post / shaded armor', color: 0x858f92, roughness: 0.58, metalness: 0.46, clearcoat: 0.06 }),
    graphite: new MeshPhysicalMaterial({ name: 'mooring post / graphite chassis', color: 0x20272e, roughness: 0.57, metalness: 0.64, clearcoat: 0.06 }),
    ink: new MeshPhysicalMaterial({ name: 'mooring post / deep recess', color: 0x05080a, roughness: 0.86, metalness: 0.08 }),
    steel: new MeshPhysicalMaterial({ name: 'mooring post / exposed steel', color: 0x929b9d, roughness: 0.3, metalness: 0.9, clearcoat: 0.08 }),
    amber: new MeshPhysicalMaterial({ name: 'mooring post / amber marker', color: 0xc36d08, emissive: new Color(0xff8706), emissiveIntensity: 0.52, roughness: 0.28, metalness: 0.04, clearcoat: 0.2 }),
    cyan: new MeshPhysicalMaterial({ name: 'mooring post / cyan service witness', color: 0x28aeb9, emissive: new Color(0x1c93a0), emissiveIntensity: 0.45, roughness: 0.3, metalness: 0.04, clearcoat: 0.16 }),
  }
}

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.08, bevel = 0.025, rotation: Vec3 = [0, 0, 0]): Mesh {
  const mesh = prism(material, size, position, {
    chamfer,
    fillet: Math.min(0.05, Math.max(0.007, chamfer * 0.28)),
    bevel,
    rotation,
  })
  parent.add(mesh)
  return mesh
}

function frustum(parent: Group, material: MeshPhysicalMaterial, bottomRadius: number, topRadius: number, height: number, y: number, radialSegments = 28): Mesh {
  const geometry = new CylinderGeometry(topRadius, bottomRadius, height, radialSegments, 1, false)
  const mesh = new Mesh(geometry, material)
  mesh.position.y = y
  parent.add(mesh)
  return mesh
}

function addBase(root: Group, m: Materials): void {
  root.add(cylinder(m.ink, 1.62, 0.12, [0, 0.06, 0], [0, 0, 0], 28))
  root.add(cylinder(m.graphite, 1.48, 0.28, [0, 0.21, 0], [0, 0, 0], 28))
  root.add(cylinder(m.shellShade, 1.26, 0.24, [0, 0.43, 0], [0, 0, 0], 28))
  for (const [x, z, yaw] of [[1.55, 0, 0], [-1.55, 0, 0], [0, 1.55, Math.PI / 2], [0, -1.55, Math.PI / 2]] as Array<[number, number, number]>) {
    box(root, m.graphite, [0.76, 0.2, 0.62], [x, 0.1, z], 0.18, 0.045, [0, yaw, 0])
    root.add(cylinder(m.steel, 0.1, 0.04, [x, 0.21, z], [0, 0, 0], 10))
    root.add(cylinder(m.ink, 0.045, 0.025, [x, 0.235, z], [0, 0, 0], 8))
  }
  for (const a of [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]) {
    box(root, m.graphite, [0.3, 0.58, 0.46], [Math.cos(a) * 1.17, 0.52, Math.sin(a) * 1.17], 0.1, 0.025, [0, -a, 0])
  }
}

function addBody(root: Group, m: Materials): void {
  root.add(cylinder(m.graphite, 1.16, 0.22, [0, 0.58, 0], [0, 0, 0], 28))
  root.add(cylinder(m.shell, 1.07, 1.82, [0, 1.46, 0], [0, 0, 0], 28))
  root.add(cylinder(m.shellShade, 1.08, 0.14, [0, 0.65, 0], [0, 0, 0], 28))
  root.add(cylinder(m.graphite, 1.09, 0.2, [0, 1.12, 0], [0, 0, 0], 28))
  root.add(cylinder(m.cyan, 1.1, 0.055, [0, 1.25, 0], [0, 0, 0], 28))
  root.add(cylinder(m.shellShade, 1.08, 0.08, [0, 2.35, 0], [0, 0, 0], 28))

  // Front service recess and the load-bearing mooring handle.
  box(root, m.graphite, [1.58, 1.34, 0.28], [0, 2.04, 1.12], 0.3, 0.072)
  box(root, m.ink, [1.26, 1.02, 0.1], [0, 2.04, 1.14], 0.23, 0.055)
  const handleCurve = new CatmullRomCurve3([
    new Vector3(-0.56, 2.43, 1.24),
    new Vector3(-0.64, 2.15, 1.27),
    new Vector3(-0.53, 1.86, 1.29),
    new Vector3(0, 1.71, 1.31),
    new Vector3(0.53, 1.86, 1.29),
    new Vector3(0.64, 2.15, 1.27),
    new Vector3(0.56, 2.43, 1.24),
  ], false, 'centripetal')
  const handle = new Mesh(new TubeGeometry(handleCurve, 36, 0.095, 10, false), m.steel)
  handle.name = 'continuous captured mooring handle'
  root.add(handle)
  for (const x of [-0.56, 0.56]) {
    root.add(cylinder(m.graphite, 0.19, 0.24, [x, 2.43, 1.18], Z_AXIS, 14))
    root.add(cylinder(m.steel, 0.1, 0.3, [x, 2.43, 1.2], Z_AXIS, 12))
  }
  box(root, m.amber, [0.92, 0.14, 0.07], [0, 2.68, 1.2], 0.055, 0.014)

  // Side and rear service shells keep the full cylinder authored.
  for (const side of [-1, 1]) {
    box(root, m.graphite, [0.14, 0.74, 0.58], [side * 1.01, 1.86, 0], 0.14, 0.035, [0, 0, side * 0.04])
    root.add(cylinder(m.steel, 0.045, 0.08, [side * 1.15, 1.62, 0], [0, 0, Math.PI / 2], 8))
  }
  box(root, m.graphite, [0.82, 0.56, 0.14], [0, 1.78, -1.02], 0.12, 0.03)
  box(root, m.ink, [0.58, 0.32, 0.08], [0, 1.78, -1.12], 0.08, 0.02)
  for (const x of [-0.27, 0.27]) root.add(cylinder(m.steel, 0.045, 0.08, [x, 1.78, -1.18], Z_AXIS, 8))
}

function addCap(root: Group, m: Materials): void {
  root.add(cylinder(m.graphite, 1.16, 0.2, [0, 2.62, 0], [0, 0, 0], 28))
  frustum(root, m.shellShade, 1.48, 1.28, 0.42, 2.84, 12)
  frustum(root, m.shell, 1.4, 1.18, 0.32, 2.98, 12)
  root.add(cylinder(m.graphite, 0.7, 0.16, [0, 3.19, 0], [0, 0, 0], 24))
  root.add(cylinder(m.amber, 0.5, 0.07, [0, 3.3, 0], [0, 0, 0], 24))
  for (const x of [-0.22, 0, 0.22]) box(root, m.graphite, [0.13, 0.045, 0.5], [x, 3.345, 0], 0.03, 0.008, [0, x * 1.3, 0])
  root.add(cylinder(m.ink, 0.19, 0.11, [0, 3.33, 0], [0, 0, 0], 16))
  for (let index = 0; index < 4; index += 1) {
    const a = index * Math.PI / 2 + Math.PI / 4
    root.add(cylinder(m.steel, 0.055, 0.08, [Math.cos(a) * 0.92, 3.13, Math.sin(a) * 0.92], [0, 0, 0], 8))
  }
}

function build() {
  const m = materials()
  const root = new Group()
  root.name = 'mooring post'
  addBase(root, m)
  addBody(root, m)
  addCap(root, m)
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [m.shellShade, { rub: 0.085, grime: 0.045, scratch: 0.013 }],
    [m.steel, { rub: 0.2, grime: 0.05, scratch: 0.024 }],
  ])
  bakeOcclusion(root, { reach: 0.1 })
  bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'mooring post / localized maintained wear', clearcoat: 0.07, clearcoatRoughness: 0.56 })
  root.traverse((object) => {
    if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear
  })
  const geometries = mergeStaticByMaterial(root, {
    retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material: { name?: string }) => material.name ?? 'mooring-post batch',
  })
  return { root, m, wear, geometries }
}

export function createModel(): Controller {
  const rig = build()
  return {
    root: rig.root,
    update: () => {},
    dispose: () => {
      for (const geometry of rig.geometries) geometry.dispose()
      rig.wear.dispose()
      for (const material of Object.values(rig.m)) material.dispose()
    },
  }
}

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low' } = {}): Preview {
  const model = createModel()
  const scene = new Scene()
  scene.background = new Color(0x020405)
  scene.add(model.root)
  scene.add(new HemisphereLight(0xc6ced0, 0x06080b, 0.82))
  const key = new DirectionalLight(0xffead8, 2.8); key.position.set(-7, 9, 9); scene.add(key)
  const fill = new DirectionalLight(0x7196bf, 1.05); fill.position.set(8, 5, 7); scene.add(fill)
  const rim = new DirectionalLight(0x82adb2, 0.88); rim.position.set(7, 8, -8); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x030608, roughness: 0.95, metalness: 0.02 })
  const floorGeometry = new PlaneGeometry(12, 12)
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.004
  floor.userData.excludeFromExport = true
  scene.add(floor)
  const camera = new PerspectiveCamera(32, options.aspect ?? 1, 0.14, 70)
  if (options.mode === 'side') camera.position.set(-6.6, 2.2, 0)
  else if (options.mode === 'rear') camera.position.set(5.4, 2.6, -6.5)
  else if (options.mode === 'low') camera.position.set(-5.5, 0.5, 5.8)
  else camera.position.set(-6.6, 5.2, 7.5)
  camera.lookAt(0, options.mode === 'low' ? 1.4 : 1.65, 0)
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

export const createPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
