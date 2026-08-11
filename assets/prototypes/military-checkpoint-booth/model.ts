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
  cobalt: MeshPhysicalMaterial
  fabric: MeshPhysicalMaterial
  grime: MeshPhysicalMaterial
}

interface BoothController {
  root: Group
  update: (deltaSeconds: number) => void
  toggleBoothLights: (enabled?: boolean) => boolean
  dispose: () => void
}

interface Preview extends BoothController {
  scene: Scene
  camera: PerspectiveCamera
}

let exportedLights = false
const lightListeners = new Set<(enabled: boolean) => void>()

/** Toggle the booth's bounded status-light demonstration. It is off by default. */
export function toggleBoothLights(enabled = !exportedLights): boolean {
  exportedLights = enabled
  for (const listener of lightListeners) listener(enabled)
  return exportedLights
}

function acquireMaterials(): { materials: Materials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 24301 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 24302 })
  const graphite = library.acquire({ recipeId: 'MAT-05', palette: 'GRAPHITE-800', condition: 'worked', seed: 24303 })
  const ink = library.acquire({ recipeId: 'MAT-05', palette: 'INK-950', condition: 'maintained', seed: 24304 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 24305 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 24306 })
  const amberDim = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'maintained', seed: 24307 })
  const cobalt = library.acquire({ recipeId: 'MAT-17', palette: 'COBALT-500', condition: 'worked', seed: 24308 })
  return {
    handles: [shell, shellShade, graphite, ink, steel, amber, amberDim, cobalt],
    materials: {
      shell: tuneMaterial(shell, 0xc9ccca, 0.46, 0.3, { clearcoat: 0.12 }),
      shellShade: tuneMaterial(shellShade, 0x858f93, 0.52, 0.44, { clearcoat: 0.08 }),
      graphite: tuneMaterial(graphite, 0x252c33, 0.5, 0.64, { clearcoat: 0.09 }),
      ink: tuneMaterial(ink, 0x07090c, 0.78, 0.13),
      steel: tuneMaterial(steel, 0x979fa2, 0.3, 0.87, { clearcoat: 0.08 }),
      amber: tuneMaterial(amber, 0xd56c05, 0.21, 0.04, { emissive: 0.82, clearcoat: 0.25 }),
      amberDim: tuneMaterial(amberDim, 0xb45b05, 0.29, 0.08, { emissive: 0.38, clearcoat: 0.2 }),
      cobalt: tuneMaterial(cobalt, 0x2c5f9b, 0.38, 0.56, { clearcoat: 0.12 }),
      fabric: new MeshPhysicalMaterial({ name: 'military-checkpoint-booth / rugged field pouch', color: 0x23262a, roughness: 0.94, metalness: 0.02 }),
      grime: new MeshPhysicalMaterial({ name: 'military-checkpoint-booth / authored seam dirt', color: 0x28231d, roughness: 0.92, metalness: 0.05 }),
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

function pipe(material: MeshPhysicalMaterial, points: Vec3[], radius: number, segments = 28): Mesh {
  const curve = new CatmullRomCurve3(points.map((point) => new Vector3(...point)), false, 'centripetal')
  return new Mesh(new TubeGeometry(curve, segments, radius, 9, false), material)
}

function boltZ(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number): void {
  parent.add(cylinder(material, 0.045, 0.1, [x, y, z], Z_AXIS, 8))
}

function makePanelTexture(): DataTexture {
  const width = 64
  const height = 48
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const i = (y * width + x) * 4
    const cx = x - width / 2
    const cy = y - height / 2
    const oct = Math.max(Math.abs(cx), Math.abs(cy), (Math.abs(cx) + Math.abs(cy)) * 0.72)
    const ring = Math.abs(oct - 11) < 1.4 || Math.abs(oct - 17) < 1.2
    const bars = (x > 7 && x < 18 && y % 7 < 2) || (x > 48 && x < 57 && y % 8 < 2)
    const lit = ring || bars
    const value = lit ? 238 : 22
    data[i] = value
    data[i + 1] = Math.round(value * 0.44)
    data[i + 2] = 3
    data[i + 3] = 255
  }
  const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType)
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.needsUpdate = true
  texture.name = 'military-checkpoint-booth / deterministic analytic console texture'
  return texture
}

function addBase(fixed: Group, m: Materials): void {
  // Full slab, four corner feet and a central undertray create a continuous grounded load path.
  box(fixed, m.graphite, [4.74, 0.62, 3.7], [0, 0.31, 0], 0.28, 0.068)
  box(fixed, m.ink, [4.26, 0.2, 3.28], [0, 0.1, 0], 0.18, 0.045)
  box(fixed, m.shellShade, [4.38, 0.56, 3.34], [0, 0.74, 0], 0.24, 0.06)
  for (const x of [-1.82, 1.82]) for (const z of [-1.32, 1.32]) {
    box(fixed, m.graphite, [0.78, 0.22, 0.78], [x, 0.11, z], 0.14, 0.036)
    box(fixed, m.steel, [0.5, 0.06, 0.5], [x, 0.03, z], 0.09, 0.022)
  }
  box(fixed, m.graphite, [2.2, 0.44, 0.24], [0, 0.58, 1.78], 0.13, 0.034)
  box(fixed, m.amberDim, [0.52, 0.16, 0.08], [0, 0.62, 1.93], 0.05, 0.014)
}

function addContinuousCabin(fixed: Group, m: Materials): void {
  // Rear and side walls are continuous host surfaces. Only the front viewport is intentionally open.
  box(fixed, m.graphite, [4.28, 4.22, 0.34], [0, 2.9, -1.5], 0.24, 0.058)
  box(fixed, m.shellShade, [3.9, 3.86, 0.2], [0, 2.94, -1.72], 0.2, 0.05)
  box(fixed, m.shell, [0.4, 4.2, 3.0], [-1.94, 2.9, 0], 0.2, 0.05)
  box(fixed, m.shell, [0.4, 4.2, 3.0], [1.94, 2.9, 0], 0.2, 0.05)
  for (const x of [-1.78, 1.78]) {
    box(fixed, m.graphite, [0.58, 3.92, 2.82], [x, 2.92, -0.02], 0.22, 0.055)
    box(fixed, m.shellShade, [0.34, 2.86, 0.28], [x, 2.72, 1.55], 0.13, 0.034)
  }

  // True front load frame surrounds the single intentional opening without facade gaps.
  box(fixed, m.graphite, [3.56, 0.54, 0.46], [0, 5.02, 1.5], 0.2, 0.05)
  box(fixed, m.graphite, [3.56, 0.5, 0.54], [0, 2.42, 1.52], 0.18, 0.045)
  for (const x of [-1.52, 1.52]) box(fixed, m.graphite, [0.5, 3.14, 0.5], [x, 3.72, 1.51], 0.18, 0.045)
  box(fixed, m.ink, [2.78, 0.2, 0.2], [0, 4.78, 1.78], 0.1, 0.026)
  box(fixed, m.ink, [2.78, 0.18, 0.2], [0, 2.68, 1.8], 0.09, 0.024)
  for (const x of [-1.34, 1.34]) box(fixed, m.ink, [0.18, 1.98, 0.2], [x, 3.73, 1.79], 0.09, 0.024)

  // Interior has an actual rear wall, sill and ceiling light, so the viewport never reveals a hollow shell.
  box(fixed, m.ink, [2.94, 2.42, 0.16], [0, 3.73, -1.28], 0.14, 0.036)
  box(fixed, m.graphite, [2.62, 0.82, 0.12], [0.34, 3.66, -1.16], 0.12, 0.03)
  for (const x of [-1.34, 1.34]) box(fixed, m.ink, [0.16, 2.28, 2.36], [x, 3.73, 0], 0.07, 0.018)
  box(fixed, m.ink, [2.88, 0.16, 2.4], [0, 4.84, 0], 0.08, 0.02)
  for (let i = 0; i < 5; i += 1) box(fixed, m.graphite, [2.42, 0.07, 0.1], [0, 4.74, -0.72 + i * 0.34], 0.025, 0.006)
  box(fixed, m.amberDim, [1.18, 0.13, 0.06], [0, 4.69, 0.2], 0.045, 0.012)
  box(fixed, m.graphite, [3.02, 0.2, 1.9], [0, 2.66, 0.38], 0.13, 0.034)
}

function addRoof(fixed: Group, m: Materials): void {
  box(fixed, m.graphite, [4.78, 0.78, 3.82], [0, 5.34, 0], 0.3, 0.072)
  box(fixed, m.shell, [4.5, 0.58, 3.56], [0, 5.58, 0], 0.27, 0.066)
  box(fixed, m.shellShade, [3.54, 0.2, 2.7], [0, 5.84, -0.08], 0.16, 0.04)
  box(fixed, m.graphite, [2.6, 0.14, 1.64], [0.42, 5.96, -0.2], 0.13, 0.032)
  for (let i = 0; i < 6; i += 1) box(fixed, m.ink, [2.12, 0.08, 0.08], [0.42, 6.06, -0.68 + i * 0.2], 0.02, 0.005)
  box(fixed, m.graphite, [3.0, 0.3, 0.3], [0, 5.3, 1.82], 0.1, 0.027)
  box(fixed, m.amber, [0.72, 0.16, 0.08], [0, 5.3, 2.0], 0.05, 0.014)
}

function addConsole(fixed: Group, m: Materials, panelMaterial: MeshPhysicalMaterial): void {
  // Sloped waist console is mechanically captured by both front jambs and the full lower sill.
  box(fixed, m.shell, [3.46, 1.18, 1.12], [0, 1.75, 1.1], 0.22, 0.055, [-0.28, 0, 0])
  box(fixed, m.graphite, [2.98, 0.82, 0.3], [0.08, 2.0, 1.73], 0.17, 0.042, [-0.28, 0, 0])
  box(fixed, m.ink, [1.78, 0.58, 0.15], [0, 2.02, 1.94], 0.13, 0.032, [-0.28, 0, 0])
  const panelGeometry = new PlaneGeometry(1.48, 0.44)
  const panel = new Mesh(panelGeometry, panelMaterial)
  panel.name = 'military-checkpoint-booth / single analytic console plane'
  panel.position.set(0, 2.02, 2.02)
  panel.rotation.x = -0.28
  fixed.add(panel)
  for (const x of [-1.02, 0.98]) {
    box(fixed, m.graphite, [0.48, 0.54, 0.18], [x, 2.0, 1.9], 0.1, 0.026, [-0.28, 0, 0])
    for (let i = 0; i < 3; i += 1) box(fixed, i === 2 && x > 0 ? m.cobalt : m.amberDim, [0.08, 0.14, 0.045], [x - 0.12 + i * 0.12, 2.02, 2.02], 0.02, 0.005, [-0.28, 0, 0])
  }
  box(fixed, m.graphite, [2.36, 0.48, 0.18], [0, 1.12, 1.68], 0.13, 0.032)
  box(fixed, m.ink, [1.9, 0.22, 0.08], [0, 1.12, 1.82], 0.08, 0.02)
}

function addServiceAnatomy(fixed: Group, m: Materials): void {
  // Continuous handles: both endpoints disappear into explicit side-wall sockets.
  for (const side of [-1, 1]) {
    fixed.add(pipe(m.graphite, [
      [side * 2.13, 2.32, 1.02], [side * 2.22, 2.5, 1.08], [side * 2.22, 3.52, 1.08], [side * 2.13, 3.72, 1.02],
    ], 0.075, 24))
    for (const y of [2.32, 3.72]) fixed.add(cylinder(m.steel, 0.13, 0.13, [side * 2.05, y, 1.02], X_AXIS, 10))
  }

  // Left service tower and pouch are seated to the continuous side shell.
  box(fixed, m.graphite, [0.24, 0.88, 0.92], [-2.14, 3.9, -0.62], 0.12, 0.03)
  for (let i = 0; i < 4; i += 1) box(fixed, m.ink, [0.12, 0.08, 0.54], [-2.3, 3.68 + i * 0.14, -0.62], 0.02, 0.005)
  box(fixed, m.fabric, [0.42, 1.28, 1.02], [-2.08, 2.25, -0.62], 0.16, 0.04)
  for (const z of [-0.96, -0.28]) box(fixed, m.graphite, [0.14, 1.42, 0.12], [-2.32, 2.3, z], 0.045, 0.012)
  box(fixed, m.amberDim, [0.12, 0.18, 0.5], [-2.32, 2.32, -0.62], 0.035, 0.009)

  // Rear access layering and real vent slots sit on the closed rear host.
  box(fixed, m.graphite, [2.18, 1.38, 0.14], [0.54, 2.62, -1.86], 0.16, 0.04)
  box(fixed, m.shellShade, [1.9, 1.1, 0.1], [0.54, 2.62, -1.96], 0.13, 0.032)
  for (let i = 0; i < 6; i += 1) box(fixed, m.graphite, [1.42, 0.06, 0.08], [0.54, 2.34 + i * 0.12, -2.03], 0.02, 0.005)
  box(fixed, m.cobalt, [0.7, 0.16, 0.05], [-1.06, 2.62, -2.02], 0.045, 0.012)
  for (const [x, y] of [[-1.76, 1.0], [1.76, 1.0], [-1.76, 4.55], [1.76, 4.55]] as const) boltZ(fixed, m.steel, x, y, 1.72)

  // Authored wear only at the threshold, foot seams, and frequently touched console lip.
  box(fixed, m.grime, [3.2, 0.045, 0.12], [0, 0.72, 1.64], 0.025, 0.006)
  box(fixed, m.steel, [2.9, 0.07, 0.22], [0, 0.86, 1.58], 0.06, 0.016)
  box(fixed, m.grime, [2.64, 0.04, 0.08], [0, 2.5, 1.76], 0.02, 0.005)
}

function build(): {
  root: Group
  materials: Materials
  handles: MaterialHandle[]
  wear: MeshPhysicalMaterial
  panelTexture: DataTexture
  panelMaterial: MeshPhysicalMaterial
  geometries: Array<{ dispose: () => void }>
} {
  const acquired = acquireMaterials()
  const m = acquired.materials
  const root = new Group()
  root.name = 'military checkpoint booth'
  const fixed = new Group()
  fixed.name = 'continuous grounded booth shell, viewport, console, and service anatomy'
  root.add(fixed)
  const panelTexture = makePanelTexture()
  const panelMaterial = new MeshPhysicalMaterial({
    name: 'military-checkpoint-booth / single deterministic console material',
    color: 0xff8b12,
    emissive: new Color(0xff5700),
    emissiveIntensity: 0.48,
    roughness: 0.24,
    metalness: 0.02,
    map: panelTexture,
    emissiveMap: panelTexture,
    toneMapped: false,
  })
  addBase(fixed, m)
  addContinuousCabin(fixed, m)
  addRoof(fixed, m)
  addConsole(fixed, m, panelMaterial)
  addServiceAnatomy(fixed, m)

  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [m.shell, { rub: 0.08, grime: 0.04, scratch: 0.013 }],
    [m.shellShade, { rub: 0.1, grime: 0.06, scratch: 0.017 }],
    [m.graphite, { rub: 0.07, grime: 0.05, scratch: 0.011 }],
    [m.steel, { rub: 0.18, grime: 0.04, scratch: 0.026 }],
    [m.cobalt, { rub: 0.11, grime: 0.05, scratch: 0.018 }],
  ])
  bakeOcclusion(root, { reach: 0.18 })
  bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'military-checkpoint-booth / localized form wear', clearcoat: 0.08, clearcoatRoughness: 0.52 })
  root.traverse((object) => {
    if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material)) object.material = wear
  })
  const options = {
    retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material: { name?: string }): string => material.name ?? 'military-checkpoint-booth batch',
  }
  const geometries = mergeStaticByMaterial(fixed, options)
  return { root, materials: m, handles: acquired.handles, wear, panelTexture, panelMaterial, geometries }
}

export function createModel(): BoothController {
  const rig = build()
  let enabled = false
  let time = 0
  const listener = (value: boolean) => { enabled = value }
  lightListeners.add(listener)
  return {
    root: rig.root,
    update: (deltaSeconds: number) => {
      const delta = Math.min(Math.max(deltaSeconds, 0), 0.05)
      if (enabled) time += delta
      const target = enabled ? 0.78 + Math.sin(time * 2.4) * 0.16 : 0.48
      const blend = 1 - Math.exp(-delta * 7)
      rig.panelMaterial.emissiveIntensity += (target - rig.panelMaterial.emissiveIntensity) * blend
      rig.materials.amberDim.emissiveIntensity += ((enabled ? 0.68 : 0.38) - rig.materials.amberDim.emissiveIntensity) * blend
    },
    toggleBoothLights: (value = !enabled) => { enabled = value; return enabled },
    dispose: () => {
      lightListeners.delete(listener)
      for (const geometry of rig.geometries) geometry.dispose()
      rig.panelTexture.dispose()
      rig.panelMaterial.dispose()
      rig.wear.dispose()
      for (const handle of rig.handles) handle.release()
      rig.materials.fabric.dispose()
      rig.materials.grime.dispose()
    },
  }
}

function makePreview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low'; active?: boolean } = {}): Preview {
  const model = createModel()
  if (options.active) {
    model.toggleBoothLights(true)
    for (let i = 0; i < 35; i += 1) model.update(0.05)
  }
  const scene = new Scene()
  scene.background = new Color(0x030506)
  scene.add(model.root)
  scene.add(new HemisphereLight(0xc7d0d2, 0x06080b, 0.82))
  const key = new DirectionalLight(0xffead8, 2.8)
  key.position.set(-8, 10, 10)
  scene.add(key)
  const fill = new DirectionalLight(0x7197c2, 1.12)
  fill.position.set(9, 6, 8)
  scene.add(fill)
  const rim = new DirectionalLight(0x88aeb7, 0.95)
  rim.position.set(7, 9, -9)
  scene.add(rim)

  const floorMaterial = new MeshPhysicalMaterial({ color: 0x090d10, roughness: 0.93, metalness: 0.04 })
  const floorGeometry = new PlaneGeometry(18, 18)
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.004
  floor.userData.excludeFromExport = true
  scene.add(floor)

  const camera = new PerspectiveCamera(34, options.aspect ?? 1, 0.14, 100)
  if (options.mode === 'side') camera.position.set(-8.4, 3.1, 0.2)
  else if (options.mode === 'rear') camera.position.set(6.6, 4.1, -8.2)
  else if (options.mode === 'low') camera.position.set(-6.5, 1.15, 8.2)
  else camera.position.set(-6.6, 4.95, 8.8)
  camera.lookAt(0, options.mode === 'low' ? 2.5 : 3.05, 0.12)
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
