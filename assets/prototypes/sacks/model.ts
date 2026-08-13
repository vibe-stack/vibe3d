import { Group, Object3D } from 'three/webgpu'

import { extrudeProfile, type Vec2 } from '../../../src/asset-forge/generator/index.ts'
import {
  acquireCargoMaterials,
  addLabelDecal,
  box,
  createCargoPreview,
  finishModel,
  plaque,
  slashProfile,
  socket,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay bulk sacks — five filled sacks on a slip sheet.
 *
 * The one soft-goods asset in the wave, and the reason it is worth building is
 * contrast: a depot of chamfered alloy boxes has no compliant surface anywhere,
 * and a stack of slumped fabric immediately makes the hard shells read harder.
 *
 * Each sack is a lofted profile, not a box with a big fillet. The silhouette a
 * filled sack actually has - narrow gathered neck, heavy bulged waist, flat
 * bottom spread by its own weight - cannot be reached by rounding a cuboid, and
 * that shape is the entire read.
 */

const SHEET = 1.04
const SHEET_D = 0.72

interface SackSockets {
  top_left: Object3D
  top_right: Object3D
  sheet_centre: Object3D
}

export interface SackController {
  root: Group
  sockets: SackSockets
  dispose(): void
}

/**
 * Half-profile of a filled sack, revolved in cross-section: flat base, bulging
 * waist, gathered neck with a tied ear either side.
 */
function sackProfile(width: number, height: number, slump: number): Vec2[] {
  const hw = width * 0.5
  return [
    [hw * 0.86, 0],
    [hw, height * 0.2],
    [hw * (0.94 + slump * 0.1), height * 0.44],
    [hw * 0.8, height * 0.7],
    [hw * 0.42, height * 0.88],
    [hw * 0.3, height],
    [-hw * 0.3, height],
    [-hw * 0.42, height * 0.88],
    [-hw * 0.8, height * 0.7],
    [-hw * (0.94 + slump * 0.1), height * 0.44],
    [-hw, height * 0.2],
    [-hw * 0.86, 0],
  ]
}

/**
 * One filled sack, returning where its front cap sits at a given x.
 *
 * The cap is a flat plane tilted by the sack's own yaw, and it is the only thing
 * on this prop a graphic can be laid on. Handing it back is what lets the label
 * and the sprayed marks be measured off the surface they lie on instead of off
 * the stack's bounding box.
 */
function sack(
  root: Group,
  m: CargoMaterials,
  width: number,
  height: number,
  depth: number,
  position: [number, number, number],
  yaw: number,
  slump: number,
): (x: number) => number {
  // `position` is the sack's base. The profile is authored 0 to `height` and
  // `extrudeProfile` lands it at those coordinates plus the offset, so adding
  // half a height here to correct for a re-centring the primitive already undoes
  // double-shifted every sack: the stack stood 155 to 170 mm clear of its own
  // sheet and the neck and tie, authored in the unshifted frame, ended up buried
  // at mid-height with no sack showing a gather at all.
  root.add(extrudeProfile(m.fabric, sackProfile(width, height, slump), depth, position, {
    fillet: Math.min(width, depth) * 0.22,
    bevel: Math.min(width, depth) * 0.2,
    capChamfer: depth * 0.24,
    arcSegments: 2,
    rotation: [0, yaw, 0],
  }))
  // Gathered neck: a small crushed block across the top, rotated with the sack.
  box(root, m.fabric, [width * 0.34, height * 0.09, depth * 0.4], [
    position[0], position[1] + height * 0.99, position[2],
  ], {
    chamfer: width * 0.08, fillet: width * 0.05, bevel: 0.01, rotation: [0, yaw, 0],
  })
  box(root, m.ironOxide, [width * 0.2, height * 0.035, depth * 0.16], [
    position[0], position[1] + height * 1.03, position[2],
  ], {
    chamfer: 0.01, fillet: 0.005, bevel: 0.004, rotation: [0, yaw, 0],
  })
  return (x) => position[2] + (depth * 0.5 - Math.sin(yaw) * (x - position[0])) / Math.cos(yaw)
}

function build(): { root: Group; sockets: SackSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(55_400, { condition: 0.8 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_SACKS_ROOT_DEFAULT'

  // Slip sheet: the thin composite tray a sack stack is dragged onto.
  box(root, m.shellShade, [SHEET, 0.022, SHEET_D], [0, 0.011, 0], {
    chamfer: 0.07, fillet: 0.024, bevel: 0.008,
  })
  box(root, m.graphite, [SHEET - 0.12, 0.012, SHEET_D - 0.1], [0, 0.026, 0], {
    chamfer: 0.06, fillet: 0.02, bevel: 0.006,
  })

  // Bottom course of three, laid across the sheet with real variation in yaw,
  // slump, and size. Identical sacks are the tell that nobody filled them. The
  // two that carry graphics keep their yaw in a name, because every mark on them
  // has to be turned by the same angle the sack was.
  const LEFT_YAW = 0.16
  const FRONT_YAW = 0.06
  const leftFace = sack(root, m, 0.46, 0.34, 0.4, [-0.26, 0.03, -0.13], LEFT_YAW, 1)
  sack(root, m, 0.5, 0.31, 0.42, [0.24, 0.03, -0.1], -0.22, 0.7)
  const frontFace = sack(root, m, 0.48, 0.33, 0.44, [-0.02, 0.03, 0.18], FRONT_YAW, 0.9)
  // Two on top, crossed the other way, one clearly heavier than the other.
  sack(root, m, 0.44, 0.29, 0.38, [-0.16, 0.335, 0.02], 1.32, 0.5)
  sack(root, m, 0.42, 0.26, 0.36, [0.2, 0.315, 0.06], 1.5, 0.3)

  // Both graphics ride a sack's front cap, and both are turned onto that cap's
  // plane rather than left square to the world. Laid on the axis at z = 0.14 and
  // 0.05 they stood 60 to 90 mm out in front of the fabric, which the sheet
  // showed as a barcode card and two orange fins hanging clear of the stack.
  const label = addLabelDecal(bundle, { variant: 37, ground: 0xc9b99e })
  plaque(root, m, label, [0.15, 0.055], [-0.03, 0.195, frontFace(-0.03)], 'front', m.fabric, 0, [0, FRONT_YAW, 0])
  // The sprayed marks are extruded straight rather than through `paintMark`,
  // which can only lay a mark in one of the six world faces. Square to +Z each
  // of these crosses 13 mm of the cap's fall over its own width: anchored at one
  // end it stands 7 mm off the fabric, anchored at the other it disappears into
  // it, and there is no single height in between that works. Turned with the
  // sack the embed is the same 4 mm from end to end.
  for (const [markX, width] of [[-0.35, 0.04], [-0.285, 0.02]] as const) {
    root.add(extrudeProfile(m.orangePaint, slashProfile(width, 0.1, 0.4), 0.008, [markX, 0.19, leftFace(markX)], {
      fillet: 0.004, bevel: 0.0024, rotation: [0, LEFT_YAW, 0],
    }))
  }

  const sockets: SackSockets = {
    top_left: socket('top_left', [-0.16, 0.63, 0.02]),
    top_right: socket('top_right', [0.2, 0.58, 0.06]),
    sheet_centre: socket('sheet_centre', [0, 0.032, 0]),
  }
  return { root, sockets, bundle }
}

export function createModel(): SackController {
  const { root, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'sacks',
    reach: 0.16,
    sockets: Object.values(sockets),
  })
  return { root, sockets, dispose: finished.dispose }
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  createCargoPreview(createModel(), {
    target: [0, 0.28, 0],
    distance: 2.45,
    yaw: 0.72,
    pitch: 0.36,
    fov: 30,
    ...options,
  })
