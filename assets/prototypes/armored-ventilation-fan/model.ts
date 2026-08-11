import {
  CatmullRomCurve3,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  Path,
  PerspectiveCamera,
  Scene,
  Shape,
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

const FAN_Y = 3.68

interface FanMaterials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  graphiteEdge: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  blade: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  amberDim: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
}

function addBox(
  parent: Group,
  material: MeshPhysicalMaterial,
  size: Vec3,
  position: Vec3,
  rotation: Vec3 = [0, 0, 0],
  chamfer = 0.08,
  bevel = 0.035,
): Mesh {
  const mesh = prism(material, size, position, {
    chamfer,
    fillet: Math.min(0.055, chamfer * 0.3),
    bevel,
    rotation,
  })
  parent.add(mesh)
  return mesh
}

function frontDisk(
  parent: Group,
  material: MeshPhysicalMaterial,
  radius: number,
  depth: number,
  z: number,
  segments = 16,
): Mesh {
  const mesh = cylinder(material, radius, depth, [0, FAN_Y, z], [Math.PI * 0.5, 0, 0], segments)
  parent.add(mesh)
  return mesh
}

function createOctagonalThroat(
  parent: Group,
  material: MeshPhysicalMaterial,
  outer: number,
  inner: number,
  corner: number,
  z: number,
): Mesh {
  const outline = (target: Shape | Path, half: number, cut: number): void => {
    target.moveTo(-half + cut, -half)
    target.lineTo(half - cut, -half)
    target.lineTo(half, -half + cut)
    target.lineTo(half, half - cut)
    target.lineTo(half - cut, half)
    target.lineTo(-half + cut, half)
    target.lineTo(-half, half - cut)
    target.lineTo(-half, -half + cut)
    target.closePath()
  }
  const shape = new Shape()
  outline(shape, outer, corner)
  const hole = new Path()
  outline(hole, inner, Math.max(0.18, corner - 0.1))
  shape.holes.push(hole)
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.035,
    bevelThickness: 0.025,
    curveSegments: 1,
    steps: 1,
  })
  const mesh = new Mesh(geometry, material)
  mesh.name = 'armored-ventilation-fan / recessed octagonal throat'
  mesh.position.set(0, FAN_Y, z)
  parent.add(mesh)
  return mesh
}

function addFrontBolt(parent: Group, m: FanMaterials, x: number, y: number, z = 1.18): void {
  parent.add(cylinder(m.ink, 0.105, 0.045, [x, y, z], [Math.PI * 0.5, 0, 0], 12))
  parent.add(cylinder(m.graphiteEdge, 0.052, 0.052, [x, y, z + 0.024], [Math.PI * 0.5, 0, 0], 10))
}

function addHousing(parent: Group, m: FanMaterials): void {
  // Deep graphite chassis carries every white armor plate and the fan recess.
  addBox(parent, m.graphite, [6.2, 6.25, 1.62], [0, 3.63, 0], [0, 0, 0], 0.28, 0.07)
  addBox(parent, m.graphiteEdge, [5.76, 5.78, 0.46], [0, 3.7, 0.92], [0, 0, 0], 0.34, 0.07)

  // Four broad corner armors and narrower side returns leave an octagonal
  // negative space around the aperture instead of a generic square cutout.
  for (const side of [-1, 1] as const) {
    addBox(parent, m.shell, [2.62, 1.16, 0.7], [side * 1.73, 6.15, 0.83], [0, 0, 0], 0.23, 0.065)
    addBox(parent, m.shell, [2.62, 1.18, 0.7], [side * 1.73, 1.2, 0.84], [0, 0, 0], 0.23, 0.065)
    addBox(parent, m.shellShade, [0.93, 3.92, 0.67], [side * 2.83, 3.69, 0.81], [0, 0, 0], 0.19, 0.055)
    addBox(parent, m.shell, [0.6, 2.48, 0.28], [side * 2.72, 3.71, 1.2], [0, 0, 0], 0.1, 0.03)
  }

  // Angular seam plates bridge the armor corners into the fan surround.
  for (const [x, y, rotation] of [
    [-2.05, 5.63, -0.5], [2.05, 5.63, 0.5],
    [-2.05, 1.75, 0.5], [2.05, 1.75, -0.5],
  ] as const) {
    addBox(parent, m.ink, [1.38, 0.72, 0.18], [x, y, 1.11], [0, 0, rotation], 0.12, 0.03)
    addBox(parent, m.shellShade, [1.2, 0.56, 0.42], [x, y, 1.3], [0, 0, rotation], 0.11, 0.03)
  }

  // Recess stack: black plenum, faceted inner wall, and fixed protective ring.
  frontDisk(parent, m.blade, 2.57, 0.28, 1.06, 12)
  frontDisk(parent, m.blade, 2.43, 0.14, 1.17, 16)
  createOctagonalThroat(parent, m.graphite, 2.3, 2.08, 0.44, 1.19)
  createOctagonalThroat(parent, m.blade, 2.16, 1.98, 0.38, 1.29)
  const armoredShroud = new Mesh(new TorusGeometry(2.52, 0.25, 5, 8), m.shellShade)
  armoredShroud.name = 'armored-ventilation-fan / deep compound octagonal shroud'
  armoredShroud.position.set(0, FAN_Y, 1.3)
  armoredShroud.rotation.z = Math.PI / 8
  parent.add(armoredShroud)
  const outerRing = new Mesh(new TorusGeometry(2.46, 0.13, 6, 12), m.graphiteEdge)
  outerRing.name = 'armored-ventilation-fan / faceted aperture ring'
  outerRing.position.set(0, FAN_Y, 1.43)
  outerRing.rotation.z = Math.PI / 12
  parent.add(outerRing)
  const innerRing = new Mesh(new TorusGeometry(2.28, 0.065, 6, 16), m.ink)
  innerRing.position.set(0, FAN_Y, 1.48)
  innerRing.rotation.z = Math.PI / 16
  parent.add(innerRing)

  // Eight armor clamps make the circle read mounted into the square chassis.
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2 + Math.PI / 8
    addBox(parent, index % 2 === 0 ? m.shellShade : m.graphiteEdge, [0.62, 0.2, 0.22], [
      Math.cos(angle) * 2.55,
      FAN_Y + Math.sin(angle) * 2.55,
      1.48,
    ], [0, 0, angle + Math.PI * 0.5], 0.055, 0.018)
  }

  for (const angle of [Math.PI / 4, Math.PI * 3 / 4, Math.PI * 5 / 4, Math.PI * 7 / 4]) {
    addFrontBolt(parent, m, Math.cos(angle) * 2.68, FAN_Y + Math.sin(angle) * 2.68, 1.55)
  }

  // Panel split-lines terminate at the duct collar and trap grime naturally.
  addBox(parent, m.graphite, [0.075, 0.64, 0.055], [0, 6.16, 1.2], [0, 0, 0], 0.015, 0.005)
  addBox(parent, m.graphite, [0.075, 0.58, 0.055], [0, 1.18, 1.21], [0, 0, 0], 0.015, 0.005)

  for (const [x, y] of [
    [-2.63, 6.05], [2.63, 6.05], [-2.63, 1.29], [2.63, 1.29],
    [-2.58, 4.88], [2.58, 4.88], [-2.58, 2.48], [2.58, 2.48],
  ] as const) addFrontBolt(parent, m, x, y)

  // Restrained rear access panel: enough authored structure for a production
  // prop and diagnostic continuity, without inventing a second hero face.
  addBox(parent, m.shellShade, [4.8, 4.82, 0.24], [0, 3.62, -0.92], [0, 0, 0], 0.24, 0.055)
  addBox(parent, m.graphite, [3.92, 3.68, 0.14], [0, 3.58, -1.08], [0, 0, 0], 0.18, 0.04)
  for (const [x, y] of [[-1.68, 5.08], [1.68, 5.08], [-1.68, 2.08], [1.68, 2.08]] as const) {
    parent.add(cylinder(m.ink, 0.11, 0.055, [x, y, -1.18], [Math.PI * 0.5, 0, 0], 12))
  }
  for (const y of [3.12, 3.42, 3.72, 4.02]) {
    addBox(parent, m.ink, [2.4, 0.08, 0.05], [0, y, -1.18], [0, 0, 0], 0.018, 0.006)
  }
}

function createBladeGeometry(): ExtrudeGeometry {
  const shape = new Shape()
  shape.moveTo(0.35, -0.1)
  shape.bezierCurveTo(0.92, -0.24, 1.75, -0.42, 2.16, -0.73)
  shape.lineTo(2.2, -0.15)
  shape.bezierCurveTo(1.7, 0.34, 1.03, 0.54, 0.48, 0.34)
  shape.closePath()
  return new ExtrudeGeometry(shape, {
    depth: 0.13,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.025,
    bevelThickness: 0.02,
    curveSegments: 4,
    steps: 1,
  })
}

function createImpeller(m: FanMaterials): { group: Group; geometries: import('three/webgpu').BufferGeometry[] } {
  const group = new Group()
  group.name = 'armored-ventilation-fan / animated impeller'
  group.position.set(0, FAN_Y, 1.43)

  for (let index = 0; index < 8; index += 1) {
    const blade = new Mesh(createBladeGeometry(), m.blade)
    blade.rotation.z = (index / 8) * Math.PI * 2
    blade.position.z = -0.065
    group.add(blade)
  }

  const geometries = mergeStaticByMaterial(group, {
    meshName: (material) => `armored-ventilation-fan / rotating ${material.name}`,
  })
  return { group, geometries }
}

function addGrille(parent: Group, m: FanMaterials): void {
  // Horizontal rods are chord-sized to penetrate the fixed ring at both ends.
  for (const offset of [-1.96, -1.61, -1.27, -0.92, -0.57, -0.22, 0.13, 0.48, 0.83, 1.18, 1.53, 1.88]) {
    const half = Math.sqrt(Math.max(0, 2.34 ** 2 - offset ** 2))
    const rod = cylinder(m.graphiteEdge, 0.04, half * 2 + 0.28, [0, FAN_Y + offset, 1.54], [0, 0, Math.PI * 0.5], 8)
    rod.name = 'armored-ventilation-fan / connected protective grille rod'
    parent.add(rod)
    for (const side of [-1, 1] as const) {
      const socket = cylinder(m.ink, 0.065, 0.18, [side * half, FAN_Y + offset, 1.54], [0, 0, Math.PI * 0.5], 8)
      socket.name = 'armored-ventilation-fan / grille welded socket'
      parent.add(socket)
    }
  }

  // Hub retention rings sit in front of the rods, with amber service segments.
  frontDisk(parent, m.ink, 0.75, 0.18, 1.8, 20)
  frontDisk(parent, m.graphiteEdge, 0.59, 0.2, 1.91, 18)
  frontDisk(parent, m.graphite, 0.37, 0.22, 2.02, 16)
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2
    addBox(parent, m.amberDim, [0.22, 0.09, 0.04], [
      Math.cos(angle) * 0.48,
      FAN_Y + Math.sin(angle) * 0.48,
      2.145,
    ], [0, 0, angle], 0.02, 0.006)
  }
}

function addLightBanks(parent: Group, m: FanMaterials): void {
  for (const side of [-1, 1] as const) {
    addBox(parent, m.ink, [0.34, 2.45, 0.25], [side * 2.58, FAN_Y, 1.48], [0, 0, 0], 0.08, 0.025)
    for (let index = 0; index < 7; index += 1) {
      addBox(parent, index === 3 ? m.amber : m.amberDim, [0.14, 0.27, 0.045], [
        side * 2.58,
        FAN_Y + (index - 3) * 0.31,
        1.64,
      ], [0, 0, 0], 0.025, 0.006)
    }
  }
}

function addLeftServiceAssembly(parent: Group, m: FanMaterials): void {
  // One continuous tube runs from lower to upper chassis ports; support clamps
  // and the service box overlap it rather than hovering beside it.
  const path = new CatmullRomCurve3([
    new Vector3(-2.98, 1.02, 0.35),
    new Vector3(-3.42, 1.12, 0.52),
    new Vector3(-3.53, 2.02, 0.65),
    new Vector3(-3.53, 5.23, 0.65),
    new Vector3(-3.4, 6.01, 0.53),
    new Vector3(-2.99, 6.15, 0.34),
  ])
  const pipe = new Mesh(new TubeGeometry(path, 40, 0.14, 10, false), m.graphiteEdge)
  pipe.name = 'armored-ventilation-fan / continuous left U-pipe'
  parent.add(pipe)
  // Chassis sockets swallow both pipe ends; the bright coupler genuinely
  // sleeves the vertical run instead of hovering alongside it.
  for (const y of [1.05, 6.12]) {
    parent.add(cylinder(m.ink, 0.235, 0.32, [-3.0, y, 0.36], [0, 0, 0], 12))
  }
  parent.add(cylinder(m.cyan, 0.175, 0.085, [-3.53, 5.08, 0.65], [0, 0, 0], 12))
  parent.add(cylinder(m.ink, 0.185, 0.09, [-3.53, 5.23, 0.65], [0, 0, 0], 12))
  for (const y of [1.43, 3.55, 5.72]) {
    addBox(parent, m.ink, [0.52, 0.25, 0.42], [-3.46, y, 0.7], [0, 0, 0], 0.055, 0.018)
  }

  addBox(parent, m.graphite, [1.34, 2.9, 0.72], [-2.95, 3.52, 0.7], [0, 0, 0], 0.18, 0.05)
  addBox(parent, m.shellShade, [1.2, 2.66, 0.9], [-2.93, 3.55, 0.86], [0, 0, 0], 0.16, 0.05)
  addBox(parent, m.ink, [0.94, 1.46, 0.22], [-2.91, 3.33, 1.38], [0, 0, 0], 0.1, 0.028)
  for (const y of [3.1, 3.42, 3.74]) addFrontBolt(parent, m, -3.12, y, 1.42)
  // Service-door grab is a real three-piece handle with both feet seated.
  addBox(parent, m.amberDim, [0.13, 0.78, 0.1], [-3.02, 3.34, 1.52], [0, 0, 0], 0.035, 0.012)
  addBox(parent, m.amberDim, [0.32, 0.13, 0.1], [-2.89, 3.67, 1.46], [0, 0, 0], 0.035, 0.012)
  addBox(parent, m.amberDim, [0.32, 0.13, 0.1], [-2.89, 3.01, 1.46], [0, 0, 0], 0.035, 0.012)
  for (const y of [4.32, 4.5, 4.68]) addBox(parent, m.ink, [0.44, 0.055, 0.06], [-2.82, y, 1.25], [0, 0, 0], 0.014, 0.004)
  for (const y of [2.18, 2.36, 4.55, 4.73]) addBox(parent, m.graphite, [0.48, 0.06, 0.06], [-2.82, y, 1.26], [0, 0, 0], 0.014, 0.004)
}

function addTopAndBase(parent: Group, m: FanMaterials): void {
  // Top rail, amber status strip, and two hoist lugs with bored front holes.
  addBox(parent, m.graphiteEdge, [4.5, 0.38, 0.52], [0, 6.88, 0.16], [0, 0, 0], 0.08, 0.03)
  addBox(parent, m.amberDim, [1.42, 0.12, 0.055], [0, 6.9, 0.49], [0, 0, 0], 0.03, 0.008)
  for (const x of [-2.35, 2.35]) {
    addBox(parent, m.graphiteEdge, [0.72, 0.75, 0.57], [x, 7.06, 0.03], [0, 0, 0], 0.14, 0.045)
    parent.add(cylinder(m.ink, 0.16, 0.1, [x, 7.12, 0.39], [Math.PI * 0.5, 0, 0], 14))
  }

  // Bottom cross-pipe is supported by end collars and a central instrument pod.
  parent.add(cylinder(m.graphiteEdge, 0.17, 4.8, [0, 0.53, 1.14], [0, 0, Math.PI * 0.5], 14))
  for (const x of [-2.05, 2.05]) parent.add(cylinder(m.ink, 0.24, 0.42, [x, 0.53, 1.14], [0, 0, Math.PI * 0.5], 14))
  addBox(parent, m.ink, [0.62, 0.55, 0.5], [0, 0.55, 1.17], [0, 0, 0], 0.08, 0.025)
  addBox(parent, m.cyan, [0.13, 0.17, 0.04], [0, 0.56, 1.45], [0, 0, 0], 0.02, 0.006)

  // Side cradles connect the armored chassis, cross-pipe and feet into one
  // load path rather than leaving the pipe suspended below the body.
  for (const side of [-1, 1] as const) {
    addBox(parent, m.graphiteEdge, [0.42, 1.18, 0.55], [side * 2.65, 0.72, 0.08], [0, 0, side * -0.14], 0.08, 0.025)
    addBox(parent, m.shellShade, [0.62, 0.28, 0.8], [side * 2.65, 0.33, 0.25], [0, 0, 0], 0.07, 0.022)
    addBox(parent, m.ink, [0.16, 0.16, 0.07], [side * 2.65, 0.66, 0.46], [0, 0, 0], 0.025, 0.008)
  }
}

function addFeet(parent: Group, m: FanMaterials): void {
  // Four feet overlap the chassis underside and terminate exactly at y=0.
  for (const x of [-2.65, 2.65]) {
    for (const z of [-0.55, 0.76]) {
      addBox(parent, m.graphiteEdge, [1.02, 0.86, 1.0], [x, 0.43, z], [0, 0, 0], 0.16, 0.05)
      addBox(parent, m.ink, [0.8, 0.14, 0.74], [x, 0.07, z + (z > 0 ? 0.15 : -0.07)], [0, 0, 0], 0.05, 0.016)
    }
  }
}

function acquireMaterials(): { materials: FanMaterials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-100', condition: 'maintained', seed: 9101 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-350', condition: 'maintained', seed: 9102 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'maintained', seed: 9103 })
  const graphiteEdge = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-650', condition: 'maintained', seed: 9104 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 9105 })
  const blade = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-900', condition: 'maintained', seed: 9106 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 9107 })
  const amberDim = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-500', condition: 'active', seed: 9108 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 9109 })
  return {
    handles: [shell, shellShade, graphite, graphiteEdge, ink, blade, amber, amberDim, cyan],
    materials: {
      shell: tuneMaterial(shell, 0xb8c0c2, 0.44, 0.3, { clearcoat: 0.18 }),
      shellShade: tuneMaterial(shellShade, 0x727d82, 0.5, 0.42, { clearcoat: 0.1 }),
      graphite: tuneMaterial(graphite, 0x20262c, 0.48, 0.52, { clearcoat: 0.1 }),
      graphiteEdge: tuneMaterial(graphiteEdge, 0x3b444b, 0.4, 0.62, { clearcoat: 0.14 }),
      ink: tuneMaterial(ink, 0x070a0d, 0.72, 0.22),
      blade: tuneMaterial(blade, 0x151b20, 0.5, 0.6, { clearcoat: 0.1 }),
      amber: tuneMaterial(amber, 0xffae1d, 0.22, 0.04, { emissive: 2.7 }),
      amberDim: tuneMaterial(amberDim, 0xea830b, 0.28, 0.08, { emissive: 1.5 }),
      cyan: tuneMaterial(cyan, 0x31e6e8, 0.24, 0.05, { emissive: 2.0 }),
    },
  }
}

export function createModel(): {
  root: Group
  update: (deltaSeconds: number) => void
  dispose: () => void
} {
  const { materials, handles } = acquireMaterials()
  const root = new Group()
  root.name = 'armored-ventilation-fan'

  addHousing(root, materials)
  addLightBanks(root, materials)
  addLeftServiceAssembly(root, materials)
  addTopAndBase(root, materials)
  addFeet(root, materials)
  addGrille(root, materials)

  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [materials.shell, { rub: 0.46, grime: 0.5, scratch: 0.075 }],
    [materials.shellShade, { rub: 0.38, grime: 0.58, scratch: 0.07 }],
    [materials.graphite, { rub: 0.24, grime: 0.64, scratch: 0.045 }],
    [materials.graphiteEdge, { rub: 0.36, grime: 0.58, scratch: 0.065 }],
    [materials.ink, { rub: 0.34, grime: 0.7, scratch: 0.045 }],
  ])
  bakeOcclusion(root, { reach: 0.3 })
  bakeSurfaceAttributes(root, profiles)
  const wearMaterial = createWearMaterial({
    name: 'armored-ventilation-fan / baked worn housing',
    clearcoat: 0.16,
    clearcoatRoughness: 0.46,
  })
  root.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return
    if (profiles.has(object.material as MeshPhysicalMaterial)) object.material = wearMaterial
  })
  const staticGeometries = mergeStaticByMaterial(root, {
    retainedAttributes: (material) => material === wearMaterial ? WEAR_ATTRIBUTES : [],
    meshName: (material) => `armored-ventilation-fan / ${material.name}`,
  })

  const impeller = createImpeller(materials)
  root.add(impeller.group)

  return {
    root,
    update: (deltaSeconds: number) => {
      const delta = Math.min(Math.max(deltaSeconds, 0), 0.05)
      impeller.group.rotation.z -= delta * 1.35
      const pulse = Math.sin(impeller.group.rotation.z * 0.7) * 0.5 + 0.5
      materials.amber.emissiveIntensity = 2.5 + pulse * 0.5
    },
    dispose: () => {
      for (const geometry of [...staticGeometries, ...impeller.geometries]) geometry.dispose()
      wearMaterial.dispose()
      for (const handle of handles) handle.release()
    },
  }
}

export function createPreview(options: { aspect: number; time?: number }): {
  scene: Scene
  root: Group
  camera: PerspectiveCamera
  update: (deltaSeconds: number) => void
  dispose: () => void
} {
  const controller = createModel()
  const scene = new Scene()
  scene.name = 'armored-ventilation-fan / reference preview'
  scene.background = new Color(0x04070a)
  scene.add(controller.root)

  scene.add(new HemisphereLight(0xa8bcc7, 0x07090c, 0.85))
  const key = new DirectionalLight(0xfff0dc, 2.55)
  key.position.set(8, 11, 13)
  scene.add(key)
  const fill = new DirectionalLight(0x768bd4, 0.95)
  fill.position.set(-9, 5, 8)
  scene.add(fill)
  const rim = new DirectionalLight(0x87b1c5, 0.8)
  rim.position.set(7, 9, -10)
  scene.add(rim)

  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const mode = Math.floor(options.time ?? 0)
  const camera = new PerspectiveCamera(mode >= 2 ? 30 : 32, aspect, 0.12, 90)
  if (mode === 2) {
    camera.position.set(9.4, 3.2, 7.2)
    camera.lookAt(0, 3.42, 0.55)
  } else if (mode === 3) {
    camera.position.set(-11.5, 5.5, -13)
    camera.lookAt(0, 3.55, 0.1)
  } else if (mode >= 4) {
    camera.position.set(-8.5, 2.45, 7.4)
    camera.lookAt(0, 3.12, 0.48)
  } else {
    camera.position.set(-8.25, 6.7, 13.2)
    camera.lookAt(0, 3.55, 0.25)
  }
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
