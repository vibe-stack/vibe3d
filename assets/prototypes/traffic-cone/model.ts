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
    shell: new MeshPhysicalMaterial({ name: 'traffic cone / pale polymer', color: 0xc9cecc, roughness: 0.48, metalness: 0.14, clearcoat: 0.1, clearcoatRoughness: 0.48 }),
    shellShade: new MeshPhysicalMaterial({ name: 'traffic cone / shaded polymer', color: 0x8f9899, roughness: 0.58, metalness: 0.24, clearcoat: 0.06 }),
    graphite: new MeshPhysicalMaterial({ name: 'traffic cone / graphite chassis', color: 0x202831, roughness: 0.6, metalness: 0.5, clearcoat: 0.05 }),
    ink: new MeshPhysicalMaterial({ name: 'traffic cone / deep recess', color: 0x05080b, roughness: 0.84, metalness: 0.08 }),
    steel: new MeshPhysicalMaterial({ name: 'traffic cone / exposed steel', color: 0x8d9799, roughness: 0.34, metalness: 0.88, clearcoat: 0.08 }),
    amber: new MeshPhysicalMaterial({ name: 'traffic cone / amber reflector', color: 0xc36e08, emissive: new Color(0xff8b08), emissiveIntensity: 0.52, roughness: 0.3, metalness: 0.04, clearcoat: 0.22 }),
    cyan: new MeshPhysicalMaterial({ name: 'traffic cone / cyan service witness', color: 0x2bb7c3, emissive: new Color(0x1e9ba9), emissiveIntensity: 0.5, roughness: 0.28, metalness: 0.04, clearcoat: 0.18 }),
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

function frustum(parent: Group, material: MeshPhysicalMaterial, bottomRadius: number, topRadius: number, height: number, y: number, radialSegments = 24): Mesh {
  const geometry = new CylinderGeometry(topRadius, bottomRadius, height, radialSegments, 1, false)
  const mesh = new Mesh(geometry, material)
  mesh.position.y = y
  parent.add(mesh)
  return mesh
}

function addBase(root: Group, m: Materials): void {
  box(root, m.ink, [3.62, 0.13, 3.62], [0, 0.065, 0], 0.34, 0.038)
  box(root, m.graphite, [3.46, 0.44, 3.46], [0, 0.29, 0], 0.34, 0.075)
  box(root, m.shellShade, [2.52, 0.24, 2.52], [0, 0.56, 0], 0.25, 0.06)
  for (const x of [-1.36, 1.36]) for (const z of [-1.36, 1.36]) {
    box(root, m.shell, [0.68, 0.36, 0.72], [x, 0.44, z], 0.16, 0.045)
    box(root, m.ink, [0.38, 0.14, 0.2], [x, 0.48, z + (z > 0 ? 0.36 : -0.36)], 0.055, 0.014)
  }
  box(root, m.graphite, [1.04, 0.42, 0.2], [0, 0.38, 1.69], 0.1, 0.026)
  box(root, m.ink, [0.64, 0.18, 0.1], [0, 0.38, 1.82], 0.055, 0.014)
  box(root, m.amber, [0.38, 0.1, 0.045], [0, 0.38, 1.9], 0.035, 0.009)
  box(root, m.cyan, [0.42, 0.09, 0.045], [-0.72, 0.65, 1.28], 0.035, 0.009)
  for (const x of [-1.2, 1.2]) root.add(cylinder(m.steel, 0.06, 0.07, [x, 0.35, 1.72], Z_AXIS, 8))
}

function addConeBody(root: Group, m: Materials): void {
  frustum(root, m.graphite, 1.18, 1.08, 0.25, 0.72)
  frustum(root, m.shell, 1.05, 0.77, 1.42, 1.5)
  frustum(root, m.amber, 0.78, 0.61, 0.92, 2.67)
  frustum(root, m.shell, 0.63, 0.54, 0.48, 3.37)
  frustum(root, m.amber, 0.55, 0.39, 0.9, 4.06)
  frustum(root, m.shell, 0.4, 0.28, 0.66, 4.84)
  frustum(root, m.shellShade, 1.09, 1.05, 0.12, 0.86)
  frustum(root, m.shellShade, 0.79, 0.77, 0.1, 2.18)
  frustum(root, m.shellShade, 0.64, 0.62, 0.1, 3.13)
  frustum(root, m.shellShade, 0.56, 0.54, 0.1, 3.61)

  // The lower access door and ports are physically swallowed by the conical shell.
  box(root, m.shellShade, [0.92, 0.72, 0.12], [0, 1.5, 0.96], 0.12, 0.03)
  box(root, m.shell, [0.74, 0.58, 0.1], [0, 1.52, 1.04], 0.1, 0.025)
  box(root, m.graphite, [0.28, 0.16, 0.11], [0, 1.2, 1.1], 0.055, 0.014)
  box(root, m.ink, [0.16, 0.07, 0.06], [0, 1.2, 1.18], 0.025, 0.007)
  box(root, m.graphite, [0.34, 0.2, 0.12], [0.76, 1.14, 0.7], 0.07, 0.018, [0, 0.72, 0])
  root.add(cylinder(m.steel, 0.07, 0.18, [0.88, 1.16, 0.8], [Math.PI / 2, 0, 0.72], 10))
}

function addReflectorCells(root: Group, m: Materials, centerY: number, height: number, bottomRadius: number, topRadius: number): void {
  for (let row = 0; row < 7; row += 1) {
    const y = centerY - height * 0.39 + row * height * 0.13
    const t = (y - (centerY - height / 2)) / height
    const radius = bottomRadius + (topRadius - bottomRadius) * t
    for (let column = -7; column <= 7; column += 1) {
      const x = column * radius * 0.095 + (row % 2 === 0 ? 0 : radius * 0.047)
      if (Math.abs(x) > radius * 0.8) continue
      const z = Math.sqrt(Math.max(0, radius * radius - x * x)) + 0.012
      root.add(cylinder(m.graphite, 0.014, 0.02, [x, y, z], Z_AXIS, 6))
    }
  }
}

function addHandle(root: Group, m: Materials): void {
  // Four-sided armor creates a genuine open hand slot rather than a painted void.
  box(root, m.graphite, [0.9, 0.22, 0.5], [0, 5.52, -0.02], 0.14, 0.035)
  box(root, m.shell, [0.82, 0.2, 0.46], [0, 5.62, 0], 0.13, 0.032)
  box(root, m.graphite, [0.2, 0.64, 0.5], [-0.35, 5.24, -0.02], 0.1, 0.026, [0, 0, -0.08])
  box(root, m.graphite, [0.2, 0.64, 0.5], [0.35, 5.24, -0.02], 0.1, 0.026, [0, 0, 0.08])
  box(root, m.shell, [0.16, 0.58, 0.46], [-0.37, 5.28, 0], 0.08, 0.02, [0, 0, -0.08])
  box(root, m.shell, [0.16, 0.58, 0.46], [0.37, 5.28, 0], 0.08, 0.02, [0, 0, 0.08])
  box(root, m.graphite, [0.72, 0.16, 0.48], [0, 4.99, -0.02], 0.09, 0.022)
  box(root, m.shell, [0.66, 0.12, 0.44], [0, 5.04, 0], 0.08, 0.02)
  box(root, m.amber, [0.58, 0.06, 0.08], [0, 5.47, 0.27], 0.035, 0.009)
  box(root, m.amber, [0.06, 0.28, 0.08], [-0.27, 5.25, 0.27], 0.025, 0.007)
  box(root, m.amber, [0.06, 0.28, 0.08], [0.27, 5.25, 0.27], 0.025, 0.007)
}

function build() {
  const m = materials()
  const root = new Group()
  root.name = 'traffic cone'
  addBase(root, m)
  addConeBody(root, m)
  addReflectorCells(root, m, 2.67, 0.92, 0.78, 0.61)
  addReflectorCells(root, m, 4.06, 0.9, 0.55, 0.39)
  addHandle(root, m)

  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [m.shell, { rub: 0.055, grime: 0.026, scratch: 0.008 }],
    [m.shellShade, { rub: 0.07, grime: 0.035, scratch: 0.01 }],
    [m.graphite, { rub: 0.08, grime: 0.065, scratch: 0.012 }],
    [m.steel, { rub: 0.16, grime: 0.04, scratch: 0.018 }],
  ])
  bakeOcclusion(root, { reach: 0.09 })
  bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'traffic cone / localized maintained wear', clearcoat: 0.06, clearcoatRoughness: 0.58 })
  root.traverse((object) => {
    if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear
  })
  const geometries = mergeStaticByMaterial(root, {
    retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material: { name?: string }) => material.name ?? 'traffic-cone batch',
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
  scene.add(new HemisphereLight(0xc4cdcf, 0x06080b, 0.84))
  const key = new DirectionalLight(0xffead8, 2.8); key.position.set(-7, 10, 9); scene.add(key)
  const fill = new DirectionalLight(0x7196c0, 1.08); fill.position.set(8, 6, 7); scene.add(fill)
  const rim = new DirectionalLight(0x82adb2, 0.9); rim.position.set(7, 9, -8); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x090d10, roughness: 0.94, metalness: 0.03 })
  const floorGeometry = new PlaneGeometry(14, 14)
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.004
  floor.userData.excludeFromExport = true
  scene.add(floor)
  const camera = new PerspectiveCamera(31, options.aspect ?? 1, 0.14, 80)
  if (options.mode === 'side') camera.position.set(-7.2, 3.1, 0)
  else if (options.mode === 'rear') camera.position.set(5.6, 3.4, -7.4)
  else if (options.mode === 'low') camera.position.set(-5.8, 0.6, 6.5)
  else camera.position.set(-8.4, 4.6, 10.4)
  camera.lookAt(0, options.mode === 'low' ? 2.2 : 2.75, 0)
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
