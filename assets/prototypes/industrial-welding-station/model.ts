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
  PointLight,
  Scene,
  TorusGeometry,
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
  flatPlate,
  groove,
  mergeStaticByMaterial,
  prism,
  tuneMaterial,
  type MaterialHandle,
  type Vec3,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'

interface StationMaterials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  bed: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  amberDim: MeshPhysicalMaterial
  glass: MeshPhysicalMaterial
  heat: MeshPhysicalMaterial
  copper: MeshPhysicalMaterial
  oil: MeshPhysicalMaterial
}

interface MaterialSet {
  materials: StationMaterials
  handles: MaterialHandle[]
}

function pipe(
  material: MeshPhysicalMaterial,
  points: Vec3[],
  radius: number,
  tubularSegments = 20,
  radialSegments = 8,
): Mesh {
  const curve = new CatmullRomCurve3(points.map((point) => new Vector3(...point)), false, 'centripetal')
  return new Mesh(new TubeGeometry(curve, tubularSegments, radius, radialSegments, false), material)
}

function torus(
  material: MeshPhysicalMaterial,
  radius: number,
  tube: number,
  position: Vec3,
  rotation: Vec3 = [Math.PI / 2, 0, 0],
  tubularSegments = 24,
): Mesh {
  const mesh = new Mesh(new TorusGeometry(radius, tube, 6, tubularSegments), material)
  mesh.position.set(...position)
  mesh.rotation.set(...rotation)
  return mesh
}

function addFoot(parent: Group, m: StationMaterials, x: number, z: number): void {
  parent.add(prism(m.graphite, [0.82, 0.42, 0.88], [x, 0.21, z], {
    chamfer: [0.14, 0.14, 0.08, 0.08], fillet: 0.05, bevel: 0.045,
  }))
  parent.add(prism(m.steel, [0.54, 0.08, 0.58], [x, 0.04, z], {
    chamfer: 0.08, fillet: 0.025, bevel: 0.02,
  }))
}

function addCabinet(parent: Group, m: StationMaterials): void {
  for (const [x, z] of [[-2.72, -1.62], [2.72, -1.62], [-2.72, 1.62], [2.72, 1.62]] as const) {
    addFoot(parent, m, x, z)
  }

  parent.add(prism(m.graphite, [6.1, 0.44, 3.86], [0, 0.56, 0], {
    chamfer: 0.24, fillet: 0.07, bevel: 0.06,
  }))
  parent.add(prism(m.shell, [6.2, 1.72, 3.92], [0, 1.32, 0], {
    chamfer: [0.24, 0.24, 0.12, 0.12], fillet: 0.08, bevel: 0.07,
  }))
  parent.add(prism(m.shellShade, [6.42, 0.42, 4.12], [0, 2.15, 0], {
    chamfer: 0.2, fillet: 0.06, bevel: 0.055,
  }))
  parent.add(prism(m.graphite, [6.18, 0.22, 3.92], [0, 2.39, 0], {
    chamfer: 0.16, fillet: 0.045, bevel: 0.04,
  }))
  for (const [x, z] of [[-2.72, -1.62], [2.72, -1.62], [-2.72, 1.62], [2.72, 1.62]] as const) {
    parent.add(prism(m.shellShade, [1.02, 0.34, 1.04], [x, 0.48, z], {
      chamfer: [0.15, 0.15, 0.07, 0.07], fillet: 0.045, bevel: 0.04,
    }))
  }
  parent.add(prism(m.graphite, [5.5, 0.18, 0.12], [0, 1.98, 2.02], {
    chamfer: 0.04, fillet: 0.012, bevel: 0.012,
  }))

  // Contact-darkened shelf seam and short gravity streaks. These are anchored
  // to the real cabinet/bed junction, not scattered as generic surface noise.
  parent.add(prism(m.oil, [4.72, 0.055, 0.035], [-0.18, 2.31, 2.065], {
    chamfer: 0.012, fillet: 0.006, bevel: 0.005,
  }))
  for (const [x, height] of [[-2.28, 0.24], [-1.94, 0.15], [2.57, 0.2]] as const) {
    parent.add(prism(m.oil, [0.035, height, 0.025], [x, 2.31 - height * 0.5, 2.073], {
      chamfer: 0.008, fillet: 0.004, bevel: 0.004,
    }))
  }
  // Rub-through is confined to the exposed centre stile where carts and stock
  // would strike the paint; the storage doors remain mechanically unobstructed.
  for (const [x, y, length, angle] of [
    [0.5, 1.54, 0.34, -0.18], [0.58, 1.3, 0.22, 0.1], [0.42, 0.98, 0.28, -0.08],
  ] as const) {
    parent.add(flatPlate(m.steel, [length, 0.025], [x, y, 1.966], [0, 0, angle], false))
  }

  // Left storage door and right drawer bank are inset into the cabinet face.
  parent.add(prism(m.graphite, [3.05, 1.18, 0.13], [-1.25, 1.27, 2.01], {
    chamfer: [0.12, 0.08, 0.08, 0.12], fillet: 0.035, bevel: 0.03,
  }))
  parent.add(prism(m.ink, [2.68, 0.9, 0.055], [-1.25, 1.28, 2.105], {
    chamfer: 0.08, fillet: 0.02, bevel: 0.018,
  }))
  parent.add(prism(m.steel, [0.58, 0.1, 0.1], [-1.25, 1.5, 2.17], {
    chamfer: 0.035, fillet: 0.015, bevel: 0.012,
  }))
  parent.add(prism(m.graphite, [1.62, 1.3, 0.13], [1.98, 1.22, 2.01], {
    chamfer: 0.12, fillet: 0.035, bevel: 0.03,
  }))
  parent.add(prism(m.ink, [1.3, 0.9, 0.055], [1.98, 1.22, 2.105], {
    chamfer: 0.07, fillet: 0.02, bevel: 0.018,
  }))
  parent.add(prism(m.steel, [0.72, 0.1, 0.1], [1.98, 1.44, 2.17], {
    chamfer: 0.035, fillet: 0.015, bevel: 0.012,
  }))
  parent.add(prism(m.amberDim, [0.78, 0.08, 0.045], [1.98, 0.88, 2.18], {
    chamfer: 0.03, fillet: 0.012, bevel: 0.01,
  }))

  // Sloped front control binnacle: display, guarded knob, and two status lamps.
  parent.add(prism(m.graphite, [2.3, 0.66, 0.3], [1.42, 2.18, 1.92], {
    chamfer: [0.12, 0.12, 0.04, 0.04], fillet: 0.045, bevel: 0.04,
    rotation: [-0.16, 0, 0],
  }))
  parent.add(prism(m.ink, [0.82, 0.3, 0.08], [0.9, 2.2, 2.13], {
    chamfer: 0.08, fillet: 0.025, bevel: 0.02, rotation: [-0.16, 0, 0],
  }))
  parent.add(prism(m.amber, [0.62, 0.16, 0.045], [0.9, 2.2, 2.205], {
    chamfer: 0.05, fillet: 0.018, bevel: 0.015, rotation: [-0.16, 0, 0],
  }))
  parent.add(cylinder(m.steel, 0.25, 0.15, [1.8, 2.24, 2.14], [Math.PI / 2, 0, 0], 16))
  parent.add(cylinder(m.graphite, 0.17, 0.2, [1.8, 2.24, 2.25], [Math.PI / 2, 0, 0], 16))
  for (const x of [2.24, 2.46]) {
    parent.add(cylinder(m.amberDim, 0.055, 0.045, [x, 2.22, 2.27], [Math.PI / 2, 0, 0], 10))
  }

  // Vent slits sit inside the right front shell instead of floating above it.
  for (let index = 0; index < 4; index += 1) {
    parent.add(prism(m.ink, [0.42, 0.06, 0.035], [2.55, 1.2 + index * 0.12, 2.075], {
      chamfer: 0.02, fillet: 0.008, bevel: 0.008,
    }))
  }
}

function addFrame(parent: Group, m: StationMaterials): void {
  // Rear-left C-frame. The angled knee overlaps the cabinet and upright, while
  // the overhead beam keys into the upright by more than a shell thickness.
  parent.add(prism(m.graphite, [1.1, 4.05, 1.34], [-2.72, 4.2, -1.1], {
    chamfer: [0.18, 0.18, 0.1, 0.1], fillet: 0.065, bevel: 0.055,
  }))
  parent.add(prism(m.shell, [1.04, 3.96, 1.44], [-2.69, 4.31, -0.95], {
    chamfer: [0.18, 0.18, 0.08, 0.08], fillet: 0.065, bevel: 0.055,
  }))
  parent.add(prism(m.shell, [1.22, 2.3, 1.34], [-2.42, 3.12, -0.92], {
    chamfer: 0.18, fillet: 0.06, bevel: 0.055, rotation: [0, 0, -0.43],
  }))
  parent.add(prism(m.graphite, [6.08, 0.96, 1.62], [0.02, 6.43, -0.88], {
    chamfer: [0.2, 0.2, 0.08, 0.08], fillet: 0.065, bevel: 0.06,
  }))
  parent.add(prism(m.shell, [5.94, 0.88, 1.7], [0.04, 6.56, -0.72], {
    chamfer: [0.22, 0.22, 0.08, 0.08], fillet: 0.07, bevel: 0.06,
  }))
  parent.add(prism(m.shellShade, [2.4, 0.16, 0.08], [0.2, 6.57, 0.12], {
    chamfer: 0.04, fillet: 0.012, bevel: 0.012,
  }))
  for (const x of [-1.8, 0.65, 2.52]) {
    parent.add(cylinder(m.graphite, 0.085, 0.06, [x, 6.58, 0.17], [Math.PI / 2, 0, 0], 10))
  }

  // A real top handle is seated into steel pads on the beam.
  for (const x of [-2.2, -1.18]) {
    parent.add(prism(m.graphite, [0.16, 0.54, 0.22], [x, 7.17, -0.84], {
      chamfer: 0.055, fillet: 0.025, bevel: 0.025,
    }))
    parent.add(prism(m.steel, [0.32, 0.1, 0.36], [x, 6.91, -0.84], {
      chamfer: 0.04, fillet: 0.018, bevel: 0.016,
    }))
  }
  parent.add(prism(m.graphite, [1.2, 0.18, 0.22], [-1.69, 7.42, -0.84], {
    chamfer: 0.06, fillet: 0.03, bevel: 0.025,
  }))

  // Deep black under-beam rail supports the fixed carriage and reinforces the
  // reference's broad open negative work bay.
  parent.add(prism(m.ink, [4.64, 0.2, 0.42], [0.62, 5.97, -0.2], {
    chamfer: 0.08, fillet: 0.028, bevel: 0.024,
  }))

  // Panel joints in the broad beam face supply real recessed seams. Localized
  // oil collects under the carriage rail and runs downward in three places.
  for (const x of [-1.94, 0.08, 2.02]) {
    parent.add(groove(m.graphite, 0.52, 0.035, 0.026, [x, 6.54, 0.135], [0, 0, Math.PI / 2]))
  }
  parent.add(prism(m.oil, [3.3, 0.045, 0.035], [0.72, 6.0, 0.03], {
    chamfer: 0.012, fillet: 0.006, bevel: 0.005,
  }))
  for (const [x, height] of [[-0.18, 0.15], [1.15, 0.23], [2.2, 0.12]] as const) {
    parent.add(prism(m.oil, [0.03, height, 0.025], [x, 5.96 - height * 0.5, 0.035], {
      chamfer: 0.008, fillet: 0.004, bevel: 0.004,
    }))
  }
  // Directional edge rub on the beam and inner upright. The short, aligned
  // scars expose steel only on reachable leading faces instead of weathering
  // every broad panel uniformly.
  for (const [x, y, length, angle] of [
    [-2.06, 6.29, 0.3, -0.06], [-0.82, 6.77, 0.24, 0.08],
    [0.48, 6.23, 0.36, -0.04], [2.18, 6.72, 0.28, 0.05],
  ] as const) {
    parent.add(flatPlate(m.steel, [length, 0.022], [x, y, 0.142], [0, 0, angle], false))
  }
  for (const [x, y, length, angle] of [
    [-2.7, 4.92, 0.26, 0.12], [-2.72, 4.42, 0.34, -0.08], [-2.67, 3.84, 0.2, 0.16],
  ] as const) {
    parent.add(flatPlate(m.steel, [length, 0.024], [x, y, -0.215], [0, 0, angle], false))
  }
}

function addBed(parent: Group, m: StationMaterials): void {
  parent.add(prism(m.graphite, [5.05, 0.22, 3.15], [0.22, 2.52, 0.18], {
    chamfer: 0.16, fillet: 0.045, bevel: 0.04,
  }))
  parent.add(prism(m.bed, [4.56, 0.16, 2.65], [0.22, 2.7, 0.18], {
    chamfer: 0.12, fillet: 0.035, bevel: 0.03,
  }))
  parent.add(prism(m.amberDim, [4.72, 0.035, 0.035], [0.22, 2.8, 1.55], {
    chamfer: 0.01, fillet: 0.006, bevel: 0.005,
  }))

  // Sixty recessed perforations make the workholding plate read as functional.
  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < 10; column += 1) {
      parent.add(cylinder(m.ink, 0.043, 0.026, [
        -1.72 + column * 0.43,
        2.795,
        -0.92 + row * 0.4,
      ], [0, 0, 0], 8))
    }
  }

  // Layered weld-bed residue: a broad matte soot deposit encloses restrained
  // blue/copper temper bands and a scorched centre beneath the nozzle.
  parent.add(cylinder(m.oil, 0.72, 0.016, [1.25, 2.81, 0.18], [0, 0, 0], 30))
  parent.add(cylinder(m.heat, 0.57, 0.018, [1.25, 2.822, 0.18], [0, 0, 0], 28))
  parent.add(torus(m.copper, 0.47, 0.045, [1.25, 2.84, 0.18], [Math.PI / 2, 0, 0], 30))
  parent.add(torus(m.ink, 0.29, 0.065, [1.25, 2.852, 0.18], [Math.PI / 2, 0, 0], 28))
  parent.add(cylinder(m.ink, 0.15, 0.024, [1.25, 2.854, 0.18], [0, 0, 0], 20))
  for (const [x, z, radius] of [
    [0.63, -0.16, 0.025], [0.81, 0.72, 0.034], [1.04, -0.48, 0.028],
    [1.5, 0.78, 0.023], [1.72, -0.24, 0.032], [1.9, 0.42, 0.026],
  ] as const) {
    parent.add(cylinder(m.copper, radius, 0.022, [x, 2.858, z], [0, 0, 0], 8))
  }

  // Rear fixture rail and end stops are bolted into the bed, providing a true
  // third workholding mass rather than another loose decorative clamp.
  parent.add(prism(m.graphite, [3.5, 0.26, 0.28], [0.05, 2.91, -1.02], {
    chamfer: 0.07, fillet: 0.025, bevel: 0.022,
  }))
  for (const x of [-1.48, 1.58]) {
    parent.add(prism(m.shellShade, [0.34, 0.42, 0.42], [x, 3.14, -1.02], {
      chamfer: 0.065, fillet: 0.024, bevel: 0.02,
    }))
    parent.add(prism(m.amberDim, [0.38, 0.16, 0.44], [x, 3.38, -1.02], {
      chamfer: 0.05, fillet: 0.018, bevel: 0.015,
    }))
  }

  addClamp(parent, m, -1.45, -0.72, 0.1)
  addClamp(parent, m, 1.65, 0.86, Math.PI)
  addClamp(parent, m, 2.05, -0.58, Math.PI * 0.5)
}

function addClamp(parent: Group, m: StationMaterials, x: number, z: number, angle: number): void {
  const clamp = new Group()
  clamp.position.set(x, 2.86, z)
  clamp.rotation.y = angle
  parent.add(clamp)
  clamp.add(prism(m.graphite, [0.66, 0.18, 0.48], [0, 0, 0], {
    chamfer: 0.08, fillet: 0.025, bevel: 0.02,
  }))
  for (const x of [-0.18, 0.18]) {
    clamp.add(prism(m.shellShade, [0.17, 0.48, 0.38], [x, 0.28, 0], {
      chamfer: 0.055, fillet: 0.022, bevel: 0.018,
    }))
    clamp.add(prism(m.amberDim, [0.2, 0.16, 0.41], [x, 0.52, 0], {
      chamfer: 0.045, fillet: 0.016, bevel: 0.014,
    }))
  }
  clamp.add(prism(m.steel, [0.08, 0.26, 0.3], [-0.08, 0.32, 0], {
    chamfer: 0.02, fillet: 0.008, bevel: 0.008,
  }))
  clamp.add(prism(m.steel, [0.08, 0.26, 0.3], [0.08, 0.32, 0], {
    chamfer: 0.02, fillet: 0.008, bevel: 0.008,
  }))
  clamp.add(cylinder(m.steel, 0.065, 0.6, [0.3, 0.35, 0], [0, 0, Math.PI / 2], 10))
  clamp.add(cylinder(m.graphite, 0.1, 0.16, [0.59, 0.35, 0], [0, 0, Math.PI / 2], 10))
  clamp.add(cylinder(m.steel, 0.035, 0.42, [0.68, 0.35, 0], [Math.PI / 2, 0, 0], 8))
  for (const z of [-0.2, 0.2]) {
    clamp.add(cylinder(m.graphite, 0.06, 0.08, [0.68, 0.35, z], [Math.PI / 2, 0, 0], 8))
  }
}

function addPegboard(parent: Group, m: StationMaterials): void {
  parent.add(prism(m.graphite, [3.22, 2.62, 0.2], [-0.92, 4.32, -1.63], {
    chamfer: 0.12, fillet: 0.04, bevel: 0.035,
  }))
  parent.add(prism(m.ink, [2.96, 2.34, 0.06], [-0.92, 4.32, -1.49], {
    chamfer: 0.08, fillet: 0.02, bevel: 0.018,
  }))
  for (let row = 0; row < 9; row += 1) {
    for (let column = 0; column < 12; column += 1) {
      parent.add(cylinder(m.graphite, 0.025, 0.026, [
        -2.15 + column * 0.22,
        3.4 + row * 0.21,
        -1.445,
      ], [Math.PI / 2, 0, 0], 6))
    }
  }

  // Welding mask: shell, recessed face, visor and two seated hooks.
  parent.add(prism(m.graphite, [1.16, 1.34, 0.24], [-1.05, 4.53, -1.34], {
    chamfer: [0.22, 0.22, 0.12, 0.12], fillet: 0.055, bevel: 0.045,
  }))
  parent.add(prism(m.ink, [0.84, 1.0, 0.08], [-1.05, 4.49, -1.19], {
    chamfer: 0.16, fillet: 0.035, bevel: 0.025,
  }))
  parent.add(prism(m.glass, [0.62, 0.3, 0.045], [-1.05, 4.69, -1.115], {
    chamfer: 0.06, fillet: 0.018, bevel: 0.014,
  }))
  // Headgear remains mechanically legible even while the mask is stored: a
  // rear band, side pivots and lower chin wings define a wearable helmet.
  parent.add(torus(m.graphite, 0.64, 0.055, [-1.05, 4.63, -1.38], [0, 0, 0], 28))
  for (const x of [-1.62, -0.48]) {
    parent.add(prism(m.graphite, [0.24, 0.52, 0.2], [x, 4.22, -1.31], {
      chamfer: 0.08, fillet: 0.025, bevel: 0.02,
    }))
    parent.add(cylinder(m.steel, 0.11, 0.12, [x, 4.58, -1.15], [Math.PI / 2, 0, 0], 12))
    parent.add(cylinder(m.amberDim, 0.055, 0.135, [x, 4.58, -1.08], [Math.PI / 2, 0, 0], 10))
  }
  for (const x of [-1.3, -0.8]) {
    parent.add(cylinder(m.steel, 0.035, 0.2, [x, 5.08, -1.39], [Math.PI / 2, 0, 0], 8))
  }

  // Two welding tools are held by pegboard hooks and touch the lower rail.
  for (const x of [0.02, 0.42]) {
    parent.add(cylinder(m.steel, 0.055, 1.26, [x, 4.46, -1.34], [0, 0, 0], 10))
    parent.add(cylinder(m.graphite, 0.1, 0.34, [x, 4.62, -1.34], [0, 0, 0], 10))
    parent.add(torus(m.amberDim, 0.11, 0.025, [x, 4.78, -1.34], [Math.PI / 2, 0, 0], 16))
    parent.add(prism(m.graphite, [0.22, 0.1, 0.16], [x, 3.82, -1.38], {
      chamfer: 0.04, fillet: 0.015, bevel: 0.012,
    }))
  }
  parent.add(prism(m.graphite, [1.24, 0.12, 0.18], [0.2, 3.78, -1.4], {
    chamfer: 0.04, fillet: 0.015, bevel: 0.012,
  }))

  // A third, differently shaped chipping hammer is seated in its own two-point
  // pegboard cradle rather than repeating the vertical rod silhouette.
  parent.add(cylinder(m.steel, 0.05, 0.92, [0.88, 4.38, -1.32], [0, 0, -0.28], 10))
  parent.add(prism(m.graphite, [0.42, 0.14, 0.16], [0.75, 4.82, -1.3], {
    chamfer: 0.05, fillet: 0.018, bevel: 0.014, rotation: [0, 0, -0.28],
  }))
  for (const y of [4.06, 4.7]) {
    parent.add(prism(m.graphite, [0.28, 0.1, 0.15], [0.88, y, -1.38], {
      chamfer: 0.035, fillet: 0.012, bevel: 0.01,
    }))
  }
}

function addSideHose(parent: Group, m: StationMaterials): void {
  // Both ends overlap real left-wall bosses; the loop has no open endpoint.
  parent.add(cylinder(m.steel, 0.3, 0.24, [-3.16, 3.82, -0.5], [0, 0, Math.PI / 2], 16))
  parent.add(cylinder(m.graphite, 0.22, 0.35, [-3.3, 3.82, -0.5], [0, 0, Math.PI / 2], 14))
  parent.add(torus(m.steel, 0.25, 0.055, [-3.48, 3.82, -0.5], [0, Math.PI / 2, 0], 22))
  parent.add(cylinder(m.steel, 0.27, 0.22, [-3.18, 3.04, -0.5], [0, 0, Math.PI / 2], 16))
  parent.add(cylinder(m.graphite, 0.2, 0.34, [-3.32, 3.04, -0.5], [0, 0, Math.PI / 2], 14))
  parent.add(torus(m.steel, 0.23, 0.05, [-3.49, 3.04, -0.5], [0, Math.PI / 2, 0], 22))
  parent.add(pipe(m.graphite, [
    [-3.49, 3.82, -0.5], [-3.7, 3.72, -0.46], [-3.78, 3.45, -0.38],
    [-3.75, 3.16, -0.4], [-3.49, 3.04, -0.5],
  ], 0.105, 22, 8))
}

function addWorkLight(parent: Group, m: StationMaterials): void {
  parent.add(prism(m.graphite, [1.46, 0.16, 0.78], [-0.7, 6.02, 0.05], {
    chamfer: 0.12, fillet: 0.035, bevel: 0.03,
  }))
  parent.add(prism(m.amber, [1.12, 0.055, 0.5], [-0.7, 5.92, 0.05], {
    chamfer: 0.09, fillet: 0.025, bevel: 0.02,
  }))
}

function buildTool(parent: Group, m: StationMaterials): Group {
  const carriage = new Group()
  carriage.name = 'industrial-welding-station / supported tool carriage'
  carriage.position.set(1.5, 5.75, -0.15)
  parent.add(carriage)

  // Upper body overlaps the under-beam rail; the moving slider remains captured
  // inside the deep lower guide for its entire 0.14 m calibration stroke.
  carriage.add(prism(m.graphite, [1.76, 0.82, 1.34], [0, 0, 0], {
    chamfer: 0.14, fillet: 0.05, bevel: 0.045,
  }))
  carriage.add(prism(m.shellShade, [1.46, 0.52, 1.44], [0, 0.12, 0], {
    chamfer: 0.12, fillet: 0.045, bevel: 0.04,
  }))
  carriage.add(prism(m.ink, [0.9, 0.48, 1.48], [0, -0.38, 0], {
    chamfer: 0.08, fillet: 0.03, bevel: 0.025,
  }))
  for (const x of [-0.76, 0.76]) {
    carriage.add(prism(m.graphite, [0.38, 0.58, 0.94], [x, -0.28, 0], {
      chamfer: 0.08, fillet: 0.03, bevel: 0.025,
    }))
  }
  carriage.add(cylinder(m.steel, 0.5, 0.15, [0, -0.58, 0], [0, 0, 0], 18))

  const slider = new Group()
  slider.name = 'industrial-welding-station / calibrated vertical slider'
  carriage.add(slider)
  slider.add(cylinder(m.steel, 0.38, 0.58, [0, -0.66, 0], [0, 0, 0], 18))
  slider.add(cylinder(m.graphite, 0.47, 0.2, [0, -0.45, 0], [0, 0, 0], 18))
  slider.add(torus(m.ink, 0.39, 0.055, [0, -0.64, 0], [Math.PI / 2, 0, 0], 24))
  slider.add(torus(m.steel, 0.42, 0.07, [0, -0.88, 0], [Math.PI / 2, 0, 0], 28))
  slider.add(cylinder(m.graphite, 0.29, 0.2, [0, -1.0, 0], [0, 0, 0], 16))
  slider.add(torus(m.ink, 0.3, 0.045, [0, -1.02, 0], [Math.PI / 2, 0, 0], 22))
  slider.add(cylinder(m.copper, 0.23, 0.44, [0, -1.18, 0], [0, 0, 0], 16))
  slider.add(torus(m.ink, 0.235, 0.035, [0, -1.33, 0], [Math.PI / 2, 0, 0], 20))
  slider.add(torus(m.heat, 0.24, 0.045, [0, -1.37, 0], [Math.PI / 2, 0, 0], 22))
  slider.add(cylinder(m.amber, 0.13, 0.24, [0, -1.5, 0], [0, 0, 0], 14))
  slider.add(cylinder(m.copper, 0.065, 0.36, [0, -1.75, 0], [0, 0, 0], 12))

  // Tool umbilical terminates inside a beam port and the carriage-side collar.
  parent.add(cylinder(m.graphite, 0.18, 0.28, [2.66, 5.9, -0.82], [0, 0, Math.PI / 2], 12))
  parent.add(torus(m.steel, 0.2, 0.045, [2.82, 5.9, -0.82], [0, Math.PI / 2, 0], 20))
  carriage.add(cylinder(m.graphite, 0.16, 0.26, [0.72, -0.15, -0.1], [0, 0, Math.PI / 2], 12))
  carriage.add(torus(m.steel, 0.18, 0.04, [0.84, -0.15, -0.1], [0, Math.PI / 2, 0], 20))
  parent.add(pipe(m.graphite, [
    [2.82, 5.9, -0.82], [3.08, 5.72, -0.68], [3.04, 5.28, -0.35],
    [2.75, 5.12, -0.1], [2.34, 5.6, -0.25],
  ], 0.085, 24, 8))

  // A second, front-readable service lead continues from the carriage inlet to
  // a captured spindle collar. Its endpoint penetrates the collar instead of
  // ending beside the tool, and the loop has slack for the 0.14 m calibration.
  carriage.add(cylinder(m.steel, 0.17, 0.12, [0.44, -0.54, 0.73], [Math.PI / 2, 0, 0], 16))
  carriage.add(torus(m.ink, 0.18, 0.045, [0.44, -0.54, 0.8], [0, 0, 0], 20))
  carriage.add(pipe(m.ink, [
    [0.7, -0.14, 0.38], [0.82, -0.34, 0.62], [0.75, -0.68, 0.84],
    [0.4, -0.83, 0.88], [0.14, -0.72, 0.75], [0.04, -0.58, 0.45],
  ], 0.07, 24, 8))
  return slider
}

function acquireMaterials(): MaterialSet {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-100', condition: 'worked', seed: 7201 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-300', condition: 'worked', seed: 7202 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 7203 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'worked', seed: 7204 })
  const steel = library.acquire({ recipeId: 'MAT-01', palette: 'STEEL', condition: 'worked', seed: 7205 })
  const bed = library.acquire({ recipeId: 'MAT-02', palette: 'GUNMETAL', condition: 'heat-cycled', seed: 7206 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 7207 })
  const amberDim = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-300', condition: 'active', seed: 7208 })
  const glass = library.acquire({ recipeId: 'MAT-10', palette: 'AMBER-GLASS', condition: 'maintained', seed: 7209 })
  const heat = library.acquire({ recipeId: 'MAT-02', palette: 'HEAT-BLUE', condition: 'heat-cycled', seed: 7210 })
  const copper = library.acquire({ recipeId: 'MAT-07', palette: 'COPPER', condition: 'heat-cycled', seed: 7211 })
  const oil = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 7212 })
  const materials: StationMaterials = {
    shell: tuneMaterial(shell, 0xc7cbca, 0.42, 0.14, { clearcoat: 0.2 }),
    shellShade: tuneMaterial(shellShade, 0x7d8588, 0.5, 0.24, { clearcoat: 0.14 }),
    graphite: tuneMaterial(graphite, 0x20272d, 0.48, 0.58, { clearcoat: 0.18 }),
    ink: tuneMaterial(ink, 0x070a0d, 0.72, 0.28),
    steel: tuneMaterial(steel, 0x8b9496, 0.3, 0.9, { clearcoat: 0.26 }),
    bed: tuneMaterial(bed, 0x2d3438, 0.58, 0.78),
    amber: tuneMaterial(amber, 0xff9d08, 0.2, 0, { emissive: 2.4 }),
    amberDim: tuneMaterial(amberDim, 0xd98308, 0.28, 0.12, { emissive: 0.8 }),
    glass: tuneMaterial(glass, 0x8e5b19, 0.14, 0.05, { clearcoat: 0.7 }),
    heat: tuneMaterial(heat, 0x24304b, 0.46, 0.72),
    copper: tuneMaterial(copper, 0x9b4f20, 0.38, 0.78),
    oil: tuneMaterial(oil, 0x241d17, 0.82, 0.08),
  }
  materials.glass.transparent = true
  materials.glass.opacity = 0.45
  materials.glass.transmission = 0.32
  materials.glass.thickness = 0.08
  materials.glass.ior = 1.42
  return { materials, handles: [shell, shellShade, graphite, ink, steel, bed, amber, amberDim, glass, heat, copper, oil] }
}

export function createModel(): {
  root: Group
  update: (timeSeconds: number) => void
  dispose: () => void
} {
  const { materials, handles } = acquireMaterials()
  const root = new Group()
  root.name = 'industrial-welding-station'

  addCabinet(root, materials)
  addFrame(root, materials)
  addBed(root, materials)
  addPegboard(root, materials)
  addSideHose(root, materials)
  addWorkLight(root, materials)
  const slider = buildTool(root, materials)
  const carriage = slider.parent as Group

  const wearProfiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [materials.shell, { rub: 0.8, grime: 0.7, scratch: 0.84 }],
    [materials.shellShade, { rub: 0.66, grime: 0.78, scratch: 0.72 }],
    [materials.graphite, { rub: 0.26, grime: 0.78, scratch: 0.46 }],
    [materials.steel, { rub: 0.18, grime: 0.4, scratch: 0.5 }],
    [materials.bed, { rub: 0.28, grime: 0.82, scratch: 0.66 }],
  ])
  bakeOcclusion(root, { reach: 0.3 })
  bakeSurfaceAttributes(root, wearProfiles)
  const wearMaterial = createWearMaterial({
    name: 'industrial-welding-station / worn painted metal',
    clearcoat: 0.18,
    clearcoatRoughness: 0.46,
  })
  root.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return
    if (wearProfiles.has(object.material as MeshPhysicalMaterial)) object.material = wearMaterial
  })

  // Keep only the slider dynamic. Its parts are still merged by material into
  // the slider coordinate system, so calibration costs a few calls, not dozens.
  root.remove(carriage)
  carriage.remove(slider)
  const staticGeometries = mergeStaticByMaterial(root, {
    retainedAttributes: (material) => material === wearMaterial ? WEAR_ATTRIBUTES : [],
    meshName: (material) => `industrial-welding-station / static / ${material.name}`,
  })
  const sliderGeometries = mergeStaticByMaterial(slider, {
    retainedAttributes: (material) => material === wearMaterial ? WEAR_ATTRIBUTES : [],
    meshName: (material) => `industrial-welding-station / slider / ${material.name}`,
  })
  const carriageGeometries = mergeStaticByMaterial(carriage, {
    retainedAttributes: (material) => material === wearMaterial ? WEAR_ATTRIBUTES : [],
    meshName: (material) => `industrial-welding-station / carriage / ${material.name}`,
  })
  carriage.add(slider)
  root.add(carriage)

  root.updateMatrixWorld(true)
  const bounds = new Box3().setFromObject(root, true)
  if (!bounds.isEmpty()) root.position.y -= bounds.min.y
  root.updateMatrixWorld(true)

  let elapsedSeconds = 0
  return {
    root,
    update: (deltaSeconds: number) => {
      elapsedSeconds += Math.min(Math.max(deltaSeconds, 0), 0.05)
      const timeSeconds = elapsedSeconds
      const cycle = (Math.sin(timeSeconds * 1.35 - Math.PI * 0.5) + 1) * 0.5
      const eased = cycle * cycle * (3 - 2 * cycle)
      slider.position.y = -0.14 * eased
      const pulse = 0.5 + Math.sin(timeSeconds * 2.3) * 0.5
      materials.amber.emissiveIntensity = 2.1 + pulse * 0.8
      materials.amberDim.emissiveIntensity = 0.62 + pulse * 0.38
    },
    dispose: () => {
      for (const geometry of [...staticGeometries, ...carriageGeometries, ...sliderGeometries]) geometry.dispose()
      wearMaterial.dispose()
      for (const handle of handles) handle.release()
    },
  }
}

export function createPreview(options: { aspect: number }): {
  scene: Scene
  root: Group
  camera: PerspectiveCamera
  update: (timeSeconds: number) => void
  dispose: () => void
} {
  const controller = createModel()
  const scene = new Scene()
  scene.name = 'industrial-welding-station / reference-aligned preview'
  scene.background = new Color(0x000000)
  scene.add(controller.root)
  scene.add(new HemisphereLight(0xaebdc4, 0x050608, 0.58))
  const key = new DirectionalLight(0xfff3df, 2.5)
  key.position.set(-8, 11, 13)
  scene.add(key)
  const fill = new DirectionalLight(0x91add0, 0.85)
  fill.position.set(9, 6, 8)
  scene.add(fill)
  const rim = new DirectionalLight(0x718bb0, 1.0)
  rim.position.set(7, 9, -10)
  scene.add(rim)
  const workGlow = new PointLight(0xffa11c, 3.6, 7, 2)
  workGlow.position.set(-0.2, 4.5, 0.4)
  scene.add(workGlow)

  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const camera = new PerspectiveCamera(31, aspect, 0.18, 90)
  camera.position.set(-10.2, 8.4, 14.2)
  camera.lookAt(-0.05, 3.45, 0)
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
