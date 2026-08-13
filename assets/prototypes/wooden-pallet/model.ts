import { Group, Object3D } from 'three/webgpu'

import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_Y,
  acquireCargoMaterials,
  box,
  createCargoPreview,
  finishModel,
  paintMark,
  seam,
  slashProfile,
  socket,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay timber pallet.
 *
 * The pack's one piece of old-world material, and it earns its place: a depot
 * that is entirely coated alloy has no texture contrast, and the timber pallet
 * is what everything else gets stacked on. Its language is the opposite of the
 * kit's - sawn ends, split corners, uneven board gaps, and fasteners that are
 * driven rather than seated.
 *
 * Board spacing is deliberately irregular. A perfectly even deck reads as
 * extruded plastic; real pallets are built to a nailing pattern, not a ruler.
 */

const LENGTH = 1.2
const WIDTH = 0.8
const BLOCK = 0.09
const BOARD = 0.022

interface PalletSockets {
  deck_centre: Object3D
  fork_long: Object3D
  fork_short: Object3D
}

export interface PalletController {
  root: Group
  sockets: PalletSockets
  dispose(): void
}

/** Deck board with a sawn end and a rubbed top face. */
function board(
  parent: Group,
  m: CargoMaterials,
  size: [number, number, number],
  position: [number, number, number],
): void {
  box(parent, m.timber, size, position, {
    chamfer: 0.008,
    fillet: 0.004,
    bevel: 0.005,
    capChamfer: 0.006,
  })
}

function build(): { root: Group; sockets: PalletSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(55_000, { condition: 0.85 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_WOODEN-PALLET_ROOT_DEFAULT'

  const bottomY = BOARD * 0.5
  const blockY = BOARD + BLOCK * 0.5
  const topY = BOARD + BLOCK + BOARD * 0.5

  // Bottom boards: three runs across the width.
  for (const z of [-WIDTH * 0.5 + 0.05, 0, WIDTH * 0.5 - 0.05]) {
    board(root, m, [LENGTH, BOARD, 0.1], [0, bottomY, z])
  }
  // Blocks: nine, on the classic three-by-three nailing pattern.
  for (const x of [-LENGTH * 0.5 + 0.06, 0, LENGTH * 0.5 - 0.06]) {
    for (const z of [-WIDTH * 0.5 + 0.05, 0, WIDTH * 0.5 - 0.05]) {
      box(root, m.timber, [0.12, BLOCK, 0.1], [x, blockY, z], {
        chamfer: 0.01, fillet: 0.005, bevel: 0.006,
      })
    }
  }
  // Stringer boards tie the blocks along the length. Cut 8 mm narrower than the
  // blocks they run through: sawn to the same 0.1 they shared both side planes
  // with every block for the pallet's whole length, which is four coincident
  // same-facing faces per block and the flicker down both flanks.
  for (const z of [-WIDTH * 0.5 + 0.05, 0, WIDTH * 0.5 - 0.05]) {
    board(root, m, [LENGTH, BOARD, 0.092], [0, topY - BOARD, z])
  }

  // Deck: seven boards at an irregular pitch, two of them noticeably narrower.
  const widths = [0.1, 0.07, 0.1, 0.1, 0.07, 0.1, 0.1]
  const total = widths.reduce((sum, value) => sum + value, 0)
  const gap = (WIDTH - total) / (widths.length - 1)
  let cursor = -WIDTH * 0.5
  for (const [index, width] of widths.entries()) {
    const z = cursor + width * 0.5
    cursor += width + gap
    board(root, m, [LENGTH, BOARD, width], [0, topY, z])
    // A single cut down the middle of the two long boards, where a fork has
    // scored them over the pallet's life.
    if (index === 2 || index === 4) {
      seam(root, m.timber, LENGTH - 0.14, [0, topY + BOARD * 0.5, z], 'top', 'across', 0.012, 0.006)
    }
    // Nails driven flush, not bolts seated proud. `bolt()` stands its head 23 mm
    // above the face it is given - taller than the 22 mm board it is holding
    // down - and at yaw 0 the seven heads on the centreline queue up one behind
    // another and read as a single spike above the deck in `front` and `back`.
    // An 8 mm head bedded half its depth into the timber is what driving one in
    // actually leaves.
    for (const x of [-LENGTH * 0.5 + 0.06, 0, LENGTH * 0.5 - 0.06]) {
      root.add(cylinder(m.ironOxide, 0.009, 0.008, [x, topY + BOARD * 0.5, z], AXIS_Y, 6))
    }
  }

  // Depot marking: one sprayed slash, half of it worn away, and a yard placard.
  // Both sit on a corner block. The block is the only continuous 120 x 90 face
  // this flank has - the band above it is stringer and deck board with a fork
  // opening under them, so a 55 mm mark placed there hangs off into the tunnel.
  const blockFace = WIDTH * 0.5
  const markX = LENGTH * 0.5 - 0.06
  paintMark(root, m.orangePaint, slashProfile(0.032, 0.055, 0.5), [markX - 0.026, blockY, blockFace], 'front', 0.008)
  paintMark(root, m.orangePaint, slashProfile(0.022, 0.055, 0.5), [markX + 0.028, blockY, blockFace], 'front', 0.008)
  box(root, m.shellShade, [0.1, 0.05, 0.008], [-LENGTH * 0.5 + 0.06, blockY, blockFace], {
    chamfer: 0.008, fillet: 0.004, bevel: 0.003,
  })

  const sockets: PalletSockets = {
    deck_centre: socket('deck_centre', [0, topY + BOARD * 0.5, 0]),
    fork_long: socket('fork_long', [0, blockY, WIDTH * 0.5]),
    fork_short: socket('fork_short', [LENGTH * 0.5, blockY, 0]),
  }
  return { root, sockets, bundle }
}

export function createModel(): PalletController {
  const { root, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'wooden-pallet',
    reach: 0.1,
    sockets: Object.values(sockets),
  })
  return { root, sockets, dispose: finished.dispose }
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  createCargoPreview(createModel(), {
    target: [0, 0.09, 0],
    distance: 2.35,
    yaw: 0.78,
    pitch: 0.4,
    fov: 30,
    ...options,
  })
