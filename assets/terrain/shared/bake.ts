/**
 * Genuine high-to-low surface bake into a packed UV atlas.
 *
 * For every atlas texel covered by the reduced mesh, a ray is cast along the
 * low-poly normal and sphere-traced against the recipe's full-detail analytic
 * surface, including the micro relief that is below the dense mesh's Nyquist
 * limit and therefore cannot exist in any extracted geometry. What the reduction
 * removed is measured here and returned as normal, height, occlusion and
 * curvature.
 *
 * Tracing the analytic field rather than a BVH over the dense triangles is both
 * less machinery and strictly more accurate: the dense mesh is itself only a
 * sampled approximation of this field, so baking from it would bake in its
 * sampling error and cap the detail at the mesh's own resolution.
 *
 * An earlier implementation baked none of this. It generated 2D tiling noise
 * unrelated to the model, and never wrote the normal channel the material asked
 * for, so the low-poly had no recovered detail at all. That is the failure this
 * module exists to make impossible: every channel is measured against the field
 * at a traced surface point, and `stats.hitTexels` reports how often the trace
 * actually found the surface.
 */

import {
  COMPILED_SURFACE_BAKE_FORMAT,
  assertCompiledSurfaceBake,
  type CompiledSurfaceBake,
} from '../../../packages/terrain/src/index.ts'
import type { Vec3 } from './noise.ts'
import type { UnwrapResult } from './unwrap.ts'

/**
 * The authoritative high-resolution surface a bake is measured against.
 *
 * This is deliberately *not* the same field the mesh was extracted from: it
 * includes every band, including those below the mesh's Nyquist limit. If a
 * recipe passed its band-limited field here the bake would recover nothing,
 * because the low-poly already represents everything that field contains.
 */
export interface DetailField {
  sdf(x: number, y: number, z: number, seed: number): number
  normal(x: number, y: number, z: number, seed: number, step: number): Vec3
  /**
   * Optional material region at a surface point, in [0, 1], written as a
   * `region-mask` channel.
   *
   * Recipes whose colour is structural need this. A canyon's strata are geometry
   * and pigment at once, and a material that re-derives the banding from world Y
   * in the shader cannot land on the same boundaries the beds were cut at, so the
   * colour slides off the ledges. Sampling the recipe at the traced hit point is
   * in exact register by construction.
   */
  regionMask?(x: number, y: number, z: number, seed: number): number
}

export const BAKE_WIDTH = 512
export const BAKE_HEIGHT = 512

/**
 * Search envelope along the low-poly normal, in domain units.
 *
 * This has to exceed the reduction error or the trace misses the detailed
 * surface entirely and the texel falls back to flat; it must not greatly exceed
 * it either, or a ray can pass through a neighbouring feature and bake relief
 * belonging to some other part of the rock. Recipes with coarser LOD0 grids
 * override it.
 */
const DEFAULT_SEARCH_DISTANCE = 0.055

export interface SurfaceBakeIdentity {
  assetId: string
  topologyKey: string
  recipeHash: string
  compilerHash: string
  profile: string
}

export interface SurfaceBakeStats {
  width: number
  height: number
  coveredTexels: number
  coverage: number
  hitTexels: number
  /** Peak recovered relief in domain units. */
  peakHeight: number
  dilationPasses: number
}

export interface SurfaceBakeResult {
  bake: CompiledSurfaceBake
  stats: SurfaceBakeStats
}

function encodeUnorm(value: number): number {
  const clamped = value < 0 ? 0 : value > 1 ? 1 : value
  return (clamped * 255 + 0.5) | 0
}

/**
 * Sphere-trace the detailed field. The ray starts outside the low-poly surface
 * and marches inward; the first sign change is refined by bisection so the hit
 * is accurate to well under a texel of relief.
 */
function traceDetail(
  field: DetailField,
  originX: number, originY: number, originZ: number,
  directionX: number, directionY: number, directionZ: number,
  seed: number,
  maximumDistance: number,
): number {
  let travelled = 0
  let previous = field.sdf(originX, originY, originZ, seed)
  const coarseStep = maximumDistance / 48
  while (travelled < maximumDistance) {
    const advance = Math.min(coarseStep, Math.max(Math.abs(previous) * 0.85, maximumDistance / 256))
    const next = travelled + advance
    const value = field.sdf(
      originX + directionX * next,
      originY + directionY * next,
      originZ + directionZ * next,
      seed,
    )
    if ((value < 0) !== (previous < 0)) {
      let low = travelled
      let high = next
      let lowValue = previous
      for (let iteration = 0; iteration < 12; iteration += 1) {
        const middle = (low + high) * 0.5
        const middleValue = field.sdf(
          originX + directionX * middle,
          originY + directionY * middle,
          originZ + directionZ * middle,
          seed,
        )
        if ((middleValue < 0) === (lowValue < 0)) {
          low = middle
          lowValue = middleValue
        } else high = middle
      }
      return (low + high) * 0.5
    }
    previous = value
    travelled = next
  }
  return -1
}

/**
 * Ambient occlusion straight from the field. Sampling the signed distance at
 * growing radii along the normal measures how much nearby matter blocks the
 * hemisphere, which is what a hemisphere ray bundle would approximate at many
 * times the cost.
 */
function fieldOcclusion(
  field: DetailField,
  x: number, y: number, z: number,
  nx: number, ny: number, nz: number,
  seed: number,
): number {
  let occlusion = 0
  let weight = 0.6
  for (let step = 1; step <= 5; step += 1) {
    const distance = step * 0.012
    const sampled = field.sdf(x + nx * distance, y + ny * distance, z + nz * distance, seed)
    // On an unoccluded surface the distance grows as fast as the step.
    occlusion += Math.max(0, distance - sampled) * weight / distance
    weight *= 0.72
  }
  return Math.max(0, Math.min(1, 1 - occlusion * 0.55))
}

interface Raster {
  position: Float32Array
  normal: Float32Array
  covered: Uint8Array
}

/** Scanline-rasterize the atlas triangles, recording surface point and normal. */
function rasterizeCharts(
  unwrapped: UnwrapResult,
  width: number,
  height: number,
): Raster {
  const position = new Float32Array(width * height * 3)
  const normal = new Float32Array(width * height * 3)
  const covered = new Uint8Array(width * height)
  const triangleCount = unwrapped.indices.length / 3

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const ia = unwrapped.indices[triangle * 3]!
    const ib = unwrapped.indices[triangle * 3 + 1]!
    const ic = unwrapped.indices[triangle * 3 + 2]!
    const ua = unwrapped.uvs[ia * 2]! * width
    const va = unwrapped.uvs[ia * 2 + 1]! * height
    const ub = unwrapped.uvs[ib * 2]! * width
    const vb = unwrapped.uvs[ib * 2 + 1]! * height
    const uc = unwrapped.uvs[ic * 2]! * width
    const vc = unwrapped.uvs[ic * 2 + 1]! * height

    // Conservative bounds: one texel of bleed keeps chart interiors watertight.
    const minX = Math.max(0, Math.floor(Math.min(ua, ub, uc) - 1))
    const maxX = Math.min(width - 1, Math.ceil(Math.max(ua, ub, uc) + 1))
    const minY = Math.max(0, Math.floor(Math.min(va, vb, vc) - 1))
    const maxY = Math.min(height - 1, Math.ceil(Math.max(va, vb, vc) + 1))
    const area = (ub - ua) * (vc - va) - (uc - ua) * (vb - va)
    if (Math.abs(area) < 1e-9) continue
    const inverseArea = 1 / area

    for (let py = minY; py <= maxY; py += 1) {
      for (let px = minX; px <= maxX; px += 1) {
        const sx = px + 0.5
        const sy = py + 0.5
        let w1 = ((sx - ua) * (vc - va) - (uc - ua) * (sy - va)) * inverseArea
        let w2 = ((ub - ua) * (sy - va) - (sx - ua) * (vb - va)) * inverseArea
        let w0 = 1 - w1 - w2
        // Snap marginal misses inward rather than leaving seam holes.
        const slack = -0.06
        if (w0 < slack || w1 < slack || w2 < slack) continue
        w0 = Math.max(0, w0); w1 = Math.max(0, w1); w2 = Math.max(0, w2)
        const sum = w0 + w1 + w2 || 1
        w0 /= sum; w1 /= sum; w2 /= sum

        const texel = px + py * width
        if (covered[texel]) continue
        covered[texel] = 1
        for (let axis = 0; axis < 3; axis += 1) {
          position[texel * 3 + axis] =
            unwrapped.positions[ia * 3 + axis]! * w0
            + unwrapped.positions[ib * 3 + axis]! * w1
            + unwrapped.positions[ic * 3 + axis]! * w2
          normal[texel * 3 + axis] =
            unwrapped.normals[ia * 3 + axis]! * w0
            + unwrapped.normals[ib * 3 + axis]! * w1
            + unwrapped.normals[ic * 3 + axis]! * w2
        }
      }
    }
  }
  return { position, normal, covered }
}

/**
 * Grow written texels outward so bilinear filtering across a chart border reads
 * baked data instead of background. Without this every seam shows as a dark line.
 */
function dilate(
  channels: Uint8Array[],
  componentCounts: number[],
  covered: Uint8Array,
  width: number,
  height: number,
  passes: number,
): void {
  let current = covered
  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.slice()
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const texel = x + y * width
        if (current[texel]) continue
        let found = -1
        for (let dy = -1; dy <= 1 && found < 0; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
            const neighbor = nx + ny * width
            if (current[neighbor]) { found = neighbor; break }
          }
        }
        if (found < 0) continue
        for (let index = 0; index < channels.length; index += 1) {
          const components = componentCounts[index]!
          for (let component = 0; component < components; component += 1) {
            channels[index]![texel * components + component] =
              channels[index]![found * components + component]!
          }
        }
        next[texel] = 1
      }
    }
    current = next
  }
}

export interface SurfaceBakeOptions {
  width?: number
  height?: number
  /** Trace envelope along the low-poly normal, in domain units. */
  searchDistance?: number
}

export function compileSurfaceBake(
  field: DetailField,
  unwrapped: UnwrapResult,
  identity: SurfaceBakeIdentity,
  seed = 1,
  options: SurfaceBakeOptions = {},
): SurfaceBakeResult {
  const width = options.width ?? BAKE_WIDTH
  const height = options.height ?? BAKE_HEIGHT
  const searchDistance = options.searchDistance ?? DEFAULT_SEARCH_DISTANCE
  const normalizedSeed = Math.max(1, Math.floor(seed))
  const raster = rasterizeCharts(unwrapped, width, height)
  const normalData = new Uint8Array(width * height * 3)
  const heightData = new Uint8Array(width * height)
  const aoData = new Uint8Array(width * height)
  const curvatureData = new Uint8Array(width * height)
  const regionData = field.regionMask ? new Uint8Array(width * height) : undefined

  // Neutral fill for texels no chart covers.
  for (let texel = 0; texel < width * height; texel += 1) {
    normalData[texel * 3] = 128
    normalData[texel * 3 + 1] = 128
    normalData[texel * 3 + 2] = 255
    heightData[texel] = 128
    aoData[texel] = 255
    curvatureData[texel] = 128
    if (regionData) regionData[texel] = 128
  }

  const gradientStep = 0.0016
  let coveredTexels = 0
  let hitTexels = 0
  let peakHeight = 0

  for (let texel = 0; texel < width * height; texel += 1) {
    if (!raster.covered[texel]) continue
    coveredTexels += 1
    const px = raster.position[texel * 3]!
    const py = raster.position[texel * 3 + 1]!
    const pz = raster.position[texel * 3 + 2]!
    let nx = raster.normal[texel * 3]!
    let ny = raster.normal[texel * 3 + 1]!
    let nz = raster.normal[texel * 3 + 2]!
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
    nx /= length; ny /= length; nz /= length

    // Start outside the detailed surface and march inward along -n.
    const originX = px + nx * searchDistance
    const originY = py + ny * searchDistance
    const originZ = pz + nz * searchDistance
    const travelled = traceDetail(
      field,
      originX, originY, originZ,
      -nx, -ny, -nz,
      normalizedSeed,
      searchDistance * 2,
    )

    let hitX = px
    let hitY = py
    let hitZ = pz
    let relief = 0
    if (travelled >= 0) {
      hitTexels += 1
      // Positive relief means the detailed surface sits outside the low-poly.
      relief = searchDistance - travelled
      hitX = originX - nx * travelled
      hitY = originY - ny * travelled
      hitZ = originZ - nz * travelled
      if (Math.abs(relief) > peakHeight) peakHeight = Math.abs(relief)
    }

    const detail = field.normal(hitX, hitY, hitZ, normalizedSeed, gradientStep)
    normalData[texel * 3] = encodeUnorm(detail[0] * 0.5 + 0.5)
    normalData[texel * 3 + 1] = encodeUnorm(detail[1] * 0.5 + 0.5)
    normalData[texel * 3 + 2] = encodeUnorm(detail[2] * 0.5 + 0.5)
    heightData[texel] = encodeUnorm(relief / (searchDistance * 2) + 0.5)
    aoData[texel] = encodeUnorm(
      fieldOcclusion(field, hitX, hitY, hitZ, detail[0], detail[1], detail[2], normalizedSeed),
    )
    // Sampled at the traced hit, not at the low-poly vertex: a bed boundary can
    // sit a full texel away from the coarse surface, and reading the mask off the
    // low-poly would slide the colour banding off the ledges it belongs to.
    if (regionData && field.regionMask) {
      regionData[texel] = encodeUnorm(field.regionMask(hitX, hitY, hitZ, normalizedSeed))
    }

    // Curvature from normal divergence across one gradient step in the tangent
    // plane: convex arrises read high, cracks read low.
    let tx = -detail[1]
    let ty = detail[0]
    let tz = 0
    const tangentLength = Math.sqrt(tx * tx + ty * ty + tz * tz)
    if (tangentLength < 1e-6) { tx = 1; ty = 0; tz = 0 }
    else { tx /= tangentLength; ty /= tangentLength; tz /= tangentLength }
    const offset = 0.004
    const ahead = field.normal(
      hitX + tx * offset, hitY + ty * offset, hitZ + tz * offset,
      normalizedSeed, gradientStep,
    )
    const divergence = (ahead[0] - detail[0]) * tx + (ahead[1] - detail[1]) * ty + (ahead[2] - detail[2]) * tz
    curvatureData[texel] = encodeUnorm(divergence * 6 + 0.5)
  }

  const dilationPasses = 4
  dilate(
    regionData
      ? [normalData, heightData, aoData, curvatureData, regionData]
      : [normalData, heightData, aoData, curvatureData],
    regionData ? [3, 1, 1, 1, 1] : [3, 1, 1, 1],
    raster.covered,
    width,
    height,
    dilationPasses,
  )

  const channels: CompiledSurfaceBake['channels'] = [
    {
      semantic: 'normal-object',
      components: 3,
      encoding: 'unorm8',
      scale: 2,
      bias: -1,
      data: normalData,
    },
    {
      semantic: 'height',
      components: 1,
      encoding: 'unorm8',
      scale: searchDistance * 4,
      bias: -searchDistance * 2,
      data: heightData,
    },
    { semantic: 'ambient-occlusion', components: 1, encoding: 'unorm8', data: aoData },
    { semantic: 'curvature', components: 1, encoding: 'unorm8', scale: 2, bias: -1, data: curvatureData },
  ]
  if (regionData) {
    channels.push({ semantic: 'region-mask', components: 1, encoding: 'unorm8', data: regionData })
  }

  const bake: CompiledSurfaceBake = {
    format: COMPILED_SURFACE_BAKE_FORMAT,
    assetId: identity.assetId,
    topologyKey: identity.topologyKey,
    recipeHash: identity.recipeHash,
    compilerHash: identity.compilerHash,
    profile: identity.profile,
    domain: 'uv-atlas',
    width,
    height,
    channels,
  }
  assertCompiledSurfaceBake(bake)
  return {
    bake,
    stats: {
      width,
      height,
      coveredTexels,
      coverage: coveredTexels / (width * height),
      hitTexels,
      peakHeight,
      dilationPasses,
    },
  }
}
