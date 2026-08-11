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

const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]
const X_AXIS: Vec3 = [0, 0, Math.PI / 2]

interface GeneratorMaterials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  graphiteEdge: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  amberDim: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
  darkGlass: MeshPhysicalMaterial
  grime: MeshPhysicalMaterial
}

interface GeneratorRig {
  root: Group
  materials: GeneratorMaterials
  wearMaterial: MeshPhysicalMaterial
}

function makeMaterials(): GeneratorMaterials {
  return {
    shell: new MeshPhysicalMaterial({
      name: 'field-generator / worn ivory alloy', color: 0xc8cfd0,
      roughness: 0.42, metalness: 0.34, clearcoat: 0.18, clearcoatRoughness: 0.42,
    }),
    shellShade: new MeshPhysicalMaterial({
      name: 'field-generator / shadowed shell panels', color: 0x919da1,
      roughness: 0.5, metalness: 0.48, clearcoat: 0.08,
    }),
    graphite: new MeshPhysicalMaterial({
      name: 'field-generator / cast graphite frame', color: 0x0c1217,
      roughness: 0.49, metalness: 0.7, clearcoat: 0.06,
    }),
    graphiteEdge: new MeshPhysicalMaterial({
      name: 'field-generator / machined dark edge', color: 0x222c31,
      roughness: 0.38, metalness: 0.79,
    }),
    steel: new MeshPhysicalMaterial({
      name: 'field-generator / crash-rail steel', color: 0x778187,
      roughness: 0.24, metalness: 0.95, clearcoat: 0.32,
    }),
    amber: new MeshPhysicalMaterial({
      name: 'field-generator / amber load lighting', color: 0xffa314,
      roughness: 0.2, metalness: 0.06, emissive: new Color(0xff7908), emissiveIntensity: 3.2,
    }),
    amberDim: new MeshPhysicalMaterial({
      name: 'field-generator / amber indicators', color: 0xe88a0c,
      roughness: 0.25, metalness: 0.08, emissive: new Color(0xff6800), emissiveIntensity: 1.75,
    }),
    cyan: new MeshPhysicalMaterial({
      name: 'field-generator / cyan control ring', color: 0x4fe9ef,
      roughness: 0.18, metalness: 0.04, emissive: new Color(0x1fd9e4), emissiveIntensity: 3.1,
    }),
    darkGlass: new MeshPhysicalMaterial({
      name: 'field-generator / smoked service lenses', color: 0x090f14,
      roughness: 0.15, metalness: 0.34, clearcoat: 0.76, clearcoatRoughness: 0.16,
    }),
    grime: new MeshPhysicalMaterial({
      name: 'field-generator / oily seam grime', color: 0x494842,
      roughness: 0.94, metalness: 0.12,
    }),
  }
}

function add(parent: Group, ...meshes: Mesh[]): void {
  parent.add(...meshes)
}

function cable(
  material: MeshPhysicalMaterial,
  points: Vec3[],
  radius: number,
  tubularSegments = 24,
): Mesh {
  const path = new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z)), false, 'centripetal')
  return new Mesh(new TubeGeometry(path, tubularSegments, radius, 8, false), material)
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

function addFrontBolt(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z = 1.81, radius = 0.045): void {
  parent.add(cylinder(material, radius, 0.14, [x, y, z], Z_AXIS, 10))
}

function addFootAndRail(root: Group, materials: GeneratorMaterials, side: -1 | 1, front: -1 | 1): void {
  const x = side * 2.72
  const z = front * 1.72
  const assembly = new Group()
  assembly.name = `field-generator / ${front > 0 ? 'front' : 'rear'} ${side > 0 ? 'right' : 'left'} rail`
  root.add(assembly)

  add(assembly,
    prism(materials.graphite, [0.66, 0.58, 0.72], [x, 0.37, z], {
      chamfer: [0.12, 0.12, 0.08, 0.08], fillet: 0.04, bevel: 0.045,
    }),
    prism(materials.graphiteEdge, [0.78, 0.18, 0.82], [x, 0.09, z], {
      chamfer: 0.1, fillet: 0.035, bevel: 0.035,
    }),
    prism(materials.steel, [0.42, 0.035, 0.5], [x, 0.185, z], {
      chamfer: 0.06, fillet: 0.02, bevel: 0.012,
    }),
  )

  const inwardZ = z - front * 0.36
  const rail = cable(materials.steel, [
    [x, 0.48, z], [x, 1.45, z], [x, 2.75, z],
    [x, 3.18, z - front * 0.13], [x, 3.37, inwardZ],
  ], 0.11, 26)
  assembly.add(rail)
  add(assembly,
    prism(materials.graphiteEdge, [0.48, 0.23, 0.52], [x, 3.33, inwardZ], {
      chamfer: 0.08, fillet: 0.03, bevel: 0.025,
    }),
    cylinder(materials.graphite, 0.145, 0.2, [x, 0.58, z], [0, 0, 0], 14),
  )
}

function addBody(root: Group, materials: GeneratorMaterials): void {
  add(root,
    // The painted casing is the exterior. The graphite chassis stays inside it
    // and is only exposed through the front bay, vents, and lower plinth.
    prism(materials.shellShade, [5.2, 3.08, 3.42], [0, 1.88, -0.02], {
      chamfer: [0.3, 0.3, 0.22, 0.22], fillet: 0.1, bevel: 0.07, bevelSegments: 2,
    }),
    prism(materials.shell, [5.1, 2.92, 3.34], [0, 1.98, -0.03], {
      chamfer: [0.28, 0.28, 0.18, 0.18], fillet: 0.09, bevel: 0.065, bevelSegments: 2,
    }),
    prism(materials.graphiteEdge, [4.76, 2.62, 0.22], [0, 1.87, 1.69], {
      chamfer: 0.28, fillet: 0.08, bevel: 0.04,
    }),
    prism(materials.graphite, [4.5, 2.36, 0.2], [0, 1.84, 1.84], {
      chamfer: 0.22, fillet: 0.07, bevel: 0.035,
    }),
    // Deep lower plinth supports the vent and front crash bar mounts.
    prism(materials.graphiteEdge, [4.76, 0.66, 3.34], [0, 0.57, 0], {
      chamfer: 0.14, fillet: 0.045, bevel: 0.045,
    }),
  )

  // Form-bound seams and rubbed metal edges sit into the shell, never above it.
  add(root,
    prism(materials.grime, [4.1, 0.05, 0.03], [0, 2.8, 1.63], {
      chamfer: 0.01, fillet: 0.004, bevel: 0.004,
    }),
    prism(materials.steel, [2.5, 0.025, 0.035], [-0.55, 3.36, 1.16], {
      chamfer: 0.006, fillet: 0.003, bevel: 0.003,
    }),
  )
}

function addTopDeck(root: Group, materials: GeneratorMaterials): void {
  add(root,
    prism(materials.shell, [4.66, 0.3, 3.06], [0, 3.36, -0.08], {
      chamfer: 0.22, fillet: 0.07, bevel: 0.05,
    }),
    prism(materials.shellShade, [2.25, 1.16, 0.075], [0.28, 3.55, -0.18], {
      chamfer: 0.12, fillet: 0.04, bevel: 0.02, rotation: [Math.PI / 2, 0, 0],
    }),
    prism(materials.graphite, [1.95, 0.9, 0.07], [0.28, 3.6, -0.18], {
      chamfer: 0.08, fillet: 0.025, bevel: 0.018, rotation: [Math.PI / 2, 0, 0],
    }),
    prism(materials.shellShade, [1.35, 0.72, 0.045], [-1.55, 3.56, 0.36], {
      chamfer: 0.12, fillet: 0.035, bevel: 0.016, rotation: [Math.PI / 2, 0, 0],
    }),
    prism(materials.shellShade, [1.08, 0.62, 0.045], [1.68, 3.56, 0.48], {
      chamfer: 0.11, fillet: 0.032, bevel: 0.015, rotation: [Math.PI / 2, 0, 0],
    }),
  )
  for (let index = -4; index <= 4; index += 1) {
    add(root, prism(materials.graphiteEdge, [1.58, 0.055, 0.055], [0.28, 3.645, -0.18 + index * 0.085], {
      chamfer: 0.012, fillet: 0.006, bevel: 0.006, rotation: [Math.PI / 2, 0, 0],
    }))
  }

  for (const [x, z, width] of [[-1.48, -0.54, 0.9], [1.62, -0.72, 1.12]] as const) {
    add(root,
      prism(materials.graphite, [0.22, 0.18, 0.32], [x - width * 0.42, 3.57, z], {
        chamfer: 0.06, fillet: 0.022, bevel: 0.02,
      }),
      prism(materials.graphite, [0.22, 0.18, 0.32], [x + width * 0.42, 3.57, z], {
        chamfer: 0.06, fillet: 0.022, bevel: 0.02,
      }),
      prism(materials.graphiteEdge, [width, 0.19, 0.27], [x, 3.7, z], {
        chamfer: 0.08, fillet: 0.03, bevel: 0.025,
      }),
    )
  }
}

function addSideLouver(root: Group, materials: GeneratorMaterials): void {
  add(root,
    prism(materials.graphiteEdge, [1.82, 1.48, 0.18], [-2.54, 1.75, -0.28], {
      chamfer: 0.16, fillet: 0.05, bevel: 0.035, rotation: [0, Math.PI / 2, 0],
    }),
    prism(materials.graphite, [1.58, 1.24, 0.12], [-2.65, 1.75, -0.28], {
      chamfer: 0.1, fillet: 0.03, bevel: 0.025, rotation: [0, Math.PI / 2, 0],
    }),
    prism(materials.shellShade, [1.12, 0.42, 0.04], [-2.59, 0.91, 0.72], {
      chamfer: 0.1, fillet: 0.03, bevel: 0.018, rotation: [0, Math.PI / 2, 0],
    }),
  )
  for (let index = -3; index <= 3; index += 1) {
    add(root, prism(materials.graphiteEdge, [1.35, 0.11, 0.11], [-2.73, 1.75 + index * 0.155, -0.28], {
      chamfer: 0.025, fillet: 0.01, bevel: 0.01, rotation: [0, Math.PI / 2, 0],
    }))
  }
  add(root,
    prism(materials.grime, [1.42, 0.035, 0.05], [-2.67, 2.42, -0.28], {
      chamfer: 0.008, fillet: 0.004, bevel: 0.004, rotation: [0, Math.PI / 2, 0],
    }),
    prism(materials.amberDim, [0.72, 0.05, 0.035], [-2.57, 2.72, -0.7], {
      chamfer: 0.012, fillet: 0.005, bevel: 0.005, rotation: [0, Math.PI / 2, 0],
    }),
  )
  // Recessed service-panel seams and seated screw heads break up the broad
  // painted flank while keeping every detail physically buried in the casing.
  for (const z of [-1.22, 0.66]) {
    add(root, prism(materials.grime, [1.34, 0.025, 0.025], [-2.61, 2.78, z], {
      chamfer: 0.006, fillet: 0.003, bevel: 0.003, rotation: [0, Math.PI / 2, 0],
    }))
  }
  for (const [y, z] of [[0.78, -1.34], [2.78, -1.34], [0.78, 0.78], [2.78, 0.78]] as const) {
    add(root,
      cylinder(materials.graphiteEdge, 0.068, 0.12, [-2.61, y, z], X_AXIS, 12),
      cylinder(materials.steel, 0.032, 0.14, [-2.67, y, z], X_AXIS, 10),
    )
  }
}

function addFrontPanel(root: Group, materials: GeneratorMaterials): void {
  // Header light and left segmented load gauge.
  add(root,
    prism(materials.darkGlass, [2.82, 0.42, 0.075], [0.58, 2.9, 1.98], {
      chamfer: 0.12, fillet: 0.035, bevel: 0.018,
    }),
    prism(materials.amber, [2.56, 0.18, 0.08], [0.58, 2.91, 2.035], {
      chamfer: 0.07, fillet: 0.025, bevel: 0.015,
    }),
    prism(materials.graphiteEdge, [0.72, 1.72, 0.08], [-1.72, 1.83, 1.99], {
      chamfer: 0.13, fillet: 0.04, bevel: 0.02,
    }),
    prism(materials.darkGlass, [0.5, 1.5, 0.075], [-1.72, 1.83, 2.045], {
      chamfer: 0.1, fillet: 0.03, bevel: 0.018,
    }),
  )
  for (let index = 0; index < 7; index += 1) {
    add(root, prism(index < 5 ? materials.amber : materials.amberDim, [0.28, 0.11, 0.07], [-1.72, 1.38 + index * 0.16, 2.095], {
      chamfer: 0.025, fillet: 0.01, bevel: 0.01,
    }))
  }
  add(root, prism(materials.amberDim, [0.25, 0.18, 0.07], [-1.72, 1.12, 2.095], {
    chamfer: 0.04, fillet: 0.015, bevel: 0.01,
  }))

  // Central octagonal power module and recessed amber core.
  add(root,
    prism(materials.graphiteEdge, [1.64, 1.55, 0.18], [-0.42, 1.62, 1.99], {
      chamfer: 0.28, fillet: 0.07, bevel: 0.045,
    }),
    prism(materials.shellShade, [1.42, 1.35, 0.22], [-0.42, 1.68, 2.12], {
      chamfer: 0.25, fillet: 0.065, bevel: 0.045,
    }),
    prism(materials.shell, [1.2, 1.13, 0.2], [-0.42, 1.65, 2.27], {
      chamfer: 0.22, fillet: 0.055, bevel: 0.04,
    }),
    prism(materials.graphite, [0.92, 0.78, 0.2], [-0.42, 1.55, 2.41], {
      chamfer: 0.2, fillet: 0.05, bevel: 0.035,
    }),
    prism(materials.darkGlass, [0.68, 0.53, 0.12], [-0.42, 1.55, 2.56], {
      chamfer: 0.16, fillet: 0.04, bevel: 0.025,
    }),
    prism(materials.amber, [0.46, 0.28, 0.1], [-0.42, 1.55, 2.65], {
      chamfer: 0.1, fillet: 0.03, bevel: 0.02,
    }),
    prism(materials.amberDim, [0.38, 0.13, 0.06], [-0.42, 2.27, 2.36], {
      chamfer: 0.045, fillet: 0.015, bevel: 0.012,
    }),
    prism(materials.graphiteEdge, [0.22, 0.72, 0.3], [-1.2, 1.61, 2.23], {
      chamfer: 0.07, fillet: 0.025, bevel: 0.02,
    }),
    prism(materials.graphiteEdge, [0.22, 0.72, 0.3], [0.36, 1.61, 2.23], {
      chamfer: 0.07, fillet: 0.025, bevel: 0.02,
    }),
  )
  for (const [x, y] of [[-1.0, 2.15], [0.15, 2.15], [-1.0, 1.0], [0.15, 1.0]] as const) {
    addFrontBolt(root, materials.steel, x, y, 2.21, 0.04)
  }

  // Right control plate, cyan ring, and auxiliary amber status lens.
  add(root,
    prism(materials.graphiteEdge, [1.45, 1.95, 0.12], [1.47, 1.82, 1.99], {
      chamfer: 0.16, fillet: 0.05, bevel: 0.03,
    }),
    cylinder(materials.cyan, 0.22, 0.08, [1.16, 2.38, 2.12], Z_AXIS, 20),
    cylinder(materials.graphite, 0.145, 0.16, [1.16, 2.38, 2.18], Z_AXIS, 18),
    cylinder(materials.darkGlass, 0.07, 0.19, [1.16, 2.38, 2.25], Z_AXIS, 14),
    prism(materials.darkGlass, [0.32, 0.32, 0.08], [1.88, 2.38, 2.11], {
      chamfer: 0.07, fillet: 0.02, bevel: 0.015,
    }),
    prism(materials.amberDim, [0.17, 0.17, 0.08], [1.88, 2.38, 2.17], {
      chamfer: 0.04, fillet: 0.012, bevel: 0.01,
    }),
  )
  for (const [x, y] of [[0.85, 2.8], [2.05, 2.8], [0.85, 0.85], [2.05, 0.85]] as const) {
    addFrontBolt(root, materials.steel, x, y, 2.08, 0.038)
  }

  addSocketsAndCables(root, materials)
  addLowerFront(root, materials)
}

function socketAssembly(parent: Group, materials: GeneratorMaterials, x: number, y: number): void {
  add(parent,
    cylinder(materials.graphiteEdge, 0.205, 0.24, [x, y, 2.08], Z_AXIS, 16),
    cylinder(materials.graphite, 0.15, 0.34, [x, y, 2.21], Z_AXIS, 16),
    cylinder(materials.steel, 0.105, 0.06, [x, y, 2.4], Z_AXIS, 14),
    cylinder(materials.amberDim, 0.122, 0.045, [x, y, 2.435], Z_AXIS, 14),
  )
}

function returnPort(parent: Group, materials: GeneratorMaterials, x: number, y: number): void {
  add(parent,
    cylinder(materials.graphiteEdge, 0.14, 0.18, [x, y, 2.1], Z_AXIS, 14),
    cylinder(materials.graphite, 0.09, 0.25, [x, y, 2.2], Z_AXIS, 12),
    cylinder(materials.steel, 0.108, 0.055, [x, y, 2.33], Z_AXIS, 12),
  )
}

function addSocketsAndCables(root: Group, materials: GeneratorMaterials): void {
  const sockets = [[1.12, 1.72], [1.78, 1.72], [1.12, 1.06]] as const
  const returns = [[1.48, 0.63], [2.0, 0.78], [0.78, 0.62]] as const
  for (const [x, y] of sockets) socketAssembly(root, materials, x, y)
  for (const [x, y] of returns) returnPort(root, materials, x, y)

  const cablePaths: Vec3[][] = [
    [[1.12, 1.72, 2.39], [1.34, 1.46, 2.52], [1.65, 1.08, 2.55], [1.48, 0.63, 2.34]],
    [[1.78, 1.72, 2.39], [2.08, 1.5, 2.54], [2.2, 1.02, 2.52], [2.0, 0.78, 2.34]],
    [[1.12, 1.06, 2.39], [1.03, 0.9, 2.5], [0.86, 0.76, 2.48], [0.78, 0.62, 2.34]],
  ]
  for (const points of cablePaths) root.add(cable(materials.graphite, points, 0.09, 22))
}

function addLowerFront(root: Group, materials: GeneratorMaterials): void {
  add(root,
    prism(materials.graphite, [2.65, 0.56, 0.12], [0.08, 0.55, 1.92], {
      chamfer: 0.1, fillet: 0.03, bevel: 0.025,
    }),
  )
  for (let index = -5; index <= 5; index += 1) {
    add(root, prism(materials.graphiteEdge, [0.105, 0.36, 0.1], [0.08 + index * 0.205, 0.55, 2.01], {
      chamfer: 0.02, fillet: 0.008, bevel: 0.008,
    }))
  }

  add(root,
    prism(materials.graphiteEdge, [0.5, 0.76, 0.46], [-1.88, 0.49, 1.92], {
      chamfer: 0.09, fillet: 0.03, bevel: 0.03,
    }),
    prism(materials.graphiteEdge, [0.5, 0.76, 0.46], [1.88, 0.49, 1.92], {
      chamfer: 0.09, fillet: 0.03, bevel: 0.03,
    }),
    memberBetween(materials.amber, [-1.67, 0.38, 2.2], [1.67, 0.38, 2.2], 0.095, 16),
    cylinder(materials.graphite, 0.145, 0.22, [-1.67, 0.38, 2.2], X_AXIS, 14),
    cylinder(materials.graphite, 0.145, 0.22, [1.67, 0.38, 2.2], X_AXIS, 14),
  )
}

function addWearAndRearService(root: Group, materials: GeneratorMaterials): void {
  // Rear service hatch: recessed frame, ventilated centre, and screw shanks all
  // penetrate the painted casing rather than hovering off the unseen face.
  add(root,
    prism(materials.graphiteEdge, [2.9, 1.5, 0.12], [0.35, 1.72, -1.73], {
      chamfer: 0.2, fillet: 0.06, bevel: 0.035,
    }),
    prism(materials.graphite, [2.62, 1.22, 0.1], [0.35, 1.72, -1.81], {
      chamfer: 0.14, fillet: 0.045, bevel: 0.025,
    }),
  )
  for (let index = -5; index <= 5; index += 1) {
    add(root, prism(materials.graphiteEdge, [2.1, 0.065, 0.07], [0.35, 1.72 + index * 0.085, -1.89], {
      chamfer: 0.015, fillet: 0.006, bevel: 0.006,
    }))
  }
  for (const [x, y] of [[-0.82, 2.26], [1.52, 2.26], [-0.82, 1.18], [1.52, 1.18]] as const) {
    add(root,
      cylinder(materials.graphite, 0.072, 0.14, [x, y, -1.83], Z_AXIS, 12),
      cylinder(materials.steel, 0.034, 0.16, [x, y, -1.9], Z_AXIS, 10),
    )
  }

  // Localized oily accumulation follows real panel/vent gravity lines.
  add(root,
    prism(materials.grime, [2.22, 0.035, 0.025], [0.35, 1.12, -1.88], {
      chamfer: 0.008, fillet: 0.003, bevel: 0.003,
    }),
    prism(materials.grime, [1.9, 0.032, 0.025], [-0.35, 0.73, 1.68], {
      chamfer: 0.008, fillet: 0.003, bevel: 0.003,
    }),
    prism(materials.grime, [1.75, 0.028, 0.022], [-2.61, 0.7, -0.25], {
      chamfer: 0.007, fillet: 0.003, bevel: 0.003, rotation: [0, Math.PI / 2, 0],
    }),
  )

  // Sparse rub-through sits on high-contact shell edges and module corners.
  for (const [x, y, z, width] of [
    [-2.46, 3.28, 1.05, 0.34], [2.12, 3.28, 1.28, 0.27],
    [-0.98, 2.15, 2.32, 0.18], [0.15, 1.03, 2.32, 0.16],
  ] as const) {
    add(root, prism(materials.steel, [width, 0.025, 0.022], [x, y, z], {
      chamfer: 0.006, fillet: 0.003, bevel: 0.003,
    }))
  }
}

function buildGenerator(): GeneratorRig {
  const materials = makeMaterials()
  const root = new Group()
  root.name = 'portable-field-generator'

  addBody(root, materials)
  addTopDeck(root, materials)
  addSideLouver(root, materials)
  addFrontPanel(root, materials)
  addWearAndRearService(root, materials)
  for (const side of [-1, 1] as const) {
    for (const front of [-1, 1] as const) addFootAndRail(root, materials, side, front)
  }

  root.updateMatrixWorld(true)
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [materials.shell, { rub: 1.18, grime: 1.18, scratch: 0.52 }],
    [materials.shellShade, { rub: 0.98, grime: 1.38, scratch: 0.46 }],
    [materials.graphite, { rub: 0.52, grime: 1.48, scratch: 0.5 }],
    [materials.graphiteEdge, { rub: 0.7, grime: 1.26, scratch: 0.58 }],
    [materials.steel, { rub: 0.16, grime: 0.95, scratch: 1.22 }],
  ])
  bakeOcclusion(root, { reach: 0.36 })
  bakeSurfaceAttributes(root, profiles)
  const wearMaterial = createWearMaterial({
    name: 'portable-field-generator / maintained industrial wear',
    clearcoat: 0.12,
    clearcoatRoughness: 0.46,
  })
  const worn = new Set(profiles.keys())
  root.traverse((object) => {
    if (object instanceof Mesh && !Array.isArray(object.material) && worn.has(object.material as MeshPhysicalMaterial)) {
      object.material = wearMaterial
    }
  })
  mergeStaticByMaterial(root, {
    retainedAttributes: (resolved) => resolved === wearMaterial ? WEAR_ATTRIBUTES : [],
    meshName: (material) => `portable-field-generator / ${material.name}`,
  })
  // The reference is deliberately low and transportable: preserve authored
  // detail while widening/deepening the whole static assembly into that stance.
  root.scale.set(1.08, 0.94, 1.06)
  root.updateMatrixWorld(true)
  return { root, materials, wearMaterial }
}

function disposeRig(rig: GeneratorRig): void {
  rig.root.traverse((object) => {
    if (object instanceof Mesh) object.geometry.dispose()
  })
  for (const material of Object.values(rig.materials)) material.dispose()
  rig.wearMaterial.dispose()
}

export function createModel(): {
  root: Group
  update: (deltaSeconds: number) => void
  triggerLoadPulse: () => void
  dispose: () => void
} {
  const rig = buildGenerator()
  let pulseElapsed = -1
  const duration = 2.4
  return {
    root: rig.root,
    update: (deltaSeconds: number) => {
      if (pulseElapsed < 0) return
      pulseElapsed = Math.min(duration, pulseElapsed + Math.min(Math.max(deltaSeconds, 0), 0.05))
      const envelope = Math.sin((pulseElapsed / duration) * Math.PI)
      rig.materials.amber.emissiveIntensity = 3.2 + envelope * 1.8
      rig.materials.amberDim.emissiveIntensity = 1.75 + envelope * 1.15
      rig.materials.cyan.emissiveIntensity = 3.1 + envelope * 0.7
      if (pulseElapsed >= duration) {
        pulseElapsed = -1
        rig.materials.amber.emissiveIntensity = 3.2
        rig.materials.amberDim.emissiveIntensity = 1.75
        rig.materials.cyan.emissiveIntensity = 3.1
      }
    },
    triggerLoadPulse: () => { pulseElapsed = 0 },
    dispose: () => disposeRig(rig),
  }
}

interface GeneratorPreview {
  scene: Scene
  root: Group
  camera: PerspectiveCamera
  update: (deltaSeconds: number) => void
  triggerLoadPulse: () => void
  dispose: () => void
}

function previewCamera(aspect: number, position: Vec3, target: Vec3, fov = 30): PerspectiveCamera {
  const camera = new PerspectiveCamera(fov, aspect, 0.25, 70)
  camera.position.set(...position)
  camera.lookAt(...target)
  camera.updateProjectionMatrix()
  return camera
}

function makePreview(options: { aspect: number }, view: 'beauty' | 'side' | 'rear' | 'low'): GeneratorPreview {
  const controller = createModel()
  const scene = new Scene()
  scene.name = `portable-field-generator / ${view} preview`
  scene.background = new Color(0x000000)
  scene.add(controller.root)
  scene.add(new HemisphereLight(0x91a6b4, 0x05070a, 0.3))
  const key = new DirectionalLight(0xfff0df, 2.3)
  key.position.set(-8, 10, 11)
  const fill = new DirectionalLight(0x7194ae, 0.48)
  fill.position.set(10, 4, 7)
  const rim = new DirectionalLight(0x9cb9c8, 1.0)
  rim.position.set(7, 8, -9)
  scene.add(key, fill, rim)

  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const camera = view === 'side'
    ? previewCamera(aspect, [11.2, 5.9, 10.1], [0, 1.72, 0], 31)
    : view === 'rear'
      ? previewCamera(aspect, [8.3, 5.2, -13.1], [0, 1.68, 0], 31)
      : view === 'low'
        ? previewCamera(aspect, [-9.2, 0.95, 11.3], [0, 1.52, 0.05], 32)
        : previewCamera(aspect, [-10.0, 6.5, 12.6], [0, 1.7, 0.08], 30)
  scene.add(camera)
  return {
    scene,
    root: controller.root,
    camera,
    update: controller.update,
    triggerLoadPulse: controller.triggerLoadPulse,
    dispose: () => {
      scene.remove(controller.root)
      controller.dispose()
    },
  }
}

export function createPreview(options: { aspect: number }): GeneratorPreview {
  return makePreview(options, 'beauty')
}

export function createSidePreview(options: { aspect: number }): GeneratorPreview {
  return makePreview(options, 'side')
}

export function createRearPreview(options: { aspect: number }): GeneratorPreview {
  return makePreview(options, 'rear')
}

export function createLowPreview(options: { aspect: number }): GeneratorPreview {
  return makePreview(options, 'low')
}

export function createLoadPreview(options: { aspect: number; time?: number }): GeneratorPreview {
  const preview = makePreview(options, 'beauty')
  preview.triggerLoadPulse()
  const targetTime = Math.min(2.35, Math.max(0, options.time ?? 0))
  for (let elapsed = 0; elapsed < targetTime; elapsed += 0.05) {
    preview.update(Math.min(0.05, targetTime - elapsed))
  }
  return preview
}
