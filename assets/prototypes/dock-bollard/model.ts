import { Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshPhysicalMaterial, PerspectiveCamera, PlaneGeometry, Scene } from 'three/webgpu'
import { WEAR_ATTRIBUTES, bakeOcclusion, bakeSurfaceAttributes, createWearMaterial, cylinder, mergeStaticByMaterial, prism, type Vec3, type WearProfile } from '../../../src/asset-forge/generator/index.ts'

const X_AXIS: Vec3 = [0, 0, Math.PI / 2]
const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]
interface Mats { shell: MeshPhysicalMaterial; shade: MeshPhysicalMaterial; graphite: MeshPhysicalMaterial; ink: MeshPhysicalMaterial; steel: MeshPhysicalMaterial; amber: MeshPhysicalMaterial; cyan: MeshPhysicalMaterial; grime: MeshPhysicalMaterial }
interface Controller { root: Group; update: (delta: number) => void; dispose: () => void }
interface Preview extends Controller { scene: Scene; camera: PerspectiveCamera }

function materials(): Mats { return {
  shell: new MeshPhysicalMaterial({ name: 'dock bollard / pale armor', color: 0xcfd3d1, roughness: 0.47, metalness: 0.31, clearcoat: 0.12, clearcoatRoughness: 0.44 }),
  shade: new MeshPhysicalMaterial({ name: 'dock bollard / shaded armor', color: 0x8f9899, roughness: 0.55, metalness: 0.45, clearcoat: 0.07 }),
  graphite: new MeshPhysicalMaterial({ name: 'dock bollard / graphite chassis', color: 0x182027, roughness: 0.57, metalness: 0.69, clearcoat: 0.06 }),
  ink: new MeshPhysicalMaterial({ name: 'dock bollard / dark recess', color: 0x05080a, roughness: 0.86, metalness: 0.08 }),
  steel: new MeshPhysicalMaterial({ name: 'dock bollard / exposed steel', color: 0x7e8789, roughness: 0.33, metalness: 0.9, clearcoat: 0.08 }),
  amber: new MeshPhysicalMaterial({ name: 'dock bollard / amber collar light', color: 0xd57908, roughness: 0.21, metalness: 0.03, emissive: new Color(0xff6500), emissiveIntensity: 0.85, clearcoat: 0.2 }),
  cyan: new MeshPhysicalMaterial({ name: 'dock bollard / cyan service light', color: 0x42d3df, roughness: 0.2, metalness: 0.03, emissive: new Color(0x27c9db), emissiveIntensity: 0.9, clearcoat: 0.17 }),
  grime: new MeshPhysicalMaterial({ name: 'dock bollard / localized contact grime', color: 0x28231f, roughness: 0.92, metalness: 0.04 }),
} }

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.08, bevel = 0.025, rotation: Vec3 = [0, 0, 0]): Mesh {
  const mesh = prism(material, size, position, { chamfer, fillet: Math.min(0.05, Math.max(0.008, chamfer * 0.28)), bevel, rotation }); parent.add(mesh); return mesh
}
function boltZ(parent: Group, m: Mats, x: number, y: number, z: number): void { parent.add(cylinder(m.steel, 0.055, 0.1, [x, y, z], Z_AXIS, 9)) }

function addBase(root: Group, m: Mats): void {
  root.add(cylinder(m.graphite, 2.12, 0.3, [0, 0.15, 0], [0, 0, 0], 20))
  root.add(cylinder(m.shade, 2.02, 0.24, [0, 0.36, 0], [0, 0, 0], 20))
  root.add(cylinder(m.shell, 1.9, 0.34, [0, 0.54, 0], [0, 0, 0], 20))
  root.add(cylinder(m.graphite, 1.62, 0.2, [0, 0.75, 0], [0, 0, 0], 20))
  // Four radial armored load shoes and broad ground pads.
  for (let i = 0; i < 4; i += 1) {
    const angle = i * Math.PI / 2; const x = Math.sin(angle) * 1.45; const z = Math.cos(angle) * 1.45
    box(root, m.shell, [0.78, 0.9, 0.96], [x, 0.62, z], 0.2, 0.05, [0, angle, 0])
    box(root, m.graphite, [0.64, 0.16, 0.78], [x, 0.08, z], 0.12, 0.03, [0, angle, 0])
    boltZ(root, m, x, 0.79, z + (z >= 0 ? 0.27 : -0.27))
  }
  // Front recessed base port and amber service eyebrow.
  box(root, m.graphite, [1.22, 0.42, 0.34], [0, 0.36, 1.89], 0.14, 0.035)
  box(root, m.ink, [0.82, 0.24, 0.18], [0, 0.34, 2.08], 0.09, 0.022)
  box(root, m.amber, [0.5, 0.08, 0.055], [0, 0.57, 2.08], 0.03, 0.008)
  root.add(cylinder(m.steel, 0.09, 0.11, [0, 0.29, 2.19], Z_AXIS, 10))
}

function addBody(root: Group, m: Mats): void {
  root.add(cylinder(m.graphite, 1.34, 1.8, [0, 1.58, 0], [0, 0, 0], 20))
  root.add(cylinder(m.ink, 1.2, 1.56, [0, 1.6, 0], [0, 0, 0], 20))
  root.add(cylinder(m.graphite, 1.38, 0.2, [0, 0.82, 0], [0, 0, 0], 20))
  // Eight amber collar windows separated by structural graphite mullions.
  root.add(cylinder(m.amber, 1.4, 0.3, [0, 2.45, 0], [0, 0, 0], 24))
  root.add(cylinder(m.graphite, 1.42, 0.1, [0, 2.24, 0], [0, 0, 0], 24))
  root.add(cylinder(m.graphite, 1.42, 0.1, [0, 2.66, 0], [0, 0, 0], 24))
  for (let i = 0; i < 8; i += 1) {
    const angle = i * Math.PI / 4; box(root, m.graphite, [0.18, 0.42, 0.36], [Math.sin(angle) * 1.35, 2.45, Math.cos(angle) * 1.35], 0.05, 0.012, [0, angle, 0])
  }
}

function addMooringHorns(root: Group, m: Mats): void {
  // Opposed horns share coaxial roots swallowed by body collars.
  for (const side of [-1, 1]) {
    root.add(cylinder(m.graphite, 0.5, 1.5, [side * 1.58, 1.95, 0], X_AXIS, 14))
    root.add(cylinder(m.shade, 0.38, 1.18, [side * 1.72, 1.95, 0], X_AXIS, 14))
    root.add(cylinder(m.graphite, 0.56, 0.28, [side * 1.12, 1.95, 0], X_AXIS, 14))
    root.add(cylinder(m.steel, 0.31, 0.12, [side * 2.34, 1.95, 0], X_AXIS, 14))
    box(root, m.amber, [0.08, 0.14, 0.18], [side * 2.18, 1.78, 0.31], 0.03, 0.008)
  }
}

function addTopAndService(root: Group, m: Mats): void {
  root.add(cylinder(m.shade, 1.66, 0.32, [0, 2.76, 0], [0, 0, 0], 20))
  root.add(cylinder(m.shell, 1.74, 0.5, [0, 3.02, 0], [0, 0, 0], 20))
  root.add(cylinder(m.graphite, 1.06, 0.12, [0, 3.32, 0], [0, 0, 0], 22))
  root.add(cylinder(m.ink, 0.87, 0.07, [0, 3.39, 0], [0, 0, 0], 22))
  // Front service panel penetrates the cylindrical host and carries a recessed cyan witness.
  box(root, m.graphite, [0.96, 1.18, 0.54], [0, 1.44, 1.08], 0.17, 0.042)
  box(root, m.ink, [0.7, 0.92, 0.28], [0, 1.44, 1.39], 0.13, 0.032)
  box(root, m.cyan, [0.32, 0.1, 0.055], [0, 1.62, 1.55], 0.035, 0.01)
  box(root, m.cyan, [0.14, 0.14, 0.055], [0, 1.38, 1.55], 0.025, 0.007, [0, 0, Math.PI / 4])
  boltZ(root, m, 0, 1.84, 1.54)
  box(root, m.grime, [0.74, 0.05, 0.08], [0, 0.82, 1.24], 0.025, 0.007)
  // Closed rear hatch.
  box(root, m.graphite, [0.9, 0.98, 0.42], [0, 1.42, -1.14], 0.15, 0.038)
  box(root, m.shade, [0.66, 0.72, 0.2], [0, 1.42, -1.38], 0.12, 0.03)
  for (const x of [-0.24, 0.24]) for (const y of [1.18, 1.66]) root.add(cylinder(m.steel, 0.038, 0.07, [x, y, -1.51], Z_AXIS, 8))
}

function build() {
  const m = materials(); const root = new Group(); root.name = 'dock bollard'; addBase(root, m); addBody(root, m); addMooringHorns(root, m); addTopAndService(root, m)
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([[m.shell, { rub: 0.08, grime: 0.03, scratch: 0.012 }], [m.shade, { rub: 0.1, grime: 0.045, scratch: 0.014 }], [m.graphite, { rub: 0.1, grime: 0.075, scratch: 0.017 }], [m.steel, { rub: 0.18, grime: 0.05, scratch: 0.024 }]])
  bakeOcclusion(root, { reach: 0.14 }); bakeSurfaceAttributes(root, profiles); const wear = createWearMaterial({ name: 'dock bollard / localized maintained wear', clearcoat: 0.08, clearcoatRoughness: 0.52 })
  root.traverse((object) => { if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear })
  const geometries = mergeStaticByMaterial(root, { retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [], meshName: (material: { name?: string }) => material.name ?? 'dock-bollard batch' })
  return { root, m, wear, geometries }
}

export function createModel(): Controller { const rig = build(); return { root: rig.root, update: () => {}, dispose: () => { for (const geometry of rig.geometries) geometry.dispose(); rig.wear.dispose(); for (const material of Object.values(rig.m)) material.dispose() } } }

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low' } = {}): Preview {
  const model = createModel(); const scene = new Scene(); scene.background = new Color(0x020405); scene.add(model.root, new HemisphereLight(0xc4cecf, 0x06080b, 0.84)); const key = new DirectionalLight(0xffead8, 2.8); key.position.set(-7, 10, 9); scene.add(key); const fill = new DirectionalLight(0x7297c0, 1.06); fill.position.set(8, 6, 7); scene.add(fill); const rim = new DirectionalLight(0x82adb2, 0.92); rim.position.set(7, 9, -8); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x090d10, roughness: 0.94, metalness: 0.03 }); const floorGeometry = new PlaneGeometry(13, 13); const floor = new Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.004; floor.userData.excludeFromExport = true; scene.add(floor)
  const camera = new PerspectiveCamera(34, options.aspect ?? 1, 0.12, 100); if (options.mode === 'side') camera.position.set(-7.4, 1.7, 0); else if (options.mode === 'rear') camera.position.set(6.2, 2.2, -7.4); else if (options.mode === 'low') camera.position.set(-6.2, 0.38, 7.4); else camera.position.set(-6.4, 4.05, 7.6); camera.lookAt(0, options.mode === 'low' ? 1.1 : 1.58, 0); scene.add(camera)
  return { ...model, scene, camera, dispose: () => { floorGeometry.dispose(); floorMaterial.dispose(); model.dispose() } }
}

export const createPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
