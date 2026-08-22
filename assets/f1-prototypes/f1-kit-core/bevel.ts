// bevel — chamfered primitives. Modeling rule 1 asks every hero edge to carry a real facet with shared
// normals across it, and rule 7 asks that facet to be a world-unit dimension rather than a percentage of
// whatever it happens to be applied to. These are the shapes the kit builds from.
//
// All of them extrude a 2D outline along +Z with `bevelSegments: 1`, then crease at 50 degrees: one
// facet, smoothed into both neighbours, with square runs left crisp. ExtrudeGeometry output is
// non-indexed, so `toCreasedNormals` returns the same object and nothing leaks.

import * as THREE from 'three/webgpu'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const CREASE_DEG = 50

function extrude(
  shape: THREE.Shape, depth: number, bevel: number, curveSegments: number,
): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, depth - 2 * bevel),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: 0,
    bevelSegments: 1,
    steps: 1,
    curveSegments,
  })
  geo.translate(0, 0, -(depth / 2 - bevel))
  const creased = toCreasedNormals(geo, THREE.MathUtils.degToRad(CREASE_DEG))
  if (creased !== geo) geo.dispose()
  return creased
}

/**
 * A chamfered prism: an arbitrary convex outline in XY, extruded `depth` along +Z and centred on the
 * origin. `bevel` is clamped so it can never invert the shape (rule 6).
 */
export function bevelPrism(
  outline: ReadonlyArray<readonly [number, number]>, depth: number, bevel: number,
): THREE.BufferGeometry {
  let span = Infinity
  for (const [x, y] of outline) span = Math.min(span, Math.abs(x) * 2, Math.abs(y) * 2)
  const b = Math.max(0, Math.min(bevel, Math.min(span, depth) * 0.3))

  // Inset the outline by the bevel so the facet grows back out to the requested extents rather than
  // eating into them — the bevel is a physical dimension, not a fraction of the part (rule 7).
  const scale = (v: number): number => (Math.abs(v) <= b ? v : v * (1 - b / Math.abs(v)))
  const shape = new THREE.Shape()
  outline.forEach(([x, y], i) => {
    if (i === 0) shape.moveTo(scale(x), scale(y))
    else shape.lineTo(scale(x), scale(y))
  })
  shape.closePath()
  return extrude(shape, depth, b, 1)
}

/** A rectangular chamfered block: `width` x `height` x `depth`, centred on the origin, depth along +Z. */
export function bevelBox(
  width: number, height: number, depth: number, bevel: number,
): THREE.BufferGeometry {
  const hw = width / 2
  const hh = height / 2
  return bevelPrism([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]], depth, bevel)
}

/**
 * A tapered blade: a radial spoke running from `rIn` to `rOut` along +X, `wIn` wide at the inner end and
 * `wOut` at the outer, `depth` thick along +Z. Authored at its own radius, so a ring helper only has to
 * rotate it into place.
 */
export function bevelBlade(
  rIn: number, rOut: number, wIn: number, wOut: number, depth: number, bevel: number,
): THREE.BufferGeometry {
  const mid = (rIn + rOut) / 2
  const geo = bevelPrism(
    [[rIn - mid, -wIn / 2], [rOut - mid, -wOut / 2], [rOut - mid, wOut / 2], [rIn - mid, wIn / 2]],
    depth,
    bevel,
  )
  geo.translate(mid, 0, 0)
  return geo
}

/** A chamfered annulus from `rIn` to `rOut`, `depth` thick along +Z. */
export function bevelRing(
  rIn: number, rOut: number, depth: number, bevel: number, curveSegments = 44,
): THREE.BufferGeometry {
  const b = Math.max(0, Math.min(bevel, Math.min(rOut - rIn, depth) * 0.3))
  const shape = new THREE.Shape()
  shape.absarc(0, 0, rOut - b, 0, Math.PI * 2, false)
  const hole = new THREE.Path()
  hole.absarc(0, 0, rIn + b, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  return extrude(shape, depth, b, curveSegments)
}

/** A chamfered disc of `radius`, `depth` thick along +Z. */
export function bevelDisc(
  radius: number, depth: number, bevel: number, curveSegments = 44,
): THREE.BufferGeometry {
  const b = Math.max(0, Math.min(bevel, Math.min(radius, depth) * 0.3))
  const shape = new THREE.Shape()
  shape.absarc(0, 0, radius - b, 0, Math.PI * 2, false)
  return extrude(shape, depth, b, curveSegments)
}

/**
 * A raised arc band lying in XY: an annular sector from `aStart` to `aEnd`, `depth` proud along +Z.
 *
 * Built as one extruded sector rather than a ring of merged chord blocks, which leave visible notches
 * between segments and read as a zipper instead of a painted arc.
 */
export function arcBand(
  rIn: number, rOut: number, aStart: number, aEnd: number, depth: number, bevel: number,
  curveSegments = 28,
): THREE.BufferGeometry {
  const b = Math.max(0, Math.min(bevel, Math.min(rOut - rIn, depth) * 0.3))
  const shape = new THREE.Shape()
  shape.absarc(0, 0, rOut - b, aStart, aEnd, false)
  shape.absarc(0, 0, rIn + b, aEnd, aStart, true)
  shape.closePath()
  return extrude(shape, depth, b, curveSegments)
}
