import { Group, Object3D } from 'three/webgpu'

import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  acquireCargoMaterials,
  addLabelDecal,
  addStripeDecal,
  bolt,
  box,
  createCargoPreview,
  finishModel,
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

  box(root, m.graphite, [w - 0.03, skirt, d - 0.03], [x, y + skirt * 0.5, z], {
    chamfer: 0.035, fillet: 0.012, bevel: 0.01, rotation,
  })
  box(root, unit.light ? m.shell : m.shellShade, [w, h - skirt - lid, d], [x, y + skirt + (h - skirt - lid) * 0.5, z], {
    chamfer: 0.06, fillet: 0.02, bevel: 0.016, capChamfer: 0.04, rotation,
  })
  box(root, unit.light ? m.shellLight : m.shell, [w + 0.014, lid, d + 0.014], [x, y + h - lid * 0.5, z], {
    chamfer: 0.055, fillet: 0.018, bevel: 0.014, capChamfer: 0.035, rotation,
  })
  box(root, m.ink, [w - 0.22, 0.02, d - 0.16], [x, y + h + 0.004, z], {
    chamfer: 0.045, fillet: 0.016, bevel: 0.008, rotation,
  })
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cx = x + Math.cos(unit.yaw) * sx * (w * 0.5 - 0.05) - Math.sin(unit.yaw) * sz * (d * 0.5 - 0.05)
      const cz = z + Math.sin(unit.yaw) * sx * (w * 0.5 - 0.05) + Math.cos(unit.yaw) * sz * (d * 0.5 - 0.05)
      box(root, m.graphiteEdge, [0.1, h - skirt - lid + 0.01, 0.1], [cx, y + skirt + (h - skirt - lid) * 0.5, cz], {
        chamfer: 0.035, fillet: 0.012, bevel: 0.009, rotation,
      })
    }
  }
  for (let index = 0; index < unit.latches; index += 1) {
    const offset = (index - (unit.latches - 1) * 0.5) * (w * 0.42)
    toggleLatch(root, m, [
      x + Math.cos(unit.yaw) * offset + Math.sin(unit.yaw) * (d * 0.5 + 0.004),
      y + h - lid - 0.01,
      z + Math.sin(unit.yaw) * offset + Math.cos(unit.yaw) * (d * 0.5 + 0.004),
    ], 0.62, 'front')
  }
  if (tag === 0) {
    const label = addLabelDecal(bundle, { variant: 44 })
    plaque(root, m, label, [0.24, 0.1], [x, y + h * 0.5, z + d * 0.5 + 0.006], 'front', m.shellLight)
  }
  if (tag === 1) {
    paintMark(root, m.amberPaint, slashProfile(0.07, 0.16, 0.45), [x - 0.06, y + h * 0.5, z + d * 0.5 + 0.004], 'front', 0.01)
    paintMark(root, m.amberPaint, slashProfile(0.035, 0.16, 0.45), [x + 0.03, y + h * 0.5, z + d * 0.5 + 0.004], 'front', 0.01)
  }
  if (tag === 4) statusLens(root, m, [0.06, 0.024], [x, y + h * 0.5, z + d * 0.5 + 0.004], m.cyan, 'front')
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
  const stripe = addStripeDecal(bundle, { count: 6, lean: 1 })
  plaque(root, m, stripe, [0.5, 0.055], [0, SKID_H * 0.5, SKID_D * 0.5 - 0.06], 'front', m.ink)
  for (const sx of [-1, 1]) {
    bolt(root, m.steel, [sx * (SKID * 0.5 - 0.1), SKID_H * 0.6, SKID_D * 0.5 - 0.06], 0.016, 'front')
  }

  const deck = SKID_H + 0.028
  for (const [index, unit] of UNITS.entries()) {
    crate(root, m, unit, deck + unit.lift, index, bundle)
  }

  // One strap over the whole stack, with its ratchet on the front runner.
  const top = deck + Math.max(...UNITS.map((unit) => unit.lift + unit.size[1]))
  for (const sx of [-1, 1]) {
    box(root, m.webbing, [0.08, 0.012, SKID_D + 0.05], [sx * 0.24, top + 0.012, 0], {
      chamfer: 0.005, fillet: 0.003, bevel: 0.003,
    })
    box(root, m.webbing, [0.08, top - SKID_H, 0.012], [sx * 0.24, SKID_H + (top - SKID_H) * 0.5, SKID_D * 0.5 + 0.02], {
      chamfer: 0.005, fillet: 0.003, bevel: 0.003,
    })
  }
  box(root, m.amberPaint, [0.1, 0.14, 0.05], [0.24, SKID_H + 0.36, SKID_D * 0.5 + 0.04], {
    chamfer: 0.024, fillet: 0.009, bevel: 0.007,
  })
  root.add(cylinder(m.steel, 0.015, 0.13, [0.24, SKID_H + 0.36, SKID_D * 0.5 + 0.07], AXIS_X, 8))
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
