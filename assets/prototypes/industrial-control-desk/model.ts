import {
  CatmullRomCurve3,
  Color,
  DataTexture,
  DirectionalLight,
  Group,
  HemisphereLight,
  LinearFilter,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  TubeGeometry,
  UnsignedByteType,
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

const X_AXIS: Vec3 = [0, 0, Math.PI / 2]
const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]

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

interface ControlDeskController {
  root: Group
  update: (deltaSeconds: number) => void
  toggleControls: (enabled?: boolean) => boolean
  dispose: () => void
}

interface Preview extends ControlDeskController {
  scene: Scene
  camera: PerspectiveCamera
}

let exportedEnabled = false
const listeners = new Set<(value: boolean) => void>()

/** Toggle the bounded breaker-bank demonstration. The default state is off. */
export function toggleControls(enabled = !exportedEnabled): boolean {
  exportedEnabled = enabled
  for (const listener of listeners) listener(enabled)
  return exportedEnabled
}

function acquireMaterials(): { materials: Materials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 24101 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 24102 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 24103 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 24104 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 24105 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 24106 })
  const amberDim = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'maintained', seed: 24107 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 24108 })
  return {
    handles: [shell, shellShade, graphite, ink, steel, amber, amberDim, cyan],
    materials: {
      shell: tuneMaterial(shell, 0xc9ccca, 0.46, 0.3, { clearcoat: 0.12 }),
      shellShade: tuneMaterial(shellShade, 0x8b9496, 0.52, 0.44, { clearcoat: 0.08 }),
      graphite: tuneMaterial(graphite, 0x242b31, 0.49, 0.66, { clearcoat: 0.08 }),
      ink: tuneMaterial(ink, 0x07090b, 0.75, 0.16),
      steel: tuneMaterial(steel, 0x939b9d, 0.3, 0.86, { clearcoat: 0.08 }),
      amber: tuneMaterial(amber, 0xd46a04, 0.2, 0.04, { emissive: 0.72, clearcoat: 0.3 }),
      amberDim: tuneMaterial(amberDim, 0xb65b05, 0.28, 0.08, { emissive: 0.45, clearcoat: 0.2 }),
      cyan: tuneMaterial(cyan, 0x36d0de, 0.22, 0.04, { emissive: 1.0, clearcoat: 0.22 }),
      grime: new MeshPhysicalMaterial({ name: 'industrial-control-desk / seam grime', color: 0x211e19, roughness: 0.9, metalness: 0.06 }),
    },
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
    fillet: Math.min(0.045, Math.max(0.008, chamfer * 0.3)),
    bevel,
    rotation,
  })
  parent.add(mesh)
  return mesh
}

function boltZ(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number): void {
  parent.add(cylinder(material, 0.043, 0.1, [x, y, z], Z_AXIS, 8))
}

function pipe(material: MeshPhysicalMaterial, points: Vec3[], radius: number, segments = 24): Mesh {
  const curve = new CatmullRomCurve3(points.map((point) => new Vector3(...point)), false, 'centripetal')
  return new Mesh(new TubeGeometry(curve, segments, radius, 8, false), material)
}

function makeScreenTexture(): DataTexture {
  const width = 96
  const height = 52
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      const edge = x < 3 || x >= width - 3 || y < 3 || y >= height - 3
      const cx = x - width / 2
      const cy = y - height / 2
      const hex = Math.max(Math.abs(cx), Math.abs(cx * 0.5 + cy * 0.88), Math.abs(cx * 0.5 - cy * 0.88))
      const ring = Math.abs(hex - 12) < 1.5 || Math.abs(hex - 20) < 1.3
      const grid = (x % 12 === 0 && y > 6 && y < height - 7) || (y % 10 === 0 && x > 8 && x < width - 9)
      const sideBars = (x > 8 && x < 19 && y > 10 && y < 14) || (x > 8 && x < 29 && y > 17 && y < 20)
      const lit = edge || ring || sideBars
      const glow = lit ? 235 : grid ? 62 : 18
      data[index] = glow
      data[index + 1] = Math.round(glow * 0.42)
      data[index + 2] = lit ? 4 : 1
      data[index + 3] = 255
    }
  }
  const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType)
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.needsUpdate = true
  texture.name = 'industrial-control-desk / deterministic analytic amber interface'
  return texture
}

function addBase(fixed: Group, m: Materials): void {
  // Two broad load-bearing cabinets and four separate grounded shoes leave a real central service void.
  for (const x of [-2.12, 2.12]) {
    box(fixed, m.graphite, [1.48, 2.38, 1.72], [x, 1.27, 0], 0.22, 0.055)
    box(fixed, m.shell, [1.24, 2.1, 1.6], [x, 1.38, 0.06], 0.19, 0.048)
    box(fixed, m.shellShade, [0.86, 1.42, 0.16], [x, 1.4, 0.94], 0.13, 0.034)
    box(fixed, m.graphite, [0.64, 1.16, 0.1], [x, 1.4, 1.07], 0.1, 0.026)
    box(fixed, m.graphite, [1.42, 0.28, 1.8], [x, 0.14, 0], 0.12, 0.034)
    for (const z of [-0.62, 0.62]) box(fixed, m.ink, [0.48, 0.12, 0.48], [x, 0.06, z], 0.09, 0.024)
    for (const y of [0.84, 1.98]) for (const dx of [-0.43, 0.43]) boltZ(fixed, m.steel, x + dx, y, 1.04)
  }
  box(fixed, m.graphite, [2.42, 1.56, 0.56], [0, 1.16, -0.36], 0.16, 0.04)
  box(fixed, m.ink, [2.08, 1.18, 0.2], [0, 1.16, -0.03], 0.13, 0.032)
  // Twin rear rails bridge both leg cabinets and mechanically capture the central vent cassette.
  box(fixed, m.graphite, [4.18, 0.32, 0.72], [0, 1.84, -0.36], 0.12, 0.032)
  box(fixed, m.graphite, [4.18, 0.3, 0.72], [0, 0.46, -0.36], 0.12, 0.032)
  for (let i = 0; i < 7; i += 1) box(fixed, m.graphite, [1.72, 0.075, 0.12], [0, 0.82 + i * 0.13, 0.11], 0.025, 0.007)
  for (const x of [-2.12, 2.12]) box(fixed, m.grime, [1.0, 0.045, 0.12], [x, 0.3, 0.84], 0.025, 0.006)
}

function addConsoleShell(fixed: Group, m: Materials): void {
  // Deep desk slab, sloped operational face and tall clipped crown preserve the reference's dominant silhouette.
  box(fixed, m.shellShade, [5.84, 0.66, 2.72], [0, 2.48, 0.4], 0.28, 0.068)
  box(fixed, m.shell, [5.58, 0.48, 2.58], [0, 2.62, 0.43], 0.24, 0.06)
  box(fixed, m.graphite, [4.9, 0.18, 1.85], [0, 2.91, 0.82], 0.17, 0.04, [-0.08, 0, 0])
  box(fixed, m.graphite, [5.18, 1.62, 0.5], [0, 3.53, 0.16], 0.23, 0.055, [-0.24, 0, 0])
  box(fixed, m.ink, [4.78, 1.28, 0.28], [0, 3.52, 0.5], 0.18, 0.045, [-0.24, 0, 0])
  box(fixed, m.shellShade, [5.74, 0.7, 1.38], [0, 4.58, -0.02], 0.26, 0.062)
  box(fixed, m.shell, [5.5, 0.5, 1.24], [0, 4.7, 0.02], 0.22, 0.055)
  box(fixed, m.graphite, [4.96, 0.34, 0.22], [0, 4.67, 0.73], 0.14, 0.034)
  box(fixed, m.ink, [4.62, 0.19, 0.12], [0, 4.67, 0.89], 0.08, 0.022)
  fixed.add(cylinder(m.amber, 0.105, 3.94, [0, 4.67, 0.99], X_AXIS, 16))
  for (const x of [-2.1, 2.1]) {
    fixed.add(cylinder(m.steel, 0.14, 0.18, [x, 4.67, 0.97], X_AXIS, 12))
    box(fixed, m.graphite, [0.32, 0.42, 0.22], [x, 4.67, 0.78], 0.08, 0.022)
  }
  for (const x of [-2.55, 2.55]) {
    box(fixed, m.shellShade, [0.54, 1.68, 1.46], [x, 3.56, 0.06], 0.21, 0.05, [-0.13, 0, 0])
    box(fixed, m.graphite, [0.34, 0.82, 0.16], [x, 3.61, 0.88], 0.1, 0.028)
  }
}

function addControlFace(fixed: Group, levers: Group, m: Materials, screenMaterial: MeshPhysicalMaterial): void {
  // Exactly one textured plane supplies all screen pixels; surrounding interface hardware remains physical.
  box(fixed, m.graphite, [1.86, 0.92, 0.22], [0, 3.54, 0.69], 0.16, 0.04, [-0.24, 0, 0])
  box(fixed, m.ink, [1.55, 0.68, 0.12], [0, 3.54, 0.87], 0.12, 0.03, [-0.24, 0, 0])
  const screenGeometry = new PlaneGeometry(1.32, 0.52)
  const screen = new Mesh(screenGeometry, screenMaterial)
  screen.name = 'industrial-control-desk / single analytic DataTexture interface plane'
  screen.position.set(0, 3.54, 0.958)
  screen.rotation.x = -0.24
  fixed.add(screen)

  for (const side of [-1, 1]) {
    const x0 = side * 1.68
    box(fixed, m.graphite, [1.1, 0.94, 0.22], [x0, 3.54, 0.69], 0.14, 0.036, [-0.24, 0, 0])
    box(fixed, m.ink, [0.86, 0.72, 0.12], [x0, 3.54, 0.87], 0.1, 0.026, [-0.24, 0, 0])
    for (let i = 0; i < 4; i += 1) {
      const x = x0 - 0.33 + i * 0.22
      box(fixed, i === 3 && side > 0 ? m.cyan : m.amberDim, [0.12, 0.18, 0.06], [x, 3.78, 0.99], 0.025, 0.007, [-0.24, 0, 0])
      const bank = new Group()
      bank.position.set(x, 3.42, 0.97)
      box(bank, m.steel, [0.11, 0.34, 0.1], [0, 0.11, 0], 0.025, 0.007, [-0.55, 0, 0])
      box(bank, m.graphite, [0.18, 0.18, 0.12], [0, -0.07, 0], 0.04, 0.01)
      levers.add(bank)
    }
  }

  box(fixed, m.graphite, [4.54, 0.1, 0.24], [0, 2.91, 1.04], 0.04, 0.012)
  for (const x of [-2.04, -1.02, 0, 1.02, 2.04]) boltZ(fixed, m.steel, x, 2.93, 1.19)
}

function addServiceDetails(fixed: Group, m: Materials): void {
  // Operator grab bar sits on two steel carriers beneath the newly deepened forward cantilever.
  box(fixed, m.amberDim, [1.18, 0.09, 0.09], [0, 2.5, 1.8], 0.035, 0.009)
  for (const x of [-0.52, 0.52]) box(fixed, m.steel, [0.12, 0.28, 0.14], [x, 2.5, 1.7], 0.04, 0.01)

  // Closed rear service anatomy prevents the desk from reading as a one-sided facade.
  box(fixed, m.shellShade, [4.98, 1.84, 0.18], [0, 3.72, -0.86], 0.2, 0.045)
  box(fixed, m.graphite, [2.44, 0.88, 0.12], [0.72, 3.72, -0.98], 0.13, 0.032)
  for (let i = 0; i < 6; i += 1) box(fixed, m.ink, [1.9, 0.06, 0.08], [0.72, 3.46 + i * 0.1, -1.07], 0.02, 0.005)
  box(fixed, m.graphite, [1.16, 0.82, 0.12], [-1.5, 3.72, -0.98], 0.12, 0.03)
  for (const x of [-1.88, -1.5, -1.12]) fixed.add(cylinder(m.steel, 0.055, 0.08, [x, 3.72, -1.08], Z_AXIS, 8))

  // Side safety handle is one continuous tube whose ends disappear into explicit sockets.
  fixed.add(pipe(m.amberDim, [[-2.92, 2.55, 0.5], [-3.1, 2.66, 0.5], [-3.13, 3.25, 0.47], [-3.05, 3.65, 0.34], [-2.9, 3.78, 0.2]], 0.07, 28))
  for (const [y, z] of [[2.55, 0.5], [3.78, 0.2]] as const) fixed.add(cylinder(m.graphite, 0.13, 0.12, [-2.9, y, z], X_AXIS, 10))

  // Localized abrasion and seam accumulation stay on actual contact edges.
  box(fixed, m.grime, [5.0, 0.045, 0.12], [0, 2.26, 0.92], 0.025, 0.006)
  box(fixed, m.graphite, [0.5, 0.72, 0.14], [2.12, 1.36, 1.14], 0.1, 0.026)
  for (const y of [1.16, 1.36, 1.56]) box(fixed, m.amberDim, [0.12, 0.09, 0.045], [2.12, y, 1.24], 0.025, 0.007)
  for (const x of [-2.65, 2.65]) box(fixed, m.steel, [0.34, 0.07, 0.34], [x, 0.12, 0.52], 0.06, 0.016)
}

function build(): {
  root: Group
  levers: Group
  materials: Materials
  handles: MaterialHandle[]
  wear: MeshPhysicalMaterial
  screenTexture: DataTexture
  screenMaterial: MeshPhysicalMaterial
  geometries: Array<{ dispose: () => void }>
} {
  const acquired = acquireMaterials()
  const m = acquired.materials
  const root = new Group()
  root.name = 'industrial control desk'
  const fixed = new Group()
  fixed.name = 'fixed armored desk chassis and service interface'
  const levers = new Group()
  levers.name = 'bounded breaker-bank controls'
  root.add(fixed, levers)

  const screenTexture = makeScreenTexture()
  const screenMaterial = new MeshPhysicalMaterial({
    name: 'industrial-control-desk / single deterministic screen material',
    color: 0xff8a10,
    emissive: new Color(0xff5a00),
    emissiveIntensity: 0.62,
    roughness: 0.24,
    metalness: 0.02,
    map: screenTexture,
    emissiveMap: screenTexture,
    toneMapped: false,
  })

  addBase(fixed, m)
  addConsoleShell(fixed, m)
  addControlFace(fixed, levers, m, screenMaterial)
  addServiceDetails(fixed, m)

  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [m.shell, { rub: 0.08, grime: 0.035, scratch: 0.012 }],
    [m.shellShade, { rub: 0.1, grime: 0.055, scratch: 0.016 }],
    [m.graphite, { rub: 0.065, grime: 0.045, scratch: 0.01 }],
    [m.steel, { rub: 0.18, grime: 0.04, scratch: 0.026 }],
  ])
  bakeOcclusion(root, { reach: 0.18 })
  bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'industrial-control-desk / localized form wear', clearcoat: 0.09, clearcoatRoughness: 0.5 })
  root.traverse((object) => {
    if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear
  })
  const batchOptions = {
    retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material: { name?: string }): string => material.name ?? 'industrial-control-desk batch',
  }
  const geometries = [
    ...mergeStaticByMaterial(fixed, batchOptions),
    ...mergeStaticByMaterial(levers, batchOptions),
  ]
  return { root, levers, materials: m, handles: acquired.handles, wear, screenTexture, screenMaterial, geometries }
}

export function createModel(): ControlDeskController {
  const rig = build()
  let enabled = false
  const listener = (value: boolean) => { enabled = value }
  listeners.add(listener)
  const update = (deltaSeconds: number) => {
    const delta = Math.min(Math.max(deltaSeconds, 0), 0.05)
    const target = enabled ? -0.22 : 0
    const blend = 1 - Math.exp(-delta * 7)
    rig.levers.rotation.x += (target - rig.levers.rotation.x) * blend
    rig.screenMaterial.emissiveIntensity += ((enabled ? 1.05 : 0.62) - rig.screenMaterial.emissiveIntensity) * blend
  }
  return {
    root: rig.root,
    update,
    toggleControls: (value = !enabled) => { enabled = value; return enabled },
    dispose: () => {
      listeners.delete(listener)
      for (const geometry of rig.geometries) geometry.dispose()
      rig.screenTexture.dispose()
      rig.screenMaterial.dispose()
      rig.wear.dispose()
      for (const handle of rig.handles) handle.release()
      rig.materials.grime.dispose()
    },
  }
}

function makePreview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low'; active?: boolean } = {}): Preview {
  const model = createModel()
  if (options.active) {
    model.toggleControls(true)
    for (let i = 0; i < 30; i += 1) model.update(0.05)
  }
  const scene = new Scene()
  scene.background = new Color(0x030506)
  scene.add(model.root)
  scene.add(new HemisphereLight(0xc9d0d2, 0x07090c, 0.82))
  const key = new DirectionalLight(0xffead6, 2.8)
  key.position.set(-8, 10, 10)
  scene.add(key)
  const fill = new DirectionalLight(0x769ac4, 1.15)
  fill.position.set(9, 6, 8)
  scene.add(fill)
  const rim = new DirectionalLight(0x88aeb8, 0.95)
  rim.position.set(7, 8, -9)
  scene.add(rim)

  const floorMaterial = new MeshPhysicalMaterial({ color: 0x090d10, roughness: 0.92, metalness: 0.04 })
  const floorGeometry = new PlaneGeometry(20, 20)
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.004
  floor.userData.excludeFromExport = true
  scene.add(floor)

  const camera = new PerspectiveCamera(34, options.aspect ?? 1, 0.14, 100)
  if (options.mode === 'side') camera.position.set(-8.6, 3.0, 0.2)
  else if (options.mode === 'rear') camera.position.set(7.2, 4.0, -8.6)
  else if (options.mode === 'low') camera.position.set(-6.8, 1.15, 8.6)
  else camera.position.set(-6.4, 4.25, 9.4)
  camera.lookAt(0, options.mode === 'low' ? 2.0 : 2.55, 0.12)
  scene.add(camera)

  return {
    ...model,
    scene,
    camera,
    dispose: () => {
      floorGeometry.dispose()
      floorMaterial.dispose()
      model.dispose()
    },
  }
}

export const createPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'low' })
export const createToggledPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'beauty', active: true })
