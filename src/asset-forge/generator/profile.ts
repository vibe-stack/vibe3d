import { orientRing, signedArea, type Vec2 } from './primitives.ts'

/**
 * Shape algebra for extrusion profiles.
 *
 * `extrudeProfile` has always accepted any polygon, so a notched frame or an
 * interlocking pair was never beyond the geometry - it was beyond the *notation*.
 * Absolute coordinate lists can only be typed out, and two parts that must fit
 * each other can only be typed out twice and kept in sync by hand, which never
 * survives the first edit.
 *
 * These are the operations hard-surface forms are actually conceived in: take an
 * outline, step one of its edges, offset the whole ring to get the part that
 * mates with it. A profile built this way stays correct when its source moves,
 * which is the only reason a fit ever holds.
 */

const EPSILON = 1e-6

function unit(x: number, y: number): Vec2 {
  const length = Math.hypot(x, y) || 1
  return [x / length, y / length]
}

/** Axis-aligned rectangle, counter-clockwise from the top-right. */
export function rect(halfWidth: number, halfHeight: number): Vec2[] {
  return [
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight],
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
  ]
}

/** Rectangle with all four corners clipped at 45 degrees - the kit's octagon. */
export function octagon(halfWidth: number, halfHeight: number, clip: number): Vec2[] {
  return [
    [halfWidth, halfHeight - clip], [halfWidth - clip, halfHeight],
    [-halfWidth + clip, halfHeight], [-halfWidth, halfHeight - clip],
    [-halfWidth, -halfHeight + clip], [-halfWidth + clip, -halfHeight],
    [halfWidth - clip, -halfHeight], [halfWidth, -halfHeight + clip],
  ]
}

/** Mirrors a right-hand outline into a closed symmetric ring. */
export function mirrorProfile(right: Vec2[]): Vec2[] {
  return [...right, ...[...right].reverse().map(([x, y]): Vec2 => [-x, y])]
}

export type Side = 'top' | 'bottom' | 'left' | 'right'

/**
 * Steps a centred span of one side in or out, joined by 45-degree runs.
 *
 * This is the notch that shows up on nearly every hard-surface frame and stand,
 * and the reason it is worth a named operation is that writing it by hand means
 * inventing six coordinates that have to stay symmetric about the centre and
 * stay put when the outline around them changes.
 *
 * A positive `rise` pushes the span outward; a negative one sinks it, which
 * makes two reflex corners - filleted and extruded exactly like convex ones.
 */
export function stepEdge(
  profile: Vec2[],
  side: Side,
  halfSpan: number,
  rise: number,
  run = Math.abs(rise),
): Vec2[] {
  const ring = orientRing(profile, true)
  const horizontal = side === 'top' || side === 'bottom'
  const outward = side === 'top' || side === 'right' ? 1 : -1

  // Along-axis coordinate of the side, and the ring's extreme in that direction.
  const axis = (point: Vec2): number => (horizontal ? point[1] : point[0])
  const across = (point: Vec2): number => (horizontal ? point[0] : point[1])
  let extreme = -Infinity
  for (const point of ring) extreme = Math.max(extreme, axis(point) * outward)
  extreme *= outward

  const make = (alongCentre: number, acrossValue: number): Vec2 =>
    horizontal ? [acrossValue, alongCentre] : [alongCentre, acrossValue]

  const stepped = extreme + rise * outward
  const result: Vec2[] = []
  let inserted = false

  for (let i = 0; i < ring.length; i += 1) {
    const current = ring[i]
    const next = ring[(i + 1) % ring.length]
    result.push(current)
    if (inserted) continue
    // The edge lying on the side being stepped, long enough to hold the span.
    if (Math.abs(axis(current) - extreme) > EPSILON) continue
    if (Math.abs(axis(next) - extreme) > EPSILON) continue
    const from = across(current)
    const to = across(next)
    if (Math.min(from, to) > -halfSpan - run || Math.max(from, to) < halfSpan + run) continue

    // Insert in traversal order so the ring stays wound the way it arrived.
    const descending = to < from
    const outer = halfSpan + run
    const spans: Array<[number, number]> = descending
      ? [[outer, extreme], [halfSpan, stepped], [-halfSpan, stepped], [-outer, extreme]]
      : [[-outer, extreme], [-halfSpan, stepped], [halfSpan, stepped], [outer, extreme]]
    for (const [acrossValue, alongValue] of spans) result.push(make(alongValue, acrossValue))
    inserted = true
  }

  if (!inserted) {
    throw new Error(`stepEdge: no ${side} edge wide enough for a ${halfSpan * 2} span`)
  }
  return result
}

/**
 * Offsets every edge of a ring by a constant distance, mitring the corners.
 *
 * Positive grows the shape, negative shrinks it. This is what makes two parts
 * fit by construction: author the inner part once, and derive whatever wraps it
 * as `offsetProfile(inner, gap)`. Edit the inner outline afterwards - add a
 * notch to it, move a corner - and the mating part follows, because it was never
 * a second copy of the numbers in the first place.
 */
export function offsetProfile(profile: Vec2[], distance: number, miterLimit = 4): Vec2[] {
  const ring = orientRing(profile, true)
  const count = ring.length
  const winding = signedArea(ring) > 0 ? 1 : -1
  const result: Vec2[] = []

  for (let i = 0; i < count; i += 1) {
    const previous = ring[(i - 1 + count) % count]
    const vertex = ring[i]
    const next = ring[(i + 1) % count]

    const incoming = unit(vertex[0] - previous[0], vertex[1] - previous[1])
    const outgoing = unit(next[0] - vertex[0], next[1] - vertex[1])
    // Outward edge normal of a counter-clockwise ring is the direction turned
    // right; `winding` keeps that true if a caller hands in a reversed loop.
    const firstNormal: Vec2 = [incoming[1] * winding, -incoming[0] * winding]
    const secondNormal: Vec2 = [outgoing[1] * winding, -outgoing[0] * winding]

    const bisector = unit(firstNormal[0] + secondNormal[0], firstNormal[1] + secondNormal[1])
    const cosine = bisector[0] * firstNormal[0] + bisector[1] * firstNormal[1]
    if (!Number.isFinite(cosine) || cosine < EPSILON) {
      result.push([vertex[0] + firstNormal[0] * distance, vertex[1] + firstNormal[1] * distance])
      continue
    }
    // A sharp corner's mitre runs away to infinity, so it is capped rather than
    // allowed to throw a spike out of the silhouette.
    const reach = Math.min(1 / cosine, miterLimit)
    result.push([
      vertex[0] + bisector[0] * distance * reach,
      vertex[1] + bisector[1] * distance * reach,
    ])
  }
  return result
}
