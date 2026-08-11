import { CatmullRomCurve3, Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshPhysicalMaterial, PerspectiveCamera, Scene, TubeGeometry, Vector3 } from 'three/webgpu'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  MaterialLibrary, WEAR_ATTRIBUTES, bakeOcclusion, bakeSurfaceAttributes, createWearMaterial,
  cylinder, mergeStaticByMaterial, prism, tuneMaterial,
  type MaterialHandle, type Vec3, type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'
import { annotateKitAsset, validateKitMetadata, type KitSocket } from '../axiom-modular-kit/contract.ts'

interface Materials { shell: MeshPhysicalMaterial; graphite: MeshPhysicalMaterial; ink: MeshPhysicalMaterial; steel: MeshPhysicalMaterial; amber: MeshPhysicalMaterial; cyan: MeshPhysicalMaterial; grime: MeshPhysicalMaterial }
interface Preview { scene: Scene; root: Group; camera: PerspectiveCamera; update: (deltaSeconds: number) => void; dispose: () => void }

const SOCKETS: readonly KitSocket[] = [
  { name: 'foundation_front_left', kind: 'foundation', position: [0, 0, 0], normal: [0, -1, 0] },
  { name: 'floor_center', kind: 'floor', position: [2, 0, -1.5], normal: [0, 1, 0] },
  { name: 'wall_front', kind: 'wall', position: [2, 1.5, 0], normal: [0, 0, 1] },
  { name: 'wall_left', kind: 'wall', position: [0, 1.5, -1.5], normal: [-1, 0, 0] },
  { name: 'wall_right', kind: 'wall', position: [4, 1.5, -1.5], normal: [1, 0, 0] },
  { name: 'wall_rear', kind: 'wall', position: [2, 1.5, -3], normal: [0, 0, -1] },
  { name: 'ceiling_center', kind: 'ceiling', position: [2, 3, -1.5], normal: [0, 1, 0] },
  { name: 'door_bay_front', kind: 'door', position: [1.25, 1.5, 0], normal: [0, 0, 1], up: [0, 1, 0] },
  { name: 'pipe_right_low', kind: 'service', position: [4, 1, -1.25], normal: [1, 0, 0] },
  { name: 'pipe_right_high', kind: 'service', position: [4, 1.5, -2], normal: [1, 0, 0] },
  { name: 'duct_right', kind: 'service', position: [4, 2.25, -1.5], normal: [1, 0, 0] },
  { name: 'cable_right', kind: 'service', position: [4, 1, -2.5], normal: [1, 0, 0] },
  { name: 'equipment_mount_right', kind: 'service', position: [4, 1.5, -1.75], normal: [1, 0, 0] },
]

function makeMaterials(): { materials: Materials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 9301 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 9302 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'worked', seed: 9303 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 9304 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 9305 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 9306 })
  const grime = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 9307 })
  return { materials: {
    shell: tuneMaterial(shell, 0x7a8284, 0.54, 0.34, { clearcoat: 0.08 }), graphite: tuneMaterial(graphite, 0x222a30, 0.52, 0.68),
    ink: tuneMaterial(ink, 0x070a0d, 0.72, 0.24), steel: tuneMaterial(steel, 0x748086, 0.29, 0.94),
    amber: tuneMaterial(amber, 0xc76905, 0.22, 0.02, { emissive: 0.95 }), cyan: tuneMaterial(cyan, 0x087c8e, 0.2, 0.02, { emissive: 0.72 }),
    grime: tuneMaterial(grime, 0x29251f, 0.94, 0.05),
  }, handles: [shell, graphite, ink, steel, amber, cyan, grime] }
}

function pipe(material: MeshPhysicalMaterial, points: Vec3[], radius: number): Mesh { const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)), false, 'centripetal'); return new Mesh(new TubeGeometry(curve, 20, radius, 8, false), material) }

function addFoundation(root: Group, m: Materials): void {
  root.add(prism(m.graphite, [3.62, 0.36, 2.62], [2, 0.18, -1.5], { chamfer: 0.1, fillet: 0.032, bevel: 0.026 }))
  root.add(prism(m.steel, [3.46, 0.05, 2.46], [2, 0.385, -1.5], { chamfer: 0.07, fillet: 0.024, bevel: 0.019 }))
  for (const [x, z] of [[0.28, -0.28], [3.72, -0.28], [0.28, -2.72], [3.72, -2.72]] as const) root.add(cylinder(m.ink, 0.06, 0.045, [x, 0.42, z], [0, 0, 0], 10))
  // Heavy corner outriggers and raised entry plinth create the squat armored stance.
  for (const [x, z] of [[0.35, -0.35], [3.65, -0.35], [0.35, -2.65], [3.65, -2.65]] as const) {
    root.add(prism(m.graphite, [0.7, 0.34, 0.7], [x, 0.17, z], { chamfer: 0.09, fillet: 0.03, bevel: 0.024 }))
    root.add(prism(m.graphite, [0.5, 0.04, 0.5], [x, 0.36, z], { chamfer: 0.055, fillet: 0.019, bevel: 0.015 }))
    root.add(prism(m.graphite, [0.7, 0.14, 0.7], [x, 0.07, z], { chamfer: 0.1, fillet: 0.032, bevel: 0.026 }))
  }
  root.add(prism(m.graphite, [2.38, 0.24, 0.7], [1.25, 0.12, -0.38], { chamfer: 0.09, fillet: 0.03, bevel: 0.024 }))
  root.add(prism(m.steel, [1.82, 0.055, 0.56], [1.25, 0.28, -0.34], { chamfer: 0.055, fillet: 0.019, bevel: 0.015 }))
  for (const x of [0.2, 2.3]) root.add(prism(m.graphite, [0.38, 0.32, 0.5], [x, 0.16, -0.32], { chamfer: 0.065, fillet: 0.022, bevel: 0.018 }))
  root.add(prism(m.ink, [1.34, 0.015, 0.42], [1.25, 0.32, -0.34], { chamfer: 0.03, fillet: 0.01, bevel: 0.008 }))
  for (let index = 0; index < 11; index += 1) root.add(prism(m.steel, [0.045, 0.012, 0.34], [0.95 + index * 0.06, 0.331, -0.34], { chamfer: 0.005, fillet: 0.002, bevel: 0.0015 }))
}

function addShell(root: Group, m: Materials): void {
  // Four non-overlapping wall cassettes fill the spans between the corner posts.
  root.add(prism(m.shell, [3.28, 2.21, 0.22], [2, 1.555, -0.34], { chamfer: [0.1, 0.1, 0.05, 0.05], fillet: 0.035, bevel: 0.028 }))
  root.add(prism(m.shell, [3.28, 2.21, 0.22], [2, 1.555, -2.66], { chamfer: [0.1, 0.1, 0.05, 0.05], fillet: 0.035, bevel: 0.028 }))
  root.add(prism(m.shell, [1.84, 2.21, 0.2], [0.48, 1.555, -1.57], { chamfer: [0.1, 0.1, 0.05, 0.05], fillet: 0.035, bevel: 0.028, rotation: [0, Math.PI / 2, 0] }))
  root.add(prism(m.shell, [1.84, 2.21, 0.2], [3.52, 1.555, -1.57], { chamfer: [0.1, 0.1, 0.05, 0.05], fillet: 0.035, bevel: 0.028, rotation: [0, Math.PI / 2, 0] }))
  for (const x of [0.18, 3.82]) for (const z of [-0.42, -2.72]) root.add(prism(m.graphite, [0.36, 2.3, 0.42], [x, 1.55, z], { chamfer: 0.075, fillet: 0.028, bevel: 0.023 }))
  // Compound corner shoulders visually lower and widen the enclosure while
  // transferring roof load through the four dark towers into the outriggers.
  for (const [x, z] of [[0.32, -0.36], [3.68, -0.36], [0.32, -2.64], [3.68, -2.64]] as const) {
    root.add(prism(m.graphite, [0.48, 0.48, 0.56], [x, 2.58, z], { chamfer: 0.1, fillet: 0.032, bevel: 0.026 }))
    root.add(prism(m.steel, [0.3, 0.06, 0.32], [x, 2.85, z], { chamfer: 0.05, fillet: 0.018, bevel: 0.014 }))
    root.add(prism(m.graphite, [0.5, 0.5, 0.56], [x, 0.62, z], { chamfer: 0.1, fillet: 0.032, bevel: 0.026 }))
  }
  root.add(prism(m.graphite, [4, 0.18, 2.7], [2, 2.81, -1.5], { chamfer: 0.08, fillet: 0.028, bevel: 0.024 }))
  // Segmented roof armor overlaps the vertical corner towers.
  root.add(prism(m.graphite, [3.2, 0.14, 0.22], [2, 2.93, -0.2], { chamfer: 0.04, fillet: 0.014, bevel: 0.011 }))
  root.add(prism(m.graphite, [3.2, 0.14, 0.22], [2, 2.93, -2.8], { chamfer: 0.04, fillet: 0.014, bevel: 0.011 }))
  for (const x of [0.22, 3.78]) root.add(prism(m.graphite, [0.22, 0.14, 2.4], [x, 2.93, -1.5], { chamfer: 0.04, fillet: 0.014, bevel: 0.011 }))
  for (const x of [0.2, 3.8]) for (const z of [-0.2, -2.8]) root.add(prism(m.graphite, [0.38, 0.14, 0.38], [x, 2.93, z], { chamfer: 0.065, fillet: 0.022, bevel: 0.018 }))
  root.add(prism(m.grime, [3.2, 0.035, 0.025], [2, 0.46, -0.31], { chamfer: 0.008, fillet: 0.004, bevel: 0.003 }))
  for (const x of [0.45, 3.55]) for (const z of [-0.48, -2.52]) root.add(prism(m.steel, [0.08, 0.72, 0.08], [x, 1.02, z], { chamfer: 0.018, fillet: 0.006, bevel: 0.005 }))
  for (const x of [0.18, 3.82]) {
    for (const y of [0.7, 1.55, 2.38]) root.add(prism(m.steel, [0.18, 0.62, 0.055], [x, y, -0.031], { chamfer: 0.025, fillet: 0.009, bevel: 0.007 }))
    root.add(prism(m.graphite, [0.36, 0.42, 0.46], [x, 0.42, -0.31], { chamfer: 0.07, fillet: 0.024, bevel: 0.019 }))
  }
}

function addDoor(root: Group, m: Materials): void {
  // Bar-built surround leaves the center physically recessed rather than stacking
  // two solid coplanar slabs behind the door leaf.
  for (const x of [0.25, 2.19]) root.add(prism(m.graphite, [0.22, 2.42, 0.3], [x, 1.62, -0.18], { chamfer: 0.06, fillet: 0.021, bevel: 0.017 }))
  for (const y of [0.36, 2.88]) root.add(prism(m.graphite, [2.16, 0.22, 0.3], [1.22, y, -0.18], { chamfer: 0.06, fillet: 0.021, bevel: 0.017 }))
  root.add(prism(m.ink, [1.64, 2.34, 0.12], [1.22, 1.58, -0.13], { chamfer: 0.11, fillet: 0.034, bevel: 0.027 }))
  root.add(prism(m.graphite, [1.46, 2.18, 0.08], [1.22, 1.55, -0.08], { chamfer: 0.085, fillet: 0.028, bevel: 0.022 }))
  // A nested, faceted armor stack gives the leaf real depth and service seams
  // while remaining fully captured by the surrounding gasket.
  root.add(prism(m.graphite, [1.2, 1.76, 0.055], [1.22, 1.57, -0.045], { chamfer: 0.095, fillet: 0.03, bevel: 0.024 }))
  root.add(prism(m.graphite, [1.04, 0.68, 0.045], [1.22, 1.17, -0.0175], { chamfer: 0.07, fillet: 0.024, bevel: 0.019 }))
  root.add(prism(m.graphite, [1.04, 0.68, 0.045], [1.22, 1.97, -0.0175], { chamfer: 0.07, fillet: 0.024, bevel: 0.019 }))
  root.add(prism(m.steel, [0.09, 0.7, 0.08], [1.8, 1.55, -0.041], { chamfer: 0.025, fillet: 0.009, bevel: 0.007 }))
  for (const y of [0.72, 1.45, 2.18]) root.add(cylinder(m.steel, 0.065, 0.07, [0.44, y, -0.029], [Math.PI / 2, 0, 0], 10))
  root.add(prism(m.graphite, [0.38, 0.58, 0.12], [2.18, 1.52, -0.09], { chamfer: 0.055, fillet: 0.018, bevel: 0.015 }))
  root.add(prism(m.amber, [0.14, 0.18, 0.035], [2.18, 1.62, -0.019], { chamfer: 0.03, fillet: 0.01, bevel: 0.008 }))
  root.add(prism(m.graphite, [2.08, 0.3, 0.66], [1.22, 0.5, -0.36], { chamfer: 0.065, fillet: 0.022, bevel: 0.018 }))
  root.add(prism(m.steel, [1.54, 0.05, 0.5], [1.22, 0.645, -0.25], { chamfer: 0.038, fillet: 0.013, bevel: 0.01 }))
  root.add(prism(m.ink, [1.16, 0.035, 0.31], [1.22, 0.7, -0.19], { chamfer: 0.025, fillet: 0.009, bevel: 0.007 }))
  for (const x of [0.82, 1.22, 1.62]) root.add(prism(m.steel, [0.045, 0.02, 0.28], [x, 0.694, -0.19], { chamfer: 0.006, fillet: 0.002, bevel: 0.002 }))
  root.add(prism(m.graphite, [0.72, 0.18, 0.12], [1.22, 2.82, -0.1], { chamfer: 0.04, fillet: 0.014, bevel: 0.011 }))
  root.add(prism(m.amber, [0.48, 0.055, 0.008], [1.22, 2.82, -0.016], { chamfer: 0.002, fillet: 0.001, bevel: 0.0008 }))
  // Seated armor panels break up the remaining front shell without random greebles.
  root.add(prism(m.graphite, [0.055, 1.95, 0.04], [2.45, 1.62, -0.021], { chamfer: 0.012, fillet: 0.004, bevel: 0.003 }))
  root.add(prism(m.graphite, [1.15, 0.055, 0.04], [3.08, 1.05, -0.021], { chamfer: 0.012, fillet: 0.004, bevel: 0.003 }))
  root.add(prism(m.graphite, [1.15, 0.055, 0.04], [3.08, 2.12, -0.021], { chamfer: 0.012, fillet: 0.004, bevel: 0.003 }))
  root.add(prism(m.graphite, [0.1, 0.16, 0.04], [0.35, 0.5, -0.021], { chamfer: 0.02, fillet: 0.007, bevel: 0.005 }))
  root.add(prism(m.graphite, [0.1, 1.2, 0.04], [0.35, 1.45, -0.021], { chamfer: 0.02, fillet: 0.007, bevel: 0.005 }))
  root.add(prism(m.graphite, [0.1, 0.4, 0.04], [0.35, 2.55, -0.021], { chamfer: 0.02, fillet: 0.007, bevel: 0.005 }))
  root.add(prism(m.graphite, [0.1, 0.62, 0.04], [2.09, 0.85, -0.021], { chamfer: 0.02, fillet: 0.007, bevel: 0.005 }))
  root.add(prism(m.graphite, [0.1, 0.62, 0.04], [2.09, 2.22, -0.021], { chamfer: 0.02, fillet: 0.007, bevel: 0.005 }))
  // A real door leaf sits inside the throat: a pale raised border, dark gasket,
  // and compound central armor keep it from reading as one flat black plate.
  for (const x of [0.53, 1.91]) root.add(prism(m.graphite, [0.13, 1.96, 0.03], [x, 1.57, -0.035], { chamfer: 0.02, fillet: 0.007, bevel: 0.005 }))
  for (const y of [0.62, 2.52]) root.add(prism(m.graphite, [1.5, 0.13, 0.03], [1.22, y, -0.035], { chamfer: 0.02, fillet: 0.007, bevel: 0.005 }))
  root.add(prism(m.steel, [0.42, 0.055, 0.055], [1.22, 2.08, -0.029], { chamfer: 0.014, fillet: 0.005, bevel: 0.004 }))
  // Side wall panel border and fasteners are mechanically seated in the shell.
  for (const x of [2.55, 3.62]) root.add(prism(m.graphite, [0.055, 1.72, 0.055], [x, 1.58, -0.029], { chamfer: 0.012, fillet: 0.004, bevel: 0.003 }))
  for (const y of [0.78, 2.38]) root.add(prism(m.graphite, [1.12, 0.055, 0.055], [3.08, y, -0.029], { chamfer: 0.012, fillet: 0.004, bevel: 0.003 }))
  for (const [x, y] of [[2.64, 0.88], [3.52, 0.88], [2.64, 2.28], [3.52, 2.28]] as const) root.add(cylinder(m.steel, 0.035, 0.035, [x, y, -0.019], [Math.PI / 2, 0, 0], 9))
}

function addRoofVent(root: Group, m: Materials): void {
  root.add(prism(m.ink, [2.2, 0.06, 1.45], [2.15, 2.965, -1.62], { chamfer: 0.08, fillet: 0.025, bevel: 0.02 }))
  for (let index = 0; index < 13; index += 1) root.add(prism(m.graphite, [0.055, 0.035, 1.15], [1.78 + index * 0.065, 2.982, -1.62], { chamfer: 0.01, fillet: 0.004, bevel: 0.003 }))
  for (const x of [1.12, 3.18]) root.add(cylinder(m.steel, 0.045, 0.035, [x, 2.982, -1.08], [0, 0, 0], 9))
  root.add(prism(m.graphite, [2.65, 0.025, 0.12], [2.15, 2.9625, -0.84], { chamfer: 0.015, fillet: 0.005, bevel: 0.004 }))
  root.add(prism(m.graphite, [2.65, 0.025, 0.12], [2.15, 2.9625, -2.4], { chamfer: 0.015, fillet: 0.005, bevel: 0.004 }))
  root.add(prism(m.graphite, [0.12, 0.025, 1.45], [0.76, 2.9625, -1.62], { chamfer: 0.015, fillet: 0.005, bevel: 0.004 }))
  root.add(prism(m.graphite, [0.12, 0.025, 1.45], [3.54, 2.9625, -1.62], { chamfer: 0.015, fillet: 0.005, bevel: 0.004 }))
  for (const [x, z] of [[0.72, -0.8], [3.58, -0.8], [0.72, -2.42], [3.58, -2.42]] as const) root.add(cylinder(m.amber, 0.045, 0.025, [x, 2.975, z], [0, 0, 0], 9))
}

function addRearService(root: Group, m: Materials): void {
  // Rear service cassette is mounted outside the rear wall on a real backplate.
  for (const [x, y] of [[0.72, 0.82], [3.28, 0.82], [0.72, 2.24], [3.28, 2.24]] as const) root.add(cylinder(m.graphite, 0.06, 0.02, [x, y, -2.78], [Math.PI / 2, 0, 0], 10))
  root.add(prism(m.graphite, [2.95, 1.82, 0.09], [2, 1.53, -2.835], { chamfer: 0.1, fillet: 0.032, bevel: 0.026 }))
  root.add(prism(m.ink, [2.62, 1.5, 0.055], [2, 1.53, -2.9], { chamfer: 0.075, fillet: 0.025, bevel: 0.02 }))
  for (const x of [0.82, 3.18]) root.add(prism(m.steel, [0.08, 1.22, 0.05], [x, 1.53, -2.94], { chamfer: 0.018, fillet: 0.006, bevel: 0.005 }))
  for (const y of [0.88, 2.18]) root.add(prism(m.steel, [2.2, 0.08, 0.05], [2, y, -2.94], { chamfer: 0.018, fillet: 0.006, bevel: 0.005 }))
  for (let index = 0; index < 9; index += 1) root.add(prism(m.graphite, [1.65, 0.045, 0.035], [2, 1.18 + index * 0.075, -2.956], { chamfer: 0.008, fillet: 0.003, bevel: 0.002 }))
  for (const [x, y] of [[0.9, 0.96], [3.1, 0.96], [0.9, 2.1], [3.1, 2.1]] as const) root.add(cylinder(m.steel, 0.045, 0.035, [x, y, -2.97], [Math.PI / 2, 0, 0], 9))
}

function addUtilitySide(root: Group, m: Materials): void {
  // Right-side equipment wall and louvred duct, all sunk into the shell host.
  root.add(prism(m.graphite, [1.5, 0.92, 0.16], [3.9, 2.1, -1.35], { chamfer: 0.08, fillet: 0.025, bevel: 0.02, rotation: [0, Math.PI / 2, 0] }))
  root.add(prism(m.ink, [1.28, 0.7, 0.07], [3.96, 2.1, -1.35], { chamfer: 0.055, fillet: 0.018, bevel: 0.015, rotation: [0, Math.PI / 2, 0] }))
  for (let index = 0; index < 7; index += 1) root.add(prism(m.steel, [1.04, 0.045, 0.035], [3.98, 1.88 + index * 0.075, -1.35], { chamfer: 0.008, fillet: 0.003, bevel: 0.003, rotation: [0, Math.PI / 2, 0] }))
  root.add(prism(m.graphite, [1.94, 1.26, 0.2], [3.73, 1.04, -1.7], { chamfer: 0.11, fillet: 0.035, bevel: 0.028, rotation: [0, Math.PI / 2, 0] }))
  root.add(prism(m.shell, [1.67, 1.02, 0.05], [3.86, 1.04, -1.7], { chamfer: 0.075, fillet: 0.025, bevel: 0.02, rotation: [0, Math.PI / 2, 0] }))
  root.add(prism(m.ink, [1.45, 0.78, 0.03], [3.91, 1.04, -1.7], { chamfer: 0.065, fillet: 0.021, bevel: 0.017, rotation: [0, Math.PI / 2, 0] }))
  root.add(prism(m.graphite, [1.72, 0.15, 0.05], [3.85, 1.59, -1.7], { chamfer: 0.03, fillet: 0.01, bevel: 0.008, rotation: [0, Math.PI / 2, 0] }))
  root.add(prism(m.steel, [1.46, 0.055, 0.02], [3.91, 1.625, -1.7], { chamfer: 0.004, fillet: 0.0015, bevel: 0.001, rotation: [0, Math.PI / 2, 0] }))
  for (const z of [-1.16, -1.56, -1.92, -2.32]) {
    root.add(cylinder(m.steel, 0.15, 0.08, [3.88, 1.3, z], [0, 0, Math.PI / 2], 16))
    root.add(cylinder(m.graphite, 0.105, 0.08, [3.91, 1.3, z], [0, 0, Math.PI / 2], 14))
    root.add(cylinder(m.steel, 0.072, 0.07, [3.935, 1.3, z], [0, 0, Math.PI / 2], 12))
  }
  // Two unmistakable flange-to-flange U manifolds; each endpoint penetrates a
  // concentric collar and the crown is supported by a centered bridge saddle.
  for (const [a, b] of [[-1.16, -1.56], [-1.92, -2.32]] as const) {
    const middle = (a + b) * 0.5
    root.add(pipe(m.steel, [[3.917, 1.3, a], [3.917, 0.96, a], [3.917, 0.76, middle], [3.917, 0.96, b], [3.917, 1.3, b]], 0.075))
    root.add(prism(m.graphite, [0.18, 0.18, 0.06], [3.875, 0.78, middle], { chamfer: 0.035, fillet: 0.012, bevel: 0.009, rotation: [0, Math.PI / 2, 0] }))
  }
  for (const z of [-1.16, -1.56, -1.92, -2.32]) root.add(prism(m.cyan, [0.035, 0.055, 0.17], [3.91, 1.43, z], { chamfer: 0.008, fillet: 0.003, bevel: 0.003, rotation: [0, Math.PI / 2, 0] }))
  root.add(prism(m.grime, [1.58, 0.04, 0.025], [3.93, 0.54, -1.7], { chamfer: 0.008, fillet: 0.003, bevel: 0.003, rotation: [0, Math.PI / 2, 0] }))
}

function build(): { root: Group; materials: Materials; handles: MaterialHandle[]; wear: MeshPhysicalMaterial; geometries: Array<{ dispose: () => void }> } {
  const acquired = makeMaterials(); const m = acquired.materials; const root = new Group()
  addFoundation(root, m); addShell(root, m); addDoor(root, m); addRoofVent(root, m); addRearService(root, m); addUtilitySide(root, m)
  annotateKitAsset(root, 'utility-enclosure', SOCKETS); validateKitMetadata(root)
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>()
  root.updateMatrixWorld(true); bakeOcclusion(root, { reach: 0.21 }); bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'utility-enclosure / baked localized wear', clearcoat: 0.1, clearcoatRoughness: 0.52 })
  root.traverse((o) => { if (o instanceof Mesh && !Array.isArray(o.material) && profiles.has(o.material as MeshPhysicalMaterial)) o.material = wear })
  const mergedGeometries = mergeStaticByMaterial(root, { retainedAttributes: (material) => material === wear ? WEAR_ATTRIBUTES : [], meshName: (material) => `utility-enclosure / ${material.name}` })
  const geometries = mergedGeometries.map((geometry) => {
    const indexed = mergeVertices(geometry, 1e-5)
    root.traverse((object) => { if (object instanceof Mesh && object.geometry === geometry) object.geometry = indexed })
    geometry.dispose()
    return indexed
  })
  return { root, materials: m, handles: acquired.handles, wear, geometries }
}

export function createModel(): { root: Group; update: (deltaSeconds: number) => void; dispose: () => void } {
  const rig = build(); let elapsed = 0
  return { root: rig.root, update: (deltaSeconds) => { elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05); rig.materials.amber.emissiveIntensity = 0.86 + Math.sin(elapsed * 1.4) * 0.09; rig.materials.cyan.emissiveIntensity = 0.66 + Math.sin(elapsed * 1.1 + 0.7) * 0.07 }, dispose: () => { for (const g of rig.geometries) g.dispose(); rig.wear.dispose(); for (const h of rig.handles) h.release() } }
}

function camera(aspect: number, position: Vec3, target: Vec3, fov = 31): PerspectiveCamera { const c = new PerspectiveCamera(fov, aspect, 0.2, 70); c.position.set(...position); c.lookAt(...target); return c }
function makePreview(options: { aspect: number }, view: 'beauty' | 'side' | 'rear' | 'low'): Preview {
  const controller = createModel(); const scene = new Scene(); scene.background = new Color(0x000000); scene.add(controller.root, new HemisphereLight(0x96aab5, 0x050609, 0.46)); const key = new DirectionalLight(0xfff1df, 2.5); key.position.set(-7, 9, 10); const fill = new DirectionalLight(0x7697b3, 0.7); fill.position.set(9, 5, 7); const rim = new DirectionalLight(0x87a7bf, 0.95); rim.position.set(6, 8, -9); scene.add(key, fill, rim)
  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const c = view === 'side' ? camera(aspect, [10, 4.2, -1.5], [2, 1.5, -1.5], 36) : view === 'rear' ? camera(aspect, [7.5, 4.5, -9], [2, 1.5, -1.5], 35) : view === 'low' ? camera(aspect, [7.2, 0.65, 6], [2, 1.35, -1.4], 33) : camera(aspect, [7, 5.2, 6.8], [2, 1.5, -1.45], 31)
  scene.add(c); return { scene, root: controller.root, camera: c, update: controller.update, dispose: () => { scene.remove(controller.root); controller.dispose() } }
}
export function createPreview(options: { aspect: number }): Preview { return makePreview(options, 'beauty') }
export function createSidePreview(options: { aspect: number }): Preview { return makePreview(options, 'side') }
export function createRearPreview(options: { aspect: number }): Preview { return makePreview(options, 'rear') }
export function createLowPreview(options: { aspect: number }): Preview { return makePreview(options, 'low') }
