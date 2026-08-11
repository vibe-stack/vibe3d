import {
  CatmullRomCurve3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three/webgpu'

import {
  bakeOcclusion,
  bakeSurfaceAttributes,
  createWearMaterial,
  cylinder,
  mergeStaticByMaterial,
  prism,
  WEAR_ATTRIBUTES,
  type Vec3,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'

const X_AXIS: Vec3 = [0, 0, Math.PI / 2]
const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]

interface CompressorMaterials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  graphiteEdge: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  pipeSteel: MeshPhysicalMaterial
  darkSteel: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  amberDim: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
  heatSteel: MeshPhysicalMaterial
  grime: MeshPhysicalMaterial
}

interface CompressorRig {
  root: Group
  rotor: Group
  materials: CompressorMaterials
  wearMaterial: MeshPhysicalMaterial
}

function makeMaterials(): CompressorMaterials {
  return {
    shell: new MeshPhysicalMaterial({
      name: 'industrial-compressor / worn ivory shell', color: 0xc8cecd,
      roughness: 0.43, metalness: 0.32, clearcoat: 0.15, clearcoatRoughness: 0.44,
    }),
    shellShade: new MeshPhysicalMaterial({
      name: 'industrial-compressor / shadowed shell armor', color: 0x8e999d,
      roughness: 0.5, metalness: 0.5, clearcoat: 0.08,
    }),
    graphite: new MeshPhysicalMaterial({
      name: 'industrial-compressor / cast graphite', color: 0x0d1419,
      roughness: 0.5, metalness: 0.72, clearcoat: 0.06,
    }),
    graphiteEdge: new MeshPhysicalMaterial({
      name: 'industrial-compressor / machined graphite edges', color: 0x273137,
      roughness: 0.37, metalness: 0.82,
    }),
    steel: new MeshPhysicalMaterial({
      name: 'industrial-compressor / structural steel', color: 0x7a858a,
      roughness: 0.26, metalness: 0.96, clearcoat: 0.24,
    }),
    pipeSteel: new MeshPhysicalMaterial({
      name: 'industrial-compressor / polished manifold steel', color: 0xc4cac9,
      roughness: 0.21, metalness: 0.72, clearcoat: 0.32, clearcoatRoughness: 0.18,
    }),
    darkSteel: new MeshPhysicalMaterial({
      name: 'industrial-compressor / dark exposed steel', color: 0x343b3e,
      roughness: 0.3, metalness: 0.94,
    }),
    amber: new MeshPhysicalMaterial({
      name: 'industrial-compressor / rotor heat lighting', color: 0xffa51c,
      roughness: 0.21, metalness: 0.1,
      emissive: new Color(0xff7208), emissiveIntensity: 2.25,
    }),
    amberDim: new MeshPhysicalMaterial({
      name: 'industrial-compressor / amber indicators', color: 0xd98414,
      roughness: 0.28, metalness: 0.12,
      emissive: new Color(0xff6400), emissiveIntensity: 1.45,
    }),
    cyan: new MeshPhysicalMaterial({
      name: 'industrial-compressor / cyan status display', color: 0x4ce6ed,
      roughness: 0.18, metalness: 0.04,
      emissive: new Color(0x1bd7df), emissiveIntensity: 2.2,
    }),
    heatSteel: new MeshPhysicalMaterial({
      name: 'industrial-compressor / heat-tinted turbine steel', color: 0x8c6851,
      roughness: 0.32, metalness: 0.9,
    }),
    grime: new MeshPhysicalMaterial({
      name: 'industrial-compressor / oily collar grime', color: 0x3d3b35,
      roughness: 0.94, metalness: 0.12,
    }),
  }
}

function add(parent: Group, ...meshes: Mesh[]): void {
  parent.add(...meshes)
}

function tube(
  material: MeshPhysicalMaterial,
  points: Vec3[],
  radius: number,
  tubularSegments = 30,
): Mesh {
  const curve = new CatmullRomCurve3(
    points.map(([x, y, z]) => new Vector3(x, y, z)),
    false,
    'centripetal',
  )
  return new Mesh(new TubeGeometry(curve, tubularSegments, radius, 9, false), material)
}

function memberBetween(
  material: MeshPhysicalMaterial,
  start: Vec3,
  end: Vec3,
  radius: number,
  segments = 12,
): Mesh {
  const a = new Vector3(...start)
  const b = new Vector3(...end)
  const direction = b.clone().sub(a)
  const midpoint = a.clone().add(b).multiplyScalar(0.5)
  const mesh = cylinder(material, radius, direction.length(), [midpoint.x, midpoint.y, midpoint.z], [0, 0, 0], segments)
  mesh.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize()))
  return mesh
}

function ringAtX(material: MeshPhysicalMaterial, radius: number, tubeRadius: number, x: number, y = 2.16, z = 0): Mesh {
  const mesh = new Mesh(new TorusGeometry(radius, tubeRadius, 6, 28), material)
  mesh.position.set(x, y, z)
  mesh.rotation.y = Math.PI / 2
  return mesh
}

function addBoltX(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number, radius = 0.05): void {
  parent.add(cylinder(material, radius, 0.16, [x, y, z], X_AXIS, 10))
}

function addBoltZ(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number, radius = 0.045): void {
  parent.add(cylinder(material, radius, 0.14, [x, y, z], Z_AXIS, 10))
}

function addShell(root: Group, m: CompressorMaterials): void {
  // Long pressure vessel and the two compound armored end caps.
  add(root,
    cylinder(m.shell, 1.48, 4.82, [0, 2.18, 0], X_AXIS, 26),
    cylinder(m.shellShade, 1.53, 0.34, [-2.36, 2.18, 0], X_AXIS, 24),
    cylinder(m.shell, 1.42, 0.34, [-2.55, 2.18, 0], X_AXIS, 24),
    cylinder(m.graphite, 1.56, 0.34, [-1.62, 2.18, 0], X_AXIS, 24),
    cylinder(m.graphiteEdge, 1.61, 0.18, [-1.48, 2.18, 0], X_AXIS, 24),
    cylinder(m.graphite, 1.61, 0.3, [1.72, 2.18, 0], X_AXIS, 24),
    cylinder(m.shellShade, 1.59, 0.44, [2.08, 2.18, 0], X_AXIS, 24),
  )

  // Narrow panel seams remain embedded around the barrel rather than floating.
  for (const x of [-2.05, -0.92, 0.42, 1.3]) {
    add(root, cylinder(m.grime, 1.493, 0.035, [x, 2.18, 0], X_AXIS, 24))
  }

  // Side service panel, cyan load glyph, seated fasteners and shell breaks.
  add(root,
    prism(m.graphiteEdge, [1.5, 0.98, 0.12], [-0.28, 2.18, 1.45], {
      chamfer: 0.2, fillet: 0.06, bevel: 0.035,
    }),
    prism(m.graphite, [1.28, 0.76, 0.1], [-0.28, 2.18, 1.54], {
      chamfer: 0.16, fillet: 0.045, bevel: 0.028,
    }),
  )
  for (const [x, y] of [[-0.84, 2.52], [0.28, 2.52], [-0.84, 1.84], [0.28, 1.84]] as const) {
    addBoltZ(root, m.steel, x, y, 1.61, 0.04)
  }
  for (const [x, y] of [[-0.47, 2.36], [-0.12, 2.36], [-0.47, 2.05], [-0.12, 2.05]] as const) {
    add(root, prism(m.cyan, [0.22, 0.13, 0.06], [x, y, 1.62], {
      chamfer: 0.035, fillet: 0.012, bevel: 0.01,
    }))
  }

  // Band clamp bridges, bolts, and restrained shell inset plates.
  for (const x of [-1.62, 1.72]) {
    for (const z of [-1.48, 1.48]) {
      add(root,
        prism(m.graphiteEdge, [0.44, 0.34, 0.18], [x, 2.18, z], {
          chamfer: 0.08, fillet: 0.025, bevel: 0.02,
        }),
      )
      addBoltZ(root, m.steel, x, 2.18, z + Math.sign(z) * 0.1, 0.055)
    }
  }
  add(root,
    prism(m.shellShade, [1.15, 0.48, 0.055], [0.74, 2.78, 1.37], {
      chamfer: 0.13, fillet: 0.04, bevel: 0.025,
    }),
    prism(m.grime, [0.92, 0.026, 0.02], [0.74, 2.53, 1.42], {
      chamfer: 0.006, fillet: 0.003, bevel: 0.003,
    }),
    prism(m.graphiteEdge, [1.36, 0.46, 0.12], [-1.02, 1.28, 1.4], {
      chamfer: 0.16, fillet: 0.05, bevel: 0.03,
    }),
    prism(m.graphite, [1.14, 0.28, 0.1], [-1.02, 1.28, 1.49], {
      chamfer: 0.12, fillet: 0.04, bevel: 0.025,
    }),
    prism(m.shellShade, [1.2, 0.42, 0.1], [0.82, 1.25, 1.41], {
      chamfer: 0.14, fillet: 0.045, bevel: 0.028,
    }),
    prism(m.graphiteEdge, [1.72, 0.4, 0.14], [0.54, 3.16, 1.08], {
      chamfer: 0.13, fillet: 0.04, bevel: 0.028,
    }),
    prism(m.graphite, [1.48, 0.22, 0.1], [0.54, 3.16, 1.18], {
      chamfer: 0.09, fillet: 0.028, bevel: 0.02,
    }),
    prism(m.amberDim, [1.2, 0.1, 0.065], [0.54, 3.16, 1.26], {
      chamfer: 0.045, fillet: 0.015, bevel: 0.012,
    }),
  )
  for (const x of [-0.2, 1.28]) addBoltZ(root, m.steel, x, 3.16, 1.26, 0.035)
}

function addTopHandles(root: Group, m: CompressorMaterials): void {
  for (const [x, width, z] of [[-1.46, 1.12, -0.14], [-0.04, 1.0, 0.1]] as const) {
    add(root,
      prism(m.graphite, [0.34, 0.18, 0.5], [x - width * 0.43, 3.55, z], {
        chamfer: 0.07, fillet: 0.025, bevel: 0.02,
      }),
      prism(m.graphite, [0.34, 0.18, 0.5], [x + width * 0.43, 3.55, z], {
        chamfer: 0.07, fillet: 0.025, bevel: 0.02,
      }),
      prism(m.shellShade, [width, 0.27, 0.42], [x, 4.15, z], {
        chamfer: 0.1, fillet: 0.035, bevel: 0.025,
      }),
      memberBetween(m.shell, [x - width * 0.43, 3.6, z], [x - width * 0.43, 4.05, z], 0.1, 12),
      memberBetween(m.shell, [x + width * 0.43, 3.6, z], [x + width * 0.43, 4.05, z], 0.1, 12),
    )
  }
}

function addRearService(root: Group, m: CompressorMaterials): void {
  add(root,
    cylinder(m.graphiteEdge, 1.12, 0.14, [-2.75, 2.18, 0], X_AXIS, 22),
    cylinder(m.graphite, 0.92, 0.16, [-2.84, 2.18, 0], X_AXIS, 22),
    ringAtX(m.steel, 0.9, 0.045, -2.93),
    cylinder(m.shellShade, 0.56, 0.17, [-2.94, 2.18, 0], X_AXIS, 18),
    cylinder(m.graphiteEdge, 0.32, 0.19, [-3.04, 2.18, 0], X_AXIS, 18),
  )
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2
    addBoltX(root, m.steel, -2.97, 2.18 + Math.cos(angle) * 0.88, Math.sin(angle) * 0.88, 0.045)
  }
  add(root, prism(m.amberDim, [0.08, 0.35, 0.16], [-3.03, 2.18, 0.44], {
    chamfer: 0.025, fillet: 0.008, bevel: 0.008, rotation: [0, Math.PI / 2, 0],
  }))
}

function addTopPipes(root: Group, m: CompressorMaterials): void {
  for (const x of [0.78, 1.43]) {
    for (const z of [-0.42, 0.42]) {
      add(root,
        cylinder(m.graphiteEdge, 0.19, 0.34, [x, 3.56, z], [0, 0, 0], 16),
        cylinder(m.darkSteel, 0.145, 0.28, [x, 3.75, z], [0, 0, 0], 16),
      )
    }
    root.add(tube(m.darkSteel, [
      [x, 3.68, -0.42], [x, 4.12, -0.42], [x, 4.45, -0.25],
      [x, 4.56, 0], [x, 4.45, 0.25], [x, 4.12, 0.42], [x, 3.68, 0.42],
    ], 0.12, 34))
  }
}

function createRotor(m: CompressorMaterials): Group {
  const rotor = new Group()
  rotor.name = 'industrial-compressor / animated inner rotor'
  add(rotor,
    cylinder(m.heatSteel, 1.16, 0.13, [0, 0, 0], X_AXIS, 24),
    cylinder(m.graphite, 0.7, 0.26, [0.12, 0, 0], X_AXIS, 24),
    cylinder(m.steel, 0.53, 0.3, [0.24, 0, 0], X_AXIS, 22),
    cylinder(m.graphiteEdge, 0.37, 0.34, [0.31, 0, 0], X_AXIS, 20),
  )
  for (let index = 0; index < 16; index += 1) {
    const angle = (index / 16) * Math.PI * 2
    const radius = 0.84
    add(rotor,
      prism(m.amber, [0.18, 0.48, 0.16], [0.12, Math.cos(angle) * radius, Math.sin(angle) * radius], {
        chamfer: 0.055, fillet: 0.018, bevel: 0.014, rotation: [angle, 0, 0],
      }),
      prism(m.darkSteel, [0.21, 0.33, 0.08], [0.19, Math.cos(angle) * 0.88, Math.sin(angle) * 0.88], {
        chamfer: 0.035, fillet: 0.012, bevel: 0.01, rotation: [angle, 0, 0],
      }),
    )
  }
  return rotor
}

function addRotorHousing(root: Group, m: CompressorMaterials): void {
  // Recess, lit turbine backing and open ring stack are all axially overlapped.
  add(root,
    cylinder(m.graphite, 1.43, 0.2, [2.48, 2.18, 0], X_AXIS, 26),
    cylinder(m.amberDim, 1.17, 0.08, [2.61, 2.18, 0], X_AXIS, 24),
    ringAtX(m.graphiteEdge, 1.42, 0.18, 2.7),
    ringAtX(m.darkSteel, 1.19, 0.09, 2.86),
    ringAtX(m.heatSteel, 1.07, 0.045, 2.91),
    ringAtX(m.graphite, 1.43, 0.13, 3.02),
    ringAtX(m.steel, 1.22, 0.045, 3.08),
  )
  // Dense static guide vanes sit behind the independently rotating amber rotor.
  for (let index = 0; index < 16; index += 1) {
    const angle = ((index + 0.5) / 16) * Math.PI * 2
    const radius = 0.94
    add(root, prism(m.darkSteel, [0.16, 0.42, 0.09], [2.77, 2.18 + Math.cos(angle) * radius, Math.sin(angle) * radius], {
      chamfer: 0.04, fillet: 0.014, bevel: 0.011, rotation: [angle + 0.16, 0, 0],
    }))
  }
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2
    const radius = 1.49
    add(root, prism(index % 2 === 0 ? m.graphiteEdge : m.shellShade,
      [0.42, 0.38, 0.5],
      [2.65, 2.18 + Math.cos(angle) * radius, Math.sin(angle) * radius], {
        chamfer: 0.11, fillet: 0.035, bevel: 0.03, rotation: [angle, 0, 0],
      }))
    addBoltX(root, m.steel, 2.89, 2.18 + Math.cos(angle) * radius, Math.sin(angle) * radius, 0.055)
  }
  for (let index = 0; index < 4; index += 1) {
    const angle = (index / 4) * Math.PI * 2
    add(root, prism(m.shellShade, [0.58, 0.48, 0.72], [2.58, 2.18 + Math.cos(angle) * 1.58, Math.sin(angle) * 1.58], {
      chamfer: 0.14, fillet: 0.045, bevel: 0.035, rotation: [angle, 0, 0],
    }))
  }
  add(root,
    prism(m.graphiteEdge, [0.34, 0.44, 0.34], [2.66, 3.57, 0.7], {
      chamfer: 0.08, fillet: 0.025, bevel: 0.02,
    }),
    prism(m.amberDim, [0.2, 0.17, 0.08], [2.86, 3.59, 0.7], {
      chamfer: 0.045, fillet: 0.014, bevel: 0.01,
    }),
  )
}

function addPipeNetwork(root: Group, m: CompressorMaterials): void {
  const upperPort: Vec3 = [2.35, 2.78, 1.43]
  const lowerPort: Vec3 = [2.44, 1.28, 1.43]
  const junction: Vec3 = [2.44, 1.32, 2.56]
  const basePort: Vec3 = [1.68, 0.52, 1.98]

  // Upper elbow continues from the turbine flange all the way into the base.
  root.add(tube(m.pipeSteel, [
    upperPort, [2.35, 2.78, 1.9], [2.35, 2.55, 2.42],
    [2.4, 2.08, 2.56], junction, [2.3, 0.86, 2.5], basePort,
  ], 0.18, 42))
  // Lower turbine branch penetrates the same T-junction body.
  root.add(tube(m.pipeSteel, [lowerPort, [2.44, 1.28, 2.02], junction], 0.165, 24))

  for (const [x, y, z] of [upperPort, lowerPort] as const) {
    add(root,
      cylinder(m.graphiteEdge, 0.31, 0.26, [x, y, z], Z_AXIS, 18),
      cylinder(m.pipeSteel, 0.22, 0.32, [x, y, z + 0.11], Z_AXIS, 16),
      cylinder(m.heatSteel, 0.245, 0.035, [x, y, z + 0.28], Z_AXIS, 18),
      cylinder(m.grime, 0.25, 0.025, [x, y, z + 0.3], Z_AXIS, 18),
    )
  }
  add(root,
    cylinder(m.pipeSteel, 0.36, 0.4, junction, [0, 0, 0], 18),
    cylinder(m.graphiteEdge, 0.39, 0.12, [junction[0], junction[1] + 0.12, junction[2]], [0, 0, 0], 18),
    cylinder(m.graphiteEdge, 0.3, 0.32, basePort, Z_AXIS, 18),
    cylinder(m.pipeSteel, 0.21, 0.34, [basePort[0], basePort[1], basePort[2] + 0.09], Z_AXIS, 16),
    cylinder(m.heatSteel, 0.235, 0.035, [basePort[0], basePort[1], basePort[2] + 0.27], Z_AXIS, 18),
    prism(m.graphite, [0.68, 0.82, 0.62], [2.28, 0.63, 2.38], {
      chamfer: 0.11, fillet: 0.035, bevel: 0.03,
    }),
    ringAtX(m.grime, 1.24, 0.018, 2.87),
  )
}

function addSled(root: Group, m: CompressorMaterials): void {
  // Two longitudinal rails, two crossbars, and four pads all terminate at y=0.
  add(root,
    prism(m.graphite, [7.2, 0.32, 0.5], [0, 0.3, -1.72], {
      chamfer: 0.09, fillet: 0.03, bevel: 0.03,
    }),
    prism(m.graphite, [7.2, 0.32, 0.5], [0, 0.3, 1.72], {
      chamfer: 0.09, fillet: 0.03, bevel: 0.03,
    }),
    prism(m.graphiteEdge, [0.54, 0.3, 3.62], [-2.85, 0.32, 0], {
      chamfer: 0.09, fillet: 0.03, bevel: 0.03,
    }),
    prism(m.graphiteEdge, [0.54, 0.3, 3.62], [2.85, 0.32, 0], {
      chamfer: 0.09, fillet: 0.03, bevel: 0.03,
    }),
    prism(m.graphiteEdge, [5.35, 0.26, 0.42], [-0.05, 0.48, -1.18], {
      chamfer: 0.08, fillet: 0.028, bevel: 0.025,
    }),
    prism(m.graphiteEdge, [5.35, 0.26, 0.42], [-0.05, 0.48, 1.18], {
      chamfer: 0.08, fillet: 0.028, bevel: 0.025,
    }),
  )

  for (const x of [-3.05, 3.05]) {
    for (const z of [-1.72, 1.72]) {
      add(root,
        prism(m.graphiteEdge, [1.34, 0.12, 1.28], [x, 0.06, z], {
          chamfer: 0.15, fillet: 0.05, bevel: 0.04,
        }),
        prism(m.graphiteEdge, [1.06, 0.2, 1.02], [x, 0.1, z], {
          chamfer: 0.12, fillet: 0.04, bevel: 0.035,
        }),
        prism(m.steel, [0.52, 0.035, 0.52], [x, 0.195, z], {
          chamfer: 0.07, fillet: 0.022, bevel: 0.014,
        }),
        cylinder(m.darkSteel, 0.13, 0.2, [x, 0.32, z], [0, 0, 0], 14),
      )
    }
  }

  // Eight load paths overlap both the rails and the barrel's lower collars.
  for (const x of [-1.72, 1.58]) {
    for (const z of [-1.28, 1.28]) {
      add(root,
        prism(m.graphite, [1.34, 0.14, 0.94], [x, 0.25, z], {
          chamfer: 0.12, fillet: 0.04, bevel: 0.032,
        }),
        memberBetween(m.graphiteEdge, [x - 0.42, 0.42, z], [x, 1.03, z], 0.16, 12),
        memberBetween(m.graphiteEdge, [x + 0.42, 0.42, z], [x, 1.03, z], 0.16, 12),
        prism(m.graphite, [0.5, 0.34, 0.48], [x, 0.56, z], {
          chamfer: 0.09, fillet: 0.03, bevel: 0.025,
        }),
        prism(m.graphiteEdge, [0.38, 1.02, 0.46], [x - 0.35, 0.72, z], {
          chamfer: 0.08, fillet: 0.026, bevel: 0.022, rotation: [0, 0, -0.5],
        }),
        prism(m.graphiteEdge, [0.38, 1.02, 0.46], [x + 0.35, 0.72, z], {
          chamfer: 0.08, fillet: 0.026, bevel: 0.022, rotation: [0, 0, 0.5],
        }),
      )
      addBoltZ(root, m.steel, x, 0.57, z + Math.sign(z) * 0.24, 0.05)
      for (const boltX of [x - 0.48, x + 0.48]) {
        add(root,
          cylinder(m.steel, 0.052, 0.16, [boltX, 0.34, z - 0.31], [0, 0, 0], 10),
          cylinder(m.steel, 0.052, 0.16, [boltX, 0.34, z + 0.31], [0, 0, 0], 10),
        )
      }
      add(root, prism(m.grime, [0.74, 0.022, 0.08], [x, 0.34, z], {
        chamfer: 0.008, fillet: 0.003, bevel: 0.003,
      }))
    }
  }

  // Front amber guard is held by two blocks and never floats across the sled.
  add(root,
    memberBetween(m.amberDim, [2.42, 0.54, -1.25], [2.42, 0.54, 1.25], 0.055, 12),
    prism(m.graphiteEdge, [0.42, 0.48, 0.42], [2.42, 0.54, -1.38], {
      chamfer: 0.08, fillet: 0.025, bevel: 0.02,
    }),
    prism(m.graphiteEdge, [0.42, 0.48, 0.42], [2.42, 0.54, 1.38], {
      chamfer: 0.08, fillet: 0.025, bevel: 0.02,
    }),
  )
}

function addLocalizedWear(root: Group, m: CompressorMaterials): void {
  // Deliberate grime at gravity seams and heat tint beside the turbine throat.
  add(root,
    ringAtX(m.grime, 1.49, 0.022, 1.56),
    ringAtX(m.grime, 1.47, 0.018, -1.48),
    ringAtX(m.heatSteel, 1.13, 0.028, 2.9),
    prism(m.grime, [1.05, 0.03, 0.025], [-0.28, 1.68, 1.46], {
      chamfer: 0.008, fillet: 0.003, bevel: 0.003,
    }),
  )
  // Sparse rubbed edges are seated into actual handles, clamps, and sled rails.
  for (const [x, y, z, width] of [
    [-1.78, 3.64, 0.2, 0.34], [0.22, 3.63, 0.12, 0.28],
    [-2.74, 0.48, 1.72, 0.36], [2.76, 0.48, -1.72, 0.32],
  ] as const) {
    add(root, prism(m.steel, [width, 0.025, 0.024], [x, y, z], {
      chamfer: 0.006, fillet: 0.003, bevel: 0.003,
    }))
  }
  for (const [x, z] of [[-3.05, -1.72], [-3.05, 1.72], [3.05, -1.72], [3.05, 1.72]] as const) {
    add(root, prism(m.steel, [0.62, 0.024, 0.12], [x, 0.135, z + Math.sign(z) * 0.48], {
      chamfer: 0.008, fillet: 0.003, bevel: 0.003,
    }))
  }
}

function bakeAndBatch(group: Group, profiles: ReadonlyMap<MeshPhysicalMaterial, WearProfile>, wearMaterial: MeshPhysicalMaterial): void {
  group.updateMatrixWorld(true)
  bakeOcclusion(group, { reach: 0.38 })
  bakeSurfaceAttributes(group, profiles)
  const worn = new Set(profiles.keys())
  group.traverse((object) => {
    if (object instanceof Mesh && !Array.isArray(object.material) && worn.has(object.material as MeshPhysicalMaterial)) {
      object.material = wearMaterial
    }
  })
  mergeStaticByMaterial(group, {
    retainedAttributes: (resolved) => resolved === wearMaterial ? WEAR_ATTRIBUTES : [],
    meshName: (material) => `industrial-compressor / ${material.name}`,
  })
}

function buildCompressor(): CompressorRig {
  const materials = makeMaterials()
  const wearMaterial = createWearMaterial({
    name: 'industrial-compressor / maintained production wear',
    clearcoat: 0.12,
    clearcoatRoughness: 0.46,
  })
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [materials.shell, { rub: 1.08, grime: 1.06, scratch: 0.3 }],
    [materials.shellShade, { rub: 0.88, grime: 1.22, scratch: 0.34 }],
    [materials.graphite, { rub: 0.55, grime: 1.48, scratch: 0.48 }],
    [materials.graphiteEdge, { rub: 0.74, grime: 1.3, scratch: 0.6 }],
    [materials.steel, { rub: 0.18, grime: 0.92, scratch: 1.15 }],
    [materials.darkSteel, { rub: 0.5, grime: 1.04, scratch: 0.72 }],
  ])

  const staticRoot = new Group()
  staticRoot.name = 'industrial-compressor / static housing'
  addSled(staticRoot, materials)
  addShell(staticRoot, materials)
  addRearService(staticRoot, materials)
  addTopHandles(staticRoot, materials)
  addTopPipes(staticRoot, materials)
  addRotorHousing(staticRoot, materials)
  addPipeNetwork(staticRoot, materials)
  addLocalizedWear(staticRoot, materials)
  bakeAndBatch(staticRoot, profiles, wearMaterial)

  const rotor = createRotor(materials)
  bakeAndBatch(rotor, profiles, wearMaterial)
  rotor.position.set(2.88, 2.18, 0)

  const root = new Group()
  root.name = 'industrial-compressor'
  root.add(staticRoot, rotor)
  return { root, rotor, materials, wearMaterial }
}

function disposeRig(rig: CompressorRig): void {
  rig.root.traverse((object) => {
    if (object instanceof Mesh) object.geometry.dispose()
  })
  for (const material of Object.values(rig.materials)) material.dispose()
  rig.wearMaterial.dispose()
}

export function createModel(): {
  root: Group
  update: (deltaSeconds: number) => void
  dispose: () => void
} {
  const rig = buildCompressor()
  return {
    root: rig.root,
    update: (deltaSeconds: number) => {
      const delta = Math.min(0.05, Math.max(0, deltaSeconds))
      rig.rotor.rotation.x = (rig.rotor.rotation.x + delta * 0.85) % (Math.PI * 2)
    },
    dispose: () => disposeRig(rig),
  }
}

interface CompressorPreview {
  scene: Scene
  root: Group
  camera: PerspectiveCamera
  update: (deltaSeconds: number) => void
  dispose: () => void
}

function previewCamera(aspect: number, position: Vec3, target: Vec3, fov = 30): PerspectiveCamera {
  const camera = new PerspectiveCamera(fov, aspect, 0.3, 80)
  camera.position.set(...position)
  camera.lookAt(...target)
  camera.updateProjectionMatrix()
  return camera
}

function makePreview(options: { aspect: number }, view: 'beauty' | 'side' | 'rear' | 'low'): CompressorPreview {
  const controller = createModel()
  const scene = new Scene()
  scene.name = `industrial-compressor / ${view} preview`
  scene.background = new Color(0x000000)
  scene.add(controller.root)
  scene.add(new HemisphereLight(0x92a8b6, 0x05070a, 0.31))
  const key = new DirectionalLight(0xffedda, 2.35)
  key.position.set(8, 11, 12)
  const fill = new DirectionalLight(0x6c92ad, 0.5)
  fill.position.set(-10, 5, 8)
  const rim = new DirectionalLight(0x9db9ca, 1.0)
  rim.position.set(-7, 9, -10)
  scene.add(key, fill, rim)

  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const camera = view === 'side'
    ? previewCamera(aspect, [-11.5, 6.0, 10.5], [0, 2.05, 0], 31)
    : view === 'rear'
      ? previewCamera(aspect, [-10.5, 5.2, -11.8], [0, 2.0, 0], 31)
      : view === 'low'
        ? previewCamera(aspect, [10.8, 1.0, 12.0], [0, 1.7, 0], 32)
        : previewCamera(aspect, [11.5, 7.2, 13.2], [0, 2.1, 0], 30)
  scene.add(camera)
  return {
    scene,
    root: controller.root,
    camera,
    update: controller.update,
    dispose: () => {
      scene.remove(controller.root)
      controller.dispose()
    },
  }
}

export function createPreview(options: { aspect: number }): CompressorPreview {
  return makePreview(options, 'beauty')
}

export function createSidePreview(options: { aspect: number }): CompressorPreview {
  return makePreview(options, 'side')
}

export function createRearPreview(options: { aspect: number }): CompressorPreview {
  return makePreview(options, 'rear')
}

export function createLowPreview(options: { aspect: number }): CompressorPreview {
  return makePreview(options, 'low')
}

export function createSpinPreview(options: { aspect: number; time?: number }): CompressorPreview {
  const preview = makePreview(options, 'beauty')
  const targetTime = Math.min(8, Math.max(0, options.time ?? 0))
  for (let elapsed = 0; elapsed < targetTime; elapsed += 0.05) {
    preview.update(Math.min(0.05, targetTime - elapsed))
  }
  return preview
}
