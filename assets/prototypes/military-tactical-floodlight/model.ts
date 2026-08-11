import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Scene,
  TorusGeometry,
} from 'three/webgpu'

import {
  MaterialLibrary,
  WEAR_ATTRIBUTES,
  bakeOcclusion,
  bakeSurfaceAttributes,
  createWearMaterial,
  mergeStaticByMaterial,
  prism,
  tuneMaterial,
  type MaterialHandle,
  type Vec3,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'

interface FloodlightMaterials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  amberDim: MeshPhysicalMaterial
  glass: MeshPhysicalMaterial
  blue: MeshPhysicalMaterial
}

interface FloodlightController {
  root: Group
  update: (deltaSeconds: number) => void
  toggleTracking: (enabled?: boolean) => boolean
  dispose: () => void
}

interface FloodlightPreview extends FloodlightController {
  scene: Scene
  camera: PerspectiveCamera
}

let exportedTrackingState = false
const trackingListeners = new Set<(enabled: boolean) => void>()

/** Toggle the bounded pan-and-tilt demonstration on every live floodlight. */
export function toggleTracking(enabled = !exportedTrackingState): boolean {
  exportedTrackingState = enabled
  for (const listener of trackingListeners) listener(enabled)
  return exportedTrackingState
}

function acquireMaterials(): { materials: FloodlightMaterials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 21101 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'worked', seed: 21102 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 21103 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'worked', seed: 21104 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 21105 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 21106 })
  const amberDim = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-600', condition: 'active', seed: 21107 })
  const glass = library.acquire({ recipeId: 'MAT-08', palette: 'AMBER-GLASS', condition: 'worked', seed: 21108 })
  const blue = library.acquire({ recipeId: 'MAT-09', palette: 'BLUE-500', condition: 'active', seed: 21109 })
  const glassMaterial = tuneMaterial(glass, 0xc75a02, 0.1, 0.01, { clearcoat: 0.82 })
  glassMaterial.transparent = true
  glassMaterial.opacity = 0.34
  glassMaterial.depthWrite = false
  return {
    handles: [shell, shellShade, graphite, ink, steel, amber, amberDim, glass, blue],
    materials: {
      shell: tuneMaterial(shell, 0xb9bec0, 0.46, 0.28, { clearcoat: 0.13 }),
      shellShade: tuneMaterial(shellShade, 0x737d82, 0.52, 0.42, { clearcoat: 0.08 }),
      graphite: tuneMaterial(graphite, 0x252d34, 0.48, 0.6, { clearcoat: 0.12 }),
      ink: tuneMaterial(ink, 0x070a0d, 0.72, 0.18),
      steel: tuneMaterial(steel, 0x899398, 0.3, 0.88, { clearcoat: 0.12 }),
      amber: tuneMaterial(amber, 0xd24f00, 0.2, 0.03, { emissive: 1.0, clearcoat: 0.55 }),
      amberDim: tuneMaterial(amberDim, 0x6b2401, 0.3, 0.06, { emissive: 0.35, clearcoat: 0.52 }),
      glass: glassMaterial,
      blue: tuneMaterial(blue, 0x356dff, 0.24, 0.04, { emissive: 1.4 }),
    },
  }
}

function box(
  parent: Group,
  material: MeshPhysicalMaterial,
  size: Vec3,
  position: Vec3,
  rotation: Vec3 = [0, 0, 0],
  chamfer = 0.08,
  bevel = 0.025,
): Mesh {
  const mesh = prism(material, size, position, {
    chamfer,
    fillet: Math.min(chamfer * 0.31, 0.055),
    bevel,
    rotation,
  })
  parent.add(mesh)
  return mesh
}

function cylinderZ(
  parent: Group,
  material: MeshPhysicalMaterial,
  radius: number,
  depth: number,
  position: Vec3,
  segments = 12,
): Mesh {
  const mesh = new Mesh(new CylinderGeometry(radius, radius, depth, segments, 1, false), material)
  mesh.rotation.x = Math.PI / 2
  mesh.position.set(...position)
  parent.add(mesh)
  return mesh
}

function cylinderX(
  parent: Group,
  material: MeshPhysicalMaterial,
  radius: number,
  depth: number,
  position: Vec3,
  segments = 12,
): Mesh {
  const mesh = new Mesh(new CylinderGeometry(radius, radius, depth, segments, 1, false), material)
  mesh.rotation.z = Math.PI / 2
  mesh.position.set(...position)
  parent.add(mesh)
  return mesh
}

function slab(
  parent: Group,
  material: MeshPhysicalMaterial,
  size: Vec3,
  position: Vec3,
): Mesh {
  const mesh = new Mesh(new BoxGeometry(...size), material)
  mesh.position.set(...position)
  parent.add(mesh)
  return mesh
}

function octagonalRing(
  parent: Group,
  material: MeshPhysicalMaterial,
  outerX: number,
  outerY: number,
  innerX: number,
  innerY: number,
  cut: number,
  depth: number,
  z: number,
): Group {
  const frame = new Group()
  frame.position.z = z + depth * 0.5
  parent.add(frame)
  const horizontal = Math.max(0.04, outerY - innerY)
  const vertical = Math.max(0.04, outerX - innerX)
  const cornerWidth = Math.max(horizontal, vertical)
  const cornerLength = cut * Math.SQRT2 + cornerWidth * 0.25
  const bevel = Math.min(0.025, cornerWidth * 0.14)
  const chamfer = Math.min(0.05, cornerWidth * 0.24)
  for (const side of [-1, 1] as const) {
    box(frame, material, [2 * (outerX - cut), horizontal, depth], [0, side * (outerY + innerY) * 0.5, 0], [0, 0, 0], chamfer, bevel)
    box(frame, material, [vertical, 2 * (outerY - cut), depth], [side * (outerX + innerX) * 0.5, 0, 0], [0, 0, 0], chamfer, bevel)
    for (const top of [-1, 1] as const) {
      box(
        frame,
        material,
        [cornerLength, cornerWidth, depth],
        [side * (outerX - cut * 0.5), top * (outerY - cut * 0.5), 0],
        [0, 0, -side * top * Math.PI / 4],
        chamfer,
        bevel,
      )
    }
  }
  return frame
}

function addBoltZ(parent: Group, m: FloodlightMaterials, x: number, y: number, z: number, radius = 0.055): void {
  cylinderZ(parent, m.ink, radius, 0.055, [x, y, z], 10)
  cylinderZ(parent, m.steel, radius * 0.46, 0.062, [x, y, z + 0.035], 8)
}

function addBase(parent: Group, m: FloodlightMaterials): void {
  // A broad, continuous footprint holds the full pan load; four separate pads
  // touch y=0 and visibly key into the lower armor rather than hovering below it.
  for (const [x, z] of [[-2.68, -1.03], [2.68, -1.03], [-2.68, 1.03], [2.68, 1.03]] as const) {
    box(parent, m.ink, [1.12, 0.2, 0.72], [x, 0.1, z], [0, 0, 0], 0.12, 0.03)
  }
  box(parent, m.graphite, [6.35, 0.38, 2.82], [0, 0.28, 0], [0, 0, 0], 0.2, 0.045)
  box(parent, m.shell, [5.92, 0.38, 2.48], [0, 0.58, 0], [0, 0, 0], 0.22, 0.05)
  box(parent, m.graphite, [4.8, 0.14, 2.2], [0, 0.82, 0], [0, 0, 0], 0.14, 0.035)
  const turntable = new Mesh(new CylinderGeometry(1.62, 1.72, 0.38, 12, 1, false), m.ink)
  turntable.position.y = 0.91
  parent.add(turntable)
  const race = new Mesh(new TorusGeometry(1.6, 0.085, 6, 28), m.steel)
  race.rotation.x = Math.PI / 2
  race.position.y = 1.06
  parent.add(race)

  // Front service cassette, blue identity light, and actual recessed connector.
  box(parent, m.graphite, [2.42, 0.34, 0.18], [0.38, 0.48, 1.48], [0, 0, 0], 0.1, 0.026)
  box(parent, m.ink, [1.42, 0.13, 0.08], [0.38, 0.48, 1.6], [0, 0, 0], 0.045, 0.012)
  box(parent, m.blue, [1.0, 0.06, 0.035], [0.38, 0.48, 1.66], [0, 0, 0], 0.018, 0.005)
  box(parent, m.graphite, [0.84, 0.46, 0.2], [-1.15, 0.76, 1.3], [0, 0, 0], 0.09, 0.022)
  box(parent, m.ink, [0.52, 0.2, 0.06], [-1.15, 0.76, 1.43], [0, 0, 0], 0.04, 0.01)
  for (const x of [-1.28, -1.15, -1.02]) box(parent, m.amber, [0.045, 0.12, 0.035], [x, 0.76, 1.48], [0, 0, 0], 0.01, 0.003)

  for (const x of [-2.72, 2.72]) {
    for (const z of [-1.23, 1.23]) addBoltZ(parent, m, x, 0.5, z + (z > 0 ? 0.19 : -0.19), 0.07)
  }
}

function addYoke(parent: Group, m: FloodlightMaterials): void {
  // The lower bridge and both arms form one continuous U-shaped load path.
  box(parent, m.graphite, [5.92, 0.48, 1.64], [0, 0.24, -0.08], [0, 0, 0], 0.17, 0.042)
  for (const side of [-1, 1] as const) {
    box(parent, m.graphite, [0.9, 2.5, 1.34], [side * 3.04, 1.1, -0.08], [0, 0, side * -0.12], 0.16, 0.04)
    box(parent, m.shellShade, [0.38, 1.58, 0.22], [side * 3.02, 1.16, 0.69], [0, 0, side * -0.12], 0.1, 0.025)
    box(parent, m.shell, [0.56, 0.78, 1.18], [side * 3.07, 0.18, -0.02], [0, 0, side * -0.12], 0.12, 0.03)
    for (const z of [-0.47, 0.47]) {
      box(parent, m.graphite, [0.4, 1.76, 0.34], [side * 3.12, 1.08, z], [0, 0, side * -0.12], 0.09, 0.024)
    }
    cylinderX(parent, m.graphite, 0.66, 0.68, [side * 3.0, 2.04, 0], 16)
    cylinderX(parent, m.steel, 0.54, 0.72, [side * 3.02, 2.04, 0], 16)
    cylinderX(parent, m.ink, 0.34, 0.78, [side * 3.03, 2.04, 0], 14)
    const bearingRing = new Mesh(new TorusGeometry(0.49, 0.075, 6, 18), m.graphite)
    bearingRing.rotation.y = Math.PI / 2
    bearingRing.position.set(side * 3.4, 2.04, 0)
    parent.add(bearingRing)
    box(parent, m.amberDim, [0.06, 0.36, 0.08], [side * 3.34, 0.72, 0.67], [0, 0, side * -0.12], 0.014, 0.004)
  }

  // The left motor casing breaks symmetry exactly where the reference carries
  // its large drive bearing. Every layer intersects the yoke or the axle.
  cylinderX(parent, m.shell, 0.82, 0.42, [-3.28, 2.04, 0], 16)
  cylinderX(parent, m.graphite, 0.62, 0.54, [-3.5, 2.04, 0], 16)
  cylinderX(parent, m.ink, 0.42, 0.6, [-3.75, 2.04, 0], 16)
  const motorRing = new Mesh(new TorusGeometry(0.55, 0.09, 6, 20), m.graphite)
  motorRing.rotation.y = Math.PI / 2
  motorRing.position.set(-3.78, 2.04, 0)
  parent.add(motorRing)
}

function addLampCell(parent: Group, m: FloodlightMaterials, x: number, y: number): void {
  // The black well is behind both outer rim planes. Reflector and emitter step
  // forward inside it, but remain below the protective glass and armor lip.
  cylinderZ(parent, m.ink, 0.4, 0.26, [x, y, 1.46], 8)
  const cup = new Mesh(new CylinderGeometry(0.32, 0.15, 0.22, 8, 1, true), m.amberDim)
  cup.rotation.x = Math.PI / 2
  cup.position.set(x, y, 1.58)
  parent.add(cup)
  const bezel = new Mesh(new TorusGeometry(0.34, 0.055, 5, 8), m.ink)
  bezel.position.set(x, y, 1.7)
  parent.add(bezel)
  const reflector = new Mesh(new TorusGeometry(0.23, 0.034, 4, 8), m.amber)
  reflector.position.set(x, y, 1.68)
  parent.add(reflector)
  cylinderZ(parent, m.amber, 0.12, 0.065, [x, y, 1.68], 12)
  cylinderZ(parent, m.steel, 0.04, 0.072, [x, y, 1.725], 8)
}

function addHead(parent: Group, m: FloodlightMaterials): void {
  // Deep faceted shell, not a decorated slab. The axis runs through both side
  // bearing shoulders at local y=0, keeping the animated pitch mechanically valid.
  // Closed multi-panel hull: broad faces carry the volume while four diagonal
  // corner rails taper the section. Unlike a radial cylinder cap, none of
  // these pieces can triangulate across the front aperture.
  slab(parent, m.shell, [4.72, 2.2, 2.8], [0, 0, 0])
  slab(parent, m.shell, [4.72, 0.3, 2.8], [0, 1.25, 0])
  slab(parent, m.shellShade, [4.72, 0.3, 2.8], [0, -1.25, 0])
  slab(parent, m.shell, [0.3, 1.78, 2.8], [-2.51, 0, 0])
  slab(parent, m.shellShade, [0.3, 1.78, 2.8], [2.51, 0, 0])
  for (const side of [-1, 1] as const) {
    for (const top of [-1, 1] as const) {
      box(parent, top > 0 ? m.shell : m.shellShade, [0.52, 0.28, 2.8], [side * 2.4, top * 1.17, 0], [0, 0, -side * top * Math.PI / 4], 0.06, 0.018)
    }
  }
  slab(parent, m.shellShade, [5.02, 2.48, 0.14], [0, 0, -1.43])
  // This nose must be an actual open frame. A capped octagonal drum would sit
  // in front of the lamps and create view-dependent triangular occlusion.
  octagonalRing(parent, m.graphite, 2.55, 1.34, 2.26, 1.08, 0.34, 0.28, 1.12)

  // Real aperture stack: rear well, cell plane, protective glass, two deep rings.
  // Deep graphite throat behind the eight independent reflector wells.
  slab(parent, m.ink, [4.3, 1.76, 0.16], [0.25, 0, 1.45])
  for (const y of [-0.47, 0.47]) {
    for (const x of [-1.25, -0.42, 0.42, 1.25]) addLampCell(parent, m, x + 0.25, y)
  }
  // Preserve CylinderGeometry's Dawn-safe cap topology, but remap its circular
  // rim to an exact chamfered rectangle. This is one aligned pane, not eight
  // separate lens decals and not a rotated ellipse crossing the bezel.
  const canopyGeometry = new CylinderGeometry(1, 1, 0.055, 8, 1, false)
  const canopyPositions = canopyGeometry.getAttribute('position')
  const canopyOutline: Array<[number, number]> = [
    [1.84, 0.48], [1.64, 0.68], [-1.64, 0.68], [-1.84, 0.48],
    [-1.84, -0.48], [-1.64, -0.68], [1.64, -0.68], [1.84, -0.48],
  ]
  for (let index = 0; index < canopyPositions.count; index += 1) {
    const x = canopyPositions.getX(index)
    const z = canopyPositions.getZ(index)
    if (Math.hypot(x, z) < 0.5) continue
    const angle = (Math.atan2(z, x) + Math.PI * 2) % (Math.PI * 2)
    const outlineIndex = Math.round(angle / (Math.PI / 4)) % 8
    const [mappedX, mappedZ] = canopyOutline[outlineIndex]
    canopyPositions.setXYZ(index, mappedX, canopyPositions.getY(index), mappedZ)
  }
  canopyPositions.needsUpdate = true
  canopyGeometry.computeVertexNormals()
  const canopy = new Mesh(canopyGeometry, m.glass)
  canopy.rotation.x = Math.PI / 2
  canopy.position.set(0.25, 0, 1.825)
  parent.add(canopy)
  // Amber glass is represented by its thick protective edge seal. Dawn's
  // transparent sorting is deliberately avoided here because a single clear
  // pane can self-occlude half the eight-cell bank in deterministic captures.
  for (const y of [-0.76, 0.76]) box(parent, m.amberDim, [3.78, 0.1, 0.08], [0.25, y, 1.82], [0, 0, 0], 0.024, 0.007)
  for (const x of [-1.66, 2.16]) box(parent, m.amberDim, [0.1, 1.46, 0.08], [x, 0, 1.82], [0, 0, 0], 0.024, 0.007)
  octagonalRing(parent, m.steel, 2.22, 1.06, 2.01, 0.85, 0.28, 0.12, 1.48)
  octagonalRing(parent, m.graphite, 2.54, 1.34, 2.21, 1.05, 0.33, 0.22, 1.55)
  octagonalRing(parent, m.shellShade, 2.68, 1.47, 2.51, 1.31, 0.38, 0.15, 1.68)
  for (const [x, y] of [[-2.18, -1.04], [2.18, -1.04], [-2.18, 1.04], [2.18, 1.04]] as const) addBoltZ(parent, m, x, y, 1.83, 0.065)

  // Reference-identifying marker LEDs sit inside their own top/bottom ledges.
  box(parent, m.graphite, [2.25, 0.22, 0.18], [0.25, 1.0, 1.48], [0, 0, 0], 0.06, 0.014)
  box(parent, m.graphite, [2.25, 0.22, 0.18], [0.25, -1.0, 1.48], [0, 0, 0], 0.06, 0.014)
  for (const y of [-1.0, 1.0]) {
    for (const x of [-0.35, -0.12, 0.12, 0.35]) box(parent, m.amber, [0.09, 0.08, 0.055], [x + 0.25, y, 1.61], [0, 0, 0], 0.016, 0.004)
  }

  // Side vents are thick louvers seated into a recessed intake, with enough
  // depth to stay legible from the side diagnostics.
  box(parent, m.graphite, [0.18, 0.9, 0.88], [-2.64, 0.45, -0.06], [0, 0, 0], 0.06, 0.016)
  for (let index = -2; index <= 2; index += 1) {
    box(parent, m.ink, [0.09, 0.13, 0.72], [-2.75, 0.45 + index * 0.16, -0.03], [0, 0, -0.2], 0.02, 0.006)
  }
  box(parent, m.graphite, [0.16, 1.1, 1.12], [-2.64, -0.45, -0.18], [0, 0, 0], 0.07, 0.018)
  box(parent, m.shellShade, [0.09, 0.72, 0.72], [-2.74, -0.45, -0.12], [0, 0, 0], 0.045, 0.012)
  box(parent, m.graphite, [1.48, 0.16, 0.78], [-0.55, 1.3, -0.08], [0, 0, 0], 0.07, 0.018)
  for (let index = -3; index <= 3; index += 1) {
    box(parent, m.ink, [0.1, 0.1, 0.62], [-0.55 + index * 0.17, 1.36, -0.06], [0, 0, 0], 0.016, 0.004)
  }

  // Rear service anatomy and cooling ribs remain fully attached to the shell.
  box(parent, m.shellShade, [3.86, 1.88, 0.16], [0.1, 0, -1.54], [0, 0, 0], 0.25, 0.04)
  box(parent, m.graphite, [2.78, 1.18, 0.14], [0.1, 0, -1.67], [0, 0, 0], 0.16, 0.03)
  for (let index = -3; index <= 3; index += 1) {
    box(parent, m.ink, [0.12, 0.78, 0.08], [0.1 + index * 0.31, 0, -1.78], [0, 0, 0], 0.018, 0.005)
  }
  for (const [x, y] of [[-1.55, -0.72], [1.75, -0.72], [-1.55, 0.72], [1.75, 0.72]] as const) addBoltZ(parent, m, x, y, -1.64, 0.06)

  // Head shoulders overlap the shafts: no air gap can appear during pitch.
  for (const side of [-1, 1] as const) {
    cylinderX(parent, m.shellShade, 0.62, 0.48, [side * 2.48, 0, -0.03], 16)
    cylinderX(parent, m.graphite, 0.43, 0.62, [side * 2.66, 0, -0.03], 14)
  }

  // Restrained localized edge damage: short steel exposures are recessed into
  // the top and lower nose rails, never scattered as floating scratch decals.
  for (const [x, y, width] of [[-1.55, 1.255, 0.38], [1.2, 1.255, 0.3], [-1.2, -1.255, 0.28]] as const) {
    box(parent, m.steel, [width, 0.035, 0.16], [x, y, 0.66], [0, 0, 0], 0.012, 0.004)
  }
}

function mergeWearBatch(
  group: Group,
  m: FloodlightMaterials,
  wearMaterial: MeshPhysicalMaterial,
  label: string,
): Array<{ dispose: () => void }> {
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [m.shell, { rub: 0.5, grime: 0.46, scratch: 0.085 }],
    [m.shellShade, { rub: 0.42, grime: 0.54, scratch: 0.07 }],
    [m.graphite, { rub: 0.3, grime: 0.62, scratch: 0.055 }],
    [m.ink, { rub: 0.24, grime: 0.68, scratch: 0.035 }],
    [m.steel, { rub: 0.22, grime: 0.42, scratch: 0.045 }],
  ])
  bakeOcclusion(group, { reach: 0.22 })
  bakeSurfaceAttributes(group, profiles)
  group.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return
    if (profiles.has(object.material as MeshPhysicalMaterial)) object.material = wearMaterial
  })
  return mergeStaticByMaterial(group, {
    retainedAttributes: (material) => material === wearMaterial ? WEAR_ATTRIBUTES : [],
    meshName: (material) => `military-tactical-floodlight / ${label} / ${material.name}`,
  })
}

function build(): {
  root: Group
  azimuth: Group
  elevation: Group
  materials: FloodlightMaterials
  handles: MaterialHandle[]
  wearMaterial: MeshPhysicalMaterial
  geometries: Array<{ dispose: () => void }>
} {
  const acquired = acquireMaterials()
  const root = new Group()
  root.name = 'military-tactical-floodlight'
  const baseStatic = new Group()
  const azimuth = new Group()
  const yokeStatic = new Group()
  const elevation = new Group()
  const headStatic = new Group()
  root.add(baseStatic, azimuth)
  azimuth.position.y = 1.0
  azimuth.add(yokeStatic, elevation)
  elevation.position.y = 2.04
  elevation.add(headStatic)
  addBase(baseStatic, acquired.materials)
  addYoke(yokeStatic, acquired.materials)
  addHead(headStatic, acquired.materials)

  root.updateMatrixWorld(true)
  const wearMaterial = createWearMaterial({
    name: 'military-tactical-floodlight / baked localized wear',
    clearcoat: 0.13,
    clearcoatRoughness: 0.48,
  })
  const geometries = [
    ...mergeWearBatch(baseStatic, acquired.materials, wearMaterial, 'base'),
    ...mergeWearBatch(yokeStatic, acquired.materials, wearMaterial, 'yoke'),
    ...mergeWearBatch(headStatic, acquired.materials, wearMaterial, 'head'),
  ]
  return { root, azimuth, elevation, materials: acquired.materials, handles: acquired.handles, wearMaterial, geometries }
}

export function createModel(): FloodlightController {
  const rig = build()
  let enabled = false
  let elapsed = 0
  const applyTracking = (value: boolean) => { enabled = value }
  trackingListeners.add(applyTracking)
  return {
    root: rig.root,
    update: (deltaSeconds) => {
      if (!enabled) return
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      rig.azimuth.rotation.y = Math.sin(elapsed * 0.27) * 0.28
      rig.elevation.rotation.x = Math.sin(elapsed * 0.34 + 0.55) * 0.085
      rig.materials.amber.emissiveIntensity = 0.98 + Math.sin(elapsed * 1.05) * 0.08
    },
    toggleTracking: (value = !enabled) => {
      enabled = value
      return enabled
    },
    dispose: () => {
      trackingListeners.delete(applyTracking)
      for (const geometry of rig.geometries) geometry.dispose()
      rig.wearMaterial.dispose()
      for (const handle of rig.handles) handle.release()
    },
  }
}

function previewCamera(aspect: number, position: Vec3, target: Vec3, fov = 32): PerspectiveCamera {
  const camera = new PerspectiveCamera(fov, aspect, 0.18, 100)
  camera.position.set(...position)
  camera.lookAt(...target)
  return camera
}

function makePreview(options: { aspect: number }, view: 'beauty' | 'side' | 'rear' | 'low' | 'tracking'): FloodlightPreview {
  const controller = createModel()
  if (view === 'tracking') {
    controller.toggleTracking(true)
    for (let index = 0; index < 135; index += 1) controller.update(1 / 30)
  }
  const scene = new Scene()
  scene.background = new Color(0x010204)
  scene.add(controller.root, new HemisphereLight(0xb5c5cd, 0x050608, 0.78))
  const key = new DirectionalLight(0xfff1dc, 3.0); key.position.set(-8, 12, 13)
  const fill = new DirectionalLight(0x7d99bb, 1.05); fill.position.set(10, 7, 9)
  const rim = new DirectionalLight(0x9ab7c8, 1.18); rim.position.set(8, 10, -12)
  scene.add(key, fill, rim)
  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const camera = view === 'side'
    ? previewCamera(aspect, [10.8, 4.25, 0.2], [0, 2.65, 0.2], 34)
    : view === 'rear'
      ? previewCamera(aspect, [8.7, 5.3, -11.2], [0, 2.55, 0], 33)
      : view === 'low'
        ? previewCamera(aspect, [-8.8, 1.0, 10.8], [0, 2.35, 0.25], 34)
        : view === 'tracking'
          ? previewCamera(aspect, [-8.4, 5.5, 10.2], [0, 2.65, 0.3], 32)
          : previewCamera(aspect, [-8.7, 6.25, 11.4], [0, 2.58, 0.3], 32)
  scene.add(camera)
  return {
    scene,
    root: controller.root,
    camera,
    update: controller.update,
    toggleTracking: controller.toggleTracking,
    dispose: () => { scene.remove(controller.root); controller.dispose() },
  }
}

export function createPreview(options: { aspect: number }): FloodlightPreview { return makePreview(options, 'beauty') }
export function createSidePreview(options: { aspect: number }): FloodlightPreview { return makePreview(options, 'side') }
export function createRearPreview(options: { aspect: number }): FloodlightPreview { return makePreview(options, 'rear') }
export function createLowPreview(options: { aspect: number }): FloodlightPreview { return makePreview(options, 'low') }
export function createTrackingPreview(options: { aspect: number }): FloodlightPreview { return makePreview(options, 'tracking') }
