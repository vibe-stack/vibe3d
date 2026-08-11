import {
  Box3,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  Path,
  PerspectiveCamera,
  PointLight,
  Scene,
  Shape,
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

interface Materials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  pad: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  amberDim: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
  grime: MeshPhysicalMaterial
}

interface Preview {
  scene: Scene
  root: Group
  camera: PerspectiveCamera
  update: (deltaSeconds: number) => void
  dispose: () => void
}

function acquireMaterials(): { materials: Materials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 18601 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 18602 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 18603 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 18604 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 18605 })
  const pad = library.acquire({ recipeId: 'MAT-05', palette: 'GRAPHITE-800', condition: 'worked', seed: 18606 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 18607 })
  const amberDim = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'maintained', seed: 18608 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 18609 })
  const grime = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 18610 })
  return {
    materials: {
      shell: tuneMaterial(shell, 0xc7cecf, 0.38, 0.32, { clearcoat: 0.18 }),
      shellShade: tuneMaterial(shellShade, 0x98a1a4, 0.48, 0.28, { clearcoat: 0.12 }),
      graphite: tuneMaterial(graphite, 0x20282e, 0.56, 0.6, { clearcoat: 0.08 }),
      ink: tuneMaterial(ink, 0x05080b, 0.74, 0.22),
      steel: tuneMaterial(steel, 0x6d797d, 0.28, 0.9),
      pad: tuneMaterial(pad, 0x242b31, 0.72, 0.14),
      amber: tuneMaterial(amber, 0xf09a18, 0.2, 0.02, { emissive: 1.55 }),
      amberDim: tuneMaterial(amberDim, 0x8e510c, 0.4, 0.05, { emissive: 0.35 }),
      cyan: tuneMaterial(cyan, 0x17a9b5, 0.26, 0.04, { emissive: 0.92 }),
      grime: tuneMaterial(grime, 0x242321, 0.94, 0.06),
    },
    handles: [shell, shellShade, graphite, ink, steel, pad, amber, amberDim, cyan, grime],
  }
}

function pipe(material: MeshPhysicalMaterial, points: Vec3[], radius: number, tubularSegments = 18, radialSegments = 6): Mesh {
  const curve = new CatmullRomCurve3(points.map((point) => new Vector3(...point)), false, 'centripetal')
  return new Mesh(new TubeGeometry(curve, tubularSegments, radius, radialSegments, false), material)
}

function gantryPlate(material: MeshPhysicalMaterial, depth: number, z: number, outerScale = 1): Mesh {
  const sx = outerScale
  const shape = new Shape()
  shape.moveTo(-1.9 * sx, 0.34)
  shape.lineTo(1.9 * sx, 0.34)
  shape.lineTo(1.9 * sx, 2.8)
  shape.lineTo(1.5 * sx, 3.46)
  shape.lineTo(1.08 * sx, 3.72)
  shape.lineTo(-1.08 * sx, 3.72)
  shape.lineTo(-1.5 * sx, 3.46)
  shape.lineTo(-1.9 * sx, 2.8)
  shape.closePath()
  const hole = new Path()
  hole.absarc(0, 2.08, 1.12, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.045,
    bevelThickness: 0.04,
    curveSegments: 32,
  })
  geometry.translate(0, 0, z - depth)
  return new Mesh(geometry, material)
}

function annulus(material: MeshPhysicalMaterial, outerRadius: number, innerRadius: number, depth: number, z: number, segments = 32): Mesh {
  const shape = new Shape()
  shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false)
  const hole = new Path()
  hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  const geometry = new ExtrudeGeometry(shape, { depth, steps: 1, bevelEnabled: false, curveSegments: segments })
  geometry.translate(0, 2.08, z - depth)
  return new Mesh(geometry, material)
}

function addFoot(parent: Group, m: Materials, x: number, z: number): void {
  parent.add(
    prism(m.graphite, [0.72, 0.22, 0.68], [x, 0.11, z], { chamfer: [0.13, 0.13, 0.07, 0.07], fillet: 0.035, bevel: 0.028 }),
    prism(m.steel, [0.44, 0.035, 0.42], [x, 0.018, z], { chamfer: 0.07, fillet: 0.018, bevel: 0.014 }),
  )
  for (const dx of [-0.19, 0.19]) parent.add(cylinder(m.ink, 0.035, 0.025, [x + dx, 0.035, z], [0, 0, 0], 8))
}

function addBase(parent: Group, m: Materials): void {
  for (const [x, z] of [[-1.55, 0.72], [1.55, 0.72], [-1.55, -0.78], [1.55, -0.78]] as const) addFoot(parent, m, x, z)
  parent.add(
    prism(m.graphite, [3.58, 0.26, 2.02], [0, 0.28, -0.06], { chamfer: [0.2, 0.2, 0.12, 0.12], fillet: 0.055, bevel: 0.045 }),
    prism(m.shellShade, [3.18, 0.24, 1.64], [0, 0.47, -0.16], { chamfer: 0.16, fillet: 0.045, bevel: 0.036 }),
    prism(m.grime, [2.92, 0.035, 0.06], [0, 0.59, 0.52], { chamfer: 0.012, fillet: 0.004, bevel: 0.003 }),
  )
}

function addGantry(parent: Group, m: Materials): MeshPhysicalMaterial {
  parent.add(
    gantryPlate(m.graphite, 0.45, -0.92, 1.035),
    gantryPlate(m.shell, 0.94, 0),
    annulus(m.shellShade, 1.51, 1.345, 0.075, 0.08),
    annulus(m.graphite, 1.34, 1.13, 0.13, 0.115),
    annulus(m.shellShade, 1.14, 1.01, 0.09, 0.22),
    annulus(m.amber, 1.015, 0.975, 0.035, 0.275),
    annulus(m.ink, 0.975, 0.94, 0.055, 0.235),
  )

  const tunnelMaterial = m.graphite.clone()
  tunnelMaterial.name = 'medical scanner / tunnel lining'
  tunnelMaterial.color.setHex(0x535d63)
  tunnelMaterial.roughness = 0.6
  tunnelMaterial.metalness = 0.48
  tunnelMaterial.side = DoubleSide
  const tunnel = new Mesh(new CylinderGeometry(0.945, 0.945, 1.45, 32, 1, true), tunnelMaterial)
  tunnel.position.set(0, 2.08, -0.59)
  tunnel.rotation.x = Math.PI / 2
  parent.add(tunnel)
  for (const z of [-0.15, -0.47, -0.79, -1.11]) parent.add(annulus(m.shellShade, 0.946, 0.922, 0.025, z, 32))
  parent.add(annulus(m.graphite, 0.95, 0.895, 0.055, -1.25, 32))

  // Tangential liner seams and two interior task lights make the bore read as
  // a deep service tunnel rather than a dark hole.
  for (const angle of [-2.55, -2.08, -1.05, -0.55, 0, 0.55, 1.05, 2.08, 2.55]) {
    const x = Math.cos(angle) * 0.918
    const y = 2.08 + Math.sin(angle) * 0.918
    parent.add(prism(m.ink, [0.31, 0.08, 0.74], [x, y, -0.38], {
      chamfer: 0.012, fillet: 0.004, bevel: 0.003, rotation: [0, 0, angle + Math.PI / 2],
    }))
  }
  for (const x of [-0.82, 0.82]) parent.add(prism(m.amberDim, [0.055, 0.36, 0.035], [x, 2.08, -0.02], { chamfer: 0.015, fillet: 0.005, bevel: 0.004 }))

  // Upper calibration bridge, lower vents, and side armor towers are all
  // seated into the main shell and carry the reference's asymmetric services.
  parent.add(
    prism(m.graphite, [0.72, 0.22, 0.18], [0, 3.12, 0.18], { chamfer: 0.06, fillet: 0.02, bevel: 0.016 }),
    prism(m.amber, [0.32, 0.055, 0.035], [0, 3.1, 0.29], { chamfer: 0.012, fillet: 0.004, bevel: 0.003 }),
    prism(m.shellShade, [0.46, 1.78, 0.24], [-1.63, 1.42, 0.04], { chamfer: 0.08, fillet: 0.026, bevel: 0.021 }),
    prism(m.graphite, [0.3, 0.7, 0.08], [-1.65, 0.95, 0.2], { chamfer: 0.045, fillet: 0.015, bevel: 0.012 }),
    prism(m.cyan, [0.12, 0.4, 0.035], [-1.65, 0.96, 0.26], { chamfer: 0.02, fillet: 0.007, bevel: 0.005 }),
  )
  // Shallow outer armor cassettes have real returns and break up only the
  // broad shell perimeter; they never overlay the bore rings.
  for (const x of [-1.02, 0, 1.02]) parent.add(prism(m.shellShade, [0.82, 0.14, 0.065], [x, 3.57, 0.055], { chamfer: 0.035, fillet: 0.012, bevel: 0.009 }))
  for (const x of [-1.7, 1.7]) parent.add(prism(m.shellShade, [0.16, 0.7, 0.065], [x, 2.72, 0.055], { chamfer: 0.04, fillet: 0.014, bevel: 0.011 }))
  for (const [x, y] of [[-1.58, 1.3], [1.58, 1.3], [-1.5, 2.85], [1.5, 2.85], [-0.82, 3.52], [0.82, 3.52]] as const) {
    parent.add(cylinder(m.steel, 0.035, 0.04, [x, y, 0.1], [Math.PI / 2, 0, 0], 8))
  }
  for (const y of [0.74, 0.88, 1.02, 1.16]) parent.add(prism(m.ink, [0.16, 0.055, 0.035], [-1.65, y, 0.255], { chamfer: 0.01, fillet: 0.003, bevel: 0.002 }))
  return tunnelMaterial
}

function addPedestal(parent: Group, m: Materials): void {
  parent.add(
    prism(m.graphite, [1.7, 0.24, 1.82], [0, 0.58, 0.64], { chamfer: [0.18, 0.18, 0.1, 0.1], fillet: 0.05, bevel: 0.04 }),
    prism(m.shell, [1.56, 0.82, 1.78], [0, 0.86, 0.57], { chamfer: [0.2, 0.2, 0.11, 0.11], fillet: 0.055, bevel: 0.044 }),
    prism(m.graphite, [1.42, 0.17, 1.96], [0, 0.91, 0.42], { chamfer: 0.11, fillet: 0.032, bevel: 0.026 }),
    prism(m.shellShade, [1.24, 0.2, 1.78], [0, 1.01, 0.49], { chamfer: 0.1, fillet: 0.03, bevel: 0.024 }),
    prism(m.graphite, [0.09, 0.54, 1.26], [-0.805, 0.8, 0.66], { chamfer: 0.025, fillet: 0.009, bevel: 0.007 }),
    prism(m.graphite, [0.09, 0.54, 1.26], [0.805, 0.8, 0.66], { chamfer: 0.025, fillet: 0.009, bevel: 0.007 }),
  )
  for (const x of [-0.45, 0.45]) parent.add(prism(m.steel, [0.12, 0.08, 2.56], [x, 1.06, 0.12], { chamfer: 0.025, fillet: 0.008, bevel: 0.006 }))
  parent.add(
    prism(m.graphite, [0.62, 0.68, 0.08], [0, 0.72, 1.445], { chamfer: 0.07, fillet: 0.022, bevel: 0.018 }),
    prism(m.cyan, [0.3, 0.12, 0.035], [0, 0.72, 1.502], { chamfer: 0.018, fillet: 0.006, bevel: 0.005 }),
  )
}

function buildBed(m: Materials): Group {
  const bed = new Group()
  bed.name = 'medical scanner / translating patient table'
  bed.add(
    prism(m.graphite, [1.46, 0.18, 2.82], [0, 1.18, 0.5], { chamfer: [0.14, 0.14, 0.09, 0.09], fillet: 0.045, bevel: 0.036 }),
    prism(m.shell, [1.34, 0.18, 2.68], [0, 1.3, 0.56], { chamfer: [0.13, 0.13, 0.08, 0.08], fillet: 0.04, bevel: 0.032 }),
    prism(m.pad, [1.14, 0.12, 2.35], [0, 1.42, 0.43], { chamfer: [0.12, 0.12, 0.07, 0.07], fillet: 0.035, bevel: 0.028 }),
    prism(m.pad, [0.92, 0.08, 0.52], [0, 1.51, -0.54], { chamfer: 0.1, fillet: 0.03, bevel: 0.024 }),
  )
  for (const z of [-0.05, 0.55, 1.15]) bed.add(prism(m.graphite, [1.06, 0.018, 0.04], [0, 1.485, z], { chamfer: 0.006, fillet: 0.002, bevel: 0.002 }))
  for (const x of [-0.59, 0.59]) bed.add(prism(m.steel, [0.07, 0.09, 2.18], [x, 1.39, 0.42], { chamfer: 0.018, fillet: 0.006, bevel: 0.005 }))
  // Four moving roller blocks wrap the fixed twin rails. Their cylinders are
  // carried by the table, so the support relationship remains visible during
  // the full translated preview instead of reading as two sliding slabs.
  for (const z of [-0.18, 1.05]) for (const x of [-0.46, 0.46]) {
    bed.add(
      prism(m.graphite, [0.2, 0.2, 0.3], [x, 1.11, z], { chamfer: 0.04, fillet: 0.013, bevel: 0.01 }),
      cylinder(m.steel, 0.075, 0.14, [x, 1.06, z], [0, 0, Math.PI / 2], 10),
    )
  }
  bed.add(
    prism(m.graphite, [0.9, 0.3, 0.28], [0, 1.28, 1.88], { chamfer: 0.07, fillet: 0.022, bevel: 0.018 }),
    prism(m.amber, [0.58, 0.12, 0.16], [0, 1.32, 2.04], { chamfer: 0.045, fillet: 0.014, bevel: 0.011 }),
  )
  return bed
}

function addControlPod(parent: Group, m: Materials): void {
  // The pod's rear bracket and twin struts visibly penetrate both the gantry
  // shoulder and pod body; no control mass hangs from an implied connection.
  parent.add(
    prism(m.graphite, [0.56, 0.7, 0.54], [1.78, 1.8, -0.08], { chamfer: 0.08, fillet: 0.026, bevel: 0.021 }),
    prism(m.shell, [0.76, 1.2, 0.62], [2.02, 1.86, 0.16], { chamfer: [0.12, 0.12, 0.07, 0.07], fillet: 0.035, bevel: 0.028 }),
    prism(m.graphite, [0.62, 0.62, 0.12], [2.02, 2.04, 0.52], { chamfer: 0.07, fillet: 0.022, bevel: 0.018 }),
    prism(m.ink, [0.47, 0.4, 0.035], [2.02, 2.06, 0.605], { chamfer: 0.045, fillet: 0.014, bevel: 0.011 }),
    prism(m.amber, [0.36, 0.065, 0.025], [2.02, 2.22, 0.638], { chamfer: 0.012, fillet: 0.004, bevel: 0.003 }),
    prism(m.cyan, [0.3, 0.08, 0.025], [2.02, 1.92, 0.638], { chamfer: 0.012, fillet: 0.004, bevel: 0.003 }),
    prism(m.shellShade, [0.2, 0.18, 0.025], [2.02, 2.06, 0.65], { chamfer: 0.035, fillet: 0.011, bevel: 0.008 }),
    prism(m.graphite, [0.08, 0.1, 0.02], [2.02, 2.06, 0.675], { chamfer: 0.018, fillet: 0.006, bevel: 0.005 }),
  )
  for (const y of [1.52, 2.18]) parent.add(prism(m.steel, [0.78, 0.11, 0.14], [1.72, y, 0.02], { chamfer: 0.025, fillet: 0.008, bevel: 0.006, rotation: [0, 0, y < 2 ? -0.24 : 0.24] }))
  parent.add(cylinder(m.graphite, 0.16, 0.24, [1.71, 1.85, -0.06], [Math.PI / 2, 0, 0], 12))
  parent.add(cylinder(m.graphite, 0.11, 0.12, [2.02, 1.21, 0.08], [0, 0, 0], 10))
  // Exposed return manifold: the hose enters a second vertical collar whose
  // skirt visibly penetrates the armored receiver. Both endpoints remain
  // readable from the side and low cameras.
  parent.add(
    prism(m.graphite, [0.34, 0.36, 0.32], [2.02, 0.72, -0.05], { chamfer: 0.065, fillet: 0.02, bevel: 0.016 }),
    prism(m.shellShade, [0.24, 0.24, 0.23], [2.02, 0.72, 0.11], { chamfer: 0.05, fillet: 0.016, bevel: 0.013 }),
    cylinder(m.steel, 0.09, 0.14, [2.02, 0.92, 0.02], [0, 0, 0], 10),
  )
  parent.add(pipe(m.ink, [[2.02, 1.2, 0.08], [2.14, 1.1, 0.07], [2.14, 1.0, 0.02], [2.02, 0.93, 0.02]], 0.045, 18, 7))
}

function addRearServices(parent: Group, m: Materials): void {
  // The deep rear shell carries a real removable service cassette and upper
  // bus cover. Both overlap the back armor by 20 mm and expose proud returns,
  // replacing the previous featureless graphite slab.
  parent.add(
    prism(m.shellShade, [1.42, 1.02, 0.08], [-0.52, 1.05, -1.43], { chamfer: 0.1, fillet: 0.03, bevel: 0.024 }),
    prism(m.graphite, [1.16, 0.74, 0.06], [-0.52, 1.05, -1.49], { chamfer: 0.075, fillet: 0.023, bevel: 0.018 }),
    prism(m.ink, [0.9, 0.52, 0.035], [-0.52, 1.05, -1.545], { chamfer: 0.055, fillet: 0.017, bevel: 0.013 }),
    prism(m.shellShade, [1.74, 0.32, 0.08], [0.3, 3.18, -1.43], { chamfer: 0.07, fillet: 0.022, bevel: 0.018 }),
    prism(m.graphite, [1.48, 0.12, 0.05], [0.3, 3.18, -1.495], { chamfer: 0.03, fillet: 0.01, bevel: 0.008 }),
  )
  for (const y of [0.86, 1.0, 1.14, 1.28]) parent.add(prism(m.cyan, [0.62, 0.05, 0.025], [-0.52, y, -1.585], { chamfer: 0.012, fillet: 0.004, bevel: 0.003 }))
  for (const x of [-0.96, -0.08]) for (const y of [0.67, 1.44]) parent.add(cylinder(m.steel, 0.035, 0.04, [x, y, -1.585], [Math.PI / 2, 0, 0], 8))
}

function buildScanner(): {
  root: Group
  bed: Group
  materials: Materials
  handles: MaterialHandle[]
  wear: MeshPhysicalMaterial
  extraMaterials: MeshPhysicalMaterial[]
  geometries: Array<{ dispose: () => void }>
} {
  const acquired = acquireMaterials()
  const m = acquired.materials
  const root = new Group()
  root.name = 'medical-imaging-scanner'
  addBase(root, m)
  const tunnelMaterial = addGantry(root, m)
  addPedestal(root, m)
  addControlPod(root, m)
  addRearServices(root, m)
  const bed = buildBed(m)
  root.add(bed)

  const wearProfiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [m.shell, { rub: 0.5, grime: 0.44, scratch: 0.19 }],
    [m.shellShade, { rub: 0.42, grime: 0.48, scratch: 0.16 }],
    [m.graphite, { rub: 0.18, grime: 0.38, scratch: 0.12 }],
    [m.steel, { rub: 0.12, grime: 0.22, scratch: 0.18 }],
    [m.pad, { rub: 0.12, grime: 0.22, scratch: 0.1 }],
  ])
  bakeOcclusion(root, { reach: 0.24 })
  bakeSurfaceAttributes(root, wearProfiles)
  const wear = createWearMaterial({ name: 'medical scanner / restrained contact wear', clearcoat: 0.16, clearcoatRoughness: 0.48 })
  root.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return
    if (wearProfiles.has(object.material as MeshPhysicalMaterial)) object.material = wear
  })

  root.remove(bed)
  const staticGeometries = mergeStaticByMaterial(root, {
    retainedAttributes: (material) => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material) => `medical scanner / static / ${material.name}`,
  })
  const bedGeometries = mergeStaticByMaterial(bed, {
    retainedAttributes: (material) => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material) => `medical scanner / bed / ${material.name}`,
  })
  root.add(bed)
  root.updateMatrixWorld(true)
  const bounds = new Box3().setFromObject(root, true)
  root.position.y -= bounds.min.y
  root.updateMatrixWorld(true)
  return { root, bed, materials: m, handles: acquired.handles, wear, extraMaterials: [tunnelMaterial], geometries: [...staticGeometries, ...bedGeometries] }
}

export function createModel(): { root: Group; update: (deltaSeconds: number) => void; dispose: () => void } {
  const rig = buildScanner()
  let elapsed = 0
  return {
    root: rig.root,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      const travel = (Math.sin(elapsed * 0.62 - Math.PI / 2) + 1) * 0.5
      rig.bed.position.z = -0.48 * travel
      rig.materials.amber.emissiveIntensity = 1.42 + Math.sin(elapsed * 1.35) * 0.12
      rig.materials.cyan.emissiveIntensity = 0.84 + Math.sin(elapsed * 1.05 + 0.7) * 0.08
    },
    dispose: () => {
      for (const geometry of rig.geometries) geometry.dispose()
      rig.wear.dispose()
      for (const material of rig.extraMaterials) material.dispose()
      for (const handle of rig.handles) handle.release()
    },
  }
}

function camera(aspect: number, position: Vec3, target: Vec3, fov = 31): PerspectiveCamera {
  const result = new PerspectiveCamera(fov, aspect, 0.18, 60)
  result.position.set(...position)
  result.lookAt(...target)
  return result
}

function makePreview(options: { aspect: number }, view: 'beauty' | 'side' | 'rear' | 'low' | 'translated'): Preview {
  const controller = createModel()
  if (view === 'translated') for (let step = 0; step < 102; step += 1) controller.update(0.05)
  const scene = new Scene()
  scene.background = new Color(0x000000)
  scene.add(controller.root, new HemisphereLight(0xaab8c0, 0x050609, 0.5))
  const key = new DirectionalLight(0xfff0dd, 2.65); key.position.set(-6, 9, 9)
  const fill = new DirectionalLight(0x6f91ac, 0.72); fill.position.set(8, 5, 8)
  const rim = new DirectionalLight(0x8ea8bc, 1.0); rim.position.set(5, 8, -8)
  const boreLight = new PointLight(0xff9c20, 1.25, 5.5); boreLight.position.set(0, 2.15, 0.8)
  boreLight.userData.excludeFromExport = true
  scene.add(key, fill, rim, boreLight)
  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const previewCamera = view === 'side'
    ? camera(aspect, [6.8, 3.25, 0.15], [0, 1.8, 0.15], 32)
    : view === 'rear'
      ? camera(aspect, [-5.3, 3.4, -6.5], [0, 1.8, -0.1], 32)
      : view === 'low'
        ? camera(aspect, [5.5, 0.48, 6.2], [0, 1.35, 0.05], 33)
        : view === 'translated'
          ? camera(aspect, [5.0, 3.0, 6.8], [0, 1.75, 0.0], 31)
          : camera(aspect, [5.15, 3.2, 7.0], [0, 1.78, 0.0], 31)
  scene.add(previewCamera)
  return {
    scene,
    root: controller.root,
    camera: previewCamera,
    update: controller.update,
    dispose: () => { scene.remove(controller.root); controller.dispose() },
  }
}

export function createPreview(options: { aspect: number }): Preview { return makePreview(options, 'beauty') }
export function createSidePreview(options: { aspect: number }): Preview { return makePreview(options, 'side') }
export function createRearPreview(options: { aspect: number }): Preview { return makePreview(options, 'rear') }
export function createLowPreview(options: { aspect: number }): Preview { return makePreview(options, 'low') }
export function createTranslatedPreview(options: { aspect: number }): Preview { return makePreview(options, 'translated') }
