import { Group, Object3D } from 'three/webgpu'

import { cylinder, prism } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  AXIS_Z,
  acquireCargoMaterials,
  addLabelDecal,
  addStripeDecal,
  box,
  boltRun,
  cornerCasting,
  createCargoPreview,
  finishModel,
  forkPocket,
  groundPad,
  louvreVent,
  paintMark,
  plaque,
  recessedHandle,
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
 * Axiom Relay large freight crate.
 *
 * The heavy end of the crate family: a hinged clamshell on a dark forkable
 * plinth, with the same corner castings and skirt height as the container so the
 * two stack and read as one system. Its distinguishing landmark is the louvred
 * environmental face on the long side, which is the only crate in the wave that
 * conditions its own contents.
 */

const WIDTH = 2.2
const DEPTH = 1.5
const HEIGHT = 1.32
const SKIRT = 0.34
const LID = 0.26
/**
 * How far each mass in the stack reaches past the one under it.
 *
 * Plinth, body, and lid were all sized to meet on shared planes - the body's
 * bottom cap exactly on the plinth's top, the lid's exactly on the body's. A
 * butt joint like that reads sealed from outside and turns into a slit the
 * moment the camera drops below it, so each mass now laps the one below.
 */
const LAP = 0.02
const BODY_HEIGHT = HEIGHT - SKIRT - LID + LAP
const BODY_Y = SKIRT - LAP + BODY_HEIGHT * 0.5

type Side = -1 | 1

interface CrateParts {
  hull: Group
  lid: Group
}

interface CrateSockets {
  lift_fore_left: Object3D
  lift_fore_right: Object3D
  lift_aft_left: Object3D
  lift_aft_right: Object3D
  stack_top: Object3D
  fx_status: Object3D
}

export type CrateState = 'sealed' | 'open'

export interface CargoCrateController {
  root: Group
  parts: CrateParts
  sockets: CrateSockets
  readonly state: CrateState
  setState(state: CrateState): CrateState
  update(deltaSeconds: number): void
  dispose(): void
}

function plinth(hull: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  box(hull, m.graphite, [WIDTH, SKIRT, DEPTH], [0, SKIRT * 0.5, 0], {
    chamfer: 0.09,
    fillet: 0.03,
    bevel: 0.022,
    capChamfer: 0.06,
  })
  // Fork pockets on both long faces; a crate this size is only ever moved by
  // machine, so the pockets are the honest reason its base is this deep.
  //
  // Everything applied here seats on the plinth's own face. The 20 mm that used
  // to be subtracted from it was neither the plinth's face nor the body's, so
  // the wear plates sat two thirds swallowed and the stripe printed through the
  // pocket mouth behind them.
  for (const side of [-1, 1] as Side[]) {
    const face = side > 0 ? 'front' : 'back'
    for (const x of [-0.5, 0.5]) {
      forkPocket(hull, m, [0.5, 0.19], 0.42, [x, SKIRT * 0.52, side * DEPTH * 0.5], face)
    }
    // Between the pockets, not off the end of the plinth: the wear plates reach
    // to x 0.815 and the plinth's corner chamfer takes the last 90 mm of the
    // face, so the only field wide enough for the stripe is the middle one.
    const stripe = addStripeDecal(bundle, { count: 5, lean: side })
    plaque(hull, m, stripe, [0.3, 0.11], [0, SKIRT * 0.52, side * DEPTH * 0.5], face, m.ink)
  }
  // Corner feet in painted caution, the part a fork actually scrapes. They stand
  // 4 mm up inside the plinth so their soles are not a second set of down-facing
  // caps on the plinth's own bottom plane, and the rubber below them is the pad
  // that actually meets the deck.
  for (const sx of [-1, 1] as Side[]) {
    for (const sz of [-1, 1] as Side[]) {
      box(hull, m.amberPaint, [0.19, 0.16, 0.19], [sx * (WIDTH * 0.5 - 0.1), 0.084, sz * (DEPTH * 0.5 - 0.1)], {
        chamfer: 0.05, fillet: 0.014, bevel: 0.012,
      })
      groundPad(hull, m.rubber, [0.17, 0.17], [sx * (WIDTH * 0.5 - 0.1), 0, sz * (DEPTH * 0.5 - 0.1)], 0.035)
    }
  }
}

function hullBody(hull: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  box(hull, m.shell, [WIDTH - 0.06, BODY_HEIGHT, DEPTH - 0.06], [0, BODY_Y, 0], {
    chamfer: 0.11,
    fillet: 0.035,
    bevel: 0.024,
    capChamfer: 0.08,
  })
  // Vertical corner armour. The chamfer of the body already reads as a bevel, so
  // the armour is what makes the corner look assembled rather than moulded.
  //
  // It stops well short of the shut line because its outer faces are exactly the
  // lid skirt's: run it up to the joint and the two share a plane over the whole
  // height the skirt covers.
  for (const sx of [-1, 1] as Side[]) {
    for (const sz of [-1, 1] as Side[]) {
      box(hull, m.graphiteEdge, [0.2, BODY_HEIGHT - 0.06, 0.2], [
        sx * (WIDTH * 0.5 - 0.12), BODY_Y - 0.02, sz * (DEPTH * 0.5 - 0.12),
      ], { chamfer: 0.075, fillet: 0.02, bevel: 0.014 })
      // The lift socket is bored into the armour itself. A separate casting
      // perched on top of it reads as a clip somebody left behind.
      cornerCasting(hull, m, [0.21, 0.17, 0.21], [
        sx * (WIDTH * 0.5 - 0.12), SKIRT + 0.11, sz * (DEPTH * 0.5 - 0.12),
      ], 0.042, 'y', m.graphiteEdge)
    }
  }

  // Long faces: a louvred conditioning bay on one, service and manifest on the
  // other, so front and back never read as the same panel.
  const frontZ = DEPTH * 0.5 - 0.03
  // The service panel is 60 mm thick about the shell face, so its own face - the
  // host for everything printed on it - is 30 mm further out.
  const panelZ = frontZ + 0.03
  louvreVent(hull, m, [0.5, 0.52], [-0.46, BODY_Y, frontZ], 5, 'front')
  box(hull, m.graphite, [0.34, 0.42, 0.06], [0.34, BODY_Y + 0.02, frontZ], { chamfer: 0.06, fillet: 0.016, bevel: 0.012 })
  statusLens(hull, m, [0.16, 0.05], [0.34, BODY_Y + 0.15, panelZ], m.cyan, 'front')
  // Sized to land inside the panel. At 0.34 x 0.17 the plate overhung it by
  // 20 mm on both flanks and 5 mm at the bottom, and those edges bridged a 27 mm
  // void back to the shell.
  const label = addLabelDecal(bundle, { variant: 4 })
  plaque(hull, m, label, [0.28, 0.15], [0.34, BODY_Y - 0.075, panelZ], 'front', m.shellLight)
  // The retaining bolts sit clear above the panel, on the shell that carries
  // them. Placed on the panel's plane they stood 25 mm off the only surface
  // within reach, as two studs hanging in front of the crate.
  boltRun(hull, m.steel, [0.34 - 0.19, BODY_Y + 0.26, frontZ], [0.34 + 0.19, BODY_Y + 0.26, frontZ], 2, 0.018, 'front')

  const backZ = -(DEPTH * 0.5 - 0.03)
  for (const x of [-0.62, 0, 0.62]) {
    seam(hull, m.shell, BODY_HEIGHT - 0.2, [x, BODY_Y, backZ], 'back', 'along', 0.03, 0.02)
  }
  // Both strokes are measured in from the corner armour's inner face rather than
  // from the shell's edge. The armour stands 10 mm proud of the skin, so the
  // outboard stroke was running behind it and reading as a stub half its length.
  const armourInner = WIDTH * 0.5 - 0.22
  paintMark(hull, m.amberPaint, slashProfile(0.13, 0.4, 0.45), [armourInner - 0.33, BODY_Y, backZ], 'back', 0.012)
  paintMark(hull, m.amberPaint, slashProfile(0.07, 0.4, 0.45), [armourInner - 0.15, BODY_Y, backZ], 'back', 0.012)

  // Short faces: recessed grab handles at carry height, seated on the shell's
  // real face - 10 mm inboard of it the well was buried and only the bar showed,
  // standing off the skin with nothing behind it.
  for (const side of [-1, 1] as Side[]) {
    const face = side > 0 ? 'right' : 'left'
    recessedHandle(hull, m, [0.44, 0.15], [side * (WIDTH - 0.06) * 0.5, BODY_Y + 0.06, 0], face)
    box(hull, m.graphiteEdge, [0.05, BODY_HEIGHT - 0.12, 0.24], [side * (WIDTH * 0.5 - 0.04), BODY_Y, 0.4], {
      chamfer: 0.02, fillet: 0.008, bevel: 0.008,
    })
  }
}

function lidBody(lid: Group, m: CargoMaterials): void {
  // The lid's origin is the hinge line along its back edge, so every part below
  // is written relative to that line and `rotation.x` is the lid angle.
  //
  // The leaf is a lap deeper than the opening it covers, so its skirt runs 20 mm
  // down past the body's top face instead of capping it on a shared plane.
  const crown = LID + LAP
  box(lid, m.shellLight, [WIDTH - 0.04, crown, DEPTH - 0.04], [0, crown * 0.5, DEPTH * 0.5 - 0.05], {
    chamfer: 0.09,
    fillet: 0.028,
    bevel: 0.02,
    capChamfer: 0.06,
  })
  for (const x of [-0.55, 0.55]) {
    seam(lid, m.shellLight, DEPTH - 0.24, [x, crown, DEPTH * 0.5 - 0.05], 'top', 'along', 0.032, 0.02)
  }
  // Stacking pads, aligned with the castings below so a stack sits square.
  for (const sx of [-1, 1] as Side[]) {
    for (const sz of [-1, 1] as Side[]) {
      const padZ = DEPTH * 0.5 - 0.05 + sz * (DEPTH * 0.5 - 0.17)
      const padX = sx * (WIDTH * 0.5 - 0.17)
      box(lid, m.shellShade, [0.3, 0.03, 0.3], [padX, crown + 0.005, padZ], {
        chamfer: 0.07, fillet: 0.018, bevel: 0.008,
      })
      box(lid, m.ink, [0.16, 0.016, 0.16], [padX, crown + 0.016, padZ], {
        chamfer: 0.04, fillet: 0.01, bevel: 0.006,
      })
    }
  }
  // Painted lift bar across the crown, plus a pair of eye bolts. The bar bites
  // 20 mm into the leaf: drawn resting on the crown its underside cleared the
  // skin by 2.5 mm, so the one part a crane hooks onto floated off the prop.
  const barY = crown - LAP + 0.0275
  box(lid, m.amberPaint, [0.62, 0.055, 0.11], [0, barY, DEPTH * 0.5 - 0.05], {
    chamfer: 0.026, fillet: 0.01, bevel: 0.009,
  })
  for (const x of [-0.31, 0.31]) {
    lid.add(cylinder(m.steel, 0.032, 0.09, [x, barY + 0.02, DEPTH * 0.5 - 0.05], AXIS_Z, 10))
  }
  // Hinge knuckles straddling the leaf's own back face. Drawn at a local z of
  // 0.03 the whole barrel sat inside the lid it swings on, which is why the back
  // of this crate photographed as a smooth panel with no hinge anywhere on it.
  const leafBack = DEPTH * 0.5 - 0.05 - (DEPTH - 0.04) * 0.5
  for (const x of [-0.66, 0, 0.66]) {
    lid.add(prism(m.graphiteEdge, [0.19, 0.13, 0.07], [x, crown * 0.5, leafBack - 0.014], {
      chamfer: 0.025, fillet: 0.012, bevel: 0.01,
    }))
    lid.add(cylinder(m.steel, 0.026, 0.24, [x, crown * 0.5, leafBack - 0.014], AXIS_X, 10))
  }
}

function build(): { root: Group; parts: CrateParts; sockets: CrateSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(52_200, { condition: 0.55 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_CARGO-CRATE-LARGE_ROOT_SEALED'
  const hull = new Group()
  hull.name = 'AXR_CARGO_CARGO-CRATE-LARGE_PART_HULL_DEFAULT'
  const lid = new Group()
  lid.name = 'AXR_CARGO_CARGO-CRATE-LARGE_PART_LID_CLOSED'
  root.add(hull, lid)

  plinth(hull, m, bundle)
  hullBody(hull, m, bundle)

  lid.position.set(0, HEIGHT - LID - LAP, -(DEPTH * 0.5 - 0.05))
  lidBody(lid, m)

  // Latches straddle the lid seam, so they are built on the hull and read as
  // engaged; the lid clears them the instant it starts to open.
  for (const x of [-0.72, 0, 0.72]) {
    toggleLatch(hull, m, [x, HEIGHT - LID - LAP, DEPTH * 0.5 - 0.02], 1.15, 'front')
  }

  const sockets: CrateSockets = {
    lift_fore_left: socket('lift_fore_left', [-(WIDTH * 0.5 - 0.12), HEIGHT - LID, DEPTH * 0.5 - 0.12]),
    lift_fore_right: socket('lift_fore_right', [WIDTH * 0.5 - 0.12, HEIGHT - LID, DEPTH * 0.5 - 0.12]),
    lift_aft_left: socket('lift_aft_left', [-(WIDTH * 0.5 - 0.12), HEIGHT - LID, -(DEPTH * 0.5 - 0.12)]),
    lift_aft_right: socket('lift_aft_right', [WIDTH * 0.5 - 0.12, HEIGHT - LID, -(DEPTH * 0.5 - 0.12)]),
    stack_top: socket('stack_top', [0, HEIGHT, 0]),
    fx_status: socket('fx_status', [0.34, BODY_Y + 0.15, DEPTH * 0.5 + 0.02]),
  }
  return { root, parts: { hull, lid }, sockets, bundle }
}

export function createModel(): CargoCrateController {
  const { root, parts, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'cargo-crate-large',
    assemblies: [parts.lid],
    reach: 0.2,
    sockets: Object.values(sockets),
  })

  let state: CrateState = 'sealed'
  let blend = 0
  let elapsed = 0

  const applyBlend = (): void => {
    parts.lid.rotation.x = -blend * 1.62
    parts.lid.name = blend > 0.02
      ? 'AXR_CARGO_CARGO-CRATE-LARGE_PART_LID_OPEN'
      : 'AXR_CARGO_CARGO-CRATE-LARGE_PART_LID_CLOSED'
  }

  return {
    root,
    parts,
    sockets,
    get state() {
      return state
    },
    setState: (next: CrateState) => {
      state = next
      root.name = next === 'open'
        ? 'AXR_CARGO_CARGO-CRATE-LARGE_ROOT_OPEN'
        : 'AXR_CARGO_CARGO-CRATE-LARGE_ROOT_SEALED'
      blend = next === 'open' ? 1 : 0
      applyBlend()
      return state
    },
    update: (deltaSeconds: number) => {
      const step = Math.min(Math.max(deltaSeconds, 0), 0.05)
      elapsed += step
      const target = state === 'open' ? 1 : 0
      if (Math.abs(target - blend) > 1e-4) {
        blend += Math.sign(target - blend) * Math.min(Math.abs(target - blend), step * 0.8)
        applyBlend()
      }
      bundle.materials.cyan.emissiveIntensity = 1.5 + Math.sin(elapsed * 2.1) * 0.22
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: CrateState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'sealed')
  return createCargoPreview(model, {
    target: [0, HEIGHT * 0.48, 0],
    distance: 5.1,
    yaw: 0.78,
    pitch: 0.33,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createOpenPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'open' })
