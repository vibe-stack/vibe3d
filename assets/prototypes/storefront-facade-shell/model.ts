import { Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshPhysicalMaterial, PerspectiveCamera, Scene } from 'three/webgpu'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  MaterialLibrary, WEAR_ATTRIBUTES, bakeOcclusion, bakeSurfaceAttributes, createWearMaterial,
  cylinder, flatPlate, mergeStaticByMaterial, prism,
  tuneMaterial, type MaterialHandle, type Vec3, type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'
import { annotateKitAsset, validateKitMetadata, type KitSocket } from '../axiom-modular-kit/contract.ts'

interface Materials {
  shell: MeshPhysicalMaterial; graphite: MeshPhysicalMaterial; ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial; amber: MeshPhysicalMaterial; cyan: MeshPhysicalMaterial
  magenta: MeshPhysicalMaterial; glass: MeshPhysicalMaterial; grime: MeshPhysicalMaterial
}
interface Preview { scene: Scene; root: Group; camera: PerspectiveCamera; update: (deltaSeconds: number) => void; dispose: () => void }

const SOCKETS: readonly KitSocket[] = [
  { name: 'foundation_front_left', kind: 'foundation', position: [0, 0, 0], normal: [0, -1, 0] },
  { name: 'floor_bay_01', kind: 'floor', position: [1, 0, -0.5], normal: [0, 1, 0] },
  { name: 'floor_bay_02', kind: 'floor', position: [3, 0, -0.5], normal: [0, 1, 0] },
  { name: 'floor_bay_03', kind: 'floor', position: [5, 0, -0.5], normal: [0, 1, 0] },
  { name: 'wall_grid_00', kind: 'wall', position: [0, 2, 0], normal: [0, 0, 1] },
  { name: 'wall_grid_02', kind: 'wall', position: [2, 2, 0], normal: [0, 0, 1] },
  { name: 'wall_grid_04', kind: 'wall', position: [4, 2, 0], normal: [0, 0, 1] },
  { name: 'wall_grid_06', kind: 'wall', position: [6, 2, 0], normal: [0, 0, 1] },
  { name: 'window_bay_left', kind: 'window', position: [1, 1.75, 0], normal: [0, 0, 1], up: [0, 1, 0] },
  { name: 'door_bay_center', kind: 'door', position: [3, 1.5, 0], normal: [0, 0, 1], up: [0, 1, 0] },
  { name: 'window_bay_right', kind: 'window', position: [5, 1.75, 0], normal: [0, 0, 1], up: [0, 1, 0] },
  { name: 'sign_center', kind: 'dressing', position: [3, 3.5, 0], normal: [0, 0, 1] },
  { name: 'awning_center', kind: 'roof-edge', position: [3, 3, 0], normal: [0, 0, 1] },
  { name: 'service_right', kind: 'service', position: [5.75, 1, 0], normal: [0, 0, 1] },
  { name: 'lighting_left', kind: 'dressing', position: [0.25, 2, 0], normal: [0, 0, 1] },
  { name: 'lighting_right', kind: 'dressing', position: [5.75, 2, 0], normal: [0, 0, 1] },
]

function makeMaterials(): { materials: Materials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 9201 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 9202 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'worked', seed: 9203 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 9204 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 9205 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 9206 })
  const magenta = library.acquire({ recipeId: 'MAT-09', palette: 'MAGENTA-400', condition: 'active', seed: 9209 })
  const glass = library.acquire({ recipeId: 'MAT-10', palette: 'CYAN-GLASS', condition: 'maintained', seed: 9207 })
  const grime = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 9208 })
  const result: Materials = {
    shell: tuneMaterial(shell, 0x596267, 0.54, 0.42, { clearcoat: 0.08 }), graphite: tuneMaterial(graphite, 0x20272d, 0.5, 0.7),
    ink: tuneMaterial(ink, 0x070a0d, 0.72, 0.25), steel: tuneMaterial(steel, 0x6f7b80, 0.3, 0.92),
    amber: tuneMaterial(amber, 0xc56a05, 0.22, 0.02, { emissive: 1.0 }), cyan: tuneMaterial(cyan, 0x087a8c, 0.2, 0.02, { emissive: 0.75 }), magenta: tuneMaterial(magenta, 0xb31881, 0.2, 0.02, { emissive: 0.9 }),
    glass: tuneMaterial(glass, 0x385a66, 0.16, 0.03, { clearcoat: 0.62 }), grime: tuneMaterial(grime, 0x28251f, 0.94, 0.05),
  }
  result.glass.transmission = 0; result.glass.transparent = true; result.glass.opacity = 0.38; result.glass.thickness = 0.08; result.glass.ior = 1.42
  return { materials: result, handles: [shell, graphite, ink, steel, amber, cyan, magenta, glass, grime] }
}

function addFoundation(root: Group, m: Materials): void {
  // The chamfered slab's bevel adds roughly 20 mm beyond its nominal Z span;
  // inset the authored slab so the finished mesh—not merely its parameters—fits -1..0.
  root.add(prism(m.graphite, [6, 0.2, 0.96], [3, 0.1, -0.5], { chamfer: 0.06, fillet: 0.022, bevel: 0.018 }))
  root.add(prism(m.grime, [1.65, 0.025, 0.04], [3, 0.26, -0.05], { chamfer: 0.008, fillet: 0.004, bevel: 0.003 }))
}

function addChassis(root: Group, m: Materials): void {
  // Rear host makes the one-metre shell a credible attachment face.
  // This back plate is pre-offset so the complete façade group can recess
  // 220 mm while retaining the exact -1 m authored envelope.
  root.add(prism(m.graphite, [6, 3.8, 0.12], [3, 2.1, -0.64], { chamfer: 0.06, fillet: 0.022, bevel: 0.018 }))
  root.add(prism(m.graphite, [6, 0.82, 0.32], [3, 3.45, -0.42], { chamfer: 0.08, fillet: 0.028, bevel: 0.024 }))
  root.add(prism(m.graphite, [5.72, 0.54, 0.18], [3, 3.47, -0.22], { chamfer: 0.06, fillet: 0.02, bevel: 0.017 }))
  root.add(prism(m.graphite, [5.45, 0.32, 0.08], [3, 3.47, -0.1], { chamfer: 0.045, fillet: 0.016, bevel: 0.012 }))
  // One broad removable sign cassette matches the reference frontage; the
  // perimeter cornice and fastener seams carry the module rhythm.
  root.add(prism(m.graphite, [5.45, 0.5, 0.075], [3, 3.48, -0.055], { chamfer: 0.055, fillet: 0.019, bevel: 0.015 }))
  // Heavy end shoulders and a continuous crown make the sign a load-bearing
  // cassette rather than several trim rails.  They remain behind the front
  // datum and visibly bridge into the two perimeter posts.
  root.add(prism(m.shell, [5.76, 0.14, 0.38], [3, 3.89, -0.25], { chamfer: 0.04, fillet: 0.014, bevel: 0.011 }))
  for (const x of [0.24, 5.76]) {
    root.add(prism(m.shell, [0.34, 0.82, 0.4], [x, 3.47, -0.24], { chamfer: 0.055, fillet: 0.019, bevel: 0.015 }))
    root.add(prism(m.graphite, [0.22, 0.58, 0.1], [x, 3.47, -0.025], { chamfer: 0.032, fillet: 0.011, bevel: 0.008 }))
  }
  for (const x of [0.7, 1.8, 3, 4.2, 5.3]) root.add(prism(m.steel, [0.9, 0.045, 0.07], [x, 3.91, -0.42], { chamfer: 0.018, fillet: 0.006, bevel: 0.005 }))

  for (const x of [0.15, 2, 4, 5.85]) {
    const inner = x === 2 || x === 4
    root.add(prism(m.graphite, [inner ? 0.25 : 0.3, inner ? 3.0 : 3.8, 0.52], [x, inner ? 1.7 : 2.1, -0.28], { chamfer: 0.065, fillet: 0.024, bevel: 0.02 }))
    if (inner) root.add(prism(m.steel, [0.06, 2.7, 0.018], [x, 1.7, -0.009], { chamfer: 0.006, fillet: 0.002, bevel: 0.002 }))
  }
  for (const x of [0.15, 5.85]) {
    root.add(prism(m.graphite, [0.16, 2.1, 0.12], [x, 2.0, -0.061], { chamfer: 0.03, fillet: 0.01, bevel: 0.008 }))
    root.add(prism(m.magenta, [0.07, 1.45, 0.004], [x, 2.05, -0.002], { chamfer: 0.001, fillet: 0.0005, bevel: 0.0004 }))
  }
}

function addWindowBay(root: Group, m: Materials, centerX: number): void {
  // The bay is a true opening. Earlier full rectangular hosts sat in front of
  // the glass and made it read as an opaque board; these four-sided rings leave
  // a real negative-space throat down to the serviced rear host.
  for (const x of [centerX - 0.8, centerX + 0.8]) root.add(prism(m.graphite, [0.18, 2.35, 0.22], [x, 1.72, -0.25], { chamfer: 0.055, fillet: 0.019, bevel: 0.015 }))
  for (const y of [0.63, 2.81]) root.add(prism(m.graphite, [1.46, 0.18, 0.22], [centerX, y, -0.25], { chamfer: 0.055, fillet: 0.019, bevel: 0.015 }))
  for (const x of [centerX - 0.72, centerX + 0.72]) root.add(prism(m.graphite, [0.1, 1.92, 0.1], [x, 1.78, -0.1], { chamfer: 0.025, fillet: 0.009, bevel: 0.007 }))
  for (const y of [0.88, 2.68]) root.add(prism(m.graphite, [1.34, 0.1, 0.1], [centerX, y, -0.1], { chamfer: 0.025, fillet: 0.009, bevel: 0.007 }))
  root.add(prism(m.graphite, [1.56, 0.48, 0.08], [centerX, 0.66, -0.08], { chamfer: 0.05, fillet: 0.018, bevel: 0.014 }))
  root.add(prism(m.graphite, [1.42, 0.23, 0.012], [centerX, 0.66, -0.026], { chamfer: 0.035, fillet: 0.012, bevel: 0.009 }))
  root.add(prism(m.cyan, [1.4, 0.035, 0.028], [centerX, 0.96, -0.02], { chamfer: 0.008, fillet: 0.004, bevel: 0.003 }))
  root.add(prism(m.cyan, [1.4, 0.035, 0.028], [centerX, 2.75, -0.02], { chamfer: 0.008, fillet: 0.004, bevel: 0.003 }))
  // A lit-back shop reveal gives the glazing readable depth in Dawn instead
  // of leaving a flat black board behind the transmissive pane.
  root.add(prism(m.ink, [1.35, 1.48, 0.055], [centerX, 1.91, -0.5], { chamfer: 0.025, fillet: 0.009, bevel: 0.007 }))
  root.add(prism(m.graphite, [1.18, 0.12, 0.26], [centerX, 1.19, -0.55], { chamfer: 0.025, fillet: 0.009, bevel: 0.007 }))
  root.add(prism(m.shell, [1.08, 0.34, 0.035], [centerX, 1.63, -0.466], { chamfer: 0.035, fillet: 0.012, bevel: 0.009 }))
  root.add(prism(m.graphite, [1.08, 0.035, 0.22], [centerX, 1.44, -0.54], { chamfer: 0.01, fillet: 0.004, bevel: 0.003 }))
  root.add(prism(m.glass, [1.36, 1.54, 0.04], [centerX, 1.91, -0.18]))
  // Proud metal mullions and transom physically seat over the glass and key
  // into the surrounding graphite throat.
  root.add(prism(m.graphite, [0.055, 1.56, 0.05], [centerX, 1.91, -0.145], { chamfer: 0.008, fillet: 0.003, bevel: 0.002 }))
  root.add(prism(m.graphite, [1.38, 0.055, 0.05], [centerX, 2.42, -0.145], { chamfer: 0.008, fillet: 0.003, bevel: 0.002 }))
  for (const x of [centerX - 0.68, centerX + 0.68]) root.add(prism(m.graphite, [0.07, 1.72, 0.04], [x, 1.91, -0.05], { chamfer: 0.01, fillet: 0.004, bevel: 0.003 }))
}

function addDoorBay(root: Group, m: Materials): void {
  // True recessed doorway: three nested perimeter rings, never solid slabs.
  for (const x of [2.2, 3.8]) root.add(prism(m.graphite, [0.2, 2.85, 0.28], [x, 1.64, -0.23], { chamfer: 0.06, fillet: 0.021, bevel: 0.016 }))
  for (const y of [0.31, 2.97]) root.add(prism(m.graphite, [1.42, 0.2, 0.28], [3, y, -0.23], { chamfer: 0.06, fillet: 0.021, bevel: 0.016 }))
  for (const x of [2.31, 3.69]) root.add(prism(m.graphite, [0.12, 2.54, 0.12], [x, 1.58, -0.07], { chamfer: 0.03, fillet: 0.01, bevel: 0.008 }))
  for (const y of [0.37, 2.79]) root.add(prism(m.graphite, [1.26, 0.12, 0.12], [3, y, -0.07], { chamfer: 0.03, fillet: 0.01, bevel: 0.008 }))
  for (const x of [2.41, 3.59]) root.add(prism(m.graphite, [0.08, 2.34, 0.08], [x, 1.55, -0.1], { chamfer: 0.022, fillet: 0.007, bevel: 0.005 }))
  for (const y of [0.43, 2.67]) root.add(prism(m.graphite, [1.1, 0.08, 0.08], [3, y, -0.1], { chamfer: 0.022, fillet: 0.007, bevel: 0.005 }))
  root.add(prism(m.steel, [0.075, 0.82, 0.04], [3.48, 1.67, -0.021], { chamfer: 0.018, fillet: 0.006, bevel: 0.005 }))
  root.add(prism(m.steel, [0.08, 0.88, 0.09], [3.5, 1.65, -0.046], { chamfer: 0.025, fillet: 0.009, bevel: 0.007 }))
  root.add(prism(m.graphite, [1.7, 0.16, 0.48], [3, 0.3, -0.25], { chamfer: 0.045, fillet: 0.016, bevel: 0.013 }))
  for (const x of [2.3, 3.7]) root.add(cylinder(m.steel, 0.045, 0.05, [x, 0.32, -0.026], [Math.PI / 2, 0, 0], 9))
  root.add(prism(m.amber, [0.055, 0.34, 0.035], [2.12, 2.35, -0.019], { chamfer: 0.014, fillet: 0.005, bevel: 0.004 }))
  root.add(prism(m.ink, [0.92, 1.5, 0.055], [3, 1.86, -0.5], { chamfer: 0.025, fillet: 0.009, bevel: 0.007 }))
  root.add(prism(m.glass, [0.94, 1.58, 0.04], [3, 1.86, -0.18]))
  // The leaf is a framed glazed door, not a single dark slab: four proud rails
  // capture the glass and a deep U-like pull is seated through two standoffs.
  for (const x of [2.5, 3.5]) root.add(prism(m.graphite, [0.1, 1.72, 0.07], [x, 1.86, -0.13], { chamfer: 0.018, fillet: 0.006, bevel: 0.004 }))
  for (const y of [1.05, 2.67]) root.add(prism(m.graphite, [1.08, 0.1, 0.07], [3, y, -0.13], { chamfer: 0.018, fillet: 0.006, bevel: 0.004 }))
  root.add(prism(m.graphite, [0.075, 0.72, 0.055], [3.39, 1.82, -0.035], { chamfer: 0.017, fillet: 0.006, bevel: 0.004 }))
  for (const y of [1.49, 2.15]) root.add(prism(m.graphite, [0.18, 0.075, 0.14], [3.33, y, -0.09], { chamfer: 0.018, fillet: 0.006, bevel: 0.004 }))
  root.add(prism(m.graphite, [1.05, 0.26, 0.07], [3, 0.75, -0.036], { chamfer: 0.035, fillet: 0.012, bevel: 0.009 }))
  root.add(prism(m.graphite, [0.76, 0.055, 0.055], [3, 0.82, -0.029], { chamfer: 0.014, fillet: 0.005, bevel: 0.004 }))
}

function addCanopyAndService(root: Group, m: Materials): void {
  // The canopy reaches the front datum and is thick enough to read as a
  // supported architectural mass rather than a trim strip.
  root.add(prism(m.graphite, [5.68, 0.32, 0.92], [3, 2.91, -0.48], { chamfer: 0.065, fillet: 0.022, bevel: 0.018 }))
  root.add(prism(m.shell, [5.78, 0.12, 0.86], [3, 3.08, -0.46], { chamfer: 0.045, fillet: 0.016, bevel: 0.013 }))
  root.add(prism(m.graphite, [5.85, 0.2, 0.18], [3, 2.82, -0.12], { chamfer: 0.045, fillet: 0.016, bevel: 0.013 }))
  root.add(prism(m.graphite, [5.72, 0.15, 0.03], [3, 2.82, -0.027], { chamfer: 0.018, fillet: 0.006, bevel: 0.005 }))
  for (const [x, width] of [[1.08, 1.46], [3, 1.68], [4.92, 1.46]] as const) root.add(prism(m.steel, [width, 0.055, 0.012], [x, 2.7, -0.006], { chamfer: 0.004, fillet: 0.0015, bevel: 0.001 }))
  root.add(prism(m.graphite, [5.35, 0.14, 0.7], [3, 2.73, -0.36], { chamfer: 0.045, fillet: 0.016, bevel: 0.012 }))
  for (const x of [0.65, 2.15, 3.85, 5.35]) {
    root.add(prism(m.graphite, [0.18, 0.62, 0.58], [x, 2.69, -0.36], { chamfer: 0.034, fillet: 0.012, bevel: 0.009, rotation: [0, 0, -0.35] }))
    root.add(prism(m.graphite, [0.16, 0.42, 0.24], [x, 2.64, -0.13], { chamfer: 0.027, fillet: 0.009, bevel: 0.007, rotation: [0, 0, -0.42] }))
    root.add(prism(m.graphite, [0.2, 0.48, 0.13], [x, 2.87, -0.36], { chamfer: 0.027, fillet: 0.009, bevel: 0.007 }))
  }
  for (const x of [1, 3, 5]) root.add(prism(m.cyan, [0.9, 0.025, 0.12], [x, 2.77, -0.066], { chamfer: 0.02, fillet: 0.007, bevel: 0.005 }))
  for (const x of [0.75, 2.25, 3.75, 5.25]) root.add(prism(m.steel, [0.08, 0.32, 0.48], [x, 2.76, -0.48], { chamfer: 0.02, fillet: 0.007, bevel: 0.005, rotation: [0, 0, -0.42] }))
  root.add(prism(m.graphite, [0.45, 1.1, 0.18], [5.53, 1.25, -0.1], { chamfer: 0.06, fillet: 0.02, bevel: 0.017 }))
  root.add(prism(m.graphite, [0.25, 0.72, 0.08], [5.53, 1.27, -0.07], { chamfer: 0.035, fillet: 0.012, bevel: 0.009 }))
  for (const y of [1.04, 1.3, 1.56]) root.add(cylinder(m.steel, 0.04, 0.03, [5.53, y, -0.016], [Math.PI / 2, 0, 0], 9))
  root.add(prism(m.graphite, [1.85, 0.2, 0.72], [3, 0.31, -0.41], { chamfer: 0.055, fillet: 0.019, bevel: 0.015 }))
  root.add(prism(m.graphite, [1.64, 0.1, 0.72], [3, 0.46, -0.36], { chamfer: 0.045, fillet: 0.016, bevel: 0.012 }))
  root.add(prism(m.graphite, [1.44, 0.055, 0.58], [3, 0.54, -0.29], { chamfer: 0.032, fillet: 0.011, bevel: 0.008 }))
  // Divide the broad sign into the reference's heavy 2 m panels with a deep border.
  root.add(prism(m.steel, [5.5, 0.055, 0.024], [3, 3.78, -0.012], { chamfer: 0.008, fillet: 0.003, bevel: 0.002 }))
  root.add(prism(m.steel, [5.5, 0.055, 0.024], [3, 3.17, -0.012], { chamfer: 0.008, fillet: 0.003, bevel: 0.002 }))
  for (const x of [2, 4]) root.add(prism(m.steel, [0.045, 0.56, 0.024], [x, 3.48, -0.012], { chamfer: 0.008, fillet: 0.003, bevel: 0.002 }))
  // Full-width compound fascia cap and lower soffit make the sign/awning one
  // supported assembly instead of two thin floating bands.
  root.add(prism(m.graphite, [5.72, 0.13, 0.18], [3, 3.86, -0.18], { chamfer: 0.035, fillet: 0.012, bevel: 0.009 }))
  root.add(prism(m.graphite, [5.72, 0.16, 0.32], [3, 3.08, -0.2], { chamfer: 0.04, fillet: 0.014, bevel: 0.011 }))
  for (const x of [0.9, 2.3, 3.7, 5.1]) root.add(prism(m.cyan, [0.78, 0.025, 0.11], [x, 2.985, -0.12], { chamfer: 0.015, fillet: 0.005, bevel: 0.004 }))
  // Segmented sidewalk/plinth uses the full one-metre prefab depth.
  root.add(prism(m.graphite, [5.72, 0.04, 0.88], [3, 0.22, -0.45], { chamfer: 0.025, fillet: 0.009, bevel: 0.007 }))
  for (const [x, width] of [[0.5, 0.94], [1.5, 0.94], [2.5, 0.94], [3.5, 0.94], [4.5, 0.94], [5.5, 0.94]] as const) {
    root.add(prism(m.shell, [width, 0.18, 0.86], [x, 0.315, -0.43], { chamfer: 0.045, fillet: 0.016, bevel: 0.013 }))
  }
  for (const x of [1, 2, 3, 4, 5]) root.add(flatPlate(m.graphite, [0.025, 0.7], [x, 0.37, -0.43], [-Math.PI / 2, 0, 0], false))
}

function addRearServiceShell(root: Group, m: Materials): void {
  // The rear is a real serviced host face, not one billboard-sized polygon.
  // Each cassette is separated from the structural back by a 30 mm cavity.
  for (const [x, width] of [[1, 1.72], [3, 1.72], [5, 1.72]] as const) {
    root.add(prism(m.shell, [width, 2.35, 0.045], [x, 1.72, -0.965], { chamfer: 0.075, fillet: 0.025, bevel: 0.02 }))
    root.add(prism(m.graphite, [width - 0.2, 0.18, 0.035], [x, 0.62, -0.934], { chamfer: 0.035, fillet: 0.012, bevel: 0.009 }))
    root.add(prism(m.graphite, [width - 0.2, 0.16, 0.035], [x, 2.79, -0.934], { chamfer: 0.03, fillet: 0.01, bevel: 0.008 }))
  }
  for (const x of [0.13, 2, 4, 5.87]) root.add(prism(m.graphite, [0.18, 3.5, 0.055], [x, 2, -0.95], { chamfer: 0.04, fillet: 0.014, bevel: 0.011 }))
  root.add(prism(m.graphite, [0.5, 0.74, 0.05], [5.48, 1.35, -0.93], { chamfer: 0.05, fillet: 0.018, bevel: 0.014 }))
  for (const y of [1.15, 1.36, 1.57]) root.add(cylinder(m.steel, 0.045, 0.035, [5.48, y, -0.898], [Math.PI / 2, 0, 0], 9))
}

function build(): { root: Group; materials: Materials; handles: MaterialHandle[]; wear: MeshPhysicalMaterial; geometries: Array<{ dispose: () => void }> } {
  const acquired = makeMaterials(); const m = acquired.materials; const root = new Group()
  addFoundation(root, m)
  const facade = new Group()
  addChassis(facade, m); addWindowBay(facade, m, 1); addDoorBay(facade, m); addWindowBay(facade, m, 5)
  facade.position.z = -0.22
  root.add(facade)
  addCanopyAndService(root, m); addRearServiceShell(root, m)
  annotateKitAsset(root, 'storefront-facade-shell', SOCKETS); validateKitMetadata(root)
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>()
  root.updateMatrixWorld(true); bakeOcclusion(root, { reach: 0.2 }); bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'storefront / baked localized wear', clearcoat: 0.1, clearcoatRoughness: 0.52 })
  root.traverse((object) => { if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material as MeshPhysicalMaterial)) object.material = wear })
  const mergedGeometries = mergeStaticByMaterial(root, { retainedAttributes: (material) => material === wear ? WEAR_ATTRIBUTES : [], meshName: (material) => `storefront / ${material.name}` })
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
  return { root: rig.root, update: (deltaSeconds) => { elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05); rig.materials.amber.emissiveIntensity = 0.9 + Math.sin(elapsed * 1.5) * 0.1; rig.materials.cyan.emissiveIntensity = 0.68 + Math.sin(elapsed * 1.15 + 0.6) * 0.07; rig.materials.magenta.emissiveIntensity = 0.82 + Math.sin(elapsed * 1.05 + 0.3) * 0.08 }, dispose: () => { for (const g of rig.geometries) g.dispose(); rig.wear.dispose(); for (const handle of rig.handles) handle.release() } }
}

function camera(aspect: number, position: Vec3, target: Vec3, fov = 31): PerspectiveCamera { const c = new PerspectiveCamera(fov, aspect, 0.2, 70); c.position.set(...position); c.lookAt(...target); return c }
function makePreview(options: { aspect: number }, view: 'beauty' | 'side' | 'rear' | 'low' | 'compatibility'): Preview {
  const controller = createModel(); const scene = new Scene(); scene.background = new Color(0x000000); scene.add(controller.root, new HemisphereLight(0x97aab6, 0x050609, 0.46))
  const key = new DirectionalLight(0xfff1df, 2.5); key.position.set(-7, 9, 10); const fill = new DirectionalLight(0x7697b3, 0.7); fill.position.set(9, 5, 7); const rim = new DirectionalLight(0x87a7bf, 0.95); rim.position.set(6, 8, -9); scene.add(key, fill, rim)
  if (view === 'rear') { const rearKey = new DirectionalLight(0xe3edf4, 2.4); rearKey.position.set(3, 7, -9); scene.add(rearKey) }
  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const c = view === 'side' ? camera(aspect, [-7, 3.6, -0.5], [3, 2, -0.5], 32) : view === 'rear' ? camera(aspect, [8, 4.1, -8], [3, 2, -0.5], 32) : view === 'low' ? camera(aspect, [-6.5, 0.75, 7], [3, 1.65, -0.45], 33) : view === 'compatibility' ? camera(aspect, [3, 4.4, 13], [3, 1.9, -0.5], 28) : camera(aspect, [-5.8, 4.1, 8.2], [3, 1.9, -0.5], 27)
  scene.add(c); return { scene, root: controller.root, camera: c, update: controller.update, dispose: () => { scene.remove(controller.root); controller.dispose() } }
}
export function createPreview(options: { aspect: number }): Preview { return makePreview(options, 'beauty') }
export function createSidePreview(options: { aspect: number }): Preview { return makePreview(options, 'side') }
export function createRearPreview(options: { aspect: number }): Preview { return makePreview(options, 'rear') }
export function createLowPreview(options: { aspect: number }): Preview { return makePreview(options, 'low') }
export function createCompatibilityPreview(options: { aspect: number }): Preview { return makePreview(options, 'compatibility') }
