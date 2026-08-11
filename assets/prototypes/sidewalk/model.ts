import { Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshPhysicalMaterial, PerspectiveCamera, PlaneGeometry, Scene, SphereGeometry } from 'three/webgpu'
import { cylinder, mergeStaticByMaterial, prism, type Vec3 } from '../../../src/asset-forge/generator/index.ts'

const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]
interface Mats { shell: MeshPhysicalMaterial; shade: MeshPhysicalMaterial; graphite: MeshPhysicalMaterial; ink: MeshPhysicalMaterial; steel: MeshPhysicalMaterial; amber: MeshPhysicalMaterial; cyan: MeshPhysicalMaterial; tactile: MeshPhysicalMaterial }
interface Controller { root: Group; update: (delta: number) => void; dispose: () => void }
interface Preview extends Controller { scene: Scene; camera: PerspectiveCamera }

function materials(): Mats { return {
  shell: new MeshPhysicalMaterial({ name: 'sidewalk / pale pavement', color: 0xaeb6b5, roughness: 0.57, metalness: 0.2, clearcoat: 0.04 }),
  shade: new MeshPhysicalMaterial({ name: 'sidewalk / shaded pavement', color: 0x8b9494, roughness: 0.6, metalness: 0.34 }),
  graphite: new MeshPhysicalMaterial({ name: 'sidewalk / graphite frame', color: 0x17212b, roughness: 0.56, metalness: 0.66, clearcoat: 0.05 }),
  ink: new MeshPhysicalMaterial({ name: 'sidewalk / deep service recess', color: 0x030608, roughness: 0.86, metalness: 0.1 }),
  steel: new MeshPhysicalMaterial({ name: 'sidewalk / fasteners', color: 0x788386, roughness: 0.34, metalness: 0.9 }),
  amber: new MeshPhysicalMaterial({ name: 'sidewalk / amber path lights', color: 0xd77a08, roughness: 0.2, metalness: 0.02, emissive: new Color(0xff6a00), emissiveIntensity: 0.95 }),
  cyan: new MeshPhysicalMaterial({ name: 'sidewalk / cyan service witnesses', color: 0x45d5e1, roughness: 0.2, metalness: 0.02, emissive: new Color(0x21c7db), emissiveIntensity: 0.9 }),
  tactile: new MeshPhysicalMaterial({ name: 'sidewalk / tactile paving', color: 0x978c79, roughness: 0.66, metalness: 0.1 }),
} }

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.08, bevel = 0.022, rotation: Vec3 = [0, 0, 0]): Mesh {
  const mesh = prism(material, size, position, { chamfer, fillet: Math.min(0.055, Math.max(0.008, chamfer * 0.3)), bevel, rotation }); parent.add(mesh); return mesh
}
function boltTop(parent: Group, m: Mats, x: number, y: number, z: number): void { parent.add(cylinder(m.steel, 0.045, 0.03, [x, y, z], [0, 0, 0], 9)) }

function addBase(root: Group, m: Mats): void {
  box(root, m.ink, [8.2, 0.18, 4.3], [0, 0.09, 0], 0.16, 0.04)
  box(root, m.graphite, [8.0, 0.44, 4.1], [0, 0.34, 0], 0.15, 0.038)
  box(root, m.shade, [7.74, 0.16, 3.88], [0, 0.64, 0], 0.1, 0.025)
  // Closed rear and side service skirts.
  box(root, m.graphite, [7.62, 0.46, 0.18], [0, 0.46, -2.04], 0.06, 0.015)
  box(root, m.graphite, [0.18, 0.46, 3.72], [-3.91, 0.46, 0], 0.06, 0.015)
  box(root, m.graphite, [0.18, 0.46, 3.72], [3.91, 0.46, 0], 0.06, 0.015)
}

function addTop(root: Group, m: Mats): void {
  // Two large pavement cassettes with a real central seam.
  box(root, m.shell, [3.05, 0.22, 3.46], [-1.53, 0.82, 0], 0.11, 0.028)
  box(root, m.shell, [3.05, 0.22, 3.46], [1.53, 0.82, 0], 0.11, 0.028)
  box(root, m.shade, [0.035, 0.025, 3.3], [0, 0.915, 0], 0.01, 0.003)
  // Narrow side tactile cassettes and their true half-dome studs.
  for (const x of [-3.36, 3.36]) {
    box(root, m.tactile, [0.68, 0.2, 3.56], [x, 0.83, 0], 0.08, 0.02)
    for (let iz = -6; iz <= 6; iz += 1) for (let ix = -1; ix <= 1; ix += 1) {
      const geometry = new SphereGeometry(0.045, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2); const bump = new Mesh(geometry, m.tactile); bump.position.set(x + ix * 0.15, 0.96, iz * 0.24); root.add(bump)
    }
  }
  // Full-depth pale edge curbs sit outside the tactile lanes.
  for (const x of [-3.78, 3.78]) {
    box(root, m.shell, [0.42, 0.5, 4.1], [x, 0.77, 0], 0.13, 0.032)
    box(root, m.shade, [0.11, 0.26, 3.66], [x - Math.sign(x) * 0.22, 0.79, 0], 0.035, 0.009)
  }
  for (const x of [-2.9, 2.9]) for (const z of [-1.48, 1.48]) boltTop(root, m, x, 0.94, z)
}

function addFrontServices(root: Group, m: Mats): void {
  // One continuous dark service throat under the front pavement edge.
  box(root, m.graphite, [7.48, 0.62, 0.42], [0, 0.5, 2.0], 0.11, 0.028)
  box(root, m.shade, [7.06, 0.12, 0.14], [0, 0.86, 2.13], 0.04, 0.01)
  box(root, m.ink, [6.82, 0.24, 0.12], [0, 0.71, 2.23], 0.055, 0.014)
  for (let i = -17; i <= 17; i += 1) box(root, m.graphite, [0.075, 0.17, 0.04], [i * 0.19, 0.71, 2.31], 0.012, 0.003, [0, 0, 0.12])
  for (const x of [-2.65, 0, 2.65]) {
    box(root, m.graphite, [0.68, 0.3, 0.26], [x, 0.88, 2.14], 0.075, 0.018)
    box(root, m.amber, [0.34, 0.1, 0.06], [x, 0.9, 2.31], 0.035, 0.009)
  }
  // Lower belt uses three framed access recesses, not surface pads.
  for (const x of [-2.15, 0, 2.15]) {
    box(root, m.ink, [1.18, 0.34, 0.1], [x, 0.34, 2.1], 0.07, 0.018)
    box(root, m.graphite, [0.86, 0.16, 0.07], [x, 0.34, 2.18], 0.045, 0.011)
  }
}

function addCornerTowers(root: Group, m: Mats): void {
  for (const x of [-3.9, 3.9]) {
    box(root, m.graphite, [0.54, 0.76, 0.76], [x, 0.48, 1.82], 0.13, 0.032)
    box(root, m.shell, [0.46, 0.82, 0.66], [x, 0.77, 1.82], 0.12, 0.03)
    box(root, m.ink, [0.18, 0.48, 0.12], [x, 0.76, 2.21], 0.055, 0.014)
    box(root, m.cyan, [0.07, 0.31, 0.055], [x - Math.sign(x) * 0.08, 0.76, 2.3], 0.025, 0.007)
    box(root, m.amber, [0.07, 0.22, 0.055], [x + Math.sign(x) * 0.1, 0.76, 2.3], 0.025, 0.007)
    boltTop(root, m, x, 1.22, 1.82)
  }
}

function addRearServices(root: Group, m: Mats): void {
  box(root, m.shade, [2.3, 0.34, 0.1], [0, 0.48, -2.17], 0.08, 0.02)
  box(root, m.ink, [1.78, 0.15, 0.07], [0, 0.48, -2.25], 0.045, 0.011)
  for (const x of [-3.0, 3.0]) box(root, m.cyan, [0.32, 0.08, 0.055], [x, 0.47, -2.27], 0.03, 0.008)
}

function build() {
  const m = materials(); const root = new Group(); root.name = 'sidewalk'; addBase(root, m); addTop(root, m); addFrontServices(root, m); addCornerTowers(root, m); addRearServices(root, m)
  const geometries = mergeStaticByMaterial(root, { meshName: (material: { name?: string }) => material.name ?? 'sidewalk batch' })
  return { root, m, geometries }
}
export function createModel(): Controller { const rig = build(); return { root: rig.root, update: () => {}, dispose: () => { for (const geometry of rig.geometries) geometry.dispose(); for (const material of Object.values(rig.m)) material.dispose() } } }

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low' } = {}): Preview {
  const model = createModel(); const scene = new Scene(); scene.background = new Color(0x010203); scene.add(model.root, new HemisphereLight(0xc5ced0, 0x05070a, 0.84))
  const key = new DirectionalLight(0xffead9, 2.75); key.position.set(-8, 10, 9); scene.add(key)
  const fill = new DirectionalLight(0x6e94bd, 1.04); fill.position.set(9, 7, 7); scene.add(fill)
  const rim = new DirectionalLight(0x8eb5b8, 0.9); rim.position.set(7, 9, -9); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x080b0e, roughness: 0.94, metalness: 0.02 }); const floorGeometry = new PlaneGeometry(17, 17); const floor = new Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.004; floor.userData.excludeFromExport = true; scene.add(floor)
  const camera = new PerspectiveCamera(34, options.aspect ?? 1, 0.12, 100)
  if (options.mode === 'side') camera.position.set(-10, 1.5, 0)
  else if (options.mode === 'rear') camera.position.set(7.6, 2.3, -9.5)
  else if (options.mode === 'low') camera.position.set(-7.8, 0.24, 8.8)
  else camera.position.set(-8.2, 5.6, 9.6)
  camera.lookAt(0, options.mode === 'low' ? 0.56 : 0.6, 0); scene.add(camera)
  return { ...model, scene, camera, dispose: () => { floorGeometry.dispose(); floorMaterial.dispose(); model.dispose() } }
}

export const createPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
