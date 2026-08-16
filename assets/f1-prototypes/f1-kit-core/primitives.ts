// primitives — reusable loft builders shared by the F1 kit's pit-lane props. Kept here rather than
// duplicated per-model so every prop that sweeps a curved beam/arm (a pit jack's lift arm, a wheel gun's
// pistol grip) shares identical loft math.

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
    // MAJOR axis = world +X projected into the section plane (streamwise). Degenerate when the tube runs
    // along X → fall back to the Frenet normal so the ring never collapses.
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
