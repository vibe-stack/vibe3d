import { Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshPhysicalMaterial, PerspectiveCamera, PlaneGeometry, Scene } from 'three/webgpu'
import { WEAR_ATTRIBUTES, bakeOcclusion, bakeSurfaceAttributes, createWearMaterial, cylinder, mergeStaticByMaterial, prism, type Vec3, type WearProfile } from '../../../src/asset-forge/generator/index.ts'

const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]
interface Mats { shell: MeshPhysicalMaterial; shade: MeshPhysicalMaterial; graphite: MeshPhysicalMaterial; ink: MeshPhysicalMaterial; steel: MeshPhysicalMaterial; amber: MeshPhysicalMaterial; cyan: MeshPhysicalMaterial; grime: MeshPhysicalMaterial }
interface Controller { root: Group; update: (delta: number) => void; dispose: () => void }
interface Preview extends Controller { scene: Scene; camera: PerspectiveCamera }

function materials(): Mats { return {
  shell: new MeshPhysicalMaterial({ name: 'traffic bollard / pale armor', color: 0xd0d4d3, roughness: 0.46, metalness: 0.31, clearcoat: 0.12, clearcoatRoughness: 0.44 }),
  shade: new MeshPhysicalMaterial({ name: 'traffic bollard / shaded armor', color: 0x939b9c, roughness: 0.54, metalness: 0.44, clearcoat: 0.07 }),
  graphite: new MeshPhysicalMaterial({ name: 'traffic bollard / graphite chassis', color: 0x171e25, roughness: 0.56, metalness: 0.68, clearcoat: 0.06 }),
  ink: new MeshPhysicalMaterial({ name: 'traffic bollard / dark recess', color: 0x05080a, roughness: 0.86, metalness: 0.08 }),
  steel: new MeshPhysicalMaterial({ name: 'traffic bollard / exposed steel', color: 0x798386, roughness: 0.33, metalness: 0.9, clearcoat: 0.08 }),
  amber: new MeshPhysicalMaterial({ name: 'traffic bollard / amber signal', color: 0xd87908, roughness: 0.2, metalness: 0.03, emissive: new Color(0xff6200), emissiveIntensity: 0.92, clearcoat: 0.2 }),
  cyan: new MeshPhysicalMaterial({ name: 'traffic bollard / cyan service light', color: 0x41d4df, roughness: 0.2, metalness: 0.03, emissive: new Color(0x27cada), emissiveIntensity: 0.9, clearcoat: 0.16 }),
  grime: new MeshPhysicalMaterial({ name: 'traffic bollard / localized base grime', color: 0x28231f, roughness: 0.92, metalness: 0.04 }),
} }

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.06, bevel = 0.02, rotation: Vec3 = [0, 0, 0]): Mesh {
  const mesh = prism(material, size, position, { chamfer, fillet: Math.min(0.045, Math.max(0.008, chamfer * 0.28)), bevel, rotation }); parent.add(mesh); return mesh
}
function bolt(parent: Group, m: Mats, x: number, y: number, z: number): void { parent.add(cylinder(m.steel, 0.042, 0.08, [x, y, z], Z_AXIS, 8)) }

function addGroundedBase(root: Group, m: Mats): void {
  root.add(cylinder(m.graphite, 1.28, 0.42, [0, 0.21, 0], [0, 0, 0], 16))
  root.add(cylinder(m.shade, 1.12, 0.22, [0, 0.5, 0], [0, 0, 0], 18))
  root.add(cylinder(m.graphite, 0.96, 0.48, [0, 0.78, 0], [0, 0, 0], 18))
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const x = Math.sin(angle) * 1.04; const z = Math.cos(angle) * 1.04
    box(root, m.graphite, [0.62, 0.22, 0.72], [x, 0.11, z], 0.12, 0.03, [0, angle, 0])
    box(root, m.steel, [0.18, 0.055, 0.2], [x, 0.028, z], 0.04, 0.01, [0, angle, 0])
  }
  box(root, m.ink, [0.56, 0.24, 0.18], [0, 0.28, 1.25], 0.07, 0.018)
  root.add(cylinder(m.steel, 0.065, 0.09, [0, 0.31, 1.38], Z_AXIS, 8))
  box(root, m.cyan, [0.34, 0.08, 0.05], [0.63, 0.3, 1.3], 0.025, 0.007)
}

function addBody(root: Group, m: Mats): void {
  root.add(cylinder(m.shade, 0.94, 3.46, [0, 2.48, 0], [0, 0, 0], 18))
  root.add(cylinder(m.shell, 0.86, 3.22, [0, 2.54, 0], [0, 0, 0], 18))
  root.add(cylinder(m.graphite, 0.91, 0.3, [0, 1.0, 0], [0, 0, 0], 18))
  // Integrated upper armor crown and seated dark top well.
  root.add(cylinder(m.shade, 1.0, 0.72, [0, 4.35, 0], [0, 0, 0], 18))
  root.add(cylinder(m.shell, 0.94, 0.58, [0, 4.42, 0], [0, 0, 0], 18))
  root.add(cylinder(m.graphite, 0.74, 0.1, [0, 4.74, 0], [0, 0, 0], 20))
  root.add(cylinder(m.ink, 0.62, 0.06, [0, 4.8, 0], [0, 0, 0], 20))
}

function addSignalWindow(root: Group, m: Mats): void {
  // Thick four-sided aperture, recessed lens backing, and captured honeycomb witnesses.
  box(root, m.ink, [1.46, 1.0, 0.72], [0, 3.74, 0.62], 0.2, 0.05)
  box(root, m.graphite, [1.66, 0.22, 0.72], [0, 4.28, 0.72], 0.1, 0.026)
  box(root, m.graphite, [1.66, 0.22, 0.72], [0, 3.2, 0.72], 0.1, 0.026)
  box(root, m.graphite, [0.24, 0.92, 0.72], [-0.71, 3.74, 0.72], 0.09, 0.022)
  box(root, m.graphite, [0.24, 0.92, 0.72], [0.71, 3.74, 0.72], 0.09, 0.022)
  box(root, m.amber, [1.3, 0.7, 0.16], [0, 3.74, 1.0], 0.16, 0.04)
  // Dark separators visually embed the amber cell instead of leaving a flat glowing slab.
  for (const y of [3.55, 3.74, 3.93]) for (let i = -4; i <= 4; i += 1) root.add(cylinder(m.graphite, 0.028, 0.07, [i * 0.13 + (y === 3.74 ? 0.065 : 0), y, 1.13], Z_AXIS, 7))
  for (const x of [-0.73, 0.73]) for (const y of [3.25, 4.23]) bolt(root, m, x, y, 1.1)
}

function addFrontServices(root: Group, m: Mats): void {
  // Three physically seated diagonal warning bars around the mid-shell.
  for (const x of [-0.48, 0, 0.48]) box(root, m.amber, [0.2, 0.78, 0.56], [x, 2.9, 0.65], 0.035, 0.01, [0, 0, -0.58])
  // Deep access door and stepped latch stack.
  box(root, m.graphite, [1.0, 1.55, 0.62], [-0.08, 1.93, 0.65], 0.15, 0.038)
  box(root, m.shell, [0.82, 1.36, 0.12], [-0.08, 1.95, 0.95], 0.13, 0.032)
  box(root, m.ink, [0.15, 0.48, 0.08], [0.28, 1.72, 1.04], 0.04, 0.01)
  box(root, m.cyan, [0.1, 0.4, 0.055], [0.54, 1.5, 0.91], 0.025, 0.007)
  box(root, m.shade, [0.3, 0.28, 0.1], [-0.08, 1.27, 1.06], 0.07, 0.018)
  root.add(cylinder(m.steel, 0.055, 0.09, [-0.08, 1.27, 1.16], Z_AXIS, 8))
  for (const y of [1.45, 2.5]) bolt(root, m, -0.38, y, 1.08)
  box(root, m.grime, [0.92, 0.05, 0.08], [0, 1.02, 0.92], 0.02, 0.006)
}

function addRearService(root: Group, m: Mats): void {
  box(root, m.graphite, [1.02, 1.5, 0.14], [0, 2.02, -0.83], 0.15, 0.038)
  box(root, m.shade, [0.8, 1.24, 0.1], [0, 2.02, -0.96], 0.12, 0.03)
  for (let i = -2; i <= 2; i += 1) box(root, m.ink, [0.5, 0.08, 0.055], [0, 1.8 + i * 0.17, -1.04], 0.025, 0.007)
  for (const x of [-0.36, 0.36]) for (const y of [1.48, 2.56]) root.add(cylinder(m.steel, 0.038, 0.07, [x, y, -1.08], Z_AXIS, 8))
}

function build() {
  const m = materials(); const root = new Group(); root.name = 'traffic bollard'; addGroundedBase(root, m); addBody(root, m); addSignalWindow(root, m); addFrontServices(root, m); addRearService(root, m)
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([[m.shell, { rub: 0.07, grime: 0.028, scratch: 0.01 }], [m.shade, { rub: 0.09, grime: 0.045, scratch: 0.013 }], [m.graphite, { rub: 0.08, grime: 0.07, scratch: 0.014 }], [m.steel, { rub: 0.16, grime: 0.05, scratch: 0.022 }]])
  bakeOcclusion(root, { reach: 0.13 }); bakeSurfaceAttributes(root, profiles); const wear = createWearMaterial({ name: 'traffic bollard / localized maintained wear', clearcoat: 0.08, clearcoatRoughness: 0.52 })
  root.traverse((object) => { if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear })
  const geometries = mergeStaticByMaterial(root, { retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [], meshName: (material: { name?: string }) => material.name ?? 'traffic-bollard batch' })
  return { root, m, wear, geometries }
}

export function createModel(): Controller { const rig = build(); return { root: rig.root, update: () => {}, dispose: () => { for (const geometry of rig.geometries) geometry.dispose(); rig.wear.dispose(); for (const material of Object.values(rig.m)) material.dispose() } } }

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low' } = {}): Preview {
  const model = createModel(); const scene = new Scene(); scene.background = new Color(0x020405); scene.add(model.root, new HemisphereLight(0xc5cecf, 0x06080b, 0.84)); const key = new DirectionalLight(0xffead8, 2.8); key.position.set(-7, 10, 9); scene.add(key); const fill = new DirectionalLight(0x7197c0, 1.08); fill.position.set(8, 6, 7); scene.add(fill); const rim = new DirectionalLight(0x82adb2, 0.92); rim.position.set(7, 9, -8); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x090d10, roughness: 0.93, metalness: 0.04 }); const floorGeometry = new PlaneGeometry(13, 13); const floor = new Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.004; floor.userData.excludeFromExport = true; scene.add(floor)
  const camera = new PerspectiveCamera(33, options.aspect ?? 1, 0.12, 100); if (options.mode === 'side') camera.position.set(-7.2, 2.5, 0); else if (options.mode === 'rear') camera.position.set(5.8, 2.8, -7.2); else if (options.mode === 'low') camera.position.set(-5.8, 0.52, 7.2); else camera.position.set(-5.7, 3.7, 7.1); camera.lookAt(0, options.mode === 'low' ? 1.9 : 2.45, 0); scene.add(camera)
  return { ...model, scene, camera, dispose: () => { floorGeometry.dispose(); floorMaterial.dispose(); model.dispose() } }
}

export const createPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
