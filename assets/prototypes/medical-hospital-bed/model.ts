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
  mattress: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  amberDim: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
}

interface MotionRig {
  liftArms: InstancedMesh
  liftPivots: InstancedMesh
  backRods: InstancedMesh
  backSleeves: InstancedMesh
  backPivots: InstancedMesh
}

interface Controller {
  root: Group
  update: (deltaSeconds: number) => void
  toggleBedMotion: (enabled?: boolean) => boolean
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

/** Toggles the bounded lift/backrest demonstration. New beds remain still. */
export function toggleBedMotion(enabled?: boolean): boolean {
  let state = false
  for (const toggle of activeMotionToggles) state = toggle(enabled)
  return state
}

function acquireMaterials(): { materials: Materials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 19001 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 19002 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 19003 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 19004 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 19005 })
  const mattress = library.acquire({ recipeId: 'MAT-05', palette: 'GRAPHITE-800', condition: 'worked', seed: 19006 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 19007 })
  const amberDim = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'maintained', seed: 19008 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 19009 })
  return {
    materials: {
      shell: tuneMaterial(shell, 0xc9ced0, 0.4, 0.3, { clearcoat: 0.15 }),
      shellShade: tuneMaterial(shellShade, 0x939da1, 0.51, 0.28, { clearcoat: 0.08 }),
      graphite: tuneMaterial(graphite, 0x20282e, 0.59, 0.58, { clearcoat: 0.055 }),
      ink: tuneMaterial(ink, 0x05080b, 0.79, 0.2),
      steel: tuneMaterial(steel, 0x6b787d, 0.3, 0.9),
      mattress: tuneMaterial(mattress, 0x171e28, 0.78, 0.07, { clearcoat: 0.035 }),
      amber: tuneMaterial(amber, 0xee9315, 0.2, 0.02, { emissive: 1.08 }),
      amberDim: tuneMaterial(amberDim, 0x9d590e, 0.41, 0.04, { emissive: 0.4 }),
      cyan: tuneMaterial(cyan, 0x18a8b9, 0.25, 0.03, { emissive: 0.8 }),
    },
    handles: [shell, shellShade, graphite, ink, steel, mattress, amber, amberDim, cyan],
  }
}

function addFoot(parent: Group, m: Materials, x: number, z: number): void {
  parent.add(
    prism(m.graphite, [0.7, 0.2, 0.78], [x, 0.1, z], { chamfer: [0.13, 0.13, 0.08, 0.08], fillet: 0.036, bevel: 0.028 }),
    prism(m.steel, [0.4, 0.025, 0.46], [x, 0.013, z], { chamfer: 0.07, fillet: 0.019, bevel: 0.015 }),
    prism(m.shellShade, [0.48, 0.25, 0.52], [x, 0.25, z], { chamfer: [0.09, 0.09, 0.06, 0.06], fillet: 0.027, bevel: 0.021 }),
  )
}

function addBase(parent: Group, m: Materials): void {
  for (const [x, z] of [[-1.08, -2.24], [1.08, -2.24], [-1.08, 2.24], [1.08, 2.24]] as const) addFoot(parent, m, x, z)
  // The reference reads as an open, load-bearing undercarriage rather than a
  // closed plinth: a shallow floor, two armored longitudinal rails and deep
  // cross-members leave the paired lift mechanism visible from both sides.
  parent.add(
    prism(m.graphite, [2.66, 0.2, 4.92], [0, 0.2, 0], { chamfer: [0.23, 0.23, 0.15, 0.15], fillet: 0.064, bevel: 0.05 }),
    prism(m.ink, [1.58, 0.08, 3.62], [0, 0.34, -0.04], { chamfer: 0.14, fillet: 0.04, bevel: 0.032 }),
    prism(m.shellShade, [0.5, 0.14, 4.58], [-1.03, 0.39, 0], { chamfer: [0.11, 0.11, 0.07, 0.07], fillet: 0.034, bevel: 0.027 }),
    prism(m.shellShade, [0.5, 0.14, 4.58], [1.03, 0.39, 0], { chamfer: [0.11, 0.11, 0.07, 0.07], fillet: 0.034, bevel: 0.027 }),
    prism(m.shell, [0.42, 0.18, 4.38], [-1.03, 0.84, 0], { chamfer: [0.1, 0.1, 0.07, 0.07], fillet: 0.031, bevel: 0.024 }),
    prism(m.shell, [0.42, 0.18, 4.38], [1.03, 0.84, 0], { chamfer: [0.1, 0.1, 0.07, 0.07], fillet: 0.031, bevel: 0.024 }),
    prism(m.shell, [2.24, 0.54, 0.5], [0, 0.58, -2.12], { chamfer: [0.13, 0.13, 0.09, 0.09], fillet: 0.04, bevel: 0.032 }),
    prism(m.shell, [2.24, 0.54, 0.5], [0, 0.58, 2.12], { chamfer: [0.13, 0.13, 0.09, 0.09], fillet: 0.04, bevel: 0.032 }),
    prism(m.graphite, [2.0, 0.16, 0.3], [0, 0.84, -2.1], { chamfer: 0.08, fillet: 0.023, bevel: 0.018 }),
    prism(m.graphite, [2.0, 0.16, 0.3], [0, 0.84, 2.1], { chamfer: 0.08, fillet: 0.023, bevel: 0.018 }),
  )

  // Recessed service cassettes sit inside the near/far longitudinal rails.
  for (const x of [-1.29, 1.29]) {
    parent.add(
      prism(m.graphite, [0.09, 0.32, 1.28], [x, 0.58, -1.18], { chamfer: 0.055, fillet: 0.017, bevel: 0.013 }),
      prism(m.ink, [0.035, 0.18, 0.96], [x + Math.sign(x) * 0.07, 0.58, -1.18], { chamfer: 0.035, fillet: 0.011, bevel: 0.009 }),
      prism(m.graphite, [0.09, 0.32, 1.16], [x, 0.58, 1.28], { chamfer: 0.055, fillet: 0.017, bevel: 0.013 }),
      prism(m.ink, [0.035, 0.18, 0.84], [x + Math.sign(x) * 0.07, 0.58, 1.28], { chamfer: 0.035, fillet: 0.011, bevel: 0.009 }),
    )
  }
  parent.add(
    prism(m.amberDim, [0.025, 0.13, 0.48], [1.355, 0.58, 1.28], { chamfer: 0.025, fillet: 0.008, bevel: 0.006 }),
    prism(m.cyan, [0.025, 0.07, 0.66], [1.355, 0.58, -1.18], { chamfer: 0.018, fillet: 0.006, bevel: 0.005 }),
    // Central actuator tower grows out of the chassis floor and captures the
    // upper lift bearings without sealing the side wells.
    prism(m.graphite, [0.92, 0.42, 1.08], [0, 0.54, 0], { chamfer: 0.1, fillet: 0.03, bevel: 0.024 }),
    prism(m.shellShade, [0.72, 0.38, 0.84], [0, 0.73, 0], { chamfer: 0.085, fillet: 0.026, bevel: 0.02 }),
    prism(m.ink, [0.44, 0.14, 0.56], [0, 0.94, 0], { chamfer: 0.055, fillet: 0.017, bevel: 0.013 }),
    // Captured service conduit runs from the central tower into the rear
    // cross-member; both collars overlap their host volumes.
    cylinder(m.ink, 0.055, 1.34, [0, 0.5, -1.21], [Math.PI / 2, 0, 0], 8),
    cylinder(m.graphite, 0.095, 0.13, [0, 0.5, -0.55], [Math.PI / 2, 0, 0], 10),
    cylinder(m.graphite, 0.095, 0.13, [0, 0.5, -1.87], [Math.PI / 2, 0, 0], 10),
  )
  // Front bumper module is nested into the front cross-member.
  parent.add(
    prism(m.graphite, [1.5, 0.32, 0.16], [0, 0.57, 2.39], { chamfer: 0.09, fillet: 0.027, bevel: 0.021 }),
    prism(m.ink, [1.04, 0.17, 0.04], [0, 0.57, 2.495], { chamfer: 0.06, fillet: 0.018, bevel: 0.014 }),
    prism(m.amber, [0.5, 0.08, 0.025], [0, 0.57, 2.54], { chamfer: 0.025, fillet: 0.008, bevel: 0.006 }),
  )
  for (const x of [-0.62, 0.62]) parent.add(cylinder(m.steel, 0.05, 0.06, [x, 0.57, 2.515], [Math.PI / 2, 0, 0], 10))
}

function buildCarriage(m: Materials): Group {
  const carriage = new Group()
  carriage.name = 'hospital bed / lifting carriage'
  carriage.add(
    prism(m.graphite, [2.2, 0.2, 5.02], [0, 0.02, 0], { chamfer: [0.19, 0.19, 0.12, 0.12], fillet: 0.052, bevel: 0.041 }),
    prism(m.shellShade, [2.36, 0.27, 5.18], [0, 0.16, 0], { chamfer: [0.21, 0.21, 0.13, 0.13], fillet: 0.057, bevel: 0.045 }),
    prism(m.shell, [0.22, 0.42, 5.26], [-1.19, 0.16, 0], { chamfer: [0.1, 0.1, 0.07, 0.07], fillet: 0.03, bevel: 0.024 }),
    prism(m.shell, [0.22, 0.42, 5.26], [1.19, 0.16, 0], { chamfer: [0.1, 0.1, 0.07, 0.07], fillet: 0.03, bevel: 0.024 }),
  )
  // Lower mattress sections remain fully supported by the dark deck cassettes.
  for (const [z, length, width] of [[-0.12, 0.76, 2.06], [0.72, 0.82, 2.1], [1.62, 0.9, 2.04]] as const) {
    carriage.add(
      prism(m.ink, [width + 0.05, 0.14, length - 0.01], [0, 0.38, z], { chamfer: [0.13, 0.13, 0.08, 0.08], fillet: 0.036, bevel: 0.029 }),
      prism(m.mattress, [width, 0.28, length - 0.06], [0, 0.53, z], { chamfer: [0.16, 0.16, 0.1, 0.1], fillet: 0.046, bevel: 0.037 }),
    )
  }
  return carriage
}

function addOpenSideGuard(parent: Group, m: Materials, x: number): void {
  const sx = Math.sign(x)
  const faceX = x + sx * 0.02
  // Three shaped rails and three posts create two true open hand slots. The
  // slight opposing rake keeps the guard from reading as a generic ladder.
  parent.add(
    prism(m.shell, [0.18, 0.2, 2.72], [faceX, 1.05, 0.72], { rotation: [-0.045, 0, 0], chamfer: 0.065, fillet: 0.02, bevel: 0.016 }),
    prism(m.shell, [0.18, 0.15, 2.58], [faceX, 0.73, 0.72], { rotation: [0.025, 0, 0], chamfer: 0.055, fillet: 0.017, bevel: 0.013 }),
    prism(m.shellShade, [0.18, 0.14, 2.52], [faceX, 0.45, 0.72], { chamfer: 0.05, fillet: 0.015, bevel: 0.012 }),
  )
  for (const z of [-0.52, 0.72, 1.94]) parent.add(prism(m.shell, [0.18, 0.74, 0.19], [faceX, 0.74, z], { chamfer: 0.06, fillet: 0.018, bevel: 0.014 }))
  // Substantial hinge blocks overlap the lower guard rail and bed frame.
  for (const z of [-0.38, 1.78]) parent.add(
    prism(m.graphite, [0.24, 0.34, 0.28], [x - sx * 0.02, 0.35, z], { chamfer: 0.055, fillet: 0.017, bevel: 0.013 }),
    cylinder(m.steel, 0.085, 0.22, [x + sx * 0.07, 0.34, z], [0, 0, Math.PI / 2], 12),
  )
  parent.add(
    prism(m.graphite, [0.24, 0.3, 0.34], [x - sx * 0.02, 0.83, -0.48], { chamfer: 0.055, fillet: 0.017, bevel: 0.013 }),
    prism(m.cyan, [0.025, 0.08, 0.18], [x + sx * 0.12, 0.84, -0.48], { chamfer: 0.018, fillet: 0.006, bevel: 0.005 }),
  )
}

function addFootBoard(parent: Group, m: Materials): void {
  const z = 2.79
  // Separate members form real side hand openings around a deep center panel.
  parent.add(
    prism(m.shell, [2.56, 0.25, 0.3], [0, 1.55, z], { chamfer: [0.17, 0.17, 0.1, 0.1], fillet: 0.047, bevel: 0.038 }),
    prism(m.shell, [0.28, 1.44, 0.3], [-1.14, 0.93, z], { rotation: [0, 0, -0.055], chamfer: [0.12, 0.12, 0.08, 0.08], fillet: 0.035, bevel: 0.028 }),
    prism(m.shell, [0.28, 1.44, 0.3], [1.14, 0.93, z], { rotation: [0, 0, 0.055], chamfer: [0.12, 0.12, 0.08, 0.08], fillet: 0.035, bevel: 0.028 }),
    prism(m.shellShade, [2.5, 0.24, 0.3], [0, 0.27, z], { chamfer: [0.16, 0.16, 0.1, 0.1], fillet: 0.045, bevel: 0.036 }),
    prism(m.shell, [1.64, 0.86, 0.24], [0, 0.89, z], { chamfer: [0.15, 0.15, 0.1, 0.1], fillet: 0.043, bevel: 0.034 }),
    prism(m.graphite, [1.46, 0.56, 0.14], [0, 0.86, z + 0.2], { chamfer: 0.11, fillet: 0.033, bevel: 0.026 }),
    prism(m.ink, [1.2, 0.33, 0.05], [0, 0.86, z + 0.305], { chamfer: 0.075, fillet: 0.023, bevel: 0.018 }),
    prism(m.amber, [0.98, 0.15, 0.03], [0, 0.86, z + 0.36], { chamfer: 0.05, fillet: 0.015, bevel: 0.012 }),
  )
  // Central handle is a captured steel cylinder under a dark receiver.
  parent.add(
    prism(m.graphite, [0.74, 0.22, 0.12], [0, 1.33, z + 0.15], { chamfer: 0.06, fillet: 0.018, bevel: 0.014 }),
    cylinder(m.steel, 0.08, 0.52, [0, 1.33, z + 0.24], [0, 0, Math.PI / 2], 12),
  )
}

function addHeadBoard(parent: Group, m: Materials): void {
  const z = -2.79
  parent.add(
    prism(m.shell, [2.5, 0.24, 0.28], [0, 1.6, z], { chamfer: [0.17, 0.17, 0.1, 0.1], fillet: 0.047, bevel: 0.038 }),
    prism(m.shell, [0.27, 1.5, 0.28], [-1.1, 0.96, z], { rotation: [0, 0, -0.045], chamfer: [0.12, 0.12, 0.08, 0.08], fillet: 0.035, bevel: 0.028 }),
    prism(m.shell, [0.27, 1.5, 0.28], [1.1, 0.96, z], { rotation: [0, 0, 0.045], chamfer: [0.12, 0.12, 0.08, 0.08], fillet: 0.035, bevel: 0.028 }),
    prism(m.shellShade, [2.32, 0.22, 0.27], [0, 0.27, z], { chamfer: [0.15, 0.15, 0.09, 0.09], fillet: 0.042, bevel: 0.034 }),
    prism(m.graphite, [0.18, 0.44, 0.12], [-1.0, 0.92, z + 0.17], { chamfer: 0.05, fillet: 0.015, bevel: 0.012 }),
    prism(m.graphite, [0.18, 0.44, 0.12], [1.0, 0.92, z + 0.17], { chamfer: 0.05, fillet: 0.015, bevel: 0.012 }),
    prism(m.amberDim, [0.36, 0.07, 0.025], [-0.72, 1.57, z + 0.15], { chamfer: 0.018, fillet: 0.006, bevel: 0.005 }),
    prism(m.amberDim, [0.36, 0.07, 0.025], [0.72, 1.57, z + 0.15], { chamfer: 0.018, fillet: 0.006, bevel: 0.005 }),
  )
}

function buildBackrest(m: Materials): Group {
  const backrest = new Group()
  backrest.name = 'hospital bed / articulated backrest'
  backrest.add(
    prism(m.graphite, [2.2, 0.2, 2.5], [0, 0.04, -1.22], { chamfer: [0.18, 0.18, 0.11, 0.11], fillet: 0.05, bevel: 0.04 }),
    prism(m.shellShade, [2.12, 0.21, 2.4], [0, 0.16, -1.22], { chamfer: [0.17, 0.17, 0.1, 0.1], fillet: 0.047, bevel: 0.038 }),
    prism(m.ink, [2.08, 0.15, 2.28], [0, 0.34, -1.22], { chamfer: [0.15, 0.15, 0.09, 0.09], fillet: 0.042, bevel: 0.034 }),
    prism(m.mattress, [2.02, 0.29, 2.2], [0, 0.5, -1.22], { chamfer: [0.18, 0.18, 0.11, 0.11], fillet: 0.05, bevel: 0.04 }),
  )
  for (const x of [-0.9, 0.9]) backrest.add(
    cylinder(m.graphite, 0.12, 0.34, [x, 0.15, 0.02], [0, 0, Math.PI / 2], 12),
    cylinder(m.steel, 0.068, 0.36, [x, 0.15, 0.02], [0, 0, Math.PI / 2], 10),
  )
  return backrest
}

function setMemberMatrix(mesh: InstancedMesh, index: number, start: Vec3, end: Vec3, radialScale = 1): void {
  const a = new Vector3(...start)
  const b = new Vector3(...end)
  const direction = b.clone().sub(a)
  const length = direction.length()
  const position = a.add(b).multiplyScalar(0.5)
  const rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize())
  mesh.setMatrixAt(index, new Matrix4().compose(position, rotation, new Vector3(radialScale, length, radialScale)))
}

function createMotionRig(parent: Group, m: Materials): MotionRig {
  const armSource = prism(m.steel, [0.2, 1, 0.16], [0, 0, 0], { chamfer: 0.055, fillet: 0.017, bevel: 0.013 })
  const liftArms = new InstancedMesh(armSource.geometry, m.steel, 4)
  liftArms.name = 'hospital bed / four articulated lift links'
  const liftPivots = new InstancedMesh(new CylinderGeometry(0.15, 0.15, 0.17, 12), m.steel, 8)
  liftPivots.name = 'hospital bed / captured lift bearings'
  const backRods = new InstancedMesh(new CylinderGeometry(0.065, 0.065, 1, 8), m.steel, 2)
  backRods.name = 'hospital bed / backrest actuator rods'
  const backSleeves = new InstancedMesh(new CylinderGeometry(0.11, 0.11, 1, 10), m.graphite, 2)
  backSleeves.name = 'hospital bed / backrest actuator sleeves'
  const backPivots = new InstancedMesh(new CylinderGeometry(0.135, 0.135, 0.2, 12), m.graphite, 4)
  backPivots.name = 'hospital bed / captured actuator endpoints'
  parent.add(liftArms, liftPivots, backRods, backSleeves, backPivots)
  return { liftArms, liftPivots, backRods, backSleeves, backPivots }
}

function updateMotionRig(rig: MotionRig, lift: number, backAngle: number): void {
  let armIndex = 0
  const armEndpoints: Array<[Vec3, Vec3]> = []
  for (const x of [-0.78, 0.78]) {
    armEndpoints.push(
      [[x, 0.62, -0.72], [x, 1.19 + lift, 0.62]],
      [[x, 0.62, 0.72], [x, 1.19 + lift, -0.62]],
    )
  }
  for (const [start, end] of armEndpoints) setMemberMatrix(rig.liftArms, armIndex++, start, end)
  const pivotRotation = new Quaternion().setFromEuler(new Euler(0, 0, Math.PI / 2))
  let pivotIndex = 0
  for (const [start, end] of armEndpoints) for (const point of [start, end]) {
    rig.liftPivots.setMatrixAt(pivotIndex++, new Matrix4().compose(new Vector3(...point), pivotRotation, new Vector3(1, 1, 1)))
  }

  const pivotY = 1.28 + lift
  const pivotZ = -0.42
  const localTop = new Vector3(0, -0.08, -0.9).applyEuler(new Euler(backAngle, 0, 0))
  for (const [index, x] of [-0.62, 0.62].entries()) {
    const sleeveBottom: Vec3 = [x, 0.72, -0.05]
    const sleeveTop: Vec3 = [x, 0.98 + lift * 0.45, -0.42]
    const rodBottom: Vec3 = [x, 0.93 + lift * 0.35, -0.36]
    const rodTop: Vec3 = [x, pivotY + localTop.y, pivotZ + localTop.z]
    setMemberMatrix(rig.backSleeves, index, sleeveBottom, sleeveTop)
    setMemberMatrix(rig.backRods, index, rodBottom, rodTop)
    rig.backPivots.setMatrixAt(index * 2, new Matrix4().compose(new Vector3(...sleeveBottom), pivotRotation, new Vector3(1, 1, 1)))
    rig.backPivots.setMatrixAt(index * 2 + 1, new Matrix4().compose(new Vector3(...rodTop), pivotRotation, new Vector3(1, 1, 1)))
  }
  for (const mesh of [rig.liftArms, rig.liftPivots, rig.backRods, rig.backSleeves, rig.backPivots]) mesh.instanceMatrix.needsUpdate = true
}

function prepareStatic(group: Group, profiles: Map<MeshPhysicalMaterial, WearProfile>, wear: MeshPhysicalMaterial, label: string): Array<{ dispose: () => void }> {
  bakeOcclusion(group, { reach: 0.2 })
  bakeSurfaceAttributes(group, profiles)
  group.traverse((object) => {
    if (!(object instanceof Mesh) || object instanceof InstancedMesh || Array.isArray(object.material)) return
    if (profiles.has(object.material as MeshPhysicalMaterial)) object.material = wear
  })
  return mergeStaticByMaterial(group, {
    retainedAttributes: (material) => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material) => `hospital bed / ${label} / ${material.name}`,
  })
}

function buildBed(): {
  root: Group
  carriage: Group
  backrestPivot: Group
  motionRig: MotionRig
  materials: Materials
  handles: MaterialHandle[]
  wear: MeshPhysicalMaterial
  geometries: Array<{ dispose: () => void }>
} {
  const acquired = acquireMaterials()
  const m = acquired.materials
  const root = new Group(); root.name = 'medical-hospital-bed'
  const base = new Group(); base.name = 'hospital bed / grounded service base'
  addBase(base, m)
  root.add(base)
  const carriage = buildCarriage(m)
  carriage.position.y = 1.08
  addOpenSideGuard(carriage, m, -1.28)
  addOpenSideGuard(carriage, m, 1.28)
  addFootBoard(carriage, m)
  addHeadBoard(carriage, m)
  const backrestPivot = new Group()
  backrestPivot.name = 'hospital bed / backrest hinge'
  backrestPivot.position.set(0, 0.18, -0.42)
  const backrest = buildBackrest(m)
  backrestPivot.add(backrest)
  carriage.add(backrestPivot)
  root.add(carriage)

  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [m.shell, { rub: 0.55, grime: 0.45, scratch: 0.2 }],
    [m.shellShade, { rub: 0.46, grime: 0.5, scratch: 0.17 }],
    [m.graphite, { rub: 0.14, grime: 0.24, scratch: 0.09 }],
    [m.steel, { rub: 0.2, grime: 0.2, scratch: 0.23 }],
  ])
  const wear = createWearMaterial({ name: 'hospital bed / localized rail and handling wear', clearcoat: 0.13, clearcoatRoughness: 0.54 })
  carriage.remove(backrestPivot)
  const geometries = [
    ...prepareStatic(base, profiles, wear, 'base'),
    ...prepareStatic(carriage, profiles, wear, 'carriage and boards'),
    ...prepareStatic(backrest, profiles, wear, 'backrest'),
  ]
  backrestPivot.add(backrest)
  carriage.add(backrestPivot)
  const motionRig = createMotionRig(root, m)
  updateMotionRig(motionRig, 0, 0.43)
  backrestPivot.rotation.x = 0.43

  root.updateMatrixWorld(true)
  const bounds = new Box3().setFromObject(root, true)
  root.position.y -= bounds.min.y
  root.updateMatrixWorld(true)
  return { root, carriage, backrestPivot, motionRig, materials: m, handles: acquired.handles, wear, geometries }
}

export function createModel(): Controller {
  const rig = buildBed()
  const restAngle = 0.43
  let motionEnabled = false
  let elapsed = 0
  let lift = 0
  let angle = restAngle
  const localToggle = (enabled?: boolean): boolean => {
    motionEnabled = enabled ?? !motionEnabled
    return motionEnabled
  }
  activeMotionToggles.add(localToggle)
  return {
    root: rig.root,
    toggleBedMotion: localToggle,
    update: (deltaSeconds: number) => {
      const delta = Math.min(Math.max(deltaSeconds, 0), 0.05)
      if (motionEnabled) {
        elapsed += delta
        lift = (1 - Math.cos(elapsed * 0.9)) * 0.065
        angle = restAngle + Math.sin(elapsed * 0.72) * 0.1
      } else {
        const settle = Math.max(0, 1 - delta * 6.5)
        lift *= settle
        angle = restAngle + (angle - restAngle) * settle
        if (Math.abs(lift) < 0.00001) lift = 0
        if (Math.abs(angle - restAngle) < 0.00001) angle = restAngle
      }
      rig.carriage.position.y = 1.08 + lift
      rig.backrestPivot.rotation.x = angle
      updateMotionRig(rig.motionRig, lift, angle)
      rig.materials.amber.emissiveIntensity = 1.04 + (motionEnabled ? Math.sin(elapsed * 1.8) * 0.08 : 0)
      rig.materials.cyan.emissiveIntensity = 0.76 + (motionEnabled ? Math.sin(elapsed * 1.5 + 0.4) * 0.06 : 0)
    },
    dispose: () => {
      activeMotionToggles.delete(localToggle)
      for (const geometry of rig.geometries) geometry.dispose()
      for (const mesh of [rig.motionRig.liftArms, rig.motionRig.liftPivots, rig.motionRig.backRods, rig.motionRig.backSleeves, rig.motionRig.backPivots]) mesh.geometry.dispose()
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
    controller.toggleBedMotion(true)
    for (let step = 0; step < 44; step += 1) controller.update(0.05)
  }
  const scene = new Scene()
  scene.background = new Color(0x000000)
  scene.add(controller.root, new HemisphereLight(0xaab7bd, 0x050608, 0.5))
  const key = new DirectionalLight(0xffefdd, 2.7); key.position.set(-6, 9, 8)
  const fill = new DirectionalLight(0x7898ad, 0.74); fill.position.set(8, 5, 8)
  const rim = new DirectionalLight(0x8ca8bd, 1.05); rim.position.set(6, 8, -8)
  const amber = new PointLight(0xff9818, 0.62, 4.2); amber.position.set(0, 1.4, 3.3)
  amber.userData.excludeFromExport = true
  scene.add(key, fill, rim, amber)
  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const previewCamera = view === 'side'
    ? camera(aspect, [6.8, 2.9, 0.2], [0, 1.05, 0], 32)
    : view === 'rear'
      ? camera(aspect, [-5.7, 3.4, -7.2], [0, 1.05, -0.2], 31)
      : view === 'low'
        ? camera(aspect, [5.6, 0.32, 7.4], [0, 0.95, 0.25], 32)
        : camera(aspect, [5.5, 3.35, 7.5], [0, 1.1, 0.15], 31)
  scene.add(previewCamera)
  return { scene, root: controller.root, camera: previewCamera, update: controller.update, dispose: () => { scene.remove(controller.root); controller.dispose() } }
}

export function createPreview(options: { aspect: number }): Preview { return makePreview(options, 'beauty') }
export function createSidePreview(options: { aspect: number }): Preview { return makePreview(options, 'side') }
export function createRearPreview(options: { aspect: number }): Preview { return makePreview(options, 'rear') }
export function createLowPreview(options: { aspect: number }): Preview { return makePreview(options, 'low') }
export function createMotionPreview(options: { aspect: number }): Preview { return makePreview(options, 'motion') }
