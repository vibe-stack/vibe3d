import {
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshPhysicalMaterial,
  PlaneGeometry,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  SpriteNodeMaterial,
} from 'three/webgpu'
import {
  instancedBufferAttribute,
  clamp,
  mix,
  oneMinus,
  positionView,
  saturate,
  smoothstep,
  sin,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
  float,
} from 'three/tsl'

import {
  bakeOcclusion,
  bakeSurfaceAttributes,
  createSmokeTexture,
  createWearMaterial,
  mergeStaticByMaterial,
  MaterialLibrary,
  tuneMaterial,
  WEAR_ATTRIBUTES,
  type WearProfile,
  type MaterialHandle,
  cylinder,
  downTriangle,
  flatPlate,
  prism,
  type Corners,
  type Vec3,
} from '../../../src/asset-forge/generator/index.ts'

/**
 * Reference proportions, solved from the reference render rather than guessed.
 * The case is roughly twice as wide as it is tall, about half as deep as it is
 * wide, and the handle rises a little over a quarter of the case height. Every
 * mass is expressed against these numbers so proportions survive detail edits.
 */
const WIDTH = 6
const DEPTH = 2.78
const HEIGHT = 2.92
const HANDLE_RISE = 0.9

const BUMPER_TOP = 0.58
const DOOR_BOTTOM = 0.62
const DOOR_TOP = 1.96
const CHANNEL_Y = 2.08
const LID_BOTTOM = 2.28

const BODY_W = 5.62
const BODY_D = 2.5
const LID_W = 5.86
const LID_D = 2.7

const BUMPER_FRONT = DEPTH / 2
const DOOR_FRONT = BODY_D / 2 + 0.09
const LID_FRONT = LID_D / 2

interface ToolboxMaterials {
  shell: MeshPhysicalMaterial
  shellLight: MeshPhysicalMaterial
  shellShadow: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  graphiteEdge: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  interior: MeshPhysicalMaterial
  interiorEdge: MeshPhysicalMaterial
  rubber: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  yellow: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
}

interface SteamSprites {
  geometry: PlaneGeometry
  count: number
}

function createSteamSprites(): SteamSprites {
  const originSizes: number[] = []
  const directionDelays: number[] = []
  const alphaSeeds: number[] = []

  const seamY = LID_BOTTOM - 0.035
  const frontZ = LID_FRONT + 0.025
  const backZ = -LID_FRONT - 0.025
  const sideX = LID_W * 0.5 + 0.025
  const seamCornerRadius = 0.22
  const straightHalfWidth = sideX - seamCornerRadius
  const straightHalfDepth = frontZ - seamCornerRadius
  const outwardFront: Vec3 = [0, 0.18, 1]
  const outwardBack: Vec3 = [0, 0.18, -1]
  const outwardLeft: Vec3 = [-1, 0.18, 0]
  const outwardRight: Vec3 = [1, 0.18, 0]

  let seed = 0.08
  const emit = (
    origin: Vec3,
    direction: Vec3,
    size: number,
    alpha: number,
    delay: number,
  ): void => {
    originSizes.push(...origin, size)
    directionDelays.push(...direction, delay)
    const densityVariation = 0.58 + (Math.sin(seed * 18.7) * 0.5 + 0.5) * 0.42
    alphaSeeds.push(alpha * densityVariation, seed)
    seed += 0.17
  }

  const emitPlume = (origin: Vec3, direction: Vec3): void => {
    // Every seam segment gets its own pressure delay. That stagger is what
    // prevents the perimeter from reading as one synchronized expanding ring.
    const plumeDelay = 0.08 + (Math.sin(seed * 7.13) * 0.5 + 0.5) * 0.42
    // Seven small overlapping layers turn each delayed segment into a connected
    // jet. The later layers begin farther out and a few frames later.
    for (const [distance, size, alpha, delay] of [
      [0, 0.34, 0.2, 0],
      [0.1, 0.4, 0.18, 0.035],
      [0.2, 0.46, 0.16, 0.07],
      [0.32, 0.54, 0.14, 0.11],
      [0.46, 0.62, 0.12, 0.15],
      [0.62, 0.72, 0.1, 0.2],
      [0.78, 0.82, 0.08, 0.25],
    ] as const) {
      const perpendicularJitter = Math.sin(seed * 12.9898) * 0.1
      const verticalJitter = Math.cos(seed * 78.233) * 0.045
      const perpendicular: Vec3 = [-direction[2], 0, direction[0]]
      emit(
        [
          origin[0] + direction[0] * distance + perpendicular[0] * perpendicularJitter,
          origin[1] + direction[1] * distance + verticalJitter,
          origin[2] + direction[2] * distance + perpendicular[2] * perpendicularJitter,
        ],
        direction,
        size,
        alpha,
        delay + plumeDelay,
      )
    }
  }

  // Seven overlapping layers per segment, camera-facing so orbiting never
  // turns the effect into edge-on strips. Their centers travel along seam
  // normals, with enough segments to read as one continuous perimeter burst.
  for (const x of [-straightHalfWidth, -2.28, -1.82, -1.36, -0.9, -0.45, 0, 0.45, 0.9, 1.36, 1.82, 2.28, straightHalfWidth]) {
    emitPlume([x, seamY, frontZ], outwardFront)
    emitPlume([x, seamY, backZ], outwardBack)
  }
  for (const z of [-straightHalfDepth, -0.77, -0.38, 0, 0.38, 0.77, straightHalfDepth]) {
    emitPlume([-sideX, seamY, z], outwardLeft)
    emitPlume([sideX, seamY, z], outwardRight)
  }

  // Fill the four rounded lid corners with blended seam normals. This keeps
  // the vapor flowing around the actual radius instead of snapping from front
  // to side directions at a square corner.
  for (const side of [-1, 1] as const) {
    for (const depth of [-1, 1] as const) {
      for (const turn of [0.2, 0.4, 0.6, 0.8]) {
        const angle = turn * Math.PI * 0.5
        const normalX = side * Math.sin(angle)
        const normalZ = depth * Math.cos(angle)
        emitPlume(
          [
            side * straightHalfWidth + normalX * seamCornerRadius,
            seamY,
            depth * straightHalfDepth + normalZ * seamCornerRadius,
          ],
          [normalX, 0.18, normalZ],
        )
      }
    }
  }

  const geometry = new PlaneGeometry(1, 1)
  geometry.setAttribute(
    'smokeOriginSize',
    new InstancedBufferAttribute(new Float32Array(originSizes), 4),
  )
  geometry.setAttribute(
    'smokeDirectionDelay',
    new InstancedBufferAttribute(new Float32Array(directionDelays), 4),
  )
  geometry.setAttribute('smokeAlphaSeed', new InstancedBufferAttribute(new Float32Array(alphaSeeds), 2))
  return { geometry, count: alphaSeeds.length / 2 }
}

function recessedBolt(parent: Group, m: ToolboxMaterials, position: Vec3, radius: number): void {
  const [x, y, z] = position
  parent.add(cylinder(m.ink, radius * 1.4, 0.03, [x, y, z - 0.008], [Math.PI / 2, 0, 0]))
  parent.add(cylinder(m.graphiteEdge, radius, 0.036, [x, y, z + 0.008], [Math.PI / 2, 0, 0]))
}

function deckBolt(parent: Group, m: ToolboxMaterials, x: number, z: number, y: number): void {
  parent.add(cylinder(m.ink, 0.1, 0.03, [x, y - 0.004, z]))
  parent.add(cylinder(m.graphiteEdge, 0.062, 0.034, [x, y + 0.004, z]))
}

/**
 * The chunky diagonal hatch cut in a door corner. Stepped slot lengths keep it
 * reading as a stencilled marking rather than a repeated array.
 */
function hatchPatch(parent: Group, m: ToolboxMaterials, centre: Vec3, side: -1 | 1, scale = 1): void {
  const [x, y, z] = centre
  const lengths = [0.32, 0.27, 0.2]
  for (const [index, length] of lengths.entries()) {
    const offset = (index - 1) * 0.105 * scale
    const slot = prism(m.ink, [length * scale, 0.075 * scale, 0.05], [x + offset * side, y - offset, z - 0.008], {
      fillet: 0.02,
      bevel: 0.012,
      rotation: [0, 0, side * 0.72],
    })
    slot.userData.grooveCross = 'y'
    parent.add(slot)
  }
}

/** The engraved corner arrow above each hatch patch: two chunky cut arms. */
function cornerArrow(parent: Group, m: ToolboxMaterials, centre: Vec3, side: -1 | 1, scale = 1): void {
  const [x, y, z] = centre
  parent.add(flatPlate(m.ink, [0.34 * scale, 0.05 * scale], [x, y + 0.12 * scale, z], [0, 0, side * 0.66]))
  parent.add(flatPlate(m.ink, [0.24 * scale, 0.05 * scale], [x + 0.05 * side * scale, y - 0.05 * scale, z]))
}

function addDoor(parent: Group, m: ToolboxMaterials, side: -1 | 1): void {
  const cx = side * 1.44
  const cy = (DOOR_BOTTOM + DOOR_TOP) * 0.5
  const height = DOOR_TOP - DOOR_BOTTOM
  const inner = -side

  // Dark recessed gap, then the armor plate standing proud of it so the plate
  // edge casts a real shadow line instead of sitting flush.
  parent.add(prism(m.ink, [2.68, height + 0.08, 0.08], [cx, cy, DOOR_FRONT - 0.05], { chamfer: 0.14, fillet: 0.04 }))
  const plateCorners: Corners = side === 1 ? [0.3, 0.1, 0.12, 0.34] : [0.1, 0.3, 0.34, 0.12]
  parent.add(
    prism(m.shell, [2.6, height + 0.02, 0.14], [cx, cy, DOOR_FRONT + 0.055], {
      chamfer: plateCorners,
      fillet: 0.05,
      bevel: 0.035,
    }),
  )

  // Vertical service slot, placed off-centre rather than at the plate midpoint.
  parent.add(flatPlate(m.shellShadow, [0.11, 0.24], [cx + side * 0.62, cy + 0.3, DOOR_FRONT + 0.148]))

  cornerArrow(parent, m, [cx + inner * 0.74, cy + 0.38, DOOR_FRONT + 0.148], inner as -1 | 1)
  hatchPatch(parent, m, [cx + inner * 0.66, cy - 0.36, DOOR_FRONT + 0.127], inner as -1 | 1, 1)
  hatchPatch(parent, m, [cx + side * 0.84, cy - 0.32, DOOR_FRONT + 0.127], side, 0.78)

  // Signature glow: a long amber lens seated in a dark channel at the door head.
  // The lens face has to clear the plate, or it disappears behind the armor.
  parent.add(
    prism(m.ink, [2.54, 0.21, 0.18], [cx, CHANNEL_Y, DOOR_FRONT + 0.02], { chamfer: 0.07, fillet: 0.03, bevel: 0.02 }),
  )
  parent.add(
    prism(m.graphiteEdge, [2.48, 0.14, 0.06], [cx, CHANNEL_Y, DOOR_FRONT + 0.1], { chamfer: 0.05, fillet: 0.025, bevel: 0.014 }),
  )
  parent.add(
    prism(m.amber, [2.34, 0.085, 0.03], [cx, CHANNEL_Y, DOOR_FRONT + 0.14], { chamfer: 0.035, fillet: 0.02, bevel: 0.008 }),
  )
}

function addLatchColumn(parent: Group, m: ToolboxMaterials): void {
  const front = DOOR_FRONT + 0.11
  const span = DOOR_TOP - BUMPER_TOP + 0.44

  parent.add(prism(m.ink, [0.86, span + 0.08, 0.22], [0, 1.34, DOOR_FRONT + 0.02], { chamfer: 0.07, fillet: 0.03, bevel: 0.02 }))
  parent.add(prism(m.graphite, [0.7, span, 0.2], [0, 1.34, front], { chamfer: 0.07, fillet: 0.035, bevel: 0.026 }))
  parent.add(prism(m.graphite, [0.62, 0.52, 0.26], [0, 2.22, LID_FRONT - 0.02], { chamfer: 0.09, fillet: 0.04, bevel: 0.028 }))
  parent.add(prism(m.graphiteEdge, [0.46, 0.1, 0.14], [0, 2.44, LID_FRONT + 0.03], { fillet: 0.035, bevel: 0.02 }))

  for (const side of [-1, 1] as const) {
    parent.add(
      prism(m.shellShadow, [0.08, span - 0.14, 0.14], [side * 0.47, 1.32, front - 0.02], { fillet: 0.028, bevel: 0.018 }),
    )
  }

  // Top lens, arrow, dark recess, and the yellow release tab, in reference order.
  parent.add(prism(m.ink, [0.5, 0.3, 0.06], [0, 1.66, front + 0.1], { chamfer: 0.05, fillet: 0.03, bevel: 0.018 }))
  parent.add(prism(m.amber, [0.42, 0.135, 0.03], [0, 1.66, front + 0.142], { chamfer: 0.045, fillet: 0.03, bevel: 0.012 }))
  parent.add(prism(m.ink, [0.5, 0.32, 0.06], [0, 1.29, front + 0.1], { chamfer: 0.05, fillet: 0.03, bevel: 0.018 }))
  parent.add(downTriangle(m.amber, 0.24, 0.18, [0, 1.29, front + 0.168]))
  parent.add(prism(m.ink, [0.5, 0.36, 0.06], [0, 0.92, front + 0.1], { chamfer: 0.05, fillet: 0.03, bevel: 0.018 }))
  parent.add(prism(m.graphiteEdge, [0.62, 0.24, 0.14], [0, 0.64, front + 0.06], { chamfer: 0.05, fillet: 0.032, bevel: 0.02 }))
  parent.add(prism(m.yellow, [0.5, 0.11, 0.07], [0, 0.64, front + 0.15], { chamfer: 0.03, fillet: 0.025, bevel: 0.014 }))
}

function addBodyShell(parent: Group, m: ToolboxMaterials): void {
  const outerWidth = BODY_W + 0.12
  const outerDepth = BODY_D + 0.12
  const bottom = BUMPER_TOP - 0.24
  const top = LID_BOTTOM - 0.04
  const wallThickness = 0.22
  const wallHeight = top - bottom
  const wallY = (bottom + top) * 0.5
  const frontBackZ = outerDepth * 0.5 - wallThickness * 0.5
  const sideX = outerWidth * 0.5 - wallThickness * 0.5
  const sideDepth = outerDepth - wallThickness * 2

  // Four walls leave a real opening under the lid. The front wall stays behind
  // the service doors, while the side and rear walls carry the outer silhouette.
  parent.add(prism(m.shell, [outerWidth, wallHeight, wallThickness], [0, wallY, frontBackZ], { chamfer: 0.2, fillet: 0.05, bevel: 0.04 }))
  parent.add(prism(m.shell, [outerWidth, wallHeight, wallThickness], [0, wallY, -frontBackZ], { chamfer: 0.2, fillet: 0.05, bevel: 0.04 }))
  parent.add(prism(m.shell, [wallThickness, wallHeight, sideDepth], [sideX, wallY, 0], { chamfer: 0.16, fillet: 0.05, bevel: 0.04 }))
  parent.add(prism(m.shell, [wallThickness, wallHeight, sideDepth], [-sideX, wallY, 0], { chamfer: 0.16, fillet: 0.05, bevel: 0.04 }))

  // A low structural base closes the bottom of the shell without filling the
  // volume above it, so the cavity has visible depth when the lid is raised.
  parent.add(prism(m.interior, [outerWidth - 0.08, 0.18, outerDepth - 0.08], [0, bottom + 0.11, 0], {
    chamfer: 0.16,
    fillet: 0.045,
    bevel: 0.03,
  }))
}

function addInterior(parent: Group, m: ToolboxMaterials): void {
  const width = BODY_W - 0.46
  const depth = BODY_D - 0.46
  const floorY = 0.82
  const floorThickness = 0.12
  const wallThickness = 0.1
  const wallTop = LID_BOTTOM - 0.11
  const floorTop = floorY + floorThickness * 0.5
  const wallY = (floorTop + wallTop) * 0.5
  const wallHeight = wallTop - floorTop
  const sideX = width * 0.5 - wallThickness * 0.5
  const sideZ = depth * 0.5 - wallThickness * 0.5

  // The floor is deliberately well below the lid line, with a dark finish that
  // makes the empty volume read before any future tools or inserts are added.
  parent.add(prism(m.interior, [width, floorThickness, depth], [0, floorY, 0], { chamfer: 0.14, fillet: 0.04, bevel: 0.025 }))

  // Tall rear and side liners form the inner walls. The lower front lip keeps
  // the cavity visible from the preview camera instead of hiding the floor.
  parent.add(prism(m.interior, [width, wallHeight, wallThickness], [0, wallY, -sideZ], { chamfer: 0.08, fillet: 0.03, bevel: 0.018 }))
  parent.add(prism(m.interior, [wallThickness, wallHeight, depth - wallThickness * 2], [sideX, wallY, 0], { chamfer: 0.08, fillet: 0.03, bevel: 0.018 }))
  parent.add(prism(m.interior, [wallThickness, wallHeight, depth - wallThickness * 2], [-sideX, wallY, 0], { chamfer: 0.08, fillet: 0.03, bevel: 0.018 }))

  const frontTop = 1.5
  const frontHeight = frontTop - floorTop
  parent.add(prism(m.interior, [width, frontHeight, wallThickness], [0, (floorTop + frontTop) * 0.5, sideZ], {
    chamfer: 0.08,
    fillet: 0.03,
    bevel: 0.018,
  }))

  // Two shallow rails give the otherwise empty floor a useful manufactured
  // read without turning the cavity into a solid block of fake contents.
  for (const x of [-1.55, 1.55]) {
    parent.add(prism(m.interiorEdge, [0.12, 0.12, depth - 0.24], [x, floorTop + 0.06, 0], {
      chamfer: 0.035,
      fillet: 0.02,
      bevel: 0.012,
    }))
  }
}

function addBumper(parent: Group, m: ToolboxMaterials): void {
  // One continuous wraparound skirt. The reference case sits on a faceted
  // bumper with corner guards, never on four detached legs.
  parent.add(prism(m.graphite, [WIDTH, BUMPER_TOP, DEPTH], [0, BUMPER_TOP * 0.5, 0], { chamfer: 0.2, fillet: 0.07, bevel: 0.05 }))
  parent.add(prism(m.graphiteEdge, [WIDTH - 0.1, 0.1, DEPTH + 0.02], [0, BUMPER_TOP - 0.01, 0], { chamfer: 0.18, fillet: 0.055, bevel: 0.045 }))
  parent.add(prism(m.ink, [WIDTH - 0.5, 0.1, DEPTH - 0.44], [0, 0.02, 0], { chamfer: 0.18, fillet: 0.06, bevel: 0.03 }))

  // Engraved dash band, grouped rather than evenly spaced.
  const dashes = [-1.02, -0.86, -0.7, -0.42, -0.26, 0.04, 0.2, 0.36, 0.64, 0.8, 0.96]
  for (const [index, x] of dashes.entries()) {
    const tall = index % 3 === 1
    parent.add(flatPlate(m.ink, [0.07, tall ? 0.15 : 0.1], [x, 0.32, BUMPER_FRONT + 0.022]))
  }

  for (const side of [-1, 1] as const) {
    recessedBolt(parent, m, [side * 2.18, 0.3, BUMPER_FRONT + 0.006], 0.062)
    recessedBolt(parent, m, [side * 1.86, 0.15, BUMPER_FRONT + 0.006], 0.048)
    // Corner guards wrap both faces of the bottom corner rather than sitting on one.
    parent.add(
      prism(m.yellow, [0.44, 0.3, 0.46], [side * (WIDTH / 2 - 0.14), 0.15, DEPTH / 2 - 0.28], {
        chamfer: [0.12, 0.12, 0.05, 0.05],
        fillet: 0.04,
        bevel: 0.03,
      }),
    )
    parent.add(
      prism(m.yellow, [0.24, 0.28, 0.34], [side * (WIDTH / 2 + 0.02), 0.16, DEPTH / 2 - 0.44], {
        chamfer: 0.08,
        fillet: 0.035,
        bevel: 0.025,
      }),
    )
    parent.add(
      prism(m.graphiteEdge, [0.3, 0.54, 0.44], [side * (WIDTH / 2 - 0.05), 0.27, -DEPTH / 2 + 0.34], {
        chamfer: 0.09,
        fillet: 0.05,
        bevel: 0.03,
      }),
    )
  }
}

function addLid(parent: Group, m: ToolboxMaterials): void {
  const deckY = HEIGHT

  // Hard undercut shadow line, then the lid as three stacked facets: a vertical
  // skirt, a chamfered shoulder, and a flat top plateau. Small fillets keep
  // every facet break reading as a bevel highlight rather than a soft loaf.
  parent.add(prism(m.ink, [LID_W - 0.12, 0.09, LID_D - 0.12], [0, LID_BOTTOM - 0.04, 0], { chamfer: 0.2, fillet: 0.03 }))
  // Extruded along X rather than Z, so the ring's corner cuts land on the
  // front-top and back-top edges: that 45-degree facet is what makes the lid
  // read as a faceted crown instead of a slab. A large end bevel supplies the
  // matching chamfer at both ends in the same primitive.
  parent.add(
    prism(m.shell, [LID_D, HEIGHT - LID_BOTTOM, LID_W], [0, (LID_BOTTOM + HEIGHT) * 0.5, 0], {
      chamfer: [0.4, 0.4, 0.08, 0.08],
      fillet: 0.05,
      bevel: 0.34,
      rotation: [0, Math.PI / 2, 0],
    }),
  )
  // The deck is a scribed panel seam on that one mass, not a slab resting on it.
  parent.add(
    prism(m.shellLight, [4.72, 0.02, 1.9], [0, deckY + 0.005, -0.06], {
      chamfer: 0.3,
      fillet: 0.05,
      bevel: 0.008,
    }),
  )

  // Pressed rib parallel to the front edge, stopped short of the ends so it
  // reads as a stamped seam and not a full-length rule.
  parent.add(prism(m.shellLight, [3.9, 0.05, 0.11], [0, deckY - 0.05, 0.78], { fillet: 0.02, bevel: 0.014 }))

  // A dark underside liner gives the raised lid a believable inner face rather
  // than exposing the same uninterrupted shell colour on both sides.
  const innerY = LID_BOTTOM - 0.12
  parent.add(prism(m.interior, [4.78, 0.05, 2.08], [0, innerY, 0], { chamfer: 0.18, fillet: 0.035, bevel: 0.018 }))
  for (const z of [-0.62, 0, 0.62]) {
    parent.add(prism(m.interiorEdge, [4.35, 0.04, 0.07], [0, innerY - 0.035, z], { fillet: 0.018, bevel: 0.01 }))
  }

  for (const [x, z] of [
    [-2.02, -0.72],
    [-2.02, 0.76],
    [2.02, -0.72],
    [2.02, 0.76],
  ] as const) {
    deckBolt(parent, m, x, z, deckY - 0.015)
  }
  parent.add(flatPlate(m.yellow, [0.2, 0.13], [-1.58, deckY + 0.038, 0.4], [-Math.PI / 2, 0, 0], false))
  parent.add(flatPlate(m.yellow, [0.16, 0.11], [1.5, deckY + 0.038, 0.44], [-Math.PI / 2, 0, 0], false))
}

function addHandle(parent: Group, m: ToolboxMaterials): void {
  const deckY = HEIGHT
  const barY = deckY + HANDLE_RISE
  const postX = 1.34
  const z = -0.16

  // Shallow navy well, not a black cavity: the reference recess reads as metal.
  parent.add(prism(m.graphiteEdge, [2.7, 0.06, 0.6], [0, deckY + 0.01, z], { chamfer: 0.08, fillet: 0.04, bevel: 0.02 }))
  parent.add(prism(m.ink, [2.42, 0.05, 0.4], [0, deckY + 0.035, z], { chamfer: 0.06, fillet: 0.035, bevel: 0.016 }))

  for (const side of [-1, 1] as const) {
    const x = side * postX
    // Recessed slot plate, flared mounting foot, tapered post, rounded elbow.
    parent.add(prism(m.graphiteEdge, [0.62, 0.05, 0.6], [x, deckY + 0.015, z], { chamfer: 0.1, fillet: 0.045, bevel: 0.022 }))
    parent.add(prism(m.graphite, [0.58, 0.16, 0.56], [x, deckY + 0.08, z], { chamfer: 0.1, fillet: 0.05, bevel: 0.035 }))
    parent.add(
      prism(m.graphite, [0.34, HANDLE_RISE - 0.12, 0.44], [x + side * 0.055, deckY + HANDLE_RISE * 0.5, z], {
        chamfer: 0.09,
        fillet: 0.06,
        bevel: 0.045,
        rotation: [0, 0, -side * 0.07],
      }),
    )
    parent.add(prism(m.graphite, [0.4, 0.32, 0.46], [x, barY - 0.06, z], { chamfer: 0.13, fillet: 0.07, bevel: 0.05 }))
    // Pivot boss on the outer face of each leg.
    parent.add(cylinder(m.graphiteEdge, 0.055, 0.05, [x + side * 0.16, barY - 0.08, z], [0, 0, Math.PI / 2]))
  }

  // Structural arch, then a distinctly thicker rubber grip over its middle.
  parent.add(prism(m.graphite, [2 * postX + 0.34, 0.2, 0.4], [0, barY, z], { chamfer: 0.1, fillet: 0.07, bevel: 0.05 }))
  parent.add(
    prism(m.rubber, [1.78, 0.38, 0.46], [0, barY + 0.06, z], { chamfer: 0.1, fillet: 0.11, bevel: 0.08, arcSegments: 2 }),
  )
}

function addSideModule(parent: Group, m: ToolboxMaterials): void {
  const x = -BODY_W / 2
  const sideways: Vec3 = [0, Math.PI / 2, 0]

  parent.add(prism(m.shellShadow, [2.14, 1.24, 0.1], [x - 0.02, 1.32, 0], { chamfer: 0.16, fillet: 0.06, bevel: 0.035, rotation: sideways }))
  parent.add(prism(m.graphiteEdge, [1.96, 1.08, 0.07], [x - 0.08, 1.32, 0], { chamfer: 0.14, fillet: 0.05, bevel: 0.03, rotation: sideways }))
  parent.add(prism(m.ink, [1.74, 0.54, 0.05], [x - 0.12, 1.6, 0], { chamfer: 0.1, fillet: 0.045, bevel: 0.022, rotation: sideways }))

  // Recessed carry bar with a yellow grip face.
  parent.add(cylinder(m.graphite, 0.09, 1.2, [x - 0.15, 1.54, 0], [Math.PI / 2, 0, 0]))
  parent.add(prism(m.yellow, [0.98, 0.15, 0.07], [x - 0.2, 1.5, 0], { chamfer: 0.05, fillet: 0.035, bevel: 0.022, rotation: sideways }))
  for (const z of [-0.64, 0.64]) {
    parent.add(prism(m.graphite, [0.5, 0.16, 0.16], [x - 0.13, 1.6, z], { chamfer: 0.05, fillet: 0.035, bevel: 0.022, rotation: sideways }))
  }
  for (const z of [-0.36, 0.3]) {
    parent.add(cylinder(m.ink, 0.05, 0.05, [x - 0.145, 1.8, z], [0, 0, Math.PI / 2]))
  }

  // Separately bezelled cyan status panel below the carry bar.
  parent.add(prism(m.graphiteEdge, [1.12, 0.44, 0.07], [x - 0.09, 0.98, 0], { chamfer: 0.09, fillet: 0.04, bevel: 0.024, rotation: sideways }))
  parent.add(prism(m.ink, [0.92, 0.3, 0.05], [x - 0.13, 0.98, 0], { chamfer: 0.06, fillet: 0.035, bevel: 0.018, rotation: sideways }))
  parent.add(prism(m.cyan, [0.72, 0.19, 0.03], [x - 0.16, 0.98, 0], { chamfer: 0.04, fillet: 0.03, bevel: 0.012, rotation: sideways }))
}

function addRear(parent: Group, m: ToolboxMaterials): void {
  const z = -BODY_D / 2
  parent.add(prism(m.shellShadow, [4.1, 1, 0.1], [0, 1.2, z + 0.02], { chamfer: 0.12, fillet: 0.05, bevel: 0.03 }))
  parent.add(prism(m.graphite, [4.4, 0.24, 0.18], [0, LID_BOTTOM - 0.08, z - 0.05], { chamfer: 0.06, fillet: 0.04, bevel: 0.025 }))
  for (const x of [-1.5, -0.75, 0, 0.75, 1.5]) {
    parent.add(cylinder(m.graphiteEdge, 0.11, 0.46, [x, LID_BOTTOM - 0.08, z - 0.13], [0, 0, Math.PI / 2]))
  }
}

/**
 * Values read off the reference: a mid light-grey shell that keeps its form
 * shading, blue-graphite hardware well above black, and only the amber and cyan
 * signals allowed anywhere near clipping.
 */
function acquireToolboxMaterials(): {
  materials: ToolboxMaterials
  handles: MaterialHandle[]
  profiles: Map<MeshPhysicalMaterial, WearProfile>
} {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-01', palette: 'SHELL-200', condition: 'used', wear: 0.08, dirt: 0.06, seed: 1101, uvScale: [1.8, 1.8] })
  const shellLight = library.acquire({ recipeId: 'MAT-01', palette: 'SHELL-200', condition: 'used', wear: 0.06, dirt: 0.05, seed: 1102, uvScale: [1.8, 1.8] })
  const shellShadow = library.acquire({ recipeId: 'MAT-01', palette: 'SLATE-650', condition: 'used', wear: 0.1, dirt: 0.1, seed: 1103, uvScale: [2.2, 2.2] })
  const graphite = library.acquire({ recipeId: 'MAT-02', palette: 'GRAPHITE-800', condition: 'used', wear: 0.12, dirt: 0.16, seed: 1201, uvScale: [2.4, 2.4] })
  const graphiteEdge = library.acquire({ recipeId: 'MAT-02', palette: 'SLATE-650', condition: 'used', wear: 0.14, dirt: 0.14, seed: 1202, uvScale: [2.4, 2.4] })
  const ink = library.acquire({ recipeId: 'MAT-02', palette: 'INK-950', condition: 'used', wear: 0.1, dirt: 0.18, seed: 1203, uvScale: [2.4, 2.4] })
  const rubber = library.acquire({ recipeId: 'MAT-07', palette: 'INK-950', condition: 'used', wear: 0.14, dirt: 0.2, seed: 1701, uvScale: [2.6, 2.6] })
  const yellow = library.acquire({ recipeId: 'MAT-02', palette: 'AMBER-400', condition: 'used', wear: 0.08, dirt: 0.05, seed: 1204, uvScale: [2, 2] })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'ORANGE-500', condition: 'clean', dirt: 0.01, seed: 1901, uvScale: [1, 1] })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'clean', dirt: 0.02, seed: 1902, uvScale: [1, 1] })

  const materials: ToolboxMaterials = {
    shell: tuneMaterial(shell, 0xacb0ae, 0.44, 0.28, { clearcoat: 0.35 }),
    shellLight: tuneMaterial(shellLight, 0xb8bcba, 0.4, 0.28, { clearcoat: 0.35 }),
    shellShadow: tuneMaterial(shellShadow, 0x767c7b, 0.55, 0.22, { clearcoat: 0.2 }),
    graphite: tuneMaterial(graphite, 0x28323c, 0.42, 0.45, { clearcoat: 0.3 }),
    graphiteEdge: tuneMaterial(graphiteEdge, 0x36424e, 0.4, 0.45, { clearcoat: 0.3 }),
    ink: tuneMaterial(ink, 0x0f141a, 0.66, 0.25),
    // Interior surfaces stay on simple PBR materials. They have enough
    // roughness variation from the lights to read as metal, but no exterior
    // wear graph or microtexture that can turn the cavity into visual noise.
    interior: new MeshPhysicalMaterial({
      name: 'industrial-toolbox / clean interior liner',
      color: 0x1d272d,
      roughness: 0.78,
      metalness: 0.22,
    }),
    interiorEdge: new MeshPhysicalMaterial({
      name: 'industrial-toolbox / clean interior edge',
      color: 0x3b484f,
      roughness: 0.68,
      metalness: 0.32,
    }),
    rubber: tuneMaterial(rubber, 0x191d21, 0.82, 0.06),
    yellow: tuneMaterial(yellow, 0xdb9a16, 0.4, 0.45, { clearcoat: 0.25 }),
    amber: tuneMaterial(amber, 0xf26800, 0.3, 0, { emissive: 2.5 }),
    cyan: tuneMaterial(cyan, 0x3ce4d6, 0.3, 0, { emissive: 1.1 }),
  }

  // Painted armor rubs to bare metal on its edges and holds dust on top. Service
  // hardware is already dark metal, so it scuffs rather than rubs through. The
  // rubber grip takes grime but neither rubs nor scratches. Signal lenses are
  // absent from this table, so they stay clean and keep their own emissive.
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [materials.shell, { rub: 1, grime: 0.9, scratch: 0.9 }],
    [materials.shellLight, { rub: 0.85, grime: 0.7, scratch: 0.8 }],
    [materials.shellShadow, { rub: 0.7, grime: 1.15, scratch: 0.5 }],
    [materials.graphite, { rub: 0.6, grime: 1, scratch: 0.55 }],
    [materials.graphiteEdge, { rub: 0.75, grime: 0.95, scratch: 0.6 }],
    [materials.ink, { rub: 0.25, grime: 1.2, scratch: 0.15 }],
    [materials.rubber, { rub: 0.15, grime: 1, scratch: 0.1 }],
    [materials.yellow, { rub: 1.15, grime: 1.05, scratch: 0.9 }],
  ])

  const handles = [shell, shellLight, shellShadow, graphite, graphiteEdge, ink, rubber, yellow, amber, cyan]
  return { handles, materials, profiles }
}

const LID_OPEN_ANGLE = -(Math.PI * 0.42)
const LID_HINGE_Z = -LID_D / 2
const ORB_REST_Y = 1.08
const ORB_RISE = 2.7
const ORB_RELEASE_PROGRESS = 0.9
const ORB_RELEASE_DELAY = 0.24
const STEAM_BUILD_DURATION = 0.72
const STEAM_PUSH_START = 0.72
const STEAM_PUSH_RAMP = 0.32
const LID_OPEN_DELAY = 0.96
const STEAM_DURATION = 2.7
const STEAM_FADE_START = 2.1

export function createModel(): {
  root: Group
  update: (deltaSeconds: number) => void
  toggleLid: () => void
  setSceneDepth: (sceneViewZ: typeof positionView.z) => void
  dispose: () => void
} {
  const { materials, handles, profiles } = acquireToolboxMaterials()
  const root = new Group()
  root.name = 'industrial-toolbox'

  // Keep the lid and everything mounted to its top deck under one pivot. The
  // child offset converts the existing world-authored part positions into
  // hinge-local space without changing the closed presentation.
  const lidPivot = new Group()
  lidPivot.name = 'industrial-toolbox / lid hinge'
  lidPivot.position.set(0, LID_BOTTOM, LID_HINGE_Z)
  const lidAssembly = new Group()
  lidAssembly.name = 'industrial-toolbox / lid assembly'
  lidAssembly.position.set(0, -LID_BOTTOM, -LID_HINGE_Z)
  lidPivot.add(lidAssembly)

  // Chassis: an open structural shell with a recessed cavity instead of a
  // solid prism that would seal the toolbox shut from the inside.
  addBodyShell(root, materials)
  addInterior(root, materials)
  addBumper(root, materials)
  for (const side of [-1, 1] as const) addDoor(root, materials, side)
  addLatchColumn(root, materials)
  addLid(lidAssembly, materials)
  addHandle(lidAssembly, materials)
  addSideModule(root, materials)
  addRear(root, materials)
  root.add(lidPivot)

  // Occlusion has to be baked while the parts are still separate: once they are
  // merged there is nothing left to cast into the seams. Surface identity has to
  // be baked before the merge for the same reason - afterwards the parts no
  // longer have distinct materials to read it from.
  bakeOcclusion(root)
  bakeSurfaceAttributes(root, profiles)

  const wearMaterial = createWearMaterial({ name: 'industrial-toolbox / worn armor' })
  const worn = new Set(profiles.keys())

  // Merge the static body and the lid independently. Each batch is flattened
  // into its own group's local space, so rotating the pivot moves every lid
  // detail together without giving up the material batching of the preview.
  root.remove(lidPivot)
  const mergeAssembly = (assembly: Group) => mergeStaticByMaterial(assembly, {
    resolveMaterial: (source) => worn.has(source as MeshPhysicalMaterial) ? wearMaterial : source,
    retainedAttributes: (resolved) => resolved === wearMaterial ? WEAR_ATTRIBUTES : [],
    meshName: (material) => `industrial-toolbox / ${material.name}`,
  })
  const mergedGeometries = mergeAssembly(root)
  const mergedLidGeometries = mergeAssembly(lidAssembly)
  root.add(lidPivot)

  // Keep the orb outside the static material batches so its height can animate
  // independently inside the cavity. Its emissive surface is enough to feed
  // the existing bloom pass; no extra dynamic light is needed.
  const orbGeometry = new SphereGeometry(0.18, 24, 16)
  const orbMaterial = new MeshPhysicalMaterial({
    name: 'industrial-toolbox / inner energy orb',
    color: 0x74ffe0,
    emissive: 0x2dffc2,
    emissiveIntensity: 3.8,
    roughness: 0.18,
    metalness: 0.05,
    toneMapped: false,
  })
  const orb = new InstancedMesh(orbGeometry, orbMaterial, 3)
  orb.name = 'industrial-toolbox / inner energy orbs'
  const orbMatrix = new Matrix4()
  const orbPositions: Vec3[] = [
    [-0.46, -0.04, 0.02],
    [0.46, 0.02, 0.08],
    [0, 0.08, 0.38],
  ]
  for (const [index, [x, y, z]] of orbPositions.entries()) {
    orbMatrix.makeTranslation(x, y, z)
    orb.setMatrixAt(index, orbMatrix)
  }
  orb.instanceMatrix.needsUpdate = true
  const orbAssembly = new Group()
  orbAssembly.name = 'industrial-toolbox / three orb lift'
  orbAssembly.position.set(0, ORB_REST_Y, 0)
  orbAssembly.add(orb)
  root.add(orbAssembly)

  // A single transparent instanced batch gives the lid seam one low-cost
  // opening burst. Sprites stay camera-facing while their centers travel out
  // along the four seam normals, so orbiting cannot turn them into strips.
  const steamSprites = createSteamSprites()
  const smokeTexture = createSmokeTexture()
  const steamTimeUniform = uniform(0)
  const steamAlphaUniform = uniform(0)
  const steamMaterial = new SpriteNodeMaterial({
    name: 'industrial-toolbox / seam steam TSL',
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
  })
  const smokeOriginSize = instancedBufferAttribute(
    steamSprites.geometry.getAttribute('smokeOriginSize') as InstancedBufferAttribute,
    'vec4',
  ) as unknown as ReturnType<typeof vec4>
  const smokeDirectionDelay = instancedBufferAttribute(
    steamSprites.geometry.getAttribute('smokeDirectionDelay') as InstancedBufferAttribute,
    'vec4',
  ) as unknown as ReturnType<typeof vec4>
  const smokeAlphaSeed = instancedBufferAttribute(
    steamSprites.geometry.getAttribute('smokeAlphaSeed') as InstancedBufferAttribute,
    'vec2',
  ) as unknown as ReturnType<typeof vec4>
  const smokeOrigin = smokeOriginSize.xyz
  const smokeDirection = smokeDirectionDelay.xyz
  const smokeSize = smokeOriginSize.w
  const smokeAlpha = smokeAlphaSeed.x
  const smokeDelay = smokeDirectionDelay.w
  const smokeSeed = smokeAlphaSeed.y
  const smokeAge = clamp(steamTimeUniform.sub(smokeDelay).mul(0.48), float(0), float(1))
  const smokeLife = smoothstep(float(0), float(0.14), smokeAge).mul(
    oneMinus(smoothstep(float(0.88), float(1), smokeAge)),
  )
  const steamBuild = smoothstep(float(0), float(STEAM_BUILD_DURATION), steamTimeUniform)
  const smokeVariant = smokeSeed.fract()
  const smokePushStart = float(STEAM_PUSH_START).add(smokeDelay.mul(0.45))
  const smokePush = smoothstep(
    smokePushStart,
    smokePushStart.add(float(STEAM_PUSH_RAMP)),
    steamTimeUniform,
  )
  const swayPhase = steamTimeUniform.mul(4.2).add(smokeSeed.mul(6.2831853))
  const pushStrength = float(0.68).add(smokeVariant.mul(0.38))
  const pushDistance = float(0.04).add(smokePush.mul(pushStrength))
  const tangent = vec3(smokeDirection.z.mul(-1), float(0), smokeDirection.x)
  const flow = smokeDirection.mul(smokeAge.mul(pushDistance)).add(
    tangent.mul(sin(swayPhase.mul(0.61)).mul(smokePush.mul(0.14))),
  ).add(
    vec3(
      sin(swayPhase).mul(0.035),
      smokeAge.mul(float(0.03).add(smokePush.mul(0.23))),
      sin(swayPhase.mul(0.73)).mul(0.035),
    ),
  )
  steamMaterial.positionNode = smokeOrigin.add(flow)
  const puffScale = float(0.78).add(steamBuild.mul(0.16)).add(smokeAge.mul(0.32))
  steamMaterial.scaleNode = vec2(smokeSize.mul(1.2), smokeSize.mul(0.82)).mul(puffScale)
  steamMaterial.rotationNode = smokeSeed.mul(6.2831853)

  // Texture alpha provides the broken vapor silhouette; the node graph does
  // not build fractal noise per fragment. This is the supplied smoke shader
  // shape, with the per-instance burst alpha and seam motion layered on top.
  const sampled = texture(smokeTexture)
  const litColor = vec3(0.56, 0.84, 0.7)
  const shadowColor = vec3(0.1, 0.2, 0.18)
  const litAmount = sampled.r.mul(float(1.05)).add(float(0.05)).clamp(0, 1)
  steamMaterial.colorNode = mix(shadowColor, litColor, litAmount)
  const baseOpacity = sampled.a.mul(smokeAlpha).mul(smokeLife).mul(steamAlphaUniform)
  steamMaterial.opacityNode = baseOpacity

  const steam = new InstancedMesh(steamSprites.geometry, steamMaterial, steamSprites.count)
  steam.name = 'industrial-toolbox / lid seam steam'
  steam.userData.excludeFromExport = true
  steam.visible = false
  steam.frustumCulled = false
  root.add(steam)

  // Use the preview pass' view-Z texture when available. The hard depth test
  // remains the fallback; this extra fade only softens intersections at the
  // toolbox silhouette and costs one sample on the small smoke draw.
  const setSceneDepth = (sceneViewZ: typeof positionView.z): void => {
    const occlusion = saturate(positionView.z.sub(sceneViewZ).div(float(0.6)))
    steamMaterial.opacityNode = baseOpacity.mul(occlusion)
    steamMaterial.needsUpdate = true
  }

  let lidAngle = 0
  let lidTarget = 0
  let lidRequestedOpen = false
  let lidOpenDelayRemaining = 0
  let signalBlend = 0
  let signalTarget = 0
  let orbRise = 0
  let orbRiseTarget = 0
  let orbDelayRemaining = 0
  let steamElapsed = 0
  let steamActive = false
  const signalOrange = new Color(0xf26800)
  const signalGreen = new Color(0x35ff78)
  return {
    root,
    setSceneDepth,
    update: (deltaSeconds: number) => {
      const delta = Math.min(Math.max(deltaSeconds, 0), 0.05)
      if (lidRequestedOpen && lidOpenDelayRemaining > 0) {
        lidOpenDelayRemaining = Math.max(0, lidOpenDelayRemaining - delta)
        if (lidOpenDelayRemaining === 0) lidTarget = LID_OPEN_ANGLE
      }
      const lidSmoothing = 1 - Math.exp(-delta * 4.2)
      lidAngle += (lidTarget - lidAngle) * lidSmoothing
      lidPivot.rotation.x = lidAngle

      const lidOpenProgress = Math.min(1, Math.max(0, lidAngle / LID_OPEN_ANGLE))
      if (lidRequestedOpen && lidTarget === LID_OPEN_ANGLE && lidOpenProgress >= ORB_RELEASE_PROGRESS) {
        orbDelayRemaining = Math.max(0, orbDelayRemaining - delta)
        if (orbDelayRemaining === 0) orbRiseTarget = 1
      }
      if (!lidRequestedOpen) orbRiseTarget = 0
      const orbSmoothing = 1 - Math.exp(-delta * (orbRiseTarget === 0 ? 8 : 3.6))
      orbRise += (orbRiseTarget - orbRise) * orbSmoothing
      orbAssembly.position.y = ORB_REST_Y + ORB_RISE * orbRise

      const signalSmoothing = 1 - Math.exp(-delta * 4.2)
      signalBlend += (signalTarget - signalBlend) * signalSmoothing
      materials.amber.color.lerpColors(signalOrange, signalGreen, signalBlend)
      materials.amber.emissive.lerpColors(signalOrange, signalGreen, signalBlend)

      if (steamActive) {
        steamElapsed = Math.min(STEAM_DURATION, steamElapsed + delta)
        steamTimeUniform.value = steamElapsed
        const buildProgress = Math.min(1, steamElapsed / STEAM_BUILD_DURATION)
        const buildAlpha = buildProgress * buildProgress * (3 - 2 * buildProgress)
        const fade = Math.min(
          1,
          Math.max(0, (steamElapsed - STEAM_FADE_START) / (STEAM_DURATION - STEAM_FADE_START)),
        )
        steamAlphaUniform.value = buildAlpha * (1 - fade)
        if (steamElapsed >= STEAM_DURATION) {
          steamActive = false
          steamAlphaUniform.value = 0
        }
      }
      steam.visible = steamActive
    },
    toggleLid: () => {
      lidRequestedOpen = !lidRequestedOpen
      signalTarget = lidRequestedOpen ? 1 : 0
      orbRiseTarget = 0
      orbDelayRemaining = lidRequestedOpen ? ORB_RELEASE_DELAY : 0
      if (lidRequestedOpen) {
        lidTarget = 0
        lidOpenDelayRemaining = LID_OPEN_DELAY
        steamElapsed = 0
        steamTimeUniform.value = 0
        steamAlphaUniform.value = 0
        steamActive = true
      } else {
        lidOpenDelayRemaining = 0
        lidTarget = 0
        steamAlphaUniform.value = 0
        steamActive = false
      }
    },
    dispose: () => {
      for (const geometry of mergedGeometries) geometry.dispose()
      for (const geometry of mergedLidGeometries) geometry.dispose()
      orbGeometry.dispose()
      orbMaterial.dispose()
      steamSprites.geometry.dispose()
      steamMaterial.dispose()
      smokeTexture.dispose()
      wearMaterial.dispose()
      materials.interior.dispose()
      materials.interiorEdge.dispose()
      for (const handle of handles) handle.release()
    },
  }
}

export function createPreview(options: { aspect: number }): {
  scene: Scene
  root: Group
  camera: PerspectiveCamera
  update: (deltaSeconds: number) => void
  toggleLid: () => void
  setSceneDepth: (sceneViewZ: typeof positionView.z) => void
  dispose: () => void
} {
  const controller = createModel()
  const scene = new Scene()
  scene.name = 'industrial-toolbox / reference-matched preview'
  scene.background = new Color(0x18252f)
  scene.add(controller.root)

  const hemi = new HemisphereLight(0x8fa2b2, 0x14181c, 0.55)
  hemi.name = 'industrial-toolbox / soft hemisphere'
  scene.add(hemi)

  // Key from the upper front-right, matching the reference's lit top deck and
  // bright right shoulder against a shaded camera-left service face.
  const key = new DirectionalLight(0xfff4e6, 1.6)
  key.name = 'industrial-toolbox / warm key'
  key.position.set(7.5, 9.5, 7)
  scene.add(key)

  const fill = new DirectionalLight(0x9fb6c9, 0.6)
  fill.name = 'industrial-toolbox / cool fill'
  fill.position.set(-8, 3.5, 6.5)
  scene.add(fill)

  // Grazing rim that lets the new rounded edges register as highlights.
  const rim = new DirectionalLight(0xc4d2dd, 0.8)
  rim.name = 'industrial-toolbox / edge rim'
  rim.position.set(-4.5, 6.5, -7.5)
  scene.add(rim)

  // Solved from the reference: yaw 22 deg to camera-left, pitch 18 deg, and a
  // long 22 deg lens so the near and far ends read at the same height, which is
  // what keeps the case from looking wedge-shaped.
  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1.25
  const camera = new PerspectiveCamera(22, aspect, 0.5, 80)
  camera.name = 'industrial-toolbox / reference camera'
  const yaw = (20 * Math.PI) / 180
  const pitch = (18 * Math.PI) / 180
  const distance = 17
  const target = 1.5
  const horizontal = distance * Math.cos(pitch)
  camera.position.set(-horizontal * Math.sin(yaw), target + distance * Math.sin(pitch), horizontal * Math.cos(yaw))
  camera.lookAt(0, target, 0)
  scene.add(camera)

  return {
    scene,
    root: controller.root,
    camera,
    update: controller.update,
    toggleLid: controller.toggleLid,
    setSceneDepth: controller.setSceneDepth,
    dispose: () => {
      scene.remove(controller.root)
      controller.dispose()
    },
  }
}
