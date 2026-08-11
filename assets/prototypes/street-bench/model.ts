import { Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshPhysicalMaterial, PerspectiveCamera, PlaneGeometry, Scene } from 'three/webgpu'
import { WEAR_ATTRIBUTES, bakeOcclusion, bakeSurfaceAttributes, createWearMaterial, cylinder, mergeStaticByMaterial, prism, type Vec3, type WearProfile } from '../../../src/asset-forge/generator/index.ts'

const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]
interface Mats { shell: MeshPhysicalMaterial; shade: MeshPhysicalMaterial; graphite: MeshPhysicalMaterial; ink: MeshPhysicalMaterial; steel: MeshPhysicalMaterial; amber: MeshPhysicalMaterial; cyan: MeshPhysicalMaterial; grime: MeshPhysicalMaterial }
interface Controller { root: Group; update: (delta: number) => void; dispose: () => void }
interface Preview extends Controller { scene: Scene; camera: PerspectiveCamera }

function materials(): Mats { return {
  shell: new MeshPhysicalMaterial({ name: 'street-bench / maintained pale armor', color: 0xc9d0d0, roughness: 0.47, metalness: 0.3, clearcoat: 0.12, clearcoatRoughness: 0.44 }),
  shade: new MeshPhysicalMaterial({ name: 'street-bench / shadowed pale armor', color: 0x899397, roughness: 0.53, metalness: 0.47, clearcoat: 0.07 }),
  graphite: new MeshPhysicalMaterial({ name: 'street-bench / graphite chassis', color: 0x13191e, roughness: 0.57, metalness: 0.72, clearcoat: 0.06 }),
  ink: new MeshPhysicalMaterial({ name: 'street-bench / dark recess', color: 0x06090b, roughness: 0.85, metalness: 0.1 }),
  steel: new MeshPhysicalMaterial({ name: 'street-bench / edge steel', color: 0x798387, roughness: 0.32, metalness: 0.9, clearcoat: 0.1 }),
  amber: new MeshPhysicalMaterial({ name: 'street-bench / amber backlight', color: 0xcf780d, roughness: 0.23, metalness: 0.04, emissive: new Color(0xff4b00), emissiveIntensity: 0.58 }),
  cyan: new MeshPhysicalMaterial({ name: 'street-bench / cyan witness', color: 0x4bd9e2, roughness: 0.18, metalness: 0.04, emissive: new Color(0x22cbd6), emissiveIntensity: 1.25 }),
  grime: new MeshPhysicalMaterial({ name: 'street-bench / localized contact grime', color: 0x29251f, roughness: 0.88, metalness: 0.12 }),
} }

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.07, bevel = 0.022, rotation: Vec3 = [0, 0, 0]) { const mesh = prism(material, size, position, { chamfer, fillet: Math.min(0.045, Math.max(0.008, chamfer * 0.3)), bevel, rotation }); parent.add(mesh); return mesh }

function addFrame(root: Group, m: Mats) {
  // Three-part ground frame and full-width seat rail.
  box(root, m.graphite, [5.46, 0.18, 0.72], [0, 0.5, -0.38], 0.12, 0.03)
  box(root, m.steel, [5.12, 0.08, 0.58], [0, 0.63, -0.38], 0.07, 0.018)
  for (const x of [-2.58, 2.58]) {
    box(root, m.graphite, [0.82, 0.28, 1.55], [x, 0.14, 0], 0.14, 0.038)
    box(root, m.ink, [0.58, 0.12, 1.28], [x, 0.04, 0], 0.09, 0.024)
    box(root, m.shade, [0.76, 2.24, 1.44], [x, 1.34, -0.02], 0.25, 0.062)
    box(root, m.shell, [0.62, 1.96, 1.28], [x, 1.42, 0.05], 0.23, 0.057)
    box(root, m.graphite, [0.3, 1.52, 0.42], [x * 0.91, 1.38, -0.52], 0.1, 0.026, [0, 0, x < 0 ? -0.24 : 0.24])
    box(root, m.cyan, [0.15, 0.06, 0.045], [x, 0.42, 0.76], 0.02, 0.006)
    for (const y of [0.58, 2.08]) root.add(cylinder(m.steel, 0.05, 0.11, [x, y, 0.72], Z_AXIS, 9))
  }
}

function addSeat(root: Group, m: Mats) {
  box(root, m.graphite, [5.08, 0.28, 1.42], [0, 1.12, 0.02], 0.12, 0.03)
  for (const x of [-1.7, 0, 1.7]) {
    box(root, m.shade, [1.62, 0.22, 1.45], [x, 1.31, 0.04], 0.18, 0.045)
    box(root, m.shell, [1.56, 0.2, 1.38], [x, 1.48, 0.04], 0.16, 0.04)
    box(root, m.grime, [1.16, 0.018, 0.045], [x, 1.59, 0.48], 0.018, 0.005)
  }
  // Captured under-seat equipment box, open side vents, and continuous upper rail.
  box(root, m.graphite, [2.72, 0.86, 0.9], [0, 0.64, 0.28], 0.16, 0.04)
  box(root, m.ink, [2.35, 0.58, 0.7], [0, 0.64, 0.44], 0.12, 0.03)
  box(root, m.steel, [1.9, 0.07, 0.05], [0, 0.42, 0.82], 0.018, 0.005)
  for (const x of [-1.06, 1.06]) for (let i = 0; i < 5; i += 1) box(root, m.graphite, [0.08, 0.34, 0.12], [x, 0.64, -0.62 + i * 0.2], 0.02, 0.006)
}

function addBack(root: Group, m: Mats) {
  box(root, m.graphite, [5.14, 1.2, 0.38], [0, 2.5, -0.53], 0.2, 0.05)
  box(root, m.shell, [5.0, 1.08, 0.46], [0, 2.56, -0.42], 0.2, 0.05)
  // Deep amber filter aperture with a real perforation field.
  box(root, m.graphite, [4.32, 0.5, 0.22], [0, 2.56, -0.12], 0.13, 0.032)
  box(root, m.ink, [4.02, 0.32, 0.1], [0, 2.56, 0.04], 0.08, 0.022)
  box(root, m.amber, [3.86, 0.24, 0.045], [0, 2.56, 0.12], 0.06, 0.016)
  for (let row = -1; row <= 1; row += 1) for (let i = -19; i <= 19; i += 1) {
    const x = i * 0.097 + (row % 2 === 0 ? 0 : 0.048)
    root.add(cylinder(m.ink, 0.022, 0.055, [x, 2.56 + row * 0.075, 0.17], Z_AXIS, 7))
  }
  // Physical left hazard badge and narrow seated service slits.
  box(root, m.amber, [0.32, 0.055, 0.05], [-2.58, 1.35, 0.72], 0.015, 0.004, [0, 0, 0.95])
  box(root, m.amber, [0.32, 0.055, 0.05], [-2.58, 1.35, 0.72], 0.015, 0.004, [0, 0, -0.95])
  box(root, m.amber, [0.29, 0.055, 0.05], [-2.58, 1.18, 0.72], 0.015, 0.004)
}

function build() {
  const m = materials(); const root = new Group(); root.name = 'street bench'; addFrame(root, m); addSeat(root, m); addBack(root, m)
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([[m.shell, { rub: 0.075, grime: 0.035, scratch: 0.012 }], [m.shade, { rub: 0.1, grime: 0.06, scratch: 0.016 }], [m.graphite, { rub: 0.12, grime: 0.14, scratch: 0.021 }], [m.steel, { rub: 0.18, grime: 0.06, scratch: 0.028 }], [m.grime, { rub: 0.035, grime: 0.3, scratch: 0.006 }]])
  bakeOcclusion(root, { reach: 0.15 }); bakeSurfaceAttributes(root, profiles); const wear = createWearMaterial({ name: 'street-bench / localized maintained wear', clearcoat: 0.1, clearcoatRoughness: 0.47 })
  root.traverse((object) => { if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear })
  const geometries = mergeStaticByMaterial(root, { retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [], meshName: (material: { name?: string }) => material.name ?? 'street-bench batch' })
  return { root, m, wear, geometries }
}

export function createModel(): Controller { const rig = build(); return { root: rig.root, update: () => {}, dispose: () => { for (const geometry of rig.geometries) geometry.dispose(); rig.wear.dispose(); for (const material of Object.values(rig.m)) material.dispose() } } }

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low' } = {}): Preview {
  const model = createModel(); const scene = new Scene(); scene.background = new Color(0x030607); scene.add(model.root, new HemisphereLight(0xc3cdcf, 0x07090c, 0.84)); const key = new DirectionalLight(0xffead5, 2.8); key.position.set(-7, 10, 9); scene.add(key); const fill = new DirectionalLight(0x7598c2, 1.05); fill.position.set(8, 5, 7); scene.add(fill); const rim = new DirectionalLight(0x83adb3, 0.95); rim.position.set(7, 9, -8); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x090d10, roughness: 0.92, metalness: 0.05 }); const floorGeometry = new PlaneGeometry(16, 16); const floor = new Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.004; floor.userData.excludeFromExport = true; scene.add(floor)
  const camera = new PerspectiveCamera(34, options.aspect ?? 1, 0.14, 100); if (options.mode === 'side') camera.position.set(-8.6, 1.8, 0); else if (options.mode === 'rear') camera.position.set(7.2, 2.6, -8.6); else if (options.mode === 'low') camera.position.set(-7.2, 0.62, 8.5); else camera.position.set(-7.2, 3.35, 8.6); camera.lookAt(0, options.mode === 'low' ? 1.25 : 1.55, 0); scene.add(camera)
  return { ...model, scene, camera, dispose: () => { floorGeometry.dispose(); floorMaterial.dispose(); model.dispose() } }
}

export const createPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
