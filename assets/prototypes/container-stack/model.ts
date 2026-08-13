import { Group, Object3D } from 'three/webgpu'

import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  AXIS_Y,
  acquireCargoMaterials,
  box,
  containerDoorFrame,
  containerDoorLeaf,
  containerMetrics,
  containerShell,
  createCargoPreview,
  finishModel,
  socket,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
  type ContainerShellOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay container stack — three units block-stowed with twistlocks.
 *
 * A yard-filling asset. It exists so a level can get a three-high bay from one
 * placement, and so the stack is *stowed correctly*: doors all facing the same
 * way, the short unit on top rather than buried, twistlocks visible in every
 * casting interface, and a lashing rod down the exposed corner.
 *
 * Rib density is dialled back on the upper tiers. Nobody reads corrugation at
 * six metres up, and paying full rib count three times over is the difference
 * between a prop that ships and one that gets cut for budget.
 */

const BASE: ContainerShellOptions = {
  length: 6.06,
  width: 2.44,
  height: 2.59,
  ribPitch: 0.55,
  variant: 100,
}
const TOP: ContainerShellOptions = {
  ...BASE,
  length: 3.02,
  ribPitch: 0.62,
  forkPockets: false,
  variant: 130,
}

interface StackSockets {
  lift_top: Object3D
  door_face: Object3D
  lash_corner: Object3D
  ground_centre: Object3D
}

export interface ContainerStackController {
  root: Group
  sockets: StackSockets
  update(deltaSeconds: number): void
  dispose(): void
}

/** Twistlock cones between two castings. */
function twistlocks(root: Group, m: CargoMaterials, spec: ContainerShellOptions, y: number, offsetX: number): void {
  const k = containerMetrics(spec)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = offsetX + sx * (spec.length * 0.5 - k.casting * 0.5)
      const z = sz * (spec.width * 0.5 - k.casting * 0.5)
      root.add(cylinder(m.steel, 0.058, 0.11, [x, y, z], AXIS_Y, 8))
      root.add(cylinder(m.amberPaint, 0.036, 0.13, [x, y, z], AXIS_Y, 6))
    }
  }
}

function tier(
  root: Group,
  m: CargoMaterials,
  bundle: CargoMaterialBundle,
  spec: ContainerShellOptions,
  y: number,
  offsetX: number,
  label: string,
): Group {
  const tierGroup = new Group()
  tierGroup.name = `AXR_CARGO_CONTAINER-STACK_PART_${label}_DEFAULT`
  tierGroup.position.set(offsetX, y, 0)
  root.add(tierGroup)
  const k = containerMetrics(spec)
  containerShell(tierGroup, m, bundle, spec)
  containerDoorFrame(tierGroup, m, spec)

  const hinge = spec.width * 0.5 - k.casting - 0.02
  for (const side of [1, -1] as const) {
    const leaf = new Group()
    leaf.name = `AXR_CARGO_CONTAINER-STACK_PART_${label}-DOOR-${side > 0 ? 'LEFT' : 'RIGHT'}_CLOSED`
    // The leaves hang behind the door frame's head and sill bars, whose inboard
    // face is at `length*0.5 - 0.24`; set 130 mm further forward the 0.1-thick
    // skins ran straight through both of them.
    leaf.position.set(spec.length * 0.5 - 0.285, 0, -side * hinge)
    tierGroup.add(leaf)
    containerDoorLeaf(leaf, m, bundle, { ...spec, side, closingStrip: side === 1 ? hinge : undefined })
  }
  return tierGroup
}

function build(): { root: Group; sockets: StackSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(57_400, { condition: 0.66 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_CONTAINER-STACK_ROOT_DEFAULT'

  tier(root, m, bundle, BASE, 0, 0, 'TIER-A')
  twistlocks(root, m, BASE, BASE.height + 0.055, 0)
  tier(root, m, bundle, BASE, BASE.height + 0.11, 0, 'TIER-B')
  // The short unit is stowed against the door end, which is how a part-load is
  // actually placed: hard up against the face the yard works from.
  const topOffset = BASE.length * 0.5 - TOP.length * 0.5
  const k = containerMetrics(BASE)
  // Only the fore pair of the short unit's cones lands on tier B's casting
  // line; the aft pair stands over open roof deck, 45 mm below it. A bearing
  // pad brings the deck up to the casting plane so both pairs carry load.
  const seat = BASE.height * 2 + 0.11
  for (const sz of [-1, 1]) {
    box(root, m.graphite, [0.34, 0.09, 0.3], [
      topOffset - (TOP.length * 0.5 - k.casting * 0.5),
      seat - 0.025,
      sz * (BASE.width * 0.5 - k.casting * 0.5),
    ], { chamfer: 0.03, fillet: 0.012, bevel: 0.01 })
  }
  twistlocks(root, m, TOP, BASE.height * 2 + 0.165, topOffset)
  tier(root, m, bundle, TOP, BASE.height * 2 + 0.22, topOffset, 'TIER-C')

  // Lashing rod down the exposed aft corner, with its turnbuckle at deck level.
  // It runs against the corner castings, which reach `width*0.5` - the only
  // thing on the aft corner line for it to bear on. Held out at +0.06 it stood
  // 9 to 28 mm clear of everything for its whole 5.4 m.
  const rodX = -BASE.length * 0.5 + 0.2
  const rodZ = BASE.width * 0.5 + 0.01
  root.add(cylinder(m.steel, 0.026, BASE.height * 2 + 0.2, [rodX, BASE.height + 0.1, rodZ], [0, 0, 0.035], 8))
  box(root, m.amberPaint, [0.09, 0.22, 0.08], [rodX + 0.03, 0.42, rodZ], { chamfer: 0.022, fillet: 0.008, bevel: 0.007 })
  root.add(cylinder(m.steel, 0.014, 0.12, [rodX + 0.03, 0.42, rodZ + 0.04], AXIS_X, 8))
  box(root, m.graphiteEdge, [0.16, 0.1, 0.14], [rodX + 0.02, 0.05, rodZ], { chamfer: 0.03, fillet: 0.011, bevel: 0.009 })

  const top = BASE.height * 2 + 0.22 + TOP.height
  const sockets: StackSockets = {
    lift_top: socket('lift_top', [topOffset, top, 0]),
    door_face: socket('door_face', [BASE.length * 0.5 + 0.2, BASE.height * 0.5, 0]),
    lash_corner: socket('lash_corner', [rodX, 0.42, rodZ]),
    ground_centre: socket('ground_centre', [0, 0, 0]),
  }
  return { root, sockets, bundle }
}

export function createModel(): ContainerStackController {
  const { root, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'container-stack',
    reach: 0.4,
    sockets: Object.values(sockets),
  })
  let elapsed = 0
  return {
    root,
    sockets,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      bundle.materials.amber.emissiveIntensity = 2.0 + Math.sin(elapsed * 1.3) * 0.2
    },
    dispose: finished.dispose,
  }
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  createCargoPreview(createModel(), {
    target: [0, BASE.height * 1.4, 0],
    distance: 21,
    yaw: 0.8,
    pitch: 0.2,
    fov: 30,
    ...options,
  })
