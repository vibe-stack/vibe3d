import {
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Mesh,
  ShapeUtils,
  Vector2,
  type MeshPhysicalMaterial,
} from 'three/webgpu'

export const WEAR_BAND = 0.075
/** Edge value on clean interior surface, so nothing is ever perfectly pristine. */
export const WEAR_FLOOR = 0.08

export type Vec3 = [number, number, number]
export type Vec2 = [number, number]
/** Corner clip sizes in ring order: top-right, top-left, bottom-left, bottom-right. */
export type Corners = [number, number, number, number]

export interface RingPoint {
  x: number
  y: number
  nx: number
  ny: number
}

/** Twice the enclosed area; positive when the ring is wound counter-clockwise. */
export function signedArea(polygon: Vec2[]): number {
  let total = 0
  for (let i = 0; i < polygon.length; i += 1) {
    const [ax, ay] = polygon[i]
    const [bx, by] = polygon[(i + 1) % polygon.length]
    total += ax * by - bx * ay
  }
  return total
}

/** Returns the ring wound the requested way, copying only when it has to flip. */
export function orientRing(polygon: Vec2[], counterClockwise: boolean): Vec2[] {
  const isCounterClockwise = signedArea(polygon) > 0
  return isCounterClockwise === counterClockwise ? polygon : [...polygon].reverse()
}

/**
 * Rounds every corner of an XY polygon into a tangent arc. The tangent points
 * inherit the arc normal, which is identical to the adjacent edge normal, so
 * straight runs stay perfectly flat while corners shade smoothly.
 *
 * Reflex corners are filleted too. The arc centre already lands on the correct
 * side for them - it is only the outward normal that inverts, because the
 * material is on the far side of the bisector. Concave silhouettes (an L-shaped
 * upright, a notched bracket, a recessed shoulder) therefore round exactly like
 * convex ones, which is what lets a whole part be one ring instead of a stack.
 */
export function filletRing(polygon: Vec2[], fillet: number, arcSegments: number): RingPoint[] {
  const count = polygon.length
  const points: RingPoint[] = []
  const winding = signedArea(polygon) > 0 ? 1 : -1
  for (let i = 0; i < count; i += 1) {
    const previous = polygon[(i - 1 + count) % count]
    const vertex = polygon[i]
    const next = polygon[(i + 1) % count]

    const toPrevious: Vec2 = [previous[0] - vertex[0], previous[1] - vertex[1]]
    const toNext: Vec2 = [next[0] - vertex[0], next[1] - vertex[1]]
    const previousLength = Math.hypot(...toPrevious)
    const nextLength = Math.hypot(...toNext)
    const u1: Vec2 = [toPrevious[0] / previousLength, toPrevious[1] / previousLength]
    const u2: Vec2 = [toNext[0] / nextLength, toNext[1] / nextLength]

    const interior = Math.acos(Math.min(1, Math.max(-1, u1[0] * u2[0] + u1[1] * u2[1])))
    const half = interior * 0.5
    // A degenerate corner (collinear edges) contributes a single flat point.
    if (!Number.isFinite(half) || half < 1e-3 || Math.abs(Math.PI - interior) < 1e-3) {
      const nx = u2[1] * winding
      const ny = -u2[0] * winding
      points.push({ x: vertex[0], y: vertex[1], nx, ny })
      continue
    }

    // The bisector points into the corner's narrow side. On a convex vertex that
    // is the material, so the surface normal runs from the arc centre outward;
    // on a reflex vertex it is the void, and the normal inverts.
    const convex = (u1[0] * u2[1] - u1[1] * u2[0]) * winding < 0
    const facing = convex ? 1 : -1

    const radius = Math.min(fillet, previousLength * 0.49 * Math.tan(half), nextLength * 0.49 * Math.tan(half))
    const tangent = radius / Math.tan(half)
    const bisector: Vec2 = [u1[0] + u2[0], u1[1] + u2[1]]
    const bisectorLength = Math.hypot(...bisector) || 1
    const centre: Vec2 = [
      vertex[0] + (bisector[0] / bisectorLength) * (radius / Math.sin(half)),
      vertex[1] + (bisector[1] / bisectorLength) * (radius / Math.sin(half)),
    ]

    const start: Vec2 = [vertex[0] + u1[0] * tangent, vertex[1] + u1[1] * tangent]
    const end: Vec2 = [vertex[0] + u2[0] * tangent, vertex[1] + u2[1] * tangent]
    const startAngle = Math.atan2(start[1] - centre[1], start[0] - centre[0])
    const endAngle = Math.atan2(end[1] - centre[1], end[0] - centre[0])
    let sweep = endAngle - startAngle
    while (sweep > Math.PI) sweep -= Math.PI * 2
    while (sweep < -Math.PI) sweep += Math.PI * 2

    for (let s = 0; s <= arcSegments; s += 1) {
      const angle = startAngle + (sweep * s) / arcSegments
      const nx = Math.cos(angle)
      const ny = Math.sin(angle)
      points.push({
        x: centre[0] + nx * radius,
        y: centre[1] + ny * radius,
        nx: nx * facing,
        ny: ny * facing,
      })
    }
  }
  return points
}

/**
 * Depth-axis corner cut, the counterpart to the profile-plane `chamfer`.
 *
 * A number cuts both ends; a pair cuts the front and back independently. Give a
 * part both a `chamfer` and a `capChamfer` and every one of its twelve edges is
 * a real 45-degree facet - which is the difference between a machined block and
 * an extruded slab whose ends were left square.
 */
export type CapChamfer = number | [number, number]

export interface PrismOptions {
  /** Large 45-degree corner cuts. A single number applies to all four corners. */
  chamfer?: number | Corners
  /** Large 45-degree cuts on the depth axis: `number` or `[front, back]`. */
  capChamfer?: CapChamfer
  /** Small radius softening every ring corner, including the chamfer's own. */
  fillet?: number
  /** Radius rolling the front and back face edges into the side walls. */
  bevel?: number
  /** Inner rings cut clean through the part. Real openings, not floated quads. */
  holes?: Vec2[][]
  rotation?: Vec3
  arcSegments?: number
  bevelSegments?: number
}

export interface ProfileOptions {
  /** Small radius softening every polygon corner. */
  fillet?: number
  /** Radius rolling the front and back face edges into the side walls. On a
   *  profile extrusion this band is the part's corner facet in the extruded
   *  plane, so hero masses want it large rather than hairline. */
  bevel?: number
  /** Large 45-degree cuts on the depth axis: `number` or `[front, back]`. */
  capChamfer?: CapChamfer
  /**
   * Inner rings cut clean through the extrusion. Each hole gets its own filleted
   * rim, its own bevel roll, and walls that face into the opening, so a screen
   * well, a vent mouth, or a cable pass-through is subtracted from the part
   * rather than faked with a dark quad floated on top of it.
   */
  holes?: Vec2[][]
  rotation?: Vec3
  arcSegments?: number
  bevelSegments?: number
}

/** One ring of the depth cross-section: where it sits, and which way it faces. */
interface Band {
  z: number
  inset: number
  nz: number
  nScale: number
  edge: number
}

/**
 * Builds the depth cross-section as a closed polygon in (inset, z) and fillets
 * it with the very same routine that rounds the profile plane.
 *
 * That symmetry is the point. The old cross-section was hard-coded to a single
 * quarter-round, so the depth axis could only ever receive a hairline roll no
 * matter what the caller asked for - a part could be chamfered across its face
 * and never through its thickness. Expressing depth as a profile means a cap
 * chamfer is just another corner, its own creases get the same bevel, and the
 * two axes finally have equal expressive power.
 */
function depthBands(
  halfDepth: number,
  front: number,
  back: number,
  bevel: number,
  bevelSegments: number,
): Band[] {
  // The section is closed off far inside the part; those corners are discarded
  // after filleting, so their only job is to make the ring a valid polygon.
  const far = halfDepth * 4 + Math.max(front, back) + bevel * 4 + 1
  const section: Vec2[] = [[far, halfDepth]]
  if (front > 0) section.push([front, halfDepth], [0, halfDepth - front])
  else section.push([0, halfDepth])
  if (back > 0) section.push([0, -(halfDepth - back)], [back, -halfDepth])
  else section.push([0, -halfDepth])
  section.push([far, -halfDepth])

  const bands: Band[] = []
  for (const point of filletRing(section, bevel, bevelSegments)) {
    if (point.x > far * 0.5) continue
    // Section +x runs into the part, so its normal component is the ring normal
    // inverted; section +y is world z.
    bands.push({ z: point.y, inset: point.x, nz: point.ny, nScale: -point.nx, edge: 1 })
  }

  // A deep side wall gets two interior rings so its middle can read as clean
  // metal. Without them the wear band would stretch across the whole wall.
  const wall = bands.findIndex((band, index) =>
    index + 1 < bands.length
    && Math.abs(band.inset) < 1e-6 && Math.abs(band.nz) < 1e-6
    && Math.abs(bands[index + 1].inset) < 1e-6 && Math.abs(bands[index + 1].nz) < 1e-6)
  if (wall >= 0 && bands[wall].z - bands[wall + 1].z > WEAR_BAND * 3) {
    bands.splice(wall + 1, 0,
      { z: bands[wall].z - WEAR_BAND, inset: 0, nz: 0, nScale: 1, edge: WEAR_FLOOR },
      { z: bands[wall + 1].z + WEAR_BAND, inset: 0, nz: 0, nScale: 1, edge: WEAR_FLOOR })
  }
  return bands
}

function resolveCapChamfer(value: CapChamfer | undefined, limit: number): [number, number] {
  const pair: [number, number] = typeof value === 'number' ? [value, value] : value ?? [0, 0]
  return [
    Math.max(0, Math.min(pair[0], limit)),
    Math.max(0, Math.min(pair[1], limit)),
  ]
}

/**
 * The tightest arc `filletRing` will actually produce on a convex corner of this
 * polygon, which is the hard ceiling on how far the ring can be inset.
 *
 * A cap chamfer is built by drawing the ring inset from itself, and pushing a
 * rounded corner inward by more than its own radius turns it inside out. Reflex
 * corners only ever open up under the same inset, so they impose no limit.
 */
function minConvexRadius(polygon: Vec2[], fillet: number): number {
  const count = polygon.length
  const winding = signedArea(polygon) > 0 ? 1 : -1
  let smallest = Infinity
  for (let i = 0; i < count; i += 1) {
    const previous = polygon[(i - 1 + count) % count]
    const vertex = polygon[i]
    const next = polygon[(i + 1) % count]
    const toPrevious: Vec2 = [previous[0] - vertex[0], previous[1] - vertex[1]]
    const toNext: Vec2 = [next[0] - vertex[0], next[1] - vertex[1]]
    const previousLength = Math.hypot(...toPrevious)
    const nextLength = Math.hypot(...toNext)
    const u1: Vec2 = [toPrevious[0] / previousLength, toPrevious[1] / previousLength]
    const u2: Vec2 = [toNext[0] / nextLength, toNext[1] / nextLength]
    const interior = Math.acos(Math.min(1, Math.max(-1, u1[0] * u2[0] + u1[1] * u2[1])))
    const half = interior * 0.5
    if (!Number.isFinite(half) || half < 1e-3 || Math.abs(Math.PI - interior) < 1e-3) continue
    if ((u1[0] * u2[1] - u1[1] * u2[0]) * winding >= 0) continue
    smallest = Math.min(
      smallest,
      fillet,
      previousLength * 0.49 * Math.tan(half),
      nextLength * 0.49 * Math.tan(half),
    )
  }
  return smallest
}

/**
 * The single building block for the whole case. Corners and face edges carry a
 * real bevel, but at the segment count a hand modeller would actually use: one
 * facet, with the normals shared across it so it reads as a soft highlight
 * rather than a razor edge. Only the hero masses opt into a second segment.
 */
export function prism(
  material: MeshPhysicalMaterial,
  size: Vec3,
  position: Vec3,
  options: PrismOptions = {},
): Mesh {
  const [width, height, depth] = size
  const hx = width * 0.5
  const hy = height * 0.5

  const raw = options.chamfer ?? 0
  const clips: Corners = typeof raw === 'number' ? [raw, raw, raw, raw] : raw
  // Leave real straight edge between clips. At 0.85 a thin prism's side collapses
  // to a few thou, and filleting both ends of that produces zero-area slivers.
  const [ctr, ctl, cbl, cbr] = clips.map((clip) => Math.min(clip, hx * 0.6, hy * 0.6)) as Corners

  // Counter-clockwise ring beginning at the top-right corner.
  const polygon: Vec2[] = []
  if (ctr > 0) polygon.push([hx, hy - ctr], [hx - ctr, hy])
  else polygon.push([hx, hy])
  if (ctl > 0) polygon.push([-hx + ctl, hy], [-hx, hy - ctl])
  else polygon.push([-hx, hy])
  if (cbl > 0) polygon.push([-hx, -hy + cbl], [-hx + cbl, -hy])
  else polygon.push([-hx, -hy])
  if (cbr > 0) polygon.push([hx - cbr, -hy], [hx, -hy + cbr])
  else polygon.push([hx, -hy])

  return extrudeProfile(material, polygon, depth, position, options)
}

/** Rings are authored counter-clockwise; a hole's wall faces into the opening. */
function ringOf(polygon: Vec2[], fillet: number, arcSegments: number, hole: boolean): RingPoint[] {
  const ring = filletRing(orientRing(polygon, true), fillet, arcSegments)
  if (!hole) return ring
  return ring.map((point) => ({ ...point, nx: -point.nx, ny: -point.ny }))
}

/**
 * Ear-clips a cap, honouring concave outlines and any number of openings.
 *
 * The triangulator wants a counter-clockwise contour and clockwise holes, but
 * the caller has already emitted its vertices in ring order, so any ring flipped
 * on the way in has its indices flipped back on the way out.
 */
function capIndices(outer: Vec2[], holes: Vec2[][]): number[] {
  const toVectors = (ring: Vec2[], counterClockwise: boolean) => {
    const flipped = signedArea(ring) > 0 !== counterClockwise
    const ordered = flipped ? [...ring].reverse() : ring
    return { points: ordered.map(([x, y]) => new Vector2(x, y)), flipped }
  }

  const contour = toVectors(outer, true)
  const rings = holes.map((hole) => toVectors(hole, false))

  // Offsets into the concatenated [outer, ...holes] list the triangulator indexes.
  const spans = [{ start: 0, count: outer.length, flipped: contour.flipped }]
  for (const [index, hole] of holes.entries()) {
    const previous = spans[spans.length - 1]
    spans.push({ start: previous.start + previous.count, count: hole.length, flipped: rings[index].flipped })
  }
  const restore = (index: number): number => {
    const span = spans.findLast((candidate) => index >= candidate.start)!
    const local = index - span.start
    return span.start + (span.flipped ? span.count - 1 - local : local)
  }

  const faces = ShapeUtils.triangulateShape(contour.points, rings.map((ring) => ring.points))

  // An ear-clipper handed a hole it cannot bridge drops it and returns a cap
  // with no opening - geometry that still renders, still passes a volume check
  // on its walls, and reads as a solid face. A dropped hole contributes no
  // vertices at all, which is exact; comparing triangle counts instead would
  // cry wolf every time a collinear corner collapsed.
  const used = new Set<number>()
  for (const triangle of faces) used.add(triangle[0]).add(triangle[1]).add(triangle[2])
  for (let hole = 1; hole < spans.length; hole += 1) {
    const { start, count } = spans[hole]
    let reached = false
    for (let i = start; i < start + count && !reached; i += 1) reached = used.has(i)
    if (!reached) {
      console.warn(
        `extrudeProfile: cap triangulation dropped hole ${hole} - it is too close to the `
        + 'outline or to another hole to bridge, and the face will render solid.',
      )
    }
  }

  const indices: number[] = []
  for (const triangle of faces) {
    indices.push(restore(triangle[0]), restore(triangle[1]), restore(triangle[2]))
  }
  return indices
}

/**
 * Extrudes an arbitrary profile along z with the same bevel, normal, and
 * wear-attribute treatment `prism` gets. The outline may be concave, and
 * `options.holes` cuts real openings clean through it.
 *
 * Reach for this whenever the silhouette is not a clipped rectangle. Stacking
 * boxes to approximate a stepped or tapering mass leaves coincident interior
 * faces, a bevel that restarts at every joint, and a hard seam wherever two
 * blocks meet - the profile has to be one ring for the outline to be one edge.
 */
export function extrudeProfile(
  material: MeshPhysicalMaterial,
  profile: Vec2[],
  depth: number,
  position: Vec3,
  options: ProfileOptions = {},
): Mesh {
  const hz = depth * 0.5
  const arcSegments = options.arcSegments ?? 1
  const bevelSegments = options.bevelSegments ?? 1

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const [x, y] of profile) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  const width = maxX - minX
  const height = maxY - minY
  const hx = width * 0.5
  const hy = height * 0.5

  // Callers author profiles and holes in one shared coordinate system, and
  // `position` is an offset applied on top of the profile's own centre; mesh
  // rotation then pivots about that centre, which is what an angled return
  // plate wants.
  const centreX = (minX + maxX) * 0.5
  const centreY = (minY + maxY) * 0.5
  const recentre = (ring: Vec2[]): Vec2[] =>
    centreX === 0 && centreY === 0
      ? ring
      : ring.map(([x, y]): Vec2 => [x - centreX, y - centreY])
  const polygon = recentre(profile)
  const holePolygons = (options.holes ?? []).map(recentre)
  minX -= centreX
  maxX -= centreX
  minY -= centreY
  maxY -= centreY

  const capLimit = Math.min(hz * 0.9, Math.min(hx, hy) * 0.9)
  const requested = resolveCapChamfer(options.capChamfer, capLimit)
  const chamfered = requested[0] > 0 || requested[1] > 0

  // A cap chamfer needs a corner round enough to carry it, so when the caller
  // has not pinned the profile fillet it opens up to match. That is what a hand
  // modeller does too: a deep 45 on the ends implies the vertical edges are not
  // razor sharp either.
  const autoFillet = Math.max(Math.min(hx, hy) * 0.18, chamfered ? Math.max(...requested) * 1.25 : 0)
  const fillet = Math.max(1e-4, Math.min(options.fillet ?? autoFillet, hx * 0.9, hy * 0.9))

  // Without a cap chamfer the depth axis only carries the legacy hairline roll,
  // whose radius stays tied to the profile fillet. A part that asked for a real
  // depth chamfer has creases of its own to soften, and `filletRing` already
  // clamps a radius that will not fit, so that tie is dropped.
  const rings = [
    ringOf(polygon, fillet, arcSegments, false),
    ...holePolygons.map((hole) => {
      let holeSpan = Infinity
      for (const [ax, ay] of hole) {
        for (const [bx, by] of hole) holeSpan = Math.min(holeSpan, Math.hypot(ax - bx, ay - by) || Infinity)
      }
      const holeFillet = Math.max(1e-4, Math.min(options.fillet ?? holeSpan * 0.24, holeSpan * 0.32))
      return ringOf(hole, holeFillet, arcSegments, true)
    }),
  ]

  // Everything that draws the cap ring inward shares one budget. Overrun it and
  // a corner arc turns inside out, or a hole's mouth opens wider than the
  // outline enclosing it - and an ear-clipper handed either one gives up and
  // returns a cap with no hole in it at all.
  const clearance = ringClearance(rings)
  const insetLimit = Math.min(minConvexRadius(polygon, fillet) * 0.85, clearance * 0.42)

  const defaultBevel = Math.min(0.028, hz * 0.6)
  const bevel = Math.max(1e-4, Math.min(
    options.bevel ?? defaultBevel,
    hz * 0.9,
    insetLimit,
    // Without a cap chamfer the roll is the whole depth-axis treatment, and its
    // radius has always been tied to the profile fillet.
    chamfered ? Infinity : fillet * 1.6,
  ))
  const insetCeiling = Math.max(0, insetLimit - bevel * 0.4143)
  const [frontChamfer, backChamfer] = [
    Math.min(requested[0], insetCeiling),
    Math.min(requested[1], insetCeiling),
  ]

  const bands = depthBands(hz, frontChamfer, backChamfer, bevel, bevelSegments)

  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const edges: number[] = []
  const planes: number[] = []
  const indices: number[] = []

  const pushVertex = (
    x: number, y: number, z: number,
    nx: number, ny: number, nz: number,
    edge: number, planeU: number, planeV: number,
  ): void => {
    positions.push(x, y, z)
    normals.push(nx, ny, nz)
    uvs.push((x - minX) / width, (y - minY) / height)
    edges.push(edge)
    planes.push(planeU, planeV)
  }

  // Side walls, one strip per ring. Cumulative arc length is the surface
  // parameter the wear is evaluated in: projecting world position onto an axis
  // plane instead smears the pattern into stripes wherever the surface turns
  // edge-on to the projection, which is exactly what a bevel does.
  for (const [ringIndex, ring] of rings.entries()) {
    const ringCount = ring.length
    const arc: number[] = []
    let travelled = 0
    for (let i = 0; i < ringCount; i += 1) {
      arc.push(travelled)
      const next = ring[(i + 1) % ringCount]
      travelled += Math.hypot(next.x - ring[i].x, next.y - ring[i].y)
    }

    const base = positions.length / 3
    for (const band of bands) {
      for (const [i, point] of ring.entries()) {
        pushVertex(
          point.x - point.nx * band.inset, point.y - point.ny * band.inset, band.z,
          point.nx * band.nScale, point.ny * band.nScale, band.nz,
          band.edge, arc[i], band.z,
        )
      }
    }
    for (let s = 0; s < bands.length - 1; s += 1) {
      const a = base + s * ringCount
      const b = base + (s + 1) * ringCount
      for (let i = 0; i < ringCount; i += 1) {
        const j = (i + 1) % ringCount
        // A hole's wall faces the opening, so its strip winds the other way.
        if (ringIndex === 0) indices.push(a + i, b + i, b + j, a + i, b + j, a + j)
        else indices.push(a + i, b + j, b + i, a + i, a + j, b + j)
      }
    }
  }

  // Caps. A face broad enough to have a clean middle gets an inset rim ring, so
  // the rub band stays a constant width instead of scaling with the panel. A
  // small greeble has no clean middle and stays worn all over. Offsetting a ring
  // inward is only safe while it stays convex, so a concave outline skips the
  // rim band rather than risk folding its own cap inside out.
  const halfMin = Math.min(hx, hy)
  const convex = rings.every((ring, index) => index === 0 ? isConvexRing(ring) : true)
  // Each ring's rub band eats WEAR_BAND of face on its way inward, so two rings
  // separated by less than two bands would offset straight through each other
  // and hand the triangulator a hole wider than its own contour.
  const broad = halfMin > WEAR_BAND * 3.2 && convex
    && clearance > WEAR_BAND * 2.4
    && rings.every((ring) => ringSpan(ring) > WEAR_BAND * 3.2)

  for (const [index, band] of [bands[0], bands[bands.length - 1]].entries()) {
    // Each cap gets its own copy of the rim ring. It has to be parameterised in
    // the face plane, and the wall's copy is parameterised as arc length for the
    // bevel - one vertex cannot carry both. The seam lands on the hard edge,
    // which is where an unwrap would put it anyway.
    const capBase = positions.length / 3
    const offsetRing = (ring: RingPoint[], inset: number): Vec2[] =>
      ring.map((point): Vec2 => [point.x - point.nx * inset, point.y - point.ny * inset])
    const rims = rings.map((ring) => offsetRing(ring, band.inset))

    // The rub band is measured from the profile itself, not from the rim, so a
    // hairline bevel does not eat into it. A cap chamfer can push the rim past
    // that, in which case the band follows the rim inward instead.
    const wearInset = Math.max(WEAR_BAND, band.inset + WEAR_BAND * 0.5)
    const wears = rings.map((ring) => offsetRing(ring, wearInset))
    // Offsetting a ring inward by more than a corner's fillet radius turns that
    // corner inside out. Reversed segments are the exact symptom, and a cap that
    // cannot hold a clean band is better off without one than folded.
    const safe = wears.every((wear, index) => wear.every((point, i) => {
      const next = wear[(i + 1) % wear.length]
      const ring = rings[index]
      const source = ring[i]
      const sourceNext = ring[(i + 1) % ring.length]
      const dot = (next[0] - point[0]) * (sourceNext.x - source.x)
        + (next[1] - point[1]) * (sourceNext.y - source.y)
      return dot >= 0
    }))

    let fanRings = rims
    if (broad && safe) {
      for (const rim of rims) {
        for (const [x, y] of rim) pushVertex(x, y, band.z, 0, 0, band.nz, 1, x, y)
      }
      const wearBase = positions.length / 3
      for (const wear of wears) {
        for (const [x, y] of wear) pushVertex(x, y, band.z, 0, 0, band.nz, WEAR_FLOOR, x, y)
      }
      let cursor = 0
      for (const [ringIndex, ring] of rings.entries()) {
        const count = ring.length
        const rimStart = capBase + cursor
        const wearStart = wearBase + cursor
        cursor += count
        for (let i = 0; i < count; i += 1) {
          const j = (i + 1) % count
          // The inset ring runs inward from the rim, reversing the winding
          // relative to the outward-facing wall bands; a hole reverses again.
          const flip = (index === 0) === (ringIndex === 0)
          if (flip) {
            indices.push(rimStart + i, wearStart + j, wearStart + i, rimStart + i, rimStart + j, wearStart + j)
          } else {
            indices.push(rimStart + j, wearStart + i, wearStart + j, rimStart + j, rimStart + i, wearStart + i)
          }
        }
      }
      fanRings = wears
    } else {
      const edge = halfMin > WEAR_BAND * 3.2 ? WEAR_FLOOR : Math.max(0, 1 - halfMin / (WEAR_BAND * 2.2))
      for (const rim of rims) {
        for (const [x, y] of rim) pushVertex(x, y, band.z, 0, 0, band.nz, edge, x, y)
      }
    }

    const fanBase = fanRings === rims
      ? capBase
      : positions.length / 3 - fanRings.reduce((total, ring) => total + ring.length, 0)
    const face = capIndices(fanRings[0], fanRings.slice(1))
    for (let t = 0; t < face.length; t += 3) {
      // Triangulation is authored for a counter-clockwise contour seen from +z.
      if (index === 0) indices.push(fanBase + face[t], fanBase + face[t + 1], fanBase + face[t + 2])
      else indices.push(fanBase + face[t + 2], fanBase + face[t + 1], fanBase + face[t])
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('aEdge', new Float32BufferAttribute(edges, 1))
  geometry.setAttribute('aPlane', new Float32BufferAttribute(planes, 2))
  geometry.setIndex(indices)

  const mesh = new Mesh(geometry, material)
  mesh.position.set(position[0] + centreX, position[1] + centreY, position[2])
  if (options.rotation) mesh.rotation.set(...options.rotation)
  return mesh
}

/**
 * Narrowest web of material between any two rings of the profile - the outer
 * outline and each opening. Infinite when the part has no holes at all.
 *
 * Measured point-to-edge in both directions, never corner-to-corner: two
 * concentric rectangles a tenth apart have corners a seventh apart, and trusting
 * that larger figure lets a chamfer open a hole wider than the outline it is
 * supposed to sit inside.
 *
 * It runs on the filleted rings rather than the polygons they came from, because
 * those rings are what actually gets offset - rounding two facing corners pulls
 * them closer than the straight edges ever were, and measuring the input would
 * miss it.
 */
function ringClearance(rings: RingPoint[][]): number {
  if (rings.length < 2) return Infinity
  let smallest = Infinity
  for (let a = 0; a < rings.length; a += 1) {
    for (let b = 0; b < rings.length; b += 1) {
      if (a === b) continue
      for (const { x: px, y: py } of rings[a]) {
        const ring = rings[b]
        for (let i = 0; i < ring.length; i += 1) {
          const { x: ax, y: ay } = ring[i]
          const { x: bx, y: by } = ring[(i + 1) % ring.length]
          const dx = bx - ax
          const dy = by - ay
          const lengthSquared = dx * dx + dy * dy
          const t = lengthSquared > 0
            ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
            : 0
          smallest = Math.min(smallest, Math.hypot(px - (ax + dx * t), py - (ay + dy * t)))
        }
      }
    }
  }
  return smallest
}

/** Smallest width of a ring's bounding box - its room for a constant wear band. */
function ringSpan(ring: RingPoint[]): number {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const point of ring) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  }
  return Math.min(maxX - minX, maxY - minY)
}

function isConvexRing(ring: RingPoint[]): boolean {
  const count = ring.length
  let sign = 0
  for (let i = 0; i < count; i += 1) {
    const a = ring[i]
    const b = ring[(i + 1) % count]
    const c = ring[(i + 2) % count]
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (Math.abs(cross) < 1e-9) continue
    const current = Math.sign(cross)
    if (sign === 0) sign = current
    else if (current !== sign) return false
  }
  return true
}

/**
 * A single quad. Engraved marks, dashes, and slot cuts on a flat armor face are
 * two triangles apiece, the way they would be modelled or floated by hand -
 * they never justify a beveled solid.
 */
export function flatPlate(
  material: MeshPhysicalMaterial,
  size: Vec2,
  position: Vec3,
  rotation: Vec3 = [0, 0, 0],
  engraved = true,
): Mesh {
  const hx = size[0] * 0.5
  const hy = size[1] * 0.5
  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute([-hx, -hy, 0, hx, -hy, 0, hx, hy, 0, -hx, hy, 0], 3),
  )
  geometry.setAttribute('normal', new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3))
  geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2))
  // Engraved marks sit in a cut, so they read as worn along their whole length.
  geometry.setAttribute('aEdge', new Float32BufferAttribute([0.7, 0.7, 0.7, 0.7], 1))
  geometry.setAttribute(
    'aPlane',
    new Float32BufferAttribute([-hx, -hy, hx, -hy, hx, hy, -hx, hy], 2),
  )
  geometry.setIndex([0, 1, 2, 0, 2, 3])
  const mesh = new Mesh(geometry, material)
  mesh.position.set(...position)
  mesh.rotation.set(...rotation)
  // A cut runs along the mark's long axis, so its profile is read across the
  // short one. Painted markers are not cuts and opt out.
  if (engraved) mesh.userData.grooveCross = size[0] >= size[1] ? 'y' : 'x'
  return mesh
}

/**
 * A real cut: a narrow channel with two side walls and a floor, extruded along
 * its length.
 *
 * A dark quad floated on a face shares that face's normal, so it lights
 * identically to the surface around it and reads as paint no matter how black it
 * is. What makes a panel line read as engraved is that its two walls face
 * opposite directions - one catches the key and one falls into shadow - which
 * only exists if the walls are geometry. Six triangles buys that.
 *
 * The channel is cut into the plane z = 0 with the face normal along +z; rotate
 * the mesh to place it on any other face.
 */
export function groove(
  material: MeshPhysicalMaterial,
  length: number,
  width: number,
  depth: number,
  position: Vec3,
  rotation: Vec3 = [0, 0, 0],
): Mesh {
  const hw = width * 0.5
  const hl = length * 0.5
  // Wall draft. A dead-vertical wall gives the two sides the same shading under
  // a frontal key, so the cut needs a real opening angle to separate them.
  const wall = Math.min(hw * 0.55, depth * 0.9)

  // Cross-section across the width, from one rim down to the floor and back.
  const section: Vec2[] = [
    [-hw, 0],
    [-hw + wall, -depth],
    [hw - wall, -depth],
    [hw, 0],
  ]

  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const edges: number[] = []
  const planes: number[] = []
  const indices: number[] = []

  for (let i = 0; i < section.length - 1; i += 1) {
    const [ax, az] = section[i]
    const [bx, bz] = section[i + 1]
    // Outward normal of this facet: perpendicular to the section edge, pointing
    // up out of the cut.
    const dx = bx - ax
    const dz = bz - az
    const nl = Math.hypot(dx, dz) || 1
    const nx = -dz / nl
    const nz = dx / nl
    const base = positions.length / 3
    for (const [x, z] of [[ax, az], [bx, bz]] as const) {
      for (const y of [-hl, hl]) {
        positions.push(x, y, z)
        normals.push(nx, 0, nz)
        uvs.push((x + hw) / width, (y + hl) / length)
        // A cut is worn along its whole length; nothing in here is pristine.
        edges.push(0.85)
        planes.push(y, x)
      }
    }
    indices.push(base, base + 2, base + 3, base, base + 3, base + 1)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('aEdge', new Float32BufferAttribute(edges, 1))
  geometry.setAttribute('aPlane', new Float32BufferAttribute(planes, 2))
  geometry.setIndex(indices)

  const mesh = new Mesh(geometry, material)
  mesh.position.set(...position)
  mesh.rotation.set(...rotation)
  mesh.userData.grooveCross = 'x'
  return mesh
}

export function cylinder(
  material: MeshPhysicalMaterial,
  radius: number,
  depth: number,
  position: Vec3,
  rotation: Vec3 = [0, 0, 0],
  segments = 8,
): Mesh {
  const geometry = new CylinderGeometry(radius, radius, depth, segments)
  // Bolt heads and pivot bosses are small proud hardware: worn across the cap.
  const count = geometry.getAttribute('position').count
  geometry.setAttribute('aEdge', new Float32BufferAttribute(new Float32Array(count).fill(0.75), 1))
  const mesh = new Mesh(geometry, material)
  mesh.position.set(...position)
  mesh.rotation.set(...rotation)
  return mesh
}

/** Flat down-pointing triangle, so the latch arrow is deterministic. */
export function downTriangle(material: MeshPhysicalMaterial, width: number, height: number, position: Vec3): Mesh {
  const hx = width * 0.5
  const hy = height * 0.5
  const hz = 0.01
  const face: Vec2[] = [
    [-hx, hy],
    [hx, hy],
    [0, -hy],
  ]
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  for (const z of [-hz, hz]) {
    for (const [x, y] of face) {
      positions.push(x, y, z)
      normals.push(0, 0, Math.sign(z))
      uvs.push(0.5, 0.5)
    }
  }
  const indices = [0, 2, 1, 3, 4, 5, 0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 2, 0, 3, 2, 3, 5]
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('aEdge', new Float32BufferAttribute(new Float32Array(6).fill(0.6), 1))
  geometry.setIndex(indices)
  const mesh = new Mesh(geometry, material)
  mesh.position.set(...position)
  return mesh
}

