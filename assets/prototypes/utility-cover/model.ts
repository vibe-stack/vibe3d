import { Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshPhysicalMaterial, PerspectiveCamera, PlaneGeometry, Scene } from 'three/webgpu'
import { WEAR_ATTRIBUTES, bakeOcclusion, bakeSurfaceAttributes, createWearMaterial, cylinder, mergeStaticByMaterial, prism, type Vec3, type WearProfile } from '../../../src/asset-forge/generator/index.ts'

const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]
interface Mats { shell: MeshPhysicalMaterial; shade: MeshPhysicalMaterial; graphite: MeshPhysicalMaterial; ink: MeshPhysicalMaterial; steel: MeshPhysicalMaterial; amber: MeshPhysicalMaterial; cyan: MeshPhysicalMaterial; grime: MeshPhysicalMaterial }
interface Controller { root: Group; update: (delta: number) => void; dispose: () => void }
interface Preview extends Controller { scene: Scene; camera: PerspectiveCamera }

function materials(): Mats { return {
  shell: new MeshPhysicalMaterial({ name: 'utility cover / pale armor', color: 0xcdd2d0, roughness: 0.48, metalness: 0.31, clearcoat: 0.11, clearcoatRoughness: 0.46 }),
  shade: new MeshPhysicalMaterial({ name: 'utility cover / shaded armor', color: 0x90999a, roughness: 0.56, metalness: 0.45, clearcoat: 0.06 }),
  graphite: new MeshPhysicalMaterial({ name: 'utility cover / graphite chassis', color: 0x182027, roughness: 0.58, metalness: 0.68, clearcoat: 0.05 }),
  ink: new MeshPhysicalMaterial({ name: 'utility cover / dark recess', color: 0x05080a, roughness: 0.87, metalness: 0.08 }),
  steel: new MeshPhysicalMaterial({ name: 'utility cover / exposed steel', color: 0x7c8689, roughness: 0.34, metalness: 0.9, clearcoat: 0.08 }),
  amber: new MeshPhysicalMaterial({ name: 'utility cover / amber service light', color: 0xd57808, roughness: 0.21, metalness: 0.03, emissive: new Color(0xff6400), emissiveIntensity: 0.8, clearcoat: 0.18 }),
  cyan: new MeshPhysicalMaterial({ name: 'utility cover / cyan witness', color: 0x42d2de, roughness: 0.2, metalness: 0.03, emissive: new Color(0x27c8da), emissiveIntensity: 0.88, clearcoat: 0.16 }),
  grime: new MeshPhysicalMaterial({ name: 'utility cover / localized tread grime', color: 0x28231f, roughness: 0.92, metalness: 0.04 }),
} }

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.06, bevel = 0.02, rotation: Vec3 = [0, 0, 0]): Mesh {
  const mesh = prism(material, size, position, { chamfer, fillet: Math.min(0.045, Math.max(0.008, chamfer * 0.28)), bevel, rotation }); parent.add(mesh); return mesh
}
function boltZ(parent: Group, m: Mats, x: number, y: number, z: number): void { parent.add(cylinder(m.steel, 0.055, 0.09, [x, y, z], Z_AXIS, 9)) }

function addDeck(root: Group, m: Mats): void {
  root.add(cylinder(m.graphite, 2.55, 0.26, [0, 0.13, 0], [0, 0, 0], 24))
  root.add(cylinder(m.shade, 2.4, 0.28, [0, 0.34, 0], [0, 0, 0], 24))
  root.add(cylinder(m.graphite, 2.25, 0.32, [0, 0.55, 0], [0, 0, 0], 24))
  root.add(cylinder(m.shell, 2.14, 0.32, [0, 0.76, 0], [0, 0, 0], 24))
  root.add(cylinder(m.shade, 1.96, 0.12, [0, 0.96, 0], [0, 0, 0], 24))
  root.add(cylinder(m.shell, 1.88, 0.14, [0, 1.07, 0], [0, 0, 0], 24))
  // Four radial brace towers connect ground ring to the upper cover.
  for (let i = 0; i < 4; i += 1) {
    const angle = i * Math.PI / 2; const x = Math.sin(angle) * 2.18; const z = Math.cos(angle) * 2.18
    box(root, m.graphite, [0.32, 0.72, 0.62], [x, 0.56, z], 0.1, 0.025, [0, angle, 0])
    box(root, m.cyan, [0.16, 0.07, 0.055], [x, 0.74, z + (z >= 0 ? 0.34 : -0.34)], 0.025, 0.007, [0, angle, 0])
  }
  for (let i = 0; i < 8; i += 1) {
    const angle = i * Math.PI / 4; boltZ(root, m, Math.sin(angle) * 1.99, 1.17, Math.cos(angle) * 1.99)
  }
}

function addTopPattern(root: Group, m: Mats): void {
  // Physical non-slip crosses, clipped away from the two handle wells and center port.
  for (let ix = -6; ix <= 6; ix += 1) for (let iz = -5; iz <= 5; iz += 1) {
    const x = ix * 0.25; const z = iz * 0.24
    if (x * x + z * z > 2.35) continue
    if (Math.abs(x) > 0.75 && Math.abs(x) < 1.45 && Math.abs(z) < 0.42) continue
    if (x * x + z * z < 0.44) continue
    box(root, m.shade, [0.16, 0.035, 0.045], [x, 1.16, z], 0.012, 0.003)
    box(root, m.shade, [0.045, 0.035, 0.16], [x, 1.16, z], 0.012, 0.003)
  }
  box(root, m.grime, [1.0, 0.025, 0.04], [0, 1.18, -1.48], 0.012, 0.003)
}

function addHandles(root: Group, m: Mats): void {
  for (const x of [-1.15, 1.15]) {
    box(root, m.graphite, [0.72, 0.13, 0.62], [x, 1.12, 0.04], 0.14, 0.035)
    box(root, m.ink, [0.5, 0.09, 0.4], [x, 1.2, 0.04], 0.1, 0.025)
    root.add(cylinder(m.steel, 0.07, 0.42, [x, 1.29, 0.04], Z_AXIS, 10))
    box(root, m.graphite, [0.14, 0.16, 0.16], [x, 1.24, -0.22], 0.04, 0.01)
    box(root, m.graphite, [0.14, 0.16, 0.16], [x, 1.24, 0.3], 0.04, 0.01)
  }
}

function addCenterPort(root: Group, m: Mats): void {
  root.add(cylinder(m.graphite, 0.66, 0.14, [0, 1.16, 0], [0, 0, 0], 20))
  root.add(cylinder(m.ink, 0.48, 0.12, [0, 1.27, 0], [0, 0, 0], 20))
  root.add(cylinder(m.amber, 0.34, 0.1, [0, 1.37, 0], [0, 0, 0], 18))
  for (let i = -2; i <= 2; i += 1) box(root, m.graphite, [0.46, 0.05, 0.055], [0, 1.45, i * 0.1], 0.018, 0.005)
  box(root, m.graphite, [0.42, 0.14, 0.38], [0, 1.18, 0.44], 0.08, 0.02)
  box(root, m.amber, [0.12, 0.05, 0.12], [0, 1.28, 0.59], 0.025, 0.007, [0, Math.PI / 4, 0])
  for (let i = 0; i < 6; i += 1) {
    const angle = i * Math.PI / 3; boltZ(root, m, Math.sin(angle) * 0.55, 1.36, Math.cos(angle) * 0.55)
  }
}

function addSideServices(root: Group, m: Mats): void {
  // Two long amber light wells are physically buried into the circular chassis.
  for (const x of [-1.0, 1.0]) {
    box(root, m.graphite, [0.88, 0.38, 0.5], [x, 0.55, 2.02], 0.1, 0.025)
    box(root, m.ink, [0.66, 0.2, 0.28], [x, 0.55, 2.31], 0.07, 0.018)
    box(root, m.amber, [0.5, 0.09, 0.08], [x, 0.55, 2.48], 0.03, 0.008)
  }
  box(root, m.graphite, [0.78, 0.62, 0.48], [0, 0.5, 2.08], 0.13, 0.032)
  box(root, m.ink, [0.52, 0.38, 0.25], [0, 0.5, 2.36], 0.09, 0.022)
  box(root, m.cyan, [0.14, 0.1, 0.055], [0, 0.52, 2.51], 0.025, 0.007, [0, 0, Math.PI / 4])
  for (const x of [-0.22, 0.22]) boltZ(root, m, x, 0.72, 2.49)
  // Rear access closure.
  box(root, m.graphite, [1.1, 0.54, 0.44], [0, 0.5, -2.08], 0.13, 0.032)
  box(root, m.shade, [0.8, 0.3, 0.22], [0, 0.5, -2.34], 0.09, 0.022)
}

function build() {
  const m = materials(); const root = new Group(); root.name = 'utility cover'; addDeck(root, m); addTopPattern(root, m); addHandles(root, m); addCenterPort(root, m); addSideServices(root, m)
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([[m.shell, { rub: 0.08, grime: 0.03, scratch: 0.012 }], [m.shade, { rub: 0.11, grime: 0.05, scratch: 0.015 }], [m.graphite, { rub: 0.1, grime: 0.08, scratch: 0.017 }], [m.steel, { rub: 0.18, grime: 0.05, scratch: 0.024 }]])
  bakeOcclusion(root, { reach: 0.12 }); bakeSurfaceAttributes(root, profiles); const wear = createWearMaterial({ name: 'utility cover / localized maintained wear', clearcoat: 0.07, clearcoatRoughness: 0.55 })
  root.traverse((object) => { if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear })
  const geometries = mergeStaticByMaterial(root, { retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [], meshName: (material: { name?: string }) => material.name ?? 'utility-cover batch' })
  return { root, m, wear, geometries }
}

export function createModel(): Controller { const rig = build(); return { root: rig.root, update: () => {}, dispose: () => { for (const geometry of rig.geometries) geometry.dispose(); rig.wear.dispose(); for (const material of Object.values(rig.m)) material.dispose() } } }

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low' } = {}): Preview {
  const model = createModel(); const scene = new Scene(); scene.background = new Color(0x020405); scene.add(model.root, new HemisphereLight(0xc4cdcf, 0x06080b, 0.84)); const key = new DirectionalLight(0xffead8, 2.8); key.position.set(-7, 10, 9); scene.add(key); const fill = new DirectionalLight(0x7197c0, 1.06); fill.position.set(8, 6, 7); scene.add(fill); const rim = new DirectionalLight(0x82adb2, 0.92); rim.position.set(7, 9, -8); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x090d10, roughness: 0.94, metalness: 0.03 }); const floorGeometry = new PlaneGeometry(13, 13); const floor = new Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.004; floor.userData.excludeFromExport = true; scene.add(floor)
  const camera = new PerspectiveCamera(34, options.aspect ?? 1, 0.12, 100); if (options.mode === 'side') camera.position.set(-7.5, 1.2, 0); else if (options.mode === 'rear') camera.position.set(6.4, 1.7, -7.5); else if (options.mode === 'low') camera.position.set(-6.4, 0.24, 7.5); else camera.position.set(-6.2, 4.8, 7.3); camera.lookAt(0, options.mode === 'low' ? 0.55 : 0.62, 0); scene.add(camera)
  return { ...model, scene, camera, dispose: () => { floorGeometry.dispose(); floorMaterial.dispose(); model.dispose() } }
}

export const createPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
