import { Group, Object3D } from 'three/webgpu'

import { cylinder, type Vec3 } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  AXIS_Y,
  FACE_CLEARANCE,
  acquireCargoMaterials,
  addLabelDecal,
  addStripeDecal,
  box,
  createCargoPreview,
  drum,
  finishModel,
  member,
  plaque,
  radialFitting,
  radialMark,
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
  // The deck is thick enough to bite into what it carries at both faces: at the
  // 35 mm it was drawn at it met the stringers under it and the drum bases on it
  // within half a millimetre each, which is a slit rather than a joint.
  box(root, m.graphite, [span, 0.08, span], [0, PALLET - 0.02, 0], {
    chamfer: 0.05, fillet: 0.018, bevel: 0.012,
  })
  for (const sx of [-1, 0, 1]) {
    box(root, m.graphiteEdge, [0.14, PALLET - 0.035, span], [sx * (span * 0.5 - 0.09), (PALLET - 0.035) * 0.5, 0], {
      chamfer: 0.035, fillet: 0.012, bevel: 0.01,
    })
  }
  // The pallet rides on its three stringers, so the bottom board between them
  // stops a face clearance short of the deck: flush with them it crossed all
  // three on one down-facing plane.
  box(root, m.ink, [span, 0.028 - FACE_CLEARANCE, 0.14], [0, (0.028 + FACE_CLEARANCE) * 0.5, 0], {
    chamfer: 0.03, fillet: 0.01, bevel: 0.008,
  })
  // The pallet's own edge is a flat face, so it takes the flat plaque. Measured
  // as a radius about the stack's axis the stripe landed inside a stringer.
  const stripe = addStripeDecal(bundle, { count: 6, lean: 1 })
  plaque(root, m, stripe, [0.4, 0.03], [0, PALLET - 0.02, span * 0.5], 'front', m.ink)
}

/** The banding deck the upper tier sits on, plus its four location cups. */
function spacerDeck(root: Group, m: CargoMaterials, y: number): void {
  const span = SPREAD * 2 + RADIUS * 2 - 0.04
  box(root, m.shellShade, [span, DECK * 0.5, span], [0, y + DECK * 0.25, 0], {
    chamfer: 0.09, fillet: 0.03, bevel: 0.014,
  })
  // The cups run from inside the deck to inside the drum they locate. Half a
  // deck thickness of cup left a 3.5 mm slit under every drum of the upper tier.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      root.add(cylinder(m.graphiteEdge, RADIUS * 0.62, DECK, [sx * SPREAD, y + DECK * 0.8, sz * SPREAD], AXIS_Y, 14))
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
        const band = (tier + (sx > 0 ? 1 : 0) + (sz > 0 ? 1 : 0)) % 2 === 0 ? m.graphite : m.ink
        drum(root, m, RADIUS, BODY, [sx * SPREAD, baseY, sz * SPREAD], {
          hoops: [0.32, 0.64],
          chime: 0.024,
          band,
          segments: 16,
        })
        // The crown ring is what a strap laid over the stack actually bears on,
        // so it reaches above the body rather than straddling it.
        root.add(cylinder(m.graphite, RADIUS - 0.06, 0.05, [sx * SPREAD, baseY + BODY + 0.005, sz * SPREAD], AXIS_Y, 14))
        root.add(cylinder(m.amberPaint, 0.055, 0.035, [sx * SPREAD, baseY + BODY + 0.02, sz * SPREAD], AXIS_Y, 8))
      }
    }
    if (tier === 0) spacerDeck(root, m, PALLET + BODY)
  }

  // Restraint: two vertical straps over the crown and a ratchet on the flank.
  // The chimes are the widest thing on a drum, so that is the only radius a
  // strap can lie against - run at the deck's half-span it threaded through the
  // drums it is meant to hold down, and it stopped at the crowns instead of
  // carrying on to the strap crossing them.
  const top = PALLET + BODY * 2 + DECK
  const span = SPREAD * 2 + RADIUS * 2 - 0.04
  const drumEdge = SPREAD + RADIUS + 0.024
  // Each run ends on the other's centre plane rather than on its skin, so the
  // corner is a lap and not two coincident faces.
  const strapHead = top + 0.03
  const strapFoot = PALLET - 0.02
  for (const sx of [-1, 1]) {
    box(root, m.webbing, [0.075, 0.014, (drumEdge + 0.004) * 2], [sx * SPREAD, top + 0.03, 0], {
      chamfer: 0.006, fillet: 0.003, bevel: 0.003,
    })
    box(root, m.webbing, [0.075, strapHead - strapFoot, 0.014], [sx * SPREAD, (strapHead + strapFoot) * 0.5, drumEdge + 0.004], {
      chamfer: 0.006, fillet: 0.003, bevel: 0.003,
    })
  }
  box(root, m.graphiteEdge, [0.11, 0.16, 0.06], [SPREAD, PALLET + 0.42, span * 0.5 + 0.05], {
    chamfer: 0.026, fillet: 0.009, bevel: 0.008,
  })
  root.add(cylinder(m.steel, 0.017, 0.14, [SPREAD, PALLET + 0.42, span * 0.5 + 0.08], AXIS_X, 8))

  // Dressing goes on one named drum at a time, and each curved helper is handed
  // the axis of the drum it belongs to: this stack has four of them, and a label
  // measured about the stack's own axis is buried inside the drum beside the one
  // it is meant for while a chevron lands 55 mm inside a flank. Everything sits
  // in the field between the two rolling hoops, which are prouder than any of it.
  const axisOf = (sx: number, sz: number, baseY: number): Vec3 => [sx * SPREAD, baseY, sz * SPREAD]
  const label = addLabelDecal(bundle, { variant: 27 })
  radialPlaque(root, m, label, [0.046, 0.1], RADIUS, BODY * 0.48, 0.45, m.ink, 16, axisOf(1, 1, PALLET))
  const marked = axisOf(-1, 1, PALLET + BODY + DECK)
  radialMark(root, m.orangePaint, slashProfile(0.055, 0.17, 0.3), RADIUS, BODY * 0.48, -0.68, 16, 0.016, marked)
  radialMark(root, m.orangePaint, slashProfile(0.03, 0.17, 0.3), RADIUS, BODY * 0.48, -0.32, 16, 0.016, marked)
  const lamp = radialFitting(RADIUS, BODY * 0.7, -0.5, 16, axisOf(1, 1, PALLET + BODY + DECK))
  statusLens(root, m, [0.05, 0.02], lamp.position, m.cyan, 'front', 0, lamp.rotation)

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
    // Half the stack's height puts the frame's centre above the drums' own
    // visual mass, and the pallet's near corner then sat on the bottom edge.
    target: [0, (PALLET + BODY * 2 + DECK) * 0.41, 0],
    distance: 4.6,
    yaw: 0.72,
    pitch: 0.3,
    fov: 30,
    ...options,
  })
