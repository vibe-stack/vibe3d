import {
  Box3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Euler,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PointLight,
  Quaternion,
  Scene,
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

interface Materials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  cushion: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  amberDim: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
}

interface MotionRig {
  arms: InstancedMesh
  rods: InstancedMesh
  sleeves: InstancedMesh
  pivots: InstancedMesh
  actuatorPivots: InstancedMesh
}

interface Controller {
  root: Group
  update: (deltaSeconds: number) => void
  toggleTableMotion: (enabled?: boolean) => boolean
  dispose: () => void
}

interface Preview {
  scene: Scene
  root: Group
  camera: PerspectiveCamera
  update: (deltaSeconds: number) => void
  dispose: () => void
}

const activeMotionToggles = new Set<(enabled?: boolean) => boolean>()

/** Toggles the bounded lift/tilt demonstration. Every new table starts still. */
export function toggleTableMotion(enabled?: boolean): boolean {
  let state = false
  for (const toggle of activeMotionToggles) state = toggle(enabled)
  return state
}

function acquireMaterials(): { materials: Materials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 18901 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 18902 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 18903 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 18904 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 18905 })
  const cushion = library.acquire({ recipeId: 'MAT-05', palette: 'GRAPHITE-800', condition: 'worked', seed: 18906 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 18907 })
  const amberDim = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'maintained', seed: 18908 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 18909 })
  return {
    materials: {
      shell: tuneMaterial(shell, 0xc8ced0, 0.39, 0.3, { clearcoat: 0.16 }),
      shellShade: tuneMaterial(shellShade, 0x929da1, 0.5, 0.28, { clearcoat: 0.09 }),
      graphite: tuneMaterial(graphite, 0x20282e, 0.58, 0.58, { clearcoat: 0.06 }),
      ink: tuneMaterial(ink, 0x05080b, 0.78, 0.2),
      steel: tuneMaterial(steel, 0x6c797e, 0.29, 0.9),
      cushion: tuneMaterial(cushion, 0x171e25, 0.78, 0.07, { clearcoat: 0.035 }),
      amber: tuneMaterial(amber, 0xee9214, 0.2, 0.02, { emissive: 1.05 }),
      amberDim: tuneMaterial(amberDim, 0x9e580d, 0.4, 0.04, { emissive: 0.42 }),
      cyan: tuneMaterial(cyan, 0x18a7b8, 0.25, 0.03, { emissive: 0.78 }),
    },
    handles: [shell, shellShade, graphite, ink, steel, cushion, amber, amberDim, cyan],
  }
}

function addFoot(parent: Group, m: Materials, x: number, z: number): void {
  parent.add(
    prism(m.graphite, [0.62, 0.2, 0.58], [x, 0.1, z], { chamfer: [0.11, 0.11, 0.06, 0.06], fillet: 0.03, bevel: 0.024 }),
    prism(m.steel, [0.36, 0.028, 0.34], [x, 0.014, z], { chamfer: 0.06, fillet: 0.016, bevel: 0.013 }),
  )
}

function addBase(parent: Group, m: Materials): void {
  for (const [x, z] of [[-1.04, -1.26], [1.04, -1.26], [-1.04, 1.26], [1.04, 1.26]] as const) addFoot(parent, m, x, z)
  parent.add(
    prism(m.graphite, [2.72, 0.25, 3.32], [0, 0.25, 0.02], { chamfer: [0.22, 0.22, 0.14, 0.14], fillet: 0.06, bevel: 0.048 }),
    prism(m.shellShade, [2.55, 0.54, 3.12], [0, 0.5, 0.02], { chamfer: [0.25, 0.25, 0.16, 0.16], fillet: 0.065, bevel: 0.052 }),
    prism(m.shell, [2.42, 0.63, 2.98], [0, 0.61, 0], { chamfer: [0.24, 0.24, 0.15, 0.15], fillet: 0.062, bevel: 0.05 }),
    prism(m.graphite, [1.82, 0.12, 2.1], [0, 0.96, -0.12], { chamfer: 0.15, fillet: 0.043, bevel: 0.034 }),
    prism(m.ink, [1.56, 0.075, 1.84], [0, 1.045, -0.12], { chamfer: 0.13, fillet: 0.038, bevel: 0.03 }),
    // Twin recessed top wells remain visible beside the offset lift column.
    prism(m.ink, [0.48, 0.045, 1.16], [-0.96, 0.955, 0.14], { chamfer: 0.07, fillet: 0.021, bevel: 0.017 }),
    prism(m.ink, [0.48, 0.045, 1.16], [0.96, 0.955, 0.14], { chamfer: 0.07, fillet: 0.021, bevel: 0.017 }),
  )

  // The front service drawer is a closed mass with a seated inset face, not UI.
  parent.add(
    prism(m.graphite, [1.55, 0.46, 0.13], [0.22, 0.55, 1.55], { chamfer: 0.09, fillet: 0.027, bevel: 0.021 }),
    prism(m.ink, [1.25, 0.28, 0.045], [0.22, 0.55, 1.65], { chamfer: 0.07, fillet: 0.021, bevel: 0.017 }),
    prism(m.amberDim, [0.055, 0.23, 0.025], [-0.37, 0.55, 1.692], { chamfer: 0.012, fillet: 0.004, bevel: 0.003 }),
    prism(m.amberDim, [0.055, 0.23, 0.025], [0.81, 0.55, 1.692], { chamfer: 0.012, fillet: 0.004, bevel: 0.003 }),
    prism(m.cyan, [0.42, 0.045, 0.025], [0.22, 0.55, 1.692], { chamfer: 0.012, fillet: 0.004, bevel: 0.003 }),
  )
  for (const x of [-1.09, 1.09]) parent.add(cylinder(m.steel, 0.085, 0.08, [x, 0.5, 1.53], [Math.PI / 2, 0, 0], 12))

  // Left-side power cassette and horizontal cylinder mirror the reference's
  // heavy service anatomy while remaining swallowed by the shell opening.
  parent.add(
    prism(m.graphite, [0.12, 0.42, 0.96], [1.25, 0.62, 0.24], { chamfer: 0.055, fillet: 0.017, bevel: 0.013 }),
    cylinder(m.graphite, 0.19, 0.54, [1.38, 0.64, 0.17], [0, 0, Math.PI / 2], 14),
    cylinder(m.steel, 0.13, 0.56, [1.39, 0.64, 0.17], [0, 0, Math.PI / 2], 12),
    cylinder(m.cyan, 0.145, 0.045, [1.68, 0.64, 0.17], [0, 0, Math.PI / 2], 12),
  )
  // A true left service hatch and seated fasteners break the broad base flank.
  parent.add(
    prism(m.graphite, [0.055, 0.48, 0.92], [-1.245, 0.56, 0.48], { chamfer: 0.055, fillet: 0.017, bevel: 0.013 }),
    prism(m.ink, [0.025, 0.28, 0.62], [-1.29, 0.56, 0.48], { chamfer: 0.035, fillet: 0.011, bevel: 0.009 }),
    prism(m.amberDim, [0.018, 0.08, 0.28], [-1.32, 0.56, 0.68], { chamfer: 0.012, fillet: 0.004, bevel: 0.003 }),
  )
  for (const z of [0.14, 0.82]) parent.add(cylinder(m.steel, 0.035, 0.04, [-1.3, 0.56, z], [0, 0, Math.PI / 2], 8))
}

function addFixedPedestal(parent: Group, m: Materials): void {
  parent.add(
    prism(m.graphite, [1.62, 0.96, 1.52], [0, 1.16, -0.24], { chamfer: [0.18, 0.18, 0.11, 0.11], fillet: 0.05, bevel: 0.04 }),
    prism(m.shellShade, [1.44, 0.84, 1.3], [0, 1.2, -0.16], { chamfer: [0.16, 0.16, 0.1, 0.1], fillet: 0.046, bevel: 0.037 }),
    prism(m.graphite, [1.22, 0.58, 1.18], [0, 1.5, -0.34], { chamfer: 0.13, fillet: 0.038, bevel: 0.03 }),
    prism(m.ink, [0.98, 0.44, 0.72], [0, 1.53, -0.73], { chamfer: 0.09, fillet: 0.027, bevel: 0.021 }),
  )
  parent.add(
    prism(m.graphite, [0.72, 0.55, 0.08], [0, 1.17, 0.61], { chamfer: 0.07, fillet: 0.022, bevel: 0.018 }),
    prism(m.ink, [0.48, 0.34, 0.035], [0, 1.17, 0.67], { chamfer: 0.045, fillet: 0.014, bevel: 0.011 }),
    prism(m.cyan, [0.07, 0.25, 0.02], [-0.09, 1.17, 0.71], { chamfer: 0.014, fillet: 0.005, bevel: 0.004 }),
    prism(m.cyan, [0.07, 0.25, 0.02], [0.09, 1.17, 0.71], { chamfer: 0.014, fillet: 0.005, bevel: 0.004 }),
  )
}

function buildLiftCarriage(m: Materials): Group {
  const carriage = new Group()
  carriage.name = 'examination table / lifting carriage'
  carriage.add(
    prism(m.graphite, [1.42, 0.84, 1.34], [0, 0.27, -0.25], { chamfer: [0.17, 0.17, 0.1, 0.1], fillet: 0.048, bevel: 0.038 }),
    prism(m.shell, [1.27, 0.7, 1.15], [0, 0.42, -0.13], { chamfer: [0.16, 0.16, 0.09, 0.09], fillet: 0.044, bevel: 0.035 }),
    prism(m.graphite, [1.7, 0.22, 1.52], [0, 0.81, -0.08], { chamfer: 0.13, fillet: 0.038, bevel: 0.03 }),
    prism(m.steel, [1.35, 0.1, 1.16], [0, 0.94, -0.08], { chamfer: 0.1, fillet: 0.03, bevel: 0.024 }),
    prism(m.ink, [0.82, 0.38, 0.1], [0, 0.38, 0.5], { chamfer: 0.07, fillet: 0.022, bevel: 0.018 }),
    prism(m.cyan, [0.08, 0.24, 0.025], [-0.1, 0.38, 0.57], { chamfer: 0.014, fillet: 0.005, bevel: 0.004 }),
    prism(m.cyan, [0.08, 0.24, 0.025], [0.1, 0.38, 0.57], { chamfer: 0.014, fillet: 0.005, bevel: 0.004 }),
  )
  return carriage
}

function addBedFrame(parent: Group, m: Materials): void {
  parent.add(
    prism(m.graphite, [2.55, 0.28, 5.92], [0, -0.02, 0], { chamfer: [0.24, 0.24, 0.14, 0.14], fillet: 0.06, bevel: 0.048 }),
    prism(m.shellShade, [2.46, 0.31, 5.82], [0, 0.11, 0], { chamfer: [0.23, 0.23, 0.13, 0.13], fillet: 0.058, bevel: 0.046 }),
    prism(m.shell, [0.22, 0.45, 3.68], [-1.2, 0.12, 1.0], { chamfer: [0.12, 0.1, 0.08, 0.07], fillet: 0.032, bevel: 0.026 }),
    prism(m.shell, [0.22, 0.45, 3.68], [1.2, 0.12, 1.0], { chamfer: [0.12, 0.1, 0.08, 0.07], fillet: 0.032, bevel: 0.026 }),
    prism(m.shell, [2.48, 0.46, 0.34], [0, 0.1, 2.82], { chamfer: [0.18, 0.18, 0.1, 0.1], fillet: 0.048, bevel: 0.038 }),
  )

  // Side service rail, inset lamp, handles and fasteners all clear their host
  // faces by explicit world-unit offsets.
  parent.add(
    prism(m.graphite, [0.08, 0.28, 2.7], [1.345, 0.1, 0.55], { chamfer: 0.04, fillet: 0.012, bevel: 0.01 }),
    prism(m.ink, [0.035, 0.16, 2.25], [1.405, 0.1, 0.55], { chamfer: 0.025, fillet: 0.008, bevel: 0.006 }),
    prism(m.amber, [0.022, 0.07, 1.72], [1.44, 0.1, 0.55], { chamfer: 0.018, fillet: 0.006, bevel: 0.005 }),
    prism(m.graphite, [0.06, 0.2, 0.84], [1.35, 0.1, -1.82], { chamfer: 0.035, fillet: 0.011, bevel: 0.009 }),
    prism(m.graphite, [0.06, 0.2, 0.84], [1.35, 0.1, 1.94], { chamfer: 0.035, fillet: 0.011, bevel: 0.009 }),
  )
  for (const z of [-2.45, -1.35, -0.25, 0.85, 1.95, 2.52]) parent.add(cylinder(m.steel, 0.04, 0.045, [1.36, 0.1, z], [0, 0, Math.PI / 2], 10))
}

function addCushions(parent: Group, m: Materials): void {
  const segments: Array<[number, number]> = [
    [-0.2, 0.88],
    [0.72, 0.88],
    [1.83, 1.22],
  ]
  for (const [z, length] of segments) {
    parent.add(
      prism(m.ink, [2.2, 0.13, length - 0.01], [0, 0.3, z], { chamfer: [0.14, 0.14, 0.09, 0.09], fillet: 0.038, bevel: 0.03 }),
      prism(m.cushion, [2.14, 0.25, length - 0.07], [0, 0.44, z], { chamfer: [0.17, 0.17, 0.1, 0.1], fillet: 0.048, bevel: 0.038 }),
    )
  }
  // Sparse metal corner caps create credible high-contact wear landmarks.
  for (const [x, z] of [[-0.97, -2.73], [0.97, -2.73], [-0.98, 2.25], [0.98, 2.25]] as const) {
    parent.add(prism(m.steel, [0.13, 0.035, 0.14], [x, 0.57, z], { chamfer: 0.025, fillet: 0.008, bevel: 0.006 }))
  }
}

function addRaisedBackrest(parent: Group, m: Materials): void {
  const backrest = new Group()
  backrest.name = 'examination table / raised articulated back section'
  backrest.position.z = -0.76
  backrest.rotation.x = 0.17
  backrest.add(
    prism(m.graphite, [2.48, 0.24, 2.24], [0, 0.02, -1.05], { chamfer: [0.2, 0.2, 0.12, 0.12], fillet: 0.052, bevel: 0.041 }),
    prism(m.shellShade, [2.36, 0.27, 2.16], [0, 0.12, -1.05], { chamfer: [0.19, 0.19, 0.11, 0.11], fillet: 0.05, bevel: 0.04 }),
    prism(m.shell, [0.22, 0.45, 2.2], [-1.2, 0.13, -1.05], { chamfer: [0.13, 0.1, 0.08, 0.07], fillet: 0.033, bevel: 0.026 }),
    prism(m.shell, [0.22, 0.45, 2.2], [1.2, 0.13, -1.05], { chamfer: [0.13, 0.1, 0.08, 0.07], fillet: 0.033, bevel: 0.026 }),
    prism(m.shellShade, [2.34, 0.3, 0.3], [0, 0.08, -2.13], { chamfer: [0.17, 0.17, 0.09, 0.09], fillet: 0.044, bevel: 0.035 }),
  )
  for (const [z, length] of [[-1.62, 1.05], [-0.5, 1.08]] as const) {
    backrest.add(
      prism(m.ink, [2.2, 0.13, length - 0.01], [0, 0.31, z], { chamfer: [0.14, 0.14, 0.09, 0.09], fillet: 0.038, bevel: 0.03 }),
      prism(m.cushion, [2.14, 0.25, length - 0.07], [0, 0.45, z], { chamfer: [0.17, 0.17, 0.1, 0.1], fillet: 0.048, bevel: 0.038 }),
    )
  }
  // Captured hinge barrels bridge the moving backrest and fixed mid-bed rail.
  for (const x of [-0.94, 0.94]) backrest.add(
    cylinder(m.graphite, 0.11, 0.3, [x, 0.16, 0.02], [0, 0, Math.PI / 2], 12),
    cylinder(m.steel, 0.065, 0.32, [x, 0.16, 0.02], [0, 0, Math.PI / 2], 10),
  )
  parent.add(backrest)
}

function addFootEnd(parent: Group, m: Materials): void {
  // A thick graphite cavity captures the luminous bar. The lower white/steel
  // guard penetrates both side returns, so it cannot read as a floating rail.
  parent.add(
    prism(m.graphite, [2.34, 0.58, 0.22], [0, 0.12, 3.02], { chamfer: [0.19, 0.19, 0.11, 0.11], fillet: 0.05, bevel: 0.04 }),
    prism(m.ink, [1.98, 0.34, 0.08], [0, 0.15, 3.18], { chamfer: 0.13, fillet: 0.038, bevel: 0.03 }),
    prism(m.amber, [1.68, 0.19, 0.04], [0, 0.16, 3.245], { chamfer: 0.085, fillet: 0.025, bevel: 0.02 }),
    prism(m.graphite, [2.46, 0.16, 0.22], [0, -0.33, 3.08], { chamfer: 0.09, fillet: 0.027, bevel: 0.021 }),
    prism(m.steel, [2.05, 0.075, 0.15], [0, -0.27, 3.16], { chamfer: 0.06, fillet: 0.018, bevel: 0.014 }),
    prism(m.graphite, [0.18, 0.56, 0.2], [-1.08, -0.05, 3.06], { chamfer: 0.055, fillet: 0.017, bevel: 0.013 }),
    prism(m.graphite, [0.18, 0.56, 0.2], [1.08, -0.05, 3.06], { chamfer: 0.055, fillet: 0.017, bevel: 0.013 }),
  )
}

function buildBed(m: Materials): Group {
  const bed = new Group()
  bed.name = 'examination table / articulated bed'
  addBedFrame(bed, m)
  addCushions(bed, m)
  addRaisedBackrest(bed, m)
  addFootEnd(bed, m)
  return bed
}

function setMemberMatrix(mesh: InstancedMesh, index: number, start: Vec3, end: Vec3, radialScale = 1): void {
  const a = new Vector3(...start)
  const b = new Vector3(...end)
  const direction = b.clone().sub(a)
  const length = direction.length()
  const position = a.add(b).multiplyScalar(0.5)
  const rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize())
  const scale = new Vector3(radialScale, length, radialScale)
  mesh.setMatrixAt(index, new Matrix4().compose(position, rotation, scale))
}

function createMotionRig(parent: Group, m: Materials): MotionRig {
  const armSource = prism(m.shell, [0.25, 1, 0.18], [0, 0, 0], { chamfer: 0.07, fillet: 0.022, bevel: 0.018 })
  const arms = new InstancedMesh(armSource.geometry, m.shell, 2)
  arms.name = 'examination table / bilateral load-bearing lift arms'
  const rods = new InstancedMesh(new CylinderGeometry(0.07, 0.07, 1, 8), m.steel, 2)
  rods.name = 'examination table / exposed actuator rods'
  const sleeves = new InstancedMesh(new CylinderGeometry(0.115, 0.115, 1, 10), m.graphite, 2)
  sleeves.name = 'examination table / actuator sleeves'
  const pivots = new InstancedMesh(new CylinderGeometry(0.18, 0.18, 0.16, 12), m.graphite, 4)
  pivots.name = 'examination table / arm pivot bearings'
  const actuatorPivots = new InstancedMesh(new CylinderGeometry(0.14, 0.14, 0.2, 12), m.graphite, 4)
  actuatorPivots.name = 'examination table / captured actuator endpoint collars'
  parent.add(arms, rods, sleeves, pivots, actuatorPivots)
  return { arms, rods, sleeves, pivots, actuatorPivots }
}

function updateMotionRig(rig: MotionRig, lift: number): void {
  let armIndex = 0
  for (const x of [-0.82, 0.82]) {
    setMemberMatrix(rig.arms, armIndex++, [x, 0.82, 0.72], [x, 2.08 + lift, -0.67])
  }
  setMemberMatrix(rig.sleeves, 0, [-0.62, 0.92, -0.58], [-0.62, 1.48 + lift * 0.42, 0.02])
  setMemberMatrix(rig.sleeves, 1, [0.62, 0.92, -0.58], [0.62, 1.48 + lift * 0.42, 0.02])
  setMemberMatrix(rig.rods, 0, [-0.62, 1.42, -0.02], [-0.62, 2.0 + lift, 0.62])
  setMemberMatrix(rig.rods, 1, [0.62, 1.42, -0.02], [0.62, 2.0 + lift, 0.62])

  const pivotRotation = new Quaternion().setFromEuler(new Euler(0, 0, Math.PI / 2))
  let pivotIndex = 0
  for (const x of [-0.86, 0.86]) for (const [y, z] of [[0.82, 0.72], [2.08 + lift, -0.67]] as const) {
    rig.pivots.setMatrixAt(pivotIndex++, new Matrix4().compose(
      new Vector3(x, y, z),
      pivotRotation,
      new Vector3(1, 1, 1),
    ))
  }
  let actuatorPivotIndex = 0
  for (const x of [-0.62, 0.62]) for (const [y, z] of [[0.92, -0.58], [2.0 + lift, 0.62]] as const) {
    rig.actuatorPivots.setMatrixAt(actuatorPivotIndex++, new Matrix4().compose(
      new Vector3(x, y, z),
      pivotRotation,
      new Vector3(1, 1, 1),
    ))
  }
  rig.arms.instanceMatrix.needsUpdate = true
  rig.rods.instanceMatrix.needsUpdate = true
  rig.sleeves.instanceMatrix.needsUpdate = true
  rig.pivots.instanceMatrix.needsUpdate = true
  rig.actuatorPivots.instanceMatrix.needsUpdate = true
}

function prepareStaticGroup(group: Group, profiles: Map<MeshPhysicalMaterial, WearProfile>, wear: MeshPhysicalMaterial, label: string): Array<{ dispose: () => void }> {
  bakeOcclusion(group, { reach: 0.22 })
  bakeSurfaceAttributes(group, profiles)
  group.traverse((object) => {
    if (!(object instanceof Mesh) || object instanceof InstancedMesh || Array.isArray(object.material)) return
    if (profiles.has(object.material as MeshPhysicalMaterial)) object.material = wear
  })
  return mergeStaticByMaterial(group, {
    retainedAttributes: (material) => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material) => `examination table / ${label} / ${material.name}`,
  })
}

function buildTable(): {
  root: Group
  liftCarriage: Group
  bedPivot: Group
  motionRig: MotionRig
  materials: Materials
  handles: MaterialHandle[]
  wear: MeshPhysicalMaterial
  geometries: Array<{ dispose: () => void }>
} {
  const acquired = acquireMaterials()
  const m = acquired.materials
  const root = new Group()
  root.name = 'medical-examination-table'
  const base = new Group(); base.name = 'examination table / grounded base'
  addBase(base, m)
  addFixedPedestal(base, m)
  root.add(base)

  const liftCarriage = buildLiftCarriage(m)
  liftCarriage.position.y = 1.52
  const bedPivot = new Group()
  bedPivot.name = 'examination table / bed tilt pivot'
  bedPivot.position.y = 0.91
  const bed = buildBed(m)
  bedPivot.add(bed)
  liftCarriage.add(bedPivot)
  root.add(liftCarriage)

  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [m.shell, { rub: 0.52, grime: 0.42, scratch: 0.18 }],
    [m.shellShade, { rub: 0.43, grime: 0.48, scratch: 0.16 }],
    [m.graphite, { rub: 0.13, grime: 0.22, scratch: 0.09 }],
    [m.steel, { rub: 0.18, grime: 0.2, scratch: 0.22 }],
  ])
  const wear = createWearMaterial({ name: 'examination table / localized edge and handling wear', clearcoat: 0.14, clearcoatRoughness: 0.52 })
  liftCarriage.remove(bedPivot)
  const geometries = [
    ...prepareStaticGroup(base, profiles, wear, 'base'),
    ...prepareStaticGroup(liftCarriage, profiles, wear, 'carriage'),
    ...prepareStaticGroup(bed, profiles, wear, 'bed'),
  ]
  bedPivot.add(bed)
  liftCarriage.add(bedPivot)
  const motionRig = createMotionRig(root, m)
  updateMotionRig(motionRig, 0)

  root.updateMatrixWorld(true)
  const bounds = new Box3().setFromObject(root, true)
  root.position.y -= bounds.min.y
  root.updateMatrixWorld(true)
  return { root, liftCarriage, bedPivot, motionRig, materials: m, handles: acquired.handles, wear, geometries }
}

export function createModel(): Controller {
  const rig = buildTable()
  let motionEnabled = false
  let elapsed = 0
  let lift = 0
  let tilt = 0
  const localToggle = (enabled?: boolean): boolean => {
    motionEnabled = enabled ?? !motionEnabled
    return motionEnabled
  }
  activeMotionToggles.add(localToggle)
  return {
    root: rig.root,
    toggleTableMotion: localToggle,
    update: (deltaSeconds: number) => {
      const delta = Math.min(Math.max(deltaSeconds, 0), 0.05)
      if (motionEnabled) {
        elapsed += delta
        lift = (1 - Math.cos(elapsed * 0.92)) * 0.085
        tilt = Math.sin(elapsed * 0.78) * 0.09
      } else {
        const settle = Math.max(0, 1 - delta * 6.5)
        lift *= settle
        tilt *= settle
        if (Math.abs(lift) < 0.00001) lift = 0
        if (Math.abs(tilt) < 0.00001) tilt = 0
      }
      rig.liftCarriage.position.y = 1.52 + lift
      rig.bedPivot.rotation.x = tilt
      updateMotionRig(rig.motionRig, lift)
      rig.materials.amber.emissiveIntensity = 1.05 + (motionEnabled ? Math.sin(elapsed * 1.8) * 0.08 : 0)
      rig.materials.cyan.emissiveIntensity = 0.78 + (motionEnabled ? Math.sin(elapsed * 1.45 + 0.4) * 0.06 : 0)
    },
    dispose: () => {
      activeMotionToggles.delete(localToggle)
      for (const geometry of rig.geometries) geometry.dispose()
      rig.motionRig.arms.geometry.dispose()
      rig.motionRig.rods.geometry.dispose()
      rig.motionRig.sleeves.geometry.dispose()
      rig.motionRig.pivots.geometry.dispose()
      rig.motionRig.actuatorPivots.geometry.dispose()
      rig.wear.dispose()
      for (const handle of rig.handles) handle.release()
    },
  }
}

function camera(aspect: number, position: Vec3, target: Vec3, fov = 31): PerspectiveCamera {
  const result = new PerspectiveCamera(fov, aspect, 0.18, 70)
  result.position.set(...position)
  result.lookAt(...target)
  return result
}

function makePreview(options: { aspect: number }, view: 'beauty' | 'side' | 'rear' | 'low' | 'motion'): Preview {
  const controller = createModel()
  if (view === 'motion') {
    controller.toggleTableMotion(true)
    for (let step = 0; step < 42; step += 1) controller.update(0.05)
  }
  const scene = new Scene()
  scene.background = new Color(0x000000)
  scene.add(controller.root, new HemisphereLight(0xaab7bd, 0x050608, 0.5))
  const key = new DirectionalLight(0xffefdd, 2.75); key.position.set(-6, 9, 8)
  const fill = new DirectionalLight(0x7796ac, 0.74); fill.position.set(8, 5, 8)
  const rim = new DirectionalLight(0x8ca8bc, 1.05); rim.position.set(6, 8, -8)
  const amber = new PointLight(0xff9918, 0.66, 4.5); amber.position.set(0, 2.5, 3.7)
  amber.userData.excludeFromExport = true
  scene.add(key, fill, rim, amber)
  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const previewCamera = view === 'side'
    ? camera(aspect, [6.9, 3.4, 0.2], [0, 1.35, 0], 32)
    : view === 'rear'
      ? camera(aspect, [-5.6, 3.8, -7.5], [0, 1.35, -0.2], 31)
      : view === 'low'
        ? camera(aspect, [5.7, 0.48, 7.6], [0, 1.3, 0.3], 32)
        : camera(aspect, [5.8, 4.15, 7.8], [0, 1.35, 0.15], 31)
  scene.add(previewCamera)
  return {
    scene,
    root: controller.root,
    camera: previewCamera,
    update: controller.update,
    dispose: () => { scene.remove(controller.root); controller.dispose() },
  }
}

export function createPreview(options: { aspect: number }): Preview { return makePreview(options, 'beauty') }
export function createSidePreview(options: { aspect: number }): Preview { return makePreview(options, 'side') }
export function createRearPreview(options: { aspect: number }): Preview { return makePreview(options, 'rear') }
export function createLowPreview(options: { aspect: number }): Preview { return makePreview(options, 'low') }
export function createMotionPreview(options: { aspect: number }): Preview { return makePreview(options, 'motion') }
