import {
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SphereGeometry,
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
  grime: MeshPhysicalMaterial
  abrasion: MeshPhysicalMaterial
}

interface Preview {
  scene: Scene
  root: Group
  camera: PerspectiveCamera
  update: (deltaSeconds: number) => void
  dispose: () => void
}

const DISH_RADIUS = 3.3
const DISH_THETA = 0.84
const DISH_APERTURE = DISH_RADIUS * Math.sin(DISH_THETA)
const DISH_RIM_PLANE = DISH_RADIUS * Math.cos(DISH_THETA)

function makeMaterials(): { materials: Materials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 16101 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 16102 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'worked', seed: 16103 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 16104 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 16105 })
  const grime = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 16106 })
  const abrasion = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 16107 })

  const materials: Materials = {
    shell: tuneMaterial(shell, 0xc5c9c5, 0.47, 0.14, { clearcoat: 0.12 }),
    graphite: tuneMaterial(graphite, 0x253039, 0.56, 0.66),
    ink: tuneMaterial(ink, 0x05080b, 0.76, 0.18),
    steel: tuneMaterial(steel, 0x899398, 0.3, 0.9),
    amber: tuneMaterial(amber, 0xe17808, 0.2, 0.02, { emissive: 1.15 }),
    grime: tuneMaterial(grime, 0x282621, 0.95, 0.02),
    abrasion: tuneMaterial(abrasion, 0x69747a, 0.43, 0.8),
  }
  materials.shell.side = DoubleSide
  materials.graphite.side = DoubleSide
  return { materials, handles: [shell, graphite, ink, steel, amber, grime, abrasion] }
}

function addPrism(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, options: Parameters<typeof prism>[3] = {}): Mesh {
  const mesh = prism(material, size, position, options)
  parent.add(mesh)
  return mesh
}

function cylinderBetween(
  parent: Group,
  material: MeshPhysicalMaterial,
  start: Vector3,
  end: Vector3,
  radius: number,
  segments = 8,
): Mesh {
  const direction = end.clone().sub(start)
  const length = direction.length()
  const mesh = new Mesh(new CylinderGeometry(radius, radius, length, segments, 1, false), material)
  mesh.position.copy(start).add(end).multiplyScalar(0.5)
  mesh.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize()))
  parent.add(mesh)
  return mesh
}

function addBase(parent: Group, m: Materials): void {
  const lower = new Mesh(new CylinderGeometry(2.62, 2.62, 0.34, 8, 1, false), m.graphite)
  lower.position.y = 0.17
  parent.add(lower)
  const armor = new Mesh(new CylinderGeometry(2.34, 2.5, 0.52, 12, 1, false), m.shell)
  armor.position.y = 0.52
  parent.add(armor)
  const shoulder = new Mesh(new CylinderGeometry(1.78, 2.2, 0.34, 12, 1, false), m.graphite)
  shoulder.position.y = 0.9
  parent.add(shoulder)
  const turntable = new Mesh(new CylinderGeometry(1.62, 1.62, 0.3, 24, 1, false), m.ink)
  turntable.position.y = 1.08
  parent.add(turntable)
  const lightRing = new Mesh(new CylinderGeometry(1.52, 1.52, 0.13, 24, 1, true), m.amber)
  lightRing.position.y = 1.13
  parent.add(lightRing)

  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2
    const x = Math.cos(angle) * 2.12
    const z = Math.sin(angle) * 2.12
    addPrism(parent, m.shell, [0.96, 0.48, 0.82], [x, 0.53, z], { chamfer: 0.14, fillet: 0.04, bevel: 0.028, rotation: [0, -angle, 0] })
    addPrism(parent, m.graphite, [0.68, 0.32, 0.74], [Math.cos(angle) * 2.39, 0.16, Math.sin(angle) * 2.39], { chamfer: 0.1, fillet: 0.03, bevel: 0.022, rotation: [0, -angle, 0] })
    addPrism(parent, i % 2 === 0 ? m.amber : m.ink, [0.32, 0.09, 0.08], [Math.cos(angle) * 2.54, 0.46, Math.sin(angle) * 2.54], { chamfer: 0.025, fillet: 0.008, bevel: 0.006, rotation: [0, -angle, 0] })
    if (i % 2 === 0) addPrism(parent, m.graphite, [0.17, 0.38, 0.74], [x, 0.54, z], { chamfer: 0.04, fillet: 0.014, bevel: 0.01, rotation: [0, -angle, 0] })
    const bolt = new Mesh(new CylinderGeometry(0.04, 0.04, 0.04, 8, 1, false), m.steel)
    bolt.position.set(x, 0.79, z)
    parent.add(bolt)
  }
  // Oily turntable seam; foot abrasion is carried by the exposed steel bolts
  // rather than loose strips that could read as unterminated cables.
  const oil = new Mesh(new TorusGeometry(1.69, 0.025, 4, 32), m.graphite)
  oil.rotation.x = Math.PI / 2
  oil.position.y = 0.96
  parent.add(oil)
}

function addYoke(parent: Group, m: Materials): void {
  const bearingX = 2.38
  for (const x of [-bearingX, bearingX]) {
    addPrism(parent, m.graphite, [0.62, 2.2, 0.88], [x, 1.24, -1.0], { chamfer: 0.14, fillet: 0.045, bevel: 0.03 })
    addPrism(parent, m.shell, [0.46, 1.25, 0.22], [x, 1.16, -0.54], { chamfer: 0.1, fillet: 0.032, bevel: 0.024 })
    addPrism(parent, m.graphite, [0.9, 0.44, 1.04], [x, 0.24, -0.78], { chamfer: 0.13, fillet: 0.042, bevel: 0.03 })
    addPrism(parent, m.amber, [0.075, 0.48, 0.07], [x + Math.sign(x) * 0.32, 0.92, -0.41], { chamfer: 0.018, fillet: 0.006, bevel: 0.005 })
    const bearing = new Mesh(new CylinderGeometry(0.54, 0.54, 0.32, 16, 1, false), m.ink)
    bearing.rotation.z = Math.PI / 2
    bearing.position.set(x, 2.3, 0)
    parent.add(bearing)
    const collar = new Mesh(new TorusGeometry(0.53, 0.09, 6, 20), m.steel)
    collar.rotation.y = Math.PI / 2
    collar.position.set(x - Math.sign(x) * 0.17, 2.3, 0)
    parent.add(collar)
    addPrism(parent, m.graphite, [0.9, 0.72, 1.16], [x, 2.0, -0.53], { chamfer: 0.15, fillet: 0.048, bevel: 0.034 })
    addPrism(parent, m.shell, [0.68, 0.58, 0.16], [x, 1.98, 0.06], { chamfer: 0.11, fillet: 0.035, bevel: 0.025 })
  }
  // The left drive pod is deliberately heavier, matching the reference's
  // asymmetric elevation gearbox, while the right remains an idler bearing.
  addPrism(parent, m.graphite, [1.18, 1.32, 1.24], [-bearingX, 1.6, -0.94], { chamfer: 0.18, fillet: 0.055, bevel: 0.038 })
  addPrism(parent, m.shell, [0.9, 0.96, 0.18], [-bearingX, 1.6, -0.31], { chamfer: 0.14, fillet: 0.045, bevel: 0.03 })
  addPrism(parent, m.amber, [0.08, 0.36, 0.06], [-bearingX - 0.5, 1.46, -0.23], { chamfer: 0.018, fillet: 0.006, bevel: 0.005 })
  addPrism(parent, m.graphite, [1.02, 1.12, 1.16], [bearingX, 1.57, -0.92], { chamfer: 0.17, fillet: 0.052, bevel: 0.036 })
  addPrism(parent, m.shell, [0.76, 0.76, 0.18], [bearingX, 1.58, -0.33], { chamfer: 0.13, fillet: 0.042, bevel: 0.029 })
  addPrism(parent, m.graphite, [4.55, 0.46, 0.92], [0, 0.34, -0.8], { chamfer: 0.14, fillet: 0.045, bevel: 0.032 })
  addPrism(parent, m.ink, [2.9, 0.25, 0.68], [0, 0.15, -0.78], { chamfer: 0.09, fillet: 0.03, bevel: 0.022 })

  const cableCurve = new CatmullRomCurve3([
    new Vector3(-2.38, 2.03, -0.9),
    new Vector3(-2.82, 1.42, -1.16),
    new Vector3(-2.48, 0.58, -1.1),
    new Vector3(-1.62, 0.2, -0.9),
  ])
  parent.add(new Mesh(new TubeGeometry(cableCurve, 20, 0.065, 6, false), m.ink))
  for (const point of [new Vector3(-2.38, 2.03, -0.9), new Vector3(-1.62, 0.2, -0.9)]) {
    const collar = new Mesh(new CylinderGeometry(0.11, 0.11, 0.18, 10, 1, false), m.steel)
    collar.rotation.x = Math.PI / 2
    collar.position.copy(point)
    parent.add(collar)
  }
  addPrism(parent, m.graphite, [0.42, 0.34, 0.22], [-1.62, 0.2, -0.85], { chamfer: 0.06, fillet: 0.02, bevel: 0.014 })
}

function dishSurfaceZ(radial: number): number {
  return DISH_RIM_PLANE - Math.sqrt(Math.max(0, DISH_RADIUS * DISH_RADIUS - radial * radial))
}

function addDish(parent: Group, m: Materials): void {
  const bowlGeometry = new SphereGeometry(DISH_RADIUS, 36, 12, 0, Math.PI * 2, 0, DISH_THETA)
  bowlGeometry.translate(0, -DISH_RIM_PLANE, 0)
  bowlGeometry.rotateX(-Math.PI / 2)
  parent.add(new Mesh(bowlGeometry, m.shell))

  const rim = new Mesh(new TorusGeometry(DISH_APERTURE, 0.14, 8, 40), m.shell)
  parent.add(rim)
  const innerRim = new Mesh(new TorusGeometry(DISH_APERTURE - 0.18, 0.035, 5, 36), m.steel)
  innerRim.position.z = 0.015
  parent.add(innerRim)

  // Front seams and rear ribs follow the actual spherical section rather than
  // stopping in space. Their ends disappear beneath hub and rim collars.
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2
    const frontPoints: Vector3[] = []
    const backPoints: Vector3[] = []
    for (let s = 0; s <= 8; s += 1) {
      const t = s / 8
      const frontRadial = 0.48 + (DISH_APERTURE - 0.28 - 0.48) * t
      const backRadial = 0.58 + (DISH_APERTURE - 0.08 - 0.58) * t
      frontPoints.push(new Vector3(
        Math.cos(angle) * frontRadial,
        Math.sin(angle) * frontRadial,
        dishSurfaceZ(frontRadial) + 0.035,
      ))
      backPoints.push(new Vector3(
        Math.cos(angle) * backRadial,
        Math.sin(angle) * backRadial,
        dishSurfaceZ(backRadial) - 0.14,
      ))
    }
    parent.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(frontPoints), 18, 0.012, 4, false), m.steel))
    // A true seated back-frame: every rib follows the same compound bowl
    // surface and disappears beneath both the rear hub and the rim capture.
    // Alternating widths keep the rear readable without laying a second skin
    // over the bowl (the latter would create an unstable near-coplanar shell).
    parent.add(new Mesh(
      new TubeGeometry(new CatmullRomCurve3(backPoints), 18, i % 2 === 0 ? 0.072 : 0.048, 6, false),
      m.graphite,
    ))
    const clampAngle = angle
    const clampX = Math.cos(clampAngle) * DISH_APERTURE
    const clampY = Math.sin(clampAngle) * DISH_APERTURE
    addPrism(parent, m.graphite, [0.34, 0.44, 0.2], [clampX, clampY, -0.015], { chamfer: 0.07, fillet: 0.022, bevel: 0.016, rotation: [0, 0, clampAngle] })
    if (i % 3 === 0) addPrism(parent, m.amber, [0.12, 0.04, 0.045], [clampX, clampY, 0.105], { chamfer: 0.01, fillet: 0.003, bevel: 0.002, rotation: [0, 0, clampAngle] })
  }

  const hub = new Mesh(new CylinderGeometry(0.52, 0.62, 0.34, 20, 1, false), m.graphite)
  hub.rotation.x = Math.PI / 2
  hub.position.z = dishSurfaceZ(0) + 0.14
  parent.add(hub)
  const hubRing = new Mesh(new TorusGeometry(0.52, 0.1, 6, 20), m.steel)
  hubRing.position.z = dishSurfaceZ(0) + 0.34
  parent.add(hubRing)
  const rearHub = new Mesh(new CylinderGeometry(0.7, 0.58, 0.24, 20, 1, false), m.graphite)
  rearHub.rotation.x = Math.PI / 2
  rearHub.position.z = dishSurfaceZ(0) - 0.1
  parent.add(rearHub)
  const rearHubCollar = new Mesh(new TorusGeometry(0.66, 0.09, 6, 20), m.steel)
  rearHubCollar.position.z = dishSurfaceZ(0) - 0.23
  parent.add(rearHubCollar)

  // Feed horn: stacked base collars, tapered emitter, amber cap.
  const feedParts: Array<[number, number, number, MeshPhysicalMaterial]> = [
    // This collar shares the structural graphite finish so the articulated
    // dish remains four batches; the deeper ink finish is reserved for the
    // stationary turntable/yoke cavities where its value contrast is visible.
    [0.48, 0.58, 0.34, m.graphite],
    [0.38, 0.48, 0.34, m.steel],
    [0.28, 0.38, 0.95, m.shell],
    [0.18, 0.28, 0.52, m.shell],
    [0.24, 0.24, 0.22, m.amber],
  ]
  let cursor = dishSurfaceZ(0) + 0.3
  for (const [top, bottom, length, material] of feedParts) {
    const part = new Mesh(new CylinderGeometry(top, bottom, length, 16, 1, false), material)
    part.rotation.x = Math.PI / 2
    part.position.z = cursor + length / 2
    cursor += length
    parent.add(part)
  }
  const feedTip = cursor - 0.11
  const tipRing = new Mesh(new TorusGeometry(0.235, 0.045, 5, 16), m.steel)
  tipRing.position.z = cursor - 0.19
  parent.add(tipRing)
  const tipGuard = new Mesh(new TorusGeometry(0.22, 0.032, 5, 16), m.graphite)
  tipGuard.position.z = cursor - 0.015
  parent.add(tipGuard)

  for (const angle of [Math.PI / 2, Math.PI / 2 + Math.PI * 2 / 3, Math.PI / 2 + Math.PI * 4 / 3]) {
    const rimPoint = new Vector3(Math.cos(angle) * (DISH_APERTURE - 0.16), Math.sin(angle) * (DISH_APERTURE - 0.16), dishSurfaceZ(DISH_APERTURE - 0.16) + 0.08)
    const feedPoint = new Vector3(Math.cos(angle) * 0.23, Math.sin(angle) * 0.23, feedTip)
    cylinderBetween(parent, m.graphite, rimPoint, feedPoint, 0.045, 8)
    const rimCollar = new Mesh(new CylinderGeometry(0.1, 0.1, 0.16, 8, 1, false), m.steel)
    rimCollar.position.copy(rimPoint)
    rimCollar.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), feedPoint.clone().sub(rimPoint).normalize()))
    parent.add(rimCollar)
    const feedCollar = new Mesh(new CylinderGeometry(0.085, 0.085, 0.14, 8, 1, false), m.steel)
    feedCollar.position.copy(feedPoint)
    feedCollar.quaternion.copy(rimCollar.quaternion)
    parent.add(feedCollar)
  }

  // Elevation shaft collars are physically swallowed by the yoke bearings.
  for (const x of [-2.38, 2.38]) {
    const shoulder = new Mesh(new CylinderGeometry(0.46, 0.54, 0.5, 16, 1, false), m.graphite)
    shoulder.rotation.z = Math.PI / 2
    shoulder.position.set(x - Math.sign(x) * 0.08, 0, -0.04)
    parent.add(shoulder)
    const shoulderRing = new Mesh(new TorusGeometry(0.48, 0.075, 6, 18), m.steel)
    shoulderRing.rotation.y = Math.PI / 2
    shoulderRing.position.set(x - Math.sign(x) * 0.26, 0, -0.04)
    parent.add(shoulderRing)
    const shaft = new Mesh(new CylinderGeometry(0.31, 0.31, 0.58, 16, 1, false), m.graphite)
    shaft.rotation.z = Math.PI / 2
    shaft.position.set(x, 0, 0)
    parent.add(shaft)
  }
  // Sparse authored wear at rim clamps and feed collar.
  for (const angle of [0.1, 2.2, 4.4]) addPrism(parent, m.steel, [0.18, 0.045, 0.05], [Math.cos(angle) * DISH_APERTURE, Math.sin(angle) * DISH_APERTURE, 0.11], { chamfer: 0.01, rotation: [0, 0, angle] })
  const feedGrime = new Mesh(new TorusGeometry(0.43, 0.025, 4, 20), m.graphite)
  feedGrime.position.z = dishSurfaceZ(0) + 0.52
  parent.add(feedGrime)
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
  root.name = 'military-radar-dish'
  const baseStatic = new Group()
  const azimuth = new Group()
  const yokeStatic = new Group()
  const elevation = new Group()
  const dishStatic = new Group()
  root.add(baseStatic, azimuth)
  azimuth.position.y = 1.08
  azimuth.add(yokeStatic, elevation)
  elevation.position.y = 2.3
  elevation.rotation.x = -0.52
  elevation.add(dishStatic)

  addBase(baseStatic, acquired.materials)
  addYoke(yokeStatic, acquired.materials)
  addDish(dishStatic, acquired.materials)
  root.updateMatrixWorld(true)
  bakeOcclusion(root, { reach: 0.24 })
  bakeSurfaceAttributes(root, new Map())
  const geometries = [
    ...mergeStaticByMaterial(baseStatic, { meshName: (material) => `radar base / ${material.name}` }),
    ...mergeStaticByMaterial(yokeStatic, { meshName: (material) => `radar yoke / ${material.name}` }),
    ...mergeStaticByMaterial(dishStatic, { meshName: (material) => `radar dish / ${material.name}` }),
  ]
  return { root, azimuth, elevation, materials: acquired.materials, handles: acquired.handles, geometries }
}

export function createModel(): { root: Group; update: (deltaSeconds: number) => void; dispose: () => void } {
  const rig = build()
  let elapsed = 0
  return {
    root: rig.root,
    update: (deltaSeconds) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      rig.azimuth.rotation.y = Math.sin(elapsed * 0.24) * 0.34
      rig.elevation.rotation.x = -0.52 + Math.sin(elapsed * 0.19 + 0.6) * 0.07
      rig.materials.amber.emissiveIntensity = 1.05 + Math.sin(elapsed * 1.4) * 0.08
    },
    dispose: () => {
      for (const geometry of rig.geometries) geometry.dispose()
      for (const handle of rig.handles) handle.release()
    },
  }
}

function camera(aspect: number, position: Vec3, target: Vec3, fov = 32): PerspectiveCamera {
  const result = new PerspectiveCamera(fov, aspect, 0.22, 100)
  result.position.set(...position)
  result.lookAt(...target)
  return result
}

function makePreview(options: { aspect: number }, view: 'beauty' | 'side' | 'rear' | 'low' | 'animation'): Preview {
  const controller = createModel()
  if (view === 'animation') controller.update(5.8)
  const scene = new Scene()
  scene.background = new Color(0x010305)
  scene.add(controller.root, new HemisphereLight(0x9eb4c1, 0x050608, 0.58))
  const key = new DirectionalLight(0xfff1df, 2.75); key.position.set(-8, 12, 13)
  const fill = new DirectionalLight(0x7da1bd, 0.9); fill.position.set(11, 7, 10)
  const rim = new DirectionalLight(0x9ab8ca, 1.15); rim.position.set(8, 10, -12)
  scene.add(key, fill, rim)
  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const c = view === 'side'
    ? camera(aspect, [10.5, 5.0, 0.2], [0, 2.9, 0], 34)
    : view === 'rear'
      ? camera(aspect, [8.0, 6.4, -11.5], [0, 3.0, 0], 34)
      : view === 'low'
        ? camera(aspect, [-8.6, 1.0, 10.8], [0, 2.6, 0], 34)
        : view === 'animation'
          ? camera(aspect, [-8.5, 6.4, 10.2], [0, 3.0, 0], 33)
          : camera(aspect, [-8.8, 6.8, 11.2], [0, 3.0, 0], 33)
  scene.add(c)
  return { scene, root: controller.root, camera: c, update: controller.update, dispose: () => { scene.remove(controller.root); controller.dispose() } }
}

export function createPreview(options: { aspect: number }): Preview { return makePreview(options, 'beauty') }
export function createSidePreview(options: { aspect: number }): Preview { return makePreview(options, 'side') }
export function createRearPreview(options: { aspect: number }): Preview { return makePreview(options, 'rear') }
export function createLowPreview(options: { aspect: number }): Preview { return makePreview(options, 'low') }
export function createAnimationPreview(options: { aspect: number }): Preview { return makePreview(options, 'animation') }
