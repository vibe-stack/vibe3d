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

import { cylinder, mergeStaticByMaterial, prism, type Vec3 } from '../../../src/asset-forge/generator/index.ts'

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

function materials(): Materials {
  return {
    shell: new MeshPhysicalMaterial({ name: 'canal ladder / pale armor', color: 0xc1c7c5, roughness: 0.48, metalness: 0.32, clearcoat: 0.1, clearcoatRoughness: 0.46 }),
    shellShade: new MeshPhysicalMaterial({ name: 'canal ladder / shaded armor', color: 0x858f91, roughness: 0.56, metalness: 0.48, clearcoat: 0.06 }),
    graphite: new MeshPhysicalMaterial({ name: 'canal ladder / graphite chassis', color: 0x20272e, roughness: 0.58, metalness: 0.64, clearcoat: 0.05 }),
    ink: new MeshPhysicalMaterial({ name: 'canal ladder / deep recess', color: 0x05080a, roughness: 0.86, metalness: 0.08 }),
    steel: new MeshPhysicalMaterial({ name: 'canal ladder / exposed steel', color: 0x919b9d, roughness: 0.31, metalness: 0.9, clearcoat: 0.08 }),
    amber: new MeshPhysicalMaterial({ name: 'canal ladder / amber tread', color: 0xc57109, emissive: new Color(0xf28508), emissiveIntensity: 0.32, roughness: 0.36, metalness: 0.05, clearcoat: 0.16 }),
    cyan: new MeshPhysicalMaterial({ name: 'canal ladder / cyan witness', color: 0x2eb4bf, emissive: new Color(0x239ba7), emissiveIntensity: 0.4, roughness: 0.3, metalness: 0.04, clearcoat: 0.16 }),
  }
}

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.08, bevel = 0.025, rotation: Vec3 = [0, 0, 0]): Mesh {
  const mesh = prism(material, size, position, {
    chamfer,
    fillet: Math.min(0.045, Math.max(0.007, chamfer * 0.28)),
    bevel,
    rotation,
  })
  parent.add(mesh)
  return mesh
}

function addTriangleMarker(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, mirror = false): void {
  const shape = new Shape()
  if (mirror) {
    shape.moveTo(0.09, 0.11)
    shape.lineTo(-0.09, 0.11)
    shape.lineTo(-0.09, -0.11)
  } else {
    shape.moveTo(-0.09, 0.11)
    shape.lineTo(0.09, 0.11)
    shape.lineTo(0.09, -0.11)
  }
  shape.closePath()
  const geometry = new ExtrudeGeometry(shape, { depth: 0.034, bevelEnabled: false, curveSegments: 1 })
  geometry.translate(0, 0, -0.017)
  const marker = new Mesh(geometry, material)
  marker.position.set(x, y, 0.365)
  parent.add(marker)
}

function addRails(root: Group, m: Materials): void {
  for (const x of [-0.82, 0.82]) {
    box(root, m.graphite, [0.62, 4.9, 0.58], [x, 2.61, -0.05], 0.18, 0.045)
    box(root, m.shellShade, [0.56, 4.72, 0.52], [x, 2.67, 0.03], 0.17, 0.042)
    box(root, m.shell, [0.48, 4.56, 0.46], [x, 2.73, 0.12], 0.15, 0.038)
    box(root, m.graphite, [0.13, 3.82, 0.11], [x + (x < 0 ? 0.17 : -0.17), 2.64, 0.41], 0.04, 0.01)
    box(root, m.shell, [0.52, 0.25, 0.48], [x, 4.94, 0.1], 0.12, 0.03)
    box(root, m.graphite, [0.58, 0.24, 0.54], [x, 0.3, 0], 0.12, 0.03)
  }
  addTriangleMarker(root, m.cyan, -0.92, 3.03)
  addTriangleMarker(root, m.cyan, 0.92, 3.03, true)
}

function addTreads(root: Group, m: Materials): void {
  for (const y of [1.05, 1.85, 2.65, 3.45, 4.25]) {
    box(root, m.graphite, [1.52, 0.22, 0.52], [0, y, 0.06], 0.08, 0.02)
    box(root, m.amber, [1.28, 0.13, 0.42], [0, y + 0.1, 0.12], 0.06, 0.015)
    for (const x of [-0.69, 0.69]) box(root, m.graphite, [0.32, 0.34, 0.58], [x, y, 0.02], 0.09, 0.022)
    for (const x of [-0.42, -0.14, 0.14, 0.42]) box(root, m.graphite, [0.05, 0.016, 0.34], [x, y + 0.164, 0.13], 0.006, 0.001)
  }
}

function addMounts(root: Group, m: Materials): void {
  for (const x of [-0.82, 0.82]) {
    // Top wall mounts and articulated armored heads.
    box(root, m.shellShade, [0.98, 1.06, 0.2], [x, 5.02, -0.44], 0.2, 0.05)
    box(root, m.shell, [0.82, 0.9, 0.18], [x, 5.04, -0.54], 0.18, 0.045)
    box(root, m.ink, [0.68, 0.78, 0.42], [x, 4.98, -0.2], 0.17, 0.042)
    box(root, m.graphite, [0.66, 0.88, 0.5], [x, 5.08, -0.02], 0.19, 0.047, [0.11, 0, 0])
    box(root, m.shell, [0.58, 0.86, 0.54], [x, 5.13, 0.08], 0.19, 0.047, [0.12, 0, 0])
    box(root, m.graphite, [0.5, 0.24, 0.15], [x, 4.78, 0.39], 0.07, 0.018)
    box(root, m.graphite, [0.34, 0.24, 0.08], [x, 5.13, 0.39], 0.06, 0.015)
    box(root, m.amber, [0.25, 0.15, 0.06], [x, 5.13, 0.45], 0.04, 0.01)
    box(root, m.cyan, [0.12, 0.055, 0.045], [x, 5.42, 0.28], 0.022, 0.006)
    for (const y of [4.74, 5.3]) root.add(cylinder(m.steel, 0.055, 0.08, [x, y, -0.5], Z_AXIS, 8))
    for (const dx of [-0.31, 0.31]) {
      for (const dy of [-0.35, 0.35]) root.add(cylinder(m.steel, 0.045, 0.07, [x + dx, 5.04 + dy, -0.42], Z_AXIS, 8))
    }

    // Grounded lower bearing housings anchor the rails and lower bar.
    box(root, m.ink, [0.82, 0.15, 0.88], [x, 0.075, 0], 0.2, 0.05)
    box(root, m.graphite, [0.76, 0.84, 0.78], [x, 0.43, 0], 0.19, 0.047)
    box(root, m.shellShade, [0.56, 0.66, 0.62], [x, 0.45, 0.1], 0.16, 0.04)
    box(root, m.graphite, [0.36, 0.28, 0.1], [x, 0.44, 0.44], 0.07, 0.018)
    box(root, m.amber, [0.22, 0.16, 0.065], [x, 0.44, 0.5], 0.04, 0.01)
    root.add(cylinder(m.steel, 0.14, 0.62, [x, 0.28, 0.13], X_AXIS, 12))
    root.add(cylinder(m.graphite, 0.22, 0.3, [x + (x < 0 ? 0.18 : -0.18), 0.3, 0.1], X_AXIS, 14))
  }
  root.add(cylinder(m.graphite, 0.18, 1.5, [0, 0.3, 0.08], X_AXIS, 14))
  root.add(cylinder(m.amber, 0.13, 1.28, [0, 0.3, 0.14], X_AXIS, 14))
}

function addRearStructure(root: Group, m: Materials): void {
  for (const x of [-0.82, 0.82]) {
    box(root, m.ink, [0.14, 3.82, 0.12], [x, 2.65, -0.34], 0.04, 0.01)
  }
}

function build() {
  const m = materials()
  const root = new Group()
  root.name = 'canal ladder'
  addRails(root, m)
  addTreads(root, m)
  addMounts(root, m)
  addRearStructure(root, m)
  const geometries = mergeStaticByMaterial(root, {
    meshName: (material: { name?: string }) => material.name ?? 'canal-ladder batch',
  })
  return { root, m, geometries }
}

export function createModel(): Controller {
  const rig = build()
  return {
    root: rig.root,
    update: () => {},
    dispose: () => {
      for (const geometry of rig.geometries) geometry.dispose()
      for (const material of Object.values(rig.m)) material.dispose()
    },
  }
}

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low' } = {}): Preview {
  const model = createModel()
  const scene = new Scene()
  scene.background = new Color(0x020405)
  scene.add(model.root)
  scene.add(new HemisphereLight(0xc7ced0, 0x06080b, 0.82))
  const key = new DirectionalLight(0xffead8, 2.75); key.position.set(-7, 10, 9); scene.add(key)
  const fill = new DirectionalLight(0x7196bf, 1.02); fill.position.set(8, 6, 7); scene.add(fill)
  const rim = new DirectionalLight(0x82adb2, 0.86); rim.position.set(7, 9, -8); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x020405, roughness: 0.96, metalness: 0.02 })
  const floorGeometry = new PlaneGeometry(10, 10)
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.004
  floor.userData.excludeFromExport = true
  scene.add(floor)
  const camera = new PerspectiveCamera(31, options.aspect ?? 1, 0.14, 70)
  if (options.mode === 'side') camera.position.set(-5.8, 2.8, 0)
  else if (options.mode === 'rear') camera.position.set(4.8, 3.0, -6)
  else if (options.mode === 'low') camera.position.set(-4.8, 0.46, 5.6)
  else camera.position.set(-6.8, 3.45, 9.4)
  camera.lookAt(0, options.mode === 'low' ? 2.2 : 2.7, 0)
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
