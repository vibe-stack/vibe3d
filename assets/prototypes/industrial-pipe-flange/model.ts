import {
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Path,
  Scene,
  Shape,
} from 'three/webgpu'
import {
  MaterialLibrary,
  WEAR_ATTRIBUTES,
  bakeOcclusion,
  bakeSurfaceAttributes,
  createWearMaterial,
  cylinder,
  mergeStaticByMaterial,
  prism,
  tuneMaterial,
  type Vec3,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'

const FRONT: Vec3 = [Math.PI / 2, 0, 0]
interface Materials { shell: MeshPhysicalMaterial; shade: MeshPhysicalMaterial; graphite: MeshPhysicalMaterial; ink: MeshPhysicalMaterial; steel: MeshPhysicalMaterial; amber: MeshPhysicalMaterial; cyan: MeshPhysicalMaterial }
interface Controller { root: Group; update: (delta: number) => void; dispose: () => void }
interface Preview extends Controller { scene: Scene; camera: PerspectiveCamera }

function createMaterials() {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 27901 })
  const shade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 27902 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 27903 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 27904 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 27905 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 27906 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 27907 })
  return { handles: [shell, shade, graphite, ink, steel, amber, cyan], m: {
    shell: tuneMaterial(shell, 0xc3ccd0, 0.46, 0.3, { clearcoat: 0.13 }), shade: tuneMaterial(shade, 0x78868d, 0.58, 0.44), graphite: tuneMaterial(graphite, 0x202a33, 0.54, 0.64), ink: tuneMaterial(ink, 0x06090c, 0.86, 0.08), steel: tuneMaterial(steel, 0x9ba3a5, 0.3, 0.84), amber: tuneMaterial(amber, 0xc96b06, 0.24, 0.04, { emissive: 0.48 }), cyan: tuneMaterial(cyan, 0x38cad5, 0.22, 0.04, { emissive: 0.7 }),
  } satisfies Materials }
}

function box(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, chamfer = 0.08, bevel = 0.025, rotation: Vec3 = [0, 0, 0]) { const mesh = prism(material, size, position, { chamfer, fillet: Math.min(0.05, Math.max(0.008, chamfer * 0.28)), bevel, rotation }); parent.add(mesh); return mesh }

function annulus(material: MeshPhysicalMaterial, outer: number, inner: number, depth: number, z: number, bevel = 0.05) {
  const shape = new Shape(); shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
  const hole = new Path(); hole.absarc(0, 0, inner, 0, Math.PI * 2, true); shape.holes.push(hole)
  const geometry = new ExtrudeGeometry(shape, { depth, steps: 1, curveSegments: 32, bevelEnabled: true, bevelSegments: 2, bevelSize: bevel, bevelThickness: bevel })
  const mesh = new Mesh(geometry, material); mesh.position.set(0, 2.22, z); return mesh
}

function annulusSector(material: MeshPhysicalMaterial, outer: number, inner: number, start: number, end: number, depth: number, z: number, bevel = 0.05) {
  const shape = new Shape()
  shape.moveTo(Math.cos(start) * outer, Math.sin(start) * outer)
  shape.absarc(0, 0, outer, start, end, false)
  shape.lineTo(Math.cos(end) * inner, Math.sin(end) * inner)
  shape.absarc(0, 0, inner, end, start, true)
  shape.closePath()
  const geometry = new ExtrudeGeometry(shape, { depth, steps: 1, curveSegments: 24, bevelEnabled: true, bevelSegments: 1, bevelSize: bevel, bevelThickness: bevel })
  const mesh = new Mesh(geometry, material)
  mesh.position.set(0, 2.22, z)
  return mesh
}

function addRings(root: Group, m: Materials) {
  const ringGeometries = []
  const back = annulus(m.graphite, 2.25, 1.2, 0.3, -0.2, 0.055); root.add(back); ringGeometries.push(back.geometry)
  const rearCollar = annulus(m.shade, 2.14, 1.26, 0.16, 0.08, 0.035); root.add(rearCollar); ringGeometries.push(rearCollar.geometry)
  // Four real shell quadrants with physical seams at each load axis.
  const shellGap = 0.025
  for (let quadrant = 0; quadrant < 4; quadrant += 1) {
    const start = quadrant * Math.PI / 2 + shellGap
    const end = (quadrant + 1) * Math.PI / 2 - shellGap
    const sector = annulusSector(m.shell, 2.18, 1.56, start, end, 0.34, 0.13, 0.055)
    root.add(sector); ringGeometries.push(sector.geometry)
  }
  for (let quadrant = 0; quadrant < 4; quadrant += 1) {
    const start = quadrant * Math.PI / 2 + 0.22
    const end = (quadrant + 1) * Math.PI / 2 - 0.22
    const recess = annulusSector(m.shade, 2.01, 1.72, start, end, 0.045, 0.48, 0.022)
    const innerPlate = annulusSector(m.shell, 1.96, 1.77, start + 0.035, end - 0.035, 0.032, 0.535, 0.016)
    root.add(recess, innerPlate); ringGeometries.push(recess.geometry, innerPlate.geometry)
  }
  const graphite = annulus(m.graphite, 1.64, 1.35, 0.2, 0.42, 0.035); root.add(graphite); ringGeometries.push(graphite.geometry)
  // The luminous seal is also genuinely segmented rather than covered by trims.
  const sealGap = 0.08
  for (let quadrant = 0; quadrant < 4; quadrant += 1) {
    const start = quadrant * Math.PI / 2 + sealGap
    const end = (quadrant + 1) * Math.PI / 2 - sealGap
    const sector = annulusSector(m.amber, 1.53, 1.4, start, end, 0.065, 0.64, 0.01)
    root.add(sector); ringGeometries.push(sector.geometry)
  }
  const lip = annulus(m.ink, 1.34, 1.16, 0.14, 0.66, 0.024); root.add(lip); ringGeometries.push(lip.geometry)
  const throatMaterial = m.ink.clone(); throatMaterial.name = 'industrial-pipe-flange / double-sided throat'; throatMaterial.side = DoubleSide
  const throatGeometry = new CylinderGeometry(1.15, 1.15, 0.92, 32, 1, true)
  const throat = new Mesh(throatGeometry, throatMaterial); throat.rotation.x = Math.PI / 2; throat.position.set(0, 2.22, 0.25); root.add(throat)
  const inner = annulus(m.amber, 1.18, 1.12, 0.05, 0.82, 0.008); root.add(inner); ringGeometries.push(inner.geometry)
  return { throatGeometry, throatMaterial, ringGeometries }
}

function addArmor(root: Group, m: Materials) {
  for (let i = 0; i < 4; i += 1) {
    const a = i * Math.PI / 2
    const cx = Math.cos(a) * 1.77
    const cy = 2.22 + Math.sin(a) * 1.77
    box(root, m.shade, [0.72, 0.88, 0.34], [cx, cy, 0.44], 0.16, 0.04, [0, 0, a])
    box(root, m.graphite, [0.6, 0.76, 0.3], [cx, cy, 0.66], 0.14, 0.035, [0, 0, a])
    for (const offset of [-0.19, 0, 0.19]) {
      const localX = Math.cos(a) * 1.79 - Math.sin(a) * offset
      const localY = 2.22 + Math.sin(a) * 1.79 + Math.cos(a) * offset
      box(root, m.amber, [0.26, 0.085, 0.07], [localX, localY, 0.85], 0.022, 0.006, [0, 0, a])
    }
  }
  for (let i = 0; i < 4; i += 1) {
    const a = i * Math.PI / 2 + Math.PI / 4
    const x = Math.cos(a) * 1.79; const y = 2.22 + Math.sin(a) * 1.79
    root.add(cylinder(m.graphite, 0.31, 0.23, [x, y, 0.55], FRONT, 6))
    root.add(cylinder(m.ink, 0.19, 0.25, [x, y, 0.72], FRONT, 6))
    root.add(cylinder(m.steel, 0.085, 0.11, [x, y, 0.84], FRONT, 6))
  }
  box(root, m.cyan, [0.07, 0.4, 0.07], [2.16, 2.22, 0.56], 0.018, 0.005)
}

function build() {
  const { m, handles } = createMaterials(); const root = new Group(); root.name = 'industrial pipe flange'; root.userData.staticMechanism = true; const extra = addRings(root, m); addArmor(root, m)
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([[m.shell, { rub: 0.07, grime: 0.035, scratch: 0.012 }], [m.shade, { rub: 0.09, grime: 0.04, scratch: 0.014 }], [m.graphite, { rub: 0.05, grime: 0.04, scratch: 0.01 }], [m.steel, { rub: 0.15, grime: 0.035, scratch: 0.02 }]])
  bakeOcclusion(root, { reach: 0.14 }); bakeSurfaceAttributes(root, profiles); const wear = createWearMaterial({ name: 'industrial-pipe-flange / localized wear', clearcoat: 0.08, clearcoatRoughness: 0.56 })
  root.traverse((object) => { if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear })
  const geometries = mergeStaticByMaterial(root, { retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [], meshName: (material: { name?: string }) => material.name ?? 'pipe flange batch' })
  return { root, handles, wear, geometries, extra }
}

export function createModel(): Controller { const result = build(); return { root: result.root, update: () => {}, dispose: () => { for (const geometry of result.geometries) geometry.dispose(); result.wear.dispose(); result.extra.throatGeometry.dispose(); for (const geometry of result.extra.ringGeometries) geometry.dispose(); result.extra.throatMaterial.dispose(); for (const handle of result.handles) handle.release() } } }

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low' } = {}): Preview {
  const model = createModel(); const scene = new Scene(); scene.background = new Color(0x030506); scene.add(model.root, new HemisphereLight(0xcbd2d4, 0x07090c, 0.82)); const key = new DirectionalLight(0xffead6, 2.8); key.position.set(-8, 10, 11); scene.add(key); const fill = new DirectionalLight(0x789bc5, 1.1); fill.position.set(9, 7, 8); scene.add(fill); const rim = new DirectionalLight(0x8bb3bc, 0.9); rim.position.set(7, 10, -11); scene.add(rim)
  let floorMaterial: MeshPhysicalMaterial | undefined; let floorGeometry: PlaneGeometry | undefined; if (options.mode && options.mode !== 'beauty') { floorMaterial = new MeshPhysicalMaterial({ color: 0x090d10, roughness: 0.92, metalness: 0.04 }); floorGeometry = new PlaneGeometry(12, 12); const floor = new Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.004; floor.userData.excludeFromExport = true; scene.add(floor) }
  const camera = new PerspectiveCamera(34, options.aspect ?? 1, 0.14, 90); if (options.mode === 'side') camera.position.set(-7.8, 2.3, 0); else if (options.mode === 'rear') camera.position.set(6.5, 2.7, -7.8); else if (options.mode === 'low') camera.position.set(-6.1, 0.65, 7.3); else camera.position.set(-6.1, 3.5, 7.3); camera.lookAt(0, options.mode === 'low' ? 1.7 : 2.22, 0); scene.add(camera)
  return { ...model, scene, camera, dispose: () => { floorGeometry?.dispose(); floorMaterial?.dispose(); model.dispose() } }
}

export const createPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
