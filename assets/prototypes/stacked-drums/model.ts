import { Group, Object3D } from 'three/webgpu'

import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  AXIS_Y,
  acquireCargoMaterials,
  addLabelDecal,
  addStripeDecal,
  box,
  createCargoPreview,
  drum,
  finishModel,
  member,
  paintMark,
  radialPlaque,
  slashProfile,
  socket,
  statusLens,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay drum stack — four drums banded to a pallet with a spacer deck.
 *
 * Placed as one object because that is how a depot actually stores drums, and
 * because four instanced drums plus their restraint is far cheaper than four
 * separate props each carrying its own pallet.
 *
 * The restraint is the design problem. Drums do not stack on their own: they
 * need a deck between tiers and a strap over the top, and leaving either out is
 * what makes a procedural drum stack look like it is about to fall over.
 */

const RADIUS = 0.3
const BODY = 0.74
const PALLET = 0.13
const DECK = 0.07
const SPREAD = 0.33

interface DrumStackSockets {
  fork_left: Object3D
  fork_right: Object3D
  strap_top: Object3D
  stack_top: Object3D
}

export interface DrumStackController {
  root: Group
  sockets: DrumStackSockets
  update(deltaSeconds: number): void
  dispose(): void
}

function pallet(root: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  const span = SPREAD * 2 + RADIUS * 2 + 0.1
  box(root, m.graphite, [span, 0.035, span], [0, PALLET - 0.018, 0], {
    chamfer: 0.05, fillet: 0.018, bevel: 0.012,
  })
  for (const sx of [-1, 0, 1]) {
    box(root, m.graphiteEdge, [0.14, PALLET - 0.035, span], [sx * (span * 0.5 - 0.09), (PALLET - 0.035) * 0.5, 0], {
      chamfer: 0.035, fillet: 0.012, bevel: 0.01,
    })
  }
  box(root, m.ink, [span, 0.028, 0.14], [0, 0.014, 0], { chamfer: 0.03, fillet: 0.01, bevel: 0.008 })
  const stripe = addStripeDecal(bundle, { count: 6, lean: 1 })
  radialPlaque(root, m, stripe, [0.4, 0.05], span * 0.5 - 0.02, PALLET * 0.45, 0, m.ink)
}

/** The banding deck the upper tier sits on, plus its four location cups. */
function spacerDeck(root: Group, m: CargoMaterials, y: number): void {
  const span = SPREAD * 2 + RADIUS * 2 - 0.04
  box(root, m.shellShade, [span, DECK * 0.5, span], [0, y + DECK * 0.25, 0], {
    chamfer: 0.09, fillet: 0.03, bevel: 0.014,
  })
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      root.add(cylinder(m.graphiteEdge, RADIUS * 0.62, DECK * 0.5, [sx * SPREAD, y + DECK * 0.7, sz * SPREAD], AXIS_Y, 14))
    }
  }
  for (const sx of [-1, 1]) {
    member(root, m.steel, [-span * 0.5, y + DECK * 0.5, sx * span * 0.36], [span * 0.5, y + DECK * 0.5, sx * span * 0.36], 0.03, 0.05)
  }
}

function build(): { root: Group; sockets: DrumStackSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(54_600, { condition: 0.72 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_STACKED-DRUMS_ROOT_DEFAULT'
  pallet(root, m, bundle)

  const tierY = [PALLET, PALLET + BODY + DECK]
  for (const [tier, baseY] of tierY.entries()) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        // The back tier is one drum short, so the stack has a readable gap and
        // does not present as a solid block from every angle.
        if (tier === 1 && sx < 0 && sz < 0) continue
        const band = (tier + (sx > 0 ? 1 : 0) + (sz > 0 ? 1 : 0)) % 2 === 0 ? m.ironOxide : m.graphiteEdge
        drum(root, m, RADIUS, BODY, [sx * SPREAD, baseY, sz * SPREAD], {
          hoops: [0.32, 0.64],
          chime: 0.024,
          band,
          segments: 16,
        })
        root.add(cylinder(m.graphite, RADIUS - 0.06, 0.04, [sx * SPREAD, baseY + BODY, sz * SPREAD], AXIS_Y, 14))
        root.add(cylinder(m.amberPaint, 0.055, 0.035, [sx * SPREAD, baseY + BODY + 0.02, sz * SPREAD], AXIS_Y, 8))
      }
    }
    if (tier === 0) spacerDeck(root, m, PALLET + BODY)
  }

  // Restraint: two vertical straps over the crown and a ratchet on the flank.
  const top = PALLET + BODY * 2 + DECK
  const span = SPREAD * 2 + RADIUS * 2 - 0.04
  for (const sx of [-1, 1]) {
    box(root, m.fabric, [0.075, 0.014, span + 0.06], [sx * SPREAD, top + 0.03, 0], {
      chamfer: 0.006, fillet: 0.003, bevel: 0.003,
    })
    box(root, m.fabric, [0.075, BODY * 2 + DECK, 0.014], [sx * SPREAD, PALLET + (BODY * 2 + DECK) * 0.5, span * 0.5 + 0.03], {
      chamfer: 0.006, fillet: 0.003, bevel: 0.003,
    })
  }
  box(root, m.graphiteEdge, [0.11, 0.16, 0.06], [SPREAD, PALLET + 0.42, span * 0.5 + 0.05], {
    chamfer: 0.026, fillet: 0.009, bevel: 0.008,
  })
  root.add(cylinder(m.steel, 0.017, 0.14, [SPREAD, PALLET + 0.42, span * 0.5 + 0.08], AXIS_X, 8))

  const label = addLabelDecal(bundle, { variant: 27 })
  radialPlaque(root, m, label, [0.22, 0.1], RADIUS, PALLET + BODY * 0.56, 0.35, m.ink)
  paintMark(root, m.orangePaint, slashProfile(0.075, 0.24, 0.42), [-SPREAD - 0.05, PALLET + BODY * 1.55 + DECK, RADIUS + 0.002], 'front', 0.011)
  paintMark(root, m.orangePaint, slashProfile(0.04, 0.24, 0.42), [-SPREAD + 0.04, PALLET + BODY * 1.55 + DECK, RADIUS + 0.002], 'front', 0.011)
  statusLens(root, m, [0.05, 0.02], [SPREAD, PALLET + BODY * 1.7 + DECK, RADIUS + SPREAD + 0.006], m.cyan, 'front')

  const sockets: DrumStackSockets = {
    fork_left: socket('fork_left', [-0.3, PALLET * 0.5, span * 0.5]),
    fork_right: socket('fork_right', [0.3, PALLET * 0.5, span * 0.5]),
    strap_top: socket('strap_top', [0, top + 0.05, 0]),
    stack_top: socket('stack_top', [0, top, 0]),
  }
  return { root, sockets, bundle }
}

export function createModel(): DrumStackController {
  const { root, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'stacked-drums',
    reach: 0.2,
    sockets: Object.values(sockets),
  })
  let elapsed = 0
  return {
    root,
    sockets,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      bundle.materials.cyan.emissiveIntensity = 1.5 + Math.sin(elapsed * 1.5) * 0.2
    },
    dispose: finished.dispose,
  }
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  createCargoPreview(createModel(), {
    target: [0, (PALLET + BODY * 2 + DECK) * 0.5, 0],
    distance: 4.5,
    yaw: 0.72,
    pitch: 0.3,
    fov: 30,
    ...options,
  })
