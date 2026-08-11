import { CatmullRomCurve3, Color, DirectionalLight, ExtrudeGeometry, Group, HemisphereLight, Mesh, MeshPhysicalMaterial, PerspectiveCamera, PlaneGeometry, Scene, Shape, TubeGeometry, Vector3 } from 'three/webgpu'
import { cylinder, mergeStaticByMaterial, prism, type Vec2, type Vec3 } from '../../../src/asset-forge/generator/index.ts'

const X_AXIS: Vec3 = [0, 0, Math.PI / 2]
const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]
interface Mats { shell: MeshPhysicalMaterial; shade: MeshPhysicalMaterial; graphite: MeshPhysicalMaterial; ink: MeshPhysicalMaterial; steel: MeshPhysicalMaterial; magenta: MeshPhysicalMaterial; cyan: MeshPhysicalMaterial }
interface Controller { root: Group; update: (delta: number) => void; dispose: () => void }
interface Preview extends Controller { scene: Scene; camera: PerspectiveCamera }

function materials(): Mats { return {
  shell: new MeshPhysicalMaterial({ name: 'street sign / pale armor', color: 0xc9cfce, roughness: 0.48, metalness: 0.32, clearcoat: 0.08 }),
  shade: new MeshPhysicalMaterial({ name: 'street sign / shaded armor', color: 0x899394, roughness: 0.55, metalness: 0.5 }),
  graphite: new MeshPhysicalMaterial({ name: 'street sign / graphite structure', color: 0x17212b, roughness: 0.53, metalness: 0.68, clearcoat: 0.06 }),
  ink: new MeshPhysicalMaterial({ name: 'street sign / dark face recess', color: 0x040509, roughness: 0.76, metalness: 0.18 }),
  steel: new MeshPhysicalMaterial({ name: 'street sign / fasteners', color: 0x788387, roughness: 0.32, metalness: 0.92 }),
  magenta: new MeshPhysicalMaterial({ name: 'street sign / magenta route face', color: 0xd735bb, roughness: 0.18, metalness: 0.03, emissive: new Color(0xff28d7), emissiveIntensity: 1.08, clearcoat: 0.18 }),
  cyan: new MeshPhysicalMaterial({ name: 'street sign / cyan witness', color: 0x46d7e3, roughness: 0.18, metalness: 0.02, emissive: new Color(0x22c9df), emissiveIntensity: 0.95 }),
} }

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.08, bevel = 0.022, rotation: Vec3 = [0, 0, 0]): Mesh {
  const mesh = prism(material, size, position, { chamfer, fillet: Math.min(0.055, Math.max(0.008, chamfer * 0.3)), bevel, rotation }); parent.add(mesh); return mesh
}
function boltFront(parent: Group, m: Mats, x: number, y: number, z: number): void { parent.add(cylinder(m.steel, 0.045, 0.055, [x, y, z], Z_AXIS, 9)) }
function polygon(parent: Group, material: MeshPhysicalMaterial, points: Vec2[], position: Vec3): Mesh {
  const shape = new Shape(); shape.moveTo(points[0][0], points[0][1]); for (let i = 1; i < points.length; i += 1) shape.lineTo(points[i][0], points[i][1]); shape.closePath()
  const geometry = new ExtrudeGeometry(shape, { depth: 0.045, bevelEnabled: true, bevelSize: 0.018, bevelThickness: 0.012, bevelSegments: 1, curveSegments: 1 }); const mesh = new Mesh(geometry, material); mesh.position.set(...position); parent.add(mesh); return mesh
}
function cable(parent: Group, material: MeshPhysicalMaterial, points: Vec3[], radius: number): Mesh {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p))); const geometry = new TubeGeometry(curve, 20, radius, 8, false); const mesh = new Mesh(geometry, material); parent.add(mesh); return mesh
}

function addBase(root: Group, m: Mats): void {
  box(root, m.ink, [2.05, 0.24, 1.75], [0, 0.12, 0], 0.2, 0.045)
  box(root, m.graphite, [1.86, 0.42, 1.58], [0, 0.42, 0], 0.2, 0.045)
  box(root, m.shell, [1.5, 0.68, 1.26], [0, 0.92, 0], 0.18, 0.045)
  box(root, m.shade, [1.15, 0.18, 1.0], [0, 1.32, 0], 0.13, 0.03)
  for (const x of [-0.67, 0.67]) for (const z of [-0.52, 0.52]) boltFront(root, m, x, 0.74, z + (z > 0 ? 0.18 : -0.18))
  for (const x of [-0.48, 0.48]) box(root, m.graphite, [0.5, 0.62, 0.36], [x, 0.82, 0.69], 0.11, 0.028)
  box(root, m.graphite, [1.05, 0.26, 0.82], [0, 1.38, 0], 0.1, 0.025)
}

function addPole(root: Group, m: Mats): void {
  root.add(cylinder(m.graphite, 0.48, 0.32, [0, 1.52, 0], [0, 0, 0], 20))
  root.add(cylinder(m.shell, 0.39, 5.35, [0, 4.28, 0], [0, 0, 0], 24))
  root.add(cylinder(m.shade, 0.405, 0.12, [0, 2.08, 0], [0, 0, 0], 24))
  root.add(cylinder(m.graphite, 0.47, 0.34, [0, 2.24, 0], [0, 0, 0], 20))
  root.add(cylinder(m.shade, 0.405, 0.1, [0, 6.58, 0], [0, 0, 0], 24))
  root.add(cylinder(m.graphite, 0.45, 0.26, [0, 6.77, 0], [0, 0, 0], 20))
  root.add(cylinder(m.magenta, 0.405, 0.12, [0, 6.95, 0], [0, 0, 0], 24))
  root.add(cylinder(m.shell, 0.4, 0.34, [0, 7.18, 0], [0, 0, 0], 24))
  root.add(cylinder(m.graphite, 0.44, 0.18, [0, 7.44, 0], [0, 0, 0], 18))
  // Lower access plate and captured service channel.
  box(root, m.shade, [0.5, 1.08, 0.1], [0, 1.92, 0.39], 0.08, 0.02)
  for (const y of [1.5, 2.34]) for (const x of [-0.16, 0.16]) boltFront(root, m, x, y, 0.47)
  for (const y of [2.65, 4.15, 5.45]) box(root, m.graphite, [0.26, 0.18, 0.22], [0.28, y, 0.42], 0.055, 0.014)
}

function addHead(root: Group, m: Mats): void {
  // Three nested layers form one deep right-projecting armored sign cassette.
  box(root, m.graphite, [6.15, 1.9, 0.78], [3.17, 5.98, -0.08], 0.25, 0.062)
  box(root, m.shell, [5.93, 1.68, 0.8], [3.24, 6.0, 0.08], 0.23, 0.058)
  box(root, m.graphite, [5.5, 1.34, 0.22], [3.3, 6.0, 0.54], 0.17, 0.042)
  box(root, m.ink, [5.15, 1.04, 0.08], [3.34, 6.0, 0.7], 0.13, 0.032)
  // Heavy clamped hinge overlaps both pole and head.
  box(root, m.graphite, [1.2, 1.18, 0.96], [0.42, 5.98, -0.03], 0.17, 0.042)
  box(root, m.shade, [0.42, 0.9, 1.02], [0.46, 5.98, -0.02], 0.11, 0.028)
  root.add(cylinder(m.steel, 0.2, 1.08, [0.5, 5.98, 0], X_AXIS, 14))
  for (const y of [5.62, 6.34]) for (const z of [-0.36, 0.36]) boltFront(root, m, 0.82, y, z)
  // Right end service witness and physical end shoulder.
  box(root, m.graphite, [0.56, 1.3, 0.94], [6.02, 6.0, -0.01], 0.14, 0.035)
  box(root, m.shade, [0.24, 0.98, 0.72], [6.16, 6.0, 0.03], 0.09, 0.022)
  box(root, m.cyan, [0.18, 0.64, 0.065], [6.03, 6.0, 0.78], 0.055, 0.014)
  for (const x of [0.82, 5.74]) for (const y of [5.3, 6.7]) boltFront(root, m, x, y, 0.78)
  box(root, m.shade, [1.12, 0.045, 0.05], [2.1, 6.86, 0.72], 0.012, 0.003)
  box(root, m.shade, [0.82, 0.045, 0.05], [4.7, 5.14, 0.72], 0.012, 0.003)
  // Graphics remain a single luminous sign face, with shallow physically seated relief.
  polygon(root, m.magenta, [[-0.15, -0.34], [0.15, -0.34], [0.15, 0.12], [0.34, 0.12], [0, 0.44], [-0.34, 0.12], [-0.15, 0.12]], [1.48, 5.98, 0.76])
  polygon(root, m.magenta, [[-0.82, -0.3], [0.62, -0.3], [0.92, 0.3], [-0.5, 0.3]], [3.75, 5.98, 0.76])
  for (let i = 0; i < 3; i += 1) polygon(root, m.magenta, [[-0.16, -0.07], [0.12, -0.07], [0.2, 0.07], [-0.08, 0.07]], [4.55 + i * 0.33, 6.43, 0.76])
  for (let i = 0; i < 3; i += 1) box(root, m.magenta, [0.08, 0.08, 0.035], [5.0 + i * 0.16, 5.6, 0.78], 0.014, 0.004)
  // Cable is swallowed by the head port and lower pole channel.
  cable(root, m.graphite, [[0.72, 5.5, 0.42], [0.74, 5.05, 0.47], [0.54, 4.68, 0.46], [0.38, 4.18, 0.43], [0.34, 2.55, 0.42]], 0.07)
  root.add(cylinder(m.steel, 0.105, 0.18, [0.72, 5.5, 0.42], X_AXIS, 10))
  root.add(cylinder(m.steel, 0.105, 0.18, [0.34, 2.55, 0.42], X_AXIS, 10))
}

function build() {
  const m = materials(); const root = new Group(); root.name = 'street sign pole'; addBase(root, m); addPole(root, m); addHead(root, m)
  const geometries = mergeStaticByMaterial(root, { meshName: (material: { name?: string }) => material.name ?? 'street-sign-pole batch' })
  return { root, m, geometries }
}
export function createModel(): Controller { const rig = build(); return { root: rig.root, update: () => {}, dispose: () => { for (const geometry of rig.geometries) geometry.dispose(); for (const material of Object.values(rig.m)) material.dispose() } } }

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low' } = {}): Preview {
  const model = createModel(); const scene = new Scene(); scene.background = new Color(0x010203); scene.add(model.root, new HemisphereLight(0xc4cdcf, 0x05070a, 0.84))
  const key = new DirectionalLight(0xffead9, 2.75); key.position.set(-8, 11, 9); scene.add(key)
  const fill = new DirectionalLight(0x6f95bf, 1.04); fill.position.set(9, 7, 7); scene.add(fill)
  const rim = new DirectionalLight(0x8db4b8, 0.9); rim.position.set(7, 10, -9); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x080b0e, roughness: 0.94, metalness: 0.02 }); const floorGeometry = new PlaneGeometry(16, 16); const floor = new Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.004; floor.userData.excludeFromExport = true; scene.add(floor)
  const camera = new PerspectiveCamera(34, options.aspect ?? 1, 0.12, 120)
  if (options.mode === 'side') camera.position.set(-10, 4.0, 0)
  else if (options.mode === 'rear') camera.position.set(8.5, 4.6, -10)
  else if (options.mode === 'low') camera.position.set(-7.6, 0.5, 8.4)
  else camera.position.set(-9.4, 5.3, 11.5)
  camera.lookAt(2.45, options.mode === 'low' ? 3.2 : 3.85, 0); scene.add(camera)
  return { ...model, scene, camera, dispose: () => { floorGeometry.dispose(); floorMaterial.dispose(); model.dispose() } }
}

export const createPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
