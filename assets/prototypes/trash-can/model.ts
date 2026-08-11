import { Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshPhysicalMaterial, PerspectiveCamera, PlaneGeometry, Scene } from 'three/webgpu'
import { cylinder, mergeStaticByMaterial, prism, type Vec3 } from '../../../src/asset-forge/generator/index.ts'

const X_AXIS: Vec3 = [0, 0, Math.PI / 2]
const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]
interface Mats { shell: MeshPhysicalMaterial; shade: MeshPhysicalMaterial; graphite: MeshPhysicalMaterial; ink: MeshPhysicalMaterial; steel: MeshPhysicalMaterial; amber: MeshPhysicalMaterial; cyan: MeshPhysicalMaterial }
interface Controller { root: Group; update: (delta: number) => void; dispose: () => void }
interface Preview extends Controller { scene: Scene; camera: PerspectiveCamera }

function materials(): Mats { return {
  shell: new MeshPhysicalMaterial({ name: 'trash can / pale armor', color: 0xcbd0cf, roughness: 0.5, metalness: 0.3, clearcoat: 0.08 }),
  shade: new MeshPhysicalMaterial({ name: 'trash can / shaded armor', color: 0x8b9495, roughness: 0.55, metalness: 0.46 }),
  graphite: new MeshPhysicalMaterial({ name: 'trash can / graphite chassis', color: 0x18222c, roughness: 0.55, metalness: 0.66, clearcoat: 0.06 }),
  ink: new MeshPhysicalMaterial({ name: 'trash can / deep bin interior', color: 0x030608, roughness: 0.88, metalness: 0.08 }),
  steel: new MeshPhysicalMaterial({ name: 'trash can / hardware', color: 0x778286, roughness: 0.34, metalness: 0.9 }),
  amber: new MeshPhysicalMaterial({ name: 'trash can / amber service light', color: 0xd77a08, roughness: 0.2, metalness: 0.02, emissive: new Color(0xff6b00), emissiveIntensity: 1.02, clearcoat: 0.18 }),
  cyan: new MeshPhysicalMaterial({ name: 'trash can / cyan service witness', color: 0x48d7e0, roughness: 0.2, metalness: 0.02, emissive: new Color(0x24c7db), emissiveIntensity: 0.9 }),
} }

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.08, bevel = 0.022, rotation: Vec3 = [0, 0, 0]): Mesh {
  const mesh = prism(material, size, position, { chamfer, fillet: Math.min(0.055, Math.max(0.008, chamfer * 0.3)), bevel, rotation }); parent.add(mesh); return mesh
}
function boltFront(parent: Group, m: Mats, x: number, y: number, z: number): void { parent.add(cylinder(m.steel, 0.045, 0.055, [x, y, z], Z_AXIS, 9)) }

function addBase(root: Group, m: Mats): void {
  box(root, m.ink, [3.1, 0.24, 2.58], [0, 0.12, 0], 0.2, 0.045)
  box(root, m.graphite, [2.92, 0.42, 2.38], [0, 0.38, 0], 0.2, 0.045)
  box(root, m.shade, [2.62, 0.22, 2.18], [0, 0.68, 0], 0.15, 0.035)
  for (const x of [-1.26, 1.26]) for (const z of [-0.94, 0.94]) {
    box(root, m.graphite, [0.54, 0.3, 0.48], [x, 0.15, z], 0.13, 0.03)
    boltFront(root, m, x, 0.22, z + (z > 0 ? 0.27 : -0.27))
  }
  box(root, m.ink, [0.98, 0.18, 0.18], [0, 0.34, 1.31], 0.06, 0.015)
  box(root, m.amber, [0.64, 0.08, 0.055], [0, 0.35, 1.43], 0.03, 0.008)
}

function addCabinet(root: Group, m: Mats): void {
  // Closed rear core plus disjoint pale corner courses form a continuous armored body.
  box(root, m.graphite, [1.92, 3.62, 1.58], [0, 2.72, -0.12], 0.18, 0.045)
  box(root, m.ink, [1.72, 3.34, 1.36], [0, 2.84, -0.02], 0.15, 0.038)
  for (const x of [-1.23, 1.23]) {
    box(root, m.shell, [0.5, 3.76, 2.08], [x, 2.76, 0], 0.18, 0.045)
    box(root, m.shade, [0.12, 3.2, 1.82], [x - Math.sign(x) * 0.31, 2.8, -0.04], 0.045, 0.012)
  }
  box(root, m.shell, [2.08, 0.6, 1.92], [0, 4.76, 0], 0.18, 0.045)
  box(root, m.shell, [2.08, 0.5, 1.92], [0, 1.06, 0], 0.16, 0.04)
  box(root, m.shell, [1.9, 2.3, 1.72], [0, 2.17, -0.04], 0.16, 0.04)
  // Recessed lower front access door and its captured toe latch.
  box(root, m.shade, [1.78, 2.18, 0.18], [0, 2.17, 1.15], 0.13, 0.032)
  box(root, m.shell, [1.58, 1.93, 0.12], [0, 2.2, 1.29], 0.11, 0.028)
  box(root, m.graphite, [0.72, 0.48, 0.2], [0, 1.15, 1.39], 0.11, 0.028)
  box(root, m.ink, [0.38, 0.2, 0.1], [0, 1.2, 1.52], 0.06, 0.016)
  for (const x of [-0.25, 0.25]) boltFront(root, m, x, 1.39, 1.51)
}

function addIntake(root: Group, m: Mats): void {
  // True negative-space mouth: four separate rails, a rear liner and a low bin floor.
  box(root, m.ink, [1.72, 1.05, 0.16], [0, 3.86, 0.42], 0.18, 0.04)
  box(root, m.graphite, [2.25, 0.28, 0.5], [0, 4.47, 1.18], 0.11, 0.028, [-0.12, 0, 0])
  box(root, m.graphite, [2.25, 0.28, 0.5], [0, 3.24, 1.18], 0.11, 0.028, [0.12, 0, 0])
  box(root, m.graphite, [0.3, 1.42, 0.5], [-1.1, 3.86, 1.18], 0.11, 0.028, [0, 0, 0.08])
  box(root, m.graphite, [0.3, 1.42, 0.5], [1.1, 3.86, 1.18], 0.11, 0.028, [0, 0, -0.08])
  box(root, m.amber, [1.42, 0.1, 0.07], [0, 4.32, 1.47], 0.035, 0.009)
  // Interior floor visibly runs back into the closed bin host.
  box(root, m.ink, [1.75, 0.12, 1.16], [0, 3.37, 0.86], 0.08, 0.02, [-0.14, 0, 0])
}

function addTop(root: Group, m: Mats): void {
  box(root, m.graphite, [1.5, 0.12, 1.08], [0, 5.1, -0.03], 0.12, 0.03)
  box(root, m.ink, [1.08, 0.045, 0.72], [0, 5.18, -0.03], 0.08, 0.02)
}

function addSideService(root: Group, m: Mats): void {
  // Right-side deep framed vent bay with cyan witness.
  box(root, m.ink, [0.14, 2.3, 1.02], [1.53, 3.0, -0.05], 0.12, 0.03)
  box(root, m.graphite, [0.18, 0.18, 1.22], [1.63, 4.18, -0.05], 0.055, 0.014)
  box(root, m.graphite, [0.18, 0.18, 1.22], [1.63, 1.82, -0.05], 0.055, 0.014)
  box(root, m.graphite, [0.18, 2.54, 0.18], [1.63, 3.0, -0.57], 0.055, 0.014)
  box(root, m.graphite, [0.18, 2.54, 0.18], [1.63, 3.0, 0.47], 0.055, 0.014)
  for (let i = -3; i <= 3; i += 1) box(root, m.shade, [0.08, 0.09, 0.56], [1.62, 2.62 + i * 0.17, -0.05], 0.02, 0.005, [0, 0, 0.75])
  box(root, m.graphite, [0.16, 0.3, 0.76], [1.61, 4.0, -0.05], 0.07, 0.018)
  box(root, m.cyan, [0.07, 0.1, 0.54], [1.71, 4.0, -0.05], 0.025, 0.007)
  // Rear maintenance closure.
  box(root, m.shade, [1.62, 2.6, 0.12], [0, 2.75, -1.16], 0.14, 0.035)
  box(root, m.graphite, [1.26, 0.34, 0.1], [0, 3.86, -1.25], 0.07, 0.018)
}

function addFrontSymbol(root: Group, m: Mats): void {
  // Physical maintenance badge; every stroke is seated into the lower door face.
  const z = 1.37
  for (const x of [-0.46, 0.46]) box(root, m.amber, [0.05, 0.04, 0.04], [x, 2.38, z], 0.01, 0.003)
  box(root, m.amber, [0.82, 0.04, 0.04], [0, 2.78, z], 0.01, 0.003)
  box(root, m.amber, [0.82, 0.04, 0.04], [0, 1.98, z], 0.01, 0.003)
  box(root, m.amber, [0.04, 0.76, 0.04], [-0.46, 2.38, z], 0.01, 0.003)
  box(root, m.amber, [0.04, 0.76, 0.04], [0.46, 2.38, z], 0.01, 0.003)
  root.add(cylinder(m.amber, 0.09, 0.045, [0.13, 2.58, z], Z_AXIS, 14))
  box(root, m.amber, [0.12, 0.42, 0.04], [0.13, 2.3, z], 0.025, 0.006)
  box(root, m.amber, [0.22, 0.04, 0.04], [-0.14, 2.28, z], 0.01, 0.003, [0, 0, -0.55])
  box(root, m.amber, [0.18, 0.32, 0.04], [-0.25, 2.17, z], 0.025, 0.006)
}

function build() {
  const m = materials(); const root = new Group(); root.name = 'trash can'
  addBase(root, m); addCabinet(root, m); addIntake(root, m); addTop(root, m); addSideService(root, m); addFrontSymbol(root, m)
  const geometries = mergeStaticByMaterial(root, { meshName: (material: { name?: string }) => material.name ?? 'trash-can batch' })
  return { root, m, geometries }
}

export function createModel(): Controller { const rig = build(); return { root: rig.root, update: () => {}, dispose: () => { for (const geometry of rig.geometries) geometry.dispose(); for (const material of Object.values(rig.m)) material.dispose() } } }

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low' } = {}): Preview {
  const model = createModel(); const scene = new Scene(); scene.background = new Color(0x010203); scene.add(model.root, new HemisphereLight(0xc4cdcf, 0x05070a, 0.84))
  const key = new DirectionalLight(0xffead9, 2.75); key.position.set(-7, 10, 8); scene.add(key)
  const fill = new DirectionalLight(0x6d93bc, 1.04); fill.position.set(8, 6, 7); scene.add(fill)
  const rim = new DirectionalLight(0x8db5b8, 0.9); rim.position.set(7, 9, -8); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x080b0e, roughness: 0.94, metalness: 0.02 }); const floorGeometry = new PlaneGeometry(12, 12); const floor = new Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.004; floor.userData.excludeFromExport = true; scene.add(floor)
  const camera = new PerspectiveCamera(34, options.aspect ?? 1, 0.12, 100)
  if (options.mode === 'side') camera.position.set(-7.2, 2.7, 0)
  else if (options.mode === 'rear') camera.position.set(5.8, 3.1, -7.1)
  else if (options.mode === 'low') camera.position.set(-5.8, 0.45, 6.7)
  else camera.position.set(6.7, 4.05, 9.0)
  camera.lookAt(0, options.mode === 'low' ? 2.3 : 2.65, 0); scene.add(camera)
  return { ...model, scene, camera, dispose: () => { floorGeometry.dispose(); floorMaterial.dispose(); model.dispose() } }
}

export const createPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
