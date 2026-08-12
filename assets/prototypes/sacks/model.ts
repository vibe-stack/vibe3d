import { Group, Object3D } from 'three/webgpu'

import { extrudeProfile, type Vec2 } from '../../../src/asset-forge/generator/index.ts'
import {
  acquireCargoMaterials,
  addLabelDecal,
  box,
  createCargoPreview,
  finishModel,
  paintMark,
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

function sack(
  root: Group,
  m: CargoMaterials,
  width: number,
  height: number,
  depth: number,
  position: [number, number, number],
  yaw: number,
  slump: number,
): void {
  root.add(extrudeProfile(m.fabric, sackProfile(width, height, slump), depth, [
    position[0], position[1] + height * 0.5, position[2],
  ], {
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
  // slump, and size. Identical sacks are the tell that nobody filled them.
  sack(root, m, 0.46, 0.34, 0.4, [-0.26, 0.03, -0.13], 0.16, 1)
  sack(root, m, 0.5, 0.31, 0.42, [0.24, 0.03, -0.1], -0.22, 0.7)
  sack(root, m, 0.48, 0.33, 0.44, [-0.02, 0.03, 0.18], 0.06, 0.9)
  // Two on top, crossed the other way, one clearly heavier than the other.
  sack(root, m, 0.44, 0.29, 0.38, [-0.16, 0.335, 0.02], 1.32, 0.5)
  sack(root, m, 0.42, 0.26, 0.36, [0.2, 0.315, 0.06], 1.5, 0.3)

  const label = addLabelDecal(bundle, { variant: 37, ground: 0xc9b99e })
  plaque(root, m, label, [0.2, 0.1], [0.24, 0.17, 0.14], 'front', m.fabric)
  paintMark(root, m.orangePaint, slashProfile(0.06, 0.13, 0.4), [-0.3, 0.19, 0.05], 'front', 0.008)
  paintMark(root, m.orangePaint, slashProfile(0.03, 0.13, 0.4), [-0.22, 0.19, 0.05], 'front', 0.008)

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
