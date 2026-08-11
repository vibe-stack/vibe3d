import {
  Box3,
  CatmullRomCurve3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Scene,
  TubeGeometry,
  Vector3,
} from 'three/webgpu'

import {
  MaterialLibrary,
  WEAR_ATTRIBUTES,
  bakeOcclusion,
  bakeSurfaceAttributes,
  createWearMaterial,
  cylinder,
  downTriangle,
  flatPlate,
  groove,
  mergeStaticByMaterial,
  prism,
  tuneMaterial,
  type MaterialHandle,
  type Vec3,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'

const FACE_Z: Vec3 = [Math.PI / 2, 0, 0]
const FACE_X: Vec3 = [0, Math.PI / 2, 0]

interface BankMaterials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  cartridge: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  amberDim: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
  grime: MeshPhysicalMaterial
}

interface BankRig {
  root: Group
  materials: BankMaterials
  handles: MaterialHandle[]
  wearMaterial: MeshPhysicalMaterial
  chargeBars: Mesh[]
  chargeMaterials: MeshPhysicalMaterial[]
  staticGeometries: Array<{ dispose: () => void }>
}

interface BankPreview {
  scene: Scene
  root: Group
  camera: PerspectiveCamera
  update: (deltaSeconds: number) => void
  dispose: () => void
}

function add(parent: Group, ...meshes: Mesh[]): void {
  parent.add(...meshes)
}

function pipe(material: MeshPhysicalMaterial, points: Vec3[], radius: number, segments = 24): Mesh {
  const curve = new CatmullRomCurve3(points.map((point) => new Vector3(...point)), false, 'centripetal')
  return new Mesh(new TubeGeometry(curve, segments, radius, 8, false), material)
}

function acquireMaterials(): { materials: BankMaterials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-100', condition: 'worked', seed: 8401 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-300', condition: 'worked', seed: 8402 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 8403 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'worked', seed: 8404 })
  const steel = library.acquire({ recipeId: 'MAT-01', palette: 'STEEL', condition: 'worked', seed: 8405 })
  const cartridge = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 8406 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 8407 })
  const amberDim = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-300', condition: 'active', seed: 8408 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 8409 })
  const grime = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 8410 })
  return {
    materials: {
      shell: tuneMaterial(shell, 0xc9ced0, 0.42, 0.2, { clearcoat: 0.18 }),
      shellShade: tuneMaterial(shellShade, 0x899397, 0.5, 0.38, { clearcoat: 0.1 }),
      graphite: tuneMaterial(graphite, 0x20272d, 0.52, 0.66, { clearcoat: 0.1 }),
      ink: tuneMaterial(ink, 0x070b0f, 0.72, 0.32),
      steel: tuneMaterial(steel, 0x79858a, 0.28, 0.94, { clearcoat: 0.28 }),
      cartridge: tuneMaterial(cartridge, 0x10161b, 0.56, 0.56, { clearcoat: 0.08 }),
      amber: tuneMaterial(amber, 0xc96504, 0.22, 0.03, { emissive: 0.82 }),
      amberDim: tuneMaterial(amberDim, 0xa85304, 0.3, 0.12, { emissive: 0.44 }),
      cyan: tuneMaterial(cyan, 0x087b91, 0.2, 0.02, { emissive: 0.48 }),
      grime: tuneMaterial(grime, 0x292621, 0.9, 0.08),
    },
    handles: [shell, shellShade, graphite, ink, steel, cartridge, amber, amberDim, cyan, grime],
  }
}

function addGroundBase(root: Group, m: BankMaterials): void {
  add(root,
    prism(m.graphite, [6.55, 0.86, 4.08], [0, 0.58, 0], {
      chamfer: [0.25, 0.25, 0.14, 0.14], fillet: 0.07, bevel: 0.06,
    }),
    prism(m.ink, [5.72, 0.18, 3.46], [0, 0.88, 0], {
      chamfer: 0.14, fillet: 0.04, bevel: 0.035,
    }),
  )
  // Recessed armor joints segment the large front plate into serviceable
  // shoulder panels while leaving its broad protective areas intact.
  for (const [x, y, length, rotation] of [
    [-2.38, 3.45, 0.72, 0], [2.58, 3.4, 0.82, 0],
    [-1.48, 4.0, 0.58, Math.PI / 2], [1.88, 4.0, 0.62, Math.PI / 2],
  ] as const) {
    root.add(groove(m.graphite, length, 0.035, 0.026, [x, y, 1.932], [0, 0, rotation]))
  }
  for (const [x, y] of [[-2.36, 3.88], [2.48, 3.84], [-2.4, 1.1], [2.5, 1.12]] as const) {
    root.add(cylinder(m.steel, 0.055, 0.08, [x, y, 2.0], FACE_Z, 10))
  }

  for (const [x, z] of [[-3.2, -1.76], [3.2, -1.76], [-3.2, 1.76], [3.2, 1.76]] as const) {
    add(root,
      prism(m.graphite, [1.42, 0.5, 1.16], [x, 0.36, z], {
        chamfer: [0.16, 0.16, 0.08, 0.08], fillet: 0.045, bevel: 0.04,
      }),
      prism(m.steel, [0.88, 0.12, 0.7], [x, 0.06, z], {
        chamfer: 0.1, fillet: 0.03, bevel: 0.025,
      }),
      cylinder(m.ink, 0.085, 0.05, [x - 0.34, 0.48, z], [0, 0, 0], 10),
      prism(m.shellShade, [0.78, 0.16, 0.76], [x, 0.52, z], {
        chamfer: 0.1, fillet: 0.03, bevel: 0.025,
      }),
      prism(m.graphite, [1.38, 0.44, 0.72], [x, 0.66, z * 0.94], {
        chamfer: [0.18, 0.18, 0.08, 0.08], fillet: 0.045, bevel: 0.04,
      }),
      prism(m.ink, [0.68, 0.22, 0.2], [x, 0.67, z > 0 ? 2.055 : -2.055], {
        chamfer: 0.06, fillet: 0.02, bevel: 0.016,
      }),
    )
  }
  // Layered triangular undercuts are located in the structural base webs.
  for (const x of [-2.25, 2.25]) {
    root.add(downTriangle(m.steel, 0.52, 0.42, [x, 0.6, 2.055]))
    root.add(downTriangle(m.ink, 0.34, 0.28, [x, 0.6, 2.078]))
  }
}

function addCoreAndArmor(root: Group, m: BankMaterials): void {
  add(root,
    prism(m.graphite, [6.02, 3.52, 3.65], [0, 2.5, 0], {
      chamfer: [0.28, 0.28, 0.18, 0.18], fillet: 0.08, bevel: 0.065,
    }),
    prism(m.shellShade, [5.9, 3.56, 3.58], [0, 2.55, -0.02], {
      chamfer: [0.32, 0.32, 0.2, 0.2], fillet: 0.09, bevel: 0.07,
    }),
    // The front shell is a thick host for the recessed interface and meter.
    prism(m.shell, [5.42, 3.42, 0.34], [0.1, 2.52, 1.75], {
      chamfer: [0.34, 0.34, 0.2, 0.2], fillet: 0.09, bevel: 0.07,
    }),
  )

  // Four corner spines make the white enclosure read as structural armor.
  for (const x of [-2.72, 2.72]) {
    for (const z of [-1.58, 1.58]) {
      root.add(prism(m.shell, [0.62, 3.38, 0.66], [x, 2.56, z], {
        chamfer: [0.14, 0.14, 0.1, 0.1], fillet: 0.05, bevel: 0.045,
      }))
    }
  }
  // Layered lower and upper shoulders bridge the corner spines into the shell,
  // eliminating the single smooth-box read from the first capture.
  for (const x of [-2.5, 2.5]) {
    add(root,
      prism(m.shell, [0.92, 0.7, 0.54], [x, 1.22, 1.62], {
        chamfer: [0.18, 0.18, 0.08, 0.08], fillet: 0.05, bevel: 0.045,
      }),
      prism(m.shellShade, [0.84, 0.5, 0.16], [x, 3.72, 1.91], {
        chamfer: 0.12, fillet: 0.038, bevel: 0.032,
      }),
    )
  }

  // Panel seams collect grime only under real armor overhangs.
  add(root,
    prism(m.grime, [4.72, 0.045, 0.035], [0.08, 4.08, 1.925], {
      chamfer: 0.01, fillet: 0.005, bevel: 0.005,
    }),
    prism(m.grime, [4.6, 0.04, 0.035], [0.08, 0.98, 1.927], {
      chamfer: 0.01, fillet: 0.005, bevel: 0.005,
    }),
  )
}

function addTop(root: Group, m: BankMaterials): void {
  add(root,
    prism(m.shell, [5.9, 0.34, 0.62], [0, 4.25, 1.47], {
      chamfer: 0.16, fillet: 0.055, bevel: 0.045,
    }),
    prism(m.shell, [5.9, 0.34, 0.62], [0, 4.25, -1.47], {
      chamfer: 0.16, fillet: 0.055, bevel: 0.045,
    }),
    prism(m.shell, [0.66, 0.34, 2.42], [-2.64, 4.25, 0], {
      chamfer: 0.15, fillet: 0.05, bevel: 0.045,
    }),
    prism(m.shell, [0.66, 0.34, 2.42], [2.64, 4.25, 0], {
      chamfer: 0.15, fillet: 0.05, bevel: 0.045,
    }),
    prism(m.graphite, [4.78, 0.2, 2.55], [0, 4.28, 0], {
      chamfer: 0.22, fillet: 0.065, bevel: 0.05,
    }),
    prism(m.ink, [3.92, 0.08, 1.92], [-0.25, 4.34, -0.12], {
      chamfer: 0.14, fillet: 0.04, bevel: 0.026,
    }),
    cylinder(m.graphite, 0.34, 0.14, [-0.45, 4.4, -0.18], [0, 0, 0], 18),
    cylinder(m.steel, 0.21, 0.16, [-0.45, 4.47, -0.18], [0, 0, 0], 18),
    prism(m.graphite, [1.42, 0.09, 1.34], [-1.62, 4.385, -0.05], {
      chamfer: 0.12, fillet: 0.035, bevel: 0.026,
    }),
    prism(m.graphite, [1.18, 0.09, 1.18], [1.62, 4.385, -0.32], {
      chamfer: 0.11, fillet: 0.032, bevel: 0.024,
    }),
  )

  // Top service handle terminates in broad collars recessed into the deck.
  for (const x of [0.92, 2.05]) {
    root.add(cylinder(m.graphite, 0.17, 0.16, [x, 4.42, 0.92], [0, 0, 0], 14))
  }
  root.add(pipe(m.amberDim, [
    [0.92, 4.41, 0.92], [0.96, 4.66, 0.92], [1.15, 4.78, 0.92],
    [1.82, 4.78, 0.92], [2.01, 4.66, 0.92], [2.05, 4.41, 0.92],
  ], 0.095, 26))
}

function addFrontInterface(root: Group, m: BankMaterials, chargeBars: Mesh[], chargeMaterials: MeshPhysicalMaterial[]): void {
  // Upper charge meter: dark recess, protective bezel and six real light bars.
  add(root,
    prism(m.graphite, [2.42, 1.12, 0.3], [0.65, 3.42, 1.99], {
      chamfer: 0.17, fillet: 0.05, bevel: 0.04,
    }),
    prism(m.ink, [1.96, 0.72, 0.16], [0.65, 3.42, 2.21], {
      chamfer: 0.1, fillet: 0.03, bevel: 0.025,
    }),
  )
  for (let index = 0; index < 6; index += 1) {
    const material = m.amber.clone()
    material.name = `armored-battery-bank / charge bar ${index + 1}`
    chargeMaterials.push(material)
    const bar = prism(material, [0.17, 0.48, 0.07], [-0.02 + index * 0.27, 3.42, 2.335], {
      chamfer: 0.035, fillet: 0.012, bevel: 0.01,
    })
    bar.name = `armored-battery-bank / animated charge bar ${index + 1}`
    chargeBars.push(bar)
    root.add(bar)
  }

  // Deep service aperture: stepped armor, inset door, contact throat and pins.
  add(root,
      prism(m.graphite, [2.68, 2.16, 0.31], [0.62, 1.92, 2.0], {
      chamfer: [0.25, 0.25, 0.14, 0.14], fillet: 0.065, bevel: 0.055,
    }),
    prism(m.ink, [2.22, 1.74, 0.22], [0.62, 1.94, 2.23], {
      chamfer: 0.2, fillet: 0.055, bevel: 0.045,
    }),
    prism(m.steel, [1.86, 1.16, 0.16], [0.62, 2.12, 2.48], {
      chamfer: 0.2, fillet: 0.055, bevel: 0.044,
    }),
    prism(m.graphite, [1.68, 1.02, 0.28], [0.62, 2.12, 2.58], {
      chamfer: 0.18, fillet: 0.05, bevel: 0.042,
    }),
    prism(m.ink, [1.28, 0.58, 0.2], [0.62, 2.12, 2.82], {
      chamfer: 0.12, fillet: 0.034, bevel: 0.028,
    }),
    prism(m.amberDim, [0.46, 0.18, 0.14], [0.62, 1.23, 2.54], {
      chamfer: 0.04, fillet: 0.014, bevel: 0.012,
    }),
  )
  for (let index = 0; index < 6; index += 1) {
    root.add(prism(m.amber, [0.09, 0.21, 0.08], [0.27 + index * 0.14, 2.12, 2.95], {
      chamfer: 0.02, fillet: 0.007, bevel: 0.006,
    }))
  }
  // A real left hinge barrel and upper locking latch bridge the door collar.
  for (const y of [1.82, 2.42]) {
    root.add(cylinder(m.steel, 0.085, 0.26, [-0.28, y, 2.7], [0, 0, 0], 12))
  }
  add(root,
    prism(m.graphite, [0.62, 0.2, 0.18], [0.62, 2.68, 2.67], {
      chamfer: 0.055, fillet: 0.02, bevel: 0.017,
    }),
    prism(m.steel, [0.36, 0.07, 0.08], [0.62, 2.7, 2.8], {
      chamfer: 0.025, fillet: 0.01, bevel: 0.008,
    }),
  )
  for (const x of [-0.25, 1.48]) {
    for (const y of [1.42, 2.52]) {
      root.add(cylinder(m.steel, 0.06, 0.08, [x, y, 2.32], FACE_Z, 10))
    }
  }

  // Perforated lower vent is seated inside the interface door.
  add(root,
    prism(m.graphite, [1.82, 0.38, 0.14], [0.62, 1.02, 2.37], {
      chamfer: 0.06, fillet: 0.02, bevel: 0.016,
    }),
  )
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 11; column += 1) {
      root.add(cylinder(m.ink, 0.035, 0.06, [-0.05 + column * 0.135, 0.96 + row * 0.13, 2.47], FACE_Z, 8))
    }
  }
  root.add(downTriangle(m.amberDim, 0.18, 0.18, [0.62, 2.95, 2.2]))

  // Paired vertical grab rails are captured by four graphite clevises.
  for (const x of [-1.9, 2.42]) {
    root.add(prism(m.graphite, [0.52, 2.35, 0.2], [x, 1.94, 2.02], {
      chamfer: 0.13, fillet: 0.042, bevel: 0.035,
    }))
    root.add(cylinder(m.amberDim, 0.095, 1.5, [x, 1.98, 2.27], [0, 0, 0], 14))
    for (const y of [1.36, 2.62]) {
      root.add(cylinder(m.steel, 0.103, 0.055, [x, y, 2.27], [0, 0, 0], 14))
    }
    for (const y of [1.16, 2.8]) {
      root.add(prism(m.graphite, [0.42, 0.38, 0.38], [x, y, 2.18], {
        chamfer: 0.08, fillet: 0.028, bevel: 0.024,
      }))
      root.add(cylinder(m.steel, 0.055, 0.1, [x, y, 2.39], FACE_Z, 10))
    }
  }
}

function addBatteryBay(root: Group, m: BankMaterials): void {
  // Deep bay host and rails precede the removable cartridges, ensuring every
  // module visibly overlaps a socket rather than hanging on the side wall.
  add(root,
    prism(m.graphite, [3.48, 3.24, 0.22], [-3.0, 2.48, 0], {
      chamfer: 0.16, fillet: 0.05, bevel: 0.04, rotation: FACE_X,
    }),
    prism(m.ink, [3.22, 2.92, 0.1], [-3.14, 2.48, 0], {
      chamfer: 0.12, fillet: 0.035, bevel: 0.028, rotation: FACE_X,
    }),
  )

  for (const y of [1.04, 3.93]) {
    root.add(prism(m.graphite, [3.7, 0.26, 0.4], [-3.24, y, 0], {
      chamfer: 0.07, fillet: 0.025, bevel: 0.022, rotation: FACE_X,
    }))
  }
  // The upper rail is a perforated cooling manifold, matching the long dark
  // vent above the removable packs in the reference.
  for (let index = 0; index < 17; index += 1) {
    root.add(flatPlate(m.ink, [0.12, 0.055], [-3.455, 3.94, -1.43 + index * 0.178], [0, Math.PI / 2, 0], false))
  }
  // Individual lower socket shoes and upper capture tabs align to each pack.
  const slots = [-1.43, -0.87, -0.3, 0.28, 0.86, 1.43]
  for (const z of slots) {
    add(root,
      prism(m.graphite, [0.52, 0.3, 0.3], [-3.3, 1.12, z], {
        chamfer: 0.07, fillet: 0.024, bevel: 0.02, rotation: FACE_X,
      }),
      prism(m.steel, [0.38, 0.2, 0.2], [-3.48, 1.12, z], {
        chamfer: 0.04, fillet: 0.014, bevel: 0.012, rotation: FACE_X,
      }),
      prism(m.graphite, [0.48, 0.3, 0.28], [-3.29, 3.84, z], {
        chamfer: 0.065, fillet: 0.022, bevel: 0.019, rotation: FACE_X,
      }),
      prism(m.steel, [0.34, 0.18, 0.18], [-3.47, 3.84, z], {
        chamfer: 0.04, fillet: 0.014, bevel: 0.012, rotation: FACE_X,
      }),
    )
  }

  for (let index = 0; index < slots.length; index += 1) {
    const z = slots[index]
    add(root,
      prism(m.cartridge, [0.5, 2.72, 0.38], [-3.38, 2.47, z], {
        chamfer: [0.1, 0.1, 0.06, 0.06], fillet: 0.03, bevel: 0.026, rotation: FACE_X,
      }),
      prism(m.ink, [0.38, 2.26, 0.1], [-3.59, 2.54, z], {
        chamfer: 0.06, fillet: 0.018, bevel: 0.014, rotation: FACE_X,
      }),
      prism(m.cyan, [0.2, 0.22, 0.055], [-3.66, 1.35, z], {
        chamfer: 0.035, fillet: 0.012, bevel: 0.01, rotation: FACE_X,
      }),
      cylinder(m.steel, 0.045, 0.07, [-3.66, 3.58, z], [0, 0, Math.PI / 2], 9),
    )
    // Insertion scuff sits on the cartridge's lower contact edge only.
    root.add(flatPlate(m.steel, [0.18, 0.025], [-3.705, 1.17 + (index % 2) * 0.04, z], [0, Math.PI / 2, 0.04], false))
  }
  // Long seam grime is trapped behind the bottom rail.
  root.add(prism(m.grime, [3.22, 0.045, 0.025], [-3.61, 1.19, 0], {
    chamfer: 0.01, fillet: 0.005, bevel: 0.004, rotation: FACE_X,
  }))
}

function addRightAndRear(root: Group, m: BankMaterials): void {
  // Opposite side access plate and rear service panel provide believable mass
  // without competing with the cartridge bay and hero front.
  add(root,
    prism(m.graphite, [2.32, 2.45, 0.14], [2.98, 2.45, 0.15], {
      chamfer: 0.18, fillet: 0.05, bevel: 0.04, rotation: FACE_X,
    }),
    prism(m.ink, [1.88, 1.96, 0.07], [3.08, 2.44, 0.12], {
      chamfer: 0.12, fillet: 0.035, bevel: 0.027, rotation: FACE_X,
    }),
    prism(m.graphite, [3.98, 2.7, 0.17], [0, 2.42, -1.76], {
      chamfer: 0.22, fillet: 0.06, bevel: 0.05,
    }),
    prism(m.ink, [3.5, 2.2, 0.08], [0, 2.42, -1.88], {
      chamfer: 0.15, fillet: 0.042, bevel: 0.035,
    }),
  )
  for (const y of [1.58, 3.3]) {
    for (const z of [-0.62, 0.86]) {
      root.add(cylinder(m.steel, 0.06, 0.08, [3.18, y, z], [0, 0, Math.PI / 2], 10))
    }
  }
  add(root,
    prism(m.graphite, [0.68, 0.18, 0.1], [3.17, 2.44, 0.78], {
      chamfer: 0.05, fillet: 0.018, bevel: 0.014, rotation: FACE_X,
    }),
    prism(m.steel, [0.42, 0.07, 0.07], [3.23, 2.44, 0.78], {
      chamfer: 0.025, fillet: 0.01, bevel: 0.008, rotation: FACE_X,
    }),
  )
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 9; column += 1) {
      root.add(cylinder(m.graphite, 0.04, 0.05, [-1.3 + column * 0.32, 1.65 + row * 0.32, -1.95], FACE_Z, 8))
    }
  }
  for (const x of [-1.72, 1.72]) {
    for (const y of [1.3, 3.5]) root.add(cylinder(m.steel, 0.065, 0.08, [x, y, -1.96], FACE_Z, 10))
  }
}

function buildBank(): BankRig {
  const { materials, handles } = acquireMaterials()
  const root = new Group()
  root.name = 'armored-battery-bank'
  const chargeBars: Mesh[] = []
  const chargeMaterials: MeshPhysicalMaterial[] = []

  addGroundBase(root, materials)
  addCoreAndArmor(root, materials)
  addTop(root, materials)
  addFrontInterface(root, materials, chargeBars, chargeMaterials)
  addBatteryBay(root, materials)
  addRightAndRear(root, materials)

  const wearProfiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [materials.shell, { rub: 0.78, grime: 0.62, scratch: 0.74 }],
    [materials.shellShade, { rub: 0.58, grime: 0.7, scratch: 0.62 }],
    [materials.graphite, { rub: 0.28, grime: 0.76, scratch: 0.5 }],
    [materials.steel, { rub: 0.16, grime: 0.38, scratch: 0.48 }],
    [materials.cartridge, { rub: 0.08, grime: 0.12, scratch: 0.2 }],
  ])
  root.updateMatrixWorld(true)
  bakeOcclusion(root, { reach: 0.28 })
  bakeSurfaceAttributes(root, wearProfiles)
  const wearMaterial = createWearMaterial({
    name: 'armored-battery-bank / baked worn surfaces',
    clearcoat: 0.16,
    clearcoatRoughness: 0.48,
  })
  root.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return
    if (wearProfiles.has(object.material as MeshPhysicalMaterial)) object.material = wearMaterial
  })

  // Indicators remain separate for the deterministic load sweep; everything
  // else is batched only after AO and surface identity have been authored.
  for (const bar of chargeBars) root.remove(bar)
  const staticGeometries = mergeStaticByMaterial(root, {
    retainedAttributes: (material) => material === wearMaterial ? WEAR_ATTRIBUTES : [],
    meshName: (material) => `armored-battery-bank / static / ${material.name}`,
  })
  for (const bar of chargeBars) root.add(bar)

  root.updateMatrixWorld(true)
  const bounds = new Box3().setFromObject(root, true)
  if (!bounds.isEmpty()) root.position.y -= bounds.min.y
  root.updateMatrixWorld(true)
  return { root, materials, handles, wearMaterial, chargeBars, chargeMaterials, staticGeometries }
}

export function createModel(): {
  root: Group
  update: (deltaSeconds: number) => void
  dispose: () => void
} {
  const rig = buildBank()
  let elapsedSeconds = 0
  return {
    root: rig.root,
    update: (deltaSeconds: number) => {
      elapsedSeconds += Math.min(Math.max(deltaSeconds, 0), 0.05)
      const sweep = (elapsedSeconds * 1.1) % (rig.chargeBars.length + 1)
      for (let index = 0; index < rig.chargeMaterials.length; index += 1) {
        const distance = Math.abs(index - sweep)
        rig.chargeMaterials[index].emissiveIntensity = 0.38 + Math.max(0, 1.5 - distance) * 0.32
      }
      rig.materials.cyan.emissiveIntensity = 0.46 + Math.sin(elapsedSeconds * 1.8) * 0.08
    },
    dispose: () => {
      for (const geometry of rig.staticGeometries) geometry.dispose()
      for (const bar of rig.chargeBars) bar.geometry.dispose()
      for (const material of rig.chargeMaterials) material.dispose()
      rig.wearMaterial.dispose()
      for (const handle of rig.handles) handle.release()
    },
  }
}

function previewCamera(aspect: number, position: Vec3, target: Vec3, fov = 30): PerspectiveCamera {
  const camera = new PerspectiveCamera(fov, aspect, 0.24, 80)
  camera.position.set(...position)
  camera.lookAt(...target)
  camera.updateProjectionMatrix()
  return camera
}

function makePreview(options: { aspect: number }, view: 'beauty' | 'side' | 'opposite' | 'rear' | 'low'): BankPreview {
  const controller = createModel()
  const scene = new Scene()
  scene.name = `armored-battery-bank / ${view} preview`
  scene.background = new Color(0x000000)
  scene.add(controller.root)
  scene.add(new HemisphereLight(0x9bafba, 0x05070a, 0.42))
  const key = new DirectionalLight(0xfff1df, 2.45)
  key.position.set(-8, 10, 12)
  const fill = new DirectionalLight(0x7898b6, 0.72)
  fill.position.set(10, 5, 9)
  const rim = new DirectionalLight(0x8caec6, 1.05)
  rim.position.set(7, 8, -10)
  scene.add(key, fill, rim)

  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const camera = view === 'side'
    ? previewCamera(aspect, [-11.5, 5.1, 0.2], [0, 2.2, 0], 31)
    : view === 'opposite'
      ? previewCamera(aspect, [11.4, 5.0, 0.4], [0, 2.2, 0], 31)
      : view === 'rear'
        ? previewCamera(aspect, [8.6, 5.2, -11.6], [0, 2.12, 0], 31)
        : view === 'low'
          ? previewCamera(aspect, [-9.0, 1.0, 11.1], [0, 1.9, 0], 32)
          : previewCamera(aspect, [-9.5, 6.8, 11.7], [0, 2.2, 0], 30)
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

export function createPreview(options: { aspect: number }): BankPreview {
  return makePreview(options, 'beauty')
}

export function createSidePreview(options: { aspect: number }): BankPreview {
  return makePreview(options, 'side')
}

export function createOppositePreview(options: { aspect: number }): BankPreview {
  return makePreview(options, 'opposite')
}

export function createRearPreview(options: { aspect: number }): BankPreview {
  return makePreview(options, 'rear')
}

export function createLowPreview(options: { aspect: number }): BankPreview {
  return makePreview(options, 'low')
}
