import { Group, Object3D } from 'three/webgpu'

import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_Y,
  acquireCargoMaterials,
  addLabelDecal,
  addStripeDecal,
  bolt,
  box,
  cornerCasting,
  createCargoPreview,
  finishModel,
  paintMark,
  plaque,
  seam,
  slashProfile,
  socket,
  statusLens,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
  type Face,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay square cargo module.
 *
 * A cube with no privileged face: the module that gets stacked six deep in a
 * hold and read from whichever side happens to face the aisle. Every vertical
 * face carries the same X-braced panel, and identity is carried by the top
 * hatch and the corner castings rather than by a "front".
 *
 * That symmetry is the design, not a shortcut. A cube with one detailed face
 * looks wrong the moment two of them are placed back to back, which is the only
 * way this prop is ever used.
 */

const SIZE = 0.96
const SKIRT = 0.11
const HATCH = 0.34

interface SquareCrateSockets {
  hatch_centre: Object3D
  stack_top: Object3D
  lift_north: Object3D
  lift_south: Object3D
}

export interface SquareCrateController {
  root: Group
  sockets: SquareCrateSockets
  update(deltaSeconds: number): void
  dispose(): void
}

const SIDES: ReadonlyArray<{ face: Face; position: [number, number, number]; sign: number }> = [
  { face: 'front', position: [0, 0, 1], sign: 1 },
  { face: 'back', position: [0, 0, -1], sign: -1 },
  { face: 'right', position: [1, 0, 0], sign: 1 },
  { face: 'left', position: [-1, 0, 0], sign: -1 },
]

function sidePanel(
  root: Group,
  m: CargoMaterials,
  bundle: CargoMaterialBundle,
  face: Face,
  axis: [number, number, number],
  index: number,
): void {
  const bodyY = SKIRT + (SIZE - SKIRT) * 0.5
  const outer = SIZE * 0.5 + 0.004
  const at = (u: number, v: number, out: number): [number, number, number] => [
    axis[0] * (outer + out) + (axis[0] === 0 ? u : 0),
    bodyY + v,
    axis[2] * (outer + out) + (axis[2] === 0 ? u : 0),
  ]

  // Recessed field with a diagonal brace across it. The brace is real geometry
  // so the crate self-shadows differently on each side as it turns.
  box(root, m.shellShade, [0.66, 0.5, 0.026], at(0, -0.02, 0), {
    chamfer: 0.07, fillet: 0.02, bevel: 0.012,
    rotation: face === 'right' || face === 'left' ? [0, Math.PI / 2, 0] : [0, 0, 0],
  })
  paintMark(root, m.graphiteEdge, slashProfile(0.075, 0.44, 0.95), at(0, -0.02, 0.016), face, 0.014)
  paintMark(root, m.graphiteEdge, slashProfile(0.075, 0.44, -0.95), at(0, -0.02, 0.022), face, 0.014)

  seam(root, m.shell, SIZE - 0.28, at(0, 0.3, 0.004), face, 'across', 0.028, 0.018)
  seam(root, m.shell, SIZE - 0.28, at(0, -0.32, 0.004), face, 'across', 0.028, 0.018)

  if (index === 0) {
    const label = addLabelDecal(bundle, { variant: 9 })
    plaque(root, m, label, [0.3, 0.13], at(0, 0.24, 0.006), face, m.shellLight)
    statusLens(root, m, [0.09, 0.035], at(0.24, 0.24, 0.006), m.amber, face)
  } else if (index === 2) {
    const stripe = addStripeDecal(bundle, { count: 4, lean: 1 })
    plaque(root, m, stripe, [0.34, 0.09], at(0, 0.25, 0.006), face, m.ink)
  } else {
    box(root, m.graphite, [0.16, 0.1, 0.024], at(-0.2, 0.25, 0.006), {
      chamfer: 0.03, fillet: 0.01, bevel: 0.008,
      rotation: face === 'right' || face === 'left' ? [0, Math.PI / 2, 0] : [0, 0, 0],
    })
  }
  bolt(root, m.steel, at(-0.34, -0.34, 0.004), 0.018, face)
  bolt(root, m.steel, at(0.34, -0.34, 0.004), 0.018, face)
}

function build(): { root: Group; sockets: SquareCrateSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(52_600, { condition: 0.52 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_SQUARE-CARGO-CRATE_ROOT_DEFAULT'

  const bodyHeight = SIZE - SKIRT
  const bodyY = SKIRT + bodyHeight * 0.5
  box(root, m.graphite, [SIZE - 0.04, SKIRT, SIZE - 0.04], [0, SKIRT * 0.5, 0], {
    chamfer: 0.05, fillet: 0.016, bevel: 0.014, capChamfer: 0.035,
  })
  box(root, m.shell, [SIZE, bodyHeight, SIZE], [0, bodyY, 0], {
    chamfer: 0.1, fillet: 0.032, bevel: 0.022, capChamfer: 0.075,
  })

  // Castings on all eight corners, bored on the vertical axis, because a cube
  // module is lifted and locked from above wherever it sits in a stack.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (SIZE * 0.5 - 0.115)
      const z = sz * (SIZE * 0.5 - 0.115)
      box(root, m.graphiteEdge, [0.18, bodyHeight - 0.03, 0.18], [x, bodyY, z], {
        chamfer: 0.065, fillet: 0.018, bevel: 0.013,
      })
      cornerCasting(root, m, [0.2, 0.15, 0.2], [x, SIZE - 0.075, z], 0.04, 'y', m.shellLight)
      box(root, m.amberPaint, [0.19, 0.055, 0.19], [x, 0.028, z], {
        chamfer: 0.045, fillet: 0.014, bevel: 0.01,
      })
    }
  }

  for (const [index, side] of SIDES.entries()) {
    sidePanel(root, m, bundle, side.face, side.position, index)
  }

  // Top hatch: a real sunk ring with a quarter-turn wheel, so the cube has one
  // way in and it is visible from above where a crane operator sits.
  box(root, m.ink, [HATCH + 0.11, 0.045, HATCH + 0.11], [0, SIZE - 0.012, 0], {
    chamfer: 0.06, fillet: 0.018, bevel: 0.01,
  })
  box(root, m.shellShade, [HATCH, 0.05, HATCH], [0, SIZE + 0.004, 0], {
    chamfer: 0.055, fillet: 0.016, bevel: 0.01,
  })
  root.add(cylinder(m.graphiteEdge, 0.086, 0.05, [0, SIZE + 0.03, 0], AXIS_Y, 12))
  root.add(cylinder(m.amberPaint, 0.062, 0.042, [0, SIZE + 0.05, 0], AXIS_Y, 6))
  root.add(cylinder(m.steel, 0.02, 0.055, [0, SIZE + 0.062, 0], AXIS_Y, 8))
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      bolt(root, m.steel, [sx * HATCH * 0.42, SIZE + 0.03, sz * HATCH * 0.42], 0.016, 'top')
    }
  }

  const sockets: SquareCrateSockets = {
    hatch_centre: socket('hatch_centre', [0, SIZE + 0.08, 0]),
    stack_top: socket('stack_top', [0, SIZE, 0]),
    lift_north: socket('lift_north', [0, SIZE - 0.075, -(SIZE * 0.5 - 0.115)]),
    lift_south: socket('lift_south', [0, SIZE - 0.075, SIZE * 0.5 - 0.115]),
  }
  return { root, sockets, bundle }
}

export function createModel(): SquareCrateController {
  const { root, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'square-cargo-crate',
    reach: 0.15,
    sockets: Object.values(sockets),
  })
  let elapsed = 0
  return {
    root,
    sockets,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      bundle.materials.amber.emissiveIntensity = 2.0 + Math.sin(elapsed * 1.7) * 0.25
    },
    dispose: finished.dispose,
  }
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  createCargoPreview(createModel(), {
    target: [0, SIZE * 0.5, 0],
    distance: 2.85,
    yaw: 0.76,
    pitch: 0.34,
    fov: 30,
    ...options,
  })
