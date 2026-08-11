import {
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
} from 'three/webgpu'
import { cylinder, mergeStaticByMaterial, prism, type Vec3 } from '../../../src/asset-forge/generator/index.ts'

interface Mats { shell: MeshPhysicalMaterial; shade: MeshPhysicalMaterial; graphite: MeshPhysicalMaterial; ink: MeshPhysicalMaterial; steel: MeshPhysicalMaterial; amber: MeshPhysicalMaterial; cyan: MeshPhysicalMaterial }
interface Controller { root: Group; update: (deltaSeconds: number) => void; dispose: () => void }
interface Preview extends Controller { scene: Scene; camera: PerspectiveCamera }
const FRONT: Vec3 = [Math.PI / 2, 0, 0]

function materials(): Mats {
  return {
    shell: new MeshPhysicalMaterial({ name: 'locker / pale armor', color: 0xb9c1c2, roughness: 0.48, metalness: 0.34, clearcoat: 0.1 }),
    shade: new MeshPhysicalMaterial({ name: 'locker / shaded armor', color: 0x7d898e, roughness: 0.55, metalness: 0.46 }),
    graphite: new MeshPhysicalMaterial({ name: 'locker / graphite frame', color: 0x1a2530, roughness: 0.5, metalness: 0.7, clearcoat: 0.08 }),
    ink: new MeshPhysicalMaterial({ name: 'locker / recessed ink', color: 0x03070a, roughness: 0.82, metalness: 0.14 }),
    steel: new MeshPhysicalMaterial({ name: 'locker / hardware', color: 0x879396, roughness: 0.32, metalness: 0.9 }),
    amber: new MeshPhysicalMaterial({ name: 'locker / amber service', color: 0xc97708, roughness: 0.23, metalness: 0.05, emissive: new Color(0xff7908), emissiveIntensity: 0.74, clearcoat: 0.2 }),
    cyan: new MeshPhysicalMaterial({ name: 'locker / cyan witness', color: 0x38cbd9, roughness: 0.22, metalness: 0.03, emissive: new Color(0x18d4ee), emissiveIntensity: 0.82 }),
  }
}

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.08, bevel = 0.022, rotation: Vec3 = [0, 0, 0]): Mesh {
  const mesh = prism(material, size, position, { chamfer, fillet: Math.min(0.055, Math.max(0.008, chamfer * 0.28)), bevel, rotation })
  parent.add(mesh)
  return mesh
}

function frontBolt(parent: Group, m: Mats, x: number, y: number, z = 0.98): void {
  parent.add(cylinder(m.ink, 0.055, 0.045, [x, y, z], FRONT, 12))
  parent.add(cylinder(m.steel, 0.024, 0.052, [x, y, z + 0.025], FRONT, 8))
}

function addCabinet(parent: Group, m: Mats): void {
  // Closed chassis and faceted pale armor shoulders.
  box(parent, m.graphite, [2.76, 5.32, 1.4], [0, 3.0, 0], 0.22, 0.05)
  box(parent, m.shell, [2.82, 4.72, 1.58], [0, 3.25, 0], 0.22, 0.05)
  box(parent, m.shade, [2.92, 0.18, 1.62], [0, 5.49, 0], 0.16, 0.045)
  // Heavy top crown and raised access cassette.
  box(parent, m.shell, [3.06, 0.48, 1.76], [0, 5.55, 0], 0.26, 0.06)
  box(parent, m.graphite, [1.12, 0.12, 0.74], [0, 5.84, 0], 0.12, 0.03)
  box(parent, m.shade, [0.82, 0.065, 0.5], [0, 5.93, 0], 0.09, 0.022)
  // Corner columns give the shell a continuous load frame.
  for (const x of [-1.39, 1.39]) {
    box(parent, m.shell, [0.34, 4.7, 1.7], [x, 3.12, 0], 0.14, 0.035)
    box(parent, m.graphite, [0.2, 0.46, 1.78], [x, 0.69, 0], 0.1, 0.025)
  }
}

function addGroundPlinth(parent: Group, m: Mats): void {
  box(parent, m.graphite, [3.22, 0.62, 1.86], [0, 0.31, 0], 0.23, 0.06)
  box(parent, m.ink, [2.5, 0.18, 1.46], [0, 0.61, 0], 0.13, 0.035)
  // Four separated grounded feet and a framed front toe opening.
  for (const x of [-1.28, 1.28]) for (const z of [-0.66, 0.66]) box(parent, m.graphite, [0.62, 0.18, 0.46], [x, 0.09, z], 0.11, 0.03)
  box(parent, m.ink, [1.35, 0.35, 0.12], [0, 0.35, 1.0], 0.09, 0.024)
  box(parent, m.shell, [1.62, 0.16, 0.14], [0, 0.61, 0.98], 0.08, 0.02)
  box(parent, m.shell, [0.18, 0.42, 0.14], [-0.73, 0.39, 0.98], 0.07, 0.018)
  box(parent, m.shell, [0.18, 0.42, 0.14], [0.73, 0.39, 0.98], 0.07, 0.018)
  box(parent, m.amber, [0.82, 0.065, 0.06], [0, 0.35, 1.085], 0.025, 0.008)
}

function addDoor(parent: Group, m: Mats): void {
  // Deep graphite receiver and compound pale leaf.
  box(parent, m.ink, [2.35, 4.14, 0.2], [0.22, 3.14, 0.87], 0.17, 0.04)
  box(parent, m.graphite, [2.18, 3.98, 0.17], [0.22, 3.14, 1.0], 0.15, 0.038)
  box(parent, m.shell, [1.9, 3.68, 0.15], [0.22, 3.14, 1.13], 0.12, 0.032)
  box(parent, m.shade, [1.62, 3.38, 0.07], [0.22, 3.14, 1.24], 0.1, 0.022)
  box(parent, m.shell, [1.48, 3.23, 0.055], [0.22, 3.14, 1.31], 0.09, 0.018)
  // Door plate seams and vent banks.
  for (const x of [-0.32, 0.76]) {
    box(parent, m.shade, [0.04, 2.55, 0.025], [x, 3.15, 1.35], 0.012, 0.004, [0, 0, x < 0 ? -0.06 : 0.06])
  }
  for (const y of [4.62, 1.66]) for (let i = -2; i <= 2; i += 1) box(parent, m.ink, [0.055, 0.2, 0.035], [0.22 + i * 0.13, y, 1.37], 0.012, 0.004)
  // Two fully seated hinge stacks on the right jamb.
  for (const y of [2.06, 4.18]) {
    box(parent, m.graphite, [0.28, 0.5, 0.2], [1.28, y, 1.13], 0.07, 0.018)
    parent.add(cylinder(m.ink, 0.105, 0.56, [1.38, y, 1.31], [0, 0, 0], 14))
    for (const dy of [-0.18, 0.18]) parent.add(cylinder(m.amber, 0.11, 0.045, [1.38, y + dy, 1.31], [0, 0, 0], 14))
  }
}

function addFrontControls(parent: Group, m: Mats): void {
  // Left operational spine: two amber indicators and one cyan witness.
  box(parent, m.graphite, [0.48, 1.88, 0.18], [-1.12, 3.25, 1.08], 0.11, 0.028)
  box(parent, m.ink, [0.31, 0.62, 0.08], [-1.12, 3.72, 1.22], 0.07, 0.018)
  box(parent, m.amber, [0.14, 0.22, 0.045], [-1.12, 3.86, 1.29], 0.03, 0.008)
  box(parent, m.amber, [0.14, 0.22, 0.045], [-1.12, 3.58, 1.29], 0.03, 0.008)
  box(parent, m.ink, [0.34, 0.66, 0.08], [-1.12, 2.87, 1.22], 0.075, 0.02)
  box(parent, m.cyan, [0.16, 0.12, 0.045], [-1.12, 3.03, 1.29], 0.028, 0.008)
  box(parent, m.steel, [0.16, 0.12, 0.045], [-1.12, 2.75, 1.29], 0.028, 0.008)
  // Top corner markers and restrained fasteners.
  for (const x of [-1.2, 1.2]) box(parent, m.amber, [0.16, 0.24, 0.055], [x, 5.46, 0.97], 0.04, 0.012)
  for (const x of [-0.58, 0.9]) for (const y of [1.55, 4.72]) frontBolt(parent, m, x, y, 1.38)
}

function addSideStrap(parent: Group, m: Mats): void {
  // Left side bay is a real framed dark recess with an amber retained strap.
  box(parent, m.graphite, [0.22, 3.85, 0.92], [-1.58, 3.22, -0.05], 0.14, 0.035)
  box(parent, m.ink, [0.12, 3.36, 0.58], [-1.73, 3.22, -0.05], 0.11, 0.027)
  box(parent, m.amber, [0.08, 2.94, 0.22], [-1.82, 3.22, -0.05], 0.045, 0.012)
  for (const y of [1.75, 4.69]) {
    box(parent, m.graphite, [0.16, 0.42, 0.72], [-1.82, y, -0.05], 0.08, 0.02)
    box(parent, m.steel, [0.08, 0.16, 0.42], [-1.92, y, -0.05], 0.04, 0.01)
  }
  box(parent, m.graphite, [0.12, 0.52, 0.12], [-1.73, 2.35, 0.42], 0.035, 0.01)
}

function addRear(parent: Group, m: Mats): void {
  box(parent, m.graphite, [1.75, 1.8, 0.15], [0.2, 3.05, -0.89], 0.14, 0.035)
  box(parent, m.shade, [1.48, 1.54, 0.08], [0.2, 3.05, -1.0], 0.11, 0.026)
  for (let i = -3; i <= 3; i += 1) box(parent, m.ink, [0.72, 0.075, 0.04], [0.2, 3.05 + i * 0.16, -1.065], 0.012, 0.004)
}

function build() {
  const m = materials(); const root = new Group(); root.name = 'industrial locker'; root.userData.staticMechanism = true
  const fixed = new Group(); root.add(fixed)
  addCabinet(fixed, m); addGroundPlinth(fixed, m); addDoor(fixed, m); addFrontControls(fixed, m); addSideStrap(fixed, m); addRear(fixed, m)
  const geometries = mergeStaticByMaterial(fixed, { meshName: (material: { name?: string }) => material.name ?? 'locker batch' })
  return { root, m, geometries }
}

export function createModel(): Controller {
  const built = build()
  return { root: built.root, update: () => {}, dispose: () => { for (const geometry of built.geometries) geometry.dispose(); for (const material of Object.values(built.m)) material.dispose() } }
}

function preview(options: { aspect?: number; mode?: 'side' | 'rear' | 'low' } = {}): Preview {
  const model = createModel(); const scene = new Scene(); scene.background = new Color(0x010203); scene.add(model.root, new HemisphereLight(0xc7d0d1, 0x040608, 0.84))
  const key = new DirectionalLight(0xffe8d5, 2.8); key.position.set(-7, 10, 8); scene.add(key)
  const fill = new DirectionalLight(0x7398c0, 1.05); fill.position.set(8, 6, 7); scene.add(fill)
  const rim = new DirectionalLight(0x87aeb4, 0.92); rim.position.set(7, 8, -8); scene.add(rim)
  let floorGeometry: PlaneGeometry | undefined; let floorMaterial: MeshPhysicalMaterial | undefined
  if (options.mode) { floorMaterial = new MeshPhysicalMaterial({ color: 0x070a0d, roughness: 0.95, metalness: 0.02 }); floorGeometry = new PlaneGeometry(12, 12); const floor = new Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.004; floor.userData.excludeFromExport = true; scene.add(floor) }
  const camera = new PerspectiveCamera(33, options.aspect ?? 1, 0.12, 80)
  if (options.mode === 'side') camera.position.set(-7, 2.8, 0)
  else if (options.mode === 'rear') camera.position.set(5.6, 3.2, -7.2)
  else if (options.mode === 'low') camera.position.set(-5.4, 0.62, 6.7)
  else camera.position.set(-7.6, 5.45, 9.35)
  camera.lookAt(0, options.mode === 'low' ? 2.25 : 2.85, 0); scene.add(camera)
  return { ...model, scene, camera, dispose: () => { floorGeometry?.dispose(); floorMaterial?.dispose(); model.dispose() } }
}

export const createPreview = (options: { aspect?: number } = {}) => preview(options)
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
