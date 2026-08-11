import { BoxGeometry, Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshPhysicalMaterial, PerspectiveCamera, PlaneGeometry, Scene } from 'three/webgpu'
import { cylinder, mergeStaticByMaterial, prism, type Vec3 } from '../../../src/asset-forge/generator/index.ts'

const Y_AXIS: Vec3 = [0, 0, 0]
const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]
interface Mats { shell: MeshPhysicalMaterial; shade: MeshPhysicalMaterial; graphite: MeshPhysicalMaterial; ink: MeshPhysicalMaterial; steel: MeshPhysicalMaterial; amber: MeshPhysicalMaterial; cyan: MeshPhysicalMaterial }
interface Controller { root: Group; update: (delta: number) => void; dispose: () => void }
interface Preview extends Controller { scene: Scene; camera: PerspectiveCamera }

function materials(): Mats { return {
  shell: new MeshPhysicalMaterial({ name: 'manhole / pale segmented curb', color: 0xc7cdcb, roughness: 0.53, metalness: 0.28, clearcoat: 0.08 }),
  shade: new MeshPhysicalMaterial({ name: 'manhole / shaded curb', color: 0x7e8889, roughness: 0.56, metalness: 0.46 }),
  graphite: new MeshPhysicalMaterial({ name: 'manhole / graphite tread plate', color: 0x0d141b, roughness: 0.53, metalness: 0.7, clearcoat: 0.07 }),
  ink: new MeshPhysicalMaterial({ name: 'manhole / deep recess', color: 0x030608, roughness: 0.84, metalness: 0.12 }),
  steel: new MeshPhysicalMaterial({ name: 'manhole / fasteners', color: 0x748083, roughness: 0.32, metalness: 0.92 }),
  amber: new MeshPhysicalMaterial({ name: 'manhole / amber service light', color: 0xd97806, roughness: 0.2, metalness: 0.03, emissive: new Color(0xff6b00), emissiveIntensity: 1.05, clearcoat: 0.18 }),
  cyan: new MeshPhysicalMaterial({ name: 'manhole / cyan witness', color: 0x48d9e3, roughness: 0.2, metalness: 0.02, emissive: new Color(0x28c9da), emissiveIntensity: 0.95 }),
} }

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.05, bevel = 0.016, rotation: Vec3 = [0, 0, 0]): Mesh {
  const mesh = prism(material, size, position, { chamfer, fillet: Math.min(0.04, Math.max(0.008, chamfer * 0.3)), bevel, rotation }); parent.add(mesh); return mesh
}
function simpleBox(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, rotation: Vec3 = [0, 0, 0]): Mesh {
  const geometry = new BoxGeometry(...size); const mesh = new Mesh(geometry, material); mesh.position.set(...position); mesh.rotation.set(...rotation); parent.add(mesh); return mesh
}
function bolt(parent: Group, m: Mats, x: number, y: number, z: number, radius = 0.045): void { parent.add(cylinder(m.steel, radius, 0.055, [x, y, z], Y_AXIS, 9)) }

function addPrimaryMass(root: Group, m: Mats): void {
  root.add(cylinder(m.ink, 3.4, 0.16, [0, 0.08, 0], Y_AXIS, 48))
  root.add(cylinder(m.shade, 3.31, 0.28, [0, 0.24, 0], Y_AXIS, 48))
  root.add(cylinder(m.shell, 3.23, 0.36, [0, 0.46, 0], Y_AXIS, 48))
  root.add(cylinder(m.graphite, 2.7, 0.18, [0, 0.69, 0], Y_AXIS, 48))
  root.add(cylinder(m.ink, 2.58, 0.1, [0, 0.81, 0], Y_AXIS, 48))
  root.add(cylinder(m.graphite, 2.48, 0.16, [0, 0.9, 0], Y_AXIS, 48))
  // Eight real shell seams and their seated fasteners articulate the outer load ring.
  for (let i = 0; i < 8; i += 1) {
    const a = i * Math.PI / 4
    bolt(root, m, Math.sin(a) * 2.98, 0.69, Math.cos(a) * 2.98)
  }
}

function addTread(root: Group, m: Mats): void {
  // Authored raised anti-slip pairs, clipped around handles and the central service medallion.
  for (let ix = -8; ix <= 8; ix += 1) for (let iz = -8; iz <= 8; iz += 1) {
    const x = ix * 0.27; const z = iz * 0.27
    if (x * x + z * z > 5.35 || x * x + z * z < 0.72) continue
    if (Math.abs(x) < 0.72 && Math.abs(Math.abs(z) - 1.48) < 0.42) continue
    const rot = ((ix + iz) & 1) ? Math.PI / 2 : 0
    simpleBox(root, m.shade, [0.1, 0.018, 0.03], [x - 0.04, 0.99, z], [0, rot, 0])
    simpleBox(root, m.shade, [0.1, 0.018, 0.03], [x + 0.04, 0.99, z], [0, rot, 0])
  }
}

function addHandleWell(root: Group, m: Mats, z: number): void {
  // Four separate rails leave a real open center; the backing is visibly below the lid plane.
  box(root, m.ink, [0.88, 0.055, 0.34], [0, 0.98, z], 0.1, 0.02)
  box(root, m.graphite, [1.18, 0.16, 0.16], [0, 1.05, z - 0.29], 0.055, 0.014)
  box(root, m.graphite, [1.18, 0.16, 0.16], [0, 1.05, z + 0.29], 0.055, 0.014)
  box(root, m.graphite, [0.16, 0.16, 0.46], [-0.51, 1.05, z], 0.055, 0.014)
  box(root, m.graphite, [0.16, 0.16, 0.46], [0.51, 1.05, z], 0.055, 0.014)
  box(root, m.amber, [0.62, 0.05, 0.085], [0, 1.02, z + (z > 0 ? 0.08 : -0.08)], 0.035, 0.009)
  for (const x of [-0.45, 0.45]) for (const dz of [-0.22, 0.22]) bolt(root, m, x, 1.12, z + dz, 0.035)
}

function addCenterMedallion(root: Group, m: Mats): void {
  root.add(cylinder(m.shade, 0.72, 0.13, [0, 1.01, 0], Y_AXIS, 32))
  root.add(cylinder(m.ink, 0.55, 0.1, [0, 1.12, 0], Y_AXIS, 32))
  root.add(cylinder(m.amber, 0.42, 0.055, [0, 1.2, 0], Y_AXIS, 32))
  root.add(cylinder(m.graphite, 0.14, 0.07, [0, 1.25, 0], Y_AXIS, 24))
  root.add(cylinder(m.amber, 0.06, 0.045, [0, 1.31, 0], Y_AXIS, 18))
  for (let i = 0; i < 4; i += 1) {
    const a = i * Math.PI / 2
    box(root, m.graphite, [0.1, 0.075, 0.52], [Math.sin(a) * 0.23, 1.25, Math.cos(a) * 0.23], 0.022, 0.006, [0, a, 0])
  }
}

function addOuterServices(root: Group, m: Mats): void {
  // Side amber wells are swallowed by the pale curb instead of surface mounted.
  for (const a of [-Math.PI / 2, Math.PI / 2]) {
    const x = Math.sin(a) * 3.04; const z = Math.cos(a) * 3.04
    box(root, m.graphite, [0.62, 0.38, 0.34], [x, 0.51, z], 0.1, 0.025, [0, a, 0])
    box(root, m.ink, [0.4, 0.18, 0.18], [Math.sin(a) * 3.23, 0.52, Math.cos(a) * 3.23], 0.06, 0.016, [0, a, 0])
    box(root, m.amber, [0.27, 0.1, 0.055], [Math.sin(a) * 3.34, 0.52, Math.cos(a) * 3.34], 0.03, 0.008, [0, a, 0])
  }
  // Front service cassette breaks the circular curb and carries the cyan orientation witness.
  box(root, m.graphite, [0.74, 0.7, 0.56], [0, 0.48, 3.12], 0.14, 0.035)
  box(root, m.ink, [0.43, 0.38, 0.18], [0, 0.53, 3.45], 0.08, 0.02)
  box(root, m.amber, [0.18, 0.22, 0.07], [0, 0.61, 3.56], 0.045, 0.012)
  box(root, m.cyan, [0.15, 0.06, 0.07], [0, 0.31, 3.56], 0.025, 0.007, [Math.PI / 4, 0, 0])
  for (const x of [-0.24, 0.24]) bolt(root, m, x, 0.76, 3.48, 0.038)
  // Two inset ventilation banks on the side wall.
  for (const x of [-2.45, 2.45]) {
    box(root, m.graphite, [0.72, 0.38, 0.18], [x, 0.4, -2.05], 0.08, 0.02, [0, x > 0 ? -0.7 : 0.7, 0])
    for (let i = -2; i <= 2; i += 1) simpleBox(root, m.ink, [0.08, 0.2, 0.05], [x + i * 0.1, 0.4, -2.16], [0, x > 0 ? -0.7 : 0.7, 0])
  }
}

function build() {
  const m = materials(); const root = new Group(); root.name = 'manhole'
  addPrimaryMass(root, m); addTread(root, m); addHandleWell(root, m, -1.47); addHandleWell(root, m, 1.47); addCenterMedallion(root, m); addOuterServices(root, m)
  const geometries = mergeStaticByMaterial(root, { meshName: (material: { name?: string }) => material.name ?? 'manhole batch' })
  return { root, m, geometries }
}

export function createModel(): Controller { const rig = build(); return { root: rig.root, update: () => {}, dispose: () => { for (const geometry of rig.geometries) geometry.dispose(); for (const material of Object.values(rig.m)) material.dispose() } } }

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low' } = {}): Preview {
  const model = createModel(); const scene = new Scene(); scene.background = new Color(0x010203); scene.add(model.root, new HemisphereLight(0xc5ced0, 0x05070a, 0.82))
  const key = new DirectionalLight(0xffead8, 2.85); key.position.set(-7, 10, 8); scene.add(key)
  const fill = new DirectionalLight(0x6c91ba, 1.05); fill.position.set(8, 6, 7); scene.add(fill)
  const rim = new DirectionalLight(0x8fb7b9, 0.9); rim.position.set(7, 8, -8); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x080b0e, roughness: 0.94, metalness: 0.02 }); const floorGeometry = new PlaneGeometry(15, 15); const floor = new Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.004; floor.userData.excludeFromExport = true; scene.add(floor)
  const camera = new PerspectiveCamera(34, options.aspect ?? 1, 0.12, 100)
  if (options.mode === 'side') camera.position.set(-8.2, 1.4, 0)
  else if (options.mode === 'rear') camera.position.set(6.8, 2.1, -7.8)
  else if (options.mode === 'low') camera.position.set(-7.1, 0.32, 8.2)
  else camera.position.set(-6.9, 5.3, 8.3)
  camera.lookAt(0, options.mode === 'low' ? 0.45 : 0.58, 0); scene.add(camera)
  return { ...model, scene, camera, dispose: () => { floorGeometry.dispose(); floorMaterial.dispose(); model.dispose() } }
}

export const createPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
