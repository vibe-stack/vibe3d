import { Group, Object3D } from 'three/webgpu'

import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  FACE_CLEARANCE,
  acquireCargoMaterials,
  addLabelDecal,
  addStripeDecal,
  bolt,
  box,
  createCargoPreview,
  finishModel,
  member,
  paintMark,
  plaque,
  seam,
  slashProfile,
  socket,
  statusLens,
  toggleLatch,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay crate stack — five mixed crates strapped to a skid.
 *
 * A composition asset rather than a new crate: it exists so a dresser can fill a
 * bay with one placement instead of hand-stacking, and so the stack is *right* -
 * heavy units on the bottom, footprints aligned to the skid, a slight yaw offset
 * on the top unit, and a strap that actually crosses everything it claims to
 * hold.
 *
 * The crates are simplified relatives of the standalone models, not copies. At
 * the distance a stack is read, a full latch and manifest set on every unit is
 * geometry nobody sees.
 */

const SKID = 1.34
const SKID_D = 0.94
const SKID_H = 0.11

interface CrateStackSockets {
  strap_crown: Object3D
  fork_front: Object3D
  stack_top: Object3D
}

export interface CrateStackController {
  root: Group
  sockets: CrateStackSockets
  update(deltaSeconds: number): void
  dispose(): void
}

interface Unit {
  size: [number, number, number]
  at: [number, number]
  /** Base height above the skid deck. Explicit, so nothing can end up floating. */
  lift: number
  yaw: number
  light: boolean
  latches: number
}

/**
 * A four-up base course at one shared height with a two-up second course on top.
 *
 * The base units share a height on purpose. Varying it looks livelier in a list
 * and collapses in the render: the upper course then rests on exactly one crate
 * and hangs in the air over the others, which is the single most common failure
 * of a procedurally stacked prop.
 */
const BASE = 0.4
const UNITS: readonly Unit[] = [
  { size: [0.62, BASE, 0.42], at: [-0.33, -0.23], lift: 0, yaw: 0, light: true, latches: 2 },
  { size: [0.62, BASE, 0.42], at: [0.33, -0.23], lift: 0, yaw: 0.03, light: false, latches: 2 },
  { size: [0.62, BASE, 0.42], at: [-0.33, 0.23], lift: 0, yaw: -0.02, light: false, latches: 2 },
  { size: [0.62, BASE, 0.42], at: [0.33, 0.23], lift: 0, yaw: 0.02, light: true, latches: 2 },
  { size: [0.68, 0.3, 0.5], at: [-0.3, 0], lift: BASE, yaw: 0.09, light: true, latches: 3 },
  { size: [0.56, 0.26, 0.44], at: [0.34, 0.02], lift: BASE, yaw: -0.07, light: false, latches: 0 },
]

/** One simplified crate: skirt, body, lid band, corner posts. */
function crate(root: Group, m: CargoMaterials, unit: Unit, y: number, tag: number, bundle: CargoMaterialBundle): void {
  const [w, h, d] = unit.size
  const [x, z] = unit.at
  const rotation: [number, number, number] = [0, unit.yaw, 0]
  const skirt = h * 0.16
  const lid = h * 0.24
  /**
   * A point on the crate's front skin, `u` along the face and `out` clear of it.
   *
   * A yawed crate's skin is not at `z + d / 2`, so a graphic placed on the
   * unrotated axis lands beside the panel and at an angle to its normal.
   */
  const front = (u: number, v: number, out: number): [number, number, number] => [
    x + Math.cos(unit.yaw) * u + Math.sin(unit.yaw) * (d * 0.5 + out),
    y + v,
    z + Math.sin(unit.yaw) * u + Math.cos(unit.yaw) * (d * 0.5 + out),
  ]

  box(root, m.graphite, [w - 0.03, skirt, d - 0.03], [x, y + skirt * 0.5, z], {
    chamfer: 0.035, fillet: 0.012, bevel: 0.01, rotation,
  })
  box(root, unit.light ? m.shell : m.shellShade, [w, h - skirt - lid, d], [x, y + skirt + (h - skirt - lid) * 0.5, z], {
    chamfer: 0.06, fillet: 0.02, bevel: 0.016, capChamfer: 0.04, rotation,
  })
  box(root, unit.light ? m.shellLight : m.shell, [w + 0.014, lid, d + 0.014], [x, y + h - lid * 0.5, z], {
    chamfer: 0.055, fillet: 0.018, bevel: 0.014, capChamfer: 0.035, rotation,
  })
  // The crown panel stands 4 mm proud, not 14. Any prouder and the crate stacked
  // on it beds into it rather than onto the lid it is supposed to rest on.
  box(root, m.ink, [w - 0.22, 0.02, d - 0.16], [x, y + h - 0.006, z], {
    chamfer: 0.045, fillet: 0.016, bevel: 0.008, rotation,
  })
  // Corner posts stand 5 mm proud on both axes; sized flush their outer faces
  // were the body's own on all four flanks.
  //
  // The corner is carried round the yaw the same way the box itself is, which
  // is `[cos, sin; -sin, cos]`. Turned the other way the four posts came out
  // rotated by twice the crate's yaw about its own centre - 41 mm off the
  // corners of this unit and 64 mm off the wide one's - which sank two of them
  // into the body far enough to lay their chamfers on its own.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cx = x + Math.cos(unit.yaw) * sx * (w * 0.5 - 0.045) + Math.sin(unit.yaw) * sz * (d * 0.5 - 0.045)
      const cz = z - Math.sin(unit.yaw) * sx * (w * 0.5 - 0.045) + Math.cos(unit.yaw) * sz * (d * 0.5 - 0.045)
      box(root, m.graphiteEdge, [0.1, h - skirt - lid + 0.01, 0.1], [cx, y + skirt + (h - skirt - lid) * 0.5, cz], {
        chamfer: 0.035, fillet: 0.012, bevel: 0.009, rotation,
      })
    }
  }
  for (let index = 0; index < unit.latches; index += 1) {
    const offset = (index - (unit.latches - 1) * 0.5) * (w * 0.42)
    toggleLatch(root, m, front(offset, h - lid - 0.01, 0), 0.62, 'front')
  }
  // Graphics go on the +Z row and are kept out of the latch band, off the corner
  // posts, and clear of the strap that crosses this column. Applied to units 0
  // and 1 they were on the back row, facing into the 40 mm gap between the two
  // rows, so neither appeared in any frame of the sheet.
  const facing: [number, number, number] = [0, unit.yaw, 0]
  if (tag === 2) {
    const label = addLabelDecal(bundle, { variant: 44 })
    plaque(root, m, label, [0.2, 0.09], front(-0.08, h * 0.35, 0), 'front', m.shellLight, 0, facing)
  }
  if (tag === 3) {
    paintMark(root, m.amberPaint, slashProfile(0.06, 0.13, 0.45), front(0.03, h * 0.4, 0), 'front', 0.01)
    paintMark(root, m.amberPaint, slashProfile(0.03, 0.13, 0.45), front(0.14, h * 0.4, 0), 'front', 0.01)
  }
  if (tag === 4) statusLens(root, m, [0.06, 0.024], front(0.14, h * 0.4, 0), m.cyan, 'front', 0, facing)
}

function build(): { root: Group; sockets: CrateStackSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(55_600, { condition: 0.6 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_STACKED-CRATES_ROOT_DEFAULT'

  // Skid: three runners and a deck, sized so every crate footprint lands on it.
  for (const sz of [-1, 0, 1]) {
    box(root, m.graphite, [SKID, SKID_H, 0.16], [0, SKID_H * 0.5, sz * (SKID_D * 0.5 - 0.08)], {
      chamfer: 0.04, fillet: 0.014, bevel: 0.012, capChamfer: 0.028,
    })
  }
  box(root, m.graphiteEdge, [SKID, 0.028, SKID_D], [0, SKID_H + 0.014, 0], {
    chamfer: 0.06, fillet: 0.02, bevel: 0.01,
  })
  // The front runner is 0.16 deep about `SKID_D * 0.5 - 0.08`, so its face is at
  // `SKID_D * 0.5`. Measured 60 mm in from the deck edge, the stripe and both
  // bolts were 20 mm inside the runner and rendered as nothing.
  const stripe = addStripeDecal(bundle, { count: 6, lean: 1 })
  plaque(root, m, stripe, [0.5, 0.055], [0, SKID_H * 0.5, SKID_D * 0.5], 'front', m.ink)
  for (const sx of [-1, 1]) {
    bolt(root, m.steel, [sx * (SKID * 0.5 - 0.1), SKID_H * 0.6, SKID_D * 0.5], 0.016, 'front')
  }

  const deck = SKID_H + 0.028
  for (const [index, unit] of UNITS.entries()) {
    crate(root, m, unit, deck + unit.lift, index, bundle)
  }

  // One strap per column, lying on the crate that column actually carries and
  // running down to the skid on both sides.
  //
  // Both runs used to share the stack's overall top, so the +X run floated 32 mm
  // above the crate under it; the vertical runs stood 44 mm off every face and
  // there was no -Z run at all, which left both crown runs ending in mid-air.
  // The base course's lid band is the outermost thing on the stack, so a
  // tensioned strap lies on it and bridges the set-back second course.
  const top = deck + Math.max(...UNITS.map((unit) => unit.lift + unit.size[1]))
  const strapX = 0.24
  // The lid band is what the run actually bears on: it is 7 mm proud of the
  // 0.42-deep body at |z| = 0.23, so its face is at 0.447 and the 12 mm webbing
  // centres a face clearance inside it. Measured to the skin behind the band
  // instead, the strap's outer face came up 1 mm short of the band's over 49 cm²
  // of the crate it crosses, and it bridges the body under the band the way it
  // already bridges the skirt.
  const strapZ = 0.447 - FACE_CLEARANCE + 0.006
  const baseTop = deck + BASE
  for (const sx of [-1, 1]) {
    const x = sx * strapX
    const column = UNITS.filter((unit) => Math.abs(unit.at[0] - x) < unit.size[0] * 0.5)
    const capping = column.reduce((best, unit) => (
      unit.lift + unit.size[1] > best.lift + best.size[1] ? unit : best
    ))
    const crown = deck + capping.lift + capping.size[1]
    box(root, m.webbing, [0.08, 0.012, capping.size[2] + 0.02], [x, crown + 0.002, capping.at[1]], {
      chamfer: 0.005, fillet: 0.003, bevel: 0.003,
    })
    for (const sz of [-1, 1]) {
      // The run leaves the top crate's edge and lands on the base course's, which
      // is the outermost thing on the stack; a strap does not follow the profile
      // of what it crosses, it spans between the points it bears on.
      member(root, m.webbing,
        [x, crown, capping.at[1] + sz * capping.size[2] * 0.5],
        [x, baseTop, sz * strapZ], 0.012, 0.08)
      box(root, m.webbing, [0.08, baseTop + 0.01 - SKID_H, 0.012], [x, (baseTop + 0.01 + SKID_H) * 0.5, sz * strapZ], {
        chamfer: 0.005, fillet: 0.003, bevel: 0.003,
      })
    }
  }
  // The ratchet grips the +X run rather than hanging 37 mm in front of it, and
  // it rides under the base course's latch band: the keepers are 0.2 x 0.62 tall
  // about a latch line 10 mm below each lid, so the run is only clear below
  // 0.37. Level with them the buckle sat on the lever of the crate behind it,
  // sharing one flank plane with it and coming within 0.15 mm of its face.
  const ratchetZ = strapZ + 0.026
  const ratchetY = baseTop - BASE * 0.24 - 0.01 - 0.2 * 0.62 * 0.5 - FACE_CLEARANCE - 0.07
  box(root, m.amberPaint, [0.1, 0.14, 0.05], [strapX, ratchetY, ratchetZ], {
    chamfer: 0.024, fillet: 0.009, bevel: 0.007,
  })
  root.add(cylinder(m.steel, 0.015, 0.13, [strapX, ratchetY, ratchetZ + 0.03], AXIS_X, 8))
  seam(root, m.graphiteEdge, SKID - 0.2, [0, SKID_H + 0.028, 0], 'top', 'across', 0.026, 0.014)

  const sockets: CrateStackSockets = {
    strap_crown: socket('strap_crown', [0, top + 0.04, 0]),
    fork_front: socket('fork_front', [0, SKID_H * 0.5, SKID_D * 0.5]),
    stack_top: socket('stack_top', [0, top, 0]),
  }
  return { root, sockets, bundle }
}

export function createModel(): CrateStackController {
  const { root, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'stacked-crates',
    reach: 0.18,
    sockets: Object.values(sockets),
  })
  let elapsed = 0
  return {
    root,
    sockets,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      bundle.materials.cyan.emissiveIntensity = 1.5 + Math.sin(elapsed * 1.7) * 0.2
    },
    dispose: finished.dispose,
  }
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  createCargoPreview(createModel(), {
    target: [0, 0.62, 0],
    distance: 4.2,
    yaw: 0.74,
    pitch: 0.28,
    fov: 30,
    ...options,
  })
