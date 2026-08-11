import { CatmullRomCurve3, Color, DirectionalLight, ExtrudeGeometry, Group, HemisphereLight, Mesh, MeshPhysicalMaterial, PerspectiveCamera, PlaneGeometry, Scene, Shape, TubeGeometry, Vector3 } from 'three/webgpu'
import { WEAR_ATTRIBUTES, bakeOcclusion, bakeSurfaceAttributes, createWearMaterial, cylinder, mergeStaticByMaterial, prism, type Vec3, type WearProfile } from '../../../src/asset-forge/generator/index.ts'

const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]
interface Mats { shell: MeshPhysicalMaterial; shade: MeshPhysicalMaterial; graphite: MeshPhysicalMaterial; ink: MeshPhysicalMaterial; steel: MeshPhysicalMaterial; magenta: MeshPhysicalMaterial; cyan: MeshPhysicalMaterial; grime: MeshPhysicalMaterial }
interface Controller { root: Group; update: (delta: number) => void; dispose: () => void }
interface Preview extends Controller { scene: Scene; camera: PerspectiveCamera }

function materials(): Mats { return {
  shell: new MeshPhysicalMaterial({ name: 'directional sign / pale armor', color: 0xcdd2d2, roughness: 0.46, metalness: 0.31, clearcoat: 0.12, clearcoatRoughness: 0.44 }),
  shade: new MeshPhysicalMaterial({ name: 'directional sign / shaded armor', color: 0x8e9799, roughness: 0.54, metalness: 0.46, clearcoat: 0.07 }),
  graphite: new MeshPhysicalMaterial({ name: 'directional sign / graphite chassis', color: 0x182027, roughness: 0.57, metalness: 0.68, clearcoat: 0.06 }),
  ink: new MeshPhysicalMaterial({ name: 'directional sign / dark display well', color: 0x05070a, roughness: 0.84, metalness: 0.08 }),
  steel: new MeshPhysicalMaterial({ name: 'directional sign / exposed steel', color: 0x7d878a, roughness: 0.34, metalness: 0.9, clearcoat: 0.08 }),
  magenta: new MeshPhysicalMaterial({ name: 'directional sign / magenta route light', color: 0xd80b79, roughness: 0.2, metalness: 0.03, emissive: new Color(0xff0b87), emissiveIntensity: 0.88, clearcoat: 0.2 }),
  cyan: new MeshPhysicalMaterial({ name: 'directional sign / cyan service light', color: 0x3ed2df, roughness: 0.2, metalness: 0.03, emissive: new Color(0x28c7dc), emissiveIntensity: 0.92, clearcoat: 0.17 }),
  grime: new MeshPhysicalMaterial({ name: 'directional sign / localized base grime', color: 0x29251f, roughness: 0.92, metalness: 0.04 }),
} }

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.08, bevel = 0.025, rotation: Vec3 = [0, 0, 0]): Mesh {
  const mesh = prism(material, size, position, { chamfer, fillet: Math.min(0.05, Math.max(0.008, chamfer * 0.28)), bevel, rotation }); parent.add(mesh); return mesh
}
function bolt(parent: Group, m: Mats, x: number, y: number, z: number): void { parent.add(cylinder(m.steel, 0.045, 0.08, [x, y, z], Z_AXIS, 8)) }

function addBase(root: Group, m: Mats): void {
  box(root, m.graphite, [2.5, 0.42, 2.2], [-1.3, 0.3, 0], 0.3, 0.075)
  box(root, m.ink, [1.94, 0.16, 1.64], [-1.3, 0.08, 0], 0.2, 0.05)
  for (const x of [-2.22, -0.38]) for (const z of [-0.74, 0.74]) {
    box(root, m.graphite, [0.86, 0.24, 0.7], [x, 0.12, z], 0.15, 0.038)
    box(root, m.steel, [0.28, 0.055, 0.24], [x, 0.028, z], 0.05, 0.012)
  }
  box(root, m.graphite, [2.06, 0.78, 1.72], [-1.3, 0.82, 0], 0.27, 0.068)
  box(root, m.ink, [1.56, 0.5, 1.28], [-1.3, 0.84, 0], 0.2, 0.05)
  box(root, m.shell, [1.26, 0.38, 1.08], [-1.3, 1.12, 0], 0.17, 0.042)
  // Four captured stabilizer buttresses.
  for (const x of [-2.08, -0.52]) for (const z of [-0.62, 0.62]) box(root, m.graphite, [0.42, 0.94, 0.46], [x, 0.76, z], 0.12, 0.03, [z > 0 ? -0.14 : 0.14, 0, x < -1.3 ? -0.28 : 0.28])
  box(root, m.ink, [1.24, 0.18, 0.2], [-1.3, 0.26, 1.1], 0.06, 0.016)
  for (let i = -3; i <= 3; i += 1) box(root, m.graphite, [0.08, 0.16, 0.12], [-1.3 + i * 0.16, 0.27, 1.22], 0.02, 0.006)
  box(root, m.cyan, [0.32, 0.07, 0.05], [-0.58, 0.44, 1.12], 0.025, 0.007)
}

function addPost(root: Group, m: Mats): void {
  box(root, m.graphite, [0.9, 4.0, 0.82], [-1.3, 2.88, 0], 0.2, 0.05)
  box(root, m.shade, [0.76, 3.78, 0.72], [-1.3, 2.94, 0.02], 0.18, 0.045)
  box(root, m.shell, [0.58, 3.5, 0.62], [-1.3, 3.04, 0.14], 0.16, 0.04)
  box(root, m.graphite, [0.36, 1.26, 0.18], [-1.3, 2.5, 0.4], 0.08, 0.02)
  box(root, m.cyan, [0.08, 0.16, 0.05], [-1.3, 2.88, 0.52], 0.025, 0.007)
  for (const y of [1.82, 3.86]) bolt(root, m, -1.3, y, 0.54)
  // Seated underside knee between the post and sign casing.
  box(root, m.graphite, [1.56, 0.36, 0.66], [-0.82, 4.2, 0], 0.13, 0.032, [0, 0, -0.28])
  box(root, m.shell, [1.18, 0.24, 0.56], [-0.74, 4.36, 0.04], 0.1, 0.025, [0, 0, -0.28])
  box(root, m.cyan, [0.5, 0.07, 0.05], [-0.7, 4.4, 0.37], 0.025, 0.007, [0, 0, -0.28])
  box(root, m.shade, [0.58, 0.16, 0.5], [-1.3, 5.78, 0], 0.1, 0.025)
  box(root, m.cyan, [0.42, 0.18, 0.38], [-1.3, 5.92, 0], 0.09, 0.022)
}

function addDisplay(root: Group, m: Mats): void {
  // Deep continuous sign casing and inset operator face.
  box(root, m.graphite, [5.18, 1.9, 0.46], [0.64, 5.05, -0.03], 0.36, 0.09)
  box(root, m.shell, [4.92, 1.68, 0.48], [0.66, 5.08, 0.1], 0.31, 0.078)
  box(root, m.graphite, [4.38, 1.3, 0.28], [0.66, 5.08, 0.39], 0.25, 0.062)
  box(root, m.ink, [4.02, 0.98, 0.14], [0.66, 5.08, 0.56], 0.2, 0.05)
  // One contiguous physical arrow, extruded into the display well.
  const arrow = new Shape(); arrow.moveTo(-1.35, -0.2); arrow.lineTo(0.62, -0.2); arrow.lineTo(0.62, -0.48); arrow.lineTo(1.46, 0); arrow.lineTo(0.62, 0.48); arrow.lineTo(0.62, 0.2); arrow.lineTo(-1.35, 0.2); arrow.closePath()
  const arrowGeometry = new ExtrudeGeometry(arrow, { depth: 0.08, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.025, bevelThickness: 0.02, curveSegments: 1 }); arrowGeometry.translate(0.95, 5.08, 0.63); const arrowMesh = new Mesh(arrowGeometry, m.magenta); arrowMesh.name = 'captured magenta directional arrow'; root.add(arrowMesh)
  for (let i = 0; i < 3; i += 1) {
    const x = -1.0 + i * 0.28
    box(root, m.magenta, [0.12, 0.42, 0.08], [x, 5.22, 0.69], 0.025, 0.007, [0, 0, 0.72])
    box(root, m.magenta, [0.12, 0.42, 0.08], [x, 4.94, 0.69], 0.025, 0.007, [0, 0, -0.72])
  }
  for (const x of [-1.18, 2.5]) for (const y of [4.66, 5.5]) bolt(root, m, x, y, 0.71)
  box(root, m.cyan, [0.38, 0.1, 0.06], [0.72, 5.91, 0.28], 0.035, 0.01)
  box(root, m.cyan, [0.08, 0.28, 0.055], [3.08, 5.08, 0.18], 0.025, 0.007)
}

function addCableAndRear(root: Group, m: Mats): void {
  const cableGeometry = new TubeGeometry(new CatmullRomCurve3([
    new Vector3(-1.72, 5.58, 0.18), new Vector3(-1.78, 4.76, 0.22), new Vector3(-1.72, 3.55, 0.24), new Vector3(-1.7, 2.2, 0.24), new Vector3(-1.62, 1.2, 0.14),
  ]), 30, 0.065, 8, false)
  const cable = new Mesh(cableGeometry, m.graphite); cable.name = 'continuous collared sign service cable'; root.add(cable)
  for (const y of [1.38, 2.68, 3.96, 5.24]) box(root, m.steel, [0.34, 0.14, 0.22], [-1.7, y, 0.22], 0.05, 0.012)
  box(root, m.graphite, [3.84, 0.66, 0.14], [0.68, 5.08, -0.32], 0.17, 0.042)
  box(root, m.shade, [3.0, 0.38, 0.1], [0.68, 5.08, -0.45], 0.12, 0.03)
  for (let i = -4; i <= 4; i += 1) box(root, m.ink, [0.18, 0.08, 0.05], [0.68 + i * 0.29, 5.08, -0.52], 0.025, 0.007)
  box(root, m.grime, [1.2, 0.05, 0.09], [-1.3, 1.22, 0.52], 0.025, 0.007)
}

function build() {
  const m = materials(); const root = new Group(); root.name = 'directional sign'; addBase(root, m); addPost(root, m); addDisplay(root, m); addCableAndRear(root, m)
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([[m.shell, { rub: 0.07, grime: 0.025, scratch: 0.01 }], [m.shade, { rub: 0.09, grime: 0.04, scratch: 0.013 }], [m.graphite, { rub: 0.08, grime: 0.06, scratch: 0.014 }], [m.steel, { rub: 0.17, grime: 0.045, scratch: 0.022 }]])
  bakeOcclusion(root, { reach: 0.14 }); bakeSurfaceAttributes(root, profiles); const wear = createWearMaterial({ name: 'directional sign / localized maintained wear', clearcoat: 0.08, clearcoatRoughness: 0.52 })
  root.traverse((object) => { if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear })
  const geometries = mergeStaticByMaterial(root, { retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [], meshName: (material: { name?: string }) => material.name ?? 'directional-sign batch' })
  return { root, m, wear, geometries }
}

export function createModel(): Controller { const rig = build(); return { root: rig.root, update: () => {}, dispose: () => { for (const geometry of rig.geometries) geometry.dispose(); rig.wear.dispose(); for (const material of Object.values(rig.m)) material.dispose() } } }

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low' } = {}): Preview {
  const model = createModel(); const scene = new Scene(); scene.background = new Color(0x020405); scene.add(model.root, new HemisphereLight(0xc4cdcf, 0x06080b, 0.84)); const key = new DirectionalLight(0xffead8, 2.8); key.position.set(-7, 10, 9); scene.add(key); const fill = new DirectionalLight(0x7196c0, 1.08); fill.position.set(8, 6, 7); scene.add(fill); const rim = new DirectionalLight(0x82adb2, 0.92); rim.position.set(7, 9, -8); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x090d10, roughness: 0.93, metalness: 0.04 }); const floorGeometry = new PlaneGeometry(16, 16); const floor = new Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.004; floor.userData.excludeFromExport = true; scene.add(floor)
  const camera = new PerspectiveCamera(34, options.aspect ?? 1, 0.14, 100); if (options.mode === 'side') camera.position.set(-8.5, 3.0, 0); else if (options.mode === 'rear') camera.position.set(7.2, 3.3, -8.6); else if (options.mode === 'low') camera.position.set(-7.2, 0.58, 8.6); else camera.position.set(-7.4, 4.3, 8.8); camera.lookAt(0, options.mode === 'low' ? 2.25 : 2.75, 0); scene.add(camera)
  return { ...model, scene, camera, dispose: () => { floorGeometry.dispose(); floorMaterial.dispose(); model.dispose() } }
}

export const createPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
