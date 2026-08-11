import {
  CatmullRomCurve3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three/webgpu'

import {
  WEAR_ATTRIBUTES,
  bakeOcclusion,
  bakeSurfaceAttributes,
  createWearMaterial,
  cylinder,
  extrudeProfile,
  mergeStaticByMaterial,
  prism,
  type Vec3,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'

const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]

interface ReelMaterials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  edge: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  hose: MeshPhysicalMaterial
  pipe: MeshPhysicalMaterial
  grime: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
}

interface ReelController {
  enabled: boolean
  phase: number
}

interface ReelRig {
  root: Group
  nozzlePivot: Group
  controller: ReelController
  materials: ReelMaterials
  wear: MeshPhysicalMaterial
  geometries: Array<{ dispose: () => void }>
}

let demonstrationEnabled = false
const liveControllers = new Set<ReelController>()

/** Toggles the retained-nozzle service demonstration. The module starts off. */
export function toggleHoseReel(force?: boolean): boolean {
  demonstrationEnabled = force ?? !demonstrationEnabled
  for (const controller of liveControllers) controller.enabled = demonstrationEnabled
  return demonstrationEnabled
}

function materials(): ReelMaterials {
  return {
    shell: new MeshPhysicalMaterial({
      name: 'industrial-hose-reel / maintained ivory armor',
      color: 0xc8cdca, roughness: 0.45, metalness: 0.34,
      clearcoat: 0.13, clearcoatRoughness: 0.43,
    }),
    shellShade: new MeshPhysicalMaterial({
      name: 'industrial-hose-reel / shadowed shell armor',
      color: 0x899291, roughness: 0.51, metalness: 0.49,
      clearcoat: 0.08,
    }),
    graphite: new MeshPhysicalMaterial({
      name: 'industrial-hose-reel / cast graphite chassis',
      color: 0x11171a, roughness: 0.57, metalness: 0.73,
      clearcoat: 0.06,
    }),
    edge: new MeshPhysicalMaterial({
      name: 'industrial-hose-reel / rubbed edge steel',
      color: 0x353e42, roughness: 0.36, metalness: 0.88,
      clearcoat: 0.11,
    }),
    steel: new MeshPhysicalMaterial({
      name: 'industrial-hose-reel / fastener steel',
      color: 0xa0a7a6, roughness: 0.24, metalness: 0.97,
      clearcoat: 0.22,
    }),
    hose: new MeshPhysicalMaterial({
      name: 'industrial-hose-reel / yellow reinforced hose',
      color: 0xd48c13, roughness: 0.44, metalness: 0.11,
      clearcoat: 0.11,
    }),
    pipe: new MeshPhysicalMaterial({
      name: 'industrial-hose-reel / black hard process line',
      color: 0x242a2d, roughness: 0.43, metalness: 0.82,
      clearcoat: 0.1,
    }),
    grime: new MeshPhysicalMaterial({
      name: 'industrial-hose-reel / service grime',
      color: 0x29251f, roughness: 0.84, metalness: 0.15,
    }),
    amber: new MeshPhysicalMaterial({
      name: 'industrial-hose-reel / amber state lenses',
      color: 0xe58a0d, roughness: 0.2, metalness: 0.05,
      emissive: new Color(0xff5500), emissiveIntensity: 1.5,
    }),
    cyan: new MeshPhysicalMaterial({
      name: 'industrial-hose-reel / cyan service witness',
      color: 0x59dfe6, roughness: 0.18, metalness: 0.04,
      emissive: new Color(0x20cbd4), emissiveIntensity: 1.65,
    }),
  }
}

function box(
  parent: Group,
  material: MeshPhysicalMaterial,
  size: Vec3,
  position: Vec3,
  chamfer = 0.07,
  bevel = 0.022,
  rotation: Vec3 = [0, 0, 0],
): Mesh {
  const mesh = prism(material, size, position, {
    chamfer,
    fillet: Math.min(0.042, Math.max(0.008, chamfer * 0.3)),
    bevel,
    rotation,
  })
  parent.add(mesh)
  return mesh
}

function pipeCurve(material: MeshPhysicalMaterial, points: Vec3[], radius: number, segments = 36, radial = 10): Mesh {
  const curve = new CatmullRomCurve3(points.map((point) => new Vector3(...point)), false, 'centripetal')
  return new Mesh(new TubeGeometry(curve, segments, radius, radial, false), material)
}

function ring(material: MeshPhysicalMaterial, radius: number, tubeRadius: number, position: Vec3, radial = 24): Mesh {
  const mesh = new Mesh(new TorusGeometry(radius, tubeRadius, 7, radial), material)
  mesh.position.set(...position)
  return mesh
}

function boltZ(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number, radius = 0.042): void {
  parent.add(cylinder(material, radius, 0.13, [x, y, z], Z_AXIS, 8))
}

function beam(parent: Group, material: MeshPhysicalMaterial, start: [number, number], end: [number, number], z: number, width: number, depth: number): void {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const length = Math.hypot(dx, dy)
  box(parent, material, [length + 0.06, width, depth], [
    (start[0] + end[0]) * 0.5,
    (start[1] + end[1]) * 0.5,
    z,
  ], 0.06, 0.02, [0, 0, Math.atan2(dy, dx)])
}

function addGroundedBackplate(root: Group, m: ReelMaterials): void {
  // Compact mount pads sit directly under the vertical datum; the asset reads
  // as wall-backed service equipment rather than a machine on a floor plinth.
  box(root, m.edge, [1.62, 0.18, 1.12], [-1.93, 0.09, 0], 0.14, 0.035)
  box(root, m.graphite, [1.34, 0.18, 0.9], [-1.93, 0.25, 0], 0.11, 0.028)
  for (const x of [-2.27, -1.59]) {
    for (const z of [-0.38, 0.38]) {
      box(root, m.edge, [0.46, 0.12, 0.36], [x, 0.06, z], 0.09, 0.024)
      box(root, m.graphite, [0.3, 0.09, 0.22], [x, 0.14, z], 0.06, 0.018)
      root.add(cylinder(m.steel, 0.07, 0.055, [x, 0.19, z], [0, 0, 0], 9))
    }
  }

  // Tall wall-service spine is broad enough to capture both line manifolds.
  const profile: Array<[number, number]> = [
    [-0.55, -2.35], [0.35, -2.35], [0.5, -2.18], [0.5, 2.12],
    [0.3, 2.35], [-0.36, 2.35], [-0.55, 2.14],
  ]
  root.add(extrudeProfile(m.shell, profile, 0.78, [-2.05, 2.35, -0.12], {
    fillet: 0.06, bevel: 0.045, arcSegments: 1, bevelSegments: 1,
  }))
  box(root, m.shellShade, [0.72, 4.22, 0.18], [-1.86, 2.37, 0.34], 0.12, 0.032)
  box(root, m.graphite, [0.52, 0.72, 0.24], [-1.79, 0.5, 0.36], 0.12, 0.03)
  box(root, m.edge, [0.4, 0.48, 0.15], [-1.79, 0.5, 0.57], 0.09, 0.024)
  for (const y of [0.55, 1.75, 2.95, 4.25]) boltZ(root, m.steel, -1.92, y, 0.46, 0.046)

  // Upper and lower bearing shelves overlap the spine and reel shell.
  for (const y of [1.44, 4.02]) {
    box(root, m.edge, [1.52, 0.28, 1.25], [-0.88, y, 0.2], 0.12, 0.032)
    box(root, m.shellShade, [1.28, 0.22, 1.08], [-0.76, y + 0.16, 0.22], 0.1, 0.028)
  }
}

function addReelShell(root: Group, m: ReelMaterials): void {
  const cx = 0.18
  const cy = 2.83

  // Deep clipped chassis plate ties the drum bearing into the tall spine.
  root.add(extrudeProfile(m.shell, [
    [-1.25, -1.45], [0.65, -1.45], [1.15, -0.95], [1.15, 1.15],
    [0.75, 1.45], [-1.25, 1.45],
  ], 0.34, [-0.72, 2.76, 0.1], {
    fillet: 0.055, bevel: 0.04, arcSegments: 1, bevelSegments: 1,
  }))
  box(root, m.graphite, [0.5, 0.94, 0.14], [-1.38, 2.68, 0.34], 0.11, 0.03)

  // Deep rear drum body and two load-bearing end flanges.
  root.add(cylinder(m.graphite, 1.08, 1.48, [cx, cy, 0.25], Z_AXIS, 28))
  root.add(cylinder(m.shell, 1.62, 0.2, [cx, cy, -0.68], Z_AXIS, 30))
  root.add(cylinder(m.graphite, 1.3, 0.08, [cx, cy, -0.81], Z_AXIS, 28))
  root.add(ring(m.edge, 1.1, 0.075, [cx, cy, -0.87], 26))
  root.add(cylinder(m.shellShade, 0.52, 0.2, [cx, cy, -0.91], Z_AXIS, 18))
  root.add(cylinder(m.edge, 0.35, 0.18, [cx, cy, -1.04], Z_AXIS, 16))
  root.add(cylinder(m.cyan, 0.16, 0.07, [cx, cy, -1.17], Z_AXIS, 14))
  for (let index = 0; index < 6; index += 1) {
    const angle = index * Math.PI / 3
    boltZ(root, m.steel, cx + Math.cos(angle) * 1.03, cy + Math.sin(angle) * 1.03, -0.9, 0.04)
  }
  root.add(cylinder(m.shell, 1.62, 0.22, [cx, cy, 1.18], Z_AXIS, 30))
  root.add(cylinder(m.graphite, 1.34, 0.1, [cx, cy, 1.36], Z_AXIS, 28))

  // Dense wound hose is individual continuous loops across the drum depth.
  for (let index = 0; index < 8; index += 1) {
    const z = -0.52 + index * 0.21
    const radius = 1.3 - (index % 2) * 0.012
    root.add(ring(m.hose, radius, 0.095, [cx, cy, z], 30))
  }

  // Front dark rotor and three white load spokes preserve open negative space.
  root.add(ring(m.edge, 1.04, 0.075, [cx, cy, 1.44], 26))
  for (let index = 0; index < 3; index += 1) {
    const angle = index * Math.PI * 2 / 3 + 0.08
    const inner: [number, number] = [cx + Math.cos(angle) * 0.32, cy + Math.sin(angle) * 0.32]
    const outer: [number, number] = [cx + Math.cos(angle) * 1.4, cy + Math.sin(angle) * 1.4]
    beam(root, m.shell, inner, outer, 1.47, 0.28, 0.18)
    const socketX = cx + Math.cos(angle) * 1.34
    const socketY = cy + Math.sin(angle) * 1.34
    root.add(cylinder(m.edge, 0.09, 0.1, [socketX, socketY, 1.59], Z_AXIS, 9))
  }

  // Concentric captured hub and amber bearing witness.
  root.add(cylinder(m.shellShade, 0.48, 0.34, [cx, cy, 1.43], Z_AXIS, 20))
  root.add(cylinder(m.edge, 0.38, 0.27, [cx, cy, 1.65], Z_AXIS, 18))
  root.add(cylinder(m.graphite, 0.28, 0.18, [cx, cy, 1.84], Z_AXIS, 18))
  root.add(cylinder(m.amber, 0.17, 0.08, [cx, cy, 1.97], Z_AXIS, 16))

  // Armored motor bridge enters the hub and terminates inside the right guard.
  box(root, m.edge, [1.58, 0.76, 0.44], [0.94, 2.82, 1.58], 0.16, 0.04)
  box(root, m.graphite, [1.28, 0.52, 0.18], [1.05, 2.82, 1.88], 0.11, 0.03)
  box(root, m.edge, [0.42, 0.4, 0.28], [1.72, 2.82, 1.63], 0.1, 0.028)
  for (const [x, y] of [[0.4, 2.55], [0.4, 3.09], [1.52, 2.55], [1.52, 3.09]] as const) {
    boltZ(root, m.steel, x, y, 1.86, 0.038)
  }

  // Outer right capture rail physically surrounds hose and nozzle receiver.
  box(root, m.shell, [1.04, 0.22, 0.32], [1.5, 4.12, 1.3], 0.08, 0.024)
  box(root, m.shell, [0.22, 2.36, 0.32], [2.0, 2.95, 1.3], 0.08, 0.024)
  box(root, m.shell, [1.04, 0.22, 0.32], [1.5, 1.78, 1.3], 0.08, 0.024)
  box(root, m.graphite, [0.16, 1.72, 0.22], [1.82, 2.95, 1.48], 0.06, 0.018)
  box(root, m.edge, [0.34, 0.62, 0.28], [1.83, 2.75, 1.62], 0.1, 0.028)
  box(root, m.amber, [0.07, 0.38, 0.035], [2.02, 2.75, 1.68], 0.018, 0.006)
}

function addHardPlumbing(root: Group, m: ReelMaterials): void {
  const plumbing = new Group()
  plumbing.name = 'continuous upper and lower hard-line assembly'
  plumbing.position.z = 0.55
  root.add(plumbing)
  root = plumbing

  // Upper line is one continuous pipe between the reel header and top spine.
  root.add(pipeCurve(m.pipe, [
    [-0.95, 3.86, 0.1], [-0.91, 4.25, 0.08], [-0.98, 4.62, 0.04],
    [-1.2, 4.86, 0], [-1.48, 4.86, -0.04], [-1.72, 4.63, -0.08],
    [-1.76, 4.36, -0.1],
  ], 0.19, 38, 11))
  root.add(cylinder(m.edge, 0.28, 0.28, [-0.95, 3.94, 0.1], [0, 0, 0], 16))
  root.add(cylinder(m.graphite, 0.25, 0.36, [-1.75, 4.37, -0.1], [0, 0, 0], 16))
  for (const y of [4.16, 4.42]) {
    root.add(cylinder(m.hose, 0.235, 0.15, [-0.93, y, 0.09], [0, 0, 0], 14))
  }
  box(root, m.amber, [0.07, 0.42, 0.035], [-0.74, 4.64, 0.14], 0.018, 0.006, [0, 0, -0.38])

  // Lower line is similarly closed from body outlet into the lower manifold.
  root.add(pipeCurve(m.pipe, [
    [-0.85, 1.64, 0.08], [-0.84, 1.15, 0.04], [-0.88, 0.76, 0],
    [-1.06, 0.5, -0.05], [-1.3, 0.43, -0.08], [-1.55, 0.56, -0.1],
    [-1.72, 0.78, -0.1],
  ], 0.18, 36, 11))
  root.add(cylinder(m.edge, 0.26, 0.28, [-0.85, 1.6, 0.08], [0, 0, 0], 16))
  root.add(cylinder(m.graphite, 0.27, 0.34, [-1.7, 0.78, -0.1], [0, 0, 0], 16))
  for (const y of [1.02, 1.27]) {
    root.add(cylinder(m.hose, 0.225, 0.14, [-0.84, y, 0.04], [0, 0, 0], 14))
  }
  root.add(cylinder(m.cyan, 0.205, 0.07, [-0.84, 0.9, 0.03], [0, 0, 0], 12))

  // Both line sockets bolt into actual shelves/backplate mass.
  for (const [x, y, z] of [[-0.95, 3.9, 0.1], [-0.85, 1.6, 0.08]] as Vec3[]) {
    box(root, m.shellShade, [0.72, 0.16, 0.68], [x, y - 0.18, z], 0.12, 0.032)
    for (const dx of [-0.24, 0.24]) boltZ(root, m.steel, x + dx, y - 0.18, z + 0.4, 0.038)
  }
}

function addNozzleCradle(root: Group, nozzlePivot: Group, m: ReelMaterials): void {
  const px = 2.12
  const py = 3.08
  const pz = 1.66

  // Fixed C-cradle overlaps the right rail and encloses the nozzle swivel.
  box(root, m.edge, [0.74, 0.24, 0.44], [px, py + 0.34, pz], 0.1, 0.028)
  box(root, m.edge, [0.2, 0.76, 0.44], [px + 0.28, py, pz], 0.07, 0.022)
  box(root, m.graphite, [0.46, 0.2, 0.3], [px, py - 0.28, pz], 0.075, 0.022)
  box(root, m.shellShade, [0.18, 0.38, 0.5], [px - 0.2, py, pz], 0.06, 0.018)
  box(root, m.shellShade, [0.18, 0.38, 0.5], [px + 0.2, py, pz], 0.06, 0.018)
  box(root, m.amber, [0.08, 0.22, 0.035], [px + 0.31, py, pz + 0.29], 0.018, 0.006)
  root.add(cylinder(m.steel, 0.11, 0.5, [px, py, pz + 0.12], Z_AXIS, 12))

  nozzlePivot.position.set(px, py, pz + 0.2)
  nozzlePivot.name = 'retained articulated nozzle and supply segment'

  // Flexible supply begins exactly at the fixed swivel axis.
  nozzlePivot.add(pipeCurve(m.pipe, [
    [0, 0, 0], [0.02, -0.22, 0], [0.05, -0.42, 0], [0.06, -0.58, 0],
  ], 0.125, 15, 9))
  nozzlePivot.add(cylinder(m.edge, 0.19, 0.3, [0.06, -0.58, 0], [0, 0, 0], 14))
  nozzlePivot.add(cylinder(m.graphite, 0.17, 0.5, [0.06, -0.96, 0], [0, 0, 0], 14))
  nozzlePivot.add(cylinder(m.hose, 0.18, 0.28, [0.06, -1.28, 0], [0, 0, 0], 14))
  nozzlePivot.add(cylinder(m.edge, 0.19, 0.42, [0.06, -1.62, 0], [0, 0, 0], 14))
  nozzlePivot.add(cylinder(m.steel, 0.17, 0.16, [0.06, -1.9, 0], [0, 0, 0], 14))
  nozzlePivot.add(cylinder(m.graphite, 0.13, 0.12, [0.06, -2.04, 0], [0, 0, 0], 12))
  for (const y of [-1.2, -1.34, -1.68]) {
    nozzlePivot.add(cylinder(y === -1.34 ? m.cyan : m.hose, 0.19, 0.055, [0.06, y, 0], [0, 0, 0], 13))
  }

  // Trigger handle bridges two seated sockets on the nozzle body.
  beam(nozzlePivot, m.edge, [0.22, -0.82], [0.48, -1.6], 0.02, 0.13, 0.16)
  box(nozzlePivot, m.hose, [0.22, 0.44, 0.16], [0.47, -1.67, 0.02], 0.07, 0.02)
  box(nozzlePivot, m.amber, [0.06, 0.22, 0.025], [0.58, -1.66, 0.12], 0.016, 0.005)
  boltZ(nozzlePivot, m.steel, 0.22, -0.82, 0.11, 0.035)
}

function addServiceDetails(root: Group, m: ReelMaterials): void {
  // Left interface blocks are seated on the spine, not floating stickers.
  for (const y of [2.02, 3.42]) {
    box(root, m.edge, [0.58, 0.54, 0.28], [-1.12, y, 0.55], 0.12, 0.03)
    box(root, m.graphite, [0.4, 0.34, 0.14], [-1.1, y, 0.77], 0.08, 0.022)
    for (const dy of [-0.17, 0.17]) boltZ(root, m.steel, -1.34, y + dy, 0.86, 0.035)
  }
  box(root, m.graphite, [0.54, 1.1, 0.2], [-1.12, 2.72, 0.58], 0.12, 0.03)
  box(root, m.edge, [0.36, 0.84, 0.1], [-1.11, 2.72, 0.75], 0.085, 0.022)
  box(root, m.amber, [0.055, 0.34, 0.028], [-0.9, 2.72, 0.84], 0.014, 0.004)

  // Sparse lower grime and rubbed service lip ground the maintenance history.
  box(root, m.grime, [1.58, 0.045, 0.24], [-0.48, 1.52, 0.72], 0.04, 0.01)
  box(root, m.grime, [0.52, 0.04, 0.36], [-1.32, 0.5, 0.18], 0.05, 0.012)
}

function buildRig(): ReelRig {
  const m = materials()
  const root = new Group()
  root.name = 'industrial hose reel'
  const fixed = new Group()
  fixed.name = 'grounded fixed hose reel chassis and plumbing'
  const nozzlePivot = new Group()
  root.add(fixed, nozzlePivot)

  addGroundedBackplate(fixed, m)
  addReelShell(fixed, m)
  addHardPlumbing(fixed, m)
  addNozzleCradle(fixed, nozzlePivot, m)
  addServiceDetails(fixed, m)

  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [m.shell, { rub: 0.08, grime: 0.035, scratch: 0.012 }],
    [m.shellShade, { rub: 0.1, grime: 0.06, scratch: 0.016 }],
    [m.graphite, { rub: 0.11, grime: 0.13, scratch: 0.02 }],
    [m.edge, { rub: 0.16, grime: 0.085, scratch: 0.026 }],
    [m.steel, { rub: 0.2, grime: 0.045, scratch: 0.03 }],
    [m.pipe, { rub: 0.1, grime: 0.16, scratch: 0.018 }],
    [m.grime, { rub: 0.035, grime: 0.3, scratch: 0.006 }],
  ])
  bakeOcclusion(root, { reach: 0.18 })
  bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({
    name: 'industrial-hose-reel / localized maintained wear',
    clearcoat: 0.1,
    clearcoatRoughness: 0.47,
  })
  root.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return
    if (profiles.has(object.material)) object.material = wear
  })

  const batchOptions = {
    retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material: { name?: string }): string => material.name ?? 'industrial-hose-reel batch',
  }
  const geometries = [
    ...mergeStaticByMaterial(fixed, batchOptions),
    ...mergeStaticByMaterial(nozzlePivot, batchOptions),
  ]
  const controller = { enabled: false, phase: 0 }
  liveControllers.add(controller)
  root.userData.toggleHoseReel = toggleHoseReel
  root.userData.demonstrationEnabled = false
  return { root, nozzlePivot, controller, materials: m, wear, geometries }
}

export function createModel(): { root: Group; update: (deltaSeconds: number) => void; dispose: () => void } {
  const rig = buildRig()
  return {
    root: rig.root,
    update: (deltaSeconds: number) => {
      const delta = Math.min(Math.max(deltaSeconds, 0), 0.05)
      rig.root.userData.demonstrationEnabled = rig.controller.enabled
      if (rig.controller.enabled) rig.controller.phase += delta
      const target = rig.controller.enabled ? -0.14 * (0.72 + Math.sin(rig.controller.phase * 1.7) * 0.28) : 0
      const blend = 1 - Math.exp(-delta * 8)
      rig.nozzlePivot.rotation.z += (target - rig.nozzlePivot.rotation.z) * blend
    },
    dispose: () => {
      liveControllers.delete(rig.controller)
      for (const geometry of rig.geometries) geometry.dispose()
      rig.wear.dispose()
      for (const material of Object.values(rig.materials)) material.dispose()
    },
  }
}

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low'; enabled?: boolean } = {}) {
  const model = createModel()
  if (options.enabled) {
    toggleHoseReel(true)
    for (let step = 0; step < 22; step += 1) model.update(0.05)
  }
  const scene = new Scene()
  scene.background = new Color(0x030607)
  scene.add(model.root)
  scene.add(new HemisphereLight(0xc3cdcf, 0x07090c, 0.84))
  const key = new DirectionalLight(0xffead5, 2.85)
  key.position.set(-7, 10, 9)
  scene.add(key)
  const fill = new DirectionalLight(0x7698c2, 1.05)
  fill.position.set(8, 5, 7)
  scene.add(fill)
  const rim = new DirectionalLight(0x83aeb4, 0.95)
  rim.position.set(7, 9, -8)
  scene.add(rim)

  const floorMaterial = new MeshPhysicalMaterial({ color: 0x090d10, roughness: 0.92, metalness: 0.05 })
  const floorGeometry = new PlaneGeometry(18, 18)
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.004
  floor.userData.excludeFromExport = true
  scene.add(floor)

  const aspect = Number.isFinite(options.aspect) && (options.aspect ?? 0) > 0 ? options.aspect! : 1
  const camera = new PerspectiveCamera(34, aspect, 0.14, 100)
  if (options.mode === 'side') camera.position.set(8.6, 3.15, 0.15)
  else if (options.mode === 'rear') camera.position.set(6.8, 4.0, -8.4)
  else if (options.mode === 'low') camera.position.set(-6.6, 1.15, 8.1)
  else camera.position.set(7.0, 4.8, 8.5)
  camera.lookAt(-0.05, options.mode === 'low' ? 2.0 : 2.65, 0.22)
  scene.add(camera)

  return {
    scene,
    root: model.root,
    camera,
    update: model.update,
    dispose: () => {
      if (options.enabled) toggleHoseReel(false)
      floorGeometry.dispose()
      floorMaterial.dispose()
      model.dispose()
    },
  }
}

export const createPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
export const createToggledPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty', enabled: true })
