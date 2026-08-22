// sculpt — a small geometry vocabulary shared by the F1 kit's garage-dressing props: a solid of
// revolution (fire extinguisher body, lollipop paddle) and a tapered round tube swept along a path
// (hoses, cable stubs, rack legs).

import * as THREE from 'three/webgpu'

/**
 * A solid of revolution about +Y from a `[t, w]` half-profile (t: 0 bottom -> 1 top, w: radius as a
 * fraction of profile height). `w` is scaled by `scaleW`, heights span `yBot..yTop`.
 */
export function revolve(
  profile: ReadonlyArray<readonly [number, number]>,
  opts: { yBot?: number; yTop?: number; scaleW?: number; segments?: number; flipT?: boolean } = {},
): THREE.BufferGeometry {
  const { yBot = 0, yTop = 1, scaleW = 1, segments = 48, flipT = false } = opts
  const pts = [...profile]
    .map(([t, w]): [number, number] => [flipT ? 1 - t : t, w])
    .sort((a, b) => a[0] - b[0])
    .map(([t, w]) => new THREE.Vector2(Math.max(5e-4, w * scaleW), yBot + t * (yTop - yBot)))
  return new THREE.LatheGeometry(pts, segments)
}

/** A tapered round tube swept along a path (a hose, cable, or rack leg). Thin wrapper over TubeGeometry
 *  with a CatmullRom path. */
export function taperedTube(path: THREE.Vector3[], radius: number, radial = 8): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(path)
  return new THREE.TubeGeometry(curve, Math.max(8, path.length * 6), radius, radial, false)
}
