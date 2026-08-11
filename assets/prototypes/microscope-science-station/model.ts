import {
  Box3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PointLight,
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
  amber: MeshPhysicalMaterial
  amberDim: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
  grime: MeshPhysicalMaterial
}

interface Controller {
  root: Group
  update: (deltaSeconds: number) => void
  toggleScan: (enabled?: boolean) => boolean
  dispose: () => void
}

interface Preview {
  scene: Scene
  root: Group
  camera: PerspectiveCamera
  update: (deltaSeconds: number) => void
  dispose: () => void
}

const activeScanToggles = new Set<(enabled?: boolean) => boolean>()

/** Toggle scan motion on every live controller. New models always start off. */
export function toggleScan(enabled?: boolean): boolean {
  let state = false
  for (const toggle of activeScanToggles) state = toggle(enabled)
  return state
}

function acquireMaterials(): { materials: Materials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 18701 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 18702 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 18703 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 18704 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 18705 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 18706 })
  const amberDim = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'maintained', seed: 18707 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 18708 })
  const grime = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 18709 })
  return {
    materials: {
      shell: tuneMaterial(shell, 0xc8cecf, 0.39, 0.3, { clearcoat: 0.16 }),
      shellShade: tuneMaterial(shellShade, 0x9aa3a5, 0.49, 0.26, { clearcoat: 0.1 }),
      graphite: tuneMaterial(graphite, 0x20282e, 0.58, 0.58, { clearcoat: 0.06 }),
      ink: tuneMaterial(ink, 0x05080a, 0.76, 0.2),
      steel: tuneMaterial(steel, 0x707c80, 0.28, 0.9),
      amber: tuneMaterial(amber, 0xf2a01b, 0.2, 0.02, { emissive: 1.45 }),
      amberDim: tuneMaterial(amberDim, 0x9b590d, 0.42, 0.04, { emissive: 0.44 }),
      cyan: tuneMaterial(cyan, 0x17aab7, 0.24, 0.03, { emissive: 0.92 }),
      grime: tuneMaterial(grime, 0x252321, 0.95, 0.05),
    },
    handles: [shell, shellShade, graphite, ink, steel, amber, amberDim, cyan, grime],
  }
}

function cylinderBetween(material: MeshPhysicalMaterial, start: Vec3, end: Vec3, radius: number, segments = 10): Mesh {
  const a = new Vector3(...start)
  const b = new Vector3(...end)
  const direction = b.clone().sub(a)
  const geometry = new CylinderGeometry(radius, radius, direction.length(), segments)
  const mesh = new Mesh(geometry, material)
  mesh.position.copy(a.clone().add(b).multiplyScalar(0.5))
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize())
  return mesh
}

function addFoot(parent: Group, m: Materials, x: number, z: number): void {
  parent.add(
    prism(m.graphite, [0.64, 0.2, 0.62], [x, 0.1, z], { chamfer: [0.12, 0.12, 0.06, 0.06], fillet: 0.032, bevel: 0.026 }),
    prism(m.steel, [0.38, 0.03, 0.38], [x, 0.015, z], { chamfer: 0.065, fillet: 0.018, bevel: 0.014 }),
  )
}

function addBase(parent: Group, m: Materials): void {
  for (const [x, z] of [[-1.28, 0.82], [1.28, 0.82], [-1.28, -0.82], [1.28, -0.82]] as const) addFoot(parent, m, x, z)
  parent.add(
    prism(m.graphite, [3.05, 0.26, 2.18], [0, 0.25, 0], { chamfer: [0.2, 0.2, 0.12, 0.12], fillet: 0.055, bevel: 0.044 }),
    prism(m.shell, [2.92, 0.46, 2.02], [0, 0.52, 0.06], { chamfer: [0.22, 0.22, 0.14, 0.14], fillet: 0.06, bevel: 0.048 }),
    prism(m.graphite, [2.48, 0.12, 1.58], [-0.08, 0.78, 0.02], { chamfer: 0.13, fillet: 0.038, bevel: 0.03 }),
    prism(m.ink, [2.25, 0.06, 1.36], [-0.08, 0.86, 0.02], { chamfer: 0.1, fillet: 0.03, bevel: 0.024 }),
  )
  // Front controls and side access recesses are seated into the chamfered base.
  parent.add(
    prism(m.graphite, [0.64, 0.24, 0.08], [-0.98, 0.52, 1.08], { chamfer: 0.055, fillet: 0.017, bevel: 0.013 }),
    prism(m.cyan, [0.14, 0.08, 0.025], [-1.11, 0.52, 1.135], { chamfer: 0.016, fillet: 0.005, bevel: 0.004 }),
    prism(m.amber, [0.22, 0.08, 0.025], [-0.86, 0.52, 1.135], { chamfer: 0.016, fillet: 0.005, bevel: 0.004 }),
    prism(m.graphite, [0.72, 0.25, 0.08], [0.78, 0.48, 1.08], { chamfer: 0.055, fillet: 0.017, bevel: 0.013 }),
    prism(m.ink, [0.42, 0.1, 0.025], [0.78, 0.48, 1.135], { chamfer: 0.02, fillet: 0.007, bevel: 0.005 }),
  )
  parent.add(prism(m.grime, [2.52, 0.025, 0.04], [-0.08, 0.84, 0.71], { chamfer: 0.008, fillet: 0.003, bevel: 0.002 }))
}

function addFrame(parent: Group, m: Materials): void {
  // A continuous graphite spine and two interlocking shell members make a
  // supported C-frame rather than a head floating over the stage.
  parent.add(
    prism(m.graphite, [0.76, 2.7, 0.94], [0.82, 2.0, -0.42], { chamfer: [0.14, 0.14, 0.08, 0.08], fillet: 0.04, bevel: 0.032 }),
    prism(m.shell, [0.5, 2.65, 1.02], [1.22, 1.95, -0.42], { chamfer: [0.14, 0.14, 0.08, 0.08], fillet: 0.042, bevel: 0.034, rotation: [0, 0, -0.08] }),
    prism(m.shell, [1.7, 0.5, 1.02], [0.42, 3.16, -0.38], { chamfer: [0.13, 0.13, 0.08, 0.08], fillet: 0.04, bevel: 0.032, rotation: [0, 0, 0.08] }),
    prism(m.shellShade, [0.42, 0.56, 1.04], [1.12, 0.92, -0.32], { chamfer: 0.1, fillet: 0.03, bevel: 0.024 }),
    prism(m.graphite, [1.52, 0.18, 0.72], [0.38, 2.91, -0.13], { chamfer: 0.06, fillet: 0.02, bevel: 0.016, rotation: [0, 0, 0.08] }),
    prism(m.shellShade, [1.34, 0.16, 0.86], [0.52, 3.42, -0.4], { chamfer: 0.07, fillet: 0.022, bevel: 0.018, rotation: [0, 0, 0.08] }),
  )
  parent.add(
    prism(m.graphite, [0.26, 0.9, 0.12], [1.42, 1.7, 0.03], { chamfer: 0.05, fillet: 0.016, bevel: 0.013 }),
    prism(m.ink, [0.16, 0.68, 0.045], [1.42, 1.7, 0.115], { chamfer: 0.035, fillet: 0.011, bevel: 0.009 }),
  )
  for (const y of [1.45, 1.7, 1.95]) parent.add(prism(m.cyan, [0.055, 0.14, 0.025], [1.42, y, 0.15], { chamfer: 0.012, fillet: 0.004, bevel: 0.003 }))
}

function addHead(parent: Group, m: Materials): void {
  parent.add(
    prism(m.graphite, [1.58, 0.88, 1.16], [-0.3, 2.63, 0.05], { chamfer: [0.17, 0.17, 0.1, 0.1], fillet: 0.05, bevel: 0.04 }),
    prism(m.shell, [1.52, 0.92, 1.08], [-0.34, 2.7, 0.12], { chamfer: [0.17, 0.17, 0.1, 0.1], fillet: 0.05, bevel: 0.04 }),
    prism(m.shellShade, [1.4, 0.24, 1.0], [-0.34, 2.26, 0.12], { chamfer: 0.09, fillet: 0.027, bevel: 0.021 }),
    prism(m.graphite, [0.64, 0.62, 0.22], [0.32, 2.66, 0.76], { chamfer: 0.09, fillet: 0.027, bevel: 0.021 }),
    prism(m.shellShade, [1.0, 0.34, 0.18], [-0.4, 3.0, 0.69], { chamfer: [0.12, 0.12, 0.06, 0.06], fillet: 0.028, bevel: 0.022 }),
    prism(m.shellShade, [0.18, 0.46, 0.2], [-1.04, 2.55, 0.68], { chamfer: 0.06, fillet: 0.019, bevel: 0.015 }),
    prism(m.shell, [1.18, 0.22, 0.2], [-0.42, 2.22, 0.68], { chamfer: [0.1, 0.1, 0.05, 0.05], fillet: 0.025, bevel: 0.02 }),
  )
  // Binocular barrels are swallowed by the two head sockets. Their axes are
  // parallel, slightly downward, and terminate in nested metal/amber lenses.
  for (const x of [-0.58, 0.02]) {
    parent.add(prism(m.graphite, [0.42, 0.42, 0.28], [x, 2.58, 0.72], { chamfer: 0.09, fillet: 0.027, bevel: 0.021 }))
    parent.add(cylinderBetween(m.graphite, [x, 2.6, 0.76], [x, 2.46, 1.28], 0.17, 12))
    parent.add(cylinderBetween(m.steel, [x, 2.54, 0.96], [x, 2.515, 1.055], 0.185, 12))
    parent.add(cylinderBetween(m.graphite, [x, 2.505, 1.045], [x, 2.48, 1.14], 0.19, 12))
    parent.add(cylinderBetween(m.steel, [x, 2.47, 1.24], [x, 2.43, 1.39], 0.19, 12))
    parent.add(cylinderBetween(m.ink, [x, 2.44, 1.35], [x, 2.41, 1.46], 0.145, 12))
    parent.add(cylinderBetween(m.amberDim, [x, 2.415, 1.44], [x, 2.4, 1.49], 0.095, 12))
  }
  // Upper camera tube and its illuminated collar are fully seated on the head.
  parent.add(
    cylinder(m.graphite, 0.31, 0.3, [-0.28, 3.3, 0.04], [0, 0, 0], 14),
    cylinder(m.amberDim, 0.32, 0.055, [-0.28, 3.44, 0.04], [0, 0, 0], 14),
    cylinder(m.graphite, 0.35, 0.27, [-0.28, 3.58, 0.04], [0, 0, 0], 14),
    cylinder(m.steel, 0.29, 0.05, [-0.28, 3.74, 0.04], [0, 0, 0], 14),
  )
  parent.add(prism(m.amber, [0.38, 0.08, 0.03], [-0.68, 2.24, 0.68], { chamfer: 0.016, fillet: 0.005, bevel: 0.004 }))
}

function addObjective(parent: Group, m: Materials): void {
  parent.add(
    cylinder(m.shellShade, 0.44, 0.16, [-0.28, 2.18, 0.16], [0, 0, 0], 16),
    cylinder(m.graphite, 0.38, 0.14, [-0.28, 2.04, 0.16], [0, 0, 0], 16),
    cylinder(m.steel, 0.31, 0.07, [-0.28, 1.935, 0.16], [0, 0, 0], 16),
    cylinder(m.graphite, 0.25, 0.14, [-0.28, 1.83, 0.16], [0, 0, 0], 14),
    cylinder(m.steel, 0.18, 0.16, [-0.28, 1.68, 0.16], [0, 0, 0], 14),
    cylinder(m.amberDim, 0.13, 0.05, [-0.28, 1.565, 0.16], [0, 0, 0], 14),
  )
}

function addStageCarrier(parent: Group, m: Materials): void {
  parent.add(
    cylinder(m.graphite, 0.47, 0.18, [-0.25, 0.96, 0.14], [0, 0, 0], 16),
    cylinder(m.steel, 0.39, 0.055, [-0.25, 1.065, 0.14], [0, 0, 0], 16),
    prism(m.graphite, [1.55, 0.2, 1.3], [-0.25, 1.03, 0.17], { chamfer: 0.1, fillet: 0.03, bevel: 0.024 }),
    prism(m.shellShade, [1.34, 0.16, 1.18], [-0.25, 1.13, 0.17], { chamfer: 0.09, fillet: 0.027, bevel: 0.021 }),
  )
  for (const z of [-0.28, 0.56]) parent.add(prism(m.steel, [1.18, 0.07, 0.11], [-0.25, 1.25, z], { chamfer: 0.022, fillet: 0.007, bevel: 0.005 }))
  // Focus bridge and knobs join the stage carrier to the rear spine.
  parent.add(prism(m.graphite, [0.44, 0.48, 0.38], [0.72, 1.28, 0.05], { chamfer: 0.07, fillet: 0.022, bevel: 0.018 }))
  for (const [x, r] of [[0.92, 0.2], [1.02, 0.13]] as const) parent.add(cylinder(m.graphite, r, 0.16, [x, 1.25, 0.32], [0, 0, Math.PI / 2], 14))
  parent.add(
    cylinder(m.amberDim, 0.055, 0.04, [1.11, 1.25, 0.32], [0, 0, Math.PI / 2], 10),
    prism(m.graphite, [0.28, 0.25, 0.22], [0.44, 1.05, 0.72], { chamfer: 0.045, fillet: 0.014, bevel: 0.011 }),
    cylinder(m.graphite, 0.145, 0.16, [0.44, 1.04, 0.84], [Math.PI / 2, 0, 0], 14),
    cylinder(m.steel, 0.08, 0.04, [0.44, 1.04, 0.94], [Math.PI / 2, 0, 0], 10),
    prism(m.graphite, [0.24, 0.22, 0.2], [-0.88, 1.08, 0.58], { chamfer: 0.04, fillet: 0.012, bevel: 0.01 }),
    cylinder(m.graphite, 0.12, 0.13, [-0.88, 1.08, 0.7], [Math.PI / 2, 0, 0], 14),
    cylinder(m.steel, 0.065, 0.035, [-0.88, 1.08, 0.785], [Math.PI / 2, 0, 0], 10),
  )
}

function buildMovingStage(m: Materials): Group {
  const stage = new Group()
  stage.name = 'microscope station / scanning sample stage'
  stage.add(
    prism(m.graphite, [1.38, 0.16, 1.14], [-0.25, 1.36, 0.14], { chamfer: 0.1, fillet: 0.03, bevel: 0.024 }),
    prism(m.steel, [1.12, 0.05, 0.88], [-0.25, 1.465, 0.14], { chamfer: 0.08, fillet: 0.024, bevel: 0.019 }),
    prism(m.ink, [0.88, 0.035, 0.66], [-0.25, 1.51, 0.14], { chamfer: 0.07, fillet: 0.021, bevel: 0.017 }),
    cylinder(m.amberDim, 0.37, 0.04, [-0.25, 1.545, 0.14], [0, 0, 0], 18),
    cylinder(m.steel, 0.29, 0.045, [-0.25, 1.575, 0.14], [0, 0, 0], 18),
    cylinder(m.amber, 0.21, 0.035, [-0.25, 1.615, 0.14], [0, 0, 0], 18),
  )
  for (const x of [-0.73, 0.23]) stage.add(prism(m.graphite, [0.16, 0.2, 0.92], [x, 1.27, 0.14], { chamfer: 0.04, fillet: 0.013, bevel: 0.01 }))
  // Two captured rail shoes move with the stage while remaining wrapped around
  // the fixed X rails. Top clamps and their screws visibly retain the sample.
  for (const z of [-0.28, 0.56]) for (const x of [-0.68, 0.18]) stage.add(
    prism(m.graphite, [0.18, 0.18, 0.22], [x, 1.28, z], { chamfer: 0.035, fillet: 0.011, bevel: 0.009 }),
    cylinder(m.steel, 0.06, 0.12, [x, 1.24, z], [0, 0, Math.PI / 2], 10),
  )
  for (const x of [-0.66, 0.16]) stage.add(
    prism(m.steel, [0.26, 0.055, 0.16], [x, 1.61, 0.38], { chamfer: 0.025, fillet: 0.008, bevel: 0.006, rotation: [0, 0.18, 0] }),
    cylinder(m.graphite, 0.04, 0.08, [x, 1.64, 0.38], [0, 0, 0], 8),
  )
  // Localized oil/contact witness marks remain physically seated inside the
  // specimen deck; unlike procedural broad-shell noise they describe use.
  stage.add(
    prism(m.grime, [0.2, 0.018, 0.07], [-0.58, 1.63, -0.09], { chamfer: 0.018, fillet: 0.005, bevel: 0.004, rotation: [0, -0.18, 0] }),
    prism(m.grime, [0.14, 0.018, 0.06], [0.12, 1.63, 0.06], { chamfer: 0.015, fillet: 0.005, bevel: 0.004, rotation: [0, 0.22, 0] }),
  )
  return stage
}

function addServices(parent: Group, m: Materials): void {
  // Amber tube is captured by upper/lower collars and a rear mounting rail.
  parent.add(
    prism(m.graphite, [0.34, 1.04, 0.28], [0.86, 1.72, 0.45], { chamfer: 0.07, fillet: 0.022, bevel: 0.018 }),
    cylinder(m.graphite, 0.13, 0.14, [0.86, 2.16, 0.61], [0, 0, 0], 12),
    cylinder(m.amber, 0.075, 0.74, [0.86, 1.72, 0.61], [0, 0, 0], 12),
    cylinder(m.steel, 0.13, 0.14, [0.86, 1.29, 0.61], [0, 0, 0], 12),
  )
  parent.add(prism(m.graphite, [0.28, 0.9, 0.12], [1.43, 1.72, -0.02], { chamfer: 0.055, fillet: 0.017, bevel: 0.013 }))
  for (const y of [1.48, 1.72, 1.96]) parent.add(prism(m.cyan, [0.06, 0.14, 0.025], [1.43, y, 0.06], { chamfer: 0.012, fillet: 0.004, bevel: 0.003 }))
  // Machined rear service ribs break up the deep inner spine without creating
  // disconnected greebles: each rib is seated proud of the graphite backplate.
  for (const y of [1.26, 1.43, 1.6]) parent.add(prism(m.ink, [0.42, 0.07, 0.055], [0.66, y, 0.075], { chamfer: 0.014, fillet: 0.004, bevel: 0.003 }))
}

function buildStation(): {
  root: Group
  stage: Group
  materials: Materials
  handles: MaterialHandle[]
  wear: MeshPhysicalMaterial
  geometries: Array<{ dispose: () => void }>
} {
  const acquired = acquireMaterials()
  const m = acquired.materials
  const root = new Group()
  root.name = 'microscope-science-station'
  addBase(root, m)
  addFrame(root, m)
  addHead(root, m)
  addObjective(root, m)
  addStageCarrier(root, m)
  addServices(root, m)
  const stage = buildMovingStage(m)
  root.add(stage)

  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [m.shell, { rub: 0.46, grime: 0.4, scratch: 0.17 }],
    [m.shellShade, { rub: 0.38, grime: 0.46, scratch: 0.15 }],
    [m.graphite, { rub: 0.09, grime: 0.16, scratch: 0.07 }],
    [m.steel, { rub: 0.14, grime: 0.23, scratch: 0.2 }],
  ])
  bakeOcclusion(root, { reach: 0.22 })
  bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'microscope station / localized hand and stage wear', clearcoat: 0.15, clearcoatRoughness: 0.5 })
  root.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return
    if (profiles.has(object.material as MeshPhysicalMaterial)) object.material = wear
  })

  root.remove(stage)
  const staticGeometries = mergeStaticByMaterial(root, {
    retainedAttributes: (material) => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material) => `microscope station / static / ${material.name}`,
  })
  const stageGeometries = mergeStaticByMaterial(stage, {
    retainedAttributes: (material) => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material) => `microscope station / stage / ${material.name}`,
  })
  root.add(stage)
  root.updateMatrixWorld(true)
  const bounds = new Box3().setFromObject(root, true)
  root.position.y -= bounds.min.y
  root.updateMatrixWorld(true)
  return { root, stage, materials: m, handles: acquired.handles, wear, geometries: [...staticGeometries, ...stageGeometries] }
}

export function createModel(): Controller {
  const rig = buildStation()
  let scanEnabled = false
  let elapsed = 0
  let stageOffset = 0
  const localToggle = (enabled?: boolean): boolean => {
    scanEnabled = enabled ?? !scanEnabled
    return scanEnabled
  }
  activeScanToggles.add(localToggle)
  return {
    root: rig.root,
    toggleScan: localToggle,
    update: (deltaSeconds: number) => {
      const delta = Math.min(Math.max(deltaSeconds, 0), 0.05)
      if (scanEnabled) {
        elapsed += delta
        stageOffset = Math.sin(elapsed * 1.25) * 0.11
      } else {
        stageOffset *= Math.max(0, 1 - delta * 6.5)
        if (Math.abs(stageOffset) < 0.00001) stageOffset = 0
      }
      rig.stage.position.x = stageOffset
      rig.materials.amber.emissiveIntensity = 1.3 + (scanEnabled ? Math.sin(elapsed * 2.1) * 0.16 : 0)
      rig.materials.cyan.emissiveIntensity = 0.82 + (scanEnabled ? Math.sin(elapsed * 1.7 + 0.5) * 0.08 : 0)
    },
    dispose: () => {
      activeScanToggles.delete(localToggle)
      for (const geometry of rig.geometries) geometry.dispose()
      rig.wear.dispose()
      for (const handle of rig.handles) handle.release()
    },
  }
}

function camera(aspect: number, position: Vec3, target: Vec3, fov = 31): PerspectiveCamera {
  const result = new PerspectiveCamera(fov, aspect, 0.16, 60)
  result.position.set(...position)
  result.lookAt(...target)
  return result
}

function makePreview(options: { aspect: number }, view: 'beauty' | 'side' | 'rear' | 'low' | 'scan'): Preview {
  const controller = createModel()
  if (view === 'scan') {
    controller.toggleScan(true)
    for (let step = 0; step < 38; step += 1) controller.update(0.05)
  }
  const scene = new Scene()
  scene.background = new Color(0x000000)
  scene.add(controller.root, new HemisphereLight(0xa9b7bf, 0x050609, 0.5))
  const key = new DirectionalLight(0xfff0dd, 2.7); key.position.set(-6, 9, 9)
  const fill = new DirectionalLight(0x6e90aa, 0.72); fill.position.set(8, 5, 7)
  const rim = new DirectionalLight(0x8fa9bc, 1.0); rim.position.set(5, 8, -8)
  const stageLight = new PointLight(0xff9d22, 0.95, 3.5); stageLight.position.set(-0.25, 2.0, 0.7)
  stageLight.userData.excludeFromExport = true
  scene.add(key, fill, rim, stageLight)
  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const previewCamera = view === 'side'
    ? camera(aspect, [5.8, 3.0, 0.25], [0, 1.85, 0.05], 32)
    : view === 'rear'
      ? camera(aspect, [-4.7, 3.3, -5.2], [0, 1.8, 0], 32)
      : view === 'low'
        ? camera(aspect, [4.8, 0.42, 5.2], [0, 1.35, 0.08], 33)
        : view === 'scan'
          ? camera(aspect, [4.2, 2.85, 5.7], [0, 1.8, 0.12], 31)
          : camera(aspect, [4.45, 3.05, 6.0], [0, 1.82, 0.1], 31)
  scene.add(previewCamera)
  return { scene, root: controller.root, camera: previewCamera, update: controller.update, dispose: () => { scene.remove(controller.root); controller.dispose() } }
}

export function createPreview(options: { aspect: number }): Preview { return makePreview(options, 'beauty') }
export function createSidePreview(options: { aspect: number }): Preview { return makePreview(options, 'side') }
export function createRearPreview(options: { aspect: number }): Preview { return makePreview(options, 'rear') }
export function createLowPreview(options: { aspect: number }): Preview { return makePreview(options, 'low') }
export function createScanPreview(options: { aspect: number }): Preview { return makePreview(options, 'scan') }
