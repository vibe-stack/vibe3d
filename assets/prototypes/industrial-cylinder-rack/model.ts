import { Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshPhysicalMaterial, PerspectiveCamera, PlaneGeometry, Scene } from 'three/webgpu'
import { MaterialLibrary, WEAR_ATTRIBUTES, bakeOcclusion, bakeSurfaceAttributes, createWearMaterial, cylinder, mergeStaticByMaterial, prism, tuneMaterial, type MaterialHandle, type Vec3, type WearProfile } from '../../../src/asset-forge/generator/index.ts'

const FRONT_AXIS: Vec3 = [Math.PI / 2, 0, 0]
interface Materials { shell: MeshPhysicalMaterial; shade: MeshPhysicalMaterial; graphite: MeshPhysicalMaterial; ink: MeshPhysicalMaterial; steel: MeshPhysicalMaterial; amber: MeshPhysicalMaterial; cyan: MeshPhysicalMaterial; grime: MeshPhysicalMaterial }
interface Controller { root: Group; update: (deltaSeconds: number) => void; toggleRack: (enabled?: boolean) => boolean; dispose: () => void }
interface Preview extends Controller { scene: Scene; camera: PerspectiveCamera }
let exportedEnabled = false
const listeners = new Set<(value: boolean) => void>()
export function toggleRack(enabled = !exportedEnabled): boolean { exportedEnabled = enabled; for (const listener of listeners) listener(enabled); return enabled }

function materials(): { m: Materials; handles: MaterialHandle[] } {
  const lib = new MaterialLibrary()
  const shell = lib.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 26301 })
  const shade = lib.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 26302 })
  const graphite = lib.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 26303 })
  const ink = lib.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 26304 })
  const steel = lib.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 26305 })
  const amber = lib.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 26306 })
  const cyan = lib.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 26307 })
  return { handles: [shell, shade, graphite, ink, steel, amber, cyan], m: {
    shell: tuneMaterial(shell, 0xcbd0cf, 0.46, 0.28, { clearcoat: 0.12 }), shade: tuneMaterial(shade, 0x8d9799, 0.56, 0.42), graphite: tuneMaterial(graphite, 0x222930, 0.56, 0.62), ink: tuneMaterial(ink, 0x07090b, 0.84, 0.1), steel: tuneMaterial(steel, 0x98a1a4, 0.3, 0.84), amber: tuneMaterial(amber, 0xe67a08, 0.2, 0.04, { emissive: 0.75, clearcoat: 0.25 }), cyan: tuneMaterial(cyan, 0x35cbd8, 0.22, 0.04, { emissive: 0.82 }), grime: new MeshPhysicalMaterial({ name: 'industrial-cylinder-rack / contact grime', color: 0x1d1a17, roughness: 0.94, metalness: 0.03 }),
  } }
}
function box(p: Group, m: MeshPhysicalMaterial, s: Vec3, at: Vec3, c = 0.08, b = 0.025, r: Vec3 = [0, 0, 0]): Mesh { const o = prism(m, s, at, { chamfer: c, fillet: Math.min(0.05, Math.max(0.008, c * 0.28)), bevel: b, rotation: r }); p.add(o); return o }
function bolt(p: Group, m: MeshPhysicalMaterial, x: number, y: number, z: number): void { p.add(cylinder(m, 0.05, 0.1, [x, y, z], FRONT_AXIS, 8)) }

function chassis(f: Group, m: Materials): void {
  box(f, m.ink, [4.28, 3.72, 0.3], [0, 2.35, -0.72], 0.32, 0.07)
  box(f, m.graphite, [4.96, 0.62, 2.28], [0, 0.42, -0.18], 0.2, 0.05)
  for (const x of [-2.15, 2.15]) { box(f, m.shell, [0.68, 4.5, 2.14], [x, 2.5, -0.16], 0.28, 0.07); box(f, m.graphite, [0.28, 3.44, 2.34], [x, 2.52, -0.14], 0.1, 0.028) }
  for (const y of [0.9, 2.52, 4.52]) { box(f, m.shell, [4.78, 0.62, 2.08], [0, y, -0.16], 0.22, 0.055); box(f, m.graphite, [4.2, 0.2, 2.28], [0, y - 0.2, -0.14], 0.07, 0.018) }
  for (const x of [-2.05, 2.05]) for (const z of [-0.46, 0.46]) { box(f, m.graphite, [0.82, 0.22, 0.66], [x, 0.11, z], 0.13, 0.03); box(f, m.steel, [0.38, 0.06, 0.34], [x, 0.03, z], 0.07, 0.016) }
  for (const x of [-1.82, 1.82]) { box(f, m.amber, [1.0, 0.13, 0.14], [x, 4.96, 0.18], 0.05, 0.014); box(f, m.graphite, [0.18, 0.44, 0.18], [x - 0.48, 4.77, 0.18], 0.05, 0.014); box(f, m.graphite, [0.18, 0.44, 0.18], [x + 0.48, 4.77, 0.18], 0.05, 0.014) }
  box(f, m.cyan, [0.14, 0.88, 0.08], [-2.48, 2.25, 0.48], 0.04, 0.012)
  box(f, m.shade, [4.18, 3.5, 0.22], [0, 2.52, -1.28], 0.28, 0.065)
  box(f, m.graphite, [3.48, 1.26, 0.14], [0, 3.45, -1.44], 0.16, 0.038)
  box(f, m.graphite, [3.48, 1.12, 0.14], [0, 1.68, -1.44], 0.16, 0.038)
  for (let i = -5; i <= 5; i += 1) box(f, m.ink, [0.14, 0.62, 0.08], [i * 0.27, 3.45, -1.54], 0.03, 0.008)
  for (const x of [-1.55, 1.55]) for (const y of [1.28, 2.15]) bolt(f, m.steel, x, y, -1.55)
  for (const x of [-1.48, 0, 1.48]) for (const y of [1.72, 3.55]) {
    box(f, m.graphite, [1.12, 0.26, 1.26], [x, y - 0.62, -0.18], 0.14, 0.034)
    box(f, m.graphite, [0.24, 1.08, 1.14], [x - 0.5, y, -0.2], 0.1, 0.026)
    box(f, m.graphite, [0.24, 1.08, 1.14], [x + 0.5, y, -0.2], 0.1, 0.026)
  }
  for (const z of [-1.12, 0.82]) for (const x of [-2.3, 2.3]) box(f, m.amber, [0.18, 0.66, 0.18], [x, 0.48, z], 0.06, 0.016)
}
function vessels(f: Group, latches: Group, m: Materials): void {
  for (const y of [1.72, 3.55]) for (const x of [-1.48, 0, 1.48]) {
    f.add(cylinder(m.shade, 0.72, 0.92, [x, y, 0.06], FRONT_AXIS, 20))
    f.add(cylinder(m.shell, 0.62, 1.02, [x, y, 0.12], FRONT_AXIS, 20))
    f.add(cylinder(m.graphite, 0.52, 0.22, [x, y, 0.68], FRONT_AXIS, 20))
    f.add(cylinder(m.ink, 0.39, 0.14, [x, y, 0.84], FRONT_AXIS, 20))
    f.add(cylinder(m.steel, 0.22, 0.12, [x, y, 0.94], FRONT_AXIS, 16))
    box(f, m.amber, [0.5, 0.13, 0.09], [x, y + 0.35, 1.03], 0.06, 0.016)
    box(f, m.graphite, [0.3, 0.58, 0.15], [x, y - 0.02, 1.04], 0.08, 0.02)
    for (let i = -2; i <= 2; i += 1) box(f, m.amber, [0.13, 0.055, 0.05], [x, y - 0.15 + i * 0.09, 1.13], 0.018, 0.005)
    const latch = new Group(); latch.position.set(x, y + 0.33, 1.08); box(latch, m.steel, [0.1, 0.36, 0.11], [0, -0.16, 0], 0.035, 0.01); latches.add(latch)
  }
  for (const x of [-1.5, 0, 1.5]) for (const y of [0.97, 2.67, 4.36]) bolt(f, m.steel, x, y, 0.78)
  box(f, m.grime, [3.7, 0.06, 0.12], [0, 0.74, 0.58], 0.03, 0.008)
}

function build() {
  const { m, handles } = materials(); const root = new Group(); root.name = 'industrial cylinder rack'; const fixed = new Group(); const latches = new Group(); latches.name = 'six bounded vessel latches'; root.add(fixed, latches); chassis(fixed, m); vessels(fixed, latches, m)
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([[m.shell, { rub: 0.08, grime: 0.035, scratch: 0.012 }], [m.shade, { rub: 0.09, grime: 0.04, scratch: 0.014 }], [m.graphite, { rub: 0.05, grime: 0.04, scratch: 0.009 }], [m.steel, { rub: 0.16, grime: 0.04, scratch: 0.02 }]])
  bakeOcclusion(root, { reach: 0.16 }); bakeSurfaceAttributes(root, profiles); const wear = createWearMaterial({ name: 'industrial-cylinder-rack / localized wear', clearcoat: 0.08, clearcoatRoughness: 0.55 }); root.traverse((o) => { if (o instanceof Mesh && !Array.isArray(o.material) && profiles.has(o.material)) o.material = wear })
  const opts = { retainedAttributes: (mat: unknown): readonly string[] => mat === wear ? WEAR_ATTRIBUTES : [], meshName: (mat: { name?: string }) => mat.name ?? 'rack batch' }; const geometries = [...mergeStaticByMaterial(fixed, opts), ...mergeStaticByMaterial(latches, opts)]
  return { root, latches, m, handles, wear, geometries }
}
export function createModel(): Controller { const r = build(); let enabled = false; let t = 0; const listener = (v: boolean) => { enabled = v }; listeners.add(listener); return { root: r.root, update: (d: number) => { if (!enabled) return; t += Math.min(Math.max(d, 0), 0.05); r.latches.rotation.z = Math.sin(t * 2.4) * 0.035; r.m.amber.emissiveIntensity = 0.62 + Math.sin(t * 3.1) * 0.18 }, toggleRack: (v = !enabled) => { enabled = v; return enabled }, dispose: () => { listeners.delete(listener); for (const g of r.geometries) g.dispose(); r.wear.dispose(); for (const h of r.handles) h.release(); r.m.grime.dispose() } } }
function preview(o: { aspect?: number; mode?: 'beauty'|'side'|'rear'|'low'; active?: boolean } = {}): Preview { const model = createModel(); if (o.active) { model.toggleRack(true); for (let i=0;i<30;i++) model.update(0.05) } const scene = new Scene(); scene.background = new Color(0x030506); scene.add(model.root, new HemisphereLight(0xcbd2d4,0x07090c,0.82)); const key=new DirectionalLight(0xffead6,2.8);key.position.set(-7,9,10);scene.add(key);const fill=new DirectionalLight(0x789bc5,1.1);fill.position.set(8,5,8);scene.add(fill);const rim=new DirectionalLight(0x8bb3bc,0.9);rim.position.set(6,7,-8);scene.add(rim);const fm=new MeshPhysicalMaterial({color:0x090d10,roughness:.92,metalness:.04});const fg=new PlaneGeometry(14,14);const floor=new Mesh(fg,fm);floor.rotation.x=-Math.PI/2;floor.position.y=-.004;floor.userData.excludeFromExport=true;scene.add(floor);const camera=new PerspectiveCamera(34,o.aspect??1,.14,80);if(o.mode==='side')camera.position.set(-7,3,0);else if(o.mode==='rear')camera.position.set(6,3.4,-7);else if(o.mode==='low')camera.position.set(-5,.9,7);else camera.position.set(-6,4.2,8);camera.lookAt(0,o.mode==='low'?2:2.55,0);scene.add(camera);return {...model,scene,camera,dispose:()=>{fg.dispose();fm.dispose();model.dispose()}} }
export const createPreview=(o:{aspect?:number}={})=>preview({...o,mode:'beauty'});export const createSidePreview=(o:{aspect?:number}={})=>preview({...o,mode:'side'});export const createRearPreview=(o:{aspect?:number}={})=>preview({...o,mode:'rear'});export const createLowPreview=(o:{aspect?:number}={})=>preview({...o,mode:'low'});export const createToggledPreview=(o:{aspect?:number}={})=>preview({...o,mode:'beauty',active:true})
