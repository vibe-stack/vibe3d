import { Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshPhysicalMaterial, PerspectiveCamera, PlaneGeometry, Scene } from 'three/webgpu'
import { WEAR_ATTRIBUTES, bakeOcclusion, bakeSurfaceAttributes, createWearMaterial, cylinder, mergeStaticByMaterial, prism, type Vec3, type WearProfile } from '../../../src/asset-forge/generator/index.ts'

const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]
const X_AXIS: Vec3 = [0, 0, Math.PI / 2]
interface Mats { shell: MeshPhysicalMaterial; shade: MeshPhysicalMaterial; graphite: MeshPhysicalMaterial; ink: MeshPhysicalMaterial; steel: MeshPhysicalMaterial; amber: MeshPhysicalMaterial; cyan: MeshPhysicalMaterial; grime: MeshPhysicalMaterial }
interface Controller { root: Group; update: (delta: number) => void; dispose: () => void }
interface Preview extends Controller { scene: Scene; camera: PerspectiveCamera }

function materials(): Mats { return {
  shell: new MeshPhysicalMaterial({ name: 'industrial street lamp / pale armor', color: 0xcdd2d1, roughness: 0.46, metalness: 0.32, clearcoat: 0.12, clearcoatRoughness: 0.44 }),
  shade: new MeshPhysicalMaterial({ name: 'industrial street lamp / shaded armor', color: 0x8f989a, roughness: 0.54, metalness: 0.46, clearcoat: 0.07 }),
  graphite: new MeshPhysicalMaterial({ name: 'industrial street lamp / graphite chassis', color: 0x182028, roughness: 0.57, metalness: 0.69, clearcoat: 0.06 }),
  ink: new MeshPhysicalMaterial({ name: 'industrial street lamp / dark recess', color: 0x05080a, roughness: 0.85, metalness: 0.08 }),
  steel: new MeshPhysicalMaterial({ name: 'industrial street lamp / exposed steel', color: 0x7c8689, roughness: 0.33, metalness: 0.9, clearcoat: 0.08 }),
  amber: new MeshPhysicalMaterial({ name: 'industrial street lamp / amber diffuser', color: 0xd67808, roughness: 0.21, metalness: 0.03, emissive: new Color(0xff6500), emissiveIntensity: 0.82, clearcoat: 0.19 }),
  cyan: new MeshPhysicalMaterial({ name: 'industrial street lamp / cyan service light', color: 0x42d2df, roughness: 0.2, metalness: 0.03, emissive: new Color(0x27c9da), emissiveIntensity: 0.9, clearcoat: 0.17 }),
  grime: new MeshPhysicalMaterial({ name: 'industrial street lamp / localized contact grime', color: 0x28231f, roughness: 0.92, metalness: 0.04 }),
} }

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.08, bevel = 0.025, rotation: Vec3 = [0, 0, 0]): Mesh {
  const mesh = prism(material, size, position, { chamfer, fillet: Math.min(0.05, Math.max(0.008, chamfer * 0.28)), bevel, rotation }); parent.add(mesh); return mesh
}
function bolt(parent: Group, m: Mats, x: number, y: number, z: number): void { parent.add(cylinder(m.steel, 0.047, 0.085, [x, y, z], Z_AXIS, 9)) }

function addPoleAndBrace(root: Group, m: Mats): void {
  root.add(cylinder(m.graphite, 0.52, 0.28, [0, 0.14, 0], [0, 0, 0], 16))
  root.add(cylinder(m.graphite, 0.42, 2.0, [0, 1.12, 0], [0, 0, 0], 16))
  root.add(cylinder(m.graphite, 0.48, 0.28, [0, 0.72, 0], [0, 0, 0], 16))
  root.add(cylinder(m.graphite, 0.52, 0.26, [0, 1.95, 0], [0, 0, 0], 16))
  for (const x of [-0.28, 0.28]) bolt(root, m, x, 1.95, 0.43)
  // Twin-member diagonal yoke terminates inside explicit upper and lower pivots.
  for (const z of [-0.2, 0.2]) box(root, m.graphite, [0.2, 1.66, 0.18], [-0.46, 1.72, z], 0.06, 0.016, [0, 0, -0.46])
  box(root, m.graphite, [0.66, 0.44, 0.72], [-0.16, 2.34, 0.02], 0.14, 0.035)
  box(root, m.graphite, [0.62, 0.46, 0.72], [-0.18, 1.05, 0.02], 0.14, 0.035)
  root.add(cylinder(m.steel, 0.16, 0.84, [-0.18, 1.05, 0.02], Z_AXIS, 12))
  root.add(cylinder(m.steel, 0.16, 0.84, [-0.16, 2.34, 0.02], Z_AXIS, 12))
  box(root, m.grime, [0.48, 0.05, 0.08], [0, 0.34, 0.45], 0.025, 0.007)
}

function addHead(root: Group, m: Mats): void {
  // One deep head chassis carries all front and side masses.
  box(root, m.graphite, [2.38, 3.08, 1.42], [0, 3.68, 0], 0.34, 0.085)
  box(root, m.ink, [2.14, 2.76, 1.26], [0, 3.66, 0.1], 0.3, 0.075)
  // Broad overhanging cap and rear/side armor reproduce the asymmetric shell.
  box(root, m.shade, [2.54, 0.6, 1.5], [0, 5.02, -0.02], 0.24, 0.06, [0, 0, -0.08])
  box(root, m.shell, [2.44, 0.52, 1.44], [0, 5.12, 0.02], 0.22, 0.055, [0, 0, -0.08])
  box(root, m.shell, [0.52, 2.62, 1.34], [0.95, 3.82, -0.02], 0.2, 0.05)
  box(root, m.shade, [0.44, 2.18, 1.24], [0.9, 3.7, 0.08], 0.17, 0.042)
  box(root, m.shell, [0.44, 1.06, 1.3], [-0.96, 4.58, 0], 0.18, 0.045)
  // Upper recessed cooling mouth.
  box(root, m.ink, [1.32, 0.3, 0.22], [-0.2, 4.83, 0.7], 0.08, 0.02)
  for (let i = -3; i <= 3; i += 1) box(root, m.graphite, [0.11, 0.24, 0.08], [-0.2 + i * 0.17, 4.83, 0.84], 0.025, 0.007, [0, 0, -0.16])
}

function addOptic(root: Group, m: Mats): void {
  // Unified captured face, deep amber glazing and seven load-bearing guard ribs.
  box(root, m.graphite, [1.92, 2.34, 0.46], [-0.16, 3.78, 0.9], 0.25, 0.062)
  box(root, m.ink, [1.68, 2.08, 0.28], [-0.16, 3.78, 1.15], 0.22, 0.055)
  box(root, m.amber, [1.42, 1.82, 0.18], [-0.16, 3.78, 1.33], 0.19, 0.048)
  box(root, m.amber, [1.24, 1.58, 0.08], [-0.16, 3.78, 1.46], 0.15, 0.038)
  for (let i = -2; i <= 2; i += 1) box(root, m.graphite, [1.4, 0.075, 0.08], [-0.16, 3.78 + i * 0.32, 1.52], 0.018, 0.005)
  for (const x of [-0.86, 0.54]) for (const y of [2.82, 4.74]) bolt(root, m, x, y, 1.18)
}

function addServiceDetails(root: Group, m: Mats): void {
  // Lower undercut is continuous with head and pole yoke.
  box(root, m.graphite, [2.08, 0.78, 1.2], [-0.12, 2.38, 0.02], 0.22, 0.055)
  box(root, m.ink, [0.9, 0.38, 0.42], [-0.48, 2.34, 0.74], 0.1, 0.025)
  for (const x of [-0.68, -0.44, -0.2]) box(root, m.amber, [0.08, 0.18, 0.055], [x, 2.35, 0.98], 0.02, 0.006)
  // Right-side access plate and cyan witness are buried into the side shell.
  box(root, m.graphite, [0.5, 1.22, 0.72], [1.26, 3.34, -0.02], 0.13, 0.032)
  box(root, m.shell, [0.3, 0.94, 0.56], [1.42, 3.36, 0.02], 0.1, 0.025)
  box(root, m.cyan, [0.08, 0.28, 0.055], [1.59, 3.42, 0.25], 0.025, 0.007)
  for (const y of [2.98, 3.76]) root.add(cylinder(m.steel, 0.047, 0.1, [1.6, y, 0.25], X_AXIS, 9))
  // Closed rear hatch.
  box(root, m.graphite, [1.62, 1.24, 0.16], [0, 3.48, -0.78], 0.16, 0.04)
  box(root, m.shade, [1.28, 0.94, 0.1], [0, 3.48, -0.9], 0.13, 0.032)
  for (let i = -3; i <= 3; i += 1) box(root, m.ink, [0.1, 0.62, 0.05], [i * 0.16, 3.48, -0.97], 0.025, 0.007)
}

function build() {
  const m = materials(); const root = new Group(); root.name = 'industrial street lamp'; addPoleAndBrace(root, m); addHead(root, m); addOptic(root, m); addServiceDetails(root, m)
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([[m.shell, { rub: 0.08, grime: 0.03, scratch: 0.012 }], [m.shade, { rub: 0.1, grime: 0.045, scratch: 0.014 }], [m.graphite, { rub: 0.09, grime: 0.07, scratch: 0.016 }], [m.steel, { rub: 0.18, grime: 0.05, scratch: 0.024 }]])
  bakeOcclusion(root, { reach: 0.14 }); bakeSurfaceAttributes(root, profiles); const wear = createWearMaterial({ name: 'industrial street lamp / localized maintained wear', clearcoat: 0.08, clearcoatRoughness: 0.52 })
  root.traverse((object) => { if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear })
  const geometries = mergeStaticByMaterial(root, { retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [], meshName: (material: { name?: string }) => material.name ?? 'industrial-street-lamp batch' })
  return { root, m, wear, geometries }
}

export function createModel(): Controller { const rig = build(); return { root: rig.root, update: () => {}, dispose: () => { for (const geometry of rig.geometries) geometry.dispose(); rig.wear.dispose(); for (const material of Object.values(rig.m)) material.dispose() } } }

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low' } = {}): Preview {
  const model = createModel(); const scene = new Scene(); scene.background = new Color(0x020405); scene.add(model.root, new HemisphereLight(0xc4cdcf, 0x06080b, 0.84)); const key = new DirectionalLight(0xffead8, 2.8); key.position.set(-7, 10, 9); scene.add(key); const fill = new DirectionalLight(0x7197c0, 1.06); fill.position.set(8, 6, 7); scene.add(fill); const rim = new DirectionalLight(0x82adb2, 0.92); rim.position.set(7, 9, -8); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x090d10, roughness: 0.94, metalness: 0.03 }); const floorGeometry = new PlaneGeometry(13, 13); const floor = new Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.004; floor.userData.excludeFromExport = true; scene.add(floor)
  const camera = new PerspectiveCamera(34, options.aspect ?? 1, 0.12, 100); if (options.mode === 'side') camera.position.set(-7.3, 2.8, 0); else if (options.mode === 'rear') camera.position.set(6.2, 3.0, -7.4); else if (options.mode === 'low') camera.position.set(-6.2, 0.4, 7.4); else camera.position.set(5.5, 4.0, 7.4); camera.lookAt(0, options.mode === 'low' ? 2.0 : 2.65, 0); scene.add(camera)
  return { ...model, scene, camera, dispose: () => { floorGeometry.dispose(); floorMaterial.dispose(); model.dispose() } }
}

export const createPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
