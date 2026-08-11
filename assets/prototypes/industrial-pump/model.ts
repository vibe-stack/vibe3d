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
  mergeStaticByMaterial,
  prism,
  type Vec3,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'

const X_AXIS: Vec3 = [0, 0, Math.PI / 2]
const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]

interface PumpMaterials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  edge: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  hose: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  amberGlass: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
  oil: MeshPhysicalMaterial
}

interface PumpController {
  enabled: boolean
}

interface PumpRig {
  root: Group
  impeller: Group
  controller: PumpController
  materials: PumpMaterials
  wear: MeshPhysicalMaterial
  geometries: Array<{ dispose: () => void }>
}

let pumpEnabled = false
const liveControllers = new Set<PumpController>()

/** Toggles every live preview/model instance. The module starts disabled. */
export function togglePump(force?: boolean): boolean {
  pumpEnabled = force ?? !pumpEnabled
  for (const controller of liveControllers) controller.enabled = pumpEnabled
  return pumpEnabled
}

function makeMaterials(): PumpMaterials {
  return {
    shell: new MeshPhysicalMaterial({
      name: 'industrial-pump / maintained ivory armor', color: 0xc9cecc,
      roughness: 0.43, metalness: 0.34, clearcoat: 0.14, clearcoatRoughness: 0.42,
    }),
    shellShade: new MeshPhysicalMaterial({
      name: 'industrial-pump / shadowed shell armor', color: 0x858f91,
      roughness: 0.5, metalness: 0.5, clearcoat: 0.08,
    }),
    graphite: new MeshPhysicalMaterial({
      name: 'industrial-pump / cast graphite', color: 0x10161a,
      roughness: 0.52, metalness: 0.74, clearcoat: 0.06,
    }),
    edge: new MeshPhysicalMaterial({
      name: 'industrial-pump / rubbed dark steel', color: 0x343d41,
      roughness: 0.34, metalness: 0.88, clearcoat: 0.12,
    }),
    steel: new MeshPhysicalMaterial({
      name: 'industrial-pump / flange steel', color: 0xa9b0af,
      roughness: 0.22, metalness: 0.96, clearcoat: 0.22,
    }),
    hose: new MeshPhysicalMaterial({
      name: 'industrial-pump / reinforced service hose', color: 0x171b1d,
      roughness: 0.67, metalness: 0.18, clearcoat: 0.04,
    }),
    amber: new MeshPhysicalMaterial({
      name: 'industrial-pump / amber process light', color: 0xf1a01a,
      roughness: 0.22, metalness: 0.08,
      emissive: new Color(0xff7108), emissiveIntensity: 2.1,
    }),
    amberGlass: new MeshPhysicalMaterial({
      name: 'industrial-pump / amber sight glass', color: 0xffa51e,
      roughness: 0.09, metalness: 0.02, transmission: 0.74,
      thickness: 0.16, ior: 1.46, transparent: true, opacity: 0.36,
      emissive: new Color(0xff6500), emissiveIntensity: 0.42,
    }),
    cyan: new MeshPhysicalMaterial({
      name: 'industrial-pump / cyan status lamps', color: 0x56e4e8,
      roughness: 0.18, metalness: 0.04,
      emissive: new Color(0x20cfd8), emissiveIntensity: 1.9,
    }),
    oil: new MeshPhysicalMaterial({
      name: 'industrial-pump / flange oil and recess grime', color: 0x302b23,
      roughness: 0.82, metalness: 0.2,
    }),
  }
}

function box(
  parent: Group,
  material: MeshPhysicalMaterial,
  size: Vec3,
  position: Vec3,
  chamfer = 0.08,
  bevel = 0.025,
  rotation: Vec3 = [0, 0, 0],
): Mesh {
  const mesh = prism(material, size, position, {
    chamfer,
    fillet: Math.min(0.045, chamfer * 0.3),
    bevel,
    rotation,
  })
  parent.add(mesh)
  return mesh
}

function tube(material: MeshPhysicalMaterial, points: Vec3[], radius: number, segments = 30, radial = 9): Mesh {
  const curve = new CatmullRomCurve3(points.map((point) => new Vector3(...point)), false, 'centripetal')
  return new Mesh(new TubeGeometry(curve, segments, radius, radial, false), material)
}

function ringX(material: MeshPhysicalMaterial, radius: number, tubeRadius: number, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(new TorusGeometry(radius, tubeRadius, 6, 28), material)
  mesh.position.set(x, y, z)
  mesh.rotation.y = Math.PI / 2
  return mesh
}

function boltX(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number, radius = 0.05): void {
  parent.add(cylinder(material, radius, 0.11, [x, y, z], X_AXIS, 9))
}

function boltZ(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number, radius = 0.045): void {
  parent.add(cylinder(material, radius, 0.1, [x, y, z], Z_AXIS, 9))
}

function addSkid(root: Group, m: PumpMaterials): void {
  box(root, m.edge, [5.55, 0.28, 2.75], [0, 0.18, 0], 0.16, 0.04)
  box(root, m.graphite, [5.05, 0.26, 2.35], [-0.05, 0.42, 0], 0.12, 0.03)
  box(root, m.oil, [4.48, 0.035, 1.82], [-0.12, 0.57, 0], 0.05, 0.01)

  for (const x of [-2.35, 2.35]) {
    for (const z of [-1.18, 1.18]) {
      box(root, m.edge, [0.78, 0.16, 0.68], [x, 0.08, z], 0.14, 0.03)
      box(root, m.graphite, [0.55, 0.12, 0.48], [x, 0.18, z], 0.1, 0.025)
      root.add(cylinder(m.steel, 0.075, 0.07, [x, 0.27, z], [0, 0, 0], 10))
    }
  }

  // Saddles overlap both skid tiers and carry pump and motor masses.
  for (const x of [-1.78, 1.4]) {
    box(root, m.shellShade, [0.72, 0.72, 2.05], [x, 0.83, 0], 0.15, 0.04)
    for (const z of [-0.79, 0.79]) box(root, m.edge, [0.34, 0.38, 0.42], [x, 0.57, z], 0.08, 0.025)
  }
}

function addMotor(root: Group, m: PumpMaterials): void {
  // Central ribbed motor cylinder is captured inside both compound armor ends.
  root.add(cylinder(m.graphite, 1.04, 3.18, [0.46, 2.05, 0], X_AXIS, 24))
  for (let x = -0.82; x <= 1.62; x += 0.27) {
    root.add(cylinder(m.edge, 1.09, 0.095, [x, 2.05, 0], X_AXIS, 22))
  }
  root.add(
    cylinder(m.shellShade, 1.21, 0.42, [-1.06, 2.05, 0], X_AXIS, 16),
    cylinder(m.shell, 1.25, 0.58, [1.83, 2.05, 0], X_AXIS, 16),
    cylinder(m.graphite, 1.28, 0.13, [1.55, 2.05, 0], X_AXIS, 18),
  )

  // Faceted white top/side armor ties the right end bell to the skid saddle.
  box(root, m.shell, [1.05, 2.45, 2.28], [1.82, 2.02, 0], 0.26, 0.06)
  box(root, m.shellShade, [0.2, 1.72, 1.85], [1.23, 2.0, 0], 0.1, 0.03)
  box(root, m.graphite, [0.38, 1.18, 1.76], [1.2, 2.02, 0], 0.12, 0.03)
  box(root, m.edge, [0.72, 0.52, 0.22], [1.83, 2.72, 1.12], 0.12, 0.03)
  box(root, m.cyan, [0.34, 0.15, 0.06], [1.83, 2.72, 1.26], 0.045, 0.012)
  box(root, m.shellShade, [0.88, 1.72, 0.16], [1.83, 1.9, 1.21], 0.15, 0.035)
  box(root, m.shell, [0.66, 1.36, 0.12], [1.83, 1.9, 1.34], 0.11, 0.028)
  box(root, m.graphite, [0.44, 0.74, 0.08], [1.83, 1.75, 1.43], 0.08, 0.022)
  for (const [x, y] of [[1.56, 2.5], [2.1, 2.5], [1.56, 1.3], [2.1, 1.3]] as const) {
    boltZ(root, m.steel, x, y, 1.48, 0.038)
  }

  // Handle is supported by two bolted feet on the right shell crown.
  box(root, m.edge, [0.98, 0.18, 0.24], [1.66, 3.47, 0], 0.075, 0.022)
  for (const x of [1.25, 2.07]) {
    box(root, m.graphite, [0.2, 0.35, 0.28], [x, 3.3, 0], 0.055, 0.016)
    root.add(cylinder(m.steel, 0.045, 0.08, [x, 3.15, 0.12], [0, 0, 0], 8))
  }

  // Lower frame rails visually connect both end housings and expose the motor.
  for (const z of [-0.96, 0.96]) box(root, m.shell, [3.55, 0.35, 0.22], [0.37, 0.88, z], 0.08, 0.025)
  for (const z of [-0.92, 0.92]) box(root, m.shellShade, [2.3, 0.25, 0.24], [0.42, 3.03, z], 0.08, 0.024)
  box(root, m.amber, [1.18, 0.18, 0.07], [0.22, 1.25, 1.13], 0.04, 0.012)
}

function addVolute(root: Group, impeller: Group, m: PumpMaterials): void {
  // Thick octagonal volute armor and dark recess stack. The motor axle passes
  // through all rings and is swallowed by the motor core.
  root.add(
    cylinder(m.shellShade, 1.45, 0.52, [-1.72, 2.02, 0], X_AXIS, 16),
    cylinder(m.shell, 1.37, 0.48, [-2.02, 2.02, 0], X_AXIS, 16),
    cylinder(m.graphite, 1.12, 0.34, [-2.3, 2.02, 0], X_AXIS, 18),
    cylinder(m.edge, 0.9, 0.28, [-2.52, 2.02, 0], X_AXIS, 20),
    cylinder(m.oil, 0.72, 0.1, [-2.68, 2.02, 0], X_AXIS, 20),
  )
  root.add(ringX(m.steel, 0.82, 0.07, -2.72, 2.02, 0))
  root.add(ringX(m.edge, 0.68, 0.075, -2.77, 2.02, 0))
  root.add(ringX(m.amber, 0.49, 0.055, -2.8, 2.02, 0))
  root.add(cylinder(m.amberGlass, 0.4, 0.08, [-2.84, 2.02, 0], X_AXIS, 18))

  // Eight seated clamp bridges terminate in the volute ring, never in air.
  for (let i = 0; i < 8; i += 1) {
    const angle = i * Math.PI / 4
    const y = 2.02 + Math.cos(angle) * 1.06
    const z = Math.sin(angle) * 1.06
    const clamp = prism(m.edge, [0.34, 0.16, 0.46], [-2.65, y, z], {
      chamfer: 0.05, fillet: 0.015, bevel: 0.014,
      rotation: [angle, 0, 0],
    })
    root.add(clamp)
    boltX(root, m.steel, -2.84, y, z, 0.045)
  }

  // Impeller lives behind the amber aperture and remains captured by a fixed
  // central axle. It is the only rotating assembly.
  impeller.position.set(-2.76, 2.02, 0)
  impeller.add(cylinder(m.steel, 0.19, 0.22, [0, 0, 0], X_AXIS, 12))
  impeller.add(cylinder(m.amber, 0.23, 0.13, [-0.03, 0, 0], X_AXIS, 14))
  for (let i = 0; i < 7; i += 1) {
    const angle = i * Math.PI * 2 / 7
    const blade = prism(m.steel, [0.08, 0.18, 0.48], [0, Math.cos(angle) * 0.39, Math.sin(angle) * 0.39], {
      chamfer: 0.04, fillet: 0.012, bevel: 0.012, rotation: [angle, 0, 0],
    })
    impeller.add(blade)
  }

  // Front lower intake elbow enters the volute through a deep captured collar.
  root.add(cylinder(m.graphite, 0.43, 0.36, [-2.52, 1.05, 0.02], X_AXIS, 16))
  root.add(tube(m.hose, [
    [-2.58, 1.05, 0.02], [-2.9, 0.96, 0.03], [-3.08, 0.62, 0.04], [-3.08, 0.32, 0.04],
  ], 0.32, 26, 12))
  root.add(cylinder(m.edge, 0.42, 0.2, [-3.08, 0.28, 0.04], [0, 0, 0], 16))

  // Side vents and lower anchored volute legs.
  box(root, m.edge, [0.12, 0.58, 0.54], [-2.05, 2.05, 1.32], 0.07, 0.02)
  for (let y = 1.85; y <= 2.25; y += 0.13) box(root, m.steel, [0.06, 0.045, 0.37], [-2.12, y, 1.42], 0.01, 0.004)
  for (const z of [-0.9, 0.9]) {
    box(root, m.graphite, [0.46, 1.12, 0.46], [-1.83, 0.98, z], 0.1, 0.03)
    boltZ(root, m.steel, -1.83, 0.56, z + Math.sign(z) * 0.24, 0.05)
  }
}

function addTopProcessLine(root: Group, m: PumpMaterials): void {
  const leftX = -1.84
  const glassX = -0.55
  // Both vertical devices emerge from overlapping volute crown collars.
  for (const [x, radius] of [[leftX, 0.48], [glassX, 0.45]] as const) {
    root.add(cylinder(m.graphite, radius, 0.3, [x, 3.27, 0], [0, 0, 0], 18))
    root.add(cylinder(m.steel, radius + 0.08, 0.09, [x, 3.14, 0], [0, 0, 0], 18))
  }

  // Amber glass is swallowed by top and bottom collars with an internal stem.
  root.add(cylinder(m.amberGlass, 0.32, 0.62, [glassX, 3.62, 0], [0, 0, 0], 18))
  root.add(cylinder(m.amber, 0.08, 0.58, [glassX, 3.62, 0], [0, 0, 0], 10))
  root.add(cylinder(m.graphite, 0.46, 0.2, [glassX, 3.96, 0], [0, 0, 0], 18))
  root.add(cylinder(m.steel, 0.5, 0.08, [glassX, 3.9, 0], [0, 0, 0], 18))

  // One continuous large elbow connects flange-to-flange.
  root.add(tube(m.graphite, [
    [leftX, 3.35, 0], [leftX, 4.0, 0], [-1.58, 4.34, 0], [-1.12, 4.34, 0],
    [glassX, 4.34, 0], [glassX, 4.15, 0],
  ], 0.32, 36, 12))
  root.add(cylinder(m.shell, 0.41, 0.42, [glassX, 4.14, 0], [0, 0, 0], 16))
  root.add(cylinder(m.edge, 0.45, 0.12, [glassX, 3.98, 0], [0, 0, 0], 18))
  for (const x of [leftX, glassX]) {
    root.add(cylinder(m.edge, 0.42, 0.16, [x, x === leftX ? 3.42 : 4.02, 0], [0, 0, 0], 18))
  }
  box(root, m.amber, [0.52, 0.14, 0.08], [-2.15, 3.06, 0.72], 0.035, 0.01)
}

function addOutletAndCables(root: Group, m: PumpMaterials): void {
  // Right/front outlet elbow exits a collared shell port and enters the service
  // manifold top through a second collar.
  root.add(cylinder(m.graphite, 0.38, 0.34, [1.84, 2.12, 1.18], Z_AXIS, 16))
  root.add(cylinder(m.steel, 0.46, 0.09, [1.84, 2.12, 1.35], Z_AXIS, 16))
  root.add(tube(m.hose, [
    [1.84, 2.12, 1.35], [1.84, 2.12, 1.7], [1.94, 1.88, 1.86], [1.94, 1.55, 1.86],
  ], 0.28, 24, 11))

  box(root, m.edge, [1.18, 1.08, 0.6], [1.95, 1.18, 1.56], 0.14, 0.035)
  box(root, m.graphite, [0.92, 0.82, 0.12], [1.95, 1.18, 1.93], 0.1, 0.026)
  box(root, m.cyan, [0.34, 0.16, 0.06], [1.95, 1.36, 2.02], 0.045, 0.012)
  root.add(cylinder(m.edge, 0.38, 0.16, [1.94, 1.55, 1.73], [0, 0, 0], 16))

  // Four distinct closed service loops. Every endpoint is swallowed by an
  // explicit top or return collar on the same manifold, never left open.
  for (let i = 0; i < 4; i += 1) {
    const x = 1.58 + i * 0.25
    const z = 1.92 + i * 0.045
    const endX = x + 0.08
    root.add(cylinder(m.edge, 0.105, 0.16, [x, 0.96, z], Z_AXIS, 10))
    root.add(cylinder(m.edge, 0.105, 0.16, [endX, 0.55, z], Z_AXIS, 10))
    root.add(tube(m.hose, [
      [x, 0.96, z + 0.04], [x, 0.75, z + 0.05], [x + 0.45, 0.58, z + 0.055],
      [x + 0.68, 0.3, z + 0.04], [x + 0.5, 0.13, z + 0.02],
      [endX, 0.27, z + 0.03], [endX, 0.55, z + 0.04],
    ], 0.07, 24, 7))
  }

  for (const x of [1.64, 2.26]) {
    boltZ(root, m.steel, x, 1.55, 1.96, 0.04)
    boltZ(root, m.steel, x, 0.82, 1.96, 0.04)
  }
}

function buildRig(): PumpRig {
  const materials = makeMaterials()
  const root = new Group()
  root.name = 'industrial pump'
  const fixed = new Group()
  fixed.name = 'fixed pump housing and plumbing'
  const impeller = new Group()
  impeller.name = 'captured internal pump impeller'
  root.add(fixed, impeller)

  addSkid(fixed, materials)
  addMotor(fixed, materials)
  addVolute(fixed, impeller, materials)
  addTopProcessLine(fixed, materials)
  addOutletAndCables(fixed, materials)

  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [materials.shell, { rub: 0.075, grime: 0.035, scratch: 0.01 }],
    [materials.shellShade, { rub: 0.09, grime: 0.055, scratch: 0.012 }],
    [materials.graphite, { rub: 0.09, grime: 0.11, scratch: 0.016 }],
    [materials.edge, { rub: 0.13, grime: 0.075, scratch: 0.02 }],
    [materials.steel, { rub: 0.17, grime: 0.04, scratch: 0.025 }],
    [materials.hose, { rub: 0.05, grime: 0.12, scratch: 0.008 }],
    [materials.oil, { rub: 0.04, grime: 0.24, scratch: 0.006 }],
  ])
  bakeOcclusion(root, { reach: 0.19 })
  bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({
    name: 'industrial-pump / localized process wear',
    clearcoat: 0.1, clearcoatRoughness: 0.46,
  })
  root.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return
    if (profiles.has(object.material)) object.material = wear
  })

  const batchOptions = {
    retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material: { name?: string }): string => material.name ?? 'industrial-pump batch',
  }
  const geometries = [
    ...mergeStaticByMaterial(fixed, batchOptions),
    ...mergeStaticByMaterial(impeller, batchOptions),
  ]

  const controller = { enabled: false }
  liveControllers.add(controller)
  root.userData.togglePump = togglePump
  root.userData.pumpEnabled = false
  return { root, impeller, controller, materials, wear, geometries }
}

export function createModel(): { root: Group; update: (deltaSeconds: number) => void; dispose: () => void } {
  const rig = buildRig()
  return {
    root: rig.root,
    update: (deltaSeconds: number) => {
      const delta = Math.min(Math.max(deltaSeconds, 0), 0.05)
      rig.root.userData.pumpEnabled = rig.controller.enabled
      if (!rig.controller.enabled) return
      rig.impeller.rotation.x += delta * 1.1
      const phase = ((rig.root.userData.pumpPhase as number | undefined) ?? 0) + delta
      rig.root.userData.pumpPhase = phase
      rig.materials.amber.emissiveIntensity = 2.05 + Math.sin(phase * 3) * 0.12
    },
    dispose: () => {
      liveControllers.delete(rig.controller)
      for (const geometry of rig.geometries) geometry.dispose()
      rig.wear.dispose()
      for (const material of Object.values(rig.materials)) material.dispose()
    },
  }
}

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low' | 'cable'; enabled?: boolean } = {}) {
  const model = createModel()
  if (options.enabled) {
    togglePump(true)
    // Produce a deterministic, visibly distinct enabled-state proof without
    // changing the default-off contract or moving any fixed housing.
    for (let step = 0; step < 8; step += 1) model.update(0.05)
  }
  const scene = new Scene()
  scene.background = new Color(0x030608)
  scene.add(model.root)
  scene.add(new HemisphereLight(0xbac5c7, 0x080a0d, 0.82))
  const key = new DirectionalLight(0xffead4, 2.8)
  key.position.set(-7, 9, 9)
  scene.add(key)
  const fill = new DirectionalLight(0x7898c6, 1.05)
  fill.position.set(8, 5, 7)
  scene.add(fill)
  const rim = new DirectionalLight(0x79a6ad, 0.9)
  rim.position.set(6, 8, -8)
  scene.add(rim)

  const floorMaterial = new MeshPhysicalMaterial({ color: 0x090d11, roughness: 0.92, metalness: 0.06 })
  const floorGeometry = new PlaneGeometry(18, 18)
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.004
  floor.userData.excludeFromExport = true
  scene.add(floor)

  const aspect = Number.isFinite(options.aspect) && (options.aspect ?? 0) > 0 ? options.aspect! : 1
  const camera = new PerspectiveCamera(35, aspect, 0.1, 100)
  if (options.mode === 'side') camera.position.set(-8.2, 3.2, 0.15)
  else if (options.mode === 'rear') camera.position.set(6.7, 3.5, -7.6)
  else if (options.mode === 'low') camera.position.set(-6.6, 1.0, 7.0)
  else if (options.mode === 'cable') camera.position.set(5.4, 1.55, 6.2)
  else camera.position.set(-7.1, 4.6, 7.5)
  camera.lookAt(options.mode === 'cable' ? 1.98 : -0.1, options.mode === 'cable' ? 0.85 : 2.02, options.mode === 'cable' ? 1.5 : 0.2)
  scene.add(camera)

  return {
    scene,
    root: model.root,
    camera,
    update: model.update,
    dispose: () => {
      if (options.enabled) togglePump(false)
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
export const createCablePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'cable' })
export const createToggledPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty', enabled: true })
