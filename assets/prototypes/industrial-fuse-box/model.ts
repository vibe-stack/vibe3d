import { Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshPhysicalMaterial, PerspectiveCamera, PlaneGeometry, Scene } from 'three/webgpu'
import { WEAR_ATTRIBUTES, bakeOcclusion, bakeSurfaceAttributes, createWearMaterial, cylinder, mergeStaticByMaterial, prism, type Vec3, type WearProfile } from '../../../src/asset-forge/generator/index.ts'

const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]
interface Mats { shell: MeshPhysicalMaterial; shellShade: MeshPhysicalMaterial; graphite: MeshPhysicalMaterial; edge: MeshPhysicalMaterial; steel: MeshPhysicalMaterial; amber: MeshPhysicalMaterial; cyan: MeshPhysicalMaterial; grime: MeshPhysicalMaterial }
interface Controller { root: Group; update: (delta: number) => void; dispose: () => void }
interface Preview extends Controller { scene: Scene; camera: PerspectiveCamera }

function materials(): Mats {
  return {
    shell: new MeshPhysicalMaterial({ name: 'industrial-fuse-box / maintained ivory armor', color: 0xcbd0cd, roughness: 0.46, metalness: 0.33, clearcoat: 0.13, clearcoatRoughness: 0.43 }),
    shellShade: new MeshPhysicalMaterial({ name: 'industrial-fuse-box / shadowed shell armor', color: 0x899392, roughness: 0.52, metalness: 0.48, clearcoat: 0.08 }),
    graphite: new MeshPhysicalMaterial({ name: 'industrial-fuse-box / graphite chassis', color: 0x11171b, roughness: 0.57, metalness: 0.73, clearcoat: 0.06 }),
    edge: new MeshPhysicalMaterial({ name: 'industrial-fuse-box / structural edge steel', color: 0x343d41, roughness: 0.36, metalness: 0.88, clearcoat: 0.11 }),
    steel: new MeshPhysicalMaterial({ name: 'industrial-fuse-box / fastener steel', color: 0xa0a7a6, roughness: 0.24, metalness: 0.97, clearcoat: 0.22 }),
    amber: new MeshPhysicalMaterial({ name: 'industrial-fuse-box / energized fuse glass', color: 0xd77808, roughness: 0.22, metalness: 0.06, transmission: 0.1, transparent: true, opacity: 0.93, emissive: new Color(0xff4b00), emissiveIntensity: 0.72 }),
    cyan: new MeshPhysicalMaterial({ name: 'industrial-fuse-box / cyan witness', color: 0x56dfe7, roughness: 0.18, metalness: 0.04, emissive: new Color(0x20cbd5), emissiveIntensity: 1.35 }),
    grime: new MeshPhysicalMaterial({ name: 'industrial-fuse-box / seam grime', color: 0x29251f, roughness: 0.84, metalness: 0.15 }),
  }
}

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.07, bevel = 0.022, rotation: Vec3 = [0, 0, 0]) { const mesh = prism(material, size, position, { chamfer, fillet: Math.min(0.042, Math.max(0.008, chamfer * 0.3)), bevel, rotation }); parent.add(mesh); return mesh }
function boltZ(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number, radius = 0.045) { parent.add(cylinder(material, radius, 0.13, [x, y, z], Z_AXIS, 8)) }

function addCabinet(root: Group, m: Mats) {
  box(root, m.shellShade, [5.25, 5.42, 1.32], [0, 2.76, 0], 0.32, 0.08)
  box(root, m.shell, [5.0, 5.16, 1.36], [0.03, 2.81, 0.05], 0.3, 0.075)
  box(root, m.shell, [5.08, 0.58, 1.45], [0.03, 5.18, 0.05], 0.24, 0.06)
  box(root, m.shellShade, [4.55, 0.38, 1.42], [0.03, 0.42, 0.02], 0.17, 0.042)
  box(root, m.graphite, [4.5, 4.78, 0.22], [0, 2.8, -0.78], 0.2, 0.05)
  for (const x of [-2.45, 2.45]) for (const y of [0.9, 4.75]) {
    box(root, m.edge, [0.45, 0.86, 0.38], [x, y, -0.48], 0.12, 0.03)
    boltZ(root, m.graphite, x, y, -0.25, 0.12)
    boltZ(root, m.steel, x, y, -0.16, 0.04)
  }
  for (const x of [-1.82, -0.61, 0.61, 1.82]) {
    root.add(cylinder(m.graphite, 0.24, 0.4, [x, 0.2, 0.02], [0, 0, 0], 16))
    root.add(cylinder(m.edge, 0.18, 0.18, [x, 0.03, 0.02], [0, 0, 0], 14))
  }
  box(root, m.grime, [3.4, 0.04, 0.16], [0, 0.5, 0.68], 0.03, 0.008)
}

function addFuseBay(root: Group, m: Mats) {
  // Thick frame and recessed backing put the three fuse carriers inside a real cavity.
  box(root, m.edge, [3.72, 3.72, 0.38], [0.38, 3.0, 0.73], 0.24, 0.06)
  box(root, m.graphite, [3.4, 3.4, 0.3], [0.38, 3.0, 1.01], 0.2, 0.05)
  box(root, m.graphite, [3.05, 3.04, 0.16], [0.38, 3.0, 1.23], 0.16, 0.04)
  for (const [x, y] of [[-1.22, 4.62], [1.98, 4.62], [-1.22, 1.38], [1.98, 1.38]] as const) boltZ(root, m.steel, x, y, 1.21, 0.055)

  for (const x of [-0.55, 0.38, 1.31]) {
    box(root, m.edge, [0.72, 0.64, 0.48], [x, 4.14, 1.24], 0.15, 0.04)
    box(root, m.shellShade, [0.62, 0.46, 0.5], [x, 4.27, 1.46], 0.13, 0.034)
    root.add(cylinder(m.graphite, 0.28, 0.32, [x, 3.82, 1.38], [0, 0, 0], 16))
    root.add(cylinder(m.amber, 0.17, 1.52, [x, 3.05, 1.39], [0, 0, 0], 16))
    root.add(cylinder(m.steel, 0.052, 1.34, [x, 3.05, 1.52], [0, 0, 0], 10))
    root.add(cylinder(m.graphite, 0.28, 0.32, [x, 2.28, 1.38], [0, 0, 0], 16))
    box(root, m.edge, [0.72, 0.64, 0.48], [x, 1.96, 1.24], 0.15, 0.04)
    box(root, m.shellShade, [0.62, 0.46, 0.5], [x, 1.83, 1.46], 0.13, 0.034)
    for (const y of [1.83, 4.27]) box(root, m.amber, [0.16, 0.08, 0.045], [x, y, 1.72], 0.02, 0.005)
  }
}

function addService(root: Group, m: Mats) {
  box(root, m.edge, [2.35, 0.54, 0.24], [0.28, 5.17, 0.83], 0.13, 0.032)
  box(root, m.graphite, [1.95, 0.3, 0.15], [0.28, 5.17, 1.03], 0.08, 0.022)
  box(root, m.amber, [1.62, 0.13, 0.05], [0.28, 5.17, 1.15], 0.04, 0.01)

  box(root, m.edge, [0.62, 2.12, 0.25], [-2.02, 3.1, 0.8], 0.14, 0.036)
  box(root, m.graphite, [0.4, 1.82, 0.14], [-2.02, 3.1, 1.0], 0.09, 0.024)
  box(root, m.cyan, [0.08, 1.48, 0.045], [-2.02, 3.1, 1.11], 0.018, 0.005)

  box(root, m.edge, [0.52, 1.55, 0.25], [2.25, 3.0, 0.78], 0.13, 0.034)
  box(root, m.graphite, [0.32, 1.25, 0.14], [2.25, 3.0, 0.98], 0.08, 0.022)
  box(root, m.amber, [0.15, 0.8, 0.06], [2.25, 3.0, 1.09], 0.035, 0.01)

  box(root, m.edge, [2.2, 0.7, 0.25], [0.32, 0.96, 0.78], 0.15, 0.038)
  box(root, m.graphite, [1.72, 0.35, 0.14], [0.32, 0.96, 0.98], 0.09, 0.024)
  for (const x of [-0.25, 0.32, 0.89]) boltZ(root, m.steel, x, 0.96, 1.1, 0.04)
}

function build() {
  const m = materials(); const root = new Group(); root.name = 'industrial fuse box'; addCabinet(root, m); addFuseBay(root, m); addService(root, m)
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([[m.shell, { rub: 0.075, grime: 0.035, scratch: 0.012 }], [m.shellShade, { rub: 0.1, grime: 0.06, scratch: 0.016 }], [m.graphite, { rub: 0.12, grime: 0.14, scratch: 0.021 }], [m.edge, { rub: 0.16, grime: 0.09, scratch: 0.026 }], [m.steel, { rub: 0.2, grime: 0.045, scratch: 0.03 }], [m.grime, { rub: 0.035, grime: 0.3, scratch: 0.006 }]])
  bakeOcclusion(root, { reach: 0.17 }); bakeSurfaceAttributes(root, profiles); const wear = createWearMaterial({ name: 'industrial-fuse-box / localized service wear', clearcoat: 0.1, clearcoatRoughness: 0.47 })
  root.traverse((object) => { if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear })
  const geometries = mergeStaticByMaterial(root, { retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [], meshName: (material: { name?: string }) => material.name ?? 'industrial-fuse-box batch' })
  return { root, m, wear, geometries }
}

export function createModel(): Controller { const rig = build(); return { root: rig.root, update: () => {}, dispose: () => { for (const geometry of rig.geometries) geometry.dispose(); rig.wear.dispose(); for (const material of Object.values(rig.m)) material.dispose() } } }

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low' } = {}): Preview {
  const model = createModel(); const scene = new Scene(); scene.background = new Color(0x030607); scene.add(model.root, new HemisphereLight(0xc3cdcf, 0x07090c, 0.84)); const key = new DirectionalLight(0xffead5, 2.8); key.position.set(-7, 10, 9); scene.add(key); const fill = new DirectionalLight(0x7598c2, 1.05); fill.position.set(8, 5, 7); scene.add(fill); const rim = new DirectionalLight(0x83adb3, 0.95); rim.position.set(7, 9, -8); scene.add(rim)
  const floorMaterial = new MeshPhysicalMaterial({ color: 0x090d10, roughness: 0.92, metalness: 0.05 }); const floorGeometry = new PlaneGeometry(16, 16); const floor = new Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.004; floor.userData.excludeFromExport = true; scene.add(floor)
  const camera = new PerspectiveCamera(34, options.aspect ?? 1, 0.14, 100); if (options.mode === 'side') camera.position.set(-8.8, 2.9, 0.1); else if (options.mode === 'rear') camera.position.set(7.2, 3.6, -8.7); else if (options.mode === 'low') camera.position.set(-6.8, 0.95, 8.4); else camera.position.set(-3.9, 3.9, 10.6); camera.lookAt(0, options.mode === 'low' ? 1.9 : 2.7, 0.2); scene.add(camera)
  return { ...model, scene, camera, dispose: () => { floorGeometry.dispose(); floorMaterial.dispose(); model.dispose() } }
}

export const createPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
