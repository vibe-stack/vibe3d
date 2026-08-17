// primitives — reusable loft builders shared by the F1 kit. Kept here rather than duplicated per-model
// so every prop that sweeps a section (a W-beam, a kerb, a start-light housing) shares identical loft math.

import * as THREE from 'three/webgpu'
import { LoftGeometry } from 'three/examples/jsm/geometries/LoftGeometry.js'

/**
 * An OVAL-section tube swept along a path — a round tube flattened into an aero teardrop. At every station
 * the ellipse is oriented in the plane perpendicular to the path tangent, with its MAJOR axis aligned to the
 * streamwise (world +X) direction projected into that plane and its MINOR axis lateral, so the blade stays
 * chord-forward all the way along the sweep. `majorR` = half the streamwise chord, `minorR` = half the
 * lateral thickness; `radial` points per ring. `taper` optionally scales each axis along the sweep
 * (t = 0..1 from path start to end).
 */
export function ovalTube(
  path: THREE.Vector3[],
  majorR: number,
  minorR: number,
  radial = 12,
  taper?: { major?: (t: number) => number; minor?: (t: number) => number },
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(path)
  const segments = Math.max(24, path.length * 10)
  const frames = curve.computeFrenetFrames(segments, false)
  const worldX = new THREE.Vector3(1, 0, 0)
  const rings: THREE.Vector3[][] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const p = curve.getPointAt(t)
    const tan = frames.tangents[i]!
    const major = worldX.clone().addScaledVector(tan, -worldX.dot(tan))
    if (major.lengthSq() < 1e-6) major.copy(frames.normals[i]!)
    major.normalize()
    const minor = new THREE.Vector3().crossVectors(tan, major).normalize()
    const mR = majorR * (taper?.major?.(t) ?? 1)
    const nR = minorR * (taper?.minor?.(t) ?? 1)
    const ring: THREE.Vector3[] = []
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2
      ring.push(
        p
          .clone()
          .addScaledVector(major, mR * Math.cos(a))
          .addScaledVector(minor, nR * Math.sin(a)),
      )
    }
    rings.push(ring)
  }
  return new LoftGeometry(rings, { closed: false, capStart: true, capEnd: true })
}

/**
 * A closed (or open) profile in the ZY plane, `[z, y]` pairs, swept along X from `-length/2` to `+length/2`.
 * W-beam rails, FIA kerbs, and a grandstand seating bowl all share this: one measured section, lofted.
 */
export function loftAlongX(
  profileZY: ReadonlyArray<readonly [number, number]>,
  length: number,
  opts: { closed?: boolean } = {},
): THREE.BufferGeometry {
  const closed = opts.closed ?? true
  const half = length / 2
  const ring = (x: number): THREE.Vector3[] => profileZY.map(([z, y]) => new THREE.Vector3(x, y, z))
  return new LoftGeometry([ring(-half), ring(+half)], {
    closed,
    capStart: true,
    capEnd: true,
  })
}

/**
 * Rounded-rect ring in XY at a given Z. Same construction as the racing-game start-light housing:
 * four quarter-circles, one shared point count per corner, lofted along Z for a module body.
 */
export function roundedRectRing(
  width: number,
  height: number,
  radius: number,
  z: number,
  seg = 3,
): THREE.Vector3[] {
  const rr = Math.max(1e-4, Math.min(radius, width / 2 - 1e-4, height / 2 - 1e-4))
  const corners: ReadonlyArray<readonly [number, number, number]> = [
    [+width / 2 - rr, -height / 2 + rr, -Math.PI / 2],
    [+width / 2 - rr, +height / 2 - rr, 0],
    [-width / 2 + rr, +height / 2 - rr, +Math.PI / 2],
    [-width / 2 + rr, -height / 2 + rr, +Math.PI],
  ]
  const pts: THREE.Vector3[] = []
  for (const [cx, cy, a0] of corners) {
    for (let j = 0; j <= seg; j++) {
      const a = a0 + (j / seg) * (Math.PI / 2)
      pts.push(new THREE.Vector3(cx + rr * Math.cos(a), cy + rr * Math.sin(a), z))
    }
  }
  return pts
}

/** A rounded-rect box: the XY rounded-rect lofted along Z, capped. */
export function loftRoundedBox(
  width: number,
  height: number,
  depth: number,
  radius: number,
): THREE.BufferGeometry {
  const half = depth / 2
  return new LoftGeometry(
    [roundedRectRing(width, height, radius, -half), roundedRectRing(width, height, radius, half)],
    { closed: false, capStart: true, capEnd: true },
  )
}
