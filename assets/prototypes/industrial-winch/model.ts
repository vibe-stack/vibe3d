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
  Quaternion,
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
  extrudeProfile,
  mergeStaticByMaterial,
  prism,
  type Vec3,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'

const X_AXIS: Vec3 = [0, 0, Math.PI / 2]
const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]

interface WinchMaterials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  edge: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  cable: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
}

interface WinchRig {
  root: Group
  drum: Group
  materials: WinchMaterials
  wear: MeshPhysicalMaterial
  geometries: Array<{ dispose: () => void }>
}

function materials(): WinchMaterials {
  return {
    shell: new MeshPhysicalMaterial({
      name: 'industrial-winch / maintained ivory armor',
      color: 0xc7ccca,
      roughness: 0.44,
      metalness: 0.34,
      clearcoat: 0.13,
      clearcoatRoughness: 0.42,
    }),
    shellShade: new MeshPhysicalMaterial({
      name: 'industrial-winch / shadowed shell armor',
      color: 0x828b8e,
      roughness: 0.5,
      metalness: 0.52,
      clearcoat: 0.08,
    }),
    graphite: new MeshPhysicalMaterial({
      name: 'industrial-winch / cast graphite',
      color: 0x11171b,
      roughness: 0.55,
      metalness: 0.74,
      clearcoat: 0.06,
    }),
    edge: new MeshPhysicalMaterial({
      name: 'industrial-winch / rubbed edge steel',
      color: 0x3d464a,
      roughness: 0.36,
      metalness: 0.86,
      clearcoat: 0.12,
    }),
    steel: new MeshPhysicalMaterial({
      name: 'industrial-winch / guide steel',
      color: 0x9ca4a5,
      roughness: 0.24,
      metalness: 0.96,
      clearcoat: 0.22,
      clearcoatRoughness: 0.18,
    }),
    cable: new MeshPhysicalMaterial({
      name: 'industrial-winch / oiled wound cable',
      color: 0x363733,
      roughness: 0.42,
      metalness: 0.9,
      clearcoat: 0.08,
    }),
    amber: new MeshPhysicalMaterial({
      name: 'industrial-winch / amber load indicators',
      color: 0xf3a419,
      roughness: 0.24,
      metalness: 0.08,
      emissive: new Color(0xff7808),
      emissiveIntensity: 2,
    }),
    cyan: new MeshPhysicalMaterial({
      name: 'industrial-winch / cyan status indicators',
      color: 0x52e5ec,
      roughness: 0.18,
      metalness: 0.04,
      emissive: new Color(0x1bd2dc),
      emissiveIntensity: 1.8,
    }),
  }
}

function box(
  parent: Group,
  material: MeshPhysicalMaterial,
  size: Vec3,
  position: Vec3,
  chamfer = 0.06,
  bevel = 0.02,
  rotation: Vec3 = [0, 0, 0],
): Mesh {
  const mesh = prism(material, size, position, {
    chamfer,
    fillet: Math.min(0.04, chamfer * 0.28),
    bevel,
    rotation,
  })
  parent.add(mesh)
  return mesh
}

function memberBetween(
  material: MeshPhysicalMaterial,
  start: Vec3,
  end: Vec3,
  radius: number,
  segments = 10,
): Mesh {
  const a = new Vector3(...start)
  const b = new Vector3(...end)
  const direction = b.clone().sub(a)
  const midpoint = a.clone().add(b).multiplyScalar(0.5)
  const mesh = cylinder(material, radius, direction.length(), midpoint.toArray() as Vec3, [0, 0, 0], segments)
  mesh.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize()))
  return mesh
}

function tube(material: MeshPhysicalMaterial, points: Vec3[], radius: number, segments = 24, radial = 8): Mesh {
  const curve = new CatmullRomCurve3(points.map((point) => new Vector3(...point)), false, 'centripetal')
  return new Mesh(new TubeGeometry(curve, segments, radius, radial, false), material)
}

function addBoltZ(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number, radius = 0.045): void {
  parent.add(cylinder(material, radius, 0.09, [x, y, z], Z_AXIS, 8))
}

function addStaticStructure(root: Group, m: WinchMaterials): void {
  // Broad two-tier plinth and four attached mounting feet define minY=0.
  box(root, m.edge, [5.2, 0.24, 2.8], [0, 0.12, 0], 0.16, 0.035)
  box(root, m.graphite, [4.76, 0.24, 2.42], [0, 0.34, 0], 0.12, 0.03)
  for (const x of [-2.18, 2.18]) {
    for (const z of [-1.12, 1.12]) {
      box(root, m.edge, [0.72, 0.16, 0.62], [x, 0.08, z], 0.13, 0.03)
      root.add(cylinder(m.graphite, 0.13, 0.08, [x, 0.22, z], [0, 0, 0], 12))
      root.add(cylinder(m.steel, 0.065, 0.055, [x, 0.25, z], [0, 0, 0], 10))
    }
  }

  // Continuous chamfered side towers swallow both flange/axle ends. Their
  // inner faces overlap the flange stack by 60 mm, making capture explicit.
  for (const x of [-1.82, 1.82]) {
    const side = Math.sign(x)
    const towerProfile: Array<[number, number]> = side < 0
      ? [[-0.41, -1.06], [-0.28, -1.41], [0.41, -1.41], [0.41, 1.2], [0.27, 1.36], [-0.12, 1.41], [-0.29, 1.25], [-0.41, 0.98]]
      : [[-0.41, -1.41], [0.28, -1.41], [0.41, -1.06], [0.41, 0.98], [0.29, 1.25], [0.12, 1.41], [-0.27, 1.36], [-0.41, 1.2]]
    root.add(extrudeProfile(m.shell, towerProfile, 2.16, [x, 1.79, 0], {
      fillet: 0.045,
      bevel: 0.04,
      arcSegments: 1,
      bevelSegments: 1,
    }))
    box(root, m.shellShade, [0.72, 0.42, 2.3], [x, 0.61, 0], 0.11, 0.03)
    const innerX = x - Math.sign(x) * 0.31
    box(root, m.graphite, [0.16, 2.15, 1.84], [innerX, 1.93, 0], 0.07, 0.022)
    box(root, m.edge, [0.22, 0.42, 1.98], [innerX, 2.91, 0], 0.08, 0.025)

    // Selective service panels and status lights remain physically proud.
    box(root, m.edge, [0.43, 0.72, 0.09], [x, 1.55, 1.105], 0.08, 0.022)
    box(root, m.graphite, [0.27, 0.49, 0.07], [x, 1.55, 1.19], 0.055, 0.016)
    box(root, m.graphite, [0.42, 0.24, 0.08], [x, 2.53, 1.14], 0.06, 0.018)
    box(root, m.cyan, [0.22, 0.075, 0.035], [x, 2.53, 1.205], 0.025, 0.008)
    box(root, m.graphite, [0.34, 0.18, 0.08], [x, 0.67, 1.14], 0.05, 0.015)
    box(root, m.cyan, [0.2, 0.06, 0.035], [x, 0.67, 1.205], 0.02, 0.006)
    box(root, m.edge, [0.48, 0.5, 0.34], [x, 0.66, 0.98], 0.1, 0.028, [0, 0, x < 0 ? -0.18 : 0.18])
    for (const y of [0.82, 2.77]) addBoltZ(root, m.edge, x, y, 1.21, 0.04)
  }

  // Asymmetric load strip and warning marks on the motor-side tower echo the
  // reference without mirroring every service cue.
  box(root, m.edge, [0.16, 0.82, 0.075], [-1.82, 2.02, 1.145], 0.04, 0.012)
  box(root, m.amber, [0.055, 0.62, 0.035], [-1.82, 2.02, 1.205], 0.014, 0.004)
  box(root, m.amber, [0.16, 0.07, 0.03], [1.82, 2.92, 1.205], 0.018, 0.005)

  // Top guide bar enters both upper tower sockets; rear brace repeats the load
  // path behind the drum instead of hanging from open air.
  root.add(cylinder(m.steel, 0.065, 3.1, [0, 3.12, -0.38], X_AXIS, 12))
  for (const x of [-1.5, 1.5]) {
    root.add(cylinder(m.graphite, 0.13, 0.22, [x, 3.12, -0.38], X_AXIS, 12))
  }
  box(root, m.graphite, [3.15, 0.18, 0.18], [0, 0.72, -1.06], 0.055, 0.016)
  for (const x of [-1.45, 1.45]) box(root, m.edge, [0.22, 0.4, 0.34], [x, 0.72, -1.02], 0.06, 0.018)

  // Left motor/gear stack is concentric with the axle and visibly seated into
  // the left tower rather than floating outside it.
  root.add(cylinder(m.shellShade, 0.68, 0.5, [-2.28, 2.05, 0.08], X_AXIS, 20))
  root.add(cylinder(m.edge, 0.53, 0.22, [-2.61, 2.05, 0.08], X_AXIS, 18))
  root.add(cylinder(m.graphite, 0.37, 0.17, [-2.75, 2.05, 0.08], X_AXIS, 16))
  root.add(cylinder(m.steel, 0.15, 0.19, [-2.86, 2.05, 0.08], X_AXIS, 12))
  box(root, m.amber, [0.08, 0.26, 0.035], [-2.69, 2.05, 0.48], 0.018, 0.006)
}

function addDrum(drum: Group, m: WinchMaterials): void {
  // Axle, core and flanges form one animated package. The axle endpoints enter
  // the fixed tower bearings, while the wound cable endpoints disappear under
  // the inner faces of both flanges.
  drum.add(cylinder(m.steel, 0.11, 3.22, [0, 0, 0], X_AXIS, 12))
  drum.add(cylinder(m.graphite, 0.84, 2.68, [0, 0, 0], X_AXIS, 24))
  for (const x of [-1.39, 1.39]) {
    drum.add(cylinder(m.edge, 1.08, 0.2, [x, 0, 0], X_AXIS, 24))
    drum.add(cylinder(m.graphite, 0.91, 0.12, [x - Math.sign(x) * 0.1, 0, 0], X_AXIS, 22))
  }

  // Close-packed pitch (2.54 / 20 ~= the 120 mm cable diameter) removes the
  // artificial dark gaps of the first pass. Three intertwined paths create a
  // real braided wire-rope surface instead of a smooth hose pretending to be
  // cable; every strand still terminates beneath both flange captures.
  const turns = 20
  const steps = turns * 20
  const strandPaths: Vec3[][] = [[], [], []]
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps
    const angle = t * turns * Math.PI * 2
    const radial = new Vector3(0, Math.cos(angle), Math.sin(angle))
    const tangent = new Vector3(
      2.54,
      -Math.sin(angle) * 0.965 * turns * Math.PI * 2,
      Math.cos(angle) * 0.965 * turns * Math.PI * 2,
    ).normalize()
    const binormal = new Vector3().crossVectors(tangent, radial).normalize()
    const center = new Vector3(-1.27 + t * 2.54, radial.y * 0.965, radial.z * 0.965)
    for (let strand = 0; strand < 3; strand += 1) {
      const phase = t * turns * Math.PI * 1.25 + strand * Math.PI * 2 / 3
      const point = center.clone()
        .addScaledVector(radial, Math.cos(phase) * 0.026)
        .addScaledVector(binormal, Math.sin(phase) * 0.026)
      strandPaths[strand]!.push(point.toArray() as Vec3)
    }
  }
  for (const strand of strandPaths) drum.add(tube(m.cable, strand, 0.029, steps, 6))
}

function addFairlead(root: Group, m: WinchMaterials): void {
  // Lower support bed connects fairlead to the plinth and both tower cheeks.
  box(root, m.graphite, [3.35, 0.34, 0.62], [0, 0.72, 0.92], 0.1, 0.028)
  for (const x of [-1.48, 1.48]) box(root, m.edge, [0.28, 0.7, 0.62], [x, 0.92, 0.96], 0.07, 0.022)

  // Central control/fairlead housing sits just in front of the wound cable.
  box(root, m.edge, [1.78, 0.9, 0.56], [0, 1.18, 1.22], 0.15, 0.035)
  box(root, m.graphite, [1.48, 0.65, 0.14], [0, 1.2, 1.53], 0.1, 0.028)
  box(root, m.amber, [1.04, 0.3, 0.055], [0, 1.22, 1.625], 0.075, 0.02)
  for (const x of [-0.67, 0.67]) addBoltZ(root, m.steel, x, 1.55, 1.61, 0.04)

  // A real U guide bar: both uprights enter seated amber sockets and the lower
  // span is captured by the central roller block.
  root.add(
    memberBetween(m.steel, [-0.9, 1.08, 1.58], [-0.9, 0.88, 1.72], 0.055, 10),
    memberBetween(m.steel, [0.9, 1.08, 1.58], [0.9, 0.88, 1.72], 0.055, 10),
    memberBetween(m.steel, [-0.9, 0.88, 1.72], [0.9, 0.88, 1.72], 0.055, 12),
  )
  for (const x of [-0.9, 0.9]) box(root, m.amber, [0.18, 0.22, 0.2], [x, 1.08, 1.5], 0.055, 0.016)

  // Front fairlead frame and roller are seated on the base; the roller axle is
  // swallowed by both prongs and no cable or guide endpoint remains open.
  for (const x of [-0.34, 0.34]) box(root, m.graphite, [0.22, 0.66, 0.3], [x, 0.55, 1.39], 0.065, 0.02)
  box(root, m.graphite, [0.9, 0.22, 0.34], [0, 0.26, 1.39], 0.07, 0.022)
  root.add(cylinder(m.edge, 0.13, 0.78, [0, 0.55, 1.56], X_AXIS, 12))
  root.add(cylinder(m.amber, 0.09, 0.48, [0, 0.55, 1.57], X_AXIS, 12))
  for (const x of [-0.22, 0.22]) box(root, m.amber, [0.12, 0.34, 0.12], [x, 0.34, 1.58], 0.035, 0.01)
  box(root, m.amber, [0.52, 0.12, 0.12], [0, 0.2, 1.58], 0.035, 0.01)
  for (const x of [-0.36, 0.36]) addBoltZ(root, m.steel, x, 0.32, 1.59, 0.035)
}

function buildRig(): WinchRig {
  const m = materials()
  const root = new Group()
  root.name = 'industrial winch'
  const fixed = new Group()
  fixed.name = 'fixed housing and fairlead'
  const drum = new Group()
  drum.name = 'drum and wound cable package'
  drum.position.set(0, 2.05, 0.05)
  root.add(fixed, drum)

  addStaticStructure(fixed, m)
  addFairlead(fixed, m)
  addDrum(drum, m)

  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [m.shell, { rub: 0.12, grime: 0.06, scratch: 0.018 }],
    [m.shellShade, { rub: 0.1, grime: 0.08, scratch: 0.018 }],
    [m.graphite, { rub: 0.12, grime: 0.18, scratch: 0.025 }],
    [m.edge, { rub: 0.18, grime: 0.1, scratch: 0.035 }],
    [m.steel, { rub: 0.22, grime: 0.05, scratch: 0.04 }],
    [m.cable, { rub: 0.1, grime: 0.14, scratch: 0.015 }],
  ])
  bakeOcclusion(root, { reach: 0.2 })
  bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({
    name: 'industrial-winch / form-aware maintained wear',
    clearcoat: 0.1,
    clearcoatRoughness: 0.46,
  })
  root.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return
    if (profiles.has(object.material)) object.material = wear
  })

  const batchOptions = {
    retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material: { name?: string }): string => material.name ?? 'industrial-winch batch',
  }
  const geometries = [
    ...mergeStaticByMaterial(fixed, batchOptions),
    ...mergeStaticByMaterial(drum, batchOptions),
  ]
  return { root, drum, materials: m, wear, geometries }
}

export function createModel(): {
  root: Group
  update: (deltaSeconds: number) => void
  dispose: () => void
} {
  const rig = buildRig()
  return {
    root: rig.root,
    update: (deltaSeconds: number) => {
      const delta = Math.min(Math.max(deltaSeconds, 0), 0.05)
      rig.drum.rotation.x += delta * 0.12
      const phase = ((rig.root.userData.previewPhase as number | undefined) ?? 0) + delta
      rig.root.userData.previewPhase = phase
      rig.materials.amber.emissiveIntensity = 1.9 + Math.sin(phase * 1.15) * 0.12
    },
    dispose: () => {
      for (const geometry of rig.geometries) geometry.dispose()
      rig.wear.dispose()
      for (const material of Object.values(rig.materials)) material.dispose()
    },
  }
}

export function createPreview(options: { aspect?: number; time?: number } = {}): {
  scene: Scene
  root: Group
  camera: PerspectiveCamera
  update: (deltaSeconds: number) => void
  dispose: () => void
} {
  const model = createModel()
  const scene = new Scene()
  scene.background = new Color(0x030609)
  scene.add(model.root)
  scene.add(new HemisphereLight(0xb9c6ca, 0x080a0d, 0.84))
  const key = new DirectionalLight(0xffead1, 2.7)
  key.position.set(-6, 9, 10)
  scene.add(key)
  const fill = new DirectionalLight(0x7693c7, 1.05)
  fill.position.set(8, 5, 5)
  scene.add(fill)
  const rim = new DirectionalLight(0x7fa7ad, 0.85)
  rim.position.set(5, 8, -8)
  scene.add(rim)

  const floorMaterial = new MeshPhysicalMaterial({ color: 0x080c10, roughness: 0.92, metalness: 0.05 })
  const floorGeometry = new PlaneGeometry(18, 18)
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.004
  floor.userData.excludeFromExport = true
  scene.add(floor)

  const aspect = Number.isFinite(options.aspect) && (options.aspect ?? 0) > 0 ? options.aspect! : 1
  const camera = new PerspectiveCamera(36, aspect, 0.1, 100)
  const mode = Math.floor(options.time ?? 0)
  if (mode === 2) camera.position.set(7.1, 2.7, 0.2)
  else if (mode === 3) camera.position.set(-5.8, 3.4, -7.2)
  else if (mode === 4) camera.position.set(5.7, 0.82, 6.6)
  else camera.position.set(-6.4, 4.25, 7.5)
  camera.lookAt(0, 1.55, 0.15)
  scene.add(camera)

  return {
    scene,
    root: model.root,
    camera,
    update: model.update,
    dispose: () => {
      floorGeometry.dispose()
      floorMaterial.dispose()
      model.dispose()
    },
  }
}

export const createSidePreview = (options: { aspect?: number } = {}) => createPreview({ ...options, time: 2 })
export const createRearPreview = (options: { aspect?: number } = {}) => createPreview({ ...options, time: 3 })
export const createLowPreview = (options: { aspect?: number } = {}) => createPreview({ ...options, time: 4 })
