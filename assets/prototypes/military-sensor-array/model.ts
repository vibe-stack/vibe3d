import {
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Scene,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three/webgpu'
import {
  MaterialLibrary,
  bakeOcclusion,
  bakeSurfaceAttributes,
  mergeStaticByMaterial,
  prism,
  tuneMaterial,
  type MaterialHandle,
  type Vec3,
} from '../../../src/asset-forge/generator/index.ts'

interface Materials {
  shell: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
}

interface SensorController {
  root: Group
  update: (deltaSeconds: number) => void
  toggleTracking: (enabled?: boolean) => boolean
  dispose: () => void
}

interface Preview extends SensorController {
  scene: Scene
  camera: PerspectiveCamera
}

let exportedTrackingState = false
const trackingListeners = new Set<(enabled: boolean) => void>()

/** Toggle tracking on all live sensor-array controllers. Tracking is off initially. */
export function toggleTracking(enabled = !exportedTrackingState): boolean {
  exportedTrackingState = enabled
  for (const listener of trackingListeners) listener(enabled)
  return exportedTrackingState
}

function makeMaterials(): { materials: Materials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 17101 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 17102 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'worked', seed: 17103 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 17104 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 17105 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 17106 })
  return {
    materials: {
      shell: tuneMaterial(shell, 0xc7cbc8, 0.46, 0.14, { clearcoat: 0.12 }),
      graphite: tuneMaterial(graphite, 0x26313a, 0.58, 0.62),
      ink: tuneMaterial(ink, 0x06090c, 0.76, 0.12),
      steel: tuneMaterial(steel, 0x8d979b, 0.31, 0.86),
      amber: tuneMaterial(amber, 0xc85b04, 0.27, 0.04, { emissive: 0.62, clearcoat: 0.52 }),
      cyan: tuneMaterial(cyan, 0x28cbe2, 0.24, 0.03, { emissive: 0.95 }),
    },
    handles: [shell, graphite, ink, steel, amber, cyan],
  }
}

function addPrism(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, options: Parameters<typeof prism>[3] = {}): Mesh {
  const mesh = prism(material, size, position, options)
  parent.add(mesh)
  return mesh
}

function addOctagonalDrum(
  parent: Group,
  material: MeshPhysicalMaterial,
  radius: number,
  depth: number,
  position: Vec3,
  scale: Vec3 = [1, 1, 1],
): Mesh {
  const geometry = new CylinderGeometry(radius, radius, depth, 8, 1, false)
  // The cylinder axis is local Y and becomes world Z after rotation; bake the
  // rectangular-octagon scale into local X/Z so depth is not accidentally
  // multiplied by the face-height scale.
  geometry.scale(scale[0], scale[2], scale[1])
  const mesh = new Mesh(geometry, material)
  mesh.rotation.x = Math.PI / 2
  mesh.position.set(...position)
  parent.add(mesh)
  return mesh
}

function addBase(parent: Group, m: Materials): void {
  const plinth = new Mesh(new CylinderGeometry(2.72, 2.72, 0.34, 8, 1, false), m.graphite)
  plinth.position.y = 0.17
  parent.add(plinth)
  const armor = new Mesh(new CylinderGeometry(2.48, 2.65, 0.68, 8, 1, false), m.shell)
  armor.position.y = 0.57
  parent.add(armor)
  const upperArmor = new Mesh(new CylinderGeometry(2.18, 2.38, 0.34, 12, 1, false), m.graphite)
  upperArmor.position.y = 1.0
  parent.add(upperArmor)
  const azimuthRing = new Mesh(new CylinderGeometry(1.8, 1.8, 0.28, 24, 1, false), m.ink)
  azimuthRing.position.y = 1.24
  parent.add(azimuthRing)
  const steelRing = new Mesh(new TorusGeometry(1.72, 0.075, 6, 32), m.steel)
  steelRing.rotation.x = Math.PI / 2
  steelRing.position.y = 1.29
  parent.add(steelRing)

  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    addPrism(parent, m.graphite, [0.92, 0.32, 0.78], [c * 2.42, 0.16, s * 2.42], {
      chamfer: 0.11,
      fillet: 0.035,
      bevel: 0.024,
      rotation: [0, -angle, 0],
    })
    if (i % 2 === 0) {
      addPrism(parent, m.shell, [0.76, 0.42, 0.78], [c * 2.17, 0.57, s * 2.17], {
        chamfer: 0.1,
        fillet: 0.03,
        bevel: 0.022,
        rotation: [0, -angle, 0],
      })
      addPrism(parent, m.cyan, [0.3, 0.07, 0.07], [c * 2.56, 0.64, s * 2.56], {
        chamfer: 0.018,
        fillet: 0.006,
        bevel: 0.005,
        rotation: [0, -angle, 0],
      })
    }
    const bolt = new Mesh(new CylinderGeometry(0.045, 0.045, 0.045, 8, 1, false), m.steel)
    bolt.position.set(c * 2.18, 0.91, s * 2.18)
    parent.add(bolt)
    if (i % 2 === 0) {
      addPrism(parent, m.steel, [0.34, 0.028, 0.16], [c * 2.46, 0.33, s * 2.46], {
        chamfer: 0.025,
        fillet: 0.008,
        bevel: 0.006,
        rotation: [0, -angle, 0],
      })
    }
  }

  addPrism(parent, m.graphite, [1.34, 0.48, 0.16], [0, 0.58, 2.4], { chamfer: 0.09, fillet: 0.028, bevel: 0.02 })
  addPrism(parent, m.ink, [0.78, 0.21, 0.08], [0, 0.57, 2.5], { chamfer: 0.045, fillet: 0.014, bevel: 0.01 })
  for (const x of [-0.26, -0.09, 0.09, 0.26]) addPrism(parent, m.cyan, [0.055, 0.18, 0.045], [x, 0.58, 2.55], { chamfer: 0.012, fillet: 0.004, bevel: 0.003 })
}

function addYoke(parent: Group, m: Materials): void {
  const bearingX = 2.08
  addPrism(parent, m.graphite, [3.7, 0.42, 1.04], [0, 0.32, -0.25], { chamfer: 0.14, fillet: 0.045, bevel: 0.032 })
  for (const x of [-bearingX, bearingX]) {
    addPrism(parent, m.graphite, [0.9, 2.34, 1.18], [x, 1.22, -0.28], { chamfer: 0.17, fillet: 0.055, bevel: 0.038 })
    addPrism(parent, m.shell, [0.62, 1.72, 0.22], [x, 1.27, 0.33], { chamfer: 0.13, fillet: 0.042, bevel: 0.03 })
    addPrism(parent, m.graphite, [1.08, 0.62, 1.28], [x, 0.25, -0.24], { chamfer: 0.15, fillet: 0.048, bevel: 0.034 })
    const bearing = new Mesh(new CylinderGeometry(0.52, 0.52, 0.36, 16, 1, false), m.graphite)
    bearing.rotation.z = Math.PI / 2
    bearing.position.set(x, 2.26, 0)
    parent.add(bearing)
    const ring = new Mesh(new TorusGeometry(0.53, 0.09, 6, 20), m.steel)
    ring.rotation.y = Math.PI / 2
    ring.position.set(x - Math.sign(x) * 0.18, 2.26, 0)
    parent.add(ring)
    addPrism(parent, m.graphite, [0.72, 1.08, 1.0], [x - Math.sign(x) * 0.26, 0.68, -0.26], {
      chamfer: 0.14,
      fillet: 0.044,
      bevel: 0.032,
      rotation: [0, 0, Math.sign(x) * 0.22],
    })
    addPrism(parent, m.shell, [0.48, 0.76, 0.18], [x - Math.sign(x) * 0.24, 0.72, 0.26], {
      chamfer: 0.1,
      fillet: 0.032,
      bevel: 0.023,
      rotation: [0, 0, Math.sign(x) * 0.22],
    })
  }
  // Asymmetric drive casing and physically ported service loop.
  addPrism(parent, m.graphite, [1.18, 1.26, 1.22], [-bearingX, 1.5, -0.64], { chamfer: 0.18, fillet: 0.056, bevel: 0.04 })
  addPrism(parent, m.shell, [0.86, 0.82, 0.18], [-bearingX, 1.5, 0], { chamfer: 0.13, fillet: 0.04, bevel: 0.029 })
  const cable = new CatmullRomCurve3([
    new Vector3(-2.08, 1.74, -0.98),
    new Vector3(-2.58, 1.22, -1.1),
    new Vector3(-2.42, 0.52, -0.86),
    new Vector3(-1.72, 0.22, -0.55),
  ])
  parent.add(new Mesh(new TubeGeometry(cable, 20, 0.075, 6, false), m.graphite))
  for (const p of [new Vector3(-2.08, 1.74, -0.98), new Vector3(-1.72, 0.22, -0.55)]) {
    const collar = new Mesh(new CylinderGeometry(0.13, 0.13, 0.2, 10, 1, false), m.steel)
    collar.rotation.x = Math.PI / 2
    collar.position.copy(p)
    parent.add(collar)
  }
  addPrism(parent, m.graphite, [0.38, 0.34, 0.25], [-1.72, 0.22, -0.5], { chamfer: 0.06, fillet: 0.02, bevel: 0.014 })
}

function addHexCell(parent: Group, m: Materials, x: number, y: number): void {
  const bezel = new Mesh(new CylinderGeometry(0.55, 0.55, 0.22, 6, 1, false), m.ink)
  bezel.rotation.x = Math.PI / 2
  bezel.position.set(x, y, 1.51)
  parent.add(bezel)
  const lens = new Mesh(new CylinderGeometry(0.46, 0.46, 0.18, 6, 1, false), m.amber)
  lens.rotation.x = Math.PI / 2
  lens.position.set(x, y, 1.69)
  parent.add(lens)
  const wellRing = new Mesh(new TorusGeometry(0.45, 0.085, 5, 6), m.ink)
  wellRing.position.set(x, y, 1.82)
  parent.add(wellRing)
  const core = new Mesh(new CylinderGeometry(0.23, 0.19, 0.12, 20, 1, false), m.amber)
  core.rotation.x = Math.PI / 2
  core.position.set(x, y, 1.84)
  parent.add(core)
  const opticRing = new Mesh(new TorusGeometry(0.27, 0.025, 4, 16), m.steel)
  opticRing.position.set(x, y, 1.89)
  parent.add(opticRing)
  const innerRing = new Mesh(new TorusGeometry(0.14, 0.018, 4, 14), m.graphite)
  innerRing.position.set(x, y, 1.91)
  parent.add(innerRing)
  const emitter = new Mesh(new CylinderGeometry(0.052, 0.052, 0.045, 12, 1, false), m.amber)
  emitter.rotation.x = Math.PI / 2
  emitter.position.set(x, y, 1.945)
  parent.add(emitter)
}

function addHead(parent: Group, m: Materials): void {
  // Deep armored octagonal casing; rear extends far enough to read as a sensor
  // volume rather than a decorated plate.
  addOctagonalDrum(parent, m.shell, 1, 2.46, [0, 0, 0.1], [2.38, 2.0, 1])
  addOctagonalDrum(parent, m.graphite, 1, 0.3, [0, 0, 1.38], [2.17, 1.79, 1])
  addOctagonalDrum(parent, m.ink, 1, 0.22, [0, 0, 1.58], [1.94, 1.57, 1])
  addPrism(parent, m.graphite, [1.36, 0.18, 1.22], [0, 1.86, -0.3], { chamfer: 0.09, fillet: 0.028, bevel: 0.02 })
  addPrism(parent, m.shell, [0.92, 0.12, 0.82], [0, 1.98, -0.12], { chamfer: 0.07, fillet: 0.022, bevel: 0.016 })
  const outerRim = new Mesh(new TorusGeometry(1, 0.075, 5, 8), m.shell)
  outerRim.scale.set(2.2, 1.82, 1)
  outerRim.position.z = 1.55
  parent.add(outerRim)
  const innerRim = new Mesh(new TorusGeometry(1, 0.052, 5, 8), m.steel)
  innerRim.scale.set(1.92, 1.55, 1)
  innerRim.position.z = 1.72
  parent.add(innerRim)

  for (const [x, y] of [
    [0, 0], [0, 0.92], [0, -0.92],
    [-0.8, 0.46], [0.8, 0.46], [-0.8, -0.46], [0.8, -0.46],
  ] as Array<[number, number]>) addHexCell(parent, m, x, y)

  for (const [x, y, w, h] of [
    [0, 1.52, 0.7, 0.08], [0, -1.52, 0.7, 0.08],
    [-1.75, 0, 0.08, 0.66], [1.75, 0, 0.08, 0.66],
  ] as Array<[number, number, number, number]>) {
    addPrism(parent, m.amber, [w, h, 0.055], [x, y, 1.8], { chamfer: 0.02, fillet: 0.006, bevel: 0.005 })
  }
  for (const [x, y] of [[-1.47, 1.18], [1.47, 1.18], [-1.47, -1.18], [1.47, -1.18]] as Array<[number, number]>) {
    addPrism(parent, m.graphite, [0.3, 0.28, 0.1], [x, y, 1.74], { chamfer: 0.06, fillet: 0.018, bevel: 0.014 })
    addPrism(parent, m.amber, [0.12, 0.1, 0.04], [x, y, 1.81], { chamfer: 0.02, fillet: 0.006, bevel: 0.004 })
  }
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2
    const bolt = new Mesh(new CylinderGeometry(0.038, 0.038, 0.045, 8, 1, false), m.steel)
    bolt.rotation.x = Math.PI / 2
    bolt.position.set(Math.cos(angle) * 1.78, Math.sin(angle) * 1.42, 1.82)
    parent.add(bolt)
  }

  // Rear service cassette, cooling ribs and top wear rails are seated proud of
  // the rear casing with visible depth rather than floating decals.
  addPrism(parent, m.graphite, [1.45, 1.16, 0.18], [0, 0, -1.22], { chamfer: 0.15, fillet: 0.045, bevel: 0.032 })
  addPrism(parent, m.shell, [1.12, 0.82, 0.13], [0, 0, -1.34], { chamfer: 0.12, fillet: 0.038, bevel: 0.027 })
  for (let i = -2; i <= 2; i += 1) addPrism(parent, m.graphite, [0.09, 0.5, 0.08], [i * 0.18, 0, -1.44], { chamfer: 0.018, fillet: 0.006, bevel: 0.005 })
  for (const x of [-1.42, 1.42]) {
    addPrism(parent, m.graphite, [0.38, 1.5, 0.22], [x, 0, -1.19], { chamfer: 0.09, fillet: 0.028, bevel: 0.02 })
    addPrism(parent, m.cyan, [0.08, 0.58, 0.05], [x, 0, -1.32], { chamfer: 0.018, fillet: 0.006, bevel: 0.005 })
  }
  for (const x of [-0.82, 0.82]) {
    addPrism(parent, m.graphite, [0.74, 0.42, 0.11], [x, 1.25, -1.34], { chamfer: 0.08, fillet: 0.025, bevel: 0.018 })
    addPrism(parent, m.steel, [0.48, 0.07, 0.035], [x, 1.25, -1.42], { chamfer: 0.018, fillet: 0.006, bevel: 0.005 })
  }
  addPrism(parent, m.graphite, [0.78, 0.3, 0.11], [0, -1.27, -1.34], { chamfer: 0.07, fillet: 0.022, bevel: 0.016 })
  addPrism(parent, m.ink, [0.46, 0.12, 0.04], [0, -1.27, -1.42], { chamfer: 0.028, fillet: 0.009, bevel: 0.007 })
  for (const x of [-2.08, 2.08]) {
    const sidePlate = new Mesh(new CylinderGeometry(0.72, 0.72, 0.18, 8, 1, false), m.shell)
    sidePlate.rotation.z = Math.PI / 2
    sidePlate.position.set(x + Math.sign(x) * 0.15, 0, 0)
    parent.add(sidePlate)
    const sideSocket = new Mesh(new CylinderGeometry(0.53, 0.53, 0.25, 12, 1, false), m.graphite)
    sideSocket.rotation.z = Math.PI / 2
    sideSocket.position.set(x + Math.sign(x) * 0.21, 0, 0)
    parent.add(sideSocket)
    const shoulder = new Mesh(new CylinderGeometry(0.48, 0.54, 0.5, 16, 1, false), m.graphite)
    shoulder.rotation.z = Math.PI / 2
    shoulder.position.set(x - Math.sign(x) * 0.08, 0, 0)
    parent.add(shoulder)
    const ring = new Mesh(new TorusGeometry(0.48, 0.075, 6, 18), m.steel)
    ring.rotation.y = Math.PI / 2
    ring.position.set(x - Math.sign(x) * 0.24, 0, 0)
    parent.add(ring)
    const shaft = new Mesh(new CylinderGeometry(0.29, 0.29, 0.62, 16, 1, false), m.graphite)
    shaft.rotation.z = Math.PI / 2
    shaft.position.set(x, 0, 0)
    parent.add(shaft)
  }

  // Load-contact wear is conveyed by the exposed steel bearing/rim collars;
  // avoid loose scratch bars on the chamfered crown where they would float.
}

function build(): {
  root: Group
  azimuth: Group
  elevation: Group
  materials: Materials
  handles: MaterialHandle[]
  geometries: Array<{ dispose: () => void }>
} {
  const acquired = makeMaterials()
  const root = new Group()
  root.name = 'military-sensor-array'
  const baseStatic = new Group()
  const azimuth = new Group()
  const yokeStatic = new Group()
  const elevation = new Group()
  const headStatic = new Group()
  root.add(baseStatic, azimuth)
  azimuth.position.y = 1.24
  azimuth.add(yokeStatic, elevation)
  // Elevation pivot is exactly coaxial with the two yoke bearings (their
  // shared local center is y=2.26 inside the azimuth group).
  elevation.position.y = 2.26
  elevation.add(headStatic)

  addBase(baseStatic, acquired.materials)
  addYoke(yokeStatic, acquired.materials)
  addHead(headStatic, acquired.materials)
  root.updateMatrixWorld(true)
  bakeOcclusion(root, { reach: 0.22 })
  bakeSurfaceAttributes(root, new Map())
  const geometries = [
    ...mergeStaticByMaterial(baseStatic, { meshName: (material) => `sensor base / ${material.name}` }),
    ...mergeStaticByMaterial(yokeStatic, { meshName: (material) => `sensor yoke / ${material.name}` }),
    ...mergeStaticByMaterial(headStatic, { meshName: (material) => `sensor head / ${material.name}` }),
  ]
  return { root, azimuth, elevation, materials: acquired.materials, handles: acquired.handles, geometries }
}

export function createModel(): SensorController {
  const rig = build()
  let elapsed = 0
  let enabled = false
  const applyTracking = (value: boolean) => { enabled = value }
  trackingListeners.add(applyTracking)
  return {
    root: rig.root,
    update: (deltaSeconds) => {
      const delta = Math.min(Math.max(deltaSeconds, 0), 0.05)
      if (!enabled) return
      elapsed += delta
      rig.azimuth.rotation.y = Math.sin(elapsed * 0.26) * 0.38
      rig.elevation.rotation.x = Math.sin(elapsed * 0.21 + 0.5) * 0.1
      rig.materials.amber.emissiveIntensity = 1.2 + Math.sin(elapsed * 1.15) * 0.09
    },
    toggleTracking: (value = !enabled) => {
      enabled = value
      return enabled
    },
    dispose: () => {
      trackingListeners.delete(applyTracking)
      for (const geometry of rig.geometries) geometry.dispose()
      for (const handle of rig.handles) handle.release()
    },
  }
}

function camera(aspect: number, position: Vec3, target: Vec3, fov = 33): PerspectiveCamera {
  const result = new PerspectiveCamera(fov, aspect, 0.2, 100)
  result.position.set(...position)
  result.lookAt(...target)
  return result
}

function makePreview(options: { aspect: number }, view: 'beauty' | 'side' | 'rear' | 'low' | 'tracking'): Preview {
  const controller = createModel()
  if (view === 'tracking') {
    controller.toggleTracking(true)
    for (let i = 0; i < 150; i += 1) controller.update(1 / 30)
  }
  const scene = new Scene()
  scene.background = new Color(0x010305)
  scene.add(controller.root, new HemisphereLight(0xa8bcc7, 0x050608, 0.62))
  const key = new DirectionalLight(0xfff0dc, 2.8); key.position.set(-8, 12, 13)
  const fill = new DirectionalLight(0x7da3bc, 0.92); fill.position.set(10, 7, 9)
  const rim = new DirectionalLight(0x9db9c8, 1.18); rim.position.set(8, 10, -12)
  scene.add(key, fill, rim)
  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const c = view === 'side'
    ? camera(aspect, [10.8, 5.0, 0.1], [0, 3.0, 0], 34)
    : view === 'rear'
      ? camera(aspect, [7.7, 6.1, -11.4], [0, 3.0, 0], 34)
      : view === 'low'
        ? camera(aspect, [-8.8, 1.05, 10.8], [0, 2.65, 0], 34)
        : view === 'tracking'
          ? camera(aspect, [-8.4, 6.4, 10.2], [0, 3.0, 0], 33)
          : camera(aspect, [-8.7, 6.6, 11.0], [0, 3.0, 0], 33)
  scene.add(c)
  return { scene, root: controller.root, camera: c, update: controller.update, toggleTracking: controller.toggleTracking, dispose: () => { scene.remove(controller.root); controller.dispose() } }
}

export function createPreview(options: { aspect: number }): Preview { return makePreview(options, 'beauty') }
export function createSidePreview(options: { aspect: number }): Preview { return makePreview(options, 'side') }
export function createRearPreview(options: { aspect: number }): Preview { return makePreview(options, 'rear') }
export function createLowPreview(options: { aspect: number }): Preview { return makePreview(options, 'low') }
export function createTrackingPreview(options: { aspect: number }): Preview { return makePreview(options, 'tracking') }
