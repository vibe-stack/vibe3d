import { Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshPhysicalMaterial, PerspectiveCamera, PlaneGeometry, Scene, TorusGeometry } from 'three/webgpu'
import { cylinder, mergeStaticByMaterial, prism, type Vec3 } from '../../../src/asset-forge/generator/index.ts'

const X_AXIS: Vec3 = [0, 0, Math.PI / 2]
const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]
interface Mats { shell: MeshPhysicalMaterial; shade: MeshPhysicalMaterial; graphite: MeshPhysicalMaterial; ink: MeshPhysicalMaterial; steel: MeshPhysicalMaterial; amber: MeshPhysicalMaterial; cyan: MeshPhysicalMaterial }
interface Controller { root: Group; update: (delta: number) => void; dispose: () => void }
interface Preview extends Controller { scene: Scene; camera: PerspectiveCamera }

function materials(): Mats { return {
  shell: new MeshPhysicalMaterial({ name: 'barrel / pale armor', color: 0xc6ccca, roughness: 0.5, metalness: 0.31, clearcoat: 0.07 }),
  shade: new MeshPhysicalMaterial({ name: 'barrel / shaded armor', color: 0x899293, roughness: 0.56, metalness: 0.48 }),
  graphite: new MeshPhysicalMaterial({ name: 'barrel / graphite chassis', color: 0x18212a, roughness: 0.54, metalness: 0.68, clearcoat: 0.06 }),
  ink: new MeshPhysicalMaterial({ name: 'barrel / deep recess', color: 0x030608, roughness: 0.86, metalness: 0.1 }),
  steel: new MeshPhysicalMaterial({ name: 'barrel / hardware', color: 0x778285, roughness: 0.33, metalness: 0.92 }),
  amber: new MeshPhysicalMaterial({ name: 'barrel / amber service hardware', color: 0xd47a08, roughness: 0.21, metalness: 0.04, emissive: new Color(0xff6a00), emissiveIntensity: 0.88, clearcoat: 0.16 }),
  cyan: new MeshPhysicalMaterial({ name: 'barrel / cyan witness', color: 0x45d5e0, roughness: 0.2, metalness: 0.02, emissive: new Color(0x21c7db), emissiveIntensity: 0.9 }),
} }

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.08, bevel = 0.022, rotation: Vec3 = [0, 0, 0]): Mesh {
  const mesh = prism(material, size, position, { chamfer, fillet: Math.min(0.055, Math.max(0.008, chamfer * 0.3)), bevel, rotation }); parent.add(mesh); return mesh
}
function boltFront(parent: Group, m: Mats, x: number, y: number, z: number): void { parent.add(cylinder(m.steel, 0.045, 0.06, [x, y, z], Z_AXIS, 9)) }
function torus(parent: Group, material: MeshPhysicalMaterial, major: number, tube: number, position: Vec3, segments = 32): Mesh {
  const geometry = new TorusGeometry(major, tube, 8, segments); const mesh = new Mesh(geometry, material); mesh.rotation.x = Math.PI / 2; mesh.position.set(...position); parent.add(mesh); return mesh
}
function segmentedTorus(parent: Group, material: MeshPhysicalMaterial, major: number, tube: number, y: number): void {
  const arc = Math.PI / 4 - 0.055
  for (let i = 0; i < 8; i += 1) {
    const geometry = new TorusGeometry(major, tube, 8, 10, arc); geometry.rotateX(Math.PI / 2); geometry.rotateY(i * Math.PI / 4 + 0.0275)
    const mesh = new Mesh(geometry, material); mesh.position.y = y; parent.add(mesh)
  }
}

function addBody(root: Group, m: Mats): void {
  root.add(cylinder(m.ink, 2.22, 0.2, [0, 0.1, 0], [0, 0, 0], 32))
  root.add(cylinder(m.graphite, 2.18, 0.64, [0, 0.42, 0], [0, 0, 0], 32))
  torus(root, m.graphite, 1.78, 0.19, [0, 0.7, 0], 32)
  root.add(cylinder(m.shell, 2.05, 3.35, [0, 2.27, 0], [0, 0, 0], 32))
  root.add(cylinder(m.shade, 2.07, 0.12, [0, 0.82, 0], [0, 0, 0], 32))
  root.add(cylinder(m.graphite, 2.15, 0.58, [0, 4.23, 0], [0, 0, 0], 32))
  root.add(cylinder(m.ink, 2.2, 0.2, [0, 4.56, 0], [0, 0, 0], 32))
  // Four pale body seams and their captured graphite lower shoulders.
  for (const x of [-1.92, 1.92]) {
    box(root, m.shade, [0.1, 3.0, 0.16], [x, 2.3, 0.72], 0.035, 0.009)
    box(root, m.graphite, [0.34, 0.72, 0.24], [x, 0.68, 0.83], 0.08, 0.02)
  }
}

function addLid(root: Group, m: Mats): void {
  root.add(cylinder(m.graphite, 1.95, 0.24, [0, 4.75, 0], [0, 0, 0], 32))
  segmentedTorus(root, m.shell, 1.72, 0.24, 5.1)
  torus(root, m.graphite, 1.15, 0.17, [0, 5.1, 0], 32)
  root.add(cylinder(m.ink, 0.88, 0.12, [0, 5.08, 0], [0, 0, 0], 28))
  root.add(cylinder(m.amber, 0.54, 0.16, [0, 5.18, 0], [0, 0, 0], 24))
  root.add(cylinder(m.shade, 0.32, 0.08, [0, 5.3, 0], [0, 0, 0], 18))
  // Four shallow seam keys articulate the continuous load ring without intersecting its underside.
  for (let i = 0; i < 4; i += 1) {
    const a = i * Math.PI / 2
    box(root, m.shade, [0.12, 0.045, 0.42], [Math.sin(a) * 1.72, 5.24, Math.cos(a) * 1.72], 0.025, 0.007, [0, a, 0])
  }
}

function addUpperHandles(root: Group, m: Mats): void {
  for (const a of [Math.PI / 2, -Math.PI / 2]) {
    const x = Math.sin(a) * 2.12; const z = Math.cos(a) * 2.12
    const rotation: Vec3 = [0, a, 0]
    box(root, m.graphite, [1.08, 0.74, 0.34], [x, 4.16, z], 0.12, 0.03, rotation)
    box(root, m.ink, [0.72, 0.34, 0.18], [Math.sin(a) * 2.34, 4.16, Math.cos(a) * 2.34], 0.08, 0.02, rotation)
    root.add(cylinder(m.amber, 0.075, 0.66, [Math.sin(a) * 2.45, 4.16, Math.cos(a) * 2.45], a === 0 ? X_AXIS : Z_AXIS, 10))
  }
  box(root, m.graphite, [1.08, 0.74, 0.8], [0, 4.16, 2.35], 0.12, 0.03)
  box(root, m.ink, [0.72, 0.34, 0.32], [0, 4.16, 2.72], 0.08, 0.02)
  root.add(cylinder(m.amber, 0.075, 0.66, [0, 4.16, 2.92], X_AXIS, 10))
}

function addFrontServices(root: Group, m: Mats): void {
  // Central vertical fill-status cassette.
  box(root, m.shade, [1.05, 1.75, 0.24], [0, 2.58, 2.0], 0.16, 0.04)
  box(root, m.graphite, [0.82, 1.46, 0.18], [0, 2.58, 2.17], 0.12, 0.03)
  box(root, m.ink, [0.56, 1.14, 0.1], [0, 2.58, 2.31], 0.09, 0.022)
  for (let i = -2; i <= 2; i += 1) box(root, m.amber, [0.3, 0.11, 0.055], [-0.08, 2.58 + i * 0.19, 2.39], 0.025, 0.007)
  // Left retained vertical grab and right cyan witness.
  box(root, m.graphite, [0.42, 1.5, 0.24], [-1.48, 2.4, 1.64], 0.1, 0.025)
  box(root, m.ink, [0.18, 1.18, 0.12], [-1.48, 2.4, 1.82], 0.06, 0.015)
  root.add(cylinder(m.amber, 0.075, 0.9, [-1.48, 2.4, 1.95], [0, 0, 0], 10))
  box(root, m.graphite, [0.32, 1.2, 0.22], [1.75, 2.45, 1.0], 0.09, 0.022)
  box(root, m.cyan, [0.08, 0.72, 0.07], [1.91, 2.45, 1.06], 0.025, 0.007)
  for (const x of [-0.42, 0.42]) for (const y of [1.55, 3.44]) boltFront(root, m, x, y, 2.37)
}

function addLowerPort(root: Group, m: Mats): void {
  box(root, m.graphite, [1.18, 1.05, 0.3], [0, 0.72, 1.94], 0.16, 0.04)
  box(root, m.ink, [0.78, 0.72, 0.18], [0, 0.72, 2.14], 0.12, 0.03)
  torus(root, m.amber, 0.29, 0.1, [0, 0.72, 2.28], 20)
  // Torus helper is horizontal; rotate this service ring vertical after creation.
  const ring = root.children[root.children.length - 1] as Mesh; ring.rotation.set(0, 0, 0)
  root.add(cylinder(m.graphite, 0.25, 0.2, [0, 0.72, 2.3], Z_AXIS, 14))
  root.add(cylinder(m.steel, 0.12, 0.24, [0, 0.72, 2.42], Z_AXIS, 10))
  for (const x of [-0.42, 0.42]) boltFront(root, m, x, 0.38, 2.17)
  for (const x of [-1.55, 1.55]) {
    box(root, m.graphite, [0.5, 0.72, 0.32], [x, 0.58, 1.55], 0.1, 0.025)
    box(root, m.shade, [0.24, 0.34, 0.14], [x, 0.58, 1.76], 0.06, 0.015)
  }
}

function addRear(root: Group, m: Mats): void {
  box(root, m.graphite, [1.2, 1.8, 0.16], [0, 2.25, -2.02], 0.14, 0.035)
  box(root, m.shade, [0.88, 1.45, 0.1], [0, 2.25, -2.14], 0.11, 0.028)
  for (let i = -3; i <= 3; i += 1) box(root, m.ink, [0.55, 0.08, 0.055], [0, 2.25 + i * 0.16, -2.22], 0.014, 0.004)
}

function build() {
  const m = materials(); const root = new Group(); root.name = 'barrel'; addBody(root, m); addLid(root, m); addUpperHandles(root, m); addFrontServices(root, m); addLowerPort(root, m); addRear(root, m)
  const geometries = mergeStaticByMaterial(root, { meshName: (material: { name?: string }) => material.name ?? 'barrel batch' })
  return { root, m, geometries }
}
export function createModel(): Controller { const rig = build(); return { root: rig.root, update: () => {}, dispose: () => { for (const geometry of rig.geometries) geometry.dispose(); for (const material of Object.values(rig.m)) material.dispose() } } }

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low' } = {}): Preview {
  const model = createModel(); const scene = new Scene(); scene.background = new Color(0x010203); scene.add(model.root, new HemisphereLight(0xc4cdcf, 0x05070a, 0.84))
  const key = new DirectionalLight(0xffead9, 2.75); key.position.set(-7, 10, 8); scene.add(key)
  const fill = new DirectionalLight(0x6e94bd, 1.04); fill.position.set(8, 7, 7); scene.add(fill)
  const rim = new DirectionalLight(0x8db4b8, 0.9); rim.position.set(7, 9, -8); scene.add(rim)
  let floorMaterial: MeshPhysicalMaterial | undefined; let floorGeometry: PlaneGeometry | undefined
  if (options.mode && options.mode !== 'beauty') { floorMaterial = new MeshPhysicalMaterial({ color: 0x050709, roughness: 0.95, metalness: 0.02 }); floorGeometry = new PlaneGeometry(12, 12); const floor = new Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.004; floor.userData.excludeFromExport = true; scene.add(floor) }
  const camera = new PerspectiveCamera(34, options.aspect ?? 1, 0.12, 100)
  if (options.mode === 'side') camera.position.set(-7, 2.5, 0)
  else if (options.mode === 'rear') camera.position.set(5.8, 3.0, -7.2)
  else if (options.mode === 'low') camera.position.set(-5.7, 0.4, 6.7)
  else camera.position.set(-7.7, 6.25, 9.7)
  camera.lookAt(0, options.mode === 'low' ? 2.0 : 2.35, 0); scene.add(camera)
  return { ...model, scene, camera, dispose: () => { floorGeometry?.dispose(); floorMaterial?.dispose(); model.dispose() } }
}

export const createPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
