import {
  Box3,
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
  PointLight,
  Scene,
  SphereGeometry,
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
  mergeStaticByMaterial,
  prism,
  tuneMaterial,
  type MaterialHandle,
  type Vec3,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'

interface TankMaterials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  glass: MeshPhysicalMaterial
  amberFluid: MeshPhysicalMaterial
  amberBright: MeshPhysicalMaterial
  tissue: MeshPhysicalMaterial
  cable: MeshPhysicalMaterial
}

function disk(material: MeshPhysicalMaterial, radius: number, height: number, y: number, segments = 24): Mesh {
  return cylinder(material, radius, height, [0, y, 0], [0, 0, 0], segments)
}

function torus(
  material: MeshPhysicalMaterial,
  radius: number,
  tube: number,
  position: Vec3,
  rotation: Vec3 = [Math.PI / 2, 0, 0],
  tubularSegments = 32,
): Mesh {
  const mesh = new Mesh(new TorusGeometry(radius, tube, 6, tubularSegments), material)
  mesh.position.set(...position)
  mesh.rotation.set(...rotation)
  return mesh
}

function pipe(
  material: MeshPhysicalMaterial,
  points: Vec3[],
  radius: number,
  tubularSegments = 18,
  radialSegments = 8,
): Mesh {
  const curve = new CatmullRomCurve3(points.map((point) => new Vector3(...point)), false, 'centripetal')
  return new Mesh(new TubeGeometry(curve, tubularSegments, radius, radialSegments, false), material)
}

function addFoot(parent: Group, m: TankMaterials, x: number, z: number, rotationY = 0): void {
  parent.add(prism(m.graphite, [0.74, 0.34, 0.76], [x, 0.22, z], {
    chamfer: [0.16, 0.16, 0.08, 0.08],
    fillet: 0.045,
    bevel: 0.04,
    rotation: [0, rotationY, 0],
  }))
  parent.add(prism(m.shellShade, [0.54, 0.16, 0.58], [x, 0.08, z], {
    chamfer: 0.1,
    fillet: 0.03,
    bevel: 0.025,
    rotation: [0, rotationY, 0],
  }))
}

function addBase(parent: Group, m: TankMaterials): void {
  // The four explicit feet bottom out at y=0.015. The prop is physically
  // supported even when the dark rear feet disappear into the beauty backdrop.
  addFoot(parent, m, -1.44, 0.58, -0.1)
  addFoot(parent, m, 1.44, 0.58, 0.1)
  addFoot(parent, m, -1.38, -0.74, 0.08)
  addFoot(parent, m, 1.38, -0.74, -0.08)

  parent.add(disk(m.graphite, 2.08, 0.55, 0.5, 20))
  parent.add(disk(m.shellShade, 2.2, 0.38, 0.76, 20))
  parent.add(disk(m.shell, 2.08, 0.46, 0.98, 20))
  parent.add(disk(m.graphite, 1.88, 0.19, 1.23, 24))
  parent.add(torus(m.steel, 1.72, 0.07, [0, 1.28, 0]))
  parent.add(torus(m.amberBright, 1.55, 0.055, [0, 1.34, 0], [Math.PI / 2, 0, 0], 40))

  // Individually authored armor shoes break up the base drum and key the
  // lower collar into the side structures. Every shoe overlaps the base shell.
  for (const angle of [-1.2, -0.62, 0.62, 1.2, 2.1, 4.18]) {
    const radius = 2.05
    parent.add(prism(m.shellShade, [0.62, 0.48, 0.34], [
      Math.sin(angle) * radius, 0.98, Math.cos(angle) * radius,
    ], {
      chamfer: [0.11, 0.11, 0.05, 0.05], fillet: 0.04, bevel: 0.035,
      rotation: [0, angle, 0],
    }))
  }

  // The reference window lands in a projecting faceted chin rather than a
  // featureless annular ring. A dark gasket remains visible around it.
  parent.add(prism(m.graphite, [2.05, 0.58, 0.34], [0, 1.12, 1.58], {
    chamfer: [0.16, 0.16, 0.07, 0.07], fillet: 0.05, bevel: 0.045,
  }))
  parent.add(prism(m.shell, [1.74, 0.48, 0.38], [0, 1.13, 1.76], {
    chamfer: [0.14, 0.14, 0.05, 0.05], fillet: 0.045, bevel: 0.04,
  }))
  parent.add(prism(m.shellShade, [0.92, 0.08, 0.055], [0, 1.18, 2], {
    chamfer: 0.025, fillet: 0.012, bevel: 0.01,
  }))

  // Front service face and status triad. The heavy fluid connection lives on
  // the rear manifold, so the hero face deliberately carries no dead-end port.
  parent.add(prism(m.graphite, [1.34, 0.62, 0.24], [0, 0.69, 1.97], {
    chamfer: [0.13, 0.13, 0.05, 0.05], fillet: 0.04, bevel: 0.04,
  }))
  parent.add(prism(m.ink, [0.72, 0.28, 0.08], [0.56, 0.73, 2.13], {
    chamfer: 0.08, fillet: 0.025, bevel: 0.02,
  }))
  for (const x of [0.37, 0.56, 0.75]) {
    parent.add(prism(m.amberBright, [0.09, 0.18, 0.055], [x, 0.73, 2.19], {
      chamfer: 0.03, fillet: 0.012, bevel: 0.01,
    }))
  }
}

function addChamber(parent: Group, m: TankMaterials): void {
  // Amber volume sits behind a clear, slightly larger containment wall.
  const fluid = new Mesh(new CylinderGeometry(1.52, 1.52, 3.58, 32, 1, false), m.amberFluid)
  fluid.name = 'amber-specimen-tank / amber fluid'
  fluid.position.y = 3.18
  parent.add(fluid)

  const glass = new Mesh(new CylinderGeometry(1.61, 1.61, 3.72, 32, 1, true), m.glass)
  glass.name = 'amber-specimen-tank / containment glass'
  glass.position.y = 3.19
  parent.add(glass)

  parent.add(torus(m.ink, 1.66, 0.08, [0, 1.4, 0], [Math.PI / 2, 0, 0], 40))
  parent.add(torus(m.ink, 1.66, 0.08, [0, 4.98, 0], [Math.PI / 2, 0, 0], 40))
  parent.add(torus(m.amberBright, 1.47, 0.035, [0, 1.43, 0], [Math.PI / 2, 0, 0], 40))

  // Four dark mullions frame the window without hiding the amber silhouette.
  for (const x of [-1.64, 1.64]) {
    parent.add(prism(m.ink, [0.16, 3.52, 0.2], [x, 3.18, 0.04], {
      chamfer: 0.04, fillet: 0.025, bevel: 0.02,
    }))
  }
}

function addSpecimen(parent: Group, m: TankMaterials): void {
  // A smooth low-resolution sphere is deliberately displaced into a preserved
  // organ rather than left as a game-primitive orb. Twenty longitudinal rings
  // are enough for a wet silhouette without spending hero geometry on noise.
  const geometry = new SphereGeometry(0.88, 22, 16)
  const positions = geometry.getAttribute('position')
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index)
    const y = positions.getY(index)
    const z = positions.getZ(index)
    const ripple = 1 + 0.085 * Math.sin(x * 8.1 + y * 3.7) + 0.045 * Math.sin(z * 10.4 - y * 6.2)
    positions.setXYZ(index, x * ripple * 1.02, y * ripple * 1.08, z * ripple * 0.9)
  }
  geometry.computeVertexNormals()
  const specimen = new Mesh(geometry, m.tissue)
  specimen.name = 'amber-specimen-tank / suspended specimen'
  specimen.position.set(0.1, 3.17, 0.05)
  specimen.rotation.set(-0.12, 0.28, 0.08)
  parent.add(specimen)

  for (const [position, scale] of [
    [[-0.58, 3.48, 0.26], [0.2, 0.3, 0.16]],
    [[0.56, 3.37, 0.33], [0.24, 0.18, 0.16]],
    [[-0.45, 2.84, 0.3], [0.18, 0.24, 0.14]],
    [[0.28, 3.78, 0.15], [0.17, 0.2, 0.14]],
  ] as [Vec3, Vec3][]) {
    const nodule = new Mesh(new SphereGeometry(1, 10, 7), m.tissue)
    nodule.position.set(...position)
    nodule.scale.set(...scale)
    parent.add(nodule)
  }

  // Raised vascular ridges provide the reference's gnarled, fibrous landmark
  // while remaining a handful of six-sided tubes. Each curve begins and ends
  // on the organ surface instead of hovering beside it.
  const veins: Vec3[][] = [
    [[-0.58, 3.5, 0.43], [-0.7, 3.2, 0.58], [-0.52, 2.87, 0.44]],
    [[-0.2, 3.82, 0.38], [-0.38, 3.42, 0.74], [-0.12, 2.68, 0.53]],
    [[0.18, 3.84, 0.35], [0.5, 3.48, 0.66], [0.42, 2.82, 0.48]],
    [[0.55, 3.55, 0.2], [0.79, 3.22, 0.31], [0.55, 2.9, 0.28]],
    [[-0.64, 3.42, -0.25], [-0.78, 3.15, -0.12], [-0.55, 2.88, -0.22]],
    [[0.4, 3.72, -0.34], [0.72, 3.34, -0.24], [0.48, 2.77, -0.3]],
  ]
  for (const points of veins) parent.add(pipe(m.cable, points, 0.026, 10, 6))

  // Cross-ribs wrap into the organ surface, giving it the reference's layered
  // anatomy instead of a single smooth volume.
  for (const [y, width, depth] of [
    [2.85, 0.62, 0.58], [3.02, 0.78, 0.67], [3.2, 0.84, 0.7], [3.39, 0.76, 0.65], [3.56, 0.58, 0.52],
  ] as const) {
    parent.add(pipe(m.cable, [
      [-width, y, 0.23], [-width * 0.45, y - 0.06, depth],
      [0.12, y + 0.04, depth + 0.08], [width, y - 0.03, 0.2],
    ], 0.032, 12, 6))
  }

  // Lateral feed lines terminate on the vessel mullions and the organ's side
  // nodules, so the enlarged culture remains visibly serviced from all axes.
  for (const points of [
    [[-1.62, 3.55, 0.14], [-1.12, 3.53, 0.35], [-0.74, 3.46, 0.3]],
    [[1.62, 3.04, 0.08], [1.12, 3.02, 0.35], [0.82, 3.08, 0.32]],
    [[-1.62, 2.63, -0.12], [-1.06, 2.68, -0.36], [-0.62, 2.75, -0.4]],
  ] as Vec3[][]) parent.add(pipe(m.cable, points, 0.04, 12, 6))

  // Every suspension line has an explicit attachment at the lid and on the
  // specimen, eliminating the dangling cable ambiguity common in this prop.
  const tethers: [Vec3, Vec3, Vec3][] = [
    [[-0.88, 4.88, 0.45], [-0.62, 4.05, 0.2], [-0.42, 3.62, 0.2]],
    [[0.82, 4.9, 0.52], [0.5, 4.15, 0.32], [0.45, 3.66, 0.24]],
    [[-0.5, 4.86, -0.72], [-0.15, 4.13, -0.48], [-0.1, 3.69, -0.42]],
    [[0.56, 4.87, -0.65], [0.74, 4.08, -0.32], [0.56, 3.55, -0.22]],
  ]
  for (const points of tethers) parent.add(pipe(m.cable, points, 0.045, 14, 6))

  // Lower umbilicals connect the specimen to the illuminated plenum rather
  // than stopping in mid-fluid.
  for (const points of [
    [[-0.34, 2.6, 0.2], [-0.74, 2.03, 0.46], [-0.7, 1.48, 0.42]],
    [[0.32, 2.55, 0.1], [0.62, 1.99, 0.32], [0.52, 1.47, 0.25]],
    [[0.08, 2.52, -0.47], [-0.1, 2.02, -0.62], [-0.08, 1.47, -0.58]],
  ] as Vec3[][]) parent.add(pipe(m.cable, points, 0.055, 14, 6))

  // A restrained chain of bubbles lends scale without becoming particle noise.
  const bubbleGeometry = new SphereGeometry(0.055, 8, 6)
  for (let index = 0; index < 9; index += 1) {
    const bubble = new Mesh(bubbleGeometry, m.amberBright)
    bubble.position.set(
      0.82 + Math.sin(index * 1.9) * 0.18,
      1.76 + index * 0.32,
      0.44 + Math.cos(index * 1.3) * 0.18,
    )
    bubble.scale.setScalar(0.55 + (index % 3) * 0.18)
    parent.add(bubble)
  }
}

function addTop(parent: Group, m: TankMaterials): void {
  parent.add(disk(m.graphite, 1.88, 0.2, 5.04, 24))
  parent.add(prism(m.graphite, [2.18, 0.36, 0.38], [0, 5.02, 1.5], {
    chamfer: [0.14, 0.14, 0.05, 0.05], fillet: 0.045, bevel: 0.04,
  }))
  parent.add(disk(m.shell, 2.22, 0.72, 5.34, 20))
  parent.add(disk(m.shellShade, 2.16, 0.34, 5.72, 20))
  parent.add(disk(m.graphite, 1.75, 0.22, 5.92, 28))
  parent.add(disk(m.graphite, 1.42, 0.22, 6.03, 28))
  parent.add(torus(m.steel, 1.74, 0.055, [0, 5.86, 0]))

  // Radial clamp shoes make the broad lid read as a bolted segmented assembly.
  for (const angle of [-1.12, -0.56, 0.56, 1.12, 2.04, 4.24]) {
    const radius = 1.98
    parent.add(prism(m.shellShade, [0.58, 0.38, 0.36], [
      Math.sin(angle) * radius, 5.43, Math.cos(angle) * radius,
    ], {
      chamfer: [0.1, 0.1, 0.04, 0.04], fillet: 0.04, bevel: 0.035,
      rotation: [0, angle, 0],
    }))
  }

  for (const x of [-0.9, 0.9]) {
    parent.add(prism(m.graphite, [0.52, 0.18, 0.44], [x, 5.96, 0.94], {
      chamfer: 0.06, fillet: 0.03, bevel: 0.025, rotation: [0, x * -0.08, 0],
    }))
  }

  // Segmented clamp blocks and the characteristic amber forehead lamp.
  for (const x of [-1.56, -0.56, 0.56, 1.56]) {
    parent.add(prism(m.shellShade, [0.48, 0.34, 0.56], [x, 5.46, 1.61], {
      chamfer: 0.08, fillet: 0.035, bevel: 0.035,
    }))
  }
  parent.add(prism(m.graphite, [1.62, 0.34, 0.19], [0, 5.27, 2.05], {
    chamfer: [0.09, 0.09, 0.03, 0.03], fillet: 0.025, bevel: 0.025,
  }))
  parent.add(prism(m.amberBright, [1.26, 0.105, 0.08], [0, 5.3, 2.18], {
    chamfer: 0.04, fillet: 0.012, bevel: 0.012,
  }))
  for (const x of [-1.06, 1.06]) {
    parent.add(prism(m.graphite, [0.026, 0.54, 0.04], [x, 5.51, 2.09], {
      chamfer: 0, fillet: 0, bevel: 0,
    }))
  }

  // Twin lifting handles. Both legs terminate in visible top mounting pads.
  for (const x of [-1.38, 1.38]) {
    for (const legX of [x - 0.34, x + 0.34]) {
      parent.add(prism(m.graphite, [0.18, 0.72, 0.22], [legX, 6.23, 0.05], {
        chamfer: 0.06, fillet: 0.035, bevel: 0.03,
      }))
      parent.add(prism(m.steel, [0.36, 0.1, 0.4], [legX, 5.94, 0.05], {
        chamfer: 0.04, fillet: 0.02, bevel: 0.02,
      }))
    }
    parent.add(prism(m.graphite, [0.86, 0.2, 0.22], [x, 6.57, 0.05], {
      chamfer: 0.07, fillet: 0.04, bevel: 0.035,
    }))
  }
}

function addRightArmor(parent: Group, m: TankMaterials): void {
  // Full-height right pylon, built as one strong silhouette with inset control
  // strips. Its base reaches the shell and its top keys directly into the lid.
  parent.add(prism(m.shell, [0.92, 3.98, 1.08], [1.98, 3.12, 0.12], {
    chamfer: [0.24, 0.18, 0.22, 0.28], fillet: 0.07, bevel: 0.06,
  }))
  parent.add(prism(m.shellShade, [0.72, 1.03, 1.18], [1.98, 1.55, 0.12], {
    chamfer: [0.18, 0.16, 0.08, 0.14], fillet: 0.055, bevel: 0.05,
  }))
  parent.add(prism(m.graphite, [0.54, 1.5, 0.24], [1.98, 3.77, 0.73], {
    chamfer: 0.13, fillet: 0.045, bevel: 0.035,
  }))
  parent.add(prism(m.ink, [0.31, 1.13, 0.1], [1.98, 3.77, 0.91], {
    chamfer: 0.08, fillet: 0.025, bevel: 0.02,
  }))
  for (let index = 0; index < 7; index += 1) {
    parent.add(prism(m.amberBright, [0.17, 0.095, 0.055], [1.98, 3.41 + index * 0.12, 0.99], {
      chamfer: 0.025, fillet: 0.01, bevel: 0.01,
    }))
  }
  parent.add(prism(m.graphite, [0.52, 1.05, 0.18], [1.98, 2.22, 0.79], {
    chamfer: 0.11, fillet: 0.04, bevel: 0.03,
  }))
  parent.add(prism(m.ink, [0.3, 0.7, 0.08], [1.98, 2.22, 0.92], {
    chamfer: 0.065, fillet: 0.025, bevel: 0.018,
  }))
  parent.add(prism(m.graphite, [0.13, 0.36, 0.08], [1.98, 2.23, 0.99], {
    chamfer: 0.025, fillet: 0.01, bevel: 0.01,
  }))
}

function addLeftServices(parent: Group, m: TankMaterials): void {
  // Upper stainless return line is connected into both the lid manifold and
  // lower service block; collars explicitly cover every curve termination.
  parent.add(pipe(m.steel, [
    [-1.48, 5.53, 0.75], [-1.83, 5.45, 0.92], [-1.9, 4.98, 1.02], [-1.9, 4.12, 1.03],
  ], 0.15, 22, 10))
  parent.add(cylinder(m.graphite, 0.21, 0.18, [-1.48, 5.53, 0.75], [0, 0, Math.PI / 2], 12))
  parent.add(torus(m.graphite, 0.17, 0.045, [-1.9, 4.7, 1.03], [Math.PI / 2, 0, 0], 20))

  parent.add(prism(m.shellShade, [0.68, 1.08, 0.7], [-1.96, 3.72, 0.73], {
    chamfer: 0.14, fillet: 0.05, bevel: 0.045,
  }))
  parent.add(cylinder(m.graphite, 0.26, 0.23, [-1.96, 4.14, 1.09], [Math.PI / 2, 0, 0], 12))

  // Lit reagent sight glass, fully cradled top and bottom.
  parent.add(prism(m.graphite, [0.56, 1.56, 0.5], [-1.94, 3.18, 0.55], {
    chamfer: 0.12, fillet: 0.045, bevel: 0.04,
  }))
  parent.add(cylinder(m.amberBright, 0.095, 1.02, [-1.94, 3.2, 0.86], [0, 0, 0], 12))
  parent.add(cylinder(m.steel, 0.18, 0.14, [-1.94, 3.74, 0.86], [0, 0, 0], 12))
  parent.add(cylinder(m.steel, 0.18, 0.14, [-1.94, 2.66, 0.86], [0, 0, 0], 12))

  // Secondary return line and its two bridge clamps add the layered service
  // density visible beside the large coolant loop.
  parent.add(pipe(m.graphite, [
    [-1.58, 4.95, 0.5], [-2.18, 4.82, 0.58], [-2.28, 4.18, 0.64], [-2.25, 3.54, 0.65],
  ], 0.085, 18, 7))
  for (const y of [4.48, 3.85]) {
    parent.add(torus(m.steel, 0.1, 0.028, [-2.27, y, 0.65], [Math.PI / 2, 0, 0], 16))
  }
  parent.add(prism(m.shellShade, [0.3, 0.44, 0.3], [-2.23, 3.42, 0.62], {
    chamfer: 0.07, fillet: 0.03, bevel: 0.025,
  }))

  // Large lower coolant loop. It leaves a real side flange, turns down, and
  // terminates inside a floor-supported canister rather than dangling.
  parent.add(cylinder(m.steel, 0.42, 0.25, [-1.68, 2.07, 0.72], [Math.PI / 2, 0, 0], 16))
  parent.add(cylinder(m.graphite, 0.33, 0.42, [-1.68, 2.07, 0.94], [Math.PI / 2, 0, 0], 16))
  parent.add(torus(m.steel, 0.32, 0.06, [-1.68, 2.07, 1.16], [0, 0, 0], 24))
  parent.add(pipe(m.graphite, [
    [-1.68, 2.07, 1.18], [-1.96, 2.08, 1.24], [-2.2, 1.94, 1.27],
    [-2.34, 1.67, 1.21], [-2.36, 1.31, 1.12], [-2.31, 1.05, 1.06],
  ], 0.24, 28, 10))
  parent.add(cylinder(m.graphite, 0.38, 0.99, [-2.31, 0.52, 1.06], [0, 0, 0], 16))
  parent.add(cylinder(m.steel, 0.43, 0.14, [-2.31, 1.01, 1.06], [0, 0, 0], 16))
  parent.add(torus(m.steel, 0.28, 0.055, [-2.31, 1.05, 1.06], [Math.PI / 2, 0, 0], 24))
  parent.add(cylinder(m.steel, 0.43, 0.13, [-2.31, 0.09, 1.06], [0, 0, 0], 16))
}

function addRearDrain(parent: Group, m: TankMaterials): void {
  // A grounded rear service manifold receives the heavy drain. The entire run
  // stays behind the hero chamber, and both curve ends overlap real flanged
  // ports: one in the rear base drum and one in the manifold's back wall.
  parent.add(cylinder(m.steel, 0.39, 0.28, [0, 0.72, -2.1], [Math.PI / 2, 0, 0], 16))
  parent.add(cylinder(m.graphite, 0.29, 0.42, [0, 0.72, -2.26], [Math.PI / 2, 0, 0], 16))
  parent.add(torus(m.steel, 0.32, 0.06, [0, 0.72, -2.47], [0, 0, 0], 24))

  parent.add(cylinder(m.graphite, 0.43, 0.94, [-1.26, 0.47, -2.64], [0, 0, 0], 16))
  parent.add(cylinder(m.steel, 0.48, 0.12, [-1.26, 0.06, -2.64], [0, 0, 0], 16))
  parent.add(cylinder(m.steel, 0.48, 0.14, [-1.26, 0.91, -2.64], [0, 0, 0], 16))
  parent.add(prism(m.shellShade, [0.52, 0.38, 0.4], [-1.26, 0.48, -2.25], {
    chamfer: 0.08, fillet: 0.035, bevel: 0.03,
  }))
  parent.add(cylinder(m.graphite, 0.27, 0.34, [-1.26, 0.72, -2.86], [Math.PI / 2, 0, 0], 14))
  parent.add(torus(m.steel, 0.31, 0.055, [-1.26, 0.72, -3.03], [0, 0, 0], 24))

  parent.add(pipe(m.graphite, [
    [0, 0.72, -2.48], [-0.18, 0.69, -2.7], [-0.5, 0.62, -2.91],
    [-0.82, 0.63, -3.05], [-1.08, 0.68, -3.08], [-1.26, 0.72, -3.04],
  ], 0.22, 30, 10))
}

function acquireMaterials(): { materials: TankMaterials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-100', condition: 'maintained', seed: 6101 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-300', condition: 'maintained', seed: 6102 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'maintained', seed: 6103 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 6104 })
  const steel = library.acquire({ recipeId: 'MAT-01', palette: 'STEEL', condition: 'maintained', seed: 6105 })
  const glass = library.acquire({ recipeId: 'MAT-10', palette: 'GLASS', condition: 'maintained', seed: 6106 })
  const fluid = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 6107 })
  const bright = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-300', condition: 'active', seed: 6108 })
  const tissue = library.acquire({ recipeId: 'MAT-08', palette: 'TISSUE', condition: 'preserved', seed: 6109 })
  const cable = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-900', condition: 'submerged', seed: 6110 })

  const materials: TankMaterials = {
    shell: tuneMaterial(shell, 0xc8ccca, 0.36, 0.12, { clearcoat: 0.28 }),
    shellShade: tuneMaterial(shellShade, 0x81888a, 0.47, 0.2, { clearcoat: 0.18 }),
    graphite: tuneMaterial(graphite, 0x1d252e, 0.42, 0.54, { clearcoat: 0.22 }),
    ink: tuneMaterial(ink, 0x070b0f, 0.62, 0.28),
    steel: tuneMaterial(steel, 0x90989b, 0.27, 0.9, { clearcoat: 0.32 }),
    glass: tuneMaterial(glass, 0xc5d8d8, 0.08, 0.02, { clearcoat: 1 }),
    amberFluid: tuneMaterial(fluid, 0xff9500, 0.24, 0, { emissive: 0.9 }),
    amberBright: tuneMaterial(bright, 0xff9800, 0.18, 0, { emissive: 2.25 }),
    tissue: tuneMaterial(tissue, 0x170a03, 0.65, 0.04, { clearcoat: 0.46 }),
    cable: tuneMaterial(cable, 0x11151a, 0.74, 0.2),
  }
  materials.glass.transparent = true
  materials.glass.color.setHex(0x6f8588)
  materials.glass.opacity = 0.11
  materials.glass.depthWrite = false
  materials.glass.side = DoubleSide
  materials.glass.transmission = 0.48
  materials.glass.thickness = 0.16
  materials.glass.ior = 1.34
  materials.glass.attenuationColor.setHex(0x7c9698)
  materials.glass.attenuationDistance = 2.8
  materials.amberFluid.transparent = true
  materials.amberFluid.opacity = 0.27
  materials.amberFluid.depthWrite = false
  materials.amberFluid.side = DoubleSide
  materials.tissue.emissive.setHex(0x351303)
  materials.tissue.emissiveIntensity = 0.04

  return {
    materials,
    handles: [shell, shellShade, graphite, ink, steel, glass, fluid, bright, tissue, cable],
  }
}

export function createModel(): {
  root: Group
  update: (timeSeconds: number) => void
  dispose: () => void
} {
  const { materials, handles } = acquireMaterials()
  const root = new Group()
  root.name = 'amber-specimen-tank'

  addBase(root, materials)
  addChamber(root, materials)
  addSpecimen(root, materials)
  addTop(root, materials)
  addRightArmor(root, materials)
  addLeftServices(root, materials)
  addRearDrain(root, materials)

  // Form-aware surface damage is baked while every panel, collar, and pipe is
  // still an authored part. White paint chips on exposed shell bevels, steel
  // collars polish at contact edges, and grime accumulates beneath overhangs.
  const wearProfiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [materials.shell, { rub: 0.64, grime: 0.5, scratch: 0.68 }],
    [materials.shellShade, { rub: 0.52, grime: 0.64, scratch: 0.56 }],
    [materials.graphite, { rub: 0.18, grime: 0.58, scratch: 0.34 }],
    [materials.steel, { rub: 0.14, grime: 0.32, scratch: 0.42 }],
  ])
  bakeOcclusion(root, { reach: 0.28 })
  bakeSurfaceAttributes(root, wearProfiles)
  const wearMaterial = createWearMaterial({
    name: 'amber-specimen-tank / worn chassis and plumbing',
    clearcoat: 0.24,
    clearcoatRoughness: 0.38,
  })
  root.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return
    if (wearProfiles.has(object.material as MeshPhysicalMaterial)) object.material = wearMaterial
  })

  // Baked shell/metal identities collapse to one worn material; transparent
  // volumes and active culture surfaces remain separate.
  const geometries = mergeStaticByMaterial(root, {
    retainedAttributes: (material) => material === wearMaterial ? WEAR_ATTRIBUTES : [],
    meshName: (material) => `amber-specimen-tank / ${material.name}`,
  })

  // Snap the assembled batches to the exact world ground plane after every
  // bevel, tube radius, and rotated foot has contributed to the real bounds.
  // This avoids relying on nominal primitive dimensions for contact.
  root.updateMatrixWorld(true)
  const assembledBounds = new Box3().setFromObject(root, true)
  if (!assembledBounds.isEmpty()) root.position.y -= assembledBounds.min.y
  root.updateMatrixWorld(true)

  return {
    root,
    update: (timeSeconds: number) => {
      // A preview-safe culture pulse changes light only. Static GLB snapshots
      // retain the neutral pose and never depend on hidden effect geometry.
      const pulse = 0.5 + Math.sin(timeSeconds * 1.8) * 0.5
      materials.amberBright.emissiveIntensity = 2 + pulse * 0.7
      materials.amberFluid.emissiveIntensity = 0.58 + pulse * 0.24
      materials.tissue.emissiveIntensity = 0.03 + pulse * 0.04
    },
    dispose: () => {
      for (const geometry of geometries) geometry.dispose()
      wearMaterial.dispose()
      for (const handle of handles) handle.release()
    },
  }
}

export function createPreview(options: { aspect: number; time?: number }): {
  scene: Scene
  root: Group
  camera: PerspectiveCamera
  update: (timeSeconds: number) => void
  dispose: () => void
} {
  const controller = createModel()
  const scene = new Scene()
  scene.name = 'amber-specimen-tank / reference-aligned preview'
  scene.background = new Color(0x000000)
  scene.add(controller.root)
  scene.add(new HemisphereLight(0xaab9c2, 0x050608, 0.62))
  const key = new DirectionalLight(0xfff3df, 2.4)
  key.position.set(-6, 10, 11)
  scene.add(key)
  const fill = new DirectionalLight(0x8eaed1, 0.9)
  fill.position.set(8, 5, 9)
  scene.add(fill)
  const rim = new DirectionalLight(0x6f8fb4, 1.1)
  rim.position.set(7, 8, -8)
  scene.add(rim)
  const cultureGlow = new PointLight(0xffa000, 3.1, 7, 2)
  cultureGlow.position.set(0, 3.05, 0.65)
  scene.add(cultureGlow)

  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const camera = new PerspectiveCamera(30, aspect, 0.18, 80)
  camera.position.set(7.8, 7.0, 14.8)
  camera.lookAt(0, 3.05, 0.35)
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
