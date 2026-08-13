import { Group, Object3D } from 'three/webgpu'

import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  acquireCargoMaterials,
  box,
  containerDoorFrame,
  containerDoorLeaf,
  containerMetrics,
  containerShell,
  createCargoPreview,
  finishModel,
  seam,
  socket,
  statusLens,
  wrapStrap,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
  type ContainerMetrics,
  type ContainerShellOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay open-top freight container.
 *
 * Same chassis with the roof deleted, which means the interior is now the
 * subject: a ribbed deck, a liner up each wall, four lashing rings, and a
 * removable header bar across the door end. A tarp sits rolled and strapped
 * along one top rail, because an open-top with no tarp anywhere is a container
 * that lost one.
 *
 * The header bar matters structurally as well as visually - it is what stops the
 * door end from racking once the roof is gone, and leaving it out makes the
 * whole silhouette read as a container with its top sheared off.
 */

const SPEC: ContainerShellOptions = {
  length: 6.06,
  width: 2.44,
  height: 2.59,
  roof: false,
  variant: 70,
}

// The interior skin laps every member it seals against by 30 mm, which is what
// these three figures are: the end-wall panel's inner face is at
// `-(length*0.5 - 0.145)`, the door sill bar's is at `length*0.5 - 0.24`, and
// the side panels' is at `width*0.5 - 0.13`. Inset by a flat 0.32 and 0.22 the
// deck and liners left a 175 mm slot at the closed end, an 80 mm one at the
// door end and a 70 mm one down each flank, all of them open from above.
const DECK_AFT = -(SPEC.length * 0.5 - 0.115)
const DECK_FORE = SPEC.length * 0.5 - 0.21
const INNER_Z = SPEC.width * 0.5 - 0.12

interface OpenContainerSockets {
  load_centre: Object3D
  lash_fore_left: Object3D
  lash_fore_right: Object3D
  lash_aft_left: Object3D
  lash_aft_right: Object3D
  tarp_roll: Object3D
}

export interface OpenContainerController {
  root: Group
  parts: { shell: Group; doorLeft: Group; doorRight: Group }
  sockets: OpenContainerSockets
  update(deltaSeconds: number): void
  dispose(): void
}

function interior(shell: Group, m: CargoMaterials, floorY: number): void {
  const span = DECK_FORE - DECK_AFT
  const mid = (DECK_FORE + DECK_AFT) * 0.5
  const liner = SPEC.height - floorY - 0.34

  box(shell, m.graphiteEdge, [span, 0.05, INNER_Z * 2], [mid, floorY, 0], {
    chamfer: 0.05, fillet: 0.018, bevel: 0.012,
  })
  // Deck ribs run across the width, the way a real container floor is laid.
  for (let index = 0; index < 13; index += 1) {
    const x = mid + (index / 12 - 0.5) * (span - 0.2)
    box(shell, m.ink, [0.07, 0.022, INNER_Z * 2 - 0.06], [x, floorY + 0.03, 0], {
      chamfer: 0.008, fillet: 0.004, bevel: 0.004,
    })
  }
  // Wall liners: a plain plane inboard of the corrugation, so the inside does
  // not show the outside's ribs in negative.
  for (const sz of [-1, 1]) {
    box(shell, m.shellShade, [span, liner, 0.04], [mid, floorY + liner * 0.5, sz * INNER_Z], {
      chamfer: 0.04, fillet: 0.014, bevel: 0.012,
    })
  }
  box(shell, m.shellShade, [0.04, liner, INNER_Z * 2], [DECK_AFT + 0.02, floorY + liner * 0.5, 0], {
    chamfer: 0.04, fillet: 0.014, bevel: 0.012,
  })

  // Lashing rings on the bottom side rails.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = mid + sx * span * 0.31
      const z = sz * (INNER_Z - 0.03)
      box(shell, m.graphite, [0.14, 0.1, 0.05], [x, floorY + 0.09, z], { chamfer: 0.026, fillet: 0.01, bevel: 0.008 })
      shell.add(cylinder(m.steel, 0.038, 0.022, [x, floorY + 0.13, z - sz * 0.03], [Math.PI / 2, 0, 0], 10))
    }
  }
}

/**
 * The rolled tarp and its retaining straps, stowed on the -Z top rail.
 *
 * The roll sits on the rail rather than in it. Placed on the rail's own centre
 * plane it buried 95 mm of its diameter in the rail, and a tarp is stowed on
 * top of the rail in any case - that is the member the lashings pull it down
 * against.
 */
function tarpRoll(shell: Group, m: CargoMaterials, k: ContainerMetrics): void {
  const radius = 0.14
  const length = SPEC.length - 1.0
  const z = -(SPEC.width * 0.5 - k.casting * 0.5)
  // Rail top, plus the roll's own radius, less a 30 mm bite so the two meet.
  const y = SPEC.height - k.casting * 0.5 + 0.085 + radius - 0.03
  shell.add(cylinder(m.fabric, radius, length, [0, y, z], AXIS_X, 14))
  shell.add(cylinder(m.shellShade, 0.115, length + 0.08, [0, y, z], AXIS_X, 14))
  for (const x of [-1.9, -0.6, 0.7, 1.95]) {
    // Chords round the roll and over the rail, not a quad laid on the tangent:
    // a flat strap touches a curve along one line and stands its ends 160 mm
    // off. The run is authored about +Y and stood on the roll's X axis.
    const strap = wrapStrap(shell, m.fabric, radius, [x, y, z], 0, Math.PI * 1.35, 0.07, 0.014, 6)
    strap.rotation.z = Math.PI / 2
    box(shell, m.amberPaint, [0.07, 0.05, 0.03], [x, y, z + radius - 0.008], { chamfer: 0.012, fillet: 0.005, bevel: 0.004 })
  }
  // End bands, standing proud of the roll instead of inside it: at r 0.05 they
  // were 90 mm under a 0.14 surface and appeared in no frame.
  for (const sx of [-1, 1]) {
    shell.add(cylinder(m.graphiteEdge, radius + 0.015, 0.09, [sx * (length * 0.5 - 0.03), y, z], AXIS_X, 14))
  }
}

function build(): {
  root: Group
  shell: Group
  doorLeft: Group
  doorRight: Group
  sockets: OpenContainerSockets
  bundle: CargoMaterialBundle
} {
  const bundle = acquireCargoMaterials(56_800, { condition: 0.68 })
  const m = bundle.materials
  const k = containerMetrics(SPEC)

  const root = new Group()
  root.name = 'AXR_CARGO_SHIPPING-CONTAINER-OPEN_ROOT_DEFAULT'
  const shell = new Group()
  shell.name = 'AXR_CARGO_SHIPPING-CONTAINER-OPEN_PART_SHELL_DEFAULT'
  const doorLeft = new Group()
  doorLeft.name = 'AXR_CARGO_SHIPPING-CONTAINER-OPEN_PART_DOOR-LEFT_CLOSED'
  const doorRight = new Group()
  doorRight.name = 'AXR_CARGO_SHIPPING-CONTAINER-OPEN_PART_DOOR-RIGHT_CLOSED'
  root.add(shell, doorLeft, doorRight)

  containerShell(shell, m, bundle, SPEC)
  containerDoorFrame(shell, m, SPEC)

  // The deck rides above the fork pocket tunnels, which run 0.5 m inboard from
  // the skirt and top out at 0.348. At 0.24 the floor sat through them and both
  // pockets read from above as two dark blocks lying loose on the deck.
  const floorY = 0.39
  interior(shell, m, floorY)
  tarpRoll(shell, m, k)

  // Removable header bar across the door end, with its two lift pins.
  const headerX = SPEC.length * 0.5 - 0.2
  box(shell, m.shell, [0.22, 0.24, SPEC.width - k.casting * 2], [headerX, SPEC.height - 0.2, 0], {
    chamfer: 0.055, fillet: 0.018, bevel: 0.014, capChamfer: 0.04,
  })
  seam(shell, m.shell, SPEC.width - k.casting * 2 - 0.2, [headerX + 0.11, SPEC.height - 0.2, 0], 'right', 'across', 0.028, 0.016)
  for (const sz of [-1, 1]) {
    box(shell, m.graphiteEdge, [0.2, 0.14, 0.16], [headerX, SPEC.height - 0.16, sz * (SPEC.width * 0.5 - 0.28)], {
      chamfer: 0.03, fillet: 0.012, bevel: 0.01,
    })
    shell.add(cylinder(m.steel, 0.028, 0.12, [headerX, SPEC.height - 0.06, sz * (SPEC.width * 0.5 - 0.28)], [0, 0, 0], 8))
  }
  statusLens(shell, m, [0.06, 0.14], [headerX + 0.11, SPEC.height - 0.2, 0.6], m.amber, 'right')

  const hinge = SPEC.width * 0.5 - k.casting - 0.02
  // The leaves hang behind the door frame's head and sill bars, whose inboard
  // face is at `length*0.5 - 0.24`. Set 130 mm further forward the 0.1-thick
  // skins ran straight through both bars for the full width of the opening.
  doorLeft.position.set(SPEC.length * 0.5 - 0.285, 0, -hinge)
  doorRight.position.set(SPEC.length * 0.5 - 0.285, 0, hinge)
  containerDoorLeaf(doorLeft, m, bundle, { ...SPEC, side: 1 })
  containerDoorLeaf(doorRight, m, bundle, { ...SPEC, side: -1 })
  // Each leaf is half the clear opening, so the pair shuts on a mathematical
  // point and the 0.1 taken out for clearance is a 60 mm slit you see the
  // cross members through. The leaf that shuts second carries a closing strip
  // behind the joint, lapping both skins by 40 mm. Hinging the pair 30 mm
  // further in would bring the leaves edge to edge instead, but the lock bars
  // are set out from each leaf's own centre and would then cross the shut line
  // and duplicate each other for 50 mm.
  const leaf = (SPEC.width - k.casting * 2 - 0.1) * 0.5
  box(doorLeft, m.shell, [0.06, SPEC.height - 0.62, (hinge - leaf) * 2 + 0.08], [-0.06, (SPEC.height - 0.5) * 0.5 + 0.24, hinge], {
    chamfer: 0.02, fillet: 0.008, bevel: 0.007,
  })

  const deckMid = (DECK_FORE + DECK_AFT) * 0.5
  const lashX = (DECK_FORE - DECK_AFT) * 0.31
  const sockets: OpenContainerSockets = {
    load_centre: socket('load_centre', [deckMid, floorY + 0.05, 0]),
    lash_fore_left: socket('lash_fore_left', [deckMid + lashX, floorY + 0.13, -INNER_Z]),
    lash_fore_right: socket('lash_fore_right', [deckMid + lashX, floorY + 0.13, INNER_Z]),
    lash_aft_left: socket('lash_aft_left', [deckMid - lashX, floorY + 0.13, -INNER_Z]),
    lash_aft_right: socket('lash_aft_right', [deckMid - lashX, floorY + 0.13, INNER_Z]),
    tarp_roll: socket('tarp_roll', [0, SPEC.height + 0.045, -(SPEC.width * 0.5 - k.casting * 0.5)]),
  }
  return { root, shell, doorLeft, doorRight, sockets, bundle }
}

export function createModel(): OpenContainerController {
  const { root, shell, doorLeft, doorRight, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'shipping-container-open',
    assemblies: [doorLeft, doorRight],
    reach: 0.32,
    sockets: Object.values(sockets),
  })
  let elapsed = 0
  return {
    root,
    parts: { shell, doorLeft, doorRight },
    sockets,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      bundle.materials.amber.emissiveIntensity = 2.0 + Math.sin(elapsed * 1.5) * 0.22
    },
    dispose: finished.dispose,
  }
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  createCargoPreview(createModel(), {
    target: [0, SPEC.height * 0.45, 0],
    distance: 11.6,
    yaw: 0.72,
    pitch: 0.42,
    fov: 30,
    ...options,
  })
