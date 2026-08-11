import { Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshPhysicalMaterial, PerspectiveCamera, PlaneGeometry, Scene } from 'three/webgpu'
import { WEAR_ATTRIBUTES, bakeOcclusion, bakeSurfaceAttributes, createWearMaterial, cylinder, mergeStaticByMaterial, prism, type Vec3, type WearProfile } from '../../../src/asset-forge/generator/index.ts'

const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]
interface Mats { shell: MeshPhysicalMaterial; shade: MeshPhysicalMaterial; graphite: MeshPhysicalMaterial; ink: MeshPhysicalMaterial; steel: MeshPhysicalMaterial; amber: MeshPhysicalMaterial; cyan: MeshPhysicalMaterial; grime: MeshPhysicalMaterial }
interface Controller { root: Group; update: (delta: number) => void; dispose: () => void }
interface Preview extends Controller { scene: Scene; camera: PerspectiveCamera }

function materials(): Mats { return {
  shell: new MeshPhysicalMaterial({ name: 'street trash can / pale armor', color: 0xcbd1d1, roughness: 0.47, metalness: 0.3, clearcoat: 0.12, clearcoatRoughness: 0.46 }),
  shade: new MeshPhysicalMaterial({ name: 'street trash can / shaded armor', color: 0x899397, roughness: 0.54, metalness: 0.46, clearcoat: 0.07 }),
  graphite: new MeshPhysicalMaterial({ name: 'street trash can / graphite chassis', color: 0x1b232b, roughness: 0.58, metalness: 0.66, clearcoat: 0.06 }),
  ink: new MeshPhysicalMaterial({ name: 'street trash can / intake cavity', color: 0x05080a, roughness: 0.87, metalness: 0.08 }),
  steel: new MeshPhysicalMaterial({ name: 'street trash can / exposed steel', color: 0x778286, roughness: 0.34, metalness: 0.88, clearcoat: 0.08 }),
  amber: new MeshPhysicalMaterial({ name: 'street trash can / amber service light', color: 0xd47708, roughness: 0.22, metalness: 0.04, emissive: new Color(0xff5b00), emissiveIntensity: 0.8, clearcoat: 0.18 }),
  cyan: new MeshPhysicalMaterial({ name: 'street trash can / cyan status light', color: 0x3ed2df, roughness: 0.2, metalness: 0.04, emissive: new Color(0x28c7dc), emissiveIntensity: 0.88, clearcoat: 0.16 }),
  grime: new MeshPhysicalMaterial({ name: 'street trash can / localized intake grime', color: 0x27231f, roughness: 0.92, metalness: 0.05 }),
} }

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.08, bevel = 0.025, rotation: Vec3 = [0, 0, 0]): Mesh {
  const mesh = prism(material, size, position, { chamfer, fillet: Math.min(0.05, Math.max(0.008, chamfer * 0.28)), bevel, rotation })
  parent.add(mesh); return mesh
}
function bolt(parent: Group, m: Mats, x: number, y: number, z: number): void { parent.add(cylinder(m.steel, 0.045, 0.08, [x, y, z], Z_AXIS, 8)) }

function addBase(root: Group, m: Mats): void {
  box(root, m.graphite, [3.34, 0.52, 2.48], [0, 0.36, 0], 0.28, 0.07)
  box(root, m.ink, [2.74, 0.16, 1.92], [0, 0.08, 0], 0.18, 0.04)
  for (const x of [-1.34, 1.34]) for (const z of [-0.9, 0.9]) {
    box(root, m.graphite, [0.78, 0.24, 0.7], [x, 0.12, z], 0.14, 0.035)
    box(root, m.steel, [0.3, 0.055, 0.28], [x, 0.028, z], 0.05, 0.012)
    bolt(root, m, x, 0.26, z + 0.2)
  }
  box(root, m.shade, [3.08, 0.32, 2.28], [0, 0.68, 0], 0.2, 0.05)
  box(root, m.graphite, [1.22, 0.26, 0.24], [0, 0.68, 1.16], 0.08, 0.02)
  box(root, m.amber, [0.72, 0.09, 0.05], [0, 0.69, 1.3], 0.03, 0.008)
}

function addShell(root: Group, m: Mats): void {
  // A deep closed chassis with separate load piers and roof shoulders.
  box(root, m.graphite, [3.02, 4.26, 2.18], [0, 2.78, -0.04], 0.35, 0.085)
  box(root, m.shade, [2.8, 3.96, 2.04], [0, 2.78, -0.08], 0.3, 0.075)
  for (const x of [-1.26, 1.26]) {
    box(root, m.shell, [0.58, 3.88, 2.16], [x, 2.82, 0.01], 0.24, 0.058)
    box(root, m.shade, [0.38, 3.34, 0.24], [x, 2.75, 1.1], 0.11, 0.028)
  }
  // Front lower access door, framed as a recessed service volume.
  box(root, m.graphite, [2.18, 2.48, 0.24], [0, 2.18, 1.08], 0.2, 0.05)
  box(root, m.shell, [1.88, 2.2, 0.16], [0, 2.18, 1.24], 0.18, 0.044)
  box(root, m.shade, [0.56, 0.48, 0.16], [0, 1.18, 1.36], 0.1, 0.026)
  box(root, m.graphite, [0.26, 0.16, 0.08], [0, 1.18, 1.49], 0.04, 0.01)
  for (const x of [-0.76, 0.76]) for (const y of [1.22, 3.08]) bolt(root, m, x, y, 1.39)
}

function addIntake(root: Group, m: Mats): void {
  // Deep, backed refuse aperture: rear wall, sloped throat, then four load rails.
  box(root, m.ink, [2.24, 1.08, 0.16], [0, 4.12, 0.86], 0.22, 0.05)
  box(root, m.graphite, [2.7, 0.32, 0.5], [0, 4.73, 1.08], 0.14, 0.035)
  box(root, m.graphite, [2.7, 0.32, 0.5], [0, 3.51, 1.08], 0.14, 0.035)
  box(root, m.graphite, [0.34, 1.06, 0.5], [-1.18, 4.12, 1.08], 0.13, 0.032)
  box(root, m.graphite, [0.34, 1.06, 0.5], [1.18, 4.12, 1.08], 0.13, 0.032)
  box(root, m.ink, [2.16, 0.2, 0.62], [0, 3.68, 1.02], 0.08, 0.02, [-0.2, 0, 0])
  box(root, m.amber, [1.72, 0.1, 0.08], [0, 4.58, 1.38], 0.035, 0.01)
  box(root, m.grime, [1.82, 0.05, 0.12], [0, 3.65, 1.39], 0.025, 0.007)
}

function addRoofAndSides(root: Group, m: Mats): void {
  box(root, m.graphite, [2.18, 0.26, 1.72], [0, 5.06, -0.04], 0.2, 0.048)
  box(root, m.shade, [1.72, 0.18, 1.34], [0, 5.22, -0.04], 0.15, 0.038)
  box(root, m.graphite, [1.22, 0.1, 0.84], [0, 5.34, -0.04], 0.1, 0.024)
  for (const x of [-1.18, 1.18]) box(root, m.shell, [0.62, 0.34, 1.86], [x, 5.04, -0.02], 0.22, 0.055)
  // Right service cassette with a cyan witness and deep diagonal vent stack.
  box(root, m.graphite, [0.18, 2.44, 1.24], [1.55, 3.0, -0.08], 0.16, 0.04)
  box(root, m.ink, [0.12, 1.76, 0.76], [1.66, 2.9, -0.08], 0.1, 0.026)
  for (let i = -2; i <= 2; i += 1) box(root, m.graphite, [0.08, 0.14, 0.58], [1.74, 2.9 + i * 0.25, -0.08], 0.025, 0.007, [0.16, 0, 0])
  box(root, m.cyan, [0.08, 0.12, 0.46], [1.76, 4.05, -0.08], 0.03, 0.008)
  // Rear closure and service hatch.
  box(root, m.graphite, [1.86, 2.22, 0.14], [0, 2.76, -1.2], 0.18, 0.042)
  box(root, m.shade, [1.5, 1.78, 0.1], [0, 2.76, -1.31], 0.14, 0.034)
  for (const x of [-0.62, 0.62]) for (const y of [2.06, 3.46]) root.add(cylinder(m.steel, 0.04, 0.07, [x, y, -1.39], Z_AXIS, 8))
}

function build() {
  const m = materials(); const root = new Group(); root.name = 'street trash can'; addBase(root, m); addShell(root, m); addIntake(root, m); addRoofAndSides(root, m)
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([[m.shell, { rub: 0.07, grime: 0.026, scratch: 0.01 }], [m.shade, { rub: 0.09, grime: 0.04, scratch: 0.013 }], [m.graphite, { rub: 0.065, grime: 0.06, scratch: 0.012 }], [m.steel, { rub: 0.16, grime: 0.045, scratch: 0.02 }]])
  bakeOcclusion(root, { reach: 0.14 }); bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'street trash can / localized maintained wear', clearcoat: 0.08, clearcoatRoughness: 0.52 })
  root.traverse((object) => { if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear })
  const geometries = mergeStaticByMaterial(root, { retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [], meshName: (material: { name?: string }) => material.name ?? 'street-trash-can batch' })
  return { root, m, wear, geometries }
}

export function createModel(): Controller { const rig = build(); return { root: rig.root, update: () => {}, dispose: () => { for (const geometry of rig.geometries) geometry.dispose(); rig.wear.dispose(); for (const material of Object.values(rig.m)) material.dispose() } } }

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low' } = {}): Preview {
  const model = createModel(); const scene = new Scene(); scene.background = new Color(0x030506); scene.add(model.root, new HemisphereLight(0xbfc9ca, 0x07090c, 0.82)); const key = new DirectionalLight(0xffead6, 2.8); key.position.set(-7, 10, 9); scene.add(key); const fill = new DirectionalLight(0x6f93bc, 1.08); fill.position.set(8, 6, 7); scene.add(fill); const rim = new DirectionalLight(0x7ca7ae, 0.9); rim.position.set(7, 9, -8); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x090d10, roughness: 0.93, metalness: 0.04 }); const floorGeometry = new PlaneGeometry(15, 15); const floor = new Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.004; floor.userData.excludeFromExport = true; scene.add(floor)
  const camera = new PerspectiveCamera(34, options.aspect ?? 1, 0.14, 100); if (options.mode === 'side') camera.position.set(-8, 2.8, 0); else if (options.mode === 'rear') camera.position.set(6.8, 3.2, -8); else if (options.mode === 'low') camera.position.set(-6.8, 0.62, 8.2); else camera.position.set(-6.7, 4.3, 8.2); camera.lookAt(0, options.mode === 'low' ? 2.1 : 2.7, 0); scene.add(camera)
  return { ...model, scene, camera, dispose: () => { floorGeometry.dispose(); floorMaterial.dispose(); model.dispose() } }
}

export const createPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
