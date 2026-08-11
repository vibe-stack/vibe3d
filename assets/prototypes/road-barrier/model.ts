import { Color, DirectionalLight, ExtrudeGeometry, Group, HemisphereLight, Mesh, MeshPhysicalMaterial, PerspectiveCamera, PlaneGeometry, Scene, Shape } from 'three/webgpu'
import { cylinder, mergeStaticByMaterial, prism, type Vec2, type Vec3 } from '../../../src/asset-forge/generator/index.ts'

const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]
interface Mats { shell: MeshPhysicalMaterial; shade: MeshPhysicalMaterial; graphite: MeshPhysicalMaterial; ink: MeshPhysicalMaterial; steel: MeshPhysicalMaterial; red: MeshPhysicalMaterial; redBright: MeshPhysicalMaterial; amber: MeshPhysicalMaterial }
interface Controller { root: Group; update: (delta: number) => void; dispose: () => void }
interface Preview extends Controller { scene: Scene; camera: PerspectiveCamera }

function materials(): Mats { return {
  shell: new MeshPhysicalMaterial({ name: 'road barrier / pale armor', color: 0xc9cecd, roughness: 0.5, metalness: 0.31, clearcoat: 0.08 }),
  shade: new MeshPhysicalMaterial({ name: 'road barrier / shaded armor', color: 0x879192, roughness: 0.55, metalness: 0.48 }),
  graphite: new MeshPhysicalMaterial({ name: 'road barrier / graphite chassis', color: 0x18212a, roughness: 0.54, metalness: 0.68, clearcoat: 0.06 }),
  ink: new MeshPhysicalMaterial({ name: 'road barrier / deep recess', color: 0x040609, roughness: 0.82, metalness: 0.12 }),
  steel: new MeshPhysicalMaterial({ name: 'road barrier / fasteners', color: 0x778286, roughness: 0.33, metalness: 0.92 }),
  red: new MeshPhysicalMaterial({ name: 'road barrier / dark red glazing', color: 0x5c090d, roughness: 0.24, metalness: 0.03, emissive: new Color(0x8f0710), emissiveIntensity: 0.42, clearcoat: 0.2 }),
  redBright: new MeshPhysicalMaterial({ name: 'road barrier / red warning slashes', color: 0xc31920, roughness: 0.18, metalness: 0.02, emissive: new Color(0xff1723), emissiveIntensity: 1.18, clearcoat: 0.18 }),
  amber: new MeshPhysicalMaterial({ name: 'road barrier / amber side marker', color: 0xd77a08, roughness: 0.2, metalness: 0.02, emissive: new Color(0xff6a00), emissiveIntensity: 0.95 }),
} }

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.08, bevel = 0.022, rotation: Vec3 = [0, 0, 0]): Mesh {
  const mesh = prism(material, size, position, { chamfer, fillet: Math.min(0.055, Math.max(0.008, chamfer * 0.3)), bevel, rotation }); parent.add(mesh); return mesh
}
function panel(parent: Group, material: MeshPhysicalMaterial, points: Vec2[], depth: number, position: Vec3): Mesh {
  const shape = new Shape(); shape.moveTo(points[0][0], points[0][1]); for (let i = 1; i < points.length; i += 1) shape.lineTo(points[i][0], points[i][1]); shape.closePath()
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.045, bevelThickness: 0.035, bevelSegments: 1, curveSegments: 1 }); geometry.translate(0, 0, -depth * 0.5)
  const mesh = new Mesh(geometry, material); mesh.position.set(...position); parent.add(mesh); return mesh
}
function flatPanel(parent: Group, material: MeshPhysicalMaterial, points: Vec2[], depth: number, position: Vec3): Mesh {
  const shape = new Shape(); shape.moveTo(points[0][0], points[0][1]); for (let i = 1; i < points.length; i += 1) shape.lineTo(points[i][0], points[i][1]); shape.closePath()
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 }); geometry.translate(0, 0, -depth * 0.5)
  const mesh = new Mesh(geometry, material); mesh.position.set(...position); parent.add(mesh); return mesh
}
function bolt(parent: Group, m: Mats, x: number, y: number, z: number): void { parent.add(cylinder(m.steel, 0.045, 0.06, [x, y, z], Z_AXIS, 9)) }

function addBase(root: Group, m: Mats): void {
  box(root, m.ink, [7.15, 0.24, 1.55], [0, 0.12, 0], 0.18, 0.045)
  box(root, m.graphite, [6.96, 0.68, 1.42], [0, 0.48, 0], 0.17, 0.042)
  box(root, m.shade, [6.58, 0.16, 1.2], [0, 0.88, 0], 0.11, 0.028)
  for (const x of [-2.28, 2.28]) {
    box(root, m.ink, [1.08, 0.46, 0.12], [x, 0.48, 0.77], 0.08, 0.02)
    box(root, m.graphite, [1.28, 0.14, 0.2], [x, 0.76, 0.79], 0.055, 0.014)
    box(root, m.graphite, [0.16, 0.52, 0.2], [x - 0.58, 0.5, 0.79], 0.05, 0.012)
    box(root, m.graphite, [0.16, 0.52, 0.2], [x + 0.58, 0.5, 0.79], 0.05, 0.012)
  }
  box(root, m.graphite, [0.42, 0.3, 0.16], [-3.12, 0.32, 0.75], 0.06, 0.015)
  box(root, m.amber, [0.24, 0.16, 0.07], [-3.12, 0.32, 0.86], 0.04, 0.01)
}

function addBody(root: Group, m: Mats): void {
  // Broad closed lower cabinet mass, with its upper shoulder raked into the warning face.
  panel(root, m.shell, [[-3.25, 0], [3.25, 0], [3.2, 1.72], [2.95, 2.1], [-2.95, 2.1], [-3.2, 1.72]], 1.08, [0, 0.82, 0])
  box(root, m.shade, [6.18, 0.18, 1.12], [0, 1.14, 0], 0.1, 0.025)
  box(root, m.shell, [5.88, 0.78, 1.08], [0, 1.55, 0], 0.13, 0.032)
  box(root, m.graphite, [6.3, 0.34, 1.12], [0, 0.86, 0], 0.12, 0.03)
  // Lower service modules are captured in the graphite belt.
  box(root, m.shade, [0.66, 0.5, 0.16], [1.55, 1.05, 0.64], 0.08, 0.02)
  box(root, m.ink, [0.34, 0.16, 0.08], [1.55, 0.96, 0.76], 0.04, 0.01)
  for (const x of [-1.2, 0, 1.2]) bolt(root, m, x, 1.43, 0.61)
  for (const x of [-2.95, 2.95]) for (const y of [0.92, 1.7]) bolt(root, m, x, y, 0.61)
}

function addWarningFace(root: Group, m: Mats): void {
  // Deep five-layer cassette: body -> pale surround -> graphite bezel -> dark throat -> red glazing.
  box(root, m.shell, [5.85, 1.35, 1.02], [0.18, 2.58, 0], 0.2, 0.05)
  box(root, m.shade, [5.58, 1.12, 1.04], [0.2, 2.58, 0.05], 0.17, 0.042)
  box(root, m.graphite, [5.35, 0.94, 0.24], [0.22, 2.58, 0.57], 0.14, 0.035)
  box(root, m.ink, [5.04, 0.72, 0.1], [0.24, 2.58, 0.74], 0.11, 0.028)
  box(root, m.red, [4.78, 0.58, 0.055], [0.25, 2.58, 0.83], 0.08, 0.02)
  // Six luminous diagonal slashes sit on the dark glazing and disappear beneath the bezel.
  for (let i = -3; i <= 2; i += 1) flatPanel(root, m.redBright, [[-0.33, -0.29], [0.12, -0.29], [0.34, 0.29], [-0.11, 0.29]], 0.025, [i * 0.78 + 0.62, 2.58, 0.875])
  for (const x of [-2.27, 2.7]) for (const y of [2.25, 2.91]) bolt(root, m, x, y, 0.87)
}

function addEndTowers(root: Group, m: Mats): void {
  const towerPoints: Vec2[] = [[-0.4, 0], [0.4, 0], [0.44, 2.58], [0.26, 2.82], [-0.26, 2.82], [-0.44, 2.58]]
  for (const x of [-3.1, 3.1]) {
    panel(root, m.shell, towerPoints, 1.22, [x, 0.66, 0])
    box(root, m.graphite, [0.36, 2.0, 1.26], [x, 1.78, 0], 0.1, 0.025)
    box(root, m.ink, [0.18, 1.56, 0.16], [x, 1.78, 0.72], 0.06, 0.015)
    if (x < 0) box(root, m.redBright, [0.08, 1.24, 0.07], [x, 1.8, 0.84], 0.025, 0.007)
    else box(root, m.amber, [0.08, 0.28, 0.07], [x, 2.3, 0.84], 0.025, 0.007)
    box(root, m.graphite, [0.56, 0.36, 1.3], [x, 1.8, 0], 0.08, 0.02)
    for (const y of [0.94, 2.62]) bolt(root, m, x, y, 0.74)
  }
}

function addRear(root: Group, m: Mats): void {
  box(root, m.graphite, [5.78, 1.74, 0.12], [0, 1.7, -0.65], 0.16, 0.04)
  box(root, m.shade, [4.9, 0.72, 0.1], [0, 1.75, -0.74], 0.12, 0.03)
  box(root, m.ink, [1.3, 0.28, 0.08], [0, 1.12, -0.79], 0.07, 0.018)
}

function build() {
  const m = materials(); const root = new Group(); root.name = 'road barrier'; addBase(root, m); addBody(root, m); addWarningFace(root, m); addEndTowers(root, m); addRear(root, m)
  const geometries = mergeStaticByMaterial(root, { meshName: (material: { name?: string }) => material.name ?? 'road-barrier batch' })
  return { root, m, geometries }
}
export function createModel(): Controller { const rig = build(); return { root: rig.root, update: () => {}, dispose: () => { for (const geometry of rig.geometries) geometry.dispose(); for (const material of Object.values(rig.m)) material.dispose() } } }

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low' } = {}): Preview {
  const model = createModel(); const scene = new Scene(); scene.background = new Color(0x010203); scene.add(model.root, new HemisphereLight(0xc4cdcf, 0x05070a, 0.84))
  const key = new DirectionalLight(0xffead9, 2.75); key.position.set(-8, 10, 9); scene.add(key)
  const fill = new DirectionalLight(0x6f95bf, 1.04); fill.position.set(9, 7, 7); scene.add(fill)
  const rim = new DirectionalLight(0x8db4b8, 0.9); rim.position.set(7, 9, -9); scene.add(rim)
  let floorMaterial: MeshPhysicalMaterial | undefined; let floorGeometry: PlaneGeometry | undefined
  if (options.mode !== 'beauty') { floorMaterial = new MeshPhysicalMaterial({ color: 0x080b0e, roughness: 0.94, metalness: 0.02 }); floorGeometry = new PlaneGeometry(15, 15); const floor = new Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.004; floor.userData.excludeFromExport = true; scene.add(floor) }
  const camera = new PerspectiveCamera(34, options.aspect ?? 1, 0.12, 100)
  if (options.mode === 'side') camera.position.set(-9, 2.1, 0)
  else if (options.mode === 'rear') camera.position.set(6.8, 2.5, -9)
  else if (options.mode === 'low') camera.position.set(-7.2, 0.35, 8.4)
  else camera.position.set(-7.0, 3.5, 12.4)
  camera.lookAt(0, options.mode === 'low' ? 1.35 : 1.75, 0); scene.add(camera)
  return { ...model, scene, camera, dispose: () => { floorGeometry?.dispose(); floorMaterial?.dispose(); model.dispose() } }
}

export const createPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
