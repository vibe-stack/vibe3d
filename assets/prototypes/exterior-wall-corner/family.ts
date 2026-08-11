import {
  Box3,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Scene,
  Shape,
  Vector3,
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
  type MaterialHandle,
  type Vec3,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'

import {
  MODULE_SPECS,
  annotateKitAsset,
  validateKitMetadata,
  type KitSocket,
} from '../axiom-modular-kit/contract.ts'

export type OwnedModuleId =
  | 'exterior-wall-corner'
  | 'interior-wall-corner'
  | 'wall-end-cap'
  | 'wall-return'
  | 'wall-t-junction'
  | 'gate-lintel'
  | 'gate-post-pair'
  | 'gate-wall-return'

interface FamilyMaterials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  edge: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  blue: MeshPhysicalMaterial
}

function addBox(
  parent: Group,
  material: MeshPhysicalMaterial,
  size: Vec3,
  position: Vec3,
  rotation: Vec3 = [0, 0, 0],
  chamfer = 0.035,
  bevel = 0.014,
): Mesh {
  const mesh = prism(material, size, position, {
    chamfer,
    fillet: Math.min(0.035, chamfer * 0.3),
    bevel,
    rotation,
  })
  parent.add(mesh)
  return mesh
}

function addBolt(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number): void {
  parent.add(cylinder(material, 0.035, 0.022, [x, y, z], [Math.PI * 0.5, 0, 0], 8))
}

function addBoltX(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number): void {
  parent.add(cylinder(material, 0.035, 0.022, [x, y, z], [0, 0, Math.PI * 0.5], 8))
}

function addRunX(parent: Group, m: FamilyMaterials, startX: number, length: number, depth: number, interior: boolean): void {
  const frame = interior ? m.shellShade : m.graphite
  addBox(parent, frame, [length, 3, Math.max(0.09, depth - 0.035)], [startX + length / 2, 1.5, -depth / 2], [0, 0, 0], 0.03, 0.012)
  // The core owns each run's end face. Base/top rails terminate 20 mm short,
  // so their end triangles cannot coincide with the full-height core ends.
  addBox(parent, m.edge, [length - 0.04, 0.34, depth], [startX + length / 2, 0.17, -depth / 2], [0, 0, 0], 0.055, 0.018)
  addBox(parent, m.edge, [length - 0.04, 0.38, depth], [startX + length / 2, 2.81, -depth / 2], [0, 0, 0], 0.055, 0.018)
  const margin = Math.min(0.42, length * 0.21)
  const panelWidth = Math.max(0.12, length - margin * 2)
  // The top shadow rail lives entirely between the vertical frame rails.
  // It no longer crosses their chamfered faces.
  addBox(parent, m.ink, [Math.max(0.12, panelWidth - 0.16), 0.075, 0.05], [startX + length / 2, 2.57, -0.025], [0, 0, 0], 0.012, 0.004)
  // Depth ledger on the +Z facade: host <= -0.036, panel -0.012,
  // seam/frame 0.000, hardware +0.012. Overlapping visible faces are
  // therefore never coplanar or separated by less than 12 mm.
  addBox(parent, m.graphite, [panelWidth + 0.3, 2.4, 0.078], [startX + length / 2, 1.48, -0.075], [0, 0, 0], 0.13, 0.032)
  addBox(parent, m.shell, [Math.max(0.1, panelWidth - 0.08), 1.94, 0.03], [startX + length / 2, 1.48, -0.027], [0, 0, 0], 0.13, 0.03)
  // Terminate the divider well inside the side rails. The former 5 mm
  // clearance let the chamfer skirts overlap the rail chamfers at grazing
  // angles, producing a visible stippled endpoint after batching.
  addBox(parent, m.shellShade, [panelWidth - 0.16, 0.045, 0.012], [startX + length / 2, 1.48, -0.006], [0, 0, 0], 0.008, 0.003)
  for (const x of [startX + margin - 0.045, startX + length - margin + 0.045]) {
    addBox(parent, m.edge, [0.12, 2.36, 0.09], [x, 1.48, -0.045], [0, 0, 0], 0.035, 0.012)
  }
  if (length >= 0.48) for (const x of [startX + margin, startX + length - margin]) for (const y of [0.54, 2.4]) addBolt(parent, m.ink, x, y, -0.006)
  if (length >= 0.9) for (const x of [startX + length * 0.28, startX + length * 0.72]) {
    addBox(parent, m.ink, [0.24, 0.08, 0.025], [x, 0.4, -0.0125], [0, 0, 0], 0.016, 0.004)
    addBox(parent, m.amber, [0.14, 0.032, 0.012], [x, 0.4, -0.007], [0, 0, 0], 0.006, 0.002)
  }
}

function addRunZ(parent: Group, m: FamilyMaterials, length: number, width: number, interior: boolean, x = 0, startZ = 0): void {
  const frame = interior ? m.shellShade : m.graphite
  const centerZ = startZ - length / 2
  addBox(parent, frame, [Math.max(0.09, width - 0.035), 3, length], [x + width / 2, 1.5, centerZ], [0, 0, 0], 0.03, 0.012)
  addBox(parent, m.edge, [width, 0.34, length - 0.04], [x + width / 2, 0.17, centerZ], [0, 0, 0], 0.055, 0.018)
  addBox(parent, m.edge, [width, 0.38, length - 0.04], [x + width / 2, 2.81, centerZ], [0, 0, 0], 0.055, 0.018)
  const margin = Math.min(0.42, length * 0.21)
  const panelLength = Math.max(0.12, length - margin * 2)
  addBox(parent, m.ink, [0.05, 0.075, Math.max(0.12, panelLength - 0.16)], [x + 0.025, 2.57, centerZ], [0, 0, 0], 0.012, 0.004)
  // Mirrored ledger on the -X facade: host >= +0.036, panel +0.012,
  // seam/frame 0.000, hardware -0.012.
  addBox(parent, m.graphite, [0.078, 2.4, panelLength + 0.3], [x + 0.075, 1.48, centerZ], [0, 0, 0], 0.13, 0.032)
  addBox(parent, m.shell, [0.03, 1.94, Math.max(0.1, panelLength - 0.08)], [x + 0.027, 1.48, centerZ], [0, 0, 0], 0.13, 0.03)
  addBox(parent, m.shellShade, [0.012, 0.045, panelLength - 0.16], [x + 0.006, 1.48, centerZ], [0, 0, 0], 0.008, 0.003)
  for (const z of [startZ - margin + 0.045, startZ - length + margin - 0.045]) {
    addBox(parent, m.edge, [0.09, 2.36, 0.12], [x + 0.045, 1.48, z], [0, 0, 0], 0.035, 0.012)
  }
  if (panelLength > 0.32) for (const pz of [startZ - margin, startZ - length + margin]) for (const y of [0.54, 2.4]) addBoltX(parent, m.ink, x + 0.006, y, pz)
  if (length >= 0.9) for (const z of [startZ - length * 0.28, startZ - length * 0.72]) {
    addBox(parent, m.ink, [0.025, 0.08, 0.24], [x + 0.0125, 0.4, z], [0, 0, 0], 0.016, 0.004)
    addBox(parent, m.amber, [0.012, 0.032, 0.14], [x + 0.007, 0.4, z], [0, 0, 0], 0.006, 0.002)
  }
}

function addFacetedCornerArmor(parent: Group, m: FamilyMaterials, exterior: boolean): void {
  // The corner armor is authored as three non-overlapping vertical masses.
  // Earlier crossed L plates and clamp overlays shared large facade regions;
  // after merging those coincident triangles visibly stippled at Dawn grazing
  // angles. These masses replace the host corner, sit 12 mm proud, and leave
  // a visible seam while the load-bearing center still seats on both collars.
  // Recess the central load core, then build the two visible service faces
  // from disjoint x/z lanes. This restores a deep corner chase without
  // putting trim on top of a host face.
  addBox(parent, m.graphite, [0.46, 2.2, 0.46], [0.27, 1.5, -0.27], [0, 0, 0], 0.105, 0.028)
  addBox(parent, m.ink, [0.2, 1.72, 0.03], [0.27, 1.5, -0.015], [0, 0, 0], 0.05, 0.015)
  addBox(parent, m.ink, [0.03, 1.72, 0.2], [0.015, 1.5, -0.27], [0, 0, 0], 0.05, 0.015)
  if (!exterior) {
    for (const x of [0.09, 0.45]) addBox(parent, m.edge, [0.1, 1.9, 0.03], [x, 1.5, -0.006], [0, 0, 0], 0.032, 0.01)
    for (const z of [-0.09, -0.45]) addBox(parent, m.edge, [0.03, 1.9, 0.1], [-0.009, 1.5, z], [0, 0, 0], 0.032, 0.01)
    addBox(parent, m.graphite, [0.18, 0.28, 0.03], [0.27, 1.5, -0.006], [0, 0, 0], 0.04, 0.012)
    addBox(parent, m.amber, [0.07, 0.1, 0.018], [0.27, 1.5, -0.007], [0, 0, 0], 0.014, 0.004)
    addBox(parent, m.edge, [0.7, 0.4, 0.7], [0.338, 0.2, -0.338], [0, 0, 0], 0.11, 0.03)
    addBox(parent, m.edge, [0.7, 0.4, 0.7], [0.338, 2.8, -0.338], [0, 0, 0], 0.11, 0.03)
    return
  }
  for (const x of [0.09, 0.45]) addBox(parent, m.edge, [0.1, 1.45, 0.03], [x, 1.5, -0.006], [0, 0, 0], 0.032, 0.01)
  for (const z of [-0.09, -0.45]) addBox(parent, m.edge, [0.03, 1.45, 0.1], [-0.009, 1.5, z], [0, 0, 0], 0.032, 0.01)
  for (const [x, y, rz] of [[0.16, 2.35, -0.45], [0.38, 2.35, 0.45], [0.16, 0.65, 0.45], [0.38, 0.65, -0.45]] as const) {
    addBox(parent, m.edge, [0.11, 0.48, 0.03], [x, y, -0.006], [0, 0, rz], 0.032, 0.01)
  }
  addBox(parent, m.edge, [0.7, 0.4, 0.7], [0.338, 0.2, -0.338], [0, 0, 0], 0.11, 0.03)
  addBox(parent, m.edge, [0.7, 0.4, 0.7], [0.338, 2.8, -0.338], [0, 0, 0], 0.11, 0.03)
  // Seated service markers break the tall chase into the same load-bearing
  // rhythm as the reference. Each marker has its own dark socket and remains
  // clear of the long side rails.
  for (const y of [0.54, 1.5, 2.46]) {
    addBox(parent, m.graphite, [0.18, 0.2, 0.045], [0.27, y, -0.0225], [0, 0, 0], 0.035, 0.01)
    addBox(parent, m.amber, [0.09, 0.055, 0.018], [0.27, y, -0.007], [0, 0, 0], 0.014, 0.004)
  }
}

function addReturnPipeSpine(parent: Group, m: FamilyMaterials): void {
  addBox(parent, m.graphite, [0.5, 2.2, 0.5], [0.29, 1.5, -0.29], [0, 0, 0], 0.1, 0.028)
  for (const x of [0.23, 0.35]) parent.add(cylinder(m.graphite, 0.042, 1.55, [x, 1.5, -0.012], [0, 0, 0], 10))
  for (const y of [0.82, 1.5, 2.18]) addBox(parent, m.edge, [0.28, 0.12, 0.04], [0.29, y, -0.011], [0, 0, 0], 0.028, 0.009)
  for (const y of [0.5, 2.5]) {
    addBox(parent, m.graphite, [0.22, 0.22, 0.04], [0.29, y, -0.011], [0, 0, 0], 0.04, 0.012)
    addBox(parent, m.amber, [0.07, 0.1, 0.018], [0.29, y, -0.007], [0, 0, 0], 0.014, 0.004)
  }
  addBox(parent, m.edge, [0.72, 0.4, 0.72], [0.34, 0.2, -0.34], [0, 0, 0], 0.11, 0.03)
  addBox(parent, m.edge, [0.72, 0.4, 0.72], [0.34, 2.8, -0.34], [0, 0, 0], 0.11, 0.03)
}

function addEndCap(parent: Group, m: FamilyMaterials): void {
  // Continuous reference-led C shell. The pale wall and both arms share real
  // contact planes; the dark throat sits behind them and never skins a host.
  // The module is only 0.5 m wide by contract, so the cavity consumes the
  // outboard half of that full envelope instead of being reduced to a trim gap.
  const shellProfile = new Shape()
  shellProfile.moveTo(0.012, 0.18)
  shellProfile.lineTo(0.488, 0.18)
  shellProfile.lineTo(0.488, 0.5)
  shellProfile.lineTo(0.35, 0.5)
  shellProfile.lineTo(0.29, 0.58)
  shellProfile.lineTo(0.23, 0.58)
  shellProfile.lineTo(0.23, 2.42)
  shellProfile.lineTo(0.29, 2.42)
  shellProfile.lineTo(0.35, 2.5)
  shellProfile.lineTo(0.488, 2.5)
  shellProfile.lineTo(0.488, 2.82)
  shellProfile.lineTo(0.012, 2.82)
  shellProfile.closePath()
  const shellGeometry = new ExtrudeGeometry(shellProfile, {
    depth: 0.211,
    steps: 1,
    curveSegments: 1,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 1,
  })
  shellGeometry.translate(0, 0, -0.2305)
  parent.add(new Mesh(shellGeometry, m.shell))
  addBox(parent, m.edge, [0.5, 0.11, 0.25], [0.25, 0.055, -0.125], [0, 0, 0], 0.035, 0.011)
  addBox(parent, m.graphite, [0.46, 0.07, 0.22], [0.27, 0.145, -0.125], [0, 0, 0], 0.022, 0.007)
  addBox(parent, m.graphite, [0.46, 0.07, 0.22], [0.27, 2.855, -0.125], [0, 0, 0], 0.022, 0.007)
  addBox(parent, m.edge, [0.5, 0.11, 0.25], [0.25, 2.945, -0.125], [0, 0, 0], 0.035, 0.011)

  // Broad load wall on the closed side and a deep side blade at the throat.
  addBox(parent, m.graphite, [0.205, 1.82, 0.035], [0.1075, 1.5, -0.0175], [0, 0, 0], 0.028, 0.009)
  // Three disjoint facade cassettes expose the graphite reveal between them;
  // this authors real seams instead of laying divider strips over one panel.
  for (const [y, height] of [[0.91, 0.5], [1.53, 0.62], [2.13, 0.46]] as const) {
    addBox(parent, m.shell, [0.17, height, 0.024], [0.0975, y, 0.002], [0, 0, 0], 0.015, 0.005)
  }
  addBox(parent, m.edge, [0.025, 1.84, 0.028], [0.2075, 1.5, -0.003], [0, 0, 0], 0.008, 0.003)
  addBox(parent, m.graphite, [0.04, 1.76, 0.18], [0.25, 1.5, -0.13], [0, 0, 0], 0.025, 0.008)
  addBox(parent, m.ink, [0.035, 1.52, 0.06], [0.2875, 1.5, -0.205], [0, 0, 0], 0.018, 0.005)

  // Continuous overhead arm and crown, mirrored from the base. The pale arms
  // meet the load wall over a 230 mm lane, while diagonal graphite knees carry
  // the open half rather than leaving the tiers apparently suspended.
  for (const y of [0.555, 2.445]) {
    addBox(parent, m.graphite, [0.06, 0.05, 0.15], [0.26, y, -0.16], [0, 0, 0], 0.018, 0.005)
  }
  addBox(parent, m.ink, [0.21, 0.05, 0.18], [0.395, 0.555, -0.125], [0, 0, 0], 0.02, 0.006)
  addBox(parent, m.shell, [0.19, 0.025, 0.145], [0.395, 0.5925, -0.125], [0, 0, 0], 0.016, 0.005)
  addBox(parent, m.ink, [0.21, 0.05, 0.18], [0.395, 2.445, -0.125], [0, 0, 0], 0.02, 0.006)
  addBox(parent, m.shell, [0.19, 0.025, 0.145], [0.395, 2.4075, -0.125], [0, 0, 0], 0.016, 0.005)

  // Rear throat rail, captured at both arms, provides depth without closing
  // the open profile. It is recessed to the -Z wall and is only visible from
  // the intended three-quarter camera.
  addBox(parent, m.graphite, [0.055, 1.58, 0.055], [0.4625, 1.5, -0.215], [0, 0, 0], 0.02, 0.006)
  for (const y of [0.66, 1.5, 2.34]) addBox(parent, m.edge, [0.1, 0.13, 0.08], [0.425, y, -0.195], [0, 0, 0], 0.01, 0.004)

  // Small seam lamps and fasteners remain physically seated on the wall edge.
  for (const y of [0.72, 1.5, 2.28]) addBox(parent, m.amber, [0.014, 0.07, 0.012], [0.2075, y, 0.005], [0, 0, 0], 0.004, 0.001)
  for (const y of [0.82, 1.5, 2.18]) parent.add(cylinder(m.ink, 0.009, 0.01, [0.09, y, 0.004], [Math.PI * 0.5, 0, 0], 8))
}

function addTJunctionArmX(parent: Group, m: FamilyMaterials, startX: number, length: number): void {
  const centerX = startX + length / 2
  // A complete wall bay terminates into the central machine.  The large pale
  // cassette is genuinely inset within a deep graphite perimeter; it is not
  // a stack of small pill panels on a slab.
  addBox(parent, m.graphite, [length, 2.26, 0.19], [centerX, 1.5, -0.155], [0, 0, 0], 0.045, 0.014)
  addBox(parent, m.edge, [length - 0.08, 1.96, 0.07], [centerX, 1.53, -0.052], [0, 0, 0], 0.07, 0.02)
  addBox(parent, m.shell, [length - 0.24, 1.5, 0.026], [centerX, 1.55, -0.009], [0, 0, 0], 0.065, 0.018)
  addBox(parent, m.graphite, [length - 0.18, 0.16, 0.04], [centerX, 2.46, -0.025], [0, 0, 0], 0.025, 0.008)
  addBox(parent, m.amber, [length - 0.3, 0.055, 0.018], [centerX, 2.46, -0.007], [0, 0, 0], 0.01, 0.003)
  addBox(parent, m.graphite, [length - 0.18, 0.14, 0.04], [centerX, 0.54, -0.025], [0, 0, 0], 0.025, 0.008)
  for (const x of [startX + 0.09, startX + length - 0.09]) {
    addBox(parent, m.edge, [0.11, 1.86, 0.085], [x, 1.5, -0.0475], [0, 0, 0], 0.03, 0.009)
    for (const y of [0.58, 2.42]) addBolt(parent, m.ink, x, y, -0.006)
  }
}

function addTJunctionPlanLayer(
  parent: Group,
  material: MeshPhysicalMaterial,
  y: number,
  height: number,
  inset: number,
): void {
  // One continuous T-plan extrusion makes the load path unmistakable from
  // above and from both grazing directions.  It replaces the former stack of
  // unrelated rounded boxes at every arm/hub boundary.
  const shape = new Shape()
  const x0 = 0.012 + inset
  const x1 = 1.988 - inset
  const front = 0.238 - inset
  const branchLeft = 0.62 + inset
  const branchRight = 1.38 - inset
  const back = 1.988 - inset
  shape.moveTo(x0, 0.012 + inset)
  shape.lineTo(x1, 0.012 + inset)
  shape.lineTo(x1, front)
  shape.lineTo(branchRight, front)
  shape.lineTo(branchRight, back)
  shape.lineTo(branchLeft, back)
  shape.lineTo(branchLeft, front)
  shape.lineTo(x0, front)
  shape.closePath()
  const geometry = new ExtrudeGeometry(shape, {
    depth: height,
    steps: 1,
    curveSegments: 1,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.018,
    bevelSegments: 1,
  })
  geometry.rotateX(-Math.PI * 0.5)
  geometry.translate(0, y, 0)
  parent.add(new Mesh(geometry, material))
}

function addTJunction(parent: Group, m: FamilyMaterials): void {
  // The side bays terminate at a deliberately wide central machine.  This
  // breadth, plus the separate south branch, makes the T silhouette legible
  // before any panel detail is considered.
  addTJunctionArmX(parent, m, 0, 0.58)
  addTJunctionArmX(parent, m, 1.42, 0.58)

  // South branch: a continuous recessed core with complete framed cassettes
  // on BOTH exposed side faces.  Its crown/plinth physically meet the hub at
  // z=-0.66 and carry through to the wall socket at z=-2.
  addBox(parent, m.graphite, [0.62, 2.22, 1.32], [1, 1.5, -1.34], [0, 0, 0], 0.05, 0.015)
  for (const x of [0.67, 1.33]) {
    addBox(parent, m.edge, [0.065, 1.96, 1.2], [x, 1.52, -1.36], [0, 0, 0], 0.07, 0.02)
    // Outer-facing cassettes. The previous sign error put these on the inner
    // face of each frame, leaving the diagnostic side/rear as a plain dark
    // slab. Two disjoint pale cells now expose a real lower service rail.
    const outwardX = x < 1 ? -0.045 : 0.045
    addBox(parent, m.shell, [0.026, 1.02, 0.92], [x + outwardX, 1.78, -1.36], [0, 0, 0], 0.06, 0.018)
    addBox(parent, m.shell, [0.026, 0.4, 0.92], [x + outwardX, 0.88, -1.36], [0, 0, 0], 0.055, 0.016)
    addBox(parent, m.shellShade, [0.09, 0.12, 1.08], [x, 2.56, -1.36], [0, 0, 0], 0.035, 0.01)
    addBox(parent, m.edge, [0.09, 0.14, 1.08], [x, 0.45, -1.36], [0, 0, 0], 0.035, 0.01)
    for (const z of [-0.82, -1.9]) addBoltX(parent, m.ink, x + (x < 1 ? -0.041 : 0.041), 0.58, z)
  }

  // Broad three-way crown and plinth, each authored as two continuous T-plan
  // solids. The inset pale tier leaves a dark structural reveal around all
  // three arms and visually locks the wall bays to the branch.
  addTJunctionPlanLayer(parent, m.edge, 0, 0.2, 0)
  addTJunctionPlanLayer(parent, m.graphite, 0.2, 0.18, 0.045)
  addTJunctionPlanLayer(parent, m.graphite, 2.62, 0.18, 0.045)
  addTJunctionPlanLayer(parent, m.shellShade, 2.8, 0.2, 0)

  // Tiered central face: wide load shoulders flank a genuinely recessed
  // service chase.  All depth planes differ by >= 12 mm and each trim has a
  // visible sidewall, avoiding the earlier merged-face stipple.
  addBox(parent, m.graphite, [0.78, 2.08, 0.48], [1, 1.5, -0.34], [0, 0, 0], 0.08, 0.024)
  addBox(parent, m.shellShade, [0.58, 0.16, 0.2], [1, 2.51, -0.1], [0, 0, 0], 0.045, 0.014)
  addBox(parent, m.edge, [0.58, 0.16, 0.2], [1, 0.53, -0.1], [0, 0, 0], 0.045, 0.014)
  for (const x of [0.7, 1.3]) {
    addBox(parent, m.shell, [0.18, 1.82, 0.16], [x, 1.52, -0.075], [0, 0, 0], 0.055, 0.016)
    addBox(parent, m.edge, [0.09, 1.98, 0.13], [x + (x < 1 ? -0.115 : 0.115), 1.5, -0.08], [0, 0, 0], 0.03, 0.009)
    addBox(parent, m.shellShade, [0.22, 0.24, 0.2], [x, 2.43, -0.105], [0, 0, x < 1 ? -0.24 : 0.24], 0.045, 0.014)
    addBox(parent, m.edge, [0.22, 0.24, 0.2], [x, 0.57, -0.105], [0, 0, x < 1 ? 0.24 : -0.24], 0.045, 0.014)
  }
  addBox(parent, m.ink, [0.28, 1.76, 0.12], [1, 1.5, -0.085], [0, 0, 0], 0.05, 0.015)

  // The pipe is swallowed by both port blocks and three rigid clamps.
  parent.add(cylinder(m.graphite, 0.042, 1.28, [1, 1.5, -0.012], [0, 0, 0], 10))
  for (const y of [0.88, 1.5, 2.12]) addBox(parent, m.edge, [0.18, 0.1, 0.1], [1, y, -0.045], [0, 0, 0], 0.022, 0.007)
  for (const y of [0.7, 2.3]) {
    addBox(parent, m.edge, [0.24, 0.25, 0.16], [1, y, -0.07], [0, 0, 0], 0.045, 0.014)
    addBox(parent, m.amber, [0.09, 0.06, 0.024], [1, y, 0.007], [0, 0, 0], 0.014, 0.004)
  }
}

function addGatePost(parent: Group, m: FamilyMaterials, x: number, height: number): void {
  const left = x < 3
  const worldX = (u: number): number => x + (left ? u : 1 - u)

  // A single extruded armor profile establishes the defining continuous
  // sloped tower silhouette.  Outboard shoulder, waist and lower buttress are
  // one load-bearing shell instead of three stacked rounded boxes.
  const tower = new Shape()
  tower.moveTo(0.06, 0.52)
  tower.lineTo(0.06, 0.95)
  tower.lineTo(0.18, 1.22)
  tower.lineTo(0.18, 3.14)
  tower.lineTo(0.06, 3.42)
  tower.lineTo(0.06, 3.69)
  tower.lineTo(0.23, 3.94)
  tower.lineTo(0.58, 3.94)
  tower.lineTo(0.7, 3.73)
  tower.lineTo(0.7, 0.72)
  tower.lineTo(0.62, 0.52)
  tower.closePath()
  const towerGeometry = new ExtrudeGeometry(tower, {
    depth: 0.84,
    steps: 1,
    curveSegments: 1,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 1,
  })
  if (!left) towerGeometry.scale(-1, 1, 1)
  towerGeometry.translate(left ? x : x + 1, 0, -0.92)
  parent.add(new Mesh(towerGeometry, m.shell))

  // Wide grounded outrigger: two adjacent structural feet occupy the full
  // one-metre jamb envelope and physically support shell and guide machinery.
  addBox(parent, m.edge, [1, 0.18, 1], [x + 0.5, 0.09, -0.5], [0, 0, 0], 0.075, 0.022)
  addBox(parent, m.shellShade, [0.66, 0.34, 0.88], [worldX(0.34), 0.35, -0.5], [0, 0, left ? -0.16 : 0.16], 0.08, 0.024)
  addBox(parent, m.edge, [0.3, 0.4, 0.88], [worldX(0.84), 0.38, -0.5], [0, 0, 0], 0.07, 0.02)

  // Inner gate machinery is a deep fixed bed, followed vertically by a
  // separate captured head. Their contact plane is explicit at y=3.16.
  addBox(parent, m.graphite, [0.28, 2.58, 0.76], [worldX(0.84), 1.87, -0.5], [0, 0, 0], 0.065, 0.019)
  addBox(parent, m.edge, [0.32, 0.5, 0.82], [worldX(0.84), 3.41, -0.5], [0, 0, left ? -0.12 : 0.12], 0.075, 0.022)
  addBox(parent, m.graphite, [0.3, 0.22, 0.26], [worldX(0.84), 3.66, -0.21], [0, 0, 0], 0.05, 0.015)

  // Three continuous guide rails sit in front of the bed and terminate in
  // the upper/lower capture housings. Four cross collars swallow all rails.
  const rails = [0.735, 0.84, 0.945]
  for (const u of rails) addBox(parent, m.edge, [0.055, 2.42, 0.07], [worldX(u), 1.9, -0.055], [0, 0, 0], 0.018, 0.006)
  for (const y of [0.72, 1.4, 2.08, 2.76]) {
    addBox(parent, m.graphite, [0.27, 0.13, 0.1], [worldX(0.84), y, -0.05], [0, 0, 0], 0.03, 0.009)
  }
  addBox(parent, m.ink, [0.28, 0.22, 0.11], [worldX(0.84), 0.56, -0.055], [0, 0, 0], 0.04, 0.012)

  // Outboard service anatomy is seated proud of the continuous shell by a
  // visible 25 mm ledge. Panels remain selective so the shell reads as one
  // authored tower rather than a collage of access plates.
  addBox(parent, m.graphite, [0.28, 0.78, 0.05], [worldX(0.34), 1.72, -0.04], [0, 0, 0], 0.05, 0.015)
  addBox(parent, m.graphite, [0.3, 0.5, 0.05], [worldX(0.34), 2.92, -0.04], [0, 0, 0], 0.05, 0.015)
  addBox(parent, m.edge, [0.5, 0.22, 0.1], [worldX(0.34), 2.5, -0.055], [0, 0, 0], 0.045, 0.014)
  for (const u of [0.17, 0.51]) addBox(parent, m.amber, [0.075, 0.11, 0.026], [worldX(u), 2.5, -0.007], [0, 0, 0], 0.014, 0.004)

  // The cyan foot socket and its amber service wedge are recessed into the
  // broad outboard housing. Beacon base and lens share a vertical contact.
  addBox(parent, m.ink, [0.44, 0.2, 0.07], [worldX(0.34), 0.34, -0.04], [0, 0, 0], 0.045, 0.014)
  addBox(parent, m.blue, [0.3, 0.11, 0.026], [worldX(0.34), 0.34, -0.007], [0, 0, 0], 0.02, 0.006)
  addBox(parent, m.amber, [0.12, 0.09, 0.026], [worldX(0.59), 0.55, -0.007], [0, 0, 0], 0.016, 0.005)
  parent.add(cylinder(m.ink, 0.09, 0.05, [x + 0.5, height - 0.075, -0.5], [0, 0, 0], 12))
  parent.add(cylinder(m.amber, 0.06, 0.05, [x + 0.5, height - 0.025, -0.5], [0, 0, 0], 12))
  return

  const innerX = x + (left ? 0.77 : 0.23)
  const outerX = x + (left ? 0.31 : 0.69)
  addBox(parent, m.edge, [0.72, height - 1.02, 0.9], [x + 0.5, height / 2 + 0.02, -0.52], [0, 0, 0], 0.105, 0.028)
  addBox(parent, m.shell, [0.68, height - 1.22, 0.84], [x + 0.5, height / 2 + 0.06, -0.47], [0, 0, 0], 0.1, 0.026)
  addBox(parent, m.edge, [1, 0.62, 1], [x + 0.5, 0.31, -0.5], [0, 0, 0], 0.12, 0.034)
  addBox(parent, m.shellShade, [0.88, 0.48, 0.9], [x + 0.5, 0.54, -0.5], [0, 0, 0], 0.105, 0.028)
  addBox(parent, m.shell, [0.98, 1.02, 0.9], [x + 0.5, height - 0.57, -0.5], [0, 0, 0], 0.15, 0.038)
  addBox(parent, m.shell, [0.78, 0.72, 0.92], [x + 0.5, height - 0.72, -0.46], [0, 0, left ? -0.12 : 0.12], 0.13, 0.034)
  addBox(parent, m.shell, [0.42, 0.9, 0.78], [x + (left ? 0.28 : 0.72), height - 1.06, -0.48], [0, 0, left ? -0.22 : 0.22], 0.09, 0.026)
  addBox(parent, m.shell, [0.45, 0.94, 0.82], [x + (left ? 0.27 : 0.73), 0.93, -0.49], [0, 0, left ? 0.25 : -0.25], 0.095, 0.026)

  addBox(parent, m.graphite, [0.58, height - 0.76, 0.18], [innerX, height / 2, -0.14], [0, 0, 0], 0.075, 0.022)
  for (const offset of [-0.14, 0, 0.14]) {
    addBox(parent, offset === 0 ? m.ink : m.edge, [0.1, height - 0.92, 0.11], [innerX + offset, height / 2 - 0.03, -0.04], [0, 0, 0], 0.026, 0.008)
  }
  addBox(parent, m.edge, [0.54, 0.48, 0.22], [innerX, height - 0.7, -0.115], [0, 0, 0], 0.09, 0.026)
  addBox(parent, m.graphite, [0.34, 0.3, 0.21], [innerX, height - 0.48, -0.11], [0, 0, 0], 0.065, 0.018)
  for (const y of [0.72, 1.48, 2.24, height - 0.72]) addBox(parent, m.edge, [0.5, 0.18, 0.2], [innerX, y, -0.1], [0, 0, 0], 0.045, 0.014)

  const panelYs = height > 3.2 ? [1.34, 2.22, 3.03] : [1.18, 1.93, 2.52]
  for (const y of panelYs) addBox(parent, m.shell, [0.38, 0.66, 0.095], [outerX, y, -0.048], [0, 0, 0], 0.065, 0.018)
  addBox(parent, m.shellShade, [0.34, 0.12, 0.11], [outerX, 0.89, -0.055], [0, 0, left ? -0.12 : 0.12], 0.025, 0.008)
  addBox(parent, m.shellShade, [0.34, 0.12, 0.11], [outerX, height - 0.88, -0.055], [0, 0, left ? 0.12 : -0.12], 0.025, 0.008)
  addBox(parent, m.graphite, [0.25, 0.62, 0.12], [outerX, 1.05, -0.06], [0, 0, 0], 0.05, 0.014)
  addBox(parent, m.graphite, [0.26, 0.52, 0.12], [outerX, height - 1.04, -0.06], [0, 0, 0], 0.05, 0.014)
  addBox(parent, m.ink, [0.62, 0.32, 0.08], [x + 0.5, 0.62, -0.12], [0, 0, 0], 0.055, 0.016)
  addBox(parent, m.blue, [0.42, 0.13, 0.035], [x + 0.5, 0.64, -0.018], [0, 0, 0], 0.02, 0.006)
  addBox(parent, m.amber, [0.22, 0.1, 0.03], [outerX, height - 0.7, -0.014], [0, 0, 0], 0.018, 0.005)
  addBox(parent, m.amber, [0.14, 0.1, 0.03], [x + 0.5, 0.26, -0.014], [0, 0, 0], 0.018, 0.005)
  parent.add(cylinder(m.ink, 0.1, 0.07, [x + 0.5, height - 0.12, -0.5], [0, 0, 0], 12))
  parent.add(cylinder(m.amber, 0.07, 0.12, [x + 0.5, height - 0.06, -0.5], [0, 0, 0], 12))
  addBox(parent, m.edge, [0.3, 0.42, 0.12], [outerX, height - 0.48, -0.06], [0, 0, left ? -0.32 : 0.32], 0.05, 0.014)
  addBox(parent, m.edge, [0.3, 0.5, 0.13], [outerX, 0.74, -0.065], [0, 0, left ? 0.32 : -0.32], 0.05, 0.014)
  addBox(parent, m.edge, [0.46, 0.3, 0.98], [x + (left ? 0.23 : 0.77), 0.15, -0.5], [0, 0, 0], 0.065, 0.02)
  addBox(parent, m.edge, [0.46, 0.3, 0.98], [x + (left ? 0.77 : 0.23), 0.15, -0.5], [0, 0, 0], 0.065, 0.02)
  addBox(parent, m.shellShade, [0.36, 0.22, 0.72], [outerX, 0.28, -0.5], [0, 0, left ? -0.28 : 0.28], 0.055, 0.016)
  addBox(parent, m.blue, [0.28, 0.18, 0.045], [outerX, 0.48, -0.022], [0, 0, 0], 0.035, 0.01)
  for (const y of [0.42, 1.42, height - 1.42, height - 0.42]) addBolt(parent, m.ink, outerX, y, -0.006)
}

function addGateReturn(parent: Group, m: FamilyMaterials): void {
  // The pier and return wall are built from adjacent cells. Each cell owns its
  // facade; nothing is skinned over a full host face. The descending wall
  // cells make the reference's low return silhouette without rotated plates
  // cutting through one another.
  addBox(parent, m.edge, [2, 0.42, 1], [1, 0.21, -0.5], [0, 0, 0], 0.11, 0.03)
  addBox(parent, m.graphite, [2, 0.24, 0.88], [1, 0.54, -0.52], [0, 0, 0], 0.07, 0.022)
  // Tall pier and wing are adjacent x lanes, matching the reference's
  // dominant asymmetry instead of reading as two similar towers.
  addBox(parent, m.graphite, [0.72, 2.02, 0.9], [0.36, 1.67, -0.52], [0, 0, 0], 0.105, 0.028)
  addBox(parent, m.shell, [0.72, 0.42, 1], [0.36, 2.79, -0.5], [0, 0, 0], 0.13, 0.036)
  addBox(parent, m.edge, [0.58, 0.15, 0.72], [0.36, 2.53, -0.52], [0, 0, 0], 0.045, 0.014)
  addBox(parent, m.edge, [0.12, 1.95, 0.08], [0.2, 1.52, -0.04], [0, 0, 0], 0.032, 0.01)
  addBox(parent, m.edge, [0.12, 1.95, 0.08], [0.52, 1.52, -0.04], [0, 0, 0], 0.032, 0.01)
  parent.add(cylinder(m.blue, 0.05, 1.7, [0.36, 1.52, -0.028], [0, 0, 0], 12))
  for (const y of [0.78, 1.52, 2.26]) addBox(parent, m.edge, [0.24, 0.12, 0.09], [0.36, y, -0.045], [0, 0, 0], 0.028, 0.009)
  for (const x of [0.07, 0.65]) addBox(parent, m.shellShade, [0.1, 1.5, 0.07], [x, 1.5, -0.035], [0, 0, 0], 0.035, 0.01)
  addBox(parent, m.graphite, [1.28, 1.42, 0.72], [1.36, 1.34, -0.5], [0, 0, 0], 0.08, 0.024)
  addBox(parent, m.shell, [1.04, 1.16, 0.16], [1.38, 1.36, -0.11], [0, 0, 0], 0.1, 0.026)
  // One continuous sloped cap with three real underside brackets. The wall
  // stops below it, so the rotated beam cannot interpenetrate the host.
  addBox(parent, m.edge, [1.35, 0.22, 0.82], [1.34, 2.12, -0.5], [0, 0, -0.12], 0.065, 0.02)
  for (const x of [0.86, 1.34, 1.82]) addBox(parent, m.edge, [0.18, 0.22, 0.32], [x, 1.92, -0.28], [0, 0, 0], 0.045, 0.014)
  addBox(parent, m.amber, [1.0, 0.045, 0.03], [1.38, 2.005, -0.011], [0, 0, -0.12], 0.01, 0.003)
  for (const y of [1.08, 1.62]) addBox(parent, m.shellShade, [0.94, 0.035, 0.035], [1.38, y, -0.012], [0, 0, 0], 0.008, 0.003)
  for (const y of [0.8, 1.5]) addBox(parent, m.edge, [0.12, 0.18, 0.15], [1.9, y, -0.175], [0, 0, 0], 0.032, 0.01)
  addBox(parent, m.amber, [0.32, 0.09, 0.035], [0.36, 2.48, -0.0175], [0, 0, 0], 0.02, 0.006)
  return

  // Tall gate pier and deliberately lower wing wall are separate load paths.
  addBox(parent, m.edge, [0.72, 3, 0.96], [0.36, 1.5, -0.52], [0, 0, 0], 0.12, 0.032)
  addBox(parent, m.shell, [0.54, 2.46, 0.82], [0.3, 1.57, -0.46], [0, 0, 0], 0.1, 0.028)
  addBox(parent, m.shell, [0.46, 2.18, 0.03], [0.27, 1.56, -0.027], [0, 0, 0], 0.075, 0.022)
  addBox(parent, m.shellShade, [0.3, 1.82, 0.012], [0.27, 1.56, -0.006], [0, 0, 0], 0.045, 0.014)
  addBox(parent, m.edge, [0.76, 0.58, 1], [0.38, 0.29, -0.5], [0, 0, 0], 0.11, 0.03)
  addBox(parent, m.edge, [0.76, 0.55, 0.96], [0.38, 2.73, -0.52], [0, 0, 0], 0.12, 0.032)
  addBox(parent, m.shell, [0.58, 0.34, 0.82], [0.31, 2.8, -0.46], [0, 0, 0], 0.09, 0.026)
  addBox(parent, m.ink, [0.22, 2.18, 0.13], [0.61, 1.55, -0.1], [0, 0, 0], 0.05, 0.015)
  parent.add(cylinder(m.blue, 0.05, 1.72, [0.61, 1.55, -0.025], [0, 0, 0], 12))
  for (const y of [0.72, 1.55, 2.38]) addBox(parent, m.edge, [0.27, 0.14, 0.16], [0.61, y, -0.065], [0, 0, 0], 0.032, 0.01)
  addBox(parent, m.amber, [0.38, 0.1, 0.035], [0.31, 2.54, -0.014], [0, 0, 0], 0.02, 0.006)

  addBox(parent, m.graphite, [1.42, 2.18, 0.288], [1.29, 1.22, -0.18], [0, 0, 0], 0.085, 0.024)
  addBox(parent, m.shell, [1.18, 1.72, 0.03], [1.34, 1.27, -0.027], [0, 0, 0], 0.13, 0.032)
  addBox(parent, m.shellShade, [1.16, 0.045, 0.012], [1.33, 1.28, -0.006], [0, 0, 0], 0.008, 0.003)
  addBox(parent, m.shellShade, [1.12, 0.04, 0.012], [1.34, 0.82, -0.006], [0, 0, 0], 0.008, 0.003)
  addBox(parent, m.shellShade, [1.12, 0.04, 0.012], [1.34, 1.72, -0.006], [0, 0, 0], 0.008, 0.003)
  addBox(parent, m.edge, [1.48, 0.38, 0.36], [1.26, 2.29, -0.19], [0, 0, -0.11], 0.07, 0.022)
  addBox(parent, m.shellShade, [1.28, 0.18, 0.3], [1.34, 2.38, -0.16], [0, 0, -0.11], 0.055, 0.016)
  addBox(parent, m.amber, [1.05, 0.05, 0.025], [1.36, 2.2, -0.008], [0, 0, -0.11], 0.01, 0.003)
  for (const x of [0.86, 1.25, 1.64]) addBox(parent, m.edge, [0.16, 0.18, 0.25], [x, 2.04, -0.12], [0, 0, 0], 0.04, 0.012)
  for (const [x, y] of [[1.82, 1.62], [1.82, 0.84]] as const) {
    addBox(parent, m.edge, [0.2, 0.3, 0.015], [x, y, -0.005], [0, 0, 0], 0.045, 0.014)
    addBox(parent, m.blue, [0.09, 0.16, 0.006], [x, y, 0.007], [0, 0, 0], 0.02, 0.006)
  }

  addBox(parent, m.edge, [2, 0.58, 1], [1, 0.29, -0.5], [0, 0, 0], 0.09, 0.026)
  addBox(parent, m.graphite, [1.86, 0.32, 0.9], [1.04, 0.5, -0.5], [0, 0, 0], 0.07, 0.022)
  addBox(parent, m.shellShade, [2, 0.11, 0.9], [1, 0.055, -0.52], [0, 0, 0], 0.03, 0.01)
  for (const x of [0.22, 0.76, 1.3, 1.82]) {
    addBox(parent, m.edge, [0.24, 0.42, 0.25], [x, 0.31, -0.125], [0, 0, 0], 0.055, 0.016)
    addBox(parent, m.ink, [0.08, 0.14, 0.055], [x, 0.24, -0.025], [0, 0, 0], 0.02, 0.006)
  }
  for (const y of [0.7, 1.48, 2.26]) {
    addBox(parent, m.edge, [0.2, 0.31, 0.15], [1.87, y, -0.075], [0, 0, 0], 0.045, 0.014)
    addBox(parent, m.ink, [0.1, 0.16, 0.06], [1.92, y, -0.025], [0, 0, 0], 0.025, 0.008)
  }
}

function socketsFor(moduleId: OwnedModuleId): readonly KitSocket[] {
  switch (moduleId) {
    case 'exterior-wall-corner':
    case 'interior-wall-corner':
      return [
        { name: 'wall-east', kind: 'wall', position: [2, 1.5, -0.125], normal: [1, 0, 0], up: [0, 1, 0] },
        { name: 'wall-south', kind: 'wall', position: [0.125, 1.5, -2], normal: [0, 0, -1], up: [0, 1, 0] },
      ]
    case 'wall-end-cap':
      return [{ name: 'wall-west', kind: 'wall', position: [0, 1.5, -0.125], normal: [-1, 0, 0], up: [0, 1, 0] }]
    case 'wall-return':
      return [
        { name: 'wall-east', kind: 'wall', position: [1, 1.5, -0.125], normal: [1, 0, 0], up: [0, 1, 0] },
        { name: 'wall-south', kind: 'wall', position: [0.125, 1.5, -1], normal: [0, 0, -1], up: [0, 1, 0] },
      ]
    case 'wall-t-junction':
      return [
        { name: 'wall-west', kind: 'wall', position: [0, 1.5, -0.125], normal: [-1, 0, 0], up: [0, 1, 0] },
        { name: 'wall-east', kind: 'wall', position: [2, 1.5, -0.125], normal: [1, 0, 0], up: [0, 1, 0] },
        { name: 'wall-south', kind: 'wall', position: [1, 1.5, -2], normal: [0, 0, -1], up: [0, 1, 0] },
      ]
    case 'gate-lintel':
      return [
        { name: 'post-left-seat', kind: 'gate-post', position: [0, 0, -0.5], normal: [0, -1, 0], up: [0, 0, 1] },
        { name: 'post-right-seat', kind: 'gate-post', position: [4, 0, -0.5], normal: [0, -1, 0], up: [0, 0, 1] },
      ]
    case 'gate-post-pair':
      return [
        { name: 'lintel-left', kind: 'gate-lintel', position: [1, 3.25, -0.5], normal: [0, 1, 0], up: [0, 0, 1] },
        { name: 'lintel-right', kind: 'gate-lintel', position: [5, 3.25, -0.5], normal: [0, 1, 0], up: [0, 0, 1] },
        { name: 'return-left', kind: 'gate-return', position: [0, 1.5, -0.5], normal: [-1, 0, 0], up: [0, 1, 0] },
        { name: 'return-right', kind: 'gate-return', position: [6, 1.5, -0.5], normal: [1, 0, 0], up: [0, 1, 0] },
      ]
    case 'gate-wall-return':
      return [
        { name: 'gate-post', kind: 'gate-post', position: [0, 1.5, -0.5], normal: [-1, 0, 0], up: [0, 1, 0] },
        { name: 'wall-east', kind: 'wall', position: [2, 1.5, -0.125], normal: [1, 0, 0], up: [0, 1, 0] },
      ]
  }
}

function buildGeometry(moduleId: OwnedModuleId, root: Group, m: FamilyMaterials): void {
  if (moduleId === 'exterior-wall-corner' || moduleId === 'interior-wall-corner') {
    const interior = moduleId === 'interior-wall-corner'
    // The X run starts after the physical corner cell; the Z run owns that
    // cell. This removes the former 0.25 x 0.25 full-height host overlap.
    addRunX(root, m, 0.25, 1.75, 0.25, interior)
    addRunZ(root, m, 2, 0.25, interior)
    addFacetedCornerArmor(root, m, !interior)
    if (!interior) {
      // Thin service cover over a genuinely recessed pocket: their volumes
      // are disjoint instead of the former 32 mm interpenetration.
      addBox(root, m.graphite, [0.34, 0.66, 0.08], [1.56, 0.83, -0.075], [0, 0, 0], 0.06, 0.018)
      addBox(root, m.shellShade, [0.2, 0.48, 0.018], [1.56, 0.83, -0.003], [0, 0, 0], 0.045, 0.008)
      addBolt(root, m.ink, 1.56, 0.83, -0.004)
    }
    return
  }
  if (moduleId === 'wall-end-cap') {
    addEndCap(root, m)
    return
    /* superseded by addEndCap; retained temporarily during the one-archetype
       Dawn comparison so no shared family geometry is touched. */
    // Full-depth C terminator.  The closed load wall, open throat, and the
    // floor/overhead returns are separate solids.  This makes the defining C
    // silhouette read from a grazing three-quarter view without relying on a
    // decorative far-side rail that used to visually close the cavity.
    //
    // Closed load wall: the graphite body stops 40 mm behind the facade, so
    // the white cassette and border have a real shadow gap instead of a
    // coplanar skin.
    addBox(root, m.graphite, [0.25, 2.16, 0.21], [0.125, 1.5, -0.145], [0, 0, 0], 0.055, 0.016)
    addBox(root, m.edge, [0.235, 2.04, 0.035], [0.1225, 1.5, -0.0175], [0, 0, 0], 0.055, 0.016)
    addBox(root, m.shell, [0.17, 1.84, 0.024], [0.105, 1.5, -0.006], [0, 0, 0], 0.045, 0.014)
    addBox(root, m.shellShade, [0.135, 0.035, 0.012], [0.105, 1.5, 0.003], [0, 0, 0], 0.007, 0.002)

    // Tall return blade at the throat mouth.  It is a side wall, not another
    // facade overlay, and terminates above/below the cantilever tread plates.
    addBox(root, m.shell, [0.07, 1.9, 0.205], [0.285, 1.5, -0.1275], [0, 0, 0], 0.052, 0.015)
    addBox(root, m.graphite, [0.055, 1.64, 0.07], [0.325, 1.5, -0.205], [0, 0, 0], 0.028, 0.009)
    for (const y of [0.72, 1.5, 2.28]) {
      addBox(root, m.edge, [0.075, 0.16, 0.07], [0.29, y, -0.205], [0, 0, 0], 0.026, 0.008)
      addBox(root, m.amber, [0.016, 0.075, 0.012], [0.235, y, 0.004], [0, 0, 0], 0.005, 0.001)
    }

    // Multi-tier base and crown.  The outer dark armor occupies the full
    // envelope, while the pale inner treads extend across the open half of
    // the C and visibly seat against the throat blade.
    addBox(root, m.edge, [0.5, 0.28, 0.25], [0.25, 0.14, -0.125], [0, 0, 0], 0.075, 0.022)
    addBox(root, m.shellShade, [0.43, 0.14, 0.22], [0.215, 0.35, -0.125], [0, 0, 0], 0.055, 0.016)
    addBox(root, m.shell, [0.235, 0.075, 0.18], [0.3825, 0.455, -0.125], [0, 0, 0], 0.035, 0.01)
    addBox(root, m.ink, [0.21, 0.06, 0.13], [0.385, 0.505, -0.125], [0, 0, 0], 0.025, 0.008)
    addBox(root, m.graphite, [0.19, 0.12, 0.13], [0.295, 0.56, -0.175], [0, 0, -0.42], 0.028, 0.009)

    addBox(root, m.edge, [0.5, 0.3, 0.25], [0.25, 2.85, -0.125], [0, 0, 0], 0.075, 0.022)
    addBox(root, m.shellShade, [0.43, 0.13, 0.22], [0.215, 2.635, -0.125], [0, 0, 0], 0.055, 0.016)
    addBox(root, m.shell, [0.235, 0.075, 0.18], [0.3825, 2.535, -0.125], [0, 0, 0], 0.035, 0.01)
    addBox(root, m.ink, [0.21, 0.06, 0.13], [0.385, 2.485, -0.125], [0, 0, 0], 0.025, 0.008)
    addBox(root, m.graphite, [0.19, 0.12, 0.13], [0.295, 2.43, -0.175], [0, 0, 0.42], 0.028, 0.009)

    // Recessed side latches live on the throat blade.  The cavity's outboard
    // side is deliberately left open; the former full-height rail turned the
    // defining C silhouette into a closed O when seen from the front.
    for (const y of [0.72, 1.5, 2.28]) addBox(root, m.edge, [0.08, 0.13, 0.07], [0.325, y, -0.205], [0, 0, 0], 0.025, 0.008)
    for (const y of [0.82, 1.5, 2.18]) root.add(cylinder(m.ink, 0.012, 0.012, [0.105, y, 0.002], [Math.PI * 0.5, 0, 0], 8))
    return
  }
  if (moduleId === 'wall-return') {
    addRunX(root, m, 0.25, 0.75, 0.25, false)
    addRunZ(root, m, 1, 0.25, false)
    addReturnPipeSpine(root, m)
    return
  }
  if (moduleId === 'wall-t-junction') {
    addTJunction(root, m)
    return
  }
  if (moduleId === 'gate-lintel') {
    // Rear box beam, front armor, service race, and end machinery are laid
    // out as a depth stack with no shared facade planes.
    addBox(root, m.graphite, [4, 0.75, 0.66], [2, 0.375, -0.67], [0, 0, 0], 0.1, 0.028)
    for (const x of [0.275, 3.725]) {
      addBox(root, m.edge, [0.55, 0.4, 0.34], [x, 0.2, -0.17], [0, 0, 0], 0.08, 0.024)
      addBox(root, m.edge, [0.55, 0.17, 0.34], [x, 0.665, -0.17], [0, 0, 0], 0.06, 0.018)
      addBox(root, m.ink, [0.28, 0.17, 0.11], [x, 0.5, -0.09], [0, 0, 0], 0.04, 0.012)
      addBox(root, m.amber, [0.14, 0.1, 0.025], [x, 0.5, -0.0125], [0, 0, 0], 0.025, 0.008)
    }
    // Compound center beam: a dark perimeter frame, an inset white armor
    // cassette and a genuinely open lower service race.
    addBox(root, m.edge, [2.9, 0.58, 0.22], [2, 0.45, -0.23], [0, 0, 0], 0.085, 0.024)
    addBox(root, m.shell, [2.56, 0.34, 0.08], [2, 0.49, -0.08], [0, 0, 0], 0.07, 0.02)
    addBox(root, m.ink, [2.72, 0.13, 0.12], [2, 0.15, -0.18], [0, 0, 0], 0.032, 0.01)
    addBox(root, m.edge, [3.1, 0.1, 0.16], [2, 0.07, -0.26], [0, 0, 0], 0.025, 0.008)
    root.add(cylinder(m.ink, 0.04, 3.0, [2, 0.055, -0.12], [0, 0, Math.PI * 0.5], 10))
    root.add(cylinder(m.graphite, 0.032, 3.0, [2, 0.13, -0.2], [0, 0, Math.PI * 0.5], 10))
    for (const x of [0.8, 1.6, 2.4, 3.2]) addBox(root, m.edge, [0.08, 0.16, 0.14], [x, 0.09, -0.16], [0, 0, 0], 0.022, 0.007)
    addBox(root, m.amber, [2.48, 0.035, 0.026], [2, 0.145, -0.013], [0, 0, 0], 0.01, 0.003)
    addBox(root, m.blue, [0.08, 0.26, 0.14], [0.595, 0.14, -0.12], [0, 0, -0.28], 0.025, 0.008)
    addBox(root, m.blue, [0.08, 0.26, 0.14], [3.405, 0.14, -0.12], [0, 0, 0.28], 0.025, 0.008)
    for (const x of [0.72, 3.28]) for (const y of [0.32, 0.6]) addBolt(root, m.ink, x, y, -0.102)
    return
  }
  if (moduleId === 'gate-post-pair') {
    addGatePost(root, m, 0, 4)
    addGatePost(root, m, 5, 4)
    return
  }
  addGateReturn(root, m)
}

function confineToContractEnvelope(root: Group, moduleId: OwnedModuleId): void {
  const spec = MODULE_SPECS[moduleId]
  // Keep authored relief intact while holding the kit's documented 15 mm
  // envelope tolerance. Snapping every proud face to the exact boundary made
  // distinct armor layers coplanar and produced visible z-fighting in Dawn.
  const guard = 0.009
  root.updateMatrixWorld(true)
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const bounds = new Box3().setFromObject(object)
    const correction = new Vector3()
    if (bounds.min.x < -guard) correction.x += -guard - bounds.min.x
    if (bounds.max.x > spec.width + guard) correction.x -= bounds.max.x - (spec.width + guard)
    if (bounds.min.y < -guard) correction.y += -guard - bounds.min.y
    if (bounds.max.y > spec.height + guard) correction.y -= bounds.max.y - (spec.height + guard)
    if (bounds.min.z < -spec.depth - guard) correction.z += -spec.depth - guard - bounds.min.z
    if (bounds.max.z > guard) correction.z -= bounds.max.z - guard
    object.position.add(correction)
    object.updateMatrixWorld(true)
  })
}

function acquireMaterials(): { materials: FamilyMaterials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-100', condition: 'maintained', seed: 14001 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-350', condition: 'maintained', seed: 14002 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'maintained', seed: 14003 })
  const edge = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-650', condition: 'maintained', seed: 14004 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 14005 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-500', condition: 'active', seed: 14006 })
  const blue = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 14007 })
  return {
    handles: [shell, shellShade, graphite, edge, ink, amber, blue],
    materials: {
      shell: tuneMaterial(shell, 0xb9bdba, 0.5, 0.28, { clearcoat: 0.1 }),
      shellShade: tuneMaterial(shellShade, 0x747c80, 0.55, 0.4, { clearcoat: 0.08 }),
      graphite: tuneMaterial(graphite, 0x252b30, 0.5, 0.55, { clearcoat: 0.08 }),
      edge: tuneMaterial(edge, 0x40484d, 0.42, 0.64, { clearcoat: 0.12 }),
      ink: tuneMaterial(ink, 0x090c0f, 0.72, 0.2),
      amber: tuneMaterial(amber, 0xf09a16, 0.25, 0.05, { emissive: 1.6 }),
      blue: tuneMaterial(blue, 0x2568b5, 0.34, 0.18, { emissive: 0.35 }),
    },
  }
}

export function buildModule(moduleId: OwnedModuleId): {
  root: Group
  update: (deltaSeconds: number) => void
  dispose: () => void
} {
  const { materials, handles } = acquireMaterials()
  const root = new Group()
  buildGeometry(moduleId, root, materials)
  confineToContractEnvelope(root, moduleId)
  // Service lenses on exposed +Z / -X faces occupy the outer ledger level.
  // Normalize them after envelope confinement so legacy authoring positions
  // cannot leave a sub-millimetre coplanar overlap with their structural cup.
  root.updateMatrixWorld(true)
  root.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return
    if (object.material !== materials.amber && object.material !== materials.blue) return
    object.scale.multiplyScalar(0.9)
    object.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(object)
    if (bounds.max.z > -0.025 && bounds.min.z > -0.15) object.position.z += 0.011 - bounds.max.z
    if (bounds.min.x < 0.025 && bounds.max.x < 0.15) object.position.x += -0.011 - bounds.min.x
    object.updateMatrixWorld(true)
  })
  annotateKitAsset(root, moduleId, socketsFor(moduleId))
  validateKitMetadata(root)

  // Bake form-aware identity before batching.  The low values keep this a
  // maintained kit: rub collects on exposed frame edges, grime in seams and
  // feet, and scratches stay sparse instead of turning broad panels mottled.
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    // Every structural material is baked and collapsed into the same wear
    // shader batch. Broad maintained armor deliberately receives a zero wear
    // amplitude; only dark recesses carry restrained grime. This preserves
    // material identity without reintroducing broad repeated mottling.
    [materials.shell, { rub: 0.012, grime: 0.006, scratch: 0 }],
    [materials.shellShade, { rub: 0.01, grime: 0.008, scratch: 0 }],
    [materials.graphite, { rub: 0.014, grime: 0.012, scratch: 0 }],
    [materials.edge, { rub: 0.018, grime: 0.012, scratch: 0 }],
    [materials.ink, { rub: 0.012, grime: 0.045, scratch: 0.003 }],
  ])
  bakeOcclusion(root, { reach: 0.18 })
  bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({
    name: `${moduleId} / baked maintained wear`,
    clearcoat: 0.1,
    clearcoatRoughness: 0.5,
  })
  root.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return
    if (profiles.has(object.material as MeshPhysicalMaterial)) object.material = wear
  })
  const geometries = mergeStaticByMaterial(root, {
    retainedAttributes: (material) => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material) => `${moduleId} / ${material.name}`,
  })
  annotateKitAsset(root, moduleId, socketsFor(moduleId))
  validateKitMetadata(root)

  const spec = MODULE_SPECS[moduleId]
  const bounds = new Box3().setFromObject(root)
  const tolerance = 0.015
  const expected = { minX: 0, maxX: spec.width, minY: 0, maxY: spec.height, minZ: -spec.depth, maxZ: 0 }
  const actual = { minX: bounds.min.x, maxX: bounds.max.x, minY: bounds.min.y, maxY: bounds.max.y, minZ: bounds.min.z, maxZ: bounds.max.z }
  for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
    if (Math.abs(expected[key] - actual[key]) > tolerance) throw new Error(`${moduleId} bound ${key} expected ${expected[key]}, got ${actual[key]}`)
  }

  return {
    root,
    update: (deltaSeconds: number) => {
      const delta = Math.min(Math.max(deltaSeconds, 0), 0.05)
      const phase = ((root.userData.previewPhase as number | undefined) ?? 0) + delta
      root.userData.previewPhase = phase
      materials.amber.emissiveIntensity = 1.45 + Math.sin(phase * 1.25) * 0.12
    },
    dispose: () => {
      for (const geometry of geometries) geometry.dispose()
      wear.dispose()
      for (const handle of handles) handle.release()
    },
  }
}

function addAssemblyEvidence(scene: Scene, moduleId: OwnedModuleId): void {
  if (moduleId === 'exterior-wall-corner') {
    const cap = buildModule('wall-end-cap')
    cap.root.position.set(2, 0, 0)
    cap.root.userData.excludeFromExport = true
    scene.add(cap.root)
    scene.userData.extraDisposers = [cap.dispose]
    return
  }
  if (moduleId !== 'gate-post-pair') return
  const lintel = buildModule('gate-lintel')
  lintel.root.position.set(1, 3.25, 0)
  lintel.root.userData.excludeFromExport = true
  const leftReturn = buildModule('gate-wall-return')
  leftReturn.root.rotation.y = Math.PI
  leftReturn.root.position.set(0, 0, -1)
  leftReturn.root.userData.excludeFromExport = true
  const rightReturn = buildModule('gate-wall-return')
  rightReturn.root.position.set(6, 0, 0)
  rightReturn.root.userData.excludeFromExport = true
  scene.add(lintel.root, leftReturn.root, rightReturn.root)
  scene.userData.extraDisposers = [lintel.dispose, leftReturn.dispose, rightReturn.dispose]
}

export function buildPreview(moduleId: OwnedModuleId, options: { aspect: number; time?: number }): {
  scene: Scene
  root: Group
  camera: PerspectiveCamera
  update: (deltaSeconds: number) => void
  dispose: () => void
} {
  const controller = buildModule(moduleId)
  const spec = MODULE_SPECS[moduleId]
  const scene = new Scene()
  scene.background = new Color(0x04070a)
  scene.add(controller.root)
  scene.add(new HemisphereLight(0xa8bbc5, 0x07090c, 0.86))
  const key = new DirectionalLight(0xffedd6, 2.5)
  key.position.set(-7, 10, 11)
  scene.add(key)
  const fill = new DirectionalLight(0x758bd0, 0.9)
  fill.position.set(9, 5, 6)
  scene.add(fill)
  const rim = new DirectionalLight(0x82aabd, 0.72)
  rim.position.set(6, 8, -9)
  scene.add(rim)

  const mode = Math.floor(options.time ?? 0)
  if (mode >= 5) addAssemblyEvidence(scene, moduleId)
  const span = Math.max(spec.width, spec.depth, spec.height)
  const fitSpan = Math.max(spec.height, spec.depth, spec.width * 0.7)
  const center = new Vector3(spec.width / 2, spec.height / 2, -spec.depth / 2)
  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const camera = new PerspectiveCamera(36, aspect, 0.08, 100)
  if (mode === 2) camera.position.set(spec.width + span * 1.65, spec.height * 0.62, span * 0.65)
  else if (mode === 3) camera.position.set(spec.width + span * 1.25, spec.height * 0.72, -spec.depth - span * 1.7)
  else if (mode === 4) camera.position.set(-span * 1.35, Math.max(0.45, spec.height * 0.22), span * 1.45)
  else if (moduleId === 'gate-post-pair' && mode >= 5) camera.position.set(1.2, 4.8, 14.4)
  // View the end-cap from its open side so the acceptance beauty proves the
  // full C cavity and both cantilevers instead of collapsing to an edge-on
  // rail silhouette.
  else if (moduleId === 'wall-end-cap') camera.position.set(1.65, 2.4, 4.8)
  else if (moduleId === 'wall-t-junction') camera.position.set(3.05, 4.45, 6.35)
  else if (spec.width >= 4) camera.position.set(center.x - spec.width * 0.08, Math.max(1.5, spec.height * 1.08), center.z + spec.width * 1.72)
  else camera.position.set(center.x - fitSpan * 1.15, spec.height * 0.78 + 0.4, center.z + fitSpan * 1.45)
  camera.lookAt(center)
  scene.add(camera)
  return {
    scene,
    root: controller.root,
    camera,
    update: controller.update,
    dispose: () => {
      controller.dispose()
      for (const dispose of (scene.userData.extraDisposers as Array<() => void> | undefined) ?? []) dispose()
    },
  }
}
