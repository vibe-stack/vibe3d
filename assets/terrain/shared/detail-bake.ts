/**
 * Seamless, real-world-scaled granite micro-detail bake.
 *
 * The per-asset atlas bake resolves 6.5 mm per texel on the outcrop: 1024x1024
 * spread across 11.4 m2 of surface at 26% packing. Everything finer than that -
 * which is to say everything the eye uses to read "stone" from half a metre - has
 * to come from somewhere else, and it cannot come from a bigger atlas: atlas texel
 * density falls as 1/scale^2 and is paid per archetype, so a 4K atlas still only
 * reaches 1.6 mm per texel and costs 32 MiB six times over in the cliff scene.
 *
 * So the fine band is carried by one small tile, sampled triplanar in world space
 * at a fixed physical size, shared by every archetype and every instance. At
 * 1024 texels over a 256 mm tile it resolves 0.25 mm per texel, which is the
 * density a photogrammetry surface set actually ships at.
 *
 * The content is a crystal mosaic rather than a noise stack, because granite is
 * interlocking polygonal grains and gradient noise is round and isotropic at every
 * octave. But a cellular mosaic taken literally produces terrazzo, not granite:
 * flat-topped cells at one constant height per grain, separated by an even web of
 * hard boundaries, lit into popcorn. Three properties separate the two, and all
 * three are deliberate here:
 *
 *   - grains are not flat. Each is a small cleaved facet with its own tilt, so
 *     the surface is made of shallow planes rather than plateaus and steps.
 *   - grain size varies. A single lattice gives every crystal the same diameter,
 *     which no rock has; the size field below blends two lattices so coarse and
 *     fine domains alternate the way a real crystallisation front leaves them.
 *   - boundaries are narrow and sparse rather than uniform. Roughly a third of
 *     them have weathered open, and those are deep and thin - a crack, not a
 *     valley. Opening every boundary to the same depth is what makes a cellular
 *     mosaic read as crazed glaze.
 *
 * One hard constraint governs everything in here: the tile may contain no
 * feature approaching its own period. A repeating texture prints its largest
 * structure as a grid at the repeat interval, so a 13 cm blob inside a 25.6 cm
 * tile becomes a regular camouflage pattern across the surface, however good the
 * grain underneath it is. Structure above the grain scale is the shader's job,
 * where it is evaluated in world space and never repeats.
 */

import {
  COMPILED_SURFACE_BAKE_FORMAT,
  assertCompiledSurfaceBake,
  type CompiledSurfaceBake,
} from '../../../packages/terrain/src/index.ts'

/**
 * Physical tile size. Cellular periods are integers in cell units, so the
 * feature-point hash wraps on the same lattice the texture wraps on.
 */
export const DETAIL_TILE_MILLIMETRES = 256
export const DETAIL_TILE_METRES = DETAIL_TILE_MILLIMETRES / 1000
export const DETAIL_RESOLUTION = 1024
/** 0.25 mm per texel. */
export const DETAIL_MILLIMETRES_PER_TEXEL = DETAIL_TILE_MILLIMETRES / DETAIL_RESOLUTION

/**
 * Peak-to-trough relief the height channel represents, in millimetres.
 *
 * The normal is derived from this as a true slope over the true texel spacing,
 * so it is not a look control - it decides how steep the facets are. Weathered
 * granite is a shallow surface at this scale: the crystals are cleaved planes a
 * few tenths of a millimetre apart, not a landscape.
 */
export const DETAIL_RELIEF_MILLIMETRES = 0.44

/** Grain lattices, in cells across the tile. Coarse is ~6.4 mm, fine ~2.7 mm. */
const COARSE_GRAIN_PERIOD = 40
const FINE_GRAIN_PERIOD = 96
/** Sparse large crystals at ~16 mm. */
const PHENOCRYST_PERIOD = 16
/** Accessory flecks and weather pits at ~1 mm. */
const FLECK_PERIOD = 256

/**
 * Mineral classes, ordered dark to pale. They select a tonal band rather than a
 * flat colour: the encoded albedo channel is continuous, so the runtime tints
 * through a ramp instead of compositing four hard masks. Four hard masks is what
 * produced confetti, because a mineral map with only four values has no tonal
 * variation inside a crystal and maximum contrast at every boundary.
 */
export const DETAIL_MINERAL_CLASSES = ['biotite', 'quartz', 'feldspar', 'plagioclase'] as const
export type DetailMineralClass = (typeof DETAIL_MINERAL_CLASSES)[number]

/** Modal composition of a typical alpine biotite granite. */
const MINERAL_WEIGHTS: Record<DetailMineralClass, number> = {
  biotite: 0.16,
  quartz: 0.3,
  feldspar: 0.41,
  plagioclase: 0.13,
}

/** Tonal band each mineral occupies in the encoded albedo channel, as [low, high]. */
const MINERAL_TONE: Record<DetailMineralClass, readonly [number, number]> = {
  biotite: [0.04, 0.2],
  quartz: [0.38, 0.55],
  feldspar: [0.5, 0.68],
  plagioclase: [0.72, 0.9],
}

/**
 * Mean relief each mineral holds after weathering, in units of
 * DETAIL_RELIEF_MILLIMETRES. Quartz is hardest and stands proud; biotite is a
 * sheet silicate that weathers out. The differential is small on purpose - it
 * biases the facet, it does not build a step around it.
 */
const MINERAL_RELIEF: Record<DetailMineralClass, number> = {
  biotite: -0.3,
  quartz: 0.22,
  feldspar: 0.03,
  plagioclase: 0.08,
}

/** Roughness offset per mineral, applied around the stone's base roughness. */
const MINERAL_ROUGHNESS: Record<DetailMineralClass, number> = {
  biotite: 0.09,
  quartz: -0.2,
  feldspar: 0.03,
  plagioclase: -0.03,
}

function hashBits2(x: number, y: number, seed: number): number {
  let value = (Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(y | 0, 0x5f356495) ^ Math.imul(seed | 0, 0x27d4eb2d)) >>> 0
  value ^= value >>> 15
  value = Math.imul(value, 0x85ebca6b) >>> 0
  value ^= value >>> 13
  value = Math.imul(value, 0xc2b2ae35) >>> 0
  value ^= value >>> 16
  return value >>> 0
}

function hash01(x: number, y: number, seed: number): number {
  return hashBits2(x, y, seed) / 4294967296
}

function wrap(value: number, period: number): number {
  return ((value % period) + period) % period
}

interface CellSample {
  /** Distance to the nearest feature point, in cell units. */
  f1: number
  /** Distance to the second nearest. f2 - f1 is the grain boundary distance. */
  f2: number
  /** Stable hash of the owning cell, usable as a per-grain random. */
  id: number
  /** Owning cell coordinates, for deriving further per-grain quantities. */
  cellX: number
  cellY: number
  /** Offset from the owning feature point, in cell units. Drives facet tilt. */
  localX: number
  localY: number
}

/**
 * Periodic 2D cellular sample.
 *
 * Feature points are hashed from wrapped cell coordinates while distances use the
 * unwrapped neighbourhood, so the pattern is continuous across the tile edge
 * rather than merely matching at it.
 *
 * Jitter fills the whole cell. Confining it to the middle of the cell makes the
 * search cheaper to reason about, but it also pins every Voronoi boundary near a
 * lattice line - and since the tile edge is a lattice line of every lattice at
 * once, that prints a faint grid of grain boundaries at the tile period across
 * anything the texture is projected onto.
 */
function cellular(x: number, y: number, period: number, seed: number): CellSample {
  const baseX = Math.floor(x)
  const baseY = Math.floor(y)
  let f1 = Infinity
  let f2 = Infinity
  let id = 0
  let cellX = baseX
  let cellY = baseY
  let localX = 0
  let localY = 0
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const neighbourX = baseX + offsetX
      const neighbourY = baseY + offsetY
      const wrappedX = wrap(neighbourX, period)
      const wrappedY = wrap(neighbourY, period)
      const bits = hashBits2(wrappedX, wrappedY, seed)
      const jitterX = (bits & 0xffff) / 65536
      const jitterY = ((bits >>> 16) & 0xffff) / 65536
      const deltaX = neighbourX + jitterX - x
      const deltaY = neighbourY + jitterY - y
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
      if (distance < f1) {
        f2 = f1
        f1 = distance
        id = bits
        cellX = wrappedX
        cellY = wrappedY
        localX = -deltaX
        localY = -deltaY
      } else if (distance < f2) {
        f2 = distance
      }
    }
  }
  return { f1, f2, id, cellX, cellY, localX, localY }
}

/** Periodic 2D gradient noise. */
function gradientNoise2(x: number, y: number, period: number, seed: number): number {
  const cellX = Math.floor(x)
  const cellY = Math.floor(y)
  const fracX = x - cellX
  const fracY = y - cellY
  const easeX = fracX * fracX * fracX * (fracX * (fracX * 6 - 15) + 10)
  const easeY = fracY * fracY * fracY * (fracY * (fracY * 6 - 15) + 10)
  const corner = (stepX: number, stepY: number): number => {
    const bits = hashBits2(wrap(cellX + stepX, period), wrap(cellY + stepY, period), seed)
    const angle = (bits / 4294967296) * Math.PI * 2
    return Math.cos(angle) * (fracX - stepX) + Math.sin(angle) * (fracY - stepY)
  }
  const bottom = corner(0, 0) + (corner(1, 0) - corner(0, 0)) * easeX
  const top = corner(0, 1) + (corner(1, 1) - corner(0, 1)) * easeX
  return bottom + (top - bottom) * easeY
}

/** Periodic fBm over whole-tile periods, for structure above the grain scale. */
function periodicFbm(u: number, v: number, basePeriod: number, seed: number, octaves: number): number {
  let total = 0
  let amplitude = 1
  let normalisation = 0
  let period = basePeriod
  for (let octave = 0; octave < octaves; octave += 1) {
    total += gradientNoise2(u * period, v * period, period, seed + octave * 977) * amplitude
    normalisation += amplitude
    amplitude *= 0.5
    period *= 2
  }
  return total / normalisation
}

function mineralFor(grainHash: number): DetailMineralClass {
  const pick = grainHash / 4294967296
  let accumulated = 0
  for (const mineral of DETAIL_MINERAL_CLASSES) {
    accumulated += MINERAL_WEIGHTS[mineral]
    if (pick < accumulated) return mineral
  }
  return 'feldspar'
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

export interface DetailBakeIdentity {
  assetId: string
  topologyKey: string
  recipeHash: string
  compilerHash: string
  profile: string
}

export interface DetailBakeStats {
  resolution: number
  tileMillimetres: number
  millimetresPerTexel: number
  reliefMillimetres: number
  mineralFractions: Record<DetailMineralClass, number>
  /** Fraction of the surface darkened by cavity occlusion beyond a slight amount. */
  openBoundaryFraction: number
  /** Standard deviation of the encoded albedo channel, 0..1. */
  albedoDeviation: number
}

export interface DetailBakeResult {
  bake: CompiledSurfaceBake
  stats: DetailBakeStats
}

/**
 * Build the tiling detail set.
 *
 * Height is accumulated across the whole tile first, then differentiated. Central
 * differences over the stored field cost four array reads instead of four full
 * cellular evaluations, and they wrap exactly, so the normal tiles as cleanly as
 * the height does.
 */
export function bakeGraniteDetail(identity: DetailBakeIdentity, seed = 1): DetailBakeResult {
  const size = DETAIL_RESOLUTION
  const texels = size * size
  const height = new Float32Array(texels)
  const occlusion = new Float32Array(texels)
  const albedo = new Float32Array(texels)
  const roughness = new Uint8Array(texels)
  const counts: Record<DetailMineralClass, number> = {
    biotite: 0, quartz: 0, feldspar: 0, plagioclase: 0,
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x
      const u = x / size
      const v = y / size

      // Grain size field. Blending two lattices gives coarse and fine domains
      // instead of one uniform crystal diameter. Its base period is kept high
      // for the same reason as everything else here: a size domain spanning half
      // the tile is a half-tile feature, and half-tile features tile visibly.
      const sizeField = clamp01(periodicFbm(u, v, 20, seed * 53 + 3, 2) * 1.5 + 0.5)
      const coarse = cellular(u * COARSE_GRAIN_PERIOD + 0.37, v * COARSE_GRAIN_PERIOD + 0.71, COARSE_GRAIN_PERIOD, seed * 7 + 11)
      const fine = cellular(u * FINE_GRAIN_PERIOD + 0.19, v * FINE_GRAIN_PERIOD + 0.83, FINE_GRAIN_PERIOD, seed * 29 + 17)
      const useFine = sizeField > 0.5
      const grain = useFine ? fine : coarse
      const grainPeriod = useFine ? FINE_GRAIN_PERIOD : COARSE_GRAIN_PERIOD
      const mineral = mineralFor(grain.id)
      counts[mineral] += 1

      // Each crystal is a shallow cleaved facet with its own tilt, not a plateau.
      // This is the single change that stops the mosaic lighting like terrazzo:
      // a tilted plane returns a gradient across the grain, where a flat top
      // returns one constant value bounded by a step.
      const facetAngle = hash01(grain.cellX, grain.cellY, seed * 17 + 3) * Math.PI * 2
      const facetSlope = 0.25 + hash01(grain.cellX, grain.cellY, seed * 19 + 5) * 0.55
      const facet = (grain.localX * Math.cos(facetAngle) + grain.localY * Math.sin(facetAngle)) * facetSlope

      // Only a minority of boundaries have weathered open. An even web across
      // every crystal reads as crazed glaze; granite mostly shows its grain as
      // tone, with open cracks scattered through it.
      const boundaryHash = hash01(grain.cellX, grain.cellY, seed * 71 + 13)
      const openBoundary = boundaryHash < 0.66 ? smoothstep(0.66, 0.08, boundaryHash) : 0
      const boundaryWidth = 0.018 + hash01(grain.cellX, grain.cellY, seed * 73 + 23) * 0.032
      const boundary = (1 - smoothstep(0, boundaryWidth, grain.f2 - grain.f1)) * openBoundary
      // Every boundary occludes slightly even when closed, because the contact
      // between two crystals is still a line that holds fines.
      const boundaryShade = 1 - smoothstep(0, 0.05, grain.f2 - grain.f1)

      // Sparse phenocrysts impose a second, coarser crystal size on top.
      const pheno = cellular(u * PHENOCRYST_PERIOD + 0.14, v * PHENOCRYST_PERIOD + 0.58, PHENOCRYST_PERIOD, seed * 13 + 29)
      const phenoPresent = (pheno.id >>> 8) / 16777216 < 0.22 ? 1 : 0
      const phenoBody = phenoPresent * (1 - smoothstep(0.2, 0.5, pheno.f1))
      const phenoTilt = phenoPresent * (pheno.localX * 0.35 + pheno.localY * 0.22)

      // Weather pits: small, sparse, and genuinely deep. These carry most of the
      // legible surface incident at close range.
      const fleck = cellular(u * FLECK_PERIOD + 0.63, v * FLECK_PERIOD + 0.29, FLECK_PERIOD, seed * 23 + 41)
      const pitPresent = (fleck.id >>> 4) / 268435456 < 0.045 ? 1 : 0
      const pit = pitPresent * (1 - smoothstep(0, 0.3, fleck.f1))

      // Sub-grain micro-roughness. Low amplitude: this band exists to keep
      // specular highlights from reading as polished, not to carry structure.
      const micro = gradientNoise2(u * 256, v * 256, 256, seed * 31 + 7) * 0.1
        + gradientNoise2(u * 512, v * 512, 512, seed * 37 + 13) * 0.05

      height[index] = MINERAL_RELIEF[mineral] * 0.55
        + facet
        + phenoBody * 0.16
        + phenoTilt * 0.2
        - boundary * 0.95
        - pit * 0.8
        + micro

      occlusion[index] = Math.min(
        1,
        boundary * 0.75 + boundaryShade * 0.14 + pit * 0.85,
      )

      // Continuous tone. The mineral picks a band, the grain hash places the
      // crystal inside it, and macro stain plus within-grain shading vary it
      // further - so no two crystals of the same mineral share a value and none
      // of them is flat inside.
      const [toneLow, toneHigh] = MINERAL_TONE[mineral]
      const grainTone = toneLow + (toneHigh - toneLow) * hash01(grain.cellX, grain.cellY, seed * 43 + 7)
      const withinGrain = facet * 0.18 + gradientNoise2(u * grainPeriod * 3, v * grainPeriod * 3, grainPeriod * 3, seed * 47 + 11) * 0.05
      // Crystal scale only. Macro tone belongs in the shader, where it can be
      // art-directed and driven by the asset's own relief; folding it in here
      // shifts whole regions of the tile across whatever ramp the runtime uses
      // to pick pigment, which turns a mineral speckle into leopard spots at the
      // macro field's own wavelength.
      albedo[index] = clamp01(
        grainTone + withinGrain - boundaryShade * 0.06 - pit * 0.18,
      )

      const grainJitter = (hash01(grain.cellX, grain.cellY, seed * 41 + 19) - 0.5) * 0.08
      roughness[index] = Math.round(clamp01(
        0.5 + MINERAL_ROUGHNESS[mineral] + grainJitter + boundary * 0.1 + pit * 0.1,
      ) * 255)
    }
  }

  // Normalise height to [-1, 1] so the encoded channel uses its full range and
  // the slope below is computed against a known physical amplitude.
  let peak = 0
  for (let index = 0; index < texels; index += 1) peak = Math.max(peak, Math.abs(height[index]!))
  const inversePeak = peak > 0 ? 1 / peak : 1
  for (let index = 0; index < texels; index += 1) height[index] = height[index]! * inversePeak

  const normalData = new Uint8Array(texels * 3)
  const spacing = DETAIL_MILLIMETRES_PER_TEXEL
  const amplitude = DETAIL_RELIEF_MILLIMETRES
  for (let y = 0; y < size; y += 1) {
    const up = ((y + 1) % size) * size
    const down = ((y - 1 + size) % size) * size
    const row = y * size
    for (let x = 0; x < size; x += 1) {
      const right = (x + 1) % size
      const left = (x - 1 + size) % size
      const slopeX = ((height[row + right]! - height[row + left]!) * amplitude) / (2 * spacing)
      const slopeY = ((height[up + x]! - height[down + x]!) * amplitude) / (2 * spacing)
      // Surface normal of h(x, y) is normalize(-dh/dx, -dh/dy, 1).
      const inverseLength = 1 / Math.sqrt(slopeX * slopeX + slopeY * slopeY + 1)
      const index = (row + x) * 3
      normalData[index] = Math.round((-slopeX * inverseLength * 0.5 + 0.5) * 255)
      normalData[index + 1] = Math.round((-slopeY * inverseLength * 0.5 + 0.5) * 255)
      normalData[index + 2] = Math.round((inverseLength * 0.5 + 0.5) * 255)
    }
  }

  const heightData = new Uint8Array(texels)
  const occlusionData = new Uint8Array(texels)
  const regionData = new Uint8Array(texels * 2)
  let albedoTotal = 0
  let albedoSquareTotal = 0
  let openTexels = 0
  for (let index = 0; index < texels; index += 1) {
    heightData[index] = Math.round((height[index]! * 0.5 + 0.5) * 255)
    occlusionData[index] = Math.round((1 - occlusion[index]!) * 255)
    if (occlusion[index]! > 0.25) openTexels += 1
    const value = albedo[index]!
    albedoTotal += value
    albedoSquareTotal += value * value
    regionData[index * 2] = Math.round(value * 255)
    regionData[index * 2 + 1] = roughness[index]!
  }
  const albedoMean = albedoTotal / texels
  const albedoDeviation = Math.sqrt(Math.max(0, albedoSquareTotal / texels - albedoMean * albedoMean))

  const bake: CompiledSurfaceBake = {
    format: COMPILED_SURFACE_BAKE_FORMAT,
    ...identity,
    domain: 'triplanar',
    width: size,
    height: size,
    channels: [
      { semantic: 'normal-tangent', components: 3, encoding: 'unorm8', scale: 2, bias: -1, data: normalData },
      { semantic: 'height', components: 1, encoding: 'unorm8', scale: 2, bias: -1, data: heightData },
      { semantic: 'ambient-occlusion', components: 1, encoding: 'unorm8', data: occlusionData },
      { semantic: 'region-mask', components: 2, encoding: 'unorm8', data: regionData },
    ],
  }
  assertCompiledSurfaceBake(bake)

  const mineralFractions = {} as Record<DetailMineralClass, number>
  for (const mineral of DETAIL_MINERAL_CLASSES) mineralFractions[mineral] = counts[mineral] / texels

  return {
    bake,
    stats: {
      resolution: size,
      tileMillimetres: DETAIL_TILE_MILLIMETRES,
      millimetresPerTexel: DETAIL_MILLIMETRES_PER_TEXEL,
      reliefMillimetres: DETAIL_RELIEF_MILLIMETRES,
      mineralFractions,
      openBoundaryFraction: openTexels / texels,
      albedoDeviation,
    },
  }
}
