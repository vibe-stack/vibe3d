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
  extrudeProfile,
  mergeStaticByMaterial,
  prism,
  type Vec3,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'

const X_AXIS: Vec3 = [0, 0, Math.PI / 2]
const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]

interface HeatExchangerMaterials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  edge: MeshPhysicalMaterial
  copper: MeshPhysicalMaterial
  darkCopper: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  pipe: MeshPhysicalMaterial
  grime: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  amberLiquid: MeshPhysicalMaterial
  glass: MeshPhysicalMaterial
}

interface HeatExchangerRig {
  root: Group
  materials: HeatExchangerMaterials
  wear: MeshPhysicalMaterial
  geometries: Array<{ dispose: () => void }>
}

function makeMaterials(): HeatExchangerMaterials {
  return {
    shell: new MeshPhysicalMaterial({
      name: 'industrial-heat-exchanger / maintained ivory armor',
      color: 0xc8cdca, roughness: 0.46, metalness: 0.32,
      clearcoat: 0.13, clearcoatRoughness: 0.44,
    }),
    shellShade: new MeshPhysicalMaterial({
      name: 'industrial-heat-exchanger / shadowed ivory armor',
      color: 0x929a99, roughness: 0.52, metalness: 0.46,
      clearcoat: 0.08,
    }),
    graphite: new MeshPhysicalMaterial({
      name: 'industrial-heat-exchanger / cast graphite chassis',
      color: 0x11171a, roughness: 0.57, metalness: 0.73,
      clearcoat: 0.06,
    }),
    edge: new MeshPhysicalMaterial({
      name: 'industrial-heat-exchanger / rubbed structural steel',
      color: 0x343d41, roughness: 0.36, metalness: 0.88,
      clearcoat: 0.11,
    }),
    copper: new MeshPhysicalMaterial({
      name: 'industrial-heat-exchanger / copper coil',
      color: 0x9a4e25, roughness: 0.31, metalness: 0.92,
      clearcoat: 0.1,
    }),
    darkCopper: new MeshPhysicalMaterial({
      name: 'industrial-heat-exchanger / oxidized coil',
      color: 0x463328, roughness: 0.48, metalness: 0.84,
    }),
    steel: new MeshPhysicalMaterial({
      name: 'industrial-heat-exchanger / fastener steel',
      color: 0x9ca3a2, roughness: 0.25, metalness: 0.97,
      clearcoat: 0.2,
    }),
    pipe: new MeshPhysicalMaterial({
      name: 'industrial-heat-exchanger / black process pipe',
      color: 0x202629, roughness: 0.4, metalness: 0.86,
      clearcoat: 0.1,
    }),
    grime: new MeshPhysicalMaterial({
      name: 'industrial-heat-exchanger / process grime',
      color: 0x28241f, roughness: 0.84, metalness: 0.16,
    }),
    amber: new MeshPhysicalMaterial({
      name: 'industrial-heat-exchanger / orange status lenses',
      color: 0xf2a019, roughness: 0.22, metalness: 0.06,
      emissive: new Color(0xff6d05), emissiveIntensity: 2.1,
    }),
    amberLiquid: new MeshPhysicalMaterial({
      name: 'industrial-heat-exchanger / illuminated coolant',
      color: 0xe9670a, roughness: 0.18, metalness: 0.02,
      emissive: new Color(0xff3d00), emissiveIntensity: 1.05,
      transparent: true, opacity: 0.78,
    }),
    glass: new MeshPhysicalMaterial({
      name: 'industrial-heat-exchanger / sight glass',
      color: 0xd6e4df, roughness: 0.08, metalness: 0.02,
      transmission: 0.8, thickness: 0.09, ior: 1.48,
      transparent: true, opacity: 0.3,
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

function pipeCurve(material: MeshPhysicalMaterial, points: Vec3[], radius: number, segments = 36): Mesh {
  const curve = new CatmullRomCurve3(points.map((point) => new Vector3(...point)), false, 'centripetal')
  return new Mesh(new TubeGeometry(curve, segments, radius, 10, false), material)
}

function ringX(material: MeshPhysicalMaterial, radius: number, tubeRadius: number, position: Vec3, radial = 8): Mesh {
  const mesh = new Mesh(new TorusGeometry(radius, tubeRadius, 5, radial), material)
  mesh.position.set(...position)
  mesh.rotation.y = Math.PI / 2
  return mesh
}

function ringY(material: MeshPhysicalMaterial, radius: number, tubeRadius: number, position: Vec3, radial = 8): Mesh {
  const mesh = new Mesh(new TorusGeometry(radius, tubeRadius, 5, radial), material)
  mesh.position.set(...position)
  mesh.rotation.x = Math.PI / 2
  return mesh
}

function boltZ(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number, radius = 0.042): void {
  parent.add(cylinder(material, radius, 0.13, [x, y, z], Z_AXIS, 8))
}

function brace(parent: Group, material: MeshPhysicalMaterial, start: [number, number], end: [number, number], z: number, width = 0.18): void {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const length = Math.hypot(dx, dy)
  box(
    parent,
    material,
    [length + 0.08, width, 0.18],
    [(start[0] + end[0]) * 0.5, (start[1] + end[1]) * 0.5, z],
    0.065,
    0.022,
    [0, 0, Math.atan2(dy, dx)],
  )
}

function addCompoundBase(root: Group, m: HeatExchangerMaterials): void {
  // The long spine and four wide pads overlap into one continuous load path.
  box(root, m.edge, [5.95, 0.3, 2.5], [-0.1, 0.23, 0], 0.18, 0.045)
  box(root, m.graphite, [5.38, 0.28, 2.16], [-0.02, 0.48, 0], 0.14, 0.035)
  for (const x of [-2.55, 2.42]) {
    for (const z of [-1.22, 1.22]) {
      box(root, m.edge, [1.08, 0.2, 0.94], [x, 0.1, z], 0.17, 0.04)
      box(root, m.graphite, [0.78, 0.12, 0.66], [x, 0.23, z], 0.13, 0.03)
      root.add(cylinder(m.steel, 0.08, 0.055, [x, 0.33, z], [0, 0, 0], 10))
    }
  }

  // Raised deck wedges receive the body pillars and keep the front face clear.
  for (const x of [-1.8, 1.95]) {
    box(root, m.shellShade, [0.78, 0.58, 2.02], [x, 0.74, 0], 0.16, 0.04)
    box(root, m.edge, [0.48, 0.28, 2.18], [x, 0.5, 0], 0.1, 0.03)
  }
  box(root, m.edge, [3.55, 0.42, 0.3], [0.12, 0.66, 1.01], 0.1, 0.03)

  // Two recessed service plates, deliberately asymmetric like the reference.
  for (const x of [-1.05, 1.66]) {
    box(root, m.graphite, [0.72, 0.045, 0.68], [x, 0.64, 0.93], 0.1, 0.012)
    box(root, m.edge, [0.5, 0.03, 0.46], [x, 0.675, 0.93], 0.07, 0.008)
  }
}

function addHousing(root: Group, m: HeatExchangerMaterials): void {
  // Rear pressure shell and deep thermal cavity. No front sheet hides the bank.
  box(root, m.graphite, [4.65, 3.46, 1.45], [0.2, 2.6, -0.05], 0.22, 0.055)
  box(root, m.grime, [4.12, 2.98, 0.12], [0.2, 2.6, 0.69], 0.12, 0.03)

  // Continuous ivory end cheeks and crown armor capture the dark inner frame.
  const cheekProfile: Array<[number, number]> = [
    [-0.3, -1.7], [0.14, -1.7], [0.3, -1.46], [0.3, 1.38],
    [0.17, 1.64], [-0.12, 1.72], [-0.3, 1.48],
  ]
  for (const x of [-2.05, 2.45]) {
    root.add(extrudeProfile(m.shell, cheekProfile, 1.9, [x, 2.58, -0.05], {
      fillet: 0.055, bevel: 0.045,
      arcSegments: 1, bevelSegments: 1,
    }))
    const innerX = x - Math.sign(x) * 0.25
    box(root, m.shellShade, [0.18, 2.86, 1.55], [innerX, 2.5, -0.01], 0.09, 0.027)
  }
  box(root, m.shell, [4.42, 0.62, 1.75], [0.2, 4.22, -0.08], 0.2, 0.05)
  box(root, m.shellShade, [4.08, 0.18, 1.48], [0.2, 3.9, -0.04], 0.08, 0.024)

  // Dark front frame stands proud of the coils by 140 mm.
  for (const y of [1.1, 4.0]) box(root, m.edge, [4.38, 0.22, 0.26], [0.2, y, 0.9], 0.08, 0.025)
  for (const x of [-1.92, 2.32]) box(root, m.edge, [0.22, 3.08, 0.26], [x, 2.55, 0.9], 0.08, 0.025)
  for (const y of [1.27, 3.82]) box(root, m.graphite, [4.02, 0.12, 0.2], [0.2, y, 1.02], 0.05, 0.016)
  for (const x of [-1.73, 2.13]) box(root, m.graphite, [0.12, 2.48, 0.2], [x, 2.55, 1.02], 0.05, 0.016)

  // Crown seams, lifting handles, and captured feet make the top intentional.
  for (const x of [-1.1, 1.25]) {
    box(root, m.edge, [0.88, 0.15, 0.28], [x, 4.58, -0.05], 0.065, 0.02)
    for (const dx of [-0.34, 0.34]) {
      box(root, m.graphite, [0.18, 0.32, 0.32], [x + dx, 4.43, -0.05], 0.055, 0.016)
      root.add(cylinder(m.steel, 0.04, 0.07, [x + dx, 4.3, 0.11], [0, 0, 0], 8))
    }
  }
  box(root, m.shellShade, [1.24, 0.035, 0.72], [0.24, 4.545, 0.31], 0.07, 0.01)
  box(root, m.shell, [0.92, 0.025, 0.5], [0.24, 4.575, 0.31], 0.05, 0.008)

  // Rear service skin is structural and inspectable rather than an empty facade.
  box(root, m.shellShade, [3.9, 2.7, 0.16], [0.2, 2.52, -0.84], 0.15, 0.035)
  box(root, m.graphite, [3.46, 2.24, 0.12], [0.2, 2.52, -0.96], 0.12, 0.028)
  for (const y of [1.62, 2.08, 2.54, 3.0, 3.46]) {
    box(root, m.edge, [2.86, 0.18, 0.09], [0.2, y, -1.055], 0.06, 0.018)
  }
  for (const x of [-1.51, 1.91]) {
    for (const y of [1.37, 3.68]) boltZ(root, m.steel, x, y, -1.11, 0.04)
  }
}

function addCoilBank(root: Group, m: HeatExchangerMaterials): void {
  // Two staggered layers give the bank real depth. Thin dark collars read as
  // heat-dissipation fins instead of a flat grille texture.
  const rows = 17
  for (let row = 0; row < rows; row += 1) {
    const y = 1.42 + row * 0.145
    const front = row % 2 === 0
    const z = front ? 1.115 : 1.015
    const radius = front ? 0.052 : 0.046
    const pipeMaterial = row % 4 === 1 ? m.darkCopper : m.copper
    root.add(cylinder(pipeMaterial, radius, 3.72, [0.2, y, z], X_AXIS, 10))
    for (let x = -1.47; x <= 1.87; x += 0.23) {
      root.add(ringX(m.grime, radius + 0.018, 0.012, [x, y, z], 7))
    }
  }

  // Visible return headers capture every row at both ends of the cavity.
  for (const x of [-1.62, 2.02]) {
    root.add(cylinder(m.darkCopper, 0.12, 2.62, [x, 2.58, 0.98], [0, 0, 0], 12))
    for (let y = 1.42; y <= 3.78; y += 0.29) {
      root.add(ringX(m.edge, 0.13, 0.025, [x, y, 0.98], 9))
    }
  }
}

function addFrontBraces(root: Group, m: HeatExchangerMaterials): void {
  const z = 1.28
  // Twin load trees bridge the full cavity and terminate in the perimeter.
  for (const cx of [-0.78, 1.18]) {
    box(root, m.edge, [0.24, 2.68, 0.2], [cx, 2.55, z], 0.08, 0.026)
    brace(root, m.edge, [cx, 2.55], [cx - 0.74, 3.48], z, 0.19)
    brace(root, m.edge, [cx, 2.55], [cx + 0.74, 3.48], z, 0.19)
    brace(root, m.edge, [cx, 2.55], [cx - 0.74, 1.62], z, 0.19)
    brace(root, m.edge, [cx, 2.55], [cx + 0.74, 1.62], z, 0.19)
    box(root, m.graphite, [0.48, 0.64, 0.24], [cx, 2.55, z + 0.02], 0.1, 0.03)
    box(root, m.edge, [0.27, 0.42, 0.12], [cx, 2.55, z + 0.16], 0.065, 0.018)
    for (const y of [1.36, 2.34, 2.76, 3.74]) boltZ(root, m.steel, cx, y, 1.43, 0.038)
  }

  // Corner gussets and orange condition lamps are seated inside the frame.
  for (const [x, y] of [[-1.66, 1.35], [-1.66, 3.74], [2.06, 1.35], [2.06, 3.74]] as const) {
    box(root, m.edge, [0.34, 0.34, 0.19], [x, y, 1.23], 0.1, 0.026, [0, 0, Math.PI / 4])
    box(root, m.graphite, [0.2, 0.2, 0.07], [x, y, 1.37], 0.055, 0.015, [0, 0, Math.PI / 4])
    for (const offset of [-0.062, 0, 0.062]) {
      box(root, m.amber, [0.038, 0.12, 0.025], [x + offset, y, 1.43], 0.01, 0.003, [0, 0, -Math.PI / 4])
    }
  }
}

function addLeftPlumbing(root: Group, m: HeatExchangerMaterials): void {
  const plumbing = new Group()
  plumbing.name = 'captured front-left pipe and sight-glass service assembly'
  plumbing.position.z = 0.55
  root.add(plumbing)
  root = plumbing

  // Both process lines are single continuous curves. Their endpoints disappear
  // into the upper header and lower manifold, with collars at every transition.
  const outer = pipeCurve(m.pipe, [
    [-2.3, 3.86, -0.38], [-2.65, 3.78, -0.36], [-2.86, 3.48, -0.34],
    [-2.88, 2.3, -0.25], [-2.86, 1.15, -0.12], [-2.68, 0.83, 0.02],
    [-2.38, 0.76, 0.22], [-2.12, 0.82, 0.38],
  ], 0.155, 42)
  const inner = pipeCurve(m.pipe, [
    [-1.98, 3.88, 0.02], [-2.24, 3.79, 0.07], [-2.43, 3.52, 0.13],
    [-2.44, 2.45, 0.2], [-2.43, 1.31, 0.25], [-2.28, 1.04, 0.34],
    [-2.05, 0.92, 0.48], [-1.86, 1.02, 0.62],
  ], 0.14, 42)
  root.add(outer, inner)

  // End sockets overlap the shell/header by more than one pipe radius.
  for (const [x, y, z] of [[-2.3, 3.86, -0.38], [-1.98, 3.88, 0.02], [-2.12, 0.82, 0.38], [-1.86, 1.02, 0.62]] as Vec3[]) {
    root.add(cylinder(m.edge, 0.21, 0.24, [x, y, z], X_AXIS, 12))
  }
  // Pipe clamps are paired shells around the real line, never floating rings.
  for (const [x, y, z, r] of [
    [-2.875, 3.08, -0.3, 0.155], [-2.86, 1.72, -0.18, 0.155],
    [-2.435, 3.0, 0.16, 0.14], [-2.43, 1.75, 0.23, 0.14],
  ] as const) {
    const collar = new Mesh(new TorusGeometry(r + 0.025, 0.035, 7, 14), m.edge)
    collar.position.set(x, y, z)
    collar.rotation.x = Math.PI / 2
    root.add(collar)
    box(root, m.edge, [0.14, 0.18, 0.3], [x + 0.17, y, z], 0.04, 0.014)
  }

  // Sight glass is held between a top separator and a lower instrument block.
  const sightX = -1.78
  root.add(cylinder(m.edge, 0.27, 0.42, [sightX, 3.42, 0.64], [0, 0, 0], 16))
  root.add(cylinder(m.graphite, 0.22, 0.3, [sightX, 3.7, 0.64], [0, 0, 0], 14))
  root.add(cylinder(m.edge, 0.25, 0.34, [sightX, 1.28, 0.64], [0, 0, 0], 16))
  root.add(cylinder(m.glass, 0.205, 1.9, [sightX, 2.32, 0.64], [0, 0, 0], 18))
  root.add(cylinder(m.amberLiquid, 0.155, 1.6, [sightX, 2.2, 0.64], [0, 0, 0], 16))
  root.add(ringY(m.steel, 0.225, 0.025, [sightX, 1.43, 0.64], 12))
  root.add(ringY(m.steel, 0.225, 0.025, [sightX, 3.22, 0.64], 12))
  box(root, m.edge, [0.46, 0.62, 0.34], [sightX, 0.92, 0.64], 0.1, 0.027)
  box(root, m.graphite, [0.28, 0.38, 0.2], [sightX, 0.92, 0.83], 0.06, 0.018)
  box(root, m.amber, [0.07, 0.26, 0.035], [sightX, 0.92, 0.955], 0.018, 0.006)
  box(root, m.edge, [0.36, 0.18, 0.28], [sightX, 3.84, 0.64], 0.065, 0.02)

  // A drain valve is physically captured by the base manifold.
  root.add(cylinder(m.steel, 0.17, 0.32, [-1.24, 0.69, 0.7], X_AXIS, 14))
  root.add(cylinder(m.edge, 0.11, 0.26, [-1.04, 0.69, 0.7], X_AXIS, 12))
  root.add(cylinder(m.copper, 0.045, 0.28, [-0.88, 0.51, 0.7], [0, 0, 0], 8))
}

function addFastenersAndWearLandmarks(root: Group, m: HeatExchangerMaterials): void {
  // Sparse fasteners reinforce actual access boundaries rather than wallpapering.
  for (const x of [-2.08, 2.48]) {
    for (const y of [1.15, 2.0, 3.1, 4.0]) boltZ(root, m.steel, x, y, 1.04, 0.043)
  }
  for (const x of [-2.32, 2.68]) {
    for (const y of [1.25, 3.78]) boltZ(root, m.edge, x, y, 0.94, 0.04)
  }

  // Localized grime ledges catch beneath the coil bank and pipe manifold.
  box(root, m.grime, [3.62, 0.045, 0.2], [0.2, 1.205, 1.0], 0.035, 0.01)
  box(root, m.grime, [0.58, 0.035, 0.3], [-2.46, 0.75, 0.34], 0.04, 0.01)
}

function buildRig(): HeatExchangerRig {
  const materials = makeMaterials()
  const root = new Group()
  root.name = 'industrial heat exchanger'
  const fixed = new Group()
  fixed.name = 'grounded heat exchanger chassis, coil bank, and process plumbing'
  root.add(fixed)

  addCompoundBase(fixed, materials)
  addHousing(fixed, materials)
  addCoilBank(fixed, materials)
  addFrontBraces(fixed, materials)
  addLeftPlumbing(fixed, materials)
  addFastenersAndWearLandmarks(fixed, materials)

  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [materials.shell, { rub: 0.08, grime: 0.035, scratch: 0.012 }],
    [materials.shellShade, { rub: 0.1, grime: 0.055, scratch: 0.016 }],
    [materials.graphite, { rub: 0.11, grime: 0.12, scratch: 0.02 }],
    [materials.edge, { rub: 0.16, grime: 0.08, scratch: 0.025 }],
    [materials.copper, { rub: 0.14, grime: 0.14, scratch: 0.018 }],
    [materials.darkCopper, { rub: 0.08, grime: 0.2, scratch: 0.012 }],
    [materials.steel, { rub: 0.2, grime: 0.045, scratch: 0.03 }],
    [materials.pipe, { rub: 0.11, grime: 0.17, scratch: 0.018 }],
    [materials.grime, { rub: 0.035, grime: 0.3, scratch: 0.006 }],
  ])
  bakeOcclusion(fixed, { reach: 0.18 })
  bakeSurfaceAttributes(fixed, profiles)
  const wear = createWearMaterial({
    name: 'industrial-heat-exchanger / localized maintained process wear',
    clearcoat: 0.1,
    clearcoatRoughness: 0.47,
  })
  fixed.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return
    if (profiles.has(object.material)) object.material = wear
  })

  const geometries = mergeStaticByMaterial(fixed, {
    retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material: { name?: string }): string => material.name ?? 'industrial-heat-exchanger batch',
  })
  root.userData.assetId = 'industrial-heat-exchanger'
  root.userData.staticMechanism = true
  return { root, materials, wear, geometries }
}

export function createModel(): { root: Group; dispose: () => void } {
  const rig = buildRig()
  return {
    root: rig.root,
    dispose: () => {
      for (const geometry of rig.geometries) geometry.dispose()
      rig.wear.dispose()
      for (const material of Object.values(rig.materials)) material.dispose()
    },
  }
}

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low' } = {}) {
  const model = createModel()
  const scene = new Scene()
  scene.background = new Color(0x030607)
  scene.add(model.root)
  scene.add(new HemisphereLight(0xc5ced0, 0x07090c, 0.84))
  const key = new DirectionalLight(0xffead4, 2.85)
  key.position.set(-7, 10, 9)
  scene.add(key)
  const fill = new DirectionalLight(0x779ac4, 1.05)
  fill.position.set(8, 5, 7)
  scene.add(fill)
  const rim = new DirectionalLight(0x82acb1, 0.95)
  rim.position.set(7, 8, -8)
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
  if (options.mode === 'side') camera.position.set(-8.4, 3.0, 0.1)
  else if (options.mode === 'rear') camera.position.set(6.6, 3.8, -8.2)
  else if (options.mode === 'low') camera.position.set(-7.2, 1.1, 7.6)
  else camera.position.set(-6.15, 4.75, 9.2)
  camera.lookAt(-0.02, options.mode === 'low' ? 1.8 : 2.35, 0.12)
  scene.add(camera)

  return {
    scene,
    root: model.root,
    camera,
    dispose: () => {
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
