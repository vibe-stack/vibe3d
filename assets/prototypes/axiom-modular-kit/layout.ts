import { Group } from 'three/webgpu'
import { groove, prism, type Vec3 } from '../../../src/asset-forge/generator/index.ts'
import type { KitEnvelope, KitSocket } from './contract.ts'
import {
  FRAME_LINER, FRAME_REACH, KIT_BUILD, apertureRing, bolt, cassetteRun, facePrism, openingFrame,
  POST_CAP_TOP, openingRing, panelLine, ringBeam, slab, structuralPost, tileGrid, wallFace,
  type KitMaterials, type OpeningSpec, type WallFace,
} from './parts.ts'

/**
 * Prefabs are laid out on a grid, not placed by hand.
 *
 * A building is described by a room map - one character per grid cell, front
 * row first - plus a list of openings addressed by cell and side. Everything
 * else is derived:
 *
 * - a wall exists on any cell edge where a filled cell meets open ground
 *   (exterior) or a differently-lettered room (partition);
 * - a post stands at every grid vertex a wall reaches, sized by how many walls
 *   meet there, with service detail on whichever faces are open to the air;
 * - the ring beam follows every exterior wall, the ribbed spine cap follows
 *   every partition;
 * - floor trays and the stepped plinth are emitted per cell, each expanded only
 *   on the sides with no neighbouring cell, so they abut instead of overlapping.
 *
 * The result is that a new prefab is a plan and a handful of openings, and
 * every one of them is built from the same modules in the same proportions.
 */

/** Cell pitch. One cell is one structural bay. */
export const GRID = 4
/** How far the foundation projects past the outermost wall plane. */
export const PLINTH_PROJECTION = 0.5

const { floorY: FLOOR, wallTop: WALL_TOP, wallThickness: T } = KIT_BUILD

export type Side = 'front' | 'rear' | 'left' | 'right'

export interface OpeningPlacement {
  /** [column, row]; column 0 is the left edge, row 0 is the front edge. */
  readonly cell: readonly [number, number]
  readonly side: Side
  readonly kind: 'door' | 'window'
  /** Metres along the wall from the segment's midpoint. */
  readonly offset?: number
  readonly width?: number
}

export interface LayoutSpec {
  /** Room map, front row first. One character per cell; '.' is open ground. */
  readonly plan: readonly string[]
  readonly openings?: readonly OpeningPlacement[]
}

const DOOR_DEFAULTS = { width: 1.56, sill: FLOOR, head: 2.6, clip: [0.3, 0.3, 0, 0] } as const
const WINDOW_DEFAULTS = { width: 1.9, sill: 1.32, head: 2.6, clip: [0.2, 0.2, 0.2, 0.2] } as const

function planSize(plan: readonly string[]): { cols: number; rows: number } {
  return { cols: Math.max(...plan.map((row) => row.length)), rows: plan.length }
}

export function layoutEnvelope(plan: readonly string[]): KitEnvelope {
  const { cols, rows } = planSize(plan)
  return {
    width: cols * GRID + PLINTH_PROJECTION * 2,
    depth: rows * GRID + PLINTH_PROJECTION * 2,
    height: POST_CAP_TOP,
  }
}

/** Room letter at a cell, or undefined for open ground and out-of-bounds. */
function roomAt(plan: readonly string[], i: number, j: number): string | undefined {
  const character = plan[j]?.[i]
  return character === undefined || character === '.' || character === ' ' ? undefined : character
}

const xOf = (i: number): number => PLINTH_PROJECTION + i * GRID
const zOf = (j: number): number => -(PLINTH_PROJECTION + j * GRID)

interface Segment {
  readonly key: string
  readonly axis: 'x' | 'z'
  /** World coordinate of the wall centreline on its constant axis. */
  readonly line: number
  readonly from: number
  readonly to: number
  readonly partition: boolean
  /** +1 or -1 along the constant axis; the side the wall faces outward. */
  readonly outward: number
}

function collectSegments(plan: readonly string[]): Segment[] {
  const { cols, rows } = planSize(plan)
  const segments: Segment[] = []

  const consider = (
    key: string, axis: 'x' | 'z', line: number, from: number, to: number,
    low: string | undefined, high: string | undefined, lowSign: number,
  ): void => {
    if (!low && !high) return
    if (low && high && low === high) return
    const partition = Boolean(low && high)
    // An exterior wall faces whichever side is open ground; a partition simply
    // picks a canonical outward axis and dresses both of its faces.
    const outward = partition ? -lowSign : (high ? lowSign : -lowSign)
    segments.push({ key, axis, line, from, to, partition, outward })
  }

  for (let i = 0; i <= cols; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      // A vertical edge runs along z; `low` is the cell on its -x side.
      consider(`v:${i}:${j}`, 'x', xOf(i), zOf(j), zOf(j + 1), roomAt(plan, i - 1, j), roomAt(plan, i, j), -1)
    }
  }
  for (let j = 0; j <= rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      // A horizontal edge runs along x; `low` is the cell on its +z (front) side.
      consider(`h:${i}:${j}`, 'z', zOf(j), xOf(i), xOf(i + 1), roomAt(plan, i, j - 1), roomAt(plan, i, j), 1)
    }
  }
  return segments
}

function segmentKey(placement: OpeningPlacement): string {
  const [i, j] = placement.cell
  switch (placement.side) {
    case 'left': return `v:${i}:${j}`
    case 'right': return `v:${i + 1}:${j}`
    case 'front': return `h:${i}:${j}`
    case 'rear': return `h:${i}:${j + 1}`
  }
}

function faceFor(segment: Segment): WallFace {
  if (segment.axis === 'x') {
    return wallFace([segment.line, 0, 0], segment.outward > 0 ? Math.PI / 2 : -Math.PI / 2)
  }
  return wallFace([0, 0, segment.line], segment.outward > 0 ? 0 : Math.PI)
}

/** Projects a world point onto a face's along-the-wall axis. */
function uOf(face: WallFace, x: number, z: number): number {
  return (x - face.origin[0]) * face.u[0] + (z - face.origin[2]) * face.u[2]
}

function openingFor(placement: OpeningPlacement, centre: number): OpeningSpec {
  const defaults = placement.kind === 'door' ? DOOR_DEFAULTS : WINDOW_DEFAULTS
  return {
    centre: centre + (placement.offset ?? 0),
    width: placement.width ?? defaults.width,
    sill: defaults.sill,
    head: defaults.head,
    clip: [...defaults.clip] as OpeningSpec['clip'],
  }
}

/* ------------------------------------------------------------------ walls -- */

export interface WallSectionOpening {
  readonly kind: 'door' | 'window'
  readonly spec: OpeningSpec
}

export interface WallSectionOptions {
  readonly partition?: boolean
  readonly opening?: WallSectionOpening
  /** Prefab perimeter walls carry a ring beam; loose inserts do not. */
  readonly ring?: boolean
}

/**
 * Canonical Axiom wall author. Layouts and loose wall/door/window registry
 * pieces all pass through this function, so an opening cannot drift away from
 * the version cut into a prefab shell.
 */
export function buildWallSection(
  root: Group,
  m: KitMaterials,
  face: WallFace,
  u0: number,
  u1: number,
  options: WallSectionOptions = {},
): void {
  const partition = options.partition ?? false
  const opening = options.opening
  const thickness = partition ? T + 0.06 : T

  if (!opening) {
    facePrism(root, face, m.graphite, [u1 - u0, WALL_TOP - FLOOR, thickness], (u0 + u1) / 2, (FLOOR + WALL_TOP) / 2, 0,
      { fillet: 0.03, bevel: 0.024 })
    cassetteRun(root, face, m, u0, u1, FLOOR, WALL_TOP, 1)
    cassetteRun(root, face, m, u0, u1, FLOOR, WALL_TOP, -1)
  } else {
    const { spec } = opening
    // The core stops outside the dark liner rather than at the clear opening,
    // so the two never share the aperture plane.
    const cored: OpeningSpec = {
      ...spec,
      width: spec.width + FRAME_LINER * 2,
      sill: spec.sill === FLOOR ? FLOOR : spec.sill - FRAME_LINER,
      head: spec.head + FRAME_LINER,
    }
    openingRing(root, face, m.graphite, apertureRing(cored, u0, u1, FLOOR, WALL_TOP), thickness, 0,
      { fillet: 0.024, bevel: 0.02 })
    openingFrame(root, face, m, spec)

    const band = FRAME_REACH + 0.05
    const aL = spec.centre - spec.width / 2 - band
    const aR = spec.centre + spec.width / 2 + band
    for (const side of [1, -1] as const) {
      cassetteRun(root, face, m, u0, aL, FLOOR, WALL_TOP, side)
      cassetteRun(root, face, m, aR, u1, FLOOR, WALL_TOP, side)
      cassetteRun(root, face, m, aL, aR, spec.head + band, WALL_TOP, side)
      if (spec.sill > FLOOR + 0.4) cassetteRun(root, face, m, aL, aR, FLOOR, spec.sill - band, side)
    }
    if (opening.kind === 'door') addDoorFurniture(root, m, face, spec)
    else addWindowSill(root, m, face, spec)
  }

  if (partition) addSpineCap(root, m, face, u0, u1)
  else if (options.ring ?? true) ringBeam(root, face, m, u0 - 0.22, u1 + 0.22)
}

function addWallSegment(root: Group, m: KitMaterials, segment: Segment, placement: OpeningPlacement | undefined): void {
  const face = faceFor(segment)
  const half = KIT_BUILD.postSize / 2
  const ends = segment.axis === 'x'
    ? [uOf(face, segment.line, segment.from), uOf(face, segment.line, segment.to)]
    : [uOf(face, segment.from, segment.line), uOf(face, segment.to, segment.line)]
  const u0 = Math.min(...ends) + half
  const u1 = Math.max(...ends) - half
  const spec = placement ? openingFor(placement, (u0 + u1) / 2) : undefined
  buildWallSection(root, m, face, u0, u1, {
    partition: segment.partition,
    opening: placement && spec ? { kind: placement.kind, spec } : undefined,
  })
}

function addDoorFurniture(root: Group, m: KitMaterials, face: WallFace, spec: OpeningSpec): void {
  const jamb = spec.centre + spec.width / 2 + 0.11
  // Control plate on the right jamb: recessed housing, cyan strip, amber key.
  facePrism(root, face, m.ink, [0.13, 0.72, 0.05], jamb, 1.5, T / 2 + 0.14, { fillet: 0.016, bevel: 0.013 })
  facePrism(root, face, m.cyan, [0.05, 0.46, 0.03], jamb, 1.57, T / 2 + 0.165, { fillet: 0.012, bevel: 0.01 })
  facePrism(root, face, m.amber, [0.07, 0.07, 0.03], jamb, 1.22, T / 2 + 0.165, { fillet: 0.012, bevel: 0.01 })
  // Vent slots on the opposite jamb break the mirror.
  const opposite = spec.centre - spec.width / 2 - 0.11
  for (const y of [1.32, 1.5, 1.68]) {
    facePrism(root, face, m.ink, [0.09, 0.045, 0.04], opposite, y, T / 2 + 0.14, { fillet: 0.008, bevel: 0.007 })
  }
  facePrism(root, face, m.steel, [0.46, 0.05, 0.04], spec.centre, spec.head + 0.09, T / 2 + 0.165,
    { fillet: 0.012, bevel: 0.01 })
  for (const u of [spec.centre - 0.58, spec.centre + 0.58]) bolt(root, m, face, u, 0.6, T / 2 + 0.15)
}

function addWindowSill(root: Group, m: KitMaterials, face: WallFace, spec: OpeningSpec): void {
  const width = spec.width + 0.42
  facePrism(root, face, m.graphite, [width, 0.09, 0.15], spec.centre, spec.sill - 0.2, T / 2 + 0.08,
    { fillet: 0.02, bevel: 0.016 })
  facePrism(root, face, m.steel, [width - 0.15, 0.04, 0.05], spec.centre, spec.sill - 0.28, T / 2 + 0.15,
    { fillet: 0.012, bevel: 0.01 })
}

/** The partition's heavier head: a ribbed spine cap with a mid-span collar. */
function addSpineCap(root: Group, m: KitMaterials, face: WallFace, u0: number, u1: number): void {
  const length = u1 - u0
  const mid = (u0 + u1) / 2
  const centre = facePointOf(face, mid, 0)
  const yaw = face.yaw
  root.add(prism(m.graphite, [length + 0.3, 0.2, 0.5], [centre[0], WALL_TOP + 0.06, centre[2]],
    { chamfer: 0.07, fillet: 0.028, bevel: 0.022, rotation: [0, yaw, 0] }))
  for (const offset of [-0.15, 0.15]) {
    const rib = facePointOf(face, mid, offset)
    root.add(prism(m.graphite, [length + 0.24, 0.09, 0.13], [rib[0], WALL_TOP + 0.19, rib[2]],
      { chamfer: 0.03, fillet: 0.02, bevel: 0.016, rotation: [0, yaw, 0] }))
  }
  root.add(prism(m.graphite, [0.26, 0.34, 0.56], [centre[0], WALL_TOP - 0.02, centre[2]],
    { chamfer: 0.08, fillet: 0.028, bevel: 0.022, rotation: [0, yaw, 0] }))
  for (const side of [1, -1] as const) {
    facePrism(root, face, m.graphite, [0.22, 1.4, 0.06], mid, WALL_TOP - 0.86, side * 0.21, { fillet: 0.018, bevel: 0.014 })
    facePrism(root, face, m.amber, [0.07, 0.07, 0.03], mid, WALL_TOP - 0.42, side * 0.26, { fillet: 0.012, bevel: 0.01 })
  }
}

function facePointOf(face: WallFace, u: number, w: number): Vec3 {
  return [
    face.origin[0] + face.u[0] * u + face.n[0] * w,
    0,
    face.origin[2] + face.u[2] * u + face.n[2] * w,
  ]
}

/* ------------------------------------------------------------------ posts -- */

function addPosts(root: Group, m: KitMaterials, segments: readonly Segment[]): void {
  // A vertex knows which of the four compass directions carry a wall; the ones
  // that do not are open air, and those are the faces worth detailing.
  const vertices = new Map<string, { x: number; z: number; dirs: Set<string> }>()
  const touch = (x: number, z: number, dir: string): void => {
    const key = `${x.toFixed(3)}|${z.toFixed(3)}`
    const entry = vertices.get(key) ?? { x, z, dirs: new Set<string>() }
    entry.dirs.add(dir)
    vertices.set(key, entry)
  }
  for (const segment of segments) {
    if (segment.axis === 'x') {
      const [near, far] = segment.from > segment.to ? [segment.from, segment.to] : [segment.to, segment.from]
      touch(segment.line, near, '-z')
      touch(segment.line, far, '+z')
    } else {
      touch(segment.from, segment.line, '+x')
      touch(segment.to, segment.line, '-x')
    }
  }

  for (const { x, z, dirs } of vertices.values()) {
    const junction = dirs.size >= 3
    const open = (['+x', '-x', '+z', '-z'] as const).filter((dir) => !dirs.has(dir))
    const yawOf = { '+x': Math.PI / 2, '-x': -Math.PI / 2, '+z': 0, '-z': Math.PI } as const
    const faces = (open.length > 0 ? open : (['+x', '-x', '+z', '-z'] as const)).map((dir) => yawOf[dir])
    structuralPost(root, m, x, z, {
      size: junction ? KIT_BUILD.junctionSize : KIT_BUILD.postSize,
      top: KIT_BUILD.beamTop - (junction ? 0.22 : 0.28),
      faces,
      accent: junction ? 'cyan' : 'amber',
      gussets: junction ? faces.slice(0, 1) : undefined,
    })
  }
}

/* ------------------------------------------------------- ground and floor -- */

function addGround(root: Group, m: KitMaterials, plan: readonly string[]): void {
  const { cols, rows } = planSize(plan)
  const P = PLINTH_PROJECTION
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      if (!roomAt(plan, i, j)) continue
      // Expand only where there is no neighbour, so adjacent cells abut on a
      // shared plane instead of overlapping and z-fighting across it.
      const west = roomAt(plan, i - 1, j) ? 0 : P
      const east = roomAt(plan, i + 1, j) ? 0 : P
      const north = roomAt(plan, i, j - 1) ? 0 : P
      const south = roomAt(plan, i, j + 1) ? 0 : P
      const x0 = xOf(i) - west
      const x1 = xOf(i + 1) + east
      const z0 = zOf(j) + north
      const z1 = zOf(j + 1) - south
      // Each step pulls back only on the projecting sides, so the stepped
      // section shows on the outside and stays flush on shared cell edges.
      const band = (shrink: number, height: number, y: number, chamfer: number): void => {
        slab(root, m.graphite,
          (x1 - x0) - (west ? shrink : 0) - (east ? shrink : 0),
          (z0 - z1) - (north ? shrink : 0) - (south ? shrink : 0),
          height,
          [(x0 + x1) / 2 + (west ? shrink / 2 : 0) - (east ? shrink / 2 : 0),
            y,
            (z0 + z1) / 2 - (north ? shrink / 2 : 0) + (south ? shrink / 2 : 0)],
          chamfer, { fillet: 0.022, bevel: 0.028 })
      }
      band(0, 0.18, 0.09, 0.36)
      band(0.07, 0.14, 0.25, 0.32)
      band(0.15, 0.12, 0.34, 0.28)

      // Floor tray: inset by half a wall wherever this cell has a wall on that
      // side, flush with the cell edge where it opens into the same room.
      const wallW = roomAt(plan, i - 1, j) === roomAt(plan, i, j) ? 0 : T / 2
      const wallE = roomAt(plan, i + 1, j) === roomAt(plan, i, j) ? 0 : T / 2
      const wallN = roomAt(plan, i, j - 1) === roomAt(plan, i, j) ? 0 : T / 2
      const wallS = roomAt(plan, i, j + 1) === roomAt(plan, i, j) ? 0 : T / 2
      const fx0 = xOf(i) + wallW
      const fx1 = xOf(i + 1) - wallE
      const fz0 = zOf(j) - wallN
      const fz1 = zOf(j + 1) + wallS
      slab(root, m.deck, fx1 - fx0, fz0 - fz1, 0.24, [(fx0 + fx1) / 2, 0.32, (fz0 + fz1) / 2], 0.12,
        { fillet: 0.03, bevel: 0.024 })
      tileGrid(root, m, fx0, fx1, fz1, fz0, FLOOR, 0.92)
    }
  }

  // Prefabrication seams across the plinth apron, on the module rhythm. Each
  // one is placed only where that column actually has an apron to cut, or a
  // ragged plan leaves seams floating over open ground.
  const { width, depth } = layoutEnvelope(plan)
  for (let i = 1; i < cols * 2; i += 1) {
    const x = xOf(0) + (i * GRID) / 2
    if (x <= 0.2 || x >= width - 0.2) continue
    const column = Math.floor((x - PLINTH_PROJECTION) / GRID)
    if (roomAt(plan, column, 0)) {
      root.add(groove(m.ink, 0.5, 0.045, 0.022, [x, 0.404, -0.16], [-Math.PI / 2, 0, Math.PI / 2]))
    }
    if (roomAt(plan, column, rows - 1)) {
      root.add(groove(m.ink, 0.5, 0.045, 0.022, [x, 0.404, -(depth - 0.16)], [-Math.PI / 2, 0, Math.PI / 2]))
    }
  }
}

/* ---------------------------------------------------------------- sockets -- */

export function layoutSockets(spec: LayoutSpec): KitSocket[] {
  const { plan } = spec
  const { cols, rows } = planSize(plan)
  const sockets: KitSocket[] = []
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      if (!roomAt(plan, i, j)) continue
      sockets.push({
        name: `floor_${i}_${j}`, kind: 'floor',
        position: [(xOf(i) + xOf(i + 1)) / 2, FLOOR, (zOf(j) + zOf(j + 1)) / 2], normal: [0, 1, 0],
      })
      sockets.push({
        name: `foundation_${i}_${j}`, kind: 'foundation',
        position: [(xOf(i) + xOf(i + 1)) / 2, 0, (zOf(j) + zOf(j + 1)) / 2], normal: [0, -1, 0],
      })
    }
  }
  for (const segment of collectSegments(plan)) {
    const face = faceFor(segment)
    const mid = segment.axis === 'x'
      ? [segment.line, (segment.from + segment.to) / 2] as const
      : [(segment.from + segment.to) / 2, segment.line] as const
    const outward = segment.partition ? 0 : T / 2
    sockets.push({
      name: `wall_${segment.key.replace(/:/g, '_')}`, kind: 'wall',
      position: [mid[0] + face.n[0] * outward, 1.5, mid[1] + face.n[2] * outward],
      normal: [face.n[0], 0, face.n[2]],
    })
  }
  const segments = new Map(collectSegments(plan).map((segment) => [segment.key, segment]))
  for (const placement of spec.openings ?? []) {
    const segment = segments.get(segmentKey(placement))
    if (!segment) continue
    const face = faceFor(segment)
    const half = KIT_BUILD.postSize / 2
    const ends = segment.axis === 'x'
      ? [uOf(face, segment.line, segment.from), uOf(face, segment.line, segment.to)]
      : [uOf(face, segment.from, segment.line), uOf(face, segment.to, segment.line)]
    const centre = (Math.min(...ends) + half + Math.max(...ends) - half) / 2
    const opening = openingFor(placement, centre)
    const point = facePointOf(face, opening.centre, T / 2)
    sockets.push({
      name: `${placement.kind}_bay_${segment.key.replace(/:/g, '_')}`,
      kind: placement.kind === 'door' ? 'door' : 'window',
      position: [point[0], placement.kind === 'door' ? FLOOR : (opening.sill + opening.head) / 2, point[2]],
      normal: [face.n[0], 0, face.n[2]],
      up: [0, 1, 0],
    })
  }
  return sockets
}

/* ------------------------------------------------------------------ build -- */

export function buildLayout(root: Group, m: KitMaterials, spec: LayoutSpec): void {
  const segments = collectSegments(spec.plan)
  const placements = new Map<string, OpeningPlacement>()
  for (const placement of spec.openings ?? []) placements.set(segmentKey(placement), placement)

  addGround(root, m, spec.plan)
  for (const segment of segments) addWallSegment(root, m, segment, placements.get(segment.key))
  addPosts(root, m, segments)

  // Doorway thresholds: a shallow trapezoidal step outside every exterior door.
  for (const placement of spec.openings ?? []) {
    if (placement.kind !== 'door') continue
    const segment = segments.find((candidate) => candidate.key === segmentKey(placement))
    if (!segment || segment.partition) continue
    const face = faceFor(segment)
    const half = KIT_BUILD.postSize / 2
    const ends = segment.axis === 'x'
      ? [uOf(face, segment.line, segment.from), uOf(face, segment.line, segment.to)]
      : [uOf(face, segment.from, segment.line), uOf(face, segment.to, segment.line)]
    const opening = openingFor(placement, (Math.min(...ends) + half + Math.max(...ends) - half) / 2)
    // Sized to land inside the plinth apron: a deeper step would push the
    // asset's bounds past its declared envelope.
    const point = facePointOf(face, opening.centre, T / 2 + 0.17)
    const along = segment.axis === 'z'
    slab(root, m.graphite,
      along ? opening.width + 0.46 : 0.34, along ? 0.34 : opening.width + 0.46, 0.14,
      [point[0], 0.49, point[2]], 0.18, { fillet: 0.03, bevel: 0.024 })
    root.add(groove(m.ink, opening.width + 0.12, 0.075, 0.035, [point[0], 0.564, point[2]],
      [-Math.PI / 2, 0, along ? Math.PI / 2 : 0]))
    panelLine(root, face, m, opening.width, opening.centre, opening.head + 0.2, T / 2 + 0.02)
  }
}
