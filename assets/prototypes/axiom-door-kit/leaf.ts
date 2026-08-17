import { Group, type MeshPhysicalMaterial } from 'three/webgpu'

import { cylinder, extrudeProfile, type Vec2 } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_Y,
  boltRun,
  box,
  recessedHandle,
  slot,
  statusLens,
  type CargoMaterials,
} from '../axiom-cargo-kit/index.ts'
import { CLEAR_HALF, DOOR_KIT } from './contract.ts'
import { PLATE_FRONT } from './frame.ts'

/**
 * Leaf construction shared by every swinging and sliding module in the family.
 *
 * A leaf is three things stacked: a skin cut to the opening's octagon, one
 * raised inner panel that gives the face a value break, and a stepped seam that
 * says which half of the leaf is structural. Everything else a specific door
 * needs — a vision port, a shutter's slats, a glass light — is added on top of
 * that base by the model itself.
 */

/** Leaf skin outline: 20 mm inside the clear opening on every side. */
export const LEAF_HALF: readonly [number, number] = [CLEAR_HALF[0] - 0.02, CLEAR_HALF[1] - 0.02]
export const LEAF_DEPTH = 0.09
/** Leaf mid-plane. Recessed behind the frame plate so the opening reads deep. */
export const LEAF_Z = PLATE_FRONT - 0.145
/** Front face of the raised panel — the datum leaf-mounted detail sits on. */
export const PANEL_FRONT = LEAF_Z + LEAF_DEPTH * 0.5 + 0.027

export interface LeafOptions {
  /** Skin material; glass and shutter variants swap it. */
  readonly skin?: MeshPhysicalMaterial
  /** Half-extents, for double leaves that carry half the opening each. */
  readonly half?: readonly [number, number]
  /** Horizontal centre, for a leaf that is not centred in the opening. */
  readonly centreX?: number
  /** Corner clip; a narrow double leaf needs a smaller one than a single. */
  readonly clip?: number
}

export function leafOutline(options: LeafOptions = {}): Vec2[] {
  const [hx, hy] = options.half ?? LEAF_HALF
  return slot(hx, hy, options.clip ?? DOOR_KIT.clip - 0.03)
}

/** The skin, its raised inner panel, and the fixings that hold the two together. */
export function leafSkin(parent: Group, m: CargoMaterials, options: LeafOptions = {}): void {
  const [hx, hy] = options.half ?? LEAF_HALF
  const cx = options.centreX ?? 0
  const skin = options.skin ?? m.shellLight
  const clip = options.clip ?? DOOR_KIT.clip - 0.03

  parent.add(extrudeProfile(skin, slot(hx, hy, clip), LEAF_DEPTH, [cx, DOOR_KIT.centreY, LEAF_Z], {
    fillet: 0.014,
    bevel: 0.02,
    capChamfer: [0.03, 0.02],
  }))
  // Raised panel. Inset by a constant rather than a ratio so a narrow double
  // leaf keeps the same physical border as a single one.
  parent.add(extrudeProfile(m.shell, slot(hx - 0.09, hy - 0.09, clip - 0.02), 0.03, [
    cx, DOOR_KIT.centreY, LEAF_Z + LEAF_DEPTH * 0.5 + 0.012,
  ], { fillet: 0.01, bevel: 0.014 }))
  for (const sy of [-1, 1]) {
    boltRun(
      parent,
      m.steel,
      [cx - hx + 0.14, DOOR_KIT.centreY + sy * (hy - 0.075), LEAF_Z + LEAF_DEPTH * 0.5],
      [cx + hx - 0.14, DOOR_KIT.centreY + sy * (hy - 0.075), LEAF_Z + LEAF_DEPTH * 0.5],
      4,
      0.015,
      'front',
    )
  }
}

/**
 * The family's stepped structural seam: a shadow groove that runs up the leaf,
 * jogs across, and continues. It is the one graphic every reference sheet in the
 * doors group shares, and it is geometry rather than a decal so it holds an edge
 * highlight on the step.
 */
export function steppedSeam(parent: Group, m: CargoMaterials, centreX = 0, half = LEAF_HALF): void {
  const [hx, hy] = half
  // Proud of the raised panel, not of the skin. Drawn against the skin the seam
  // sat 15 mm inside the panel that covers most of the leaf and vanished
  // everywhere except the two thin borders the panel does not reach.
  const z = PANEL_FRONT - 0.004
  const gauge = 0.032
  const bar = (size: [number, number], position: [number, number]): void => {
    box(parent, m.ink, [size[0], size[1], 0.03], [position[0], position[1], z], {
      chamfer: 0.008, fillet: 0.004, bevel: 0.004,
    })
  }

  // One continuous run: down the leaf, across, and down again. The first pass
  // drew four disconnected bars around a shared centre, which read as a bracket
  // rather than as a joint — a seam has to arrive somewhere and leave somewhere.
  const upperX = centreX - hx * 0.14
  const lowerX = centreX + hx * 0.16
  const jogY = DOOR_KIT.centreY + hy * 0.19
  const top = DOOR_KIT.centreY + hy
  const bottom = DOOR_KIT.centreY - hy

  bar([gauge, top - jogY], [upperX, (top + jogY) * 0.5])
  bar([lowerX - upperX + gauge, gauge], [(upperX + lowerX) * 0.5, jogY])
  bar([gauge, jogY - bottom], [lowerX, (jogY + bottom) * 0.5])
}

/** Vertical pull bar on the leaf's swing edge. */
export function leafHandle(parent: Group, m: CargoMaterials, centreX = 0, half = LEAF_HALF): void {
  const x = centreX + half[0] * 0.46
  box(parent, m.graphiteEdge, [0.058, 0.32, 0.05], [x, DOOR_KIT.centreY, PANEL_FRONT + 0.045], {
    chamfer: 0.022, fillet: 0.009, bevel: 0.008,
  })
  // Stand-offs, so the bar has somewhere to be bolted and a hand has somewhere
  // to go behind it.
  for (const sy of [-1, 1]) {
    box(parent, m.graphite, [0.048, 0.048, 0.045], [x, DOOR_KIT.centreY + sy * 0.135, PANEL_FRONT + 0.018], {
      chamfer: 0.013, fillet: 0.006, bevel: 0.005,
    })
  }
}

/**
 * A vision port: a real opening through the skin with a glazed pane behind it,
 * not a dark quad. The port is cut from the raised panel too, so its walls run
 * the full leaf thickness.
 */
export function visionPort(
  parent: Group,
  m: CargoMaterials,
  size: readonly [number, number],
  centre: readonly [number, number],
): void {
  const [w, h] = size
  const [cx, cy] = centre
  parent.add(extrudeProfile(m.graphite, slot(w * 0.5 + 0.05, h * 0.5 + 0.05, 0.05), 0.055, [
    cx, cy, PANEL_FRONT,
  ], {
    fillet: 0.008,
    bevel: 0.01,
    holes: [slot(w * 0.5, h * 0.5, 0.04)],
  }))
  parent.add(extrudeProfile(m.glass, slot(w * 0.5 + 0.012, h * 0.5 + 0.012, 0.04), 0.014, [
    cx, cy, LEAF_Z + 0.01,
  ], { fillet: 0.005, bevel: 0.005 }))
}

/** Leaf-mounted state panel, for the modules that carry their read on the door. */
export function leafPanel(
  parent: Group,
  m: CargoMaterials,
  signal: MeshPhysicalMaterial,
  centre: readonly [number, number],
): void {
  const [cx, cy] = centre
  box(parent, m.graphite, [0.19, 0.31, 0.05], [cx, cy, PANEL_FRONT + 0.02], {
    chamfer: 0.045, fillet: 0.012, bevel: 0.01, capChamfer: 0.018,
  })
  statusLens(parent, m, [0.1, 0.1], [cx, cy + 0.062, PANEL_FRONT + 0.045], signal, 'front')
  statusLens(parent, m, [0.11, 0.028], [cx, cy - 0.035, PANEL_FRONT + 0.045], signal, 'front')
  statusLens(parent, m, [0.034, 0.034], [cx, cy - 0.108, PANEL_FRONT + 0.045], m.amber, 'front')
}

/** Rear stiffening ribs, so an opened leaf is not a flat card from behind. */
export function leafRibs(parent: Group, m: CargoMaterials, centreX = 0, half = LEAF_HALF): void {
  const [hx, hy] = half
  const z = LEAF_Z - LEAF_DEPTH * 0.5 - 0.018
  for (let index = 0; index < 3; index += 1) {
    const y = DOOR_KIT.centreY + (index - 1) * hy * 0.62
    box(parent, m.graphiteEdge, [hx * 1.7, 0.055, 0.035], [centreX, y, z], {
      chamfer: 0.014, fillet: 0.006, bevel: 0.005,
    })
  }
  for (const sy of [-1, 1]) {
    parent.add(cylinder(m.steel, 0.02, 0.06, [centreX + hx * 0.72, DOOR_KIT.centreY + sy * hy * 0.55, z], AXIS_Y, 8))
  }
}

/** A grab recess for hatches and shutters, which have no room for a pull bar. */
export function leafRecess(parent: Group, m: CargoMaterials, centre: readonly [number, number]): void {
  recessedHandle(parent, m, [0.24, 0.11], [centre[0], centre[1], PANEL_FRONT - 0.006], 'front')
}
