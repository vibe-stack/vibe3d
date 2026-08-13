import { Group } from 'three/webgpu'

import { cylinder, prism } from '../../../src/asset-forge/generator/index.ts'
import type { CargoMaterialBundle, CargoMaterials } from './materials.ts'
import { addLabelDecal, addStripeDecal } from './materials.ts'
import {
  AXIS_X,
  AXIS_Y,
  AXIS_Z,
  box,
  boltRun,
  cornerCasting,
  forkPocket,
  paintMark,
  plaque,
  recessedHandle,
  seam,
  slashProfile,
  statusLens,
} from './parts.ts'

/**
 * The freight-container chassis, shared by every container variant in the wave.
 *
 * Six props in this pack are the same object at different lengths, heights, and
 * states of repair. Authoring them separately would guarantee they drift: the
 * rib pitch would differ by a few centimetres here, the skirt height there, and
 * a yard built from all six would read as six manufacturers. Everything that
 * defines the *type* lives here; everything that defines an individual variant
 * stays in its own model.
 *
 * The rib cadence is the load-bearing decision. It is expressed as a target
 * pitch rather than a rib count, so a six-metre and a three-metre container get
 * corrugation at the same physical spacing instead of the same number of ribs
 * stretched to fit.
 */

export interface ContainerDimensions {
  readonly length: number
  readonly width: number
  readonly height: number
  /** Corner casting cube edge. */
  readonly casting?: number
  /** Dark under-frame height. */
  readonly skirt?: number
}

export interface ContainerShellOptions extends ContainerDimensions {
  /** Target distance between rib centres, in metres. */
  readonly ribPitch?: number
  /** Adds a roof deck. Off for open-top variants. */
  readonly roof?: boolean
  /** Adds fork pockets to the skirt. */
  readonly forkPockets?: boolean
  /** Closes the +X end with a wall instead of leaving a door frame. */
  readonly closeDoorEnd?: boolean
  /** Ownership block, painted onto the rib field of both side walls. */
  readonly ownership?: boolean
  /** Seed offset for the manifest plaques, so two containers differ. */
  readonly variant?: number
}

/** Geometry the variants need in order to place their own detail. */
export interface ContainerMetrics {
  readonly casting: number
  readonly skirt: number
  readonly panelHeight: number
  readonly panelCentre: number
  readonly ribCount: number
  /** Outward offset from a side wall's panel z to the corrugation's outer face. */
  readonly ribFace: number
}

const DEFAULT_CASTING = 0.3
const DEFAULT_SKIRT = 0.42
const DEFAULT_RIB_PITCH = 0.405

/** The rib is 0.052 deep, seated 0.055 out from the panel's centre plane. */
const RIB_FACE = 0.081
/** The end wall's ribs are 0.055 deep, seated 0.055 out. */
const END_RIB_FACE = 0.0825

export function containerMetrics(options: ContainerShellOptions): ContainerMetrics {
  const casting = options.casting ?? DEFAULT_CASTING
  const skirt = options.skirt ?? DEFAULT_SKIRT
  // The panel is sized from the two members it seals against, not from a magic
  // constant: the top rail's underside is at `height - casting*0.5 - 0.085` and
  // the skirt band tops out at `skirt + 0.02`, and the panel laps both by 30 mm.
  // Sized by subtracting a flat 0.38 it stopped 105 mm short of the rail on a
  // standard box and 145 mm short on the small one - a slit the full length of
  // all four walls, and one that got worse as the casting grew.
  const panelHeight = options.height - skirt - casting * 0.5 - 0.045
  return {
    casting,
    skirt,
    panelHeight,
    panelCentre: skirt - 0.01 + panelHeight * 0.5,
    ribCount: Math.max(3, Math.round((options.length - casting * 2 - 0.16) / (options.ribPitch ?? DEFAULT_RIB_PITCH))),
    ribFace: RIB_FACE,
  }
}

function frame(parent: Group, m: CargoMaterials, o: ContainerShellOptions, k: ContainerMetrics): void {
  const cornerX = o.length * 0.5 - k.casting * 0.5
  const cornerZ = o.width * 0.5 - k.casting * 0.5
  const post = k.casting * 0.63
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * cornerX
      const z = sz * cornerZ
      cornerCasting(parent, m, [k.casting, k.casting, k.casting], [x, k.casting * 0.5, z], k.casting * 0.19, 'x')
      cornerCasting(parent, m, [k.casting, k.casting, k.casting], [x, o.height - k.casting * 0.5, z], k.casting * 0.19, 'x')
      box(parent, m.graphite, [post, o.height - k.casting * 2 + 0.04, post], [x, o.height * 0.5, z], {
        chamfer: 0.05, fillet: 0.016, bevel: 0.014,
      })
    }
    const z = sx * cornerZ
    box(parent, m.graphite, [o.length - k.casting * 2, 0.17, 0.16], [0, o.height - k.casting * 0.5, z], { chamfer: 0.04 })
    box(parent, m.graphite, [o.length - k.casting * 2, 0.2, 0.17], [0, 0.14, z], { chamfer: 0.045 })
    box(parent, m.graphiteEdge, [0.16, 0.17, o.width - k.casting * 2], [sx * (o.length * 0.5 - 0.09), o.height - k.casting * 0.5, 0], { chamfer: 0.04 })
    box(parent, m.graphiteEdge, [0.17, 0.2, o.width - k.casting * 2], [sx * (o.length * 0.5 - 0.09), 0.14, 0], { chamfer: 0.045 })
  }
}

function skirtBand(parent: Group, m: CargoMaterials, bundle: CargoMaterialBundle, o: ContainerShellOptions, k: ContainerMetrics): void {
  // The band runs `length - casting*2 + 0.06` and its fork pockets carry
  // 0.81-wide wear plates about `±length*0.26`, so the free run between them is
  // what the hazard stripe has to fit inside. Painted 0.78 wide at
  // `±length*0.4` the stripe ran 376 mm past the end of `container-small`'s
  // band over bare ground, 74 mm past the standard box's, and 392 mm of it lay
  // across the short one's outboard pocket. It marks the centre of the
  // under-frame now, which is the one place every length has room for it.
  const bandHalf = (o.length - k.casting * 2 + 0.06) * 0.5
  const bandRun = o.forkPockets !== false ? (o.length * 0.26 - 0.405) * 2 : bandHalf * 2
  for (const side of [-1, 1]) {
    const z = side * (o.width * 0.5 - 0.055)
    const face = side > 0 ? 'front' : 'back'
    box(parent, m.graphite, [o.length - k.casting * 2 + 0.06, k.skirt, 0.15], [0, k.skirt * 0.5 + 0.02, z], {
      chamfer: 0.06, fillet: 0.02, bevel: 0.018, rotation: [0, side > 0 ? 0 : Math.PI, 0],
    })
    if (o.forkPockets !== false) {
      for (const sx of [-1, 1]) {
        forkPocket(parent, m, [0.68, 0.24], 0.5, [sx * o.length * 0.26, k.skirt * 0.52, z + side * 0.075], face)
      }
    }
    // The bolt line runs the band it is driven into rather than 0.42 of the
    // overall length, which put the two end bolts 11 mm off the end of
    // `container-small`'s band and 28 mm off the short one's.
    boltRun(parent, m.graphiteEdge, [-(bandHalf - 0.12), 0.1, z + side * 0.078], [bandHalf - 0.12, 0.1, z + side * 0.078], Math.max(4, Math.round(o.length * 1.5)), 0.024, face)
    const stripe = addStripeDecal(bundle, { count: 6, lean: side })
    plaque(parent, m, stripe, [Math.min(0.78, bandRun - 0.16), 0.14], [0, k.skirt * 0.55, z + side * 0.078], face, m.ink)
  }
  const crossMembers = Math.max(3, Math.round(o.length * 1.5))
  for (let index = 0; index < crossMembers; index += 1) {
    const x = (index / (crossMembers - 1) - 0.5) * (o.length - 0.9)
    box(parent, m.ink, [0.12, 0.14, o.width - 0.28], [x, 0.09, 0], { chamfer: 0.03 })
  }
  box(parent, m.graphiteEdge, [o.length - 0.2, 0.1, o.width - 0.16], [0, 0.05, 0], { chamfer: 0.03 })
}

function roofDeck(parent: Group, m: CargoMaterials, o: ContainerShellOptions, k: ContainerMetrics): void {
  const y = o.height - 0.11
  parent.add(prism(m.shellLight, [o.length - k.casting * 2 + 0.05, o.width - 0.16, 0.13], [0, y, 0], {
    chamfer: 0.05, fillet: 0.018, bevel: 0.018, rotation: AXIS_Z,
  }))
  for (let index = 0; index < 5; index += 1) {
    const z = (index / 4 - 0.5) * (o.width - 0.62)
    parent.add(prism(m.shellShade, [o.length - k.casting * 2 - 0.14, 0.1, 0.05], [0, y + 0.065, z], {
      chamfer: 0.028, fillet: 0.01, bevel: 0.009, rotation: AXIS_Z,
    }))
  }
  const bays = Math.max(1, Math.round(o.length / 2.2))
  for (let index = 1; index < bays; index += 1) {
    const x = (index / bays - 0.5) * (o.length - k.casting * 2 - 0.2)
    seam(parent, m.shellLight, o.width - 0.34, [x, y + 0.065, 0], 'top', 'along', 0.032, 0.02)
  }
  // A lift pad straddles the outermost deck rib and reaches 20 mm down into the
  // plate beneath it, so it is welded to something. Held 0.05 thick at
  // `y + 0.13` it stood 40 mm clear of the plate's top face with nothing under
  // it at all, on every variant, and the 0.44 inset landed its own side face
  // exactly on the outer rib's.
  const padRib = (o.width - 0.62) * 0.5
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (o.length * 0.5 - k.casting * 1.5)
      const z = sz * padRib
      parent.add(prism(m.steel, [0.22, 0.11, 0.16], [x, y + 0.1, z], { chamfer: 0.03, fillet: 0.01, bevel: 0.01 }))
      parent.add(cylinder(m.ink, 0.035, 0.06, [x, y + 0.15, z], AXIS_Y, 8))
    }
  }
}

function sideWall(
  parent: Group,
  m: CargoMaterials,
  bundle: CargoMaterialBundle,
  o: ContainerShellOptions,
  k: ContainerMetrics,
  side: -1 | 1,
): void {
  const z = side * (o.width * 0.5 - 0.075)
  const face = side > 0 ? 'front' : 'back'
  parent.add(prism(m.shell, [o.length - k.casting * 2 + 0.05, k.panelHeight, 0.11], [0, k.panelCentre, z], {
    chamfer: 0.05, fillet: 0.018, bevel: 0.02, rotation: [0, side > 0 ? 0 : Math.PI, 0],
  }))

  const ribHeight = k.panelHeight - 0.14
  const field = o.length - k.casting * 2 - 0.16
  /** Rib centres. Everything painted on this wall registers with one of these. */
  const ribX = (index: number): number => ((index + 0.5) / k.ribCount - 0.5) * field
  // The marker lamps stay at the far end but never past it: their bezel is
  // 0.112 wide, and at `±length*0.4` it stood 27 mm off the end of the small
  // unit's panel and 29 mm off the short one's, over open air at rib depth.
  const lampX = side * Math.min(o.length * 0.4, (o.length - k.casting * 2 + 0.05) * 0.5 - 0.106)
  // The block stops short of the lamps rather than short of the panel: half a
  // rib and half a bezel meet at 0.176 apart, so wherever a lamp comes within
  // the 40 mm of air the plaque keeps off the chevron, the outermost rib is the
  // lamps' ground and the block ends one rib inboard of it. Only the stack's
  // top tier, whose coarse pitch leaves its outermost rib 105 mm clear of the
  // bezel, keeps that rib - which is the one reason a four-rib wall has room
  // for a block at all.
  const blockEnd = Math.abs(lampX) - ribX(k.ribCount - 1) > 0.216 ? k.ribCount - 1 : k.ribCount - 2
  // The ownership block is painted onto the ribs, never floated across them, so
  // its width is a count of ribs and the wall has to be long enough to hold it.
  // Cut to the four that suit a 20-foot wall it ate the short ones whole:
  // `container-small` has five ribs and the stack's top tier four, so the block
  // reached the rib the chevron is painted on and the two read as one amber
  // field with a chevron ghosted into it. A third of the run is those same four
  // ribs on the standard wall and leaves every variant a bare rib between the
  // block and the chevron. Two is the floor: the block's field is painted
  // between a pair of ribs, and one rib on its own is a stripe.
  const blockRibs = Math.min(Math.max(2, Math.round(k.ribCount / 3)), blockEnd - 1)
  const blockStart = blockEnd - blockRibs + 1
  for (let index = 0; index < k.ribCount; index += 1) {
    const x = ribX(index)
    const marked = side > 0 ? index : k.ribCount - 1 - index
    const painted = o.ownership !== false && marked >= blockStart && marked <= blockEnd
    const dashed = marked > blockStart + 1
    const height = painted && dashed ? ribHeight * 0.72 : ribHeight
    parent.add(prism(painted ? m.amberPaint : m.shellShade, [0.24, height, 0.052], [x, k.panelCentre, z + side * 0.055], {
      chamfer: 0.03, fillet: 0.01, bevel: 0.012, rotation: [0, side > 0 ? 0 : Math.PI, 0],
    }))
    if (painted && marked === blockStart && marked < blockEnd) {
      const gap = field / k.ribCount
      parent.add(prism(m.amberPaint, [gap - 0.24, height, 0.014], [x + (side > 0 ? gap * 0.5 : -gap * 0.5), k.panelCentre, z + side * 0.056], {
        chamfer: 0.012, fillet: 0.005, bevel: 0.005, rotation: [0, side > 0 ? 0 : Math.PI, 0],
      }))
    }
  }
  // Everything applied to the wall is measured from the rib's outer face. Placed
  // at the rib's centre plane - which is what `z + side * 0.055` is - a plaque
  // whose plate is designed to embed 3 mm ends up 23 mm inside the corrugation
  // and gets sliced by it, and the seams cut their grooves in mid-rib.
  const ribZ = z + side * k.ribFace
  for (const y of [k.panelCentre - ribHeight * 0.5 - 0.03, k.panelCentre + ribHeight * 0.5 + 0.03]) {
    seam(parent, m.shell, field, [0, y, ribZ], face, 'across', 0.034, 0.022)
  }

  // The chevron is painted on the outermost rib and sits three eighths of the
  // way up the rib field, so it lands on corrugation whatever the length. Put
  // at `±length*0.4` and a fixed drop from the roof it hung 131 mm off the end
  // of `container-small`'s panel and dangled 190 mm below it, and 133 mm off
  // the short one's: neither number knows that the panel stops a casting short
  // of the box at each end and a skirt short of the ground.
  const chevronX = side * ribX(0)
  paintMark(parent, m.amberPaint, slashProfile(0.1, 0.44, 0.5), [chevronX, k.panelCentre - ribHeight * 0.125, ribZ], face, 0.012)
  // The manifest plaque follows the chevron inboard by half of each of their
  // widths and 40 mm of air, so the pair reads as one group at six metres and
  // still fits at two. At `±length*0.3` its plate overhung the small unit's
  // panel by 67 mm and stopped 9 mm inside the short one's.
  const label = addLabelDecal(bundle, { variant: (o.variant ?? 0) + (side > 0 ? 3 : 7) })
  plaque(parent, m, label, [0.6, 0.3], [chevronX + side * 0.52, o.height - 0.66, ribZ], face, m.shellLight)
  statusLens(parent, m, [0.07, 0.24], [lampX, o.height - 0.62, ribZ], m.amber, face)
  statusLens(parent, m, [0.07, 0.16], [lampX, o.height - 1.02, ribZ], m.cyan, face)
}

function endWall(
  parent: Group,
  m: CargoMaterials,
  bundle: CargoMaterialBundle,
  o: ContainerShellOptions,
  k: ContainerMetrics,
  sign: -1 | 1,
): void {
  const x = sign * (o.length * 0.5 - 0.09)
  const face = sign > 0 ? 'right' : 'left'
  const yaw = sign > 0 ? Math.PI / 2 : -Math.PI / 2
  // Wide enough to lap the corner posts, whose inner faces are at
  // `±(width*0.5 - casting*0.5 - casting*0.315)`. At the previous +0.04 the
  // panel stopped 35.5 mm short of each post and left a vertical slit up the
  // full height of both end-wall edges.
  parent.add(prism(m.shell, [o.width - k.casting * 2 + 0.18, k.panelHeight, 0.11], [x, k.panelCentre, 0], {
    chamfer: 0.05, fillet: 0.018, bevel: 0.02, rotation: [0, yaw, 0],
  }))
  for (let index = 0; index < 5; index += 1) {
    const z = (index / 4 - 0.5) * (o.width - 0.75)
    parent.add(prism(m.shellShade, [0.17, k.panelHeight - 0.12, 0.055], [x + sign * 0.055, k.panelCentre, z], {
      chamfer: 0.05, fillet: 0.016, bevel: 0.014, rotation: [0, yaw, 0],
    }))
  }
  parent.add(prism(m.graphite, [o.width - k.casting * 2 + 0.04, k.skirt, 0.14], [x, k.skirt * 0.5 + 0.02, 0], {
    chamfer: 0.05, fillet: 0.018, bevel: 0.016, rotation: [0, yaw, 0],
  }))
  const label = addLabelDecal(bundle, { variant: (o.variant ?? 0) + 11 })
  plaque(parent, m, label, [0.62, 0.3], [x + sign * END_RIB_FACE, o.height - 0.7, 0.42 * sign], face, m.shellLight)
}

/** Builds the closed part of a container: frame, skirt, walls, and roof. */
export function containerShell(
  parent: Group,
  m: CargoMaterials,
  bundle: CargoMaterialBundle,
  options: ContainerShellOptions,
): ContainerMetrics {
  const k = containerMetrics(options)
  frame(parent, m, options, k)
  skirtBand(parent, m, bundle, options, k)
  if (options.roof !== false) roofDeck(parent, m, options, k)
  for (const side of [-1, 1] as const) sideWall(parent, m, bundle, options, k, side)
  endWall(parent, m, bundle, options, k, -1)
  if (options.closeDoorEnd) endWall(parent, m, bundle, options, k, 1)
  return k
}

/** The dark surround the door leaves seal against, with its lamp columns. */
export function containerDoorFrame(
  parent: Group,
  m: CargoMaterials,
  options: ContainerDimensions,
): void {
  const casting = options.casting ?? DEFAULT_CASTING
  const x = options.length * 0.5 - 0.14
  // The rebate is derived from the leaves it stops. They are
  // `(width - casting*2 - 0.1)*0.5` wide and hinge at about
  // `width*0.5 - casting`, so an inner face at `width*0.5 - casting - 0.08`
  // takes a 60 mm lap off each leaf and still leaves the head and sill bars,
  // which reach `width*0.5 - casting - 0.05`, lapping the jamb by 30 mm. Cut to
  // a flat 0.34 the rebate scaled with nothing: it left `container-small` a 0.72
  // clear opening for a 1.08-wide pair and hid 430 mm of door behind the frame.
  const jambDepth = casting - 0.03
  const jambZ = options.width * 0.5 - casting * 0.5 - 0.095
  for (const sz of [-1, 1]) {
    box(parent, m.ink, [0.2, options.height - casting - 0.1, jambDepth], [x, options.height * 0.5 - 0.05, sz * jambZ], { chamfer: 0.05 })
    const lamps = Math.max(2, Math.round((options.height - 1.0) / 0.65))
    for (let index = 0; index < lamps; index += 1) {
      const y = 0.75 + (index / Math.max(1, lamps - 1)) * (options.height - 1.5)
      statusLens(parent, m, [0.05, 0.2], [x + 0.1, y, sz * jambZ], sz > 0 ? m.amber : m.cyan, 'right')
    }
  }
  box(parent, m.ink, [0.2, 0.28, options.width - casting * 2 - 0.1], [x, options.height - 0.36, 0], { chamfer: 0.05 })
  box(parent, m.ink, [0.2, 0.3, options.width - casting * 2 - 0.1], [x, 0.36, 0], { chamfer: 0.05 })
}

export interface DoorLeafOptions extends ContainerDimensions {
  /** +1 for the leaf hinged on -Z, -1 for the leaf hinged on +Z. */
  readonly side: -1 | 1
  readonly variant?: number
  /**
   * This leaf's hinge offset from the door centreline, which makes it the leaf
   * that shuts second and carries the closing strip. The leaf that shuts first
   * leaves it out.
   */
  readonly closingStrip?: number
}

/**
 * One door leaf, authored around its hinge line so `rotation.y` is the door
 * angle and nothing has to be rebuilt to open it.
 */
export function containerDoorLeaf(
  leaf: Group,
  m: CargoMaterials,
  bundle: CargoMaterialBundle,
  options: DoorLeafOptions,
): void {
  const casting = options.casting ?? DEFAULT_CASTING
  const width = (options.width - casting * 2 - 0.1) * 0.5
  const height = options.height - 0.5
  const side = options.side
  const centre = side * width * 0.5

  leaf.add(prism(m.shellLight, [width, height, 0.1], [0, height * 0.5 + 0.24, centre], {
    chamfer: 0.05, fillet: 0.018, bevel: 0.018, rotation: [0, Math.PI / 2, 0],
  }))
  for (const y of [height * 0.32, height * 0.72]) {
    leaf.add(prism(m.shell, [width - 0.16, 0.42, 0.04], [0.055, y, centre], {
      chamfer: 0.06, fillet: 0.02, bevel: 0.014, rotation: [0, Math.PI / 2, 0],
    }))
  }
  for (const offset of [-0.24, 0.24]) {
    const z = centre + offset * side
    leaf.add(cylinder(m.steel, 0.026, height - 0.16, [0.115, height * 0.5 + 0.24, z], AXIS_Y, 10))
    for (const y of [0.42, options.height - 0.42]) {
      leaf.add(prism(m.graphiteEdge, [0.11, 0.14, 0.1], [0.1, y, z], { chamfer: 0.03, fillet: 0.01, bevel: 0.008 }))
      leaf.add(cylinder(m.ink, 0.038, 0.09, [0.14, y, z], AXIS_X, 8))
    }
    leaf.add(prism(m.graphite, [0.12, 0.3, 0.11], [0.1, options.height * 0.5, z], { chamfer: 0.035, fillet: 0.012, bevel: 0.01 }))
    // Short enough, and set in far enough, that the two inner bars stop short of
    // the centreline instead of reaching 190 mm past it into the other leaf's
    // bar - two identical boxes in the same place, in the same paint.
    leaf.add(prism(m.amberPaint, [0.1, 0.09, 0.26], [0.16, options.height * 0.5, z + side * 0.09], { chamfer: 0.028, fillet: 0.01, bevel: 0.008 }))
    leaf.add(cylinder(m.steel, 0.02, 0.13, [0.19, options.height * 0.5, z], AXIS_X, 8))
  }
  for (const y of [0.5, options.height * 0.5, options.height - 0.5]) {
    leaf.add(prism(m.graphiteEdge, [0.17, 0.19, 0.1], [0.08, y, 0], { chamfer: 0.03, fillet: 0.012, bevel: 0.01 }))
    leaf.add(cylinder(m.steel, 0.036, 0.24, [0.13, y, 0], AXIS_Y, 10))
  }
  // The leaf's skin is 0.1 thick about x = 0, so its face is at 0.05, and the
  // pressed sub-panels are 0.04 thick at x = 0.055, so theirs is at 0.075.
  // Everything applied here was placed at 0.108 - past both - and floated by
  // 25 to 55 mm across the whole door.
  recessedHandle(leaf, m, [0.24, 0.1], [0.05, options.height * 0.62, centre - side * 0.02], 'right')
  const stripe = addStripeDecal(bundle, { count: 4, lean: -side })
  plaque(leaf, m, stripe, [0.5, 0.13], [0.075, 0.62, centre], 'right', m.ink)
  boltRun(leaf, m.steel, [0.05, 0.36, centre - width * 0.36], [0.05, 0.36, centre + width * 0.36], 5, 0.02, 'right')

  // Each leaf is half the clear opening, so a shut pair meets on a mathematical
  // point and the 0.1 taken out for clearance is a 60 mm slit - 70 mm on the
  // small unit - that you see the cross members through. The strip sits behind
  // the joint and laps both skins by 40 mm. Hinging the pair further in would
  // bring them edge to edge instead, but the lock bars are set out from each
  // leaf's own centre and would then cross the shut line and duplicate each
  // other, so the lap is the only fix that survives both.
  if (options.closingStrip !== undefined) {
    const hinge = options.closingStrip
    box(leaf, m.shell, [0.06, options.height - 0.62, (hinge - width) * 2 + 0.08], [-0.06, height * 0.5 + 0.24, side * hinge], {
      chamfer: 0.02, fillet: 0.008, bevel: 0.007,
    })
  }
}
