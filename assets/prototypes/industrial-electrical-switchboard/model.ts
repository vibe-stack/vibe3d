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

interface SwitchboardMaterials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  edge: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  conduit: MeshPhysicalMaterial
  grime: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  amberDim: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
}

interface SwitchController {
  enabled: boolean
}

interface SwitchboardRig {
  root: Group
  lever: Group
  controller: SwitchController
  materials: SwitchboardMaterials
  wear: MeshPhysicalMaterial
  geometries: Array<{ dispose: () => void }>
}

let breakerEnabled = false
const liveControllers = new Set<SwitchController>()

/** Toggles every live breaker demonstration. The default state is off. */
export function toggleSwitchboard(force?: boolean): boolean {
  breakerEnabled = force ?? !breakerEnabled
  for (const controller of liveControllers) controller.enabled = breakerEnabled
  return breakerEnabled
}

function materials(): SwitchboardMaterials {
  return {
    shell: new MeshPhysicalMaterial({
      name: 'industrial-electrical-switchboard / maintained ivory armor',
      color: 0xcbd0cd, roughness: 0.46, metalness: 0.33,
      clearcoat: 0.13, clearcoatRoughness: 0.43,
    }),
    shellShade: new MeshPhysicalMaterial({
      name: 'industrial-electrical-switchboard / shadowed shell armor',
      color: 0x8b9493, roughness: 0.52, metalness: 0.48,
      clearcoat: 0.08,
    }),
    graphite: new MeshPhysicalMaterial({
      name: 'industrial-electrical-switchboard / graphite service chassis',
      color: 0x11171b, roughness: 0.57, metalness: 0.73,
      clearcoat: 0.06,
    }),
    edge: new MeshPhysicalMaterial({
      name: 'industrial-electrical-switchboard / rubbed structural steel',
      color: 0x343d41, roughness: 0.36, metalness: 0.88,
      clearcoat: 0.11,
    }),
    steel: new MeshPhysicalMaterial({
      name: 'industrial-electrical-switchboard / fastener steel',
      color: 0xa0a7a6, roughness: 0.24, metalness: 0.97,
      clearcoat: 0.22,
    }),
    conduit: new MeshPhysicalMaterial({
      name: 'industrial-electrical-switchboard / armored electrical conduit',
      color: 0x242a2d, roughness: 0.5, metalness: 0.71,
      clearcoat: 0.07,
    }),
    grime: new MeshPhysicalMaterial({
      name: 'industrial-electrical-switchboard / seam and cable grime',
      color: 0x29251f, roughness: 0.84, metalness: 0.15,
    }),
    amber: new MeshPhysicalMaterial({
      name: 'industrial-electrical-switchboard / active amber switch hardware',
      color: 0xd77808, roughness: 0.27, metalness: 0.14,
      emissive: new Color(0xff4300), emissiveIntensity: 0.95,
    }),
    amberDim: new MeshPhysicalMaterial({
      name: 'industrial-electrical-switchboard / amber status lenses',
      color: 0xc9790d, roughness: 0.22, metalness: 0.05,
      emissive: new Color(0xff4b00), emissiveIntensity: 0.55,
    }),
    cyan: new MeshPhysicalMaterial({
      name: 'industrial-electrical-switchboard / cyan service witness',
      color: 0x56dfe7, roughness: 0.18, metalness: 0.04,
      emissive: new Color(0x20cbd5), emissiveIntensity: 1.7,
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

function pipeCurve(material: MeshPhysicalMaterial, points: Vec3[], radius: number, segments = 32): Mesh {
  const curve = new CatmullRomCurve3(points.map((point) => new Vector3(...point)), false, 'centripetal')
  return new Mesh(new TubeGeometry(curve, segments, radius, 9, false), material)
}

function boltZ(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number, radius = 0.045): void {
  parent.add(cylinder(material, radius, 0.13, [x, y, z], Z_AXIS, 8))
}

function addCabinet(root: Group, m: SwitchboardMaterials): void {
  // Cabinet and four integrated corner feet establish minY=0 without a plinth.
  box(root, m.shellShade, [4.25, 5.7, 1.18], [0, 2.89, 0], 0.25, 0.06)
  box(root, m.shell, [4.02, 5.44, 1.22], [0, 2.94, 0.04], 0.22, 0.055)
  for (const x of [-1.76, 1.76]) {
    box(root, m.edge, [0.68, 0.52, 1.28], [x, 0.26, 0], 0.16, 0.04)
    box(root, m.graphite, [0.46, 0.18, 1.0], [x, 0.09, 0], 0.1, 0.028)
    root.add(cylinder(m.steel, 0.075, 0.07, [x, 0.48, 0.66], Z_AXIS, 9))
  }

  // Crown and corner armor carry the clipped rectangular reference silhouette.
  box(root, m.shell, [4.16, 0.58, 1.34], [0, 5.55, 0.05], 0.22, 0.055)
  for (const x of [-1.78, 1.78]) {
    box(root, m.shellShade, [0.58, 0.78, 1.38], [x, 5.34, 0.02], 0.19, 0.045)
    box(root, m.edge, [0.58, 0.72, 1.36], [x, 0.44, 0.01], 0.18, 0.045)
  }

  // Rear service closure prevents a hollow one-sided facade.
  box(root, m.shellShade, [3.58, 4.86, 0.18], [0, 2.92, -0.69], 0.18, 0.04)
  box(root, m.graphite, [3.14, 1.48, 0.12], [0, 3.58, -0.82], 0.14, 0.032)
  for (const y of [3.1, 3.42, 3.74, 4.06]) {
    box(root, m.edge, [2.6, 0.12, 0.08], [0, y, -0.91], 0.045, 0.014)
  }
  box(root, m.edge, [1.86, 0.68, 0.1], [0.46, 1.38, -0.88], 0.1, 0.026)
  for (const x of [-1.55, 1.55]) {
    for (const y of [0.72, 5.25]) boltZ(root, m.steel, x, y, -0.82, 0.042)
  }
}

function addCoolingColumn(root: Group, m: SwitchboardMaterials): void {
  // Tall graphite bezel is physically proud of the pale door by 120 mm.
  box(root, m.edge, [1.02, 2.46, 0.28], [-1.48, 3.76, 0.73], 0.15, 0.038)
  box(root, m.graphite, [0.78, 2.18, 0.22], [-1.48, 3.76, 0.94], 0.12, 0.03)
  box(root, m.grime, [0.58, 1.86, 0.12], [-1.48, 3.76, 1.1], 0.09, 0.024)
  for (let index = 0; index < 11; index += 1) {
    box(root, m.edge, [0.5, 0.075, 0.14], [-1.48, 2.95 + index * 0.16, 1.2], 0.03, 0.01)
  }
  for (const y of [2.7, 4.82]) {
    for (const x of [-1.82, -1.14]) boltZ(root, m.steel, x, y, 1.09, 0.035)
  }

  // Crown exhaust repeats the same real slat construction horizontally.
  box(root, m.edge, [1.94, 0.54, 0.24], [0.72, 5.15, 0.76], 0.12, 0.032)
  box(root, m.graphite, [1.7, 0.34, 0.16], [0.72, 5.15, 0.96], 0.085, 0.024)
  for (let index = 0; index < 5; index += 1) {
    box(root, m.edge, [1.48, 0.04, 0.1], [0.72, 5.02 + index * 0.065, 1.08], 0.018, 0.006)
  }
}

function addConduits(root: Group, m: SwitchboardMaterials): void {
  // Recess and top sockets swallow both continuous conduit starts.
  box(root, m.edge, [1.0, 1.68, 0.3], [-1.48, 1.52, 0.75], 0.15, 0.038)
  box(root, m.graphite, [0.76, 1.42, 0.2], [-1.48, 1.52, 0.97], 0.12, 0.03)
  box(root, m.grime, [0.56, 1.18, 0.1], [-1.48, 1.48, 1.12], 0.08, 0.022)

  for (const x of [-1.68, -1.3]) {
    root.add(pipeCurve(m.conduit, [
      [x, 2.02, 1.14], [x, 1.76, 1.2], [x, 1.34, 1.22],
      [x, 0.64, 1.18], [x + 0.04, 0.28, 1.02], [x + 0.16, 0.13, 0.72],
      [x + 0.25, 0.22, 0.46],
    ], 0.105, 30))
    root.add(cylinder(m.edge, 0.16, 0.22, [x, 1.98, 1.15], [0, 0, 0], 12))
    root.add(cylinder(m.graphite, 0.15, 0.3, [x + 0.22, 0.24, 0.48], [0, 0, 0], 12))
    for (const y of [1.76, 0.68]) {
      root.add(cylinder(m.amberDim, 0.128, 0.07, [x, y, 1.2], [0, 0, 0], 11))
    }
  }

  // Lower manifold encloses both curved pipe endpoints inside the cabinet foot.
  box(root, m.graphite, [0.88, 0.5, 0.76], [-1.3, 0.28, 0.24], 0.15, 0.038)
  box(root, m.edge, [0.62, 0.3, 0.54], [-1.3, 0.28, 0.52], 0.11, 0.03)
}

function addBreakerBay(root: Group, lever: Group, m: SwitchboardMaterials): void {
  // Clipped central field with a deeply stepped mechanical recess.
  box(root, m.edge, [2.42, 3.32, 0.3], [0.63, 3.1, 0.76], 0.18, 0.045)
  box(root, m.graphite, [2.18, 3.08, 0.24], [0.63, 3.1, 0.99], 0.15, 0.038)
  box(root, m.edge, [1.26, 2.32, 0.22], [0.92, 3.12, 1.18], 0.15, 0.036)
  box(root, m.graphite, [1.0, 2.04, 0.16], [0.92, 3.08, 1.37], 0.12, 0.03)
  box(root, m.grime, [0.72, 1.62, 0.1], [0.92, 3.03, 1.5], 0.1, 0.025)

  // Captured hinge barrel crosses the recess and enters both bearing cheeks.
  root.add(cylinder(m.edge, 0.28, 1.02, [0.92, 3.78, 1.47], X_AXIS, 18))
  // Amber bands visibly wrap and penetrate the load-bearing barrel rather than floating inside cheeks.
  for (const x of [0.68, 1.16]) {
    root.add(cylinder(m.amber, 0.29, 0.11, [x, 3.78, 1.47], X_AXIS, 16))
  }
  for (const x of [0.48, 1.36]) {
    root.add(cylinder(m.shellShade, 0.32, 0.18, [x, 3.78, 1.47], X_AXIS, 16))
    root.add(cylinder(m.amber, 0.24, 0.08, [x, 3.78, 1.48], X_AXIS, 14))
  }

  lever.position.set(0.92, 3.78, 1.48)
  lever.name = 'hinged oversized amber breaker lever'
  box(lever, m.edge, [0.52, 0.68, 0.34], [0, -0.28, 0.05], 0.12, 0.032)
  box(lever, m.amber, [0.58, 1.02, 0.38], [0, -0.8, 0.18], 0.14, 0.038)
  box(lever, m.amberDim, [0.42, 0.16, 0.06], [0, -0.57, 0.41], 0.045, 0.012)
  box(lever, m.amberDim, [0.42, 0.16, 0.06], [0, -0.8, 0.41], 0.045, 0.012)
  box(lever, m.amberDim, [0.42, 0.16, 0.06], [0, -1.03, 0.41], 0.045, 0.012)

  // Lower travel track, hazard strip, and top state lamp are real bay hardware.
  for (const y of [2.25, 2.47, 2.69]) {
    box(root, m.edge, [0.66, 0.09, 0.1], [0.92, y, 1.57], 0.03, 0.01)
  }
  box(root, m.edge, [0.74, 0.2, 0.12], [0.92, 2.03, 1.54], 0.055, 0.016)
  for (let index = 0; index < 5; index += 1) {
    box(root, index % 2 === 0 ? m.amberDim : m.graphite, [0.1, 0.12, 0.035], [0.65 + index * 0.13, 2.03, 1.64], 0.015, 0.004, [0, 0, -0.35])
  }
  box(root, m.edge, [0.78, 0.34, 0.18], [0.92, 4.47, 1.23], 0.1, 0.028)
  box(root, m.amberDim, [0.5, 0.14, 0.045], [0.92, 4.47, 1.37], 0.04, 0.01)
}

function addStatusHardware(root: Group, m: SwitchboardMaterials): void {
  // Vertical bank is explicitly a set of separate seated indicator lenses.
  box(root, m.edge, [0.54, 1.66, 0.2], [-0.42, 3.68, 1.14], 0.12, 0.03)
  box(root, m.graphite, [0.36, 1.46, 0.13], [-0.42, 3.68, 1.3], 0.085, 0.022)
  for (let index = 0; index < 7; index += 1) {
    box(root, m.amberDim, [0.22, 0.13, 0.045], [-0.42, 3.18 + index * 0.17, 1.42], 0.025, 0.007)
  }
  root.add(cylinder(m.edge, 0.2, 0.12, [-0.42, 2.7, 1.3], Z_AXIS, 14))
  root.add(cylinder(m.amberDim, 0.12, 0.06, [-0.42, 2.7, 1.4], Z_AXIS, 12))
  box(root, m.edge, [0.44, 0.26, 0.13], [-0.42, 2.35, 1.25], 0.07, 0.02)
  box(root, m.amber, [0.22, 0.08, 0.035], [-0.42, 2.35, 1.36], 0.02, 0.005)

  // Narrow cyan witness lives inside a full graphite side bezel.
  box(root, m.edge, [0.32, 1.35, 0.18], [1.7, 3.02, 1.12], 0.09, 0.024)
  box(root, m.graphite, [0.18, 1.13, 0.1], [1.7, 3.02, 1.26], 0.05, 0.016)
  box(root, m.cyan, [0.075, 0.91, 0.035], [1.7, 3.02, 1.34], 0.018, 0.005)
}

function addLowerHatch(root: Group, m: SwitchboardMaterials): void {
  // Vented access hatch is layered above the door with two real lower hinges.
  box(root, m.shellShade, [2.26, 1.02, 0.17], [0.42, 1.0, 0.7], 0.16, 0.038)
  box(root, m.shell, [2.02, 0.82, 0.13], [0.42, 1.0, 0.84], 0.13, 0.032)
  for (let index = 0; index < 5; index += 1) {
    box(root, m.shellShade, [1.25, 0.055, 0.08], [0.42, 0.84 + index * 0.09, 0.96], 0.022, 0.007)
  }
  for (const x of [-0.24, 1.08]) {
    box(root, m.edge, [0.32, 0.16, 0.14], [x, 0.5, 0.91], 0.055, 0.016)
    root.add(cylinder(m.steel, 0.045, 0.1, [x, 0.5, 1.04], Z_AXIS, 8))
  }

  // Sparse cabinet and bay fasteners follow actual panel boundaries.
  for (const [x, y] of [[-1.74, 5.35], [1.74, 5.35], [-1.72, 0.54], [1.72, 0.54]] as const) {
    boltZ(root, m.steel, x, y, 0.69, 0.043)
  }
  for (const [x, y] of [[0.02, 4.62], [1.44, 4.62], [0.02, 1.62], [1.44, 1.62]] as const) {
    boltZ(root, m.steel, x, y, 0.94, 0.043)
  }
  box(root, m.grime, [3.2, 0.04, 0.18], [0.15, 0.54, 0.72], 0.04, 0.01)
  box(root, m.grime, [1.82, 0.035, 0.16], [0.62, 1.58, 1.0], 0.04, 0.01)
}

function buildRig(): SwitchboardRig {
  const m = materials()
  const root = new Group()
  root.name = 'industrial electrical switchboard'
  const fixed = new Group()
  fixed.name = 'grounded fixed cabinet, breaker bay, and conduits'
  const lever = new Group()
  root.add(fixed, lever)

  addCabinet(fixed, m)
  addCoolingColumn(fixed, m)
  addConduits(fixed, m)
  addBreakerBay(fixed, lever, m)
  addStatusHardware(fixed, m)
  addLowerHatch(fixed, m)

  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [m.shell, { rub: 0.075, grime: 0.035, scratch: 0.012 }],
    [m.shellShade, { rub: 0.1, grime: 0.06, scratch: 0.016 }],
    [m.graphite, { rub: 0.12, grime: 0.14, scratch: 0.021 }],
    [m.edge, { rub: 0.16, grime: 0.09, scratch: 0.026 }],
    [m.steel, { rub: 0.2, grime: 0.045, scratch: 0.03 }],
    [m.conduit, { rub: 0.08, grime: 0.18, scratch: 0.012 }],
    [m.grime, { rub: 0.035, grime: 0.3, scratch: 0.006 }],
  ])
  bakeOcclusion(root, { reach: 0.18 })
  bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({
    name: 'industrial-electrical-switchboard / localized service wear',
    clearcoat: 0.1,
    clearcoatRoughness: 0.47,
  })
  root.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return
    if (profiles.has(object.material)) object.material = wear
  })

  const batchOptions = {
    retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material: { name?: string }): string => material.name ?? 'industrial-electrical-switchboard batch',
  }
  const geometries = [
    ...mergeStaticByMaterial(fixed, batchOptions),
    ...mergeStaticByMaterial(lever, batchOptions),
  ]
  const controller = { enabled: false }
  liveControllers.add(controller)
  root.userData.toggleSwitchboard = toggleSwitchboard
  root.userData.breakerEnabled = false
  return { root, lever, controller, materials: m, wear, geometries }
}

export function createModel(): { root: Group; update: (deltaSeconds: number) => void; dispose: () => void } {
  const rig = buildRig()
  return {
    root: rig.root,
    update: (deltaSeconds: number) => {
      const delta = Math.min(Math.max(deltaSeconds, 0), 0.05)
      rig.root.userData.breakerEnabled = rig.controller.enabled
      const target = rig.controller.enabled ? -0.5 : 0
      const blend = 1 - Math.exp(-delta * 8)
      rig.lever.rotation.x += (target - rig.lever.rotation.x) * blend
      rig.materials.amberDim.emissiveIntensity += (
        (rig.controller.enabled ? 1.15 : 0.55) - rig.materials.amberDim.emissiveIntensity
      ) * blend
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
    toggleSwitchboard(true)
    for (let step = 0; step < 22; step += 1) model.update(0.05)
  }
  const scene = new Scene()
  scene.background = new Color(0x030607)
  scene.add(model.root)
  scene.add(new HemisphereLight(0xc3cdcf, 0x07090c, 0.84))
  const key = new DirectionalLight(0xffead5, 2.8)
  key.position.set(-7, 10, 9)
  scene.add(key)
  const fill = new DirectionalLight(0x7598c2, 1.05)
  fill.position.set(8, 5, 7)
  scene.add(fill)
  const rim = new DirectionalLight(0x83adb3, 0.95)
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
  if (options.mode === 'side') camera.position.set(-7.6, 3.15, 0.15)
  else if (options.mode === 'rear') camera.position.set(6.4, 3.9, -7.8)
  else if (options.mode === 'low') camera.position.set(-6.2, 1.15, 7.6)
  else camera.position.set(-4.0, 4.35, 9.5)
  camera.lookAt(0, options.mode === 'low' ? 2.1 : 2.85, 0.2)
  scene.add(camera)

  return {
    scene,
    root: model.root,
    camera,
    update: model.update,
    dispose: () => {
      if (options.enabled) toggleSwitchboard(false)
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
