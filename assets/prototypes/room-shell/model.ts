import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Scene,
} from 'three/webgpu'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import {
  WEAR_ATTRIBUTES,
  MaterialLibrary,
  bakeOcclusion,
  bakeSurfaceAttributes,
  createWearMaterial,
  cylinder,
  flatPlate,
  mergeStaticByMaterial,
  prism,
  tuneMaterial,
  type MaterialHandle,
  type Vec3,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'
import {
  annotateKitAsset,
  validateKitMetadata,
  type KitSocket,
} from '../axiom-modular-kit/contract.ts'

interface Materials {
  shell: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
  glass: MeshPhysicalMaterial
  grime: MeshPhysicalMaterial
}

interface Preview {
  scene: Scene
  root: Group
  camera: PerspectiveCamera
  update: (deltaSeconds: number) => void
  dispose: () => void
}

const SOCKETS: readonly KitSocket[] = [
  { name: 'foundation_front_left', kind: 'foundation', position: [0, 0, 0], normal: [0, -1, 0] },
  { name: 'floor_2m_front', kind: 'floor', position: [2, 0, -1], normal: [0, 1, 0] },
  { name: 'floor_2m_rear', kind: 'floor', position: [2, 0, -3], normal: [0, 1, 0] },
  { name: 'ceiling_2m_front', kind: 'ceiling', position: [2, 3, -1], normal: [0, 1, 0] },
  { name: 'ceiling_2m_rear', kind: 'ceiling', position: [2, 3, -3], normal: [0, 1, 0] },
  { name: 'wall_left_3m', kind: 'wall', position: [0, 1.5, -2], normal: [-1, 0, 0], up: [0, 1, 0] },
  { name: 'wall_right_3m', kind: 'wall', position: [4, 1.5, -2], normal: [1, 0, 0], up: [0, 1, 0] },
  { name: 'wall_rear_3m', kind: 'wall', position: [2, 1.5, -4], normal: [0, 0, -1], up: [0, 1, 0] },
  { name: 'door_bay_left', kind: 'door', position: [0, 1.5, -2.75], normal: [-1, 0, 0], up: [0, 1, 0] },
  { name: 'window_bay_rear', kind: 'window', position: [3, 1.5, -4], normal: [0, 0, -1], up: [0, 1, 0] },
  { name: 'service_rear', kind: 'service', position: [1, 1, -4], normal: [0, 0, -1] },
  { name: 'dressing_center', kind: 'dressing', position: [2, 0.25, -2], normal: [0, 1, 0] },
]

function materials(): { materials: Materials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 9101 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 9102 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'worked', seed: 9103 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 9104 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 9105 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 9106 })
  const glass = library.acquire({ recipeId: 'MAT-10', palette: 'CYAN-GLASS', condition: 'maintained', seed: 9107 })
  const grime = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 9108 })
  const result: Materials = {
    shell: tuneMaterial(shell, 0xaeb4b5, 0.48, 0.28, { clearcoat: 0.12 }),
    graphite: tuneMaterial(graphite, 0x222a30, 0.52, 0.65, { clearcoat: 0.08 }),
    ink: tuneMaterial(ink, 0x070a0d, 0.72, 0.25),
    steel: tuneMaterial(steel, 0x6f7b80, 0.3, 0.92),
    amber: tuneMaterial(amber, 0xd46f06, 0.24, 0.02, { emissive: 1.15 }),
    cyan: tuneMaterial(cyan, 0x087e91, 0.2, 0.02, { emissive: 0.85 }),
    glass: tuneMaterial(glass, 0x61747b, 0.12, 0.04, { clearcoat: 0.55 }),
    grime: tuneMaterial(grime, 0x282622, 0.94, 0.06),
  }
  result.glass.transmission = 0.28; result.glass.transparent = true; result.glass.opacity = 0.48; result.glass.thickness = 0.06; result.glass.ior = 1.42
  return { materials: result, handles: [shell, graphite, ink, steel, amber, cyan, glass, grime] }
}

function addFloor(root: Group, m: Materials): void {
  root.add(
    prism(m.graphite, [2.76, 0.2, 2.76], [2, 0.1, -2], { chamfer: 0.06, fillet: 0.025, bevel: 0.02 }),
    prism(m.graphite, [2.62, 0.06, 2.62], [2, 0.23, -2], { chamfer: 0.04, fillet: 0.016, bevel: 0.012 }),
  )
  for (const x of [1, 2, 3]) root.add(flatPlate(m.steel, [0.018, 3.45], [x, 0.282, -2], [-Math.PI / 2, 0, 0], false))
  for (const z of [-1, -2, -3]) root.add(flatPlate(m.steel, [3.45, 0.018], [2, 0.283, z], [-Math.PI / 2, 0, 0], false))
  for (const [x, z] of [[0.28, -0.28], [3.72, -0.28], [0.28, -3.72], [3.72, -3.72]] as const) {
    root.add(cylinder(m.steel, 0.055, 0.05, [x, 0.28, z], [0, 0, 0], 10))
  }
  // Perimeter plinth keeps the usable floor recessed while making the shell properly load-bearing.
  // Pull the structural sill host back and face it with separately seated armor
  // cassettes. Their rear faces meet the host; no broad coplanar overlay exists.
  root.add(prism(m.graphite, [4, 0.52, 0.64], [2, 0.26, -0.36], { chamfer: 0.09, fillet: 0.031, bevel: 0.025 }))
  for (const [x, width] of [[0.34, 0.62], [1.02, 0.66], [1.72, 0.66], [2.42, 0.66], [3.12, 0.66], [3.72, 0.5]] as const) {
    root.add(prism(m.ink, [width, 0.34, 0.08], [x + 0.011, 0.19, -0.045], { chamfer: 0.04, fillet: 0.014, bevel: 0.011 }))
  }
  root.add(prism(m.graphite, [0.48, 0.36, 2.76], [0.31, 0.18, -2], { chamfer: 0.07, fillet: 0.024, bevel: 0.02 }))
  root.add(prism(m.graphite, [0.48, 0.36, 2.76], [3.69, 0.18, -2], { chamfer: 0.07, fillet: 0.024, bevel: 0.02 }))
  for (const z of [-1, -1.67, -2.33, -3]) {
    root.add(prism(m.ink, [0.04, 0.26, 0.62], [0.02, 0.17, z], { chamfer: 0.035, fillet: 0.012, bevel: 0.009 }))
    root.add(prism(m.ink, [0.04, 0.26, 0.62], [3.98, 0.17, z], { chamfer: 0.035, fillet: 0.012, bevel: 0.009 }))
  }
  root.add(prism(m.graphite, [2.76, 0.36, 0.62], [2, 0.18, -3.69], { chamfer: 0.07, fillet: 0.024, bevel: 0.02 }))
  root.add(prism(m.steel, [3.45, 0.045, 0.08], [2, 0.39, -0.58], { chamfer: 0.012, fillet: 0.004, bevel: 0.003 }))
}

function addCeiling(root: Group, m: Materials): void {
  root.add(prism(m.graphite, [4, 0.18, 4], [2, 2.91, -2], { chamfer: 0.06, fillet: 0.025, bevel: 0.02 }))
  root.add(prism(m.shell, [3.64, 0.07, 3.62], [2, 2.62, -2], { chamfer: 0.04, fillet: 0.015, bevel: 0.012 }))
  for (const x of [1, 2, 3]) root.add(flatPlate(m.graphite, [0.018, 3.25], [x, 2.562, -2], [Math.PI / 2, 0, 0], false))
  for (const z of [-1, -2, -3]) root.add(flatPlate(m.graphite, [3.25, 0.018], [2, 2.561, z], [Math.PI / 2, 0, 0], false))
  root.add(prism(m.graphite, [1.35, 0.055, 0.28], [2.15, 2.56, -1.45], { chamfer: 0.04, fillet: 0.015, bevel: 0.012 }))
  root.add(prism(m.amber, [1.12, 0.025, 0.12], [2.15, 2.52, -1.45], { chamfer: 0.025, fillet: 0.009, bevel: 0.008 }))
  // Four deep ceiling service cassettes replace the former broad blank plane.
  for (const [x, z] of [[1.05, -1.1], [2.95, -1.1], [1.05, -2.95], [2.95, -2.95]] as const) {
    root.add(prism(m.graphite, [1.56, 0.05, 1.45], [x, 2.545, z], { chamfer: 0.08, fillet: 0.028, bevel: 0.022 }))
    root.add(prism(m.shell, [1.35, 0.025, 1.24], [x, 2.505, z], { chamfer: 0.055, fillet: 0.019, bevel: 0.015 }))
  }
  // Recessed cassette perimeter and grid are visible from the open front.
  root.add(prism(m.graphite, [3.3, 0.08, 0.14], [2, 2.54, -0.36], { chamfer: 0.025, fillet: 0.009, bevel: 0.007 }))
  root.add(prism(m.graphite, [0.14, 0.08, 3.15], [0.36, 2.54, -2], { chamfer: 0.025, fillet: 0.009, bevel: 0.007 }))
  root.add(prism(m.graphite, [0.14, 0.08, 3.15], [3.64, 2.54, -2], { chamfer: 0.025, fillet: 0.009, bevel: 0.007 }))
}

function addWallPanel(root: Group, m: Materials, position: Vec3, size: Vec3, rotation: Vec3 = [0, 0, 0]): void {
  root.add(prism(m.shell, size, position, { chamfer: 0.05, fillet: 0.018, bevel: 0.015, rotation }))
}

function addWalls(root: Group, m: Materials): void {
  // Rear wall with a 1.5 m clear window bay from x=2.25..3.75.
  addWallPanel(root, m, [1.1425, 1.57, -3.875], [1.785, 2.56, 0.21])
  addWallPanel(root, m, [3, 0.7, -3.875], [1.5, 0.82, 0.21])
  addWallPanel(root, m, [3, 2.56, -3.875], [1.5, 0.52, 0.21])
  // The rear window is a true opening with two stepped perimeter rings.  The
  // previous broad graphite slabs merely painted a window silhouette over the
  // wall and completely hid the glazing from the room.
  for (const [x, h] of [[2.19, 1.72], [3.81, 1.72]] as const) {
    root.add(prism(m.graphite, [0.18, h, 0.14], [x, 1.55, -3.69], { chamfer: 0.045, fillet: 0.016, bevel: 0.012 }))
  }
  for (const y of [0.78, 2.32]) {
    root.add(prism(m.graphite, [1.8, 0.18, 0.14], [3, y, -3.69], { chamfer: 0.045, fillet: 0.016, bevel: 0.012 }))
  }
  for (const x of [2.32, 3.68]) {
    root.add(prism(m.ink, [0.11, 1.35, 0.08], [x, 1.55, -3.55], { chamfer: 0.025, fillet: 0.009, bevel: 0.007 }))
  }
  for (const y of [0.93, 2.17]) {
    root.add(prism(m.ink, [1.47, 0.11, 0.08], [3, y, -3.55], { chamfer: 0.025, fillet: 0.009, bevel: 0.007 }))
  }
  // Unbevelled glazing avoids diagonal facet seams and sits behind the inner
  // gasket rather than sharing one of its face planes.
  root.add(prism(m.glass, [1.3, 1.08, 0.045], [3, 1.55, -3.465]))
  for (const x of [2.19, 3.81]) root.add(prism(m.cyan, [0.045, 0.42, 0.035], [x, 1.55, -3.41], { chamfer: 0.012, fillet: 0.005, bevel: 0.004 }))
  for (const y of [0.65, 1.55, 2.45]) root.add(prism(m.graphite, [1.65, 0.035, 0.035], [1.08, y, -3.73], { chamfer: 0.006, fillet: 0.002, bevel: 0.002 }))
  // Panel spine and lower service rail give the rear shell a real load path.
  root.add(prism(m.graphite, [0.055, 2.08, 0.055], [1.95, 1.57, -3.735], { chamfer: 0.012, fillet: 0.004, bevel: 0.003 }))
  root.add(prism(m.graphite, [0.045, 2.04, 0.05], [1.08, 1.57, -3.73], { chamfer: 0.01, fillet: 0.004, bevel: 0.003 }))
  root.add(prism(m.graphite, [1.62, 0.16, 0.09], [1.08, 0.48, -3.72], { chamfer: 0.035, fillet: 0.012, bevel: 0.009 }))
  root.add(prism(m.cyan, [0.62, 0.025, 0.035], [1.08, 0.5, -3.665], { chamfer: 0.008, fillet: 0.003, bevel: 0.002 }))

  // Right wall uses two 2 m panels on the module rhythm.
  addWallPanel(root, m, [3.855, 1.57, -1.275], [1.45, 2.56, 0.25], [0, Math.PI / 2, 0])
  addWallPanel(root, m, [3.855, 1.57, -2.875], [1.75, 2.56, 0.25], [0, Math.PI / 2, 0])
  for (const z of [-1, -2, -3]) root.add(prism(m.graphite, [0.035, 0.035, 1.55], [3.73, 1.55, z], { chamfer: 0.006, fillet: 0.002, bevel: 0.002 }))
  // Interior cassette borders are real shallow rails, not face-on seam decals.
  // Each rail stands proud of the wall by 20 mm and terminates within its bay.
  for (const [z, span] of [[-1.275, 1.24], [-2.875, 1.54]] as const) {
    for (const y of [0.67, 1.55, 2.43]) root.add(prism(m.graphite, [span, 0.065, 0.052], [3.73, y, z], { chamfer: 0.012, fillet: 0.004, bevel: 0.003, rotation: [0, Math.PI / 2, 0] }))
    root.add(prism(m.graphite, [0.055, 1.7, 0.052], [3.73, 1.55, z], { chamfer: 0.012, fillet: 0.004, bevel: 0.003, rotation: [0, Math.PI / 2, 0] }))
    root.add(prism(m.graphite, [span, 0.15, 0.075], [3.715, 0.49, z], { chamfer: 0.03, fillet: 0.011, bevel: 0.008, rotation: [0, Math.PI / 2, 0] }))
    root.add(prism(m.cyan, [0.52, 0.026, 0.035], [3.665, 0.5, z], { chamfer: 0.008, fillet: 0.003, bevel: 0.002, rotation: [0, Math.PI / 2, 0] }))
  }
  // Exterior right-wall armor follows the same two-bay rhythm. These are
  // intersecting structural rails with visible side walls, not coplanar trim.
  for (const [z, span] of [[-1.275, 1.2], [-2.875, 1.48]] as const) {
    for (const edgeZ of [z - span / 2, z + span / 2]) {
      root.add(prism(m.graphite, [0.04, 1.98, 0.11], [3.98, 1.55, edgeZ], { chamfer: 0.025, fillet: 0.009, bevel: 0.007 }))
    }
    for (const y of [0.56, 1.55, 2.54]) {
      root.add(prism(m.graphite, [0.04, 0.11, span], [3.98, y, z], { chamfer: 0.025, fillet: 0.009, bevel: 0.007 }))
    }
    root.add(prism(m.steel, [0.025, 0.09, span * 0.62], [3.997, 0.7, z], { chamfer: 0.018, fillet: 0.006, bevel: 0.005 }))
  }

  // Left wall is split around the 1.6 x 2.6 m door opening.
  addWallPanel(root, m, [0.145, 1.57, -1.15], [1.2, 2.56, 0.25], [0, Math.PI / 2, 0])
  addWallPanel(root, m, [0.145, 1.57, -3.7], [0.6, 2.56, 0.25], [0, Math.PI / 2, 0])
  addWallPanel(root, m, [0.145, 2.77, -2.75], [1.6, 0.22, 0.25], [0, Math.PI / 2, 0])
  root.add(prism(m.graphite, [1.9, 2.72, 0.2], [0.23, 1.56, -2.75], { chamfer: 0.16, fillet: 0.045, bevel: 0.038, rotation: [0, Math.PI / 2, 0] }))
  root.add(prism(m.graphite, [1.66, 2.48, 0.08], [0.36, 1.5, -2.75], { chamfer: 0.11, fillet: 0.032, bevel: 0.026, rotation: [0, Math.PI / 2, 0] }))
  root.add(prism(m.graphite, [1.5, 2.4, 0.06], [0.43, 1.46, -2.75], { chamfer: 0.09, fillet: 0.028, bevel: 0.022, rotation: [0, Math.PI / 2, 0] }))
  root.add(prism(m.amber, [0.045, 0.3, 0.035], [0.47, 2.52, -1.99], { chamfer: 0.012, fillet: 0.005, bevel: 0.004, rotation: [0, Math.PI / 2, 0] }))

  // The solid left exterior receives a load-bearing service cassette so the
  // side view reads as authored architecture rather than a blank slab.
  for (const z of [-1.7, -0.6]) root.add(prism(m.graphite, [0.04, 1.9, 0.12], [0.02, 1.55, z], { chamfer: 0.025, fillet: 0.009, bevel: 0.007 }))
  for (const y of [0.62, 1.55, 2.48]) root.add(prism(m.graphite, [0.04, 0.12, 1.1], [0.02, y, -1.15], { chamfer: 0.025, fillet: 0.009, bevel: 0.007 }))
  root.add(prism(m.steel, [0.025, 0.12, 0.58], [0.003, 0.75, -1.15], { chamfer: 0.02, fillet: 0.007, bevel: 0.005 }))

  // Front corner posts are subsumed by the deeper structural portal; retaining
  // both created coincident front faces. Rear posts remain explicit and seated.
  // Rear wall cassettes already carry the corner load; duplicate posts would
  // interleave the exact shell face planes at both rear corners.
  // Deep, layered structural portal is the dominant front silhouette in the reference.
  for (const x of [0.25, 3.75]) {
    root.add(prism(m.graphite, [0.5, 2.48, 0.58], [x, 1.53, -0.32], { chamfer: 0.1, fillet: 0.034, bevel: 0.027 }))
    for (const y of [0.72, 2.28]) root.add(prism(m.amber, [0.055, 0.34, 0.008], [x, y, -0.004], { chamfer: 0.002, fillet: 0.001, bevel: 0.0008 }))
    root.add(prism(m.cyan, [0.055, 0.32, 0.008], [x, 1.48, -0.004], { chamfer: 0.002, fillet: 0.001, bevel: 0.0008 }))
  }
  root.add(prism(m.graphite, [3.5, 0.36, 0.58], [2, 2.69, -0.32], { chamfer: 0.09, fillet: 0.031, bevel: 0.025 }))
  root.add(prism(m.cyan, [0.72, 0.035, 0.008], [1.1, 2.66, -0.004], { chamfer: 0.002, fillet: 0.001, bevel: 0.0008 }))
  for (const x of [0.55, 1.35, 2.15, 2.95, 3.62]) root.add(prism(m.steel, [0.58, 0.055, 0.08], [x, 2.96, -0.24], { chamfer: 0.014, fillet: 0.005, bevel: 0.004 }))
  // A nested continuous rim sits inside the broad structural portal. Small
  // status strips remain, but repeated face capsules no longer fragment it.
  for (const x of [0.42, 3.58]) root.add(prism(m.graphite, [0.14, 2.25, 0.12], [x, 1.47, -0.07], { chamfer: 0.03, fillet: 0.01, bevel: 0.008 }))
  root.add(prism(m.graphite, [3.02, 0.14, 0.12], [2, 2.52, -0.07], { chamfer: 0.03, fillet: 0.01, bevel: 0.008 }))
  for (const x of [0.58, 3.42]) root.add(prism(m.graphite, [0.12, 2.04, 0.12], [x, 1.48, -0.07], { chamfer: 0.028, fillet: 0.01, bevel: 0.008 }))
  root.add(prism(m.graphite, [2.96, 0.12, 0.12], [2, 2.46, -0.07], { chamfer: 0.028, fillet: 0.01, bevel: 0.008 }))
  // Angled inner shoulders reproduce the reference portal's clipped upper
  // corners and visibly bridge the vertical jambs into the lintel.
  root.add(prism(m.graphite, [0.16, 0.52, 0.12], [0.71, 2.31, -0.07], { chamfer: 0.025, fillet: 0.009, bevel: 0.007, rotation: [0, 0, -Math.PI / 4] }))
  root.add(prism(m.graphite, [0.16, 0.52, 0.12], [3.29, 2.31, -0.07], { chamfer: 0.025, fillet: 0.009, bevel: 0.007, rotation: [0, 0, Math.PI / 4] }))
  // Continuous corner shoulders establish the connector datum without a row
  // of bright repeated plates competing with the room opening.
  for (const x of [0.2, 3.8]) {
    root.add(prism(m.graphite, [0.4, 0.42, 0.44], [x, 0.43, -0.26], { chamfer: 0.075, fillet: 0.026, bevel: 0.021 }))
  }
  root.add(prism(m.graphite, [3.42, 0.08, 0.14], [2, 2.58, -0.08], { chamfer: 0.02, fillet: 0.007, bevel: 0.005 }))
  // Deep front threshold rails seat the portal into the perimeter foundation.
  root.add(prism(m.graphite, [3.56, 0.18, 0.42], [2, 0.42, -0.22], { chamfer: 0.055, fillet: 0.019, bevel: 0.015 }))
  root.add(prism(m.steel, [3.16, 0.055, 0.23], [2, 0.54, -0.12], { chamfer: 0.035, fillet: 0.012, bevel: 0.009 }))
  for (const x of [0.72, 1.36, 2, 2.64, 3.28]) root.add(prism(m.graphite, [0.035, 0.035, 0.2], [x, 0.58, -0.1], { chamfer: 0.006, fillet: 0.002, bevel: 0.002 }))
  root.add(prism(m.graphite, [3.3, 0.22, 0.12], [2, 2.69, -3.65], { chamfer: 0.03, fillet: 0.01, bevel: 0.008 }))
  root.add(prism(m.graphite, [0.12, 0.22, 3.3], [0.35, 2.69, -2], { chamfer: 0.03, fillet: 0.01, bevel: 0.008 }))
  root.add(prism(m.graphite, [0.12, 0.22, 3.3], [3.65, 2.69, -2], { chamfer: 0.03, fillet: 0.01, bevel: 0.008 }))

  // Service chase and physically recessed utility strip.
  root.add(prism(m.graphite, [0.48, 2.35, 0.18], [0.48, 1.5, -3.71], { chamfer: 0.08, fillet: 0.028, bevel: 0.022 }))
  root.add(prism(m.graphite, [0.28, 1.75, 0.08], [0.48, 1.48, -3.58], { chamfer: 0.05, fillet: 0.018, bevel: 0.014 }))
  for (const y of [0.72, 1.48, 2.2]) root.add(cylinder(m.steel, 0.045, 0.06, [0.48, y, -3.51], [Math.PI / 2, 0, 0], 9))
  root.add(prism(m.grime, [3.45, 0.035, 0.025], [2, 0.34, -3.72], { chamfer: 0.008, fillet: 0.004, bevel: 0.003 }))
  // Closed door leaf on the interior side of the left-wall portal.
  root.add(prism(m.graphite, [1.28, 2.12, 0.035], [0.49, 1.49, -2.75], { chamfer: 0.08, fillet: 0.025, bevel: 0.02, rotation: [0, Math.PI / 2, 0] }))
  root.add(prism(m.graphite, [0.96, 1.72, 0.03], [0.515, 1.49, -2.75], { chamfer: [0.12, 0.12, 0.05, 0.05], fillet: 0.02, bevel: 0.016, rotation: [0, Math.PI / 2, 0] }))
  root.add(prism(m.steel, [0.07, 0.52, 0.035], [0.535, 1.5, -2.2], { chamfer: 0.018, fillet: 0.006, bevel: 0.005, rotation: [0, Math.PI / 2, 0] }))
  // A segmented gasket/armor border makes the leaf removable and keeps every
  // piece seated on the recessed backing plane.
  for (const z of [-3.28, -2.22]) root.add(prism(m.steel, [0.055, 1.82, 0.045], [0.545, 1.49, z], { chamfer: 0.014, fillet: 0.005, bevel: 0.004, rotation: [0, Math.PI / 2, 0] }))
  for (const y of [0.61, 2.37]) root.add(prism(m.steel, [1.02, 0.055, 0.045], [0.545, y, -2.75], { chamfer: 0.014, fillet: 0.005, bevel: 0.004, rotation: [0, Math.PI / 2, 0] }))
  root.add(prism(m.amber, [0.045, 0.34, 0.035], [0.585, 2.26, -2.75], { chamfer: 0.012, fillet: 0.004, bevel: 0.003, rotation: [0, Math.PI / 2, 0] }))
}

function buildRoom(): { root: Group; materials: Materials; handles: MaterialHandle[]; wear: MeshPhysicalMaterial; geometries: Array<{ dispose: () => void }> } {
  const acquired = materials(); const m = acquired.materials
  const root = new Group()
  addFloor(root, m)
  addCeiling(root, m)
  addWalls(root, m)
  annotateKitAsset(root, 'room-shell', SOCKETS)
  validateKitMetadata(root)
  // Broad shell and frame faces stay clean; only metal touch edges receive baked wear.
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>()
  root.updateMatrixWorld(true)
  bakeOcclusion(root, { reach: 0.22 })
  bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'room-shell / baked localized wear', clearcoat: 0.1, clearcoatRoughness: 0.52 })
  root.traverse((object) => {
    if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material as MeshPhysicalMaterial)) object.material = wear
  })
  const mergedGeometries = mergeStaticByMaterial(root, {
    retainedAttributes: (material) => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material) => `room-shell / ${material.name}`,
  })
  const geometries = mergedGeometries.map((geometry) => {
    const indexed = mergeVertices(geometry, 1e-5)
    root.traverse((object) => { if (object instanceof Mesh && object.geometry === geometry) object.geometry = indexed })
    geometry.dispose()
    return indexed
  })
  return { root, materials: m, handles: acquired.handles, wear, geometries }
}

export function createModel(): { root: Group; update: (deltaSeconds: number) => void; dispose: () => void } {
  const rig = buildRoom()
  let elapsed = 0
  return {
    root: rig.root,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      rig.materials.amber.emissiveIntensity = 1.02 + Math.sin(elapsed * 1.4) * 0.12
      rig.materials.cyan.emissiveIntensity = 0.76 + Math.sin(elapsed * 1.1 + 0.8) * 0.08
    },
    dispose: () => {
      for (const geometry of rig.geometries) geometry.dispose()
      rig.wear.dispose()
      for (const handle of rig.handles) handle.release()
    },
  }
}

function camera(aspect: number, position: Vec3, target: Vec3, fov = 32): PerspectiveCamera {
  const result = new PerspectiveCamera(fov, aspect, 0.18, 60)
  result.position.set(...position)
  result.lookAt(...target)
  return result
}

function makePreview(options: { aspect: number }, view: 'beauty' | 'side' | 'rear' | 'low' | 'compatibility'): Preview {
  const controller = createModel()
  const scene = new Scene()
  scene.background = new Color(0x000000)
  scene.add(controller.root, new HemisphereLight(0x9aadb7, 0x050609, 0.48))
  const key = new DirectionalLight(0xfff1df, 2.5); key.position.set(-7, 9, 10)
  const fill = new DirectionalLight(0x7899b5, 0.7); fill.position.set(9, 5, 7)
  const rim = new DirectionalLight(0x88a8c0, 0.95); rim.position.set(6, 8, -9)
  scene.add(key, fill, rim)
  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const previewCamera = view === 'side'
    ? camera(aspect, [-7, 4.2, -2], [2, 1.5, -2])
    : view === 'rear'
      ? camera(aspect, [6.5, 4.2, -8], [2, 1.5, -2])
      : view === 'low'
        ? camera(aspect, [7.2, 0.65, 6.8], [2, 1.35, -2], 34)
        : view === 'compatibility'
          ? camera(aspect, [2, 2.55, 9], [2, 1.35, -2], 31)
          : camera(aspect, [4.15, 3.7, 8.8], [2, 1.38, -2.15], 31)
  scene.add(previewCamera)
  return { scene, root: controller.root, camera: previewCamera, update: controller.update, dispose: () => { scene.remove(controller.root); controller.dispose() } }
}

export function createPreview(options: { aspect: number }): Preview { return makePreview(options, 'beauty') }
export function createSidePreview(options: { aspect: number }): Preview { return makePreview(options, 'side') }
export function createRearPreview(options: { aspect: number }): Preview { return makePreview(options, 'rear') }
export function createLowPreview(options: { aspect: number }): Preview { return makePreview(options, 'low') }
export function createCompatibilityPreview(options: { aspect: number }): Preview { return makePreview(options, 'compatibility') }
