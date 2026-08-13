/** Screen-space LOD policy shared by the single rock and cliff assembly. */

export type LodLevel = 0 | 1 | 2
export type LodWeights = readonly [number, number, number]

const LOD1_FULL_DETAIL_PIXELS = 3
const LOD1_COARSE_PIXELS = 1.5
const LOD2_FULL_DETAIL_PIXELS = 1.2
const LOD2_COARSE_PIXELS = 0.6

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Project an object-space error into vertical screen pixels. */
export function projectedErrorPixels(
  errorWorld: number,
  distance: number,
  verticalFovDegrees: number,
  viewportHeight: number,
): number {
  const safeDistance = Math.max(1e-4, distance)
  const fovRadians = verticalFovDegrees * Math.PI / 180
  return errorWorld * viewportHeight / (2 * Math.tan(fovRadians * 0.5) * safeDistance)
}

/**
 * Continuous target weights. Wide, non-overlapping transition bands make slow
 * camera motion stable without a discrete threshold or hysteresis toggle.
 */
export function targetLodWeights(
  lod1ErrorPixels: number,
  lod2ErrorPixels: number,
  minimumLevel: LodLevel = 0,
): LodWeights {
  const lod1 = minimumLevel >= 1
    ? 1
    : 1 - smoothstep(LOD1_COARSE_PIXELS, LOD1_FULL_DETAIL_PIXELS, lod1ErrorPixels)
  const lod2 = minimumLevel >= 2
    ? 1
    : 1 - smoothstep(LOD2_COARSE_PIXELS, LOD2_FULL_DETAIL_PIXELS, lod2ErrorPixels)
  const level2 = lod1 * lod2
  return [1 - lod1, lod1 - level2, level2]
}

/** Frame-rate-independent temporal settling for teleports and camera cuts. */
export function settleLodWeights(
  current: LodWeights,
  target: LodWeights,
  deltaSeconds: number,
  response = 12,
): LodWeights {
  const blend = 1 - Math.exp(-Math.max(0, deltaSeconds) * response)
  const next = current.map((value, index) => value + (target[index]! - value) * blend)
  const total = next[0]! + next[1]! + next[2]! || 1
  return [next[0]! / total, next[1]! / total, next[2]! / total]
}
