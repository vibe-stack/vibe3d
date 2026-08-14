import { Group } from 'three/webgpu'
import { cylinder, octagon, rect, type Vec2 } from '../../../src/asset-forge/generator/index.ts'
import type { KitSocket } from '../axiom-modular-kit/contract.ts'
import { createAxiomComponent, createAxiomComponentPreview } from '../axiom-modular-kit/component.ts'
import {
  facePoint, facePrism, faceProfile, panelLine, slab, wallFace,
  type KitMaterials, type WallFace,
} from '../axiom-modular-kit/parts.ts'

/**
 * One elevation of the Olympus civic pod, and the corner column that terminates
 * it.
 *
 * The clinic is a deployable container, not a room on the 4 m building grid, so
 * it does not use the layout prefab path. What it does share is this module:
 * four of them wrapped around a square plan *are* the pod, and the assembly
 * authors nothing about a wall that is not defined here. That is why the badge,
 * the window slot and the plain bay are dressings of a single elevation rather
 * than three separate walls - the clinic's identity has to survive being turned
 * ninety degrees.
 *
 * Depth is layered outward from the wall centreline, on the same rules as the
 * rest of the kit: dark structural core, dark backing plate, pale cassette,
 * applied trim, and only then a signal. Every step is at least 20 mm.
 */

export const CLINIC = Object.freeze({
  /** Corner column centre to corner column centre. The pod's plan module. */
  span: 4,
  /**
   * Where the left column stands on a facade module's own u axis. It is half a
   * column pedestal, so a standalone module's pedestal lands exactly on its
   * envelope edge and four of them wrap a pod with no seam at the corners.
   */
  columnU: 0.38,
  columnSize: 0.62,
  columnDepth: 0.68,
  /** Top of the dark base skirt, and the interior floor plane. */
  skirtTop: 0.46,
  /** Bottom of the wall core; it laps behind the skirt. */
  wallBase: 0.4,
  /** Top of the dark impact band. The pale cassette field starts above it. */
  bandTop: 0.92,
  wallTop: 2.8,
  eavesTop: 3.06,
  /** Corner caps finish just above the roof, the way the reference corners do. */
  columnTop: 3.4,
  /** Structural core thickness. Everything else is measured off its faces. */
  core: 0.34,
} as const)

const { span: SPAN, columnU: CU, core: CORE, skirtTop: SKIRT, bandTop: BAND_TOP, wallTop: TOP } = CLINIC
/** Outward faces of the layered elevation, measured from the wall centreline. */
const W = {
  core: CORE / 2,
  backing: 0.195,
  cassette: 0.258,
  trim: 0.326,
  applied: 0.346,
  well: 0.325,
  signal: 0.37,
} as const

export type FacadeDress = 'badge' | 'window' | 'plain'

export interface FacadeOptions {
  readonly dress?: FacadeDress
  /** Which end columns this module owns. Sides of a pod each own their left. */
  readonly columns?: 'both' | 'left' | 'none'
  /** Adds the service hatch and hose port that break the mirror on one side. */
  readonly service?: boolean
  /**
   * Emits the skirt, eaves and column but no wall field. The open elevation of
   * a pod still wants the module's base and head - only the bay between them is
   * replaced by a portal ring.
   */
  readonly skipWall?: boolean
  /** [u0, u1] the raised base band steps around, for an elevation with a door. */
  readonly bandGap?: readonly [number, number]
}

/* ------------------------------------------------------------ base skirt -- */

/**
 * The base of an elevation: a foot lapped behind the plinth, and above it the
 * dark impact band that carries the pod's vents and ground markings.
 *
 * The band has to sit *above* the plinth apron. Detail authored down at floor
 * level disappears behind the apron's projection the moment the module is
 * assembled, which is how a vent run and two chevrons can be in the source and
 * in none of the renders.
 */
function addSkirt(root: Group, m: KitMaterials, face: WallFace, gap?: readonly [number, number]): void {
  // The foot below the plinth line runs unbroken; only the raised band has to
  // part for a doorway, because only the band is above the threshold.
  facePrism(root, face, m.graphite, [SPAN, SKIRT, 0.66], CU + SPAN / 2, SKIRT / 2, 0,
    { chamfer: [0, 0, 0.13, 0.13], fillet: 0.026, bevel: 0.03 })

  const bandY = SKIRT + (BAND_TOP - SKIRT) / 2
  const runs: Array<readonly [number, number]> = gap
    ? [[CU, gap[0]], [gap[1], CU + SPAN]]
    : [[CU, CU + SPAN]]
  for (const [u0, u1] of runs) {
    const width = u1 - u0
    if (width < 0.12) continue
    const mid = (u0 + u1) / 2
    facePrism(root, face, m.graphite, [width, BAND_TOP - SKIRT, 0.66], mid, bandY, 0,
      { fillet: 0.026, bevel: 0.028 })
    facePrism(root, face, m.deck, [width - 0.16, BAND_TOP - SKIRT - 0.06, 0.06], mid, bandY, 0.29,
      { chamfer: 0.06, fillet: 0.018, bevel: 0.015 })
    const louvres = Math.max(1, Math.floor((width - 0.5) / 0.24))
    for (let i = 0; i < louvres; i += 1) {
      facePrism(root, face, m.ink, [0.055, 0.2, 0.04], mid - ((louvres - 1) * 0.24) / 2 + i * 0.24, bandY, 0.325,
        { fillet: 0.01, bevel: 0.008 })
    }
    panelLine(root, face, m, width - 0.2, mid, BAND_TOP - 0.055, 0.335)
  }
  // Directional chevrons at the outer ends, in the supporting signal.
  for (const side of [-1, 1] as const) {
    const u = CU + SPAN / 2 + side * (SPAN / 2 - 0.28)
    facePrism(root, face, m.cyan, [0.36, 0.055, 0.03], u, bandY + 0.06, 0.325, { fillet: 0.012, bevel: 0.01 })
    facePrism(root, face, m.steel, [0.1, 0.05, 0.035], u, bandY - 0.1, 0.32, { fillet: 0.01, bevel: 0.008 })
  }
}

/* ----------------------------------------------------------- wall panels -- */

/**
 * One rectangular stretch of pale infill: dark backing plate, cassettes riding
 * proud of it, and the shallow courses that keep a 2 m panel from reading flat.
 */
export function clinicCassettes(
  root: Group, m: KitMaterials, face: WallFace, u0: number, u1: number, y0: number, y1: number,
): void {
  const width = u1 - u0
  const height = y1 - y0
  if (width < 0.2 || height < 0.2) return
  facePrism(root, face, m.graphite, [width, height, 0.05], (u0 + u1) / 2, (y0 + y1) / 2, W.backing,
    { fillet: 0.018, bevel: 0.014 })
  const count = Math.max(1, Math.round(width / 1.75))
  const gap = 0.045
  const panel = (width - 0.08 - gap * (count - 1)) / count
  if (panel < 0.18) return
  for (let i = 0; i < count; i += 1) {
    const centre = u0 + 0.04 + panel / 2 + i * (panel + gap)
    facePrism(root, face, m.porcelain, [panel, height - 0.08, 0.076], centre, (y0 + y1) / 2, W.cassette,
      { chamfer: 0.09, fillet: 0.03, bevel: 0.026 })
    // One course line per cassette. The pale field is the point of this
    // elevation; a second seam turns it into a shutter.
    if (height > 0.9) panelLine(root, face, m, panel * 0.62, centre, y1 - 0.42, W.trim, true, 0.035, 0.018)
  }
}

/* ------------------------------------------------------------ identity --- */

/** A plus sign as one closed outline, so the badge is a part and not two bars. */
export function crossProfile(centreU: number, centreY: number, arm: number, thickness: number): Vec2[] {
  const a = thickness / 2
  const b = arm / 2
  const points: Vec2[] = [
    [a, a], [b, a], [b, -a], [a, -a], [a, -b], [-a, -b],
    [-a, -a], [-b, -a], [-b, a], [-a, a], [-a, b], [a, b],
  ]
  return points.map(([u, y]): Vec2 => [u + centreU, y + centreY])
}

/**
 * The clinic's one unmistakable mark: a clipped-octagon housing, a deep dark
 * well, and the cobalt cross floating inside it a good 45 mm below the rim, so
 * the emission is lit from within a recess instead of painted on a wall.
 */
export function clinicBadge(
  root: Group, m: KitMaterials, face: WallFace, u: number, y: number, size: number, base = W.cassette,
): void {
  // Layer depths are physical, but the badge is fitted at everything from a 1.6 m
  // facade plate to a 0.5 m interior marker, so they scale with the plate rather
  // than sticking a 140 mm frame onto a half-metre sign.
  const d = Math.min(1, size / 1.6)
  const clear = size - 0.34 * d
  // The housing is a ring with a real aperture. Behind it, the ink backing sits
  // a clear step below the rim, so the cross is lit inside a recess.
  facePrism(root, face, m.porcelain, [size, size, 0.11 * d], u, y, base + 0.088 * d,
    { chamfer: size * 0.29, fillet: 0.032, bevel: 0.028, holes: [octagon(clear / 2, clear / 2, clear * 0.28)] })
  facePrism(root, face, m.graphite, [clear + 0.12 * d, clear + 0.12 * d, 0.07 * d], u, y, base + 0.047 * d,
    { chamfer: (clear + 0.12 * d) * 0.28, fillet: 0.026, bevel: 0.022 })
  facePrism(root, face, m.ink, [clear - 0.06 * d, clear - 0.06 * d, 0.05 * d], u, y, base + 0.092 * d,
    { chamfer: (clear - 0.06 * d) * 0.28, fillet: 0.024, bevel: 0.02 })
  faceProfile(root, face, m.cobalt, crossProfile(u, y, clear * 0.72, clear * 0.24), 0.045 * d, base + 0.112 * d,
    { fillet: 0.02 * d, bevel: 0.016 * d })
  if (size < 0.8) return
  for (const side of [-1, 1] as const) {
    facePrism(root, face, m.steel, [0.05, 0.05, 0.03], u + side * (size / 2 - 0.1), y - size / 2 + 0.1, base + 0.12,
      { fillet: 0.008, bevel: 0.007 })
  }
}

/** The tall louvred light slot that dresses the elevations without the badge. */
function addWindowSlot(root: Group, m: KitMaterials, face: WallFace, u: number, y: number): void {
  facePrism(root, face, m.graphite, [0.66, 1.52, 0.1], u, y, W.applied,
    { chamfer: 0.15, fillet: 0.028, bevel: 0.024, holes: [rect(0.21, 0.64)] })
  facePrism(root, face, m.ink, [0.5, 1.38, 0.05], u, y, W.well,
    { chamfer: 0.1, fillet: 0.02, bevel: 0.016 })
  for (const offset of [-0.13, 0, 0.13]) {
    facePrism(root, face, m.cyan, [0.06, 1.14, 0.035], u + offset, y, W.signal - 0.015,
      { fillet: 0.012, bevel: 0.01 })
  }
}

/** Hose port and hatch. One elevation carries them; the pod is not symmetric. */
function addService(root: Group, m: KitMaterials, face: WallFace, u: number): void {
  facePrism(root, face, m.graphite, [0.9, 0.66, 0.08], u, 1.06, W.applied - 0.02,
    { chamfer: 0.1, fillet: 0.022, bevel: 0.018, holes: [rect(0.33, 0.21)] })
  facePrism(root, face, m.deck, [0.76, 0.5, 0.05], u, 1.06, W.well - 0.01,
    { fillet: 0.018, bevel: 0.014 })
  facePrism(root, face, m.steel, [0.26, 0.05, 0.04], u + 0.18, 0.9, W.signal - 0.02,
    { fillet: 0.012, bevel: 0.01 })
  root.add(cylinder(m.ink, 0.08, 0.06, facePoint(face, u - 0.16, 1.12, W.well + 0.02),
    [Math.PI / 2, 0, -face.yaw], 10))
  facePrism(root, face, m.amber, [0.07, 0.07, 0.03], u + 0.3, 1.22, W.signal - 0.02,
    { fillet: 0.012, bevel: 0.01 })
}

/* ---------------------------------------------------------------- eaves -- */

function addEaves(root: Group, m: KitMaterials, face: WallFace): void {
  const mid = CU + SPAN / 2
  // Dark shadow reveal, then the pale fascia riding proud of it. The reference
  // keeps its whole head band white and lets a single deep groove read as the
  // joint; a solid dark eaves turns the pod into a crate with a lid.
  facePrism(root, face, m.graphite, [SPAN, CLINIC.eavesTop - TOP, 0.66], mid, (TOP + CLINIC.eavesTop) / 2, 0,
    { chamfer: [0.08, 0.08, 0, 0], fillet: 0.026, bevel: 0.022 })
  facePrism(root, face, m.porcelain, [SPAN - 0.02, CLINIC.eavesTop - TOP - 0.05, 0.11], mid, (TOP + CLINIC.eavesTop) / 2 + 0.025, 0.33,
    { chamfer: [0.08, 0.08, 0, 0], fillet: 0.026, bevel: 0.024 })
  panelLine(root, face, m, SPAN - 0.4, mid, TOP + 0.05, 0.39)
  const bays = 3
  for (let i = 1; i < bays; i += 1) {
    panelLine(root, face, m, CLINIC.eavesTop - TOP - 0.14, CU + (SPAN * i) / bays, (TOP + CLINIC.eavesTop) / 2 + 0.03, 0.39,
      false, 0.04, 0.022)
  }
}

/* --------------------------------------------------------------- column -- */

/**
 * A pod corner. Square in plan and centred on the corner point, so one column
 * terminates both of the elevations that meet there. `faces` lists the yaws
 * that are open to the air and therefore worth detailing.
 */
export function clinicColumn(
  root: Group, m: KitMaterials, x: number, z: number, faces: readonly number[],
): void {
  const size = CLINIC.columnSize
  const half = size / 2
  // The corner is a pale post with a dark spine, not a black pillar: in the
  // reference the only gunmetal on a corner is the boot, the head band and the
  // channel running up its face. Keeping the mass white is what stops four
  // corners from framing the elevations into separate dark-edged panels.
  slab(root, m.graphite, size + 0.14, size + 0.14, 0.5, [x, 0.25, z], 0.21, { fillet: 0.028, bevel: 0.03 })
  slab(root, m.graphite, size, size, TOP - 0.44, [x, (0.44 + TOP) / 2, z], 0.17, { fillet: 0.03, bevel: 0.026 })
  slab(root, m.porcelain, size + 0.06, size + 0.06, TOP - 0.1 - BAND_TOP, [x, (BAND_TOP + TOP - 0.1) / 2, z], 0.2,
    { fillet: 0.032, bevel: 0.03 })
  slab(root, m.graphite, size + 0.1, size + 0.1, CLINIC.eavesTop - TOP, [x, (TOP + CLINIC.eavesTop) / 2, z], 0.2,
    { fillet: 0.03, bevel: 0.026 })
  slab(root, m.porcelain, size + 0.04, size + 0.04, CLINIC.columnTop - CLINIC.eavesTop,
    [x, (CLINIC.eavesTop + CLINIC.columnTop) / 2, z], 0.21, { fillet: 0.028, bevel: 0.026 })
  // An inset plate sunk just under the cap, not a puck sitting on it: proud, a
  // dark disc on a pale corner reads as an open pipe end.
  slab(root, m.graphite, size - 0.24, size - 0.24, 0.03, [x, CLINIC.columnTop - 0.035, z], 0.12,
    { fillet: 0.014, bevel: 0.011 })

  for (const yaw of faces) {
    const face = wallFace([x, 0, z], yaw)
    facePrism(root, face, m.ink, [0.19, 1.44, 0.06], 0, 1.62, half + 0.045, { fillet: 0.016, bevel: 0.013 })
    for (const side of [-1, 1] as const) {
      facePrism(root, face, m.steel, [0.045, 1.28, 0.03], side * 0.155, 1.62, half + 0.075,
        { fillet: 0.01, bevel: 0.008 })
    }
    facePrism(root, face, m.cobalt, [0.085, 0.085, 0.028], 0, 1.14, half + 0.082, { fillet: 0.012, bevel: 0.01 })
    facePrism(root, face, m.graphite, [0.3, 0.07, 0.05], 0, 2.46, half + 0.06, { fillet: 0.012, bevel: 0.01 })
    for (const y of [0.78, 2.2]) panelLine(root, face, m, size - 0.16, 0, y, half + 0.03, true, 0.04, 0.022)
  }
}

/* ---------------------------------------------------------------- build -- */

/**
 * Authors one elevation onto `face`, whose u axis runs corner to corner with
 * u = 0.3 on the first column centre. Both the standalone module and the pod
 * assembly call this; there is no second copy of a clinic wall anywhere.
 */
export function buildClinicFacade(
  root: Group, m: KitMaterials, face: WallFace, options: FacadeOptions = {},
): void {
  const dress = options.dress ?? 'badge'
  const columns = options.columns ?? 'both'
  const mid = CU + SPAN / 2

  addSkirt(root, m, face, options.bandGap)
  addEaves(root, m, face)
  if (!options.skipWall) {
    facePrism(root, face, m.graphite, [SPAN, TOP - CLINIC.wallBase, CORE], mid, (CLINIC.wallBase + TOP) / 2, 0,
      { chamfer: [0.12, 0.12, 0, 0], fillet: 0.03, bevel: 0.026 })
    // Two courses with a real dark reveal between them: the seam that runs right
    // around the pod at mid height in the reference.
    clinicCassettes(root, m, face, CU + 0.16, CU + SPAN - 0.16, 1.9, TOP - 0.08)
    clinicCassettes(root, m, face, CU + 0.16, CU + SPAN - 0.16, BAND_TOP + 0.06, 1.8)

    if (dress === 'badge') clinicBadge(root, m, face, mid, 1.9, 1.6)
    else if (dress === 'window') addWindowSlot(root, m, face, mid + 1.02, 2.12)
    if (options.service) addService(root, m, face, mid - 1.12)
  }

  if (columns !== 'none') {
    const left = facePoint(face, CU, 0, 0)
    clinicColumn(root, m, left[0], left[2], [face.yaw])
  }
  if (columns === 'both') {
    const right = facePoint(face, CU + SPAN, 0, 0)
    clinicColumn(root, m, right[0], right[2], [face.yaw])
  }
}

/* --------------------------------------------------------------- module -- */

const WIDTH = SPAN + CU * 2
const DEPTH = 0.8
/** Half a column pedestal behind the wall line, so the pedestal closes the box. */
const CENTRE_Z = -0.4

const SOCKETS = [
  { name: 'wall_snap_left', kind: 'wall', position: [CU, 1.6, CENTRE_Z], normal: [-1, 0, 0] },
  { name: 'wall_snap_right', kind: 'wall', position: [CU + SPAN, 1.6, CENTRE_Z], normal: [1, 0, 0] },
  { name: 'badge_center', kind: 'dressing', position: [WIDTH / 2, 1.92, CENTRE_Z + 0.35], normal: [0, 0, 1] },
  { name: 'floor_snap_center', kind: 'floor', position: [WIDTH / 2, 0, CENTRE_Z], normal: [0, -1, 0] },
  { name: 'roof_edge_center', kind: 'roof-edge', position: [WIDTH / 2, CLINIC.eavesTop, CENTRE_Z], normal: [0, 1, 0] },
  { name: 'service_port_left', kind: 'service', position: [WIDTH / 2 - 1.12, 1.06, CENTRE_Z + 0.33], normal: [0, 0, 1] },
] as const satisfies readonly KitSocket[]

export function createModel() {
  return createAxiomComponent('clinic-facade-module', SOCKETS, (root, materials) => {
    const face = wallFace([0, 0, CENTRE_Z], 0)
    // Standalone, the module closes its own envelope with a full-footprint foot.
    // In a pod that job belongs to the plinth, so `buildClinicFacade` does not
    // author it and the four elevations do not stack four feet in one corner.
    facePrism(root, face, materials.graphite, [WIDTH, SKIRT, DEPTH], WIDTH / 2, SKIRT / 2, 0,
      { chamfer: [0, 0, 0.14, 0.14], fillet: 0.026, bevel: 0.03 })
    buildClinicFacade(root, materials, face, { dress: 'badge', columns: 'both', service: true })
  })
}

export function createPreview(options: { aspect: number }) {
  return createAxiomComponentPreview(options, 'clinic-facade-module', createModel)
}

export const createSidePreview = createPreview
export const createRearPreview = createPreview
export const createLowPreview = createPreview
