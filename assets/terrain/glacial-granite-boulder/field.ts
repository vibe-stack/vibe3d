/**
 * Authoritative signed distance recipe for a fractured granite outcrop.
 *
 * Formation intent: an angular, frost-shattered block of jointed granite, read
 * as cliff rock rather than transported cobble. Sharpness is structural, not a
 * post-effect: the mass is trimmed by a dense set of near-hard joint planes and
 * the displacement bands are ridge-dominant, so arrises and spines survive into
 * the extracted mesh.
 *
 * Three rules govern everything here.
 *
 * 1. Nyquist. A displacement band of wavelength L needs ~3 grid samples per L
 *    to appear in an extracted mesh at all. Anything finer belongs in the
 *    surface bake, never in the field. `octaveBudget` reports which bands a
 *    given grid may carry, so a band can never be silently averaged into mush.
 *
 * 2. Fold safety. Subtracting a displacement d(p) from a distance field keeps a
 *    usable surface only while |grad d| stays near or below 1, and that gradient
 *    is about 2*pi*A/L. Smooth amplitude is therefore capped as a fraction of
 *    wavelength. Hardness comes instead from creases (ridged and cellular
 *    bands) and from boolean facets, which are gradient-safe at any sharpness.
 *
 * 3. No resampling. The field is evaluated analytically at every sample. It is
 *    never built by displacing a coarser grid: trilinear resampling is a
 *    low-pass filter and cannot introduce frequency content above the grid it
 *    reads from, so a chain of such passes can only blur.
 *
 * Performance is part of the contract. This field is evaluated ~10^7 times per
 * compile, so the hot path allocates nothing, uses no closures, and avoids
 * Math.hypot (56ns vs 3ns for sqrt) and fractional `**` (71ns) wherever a
 * cheaper form exists.
 */

import {
  boxoid,
  fbm,
  hash01,
  normalize,
  ridged,
  smax,
  smin,
  worleyBorder,
  type Vec3,
} from '../shared/noise.ts'

// The noise and CSG basis lives in `../shared/noise.ts` so a second formation
// cannot drift onto a different definition of `fbm` or a different fold limit.
// Re-exported because this module is the recipe's public face.
export { fbm, hash01, normalize, ridged, worleyBorder }
export type { Vec3 }

/** Domain half-extent maps to this many metres along X after materialization. */
export const DOMAIN_TO_METRES_X = 1.82

/**
 * Glacial plucking does not produce one universal rounded block.  The family is
 * deliberately structural: each seed starts from a different low-frequency
 * mass before the shared joint sets and frost weathering are applied.
 */
export type Formation = 'erratic' | 'prow' | 'arch' | 'tor' | 'bench' | 'monolith'

const FORMATIONS: readonly Formation[] = [
  'erratic',
  'prow',
  'arch',
  'tor',
  'bench',
  'monolith',
]

export function formationOf(seed: number): Formation {
  const normalized = Math.max(1, Math.floor(seed))
  return FORMATIONS[(normalized - 1) % FORMATIONS.length]!
}

// --- authored mass ------------------------------------------------------------

interface MassParameters {
  formation: Formation
  radii: Vec3
  /** Flat [nx, ny, nz, limit, blend] per joint plane. */
  facets: Float64Array
  facetCount: number
  /** Flat [cx, cy, cz, rx, ry, rz, blend] per spalled scar. */
  scars: Float64Array
  scarCount: number
  /** Flat [cx, cy, cz, rx, ry, rz] per welded lobe. */
  lobes: Float64Array
  lobeCount: number
}

const massParameterCache = new Map<number, MassParameters>()
let lastMassSeed = Number.NaN
let lastMassParameters: MassParameters | undefined

/**
 * Jointed granite splits along a few dominant planar sets, and every exposed
 * face is itself trimmed by later fractures. That is what produces cliff rock:
 * many hard planes at related orientations, not one rounded envelope.
 *
 * Limits are a fraction of the mass's own extent along each normal, so every
 * plane is guaranteed to actually cut. Expressing them as absolutes (the
 * previous recipe used 0.57-0.77 against radii of 0.68-0.89) leaves most planes
 * grazing the surface without removing anything, which is what kept the
 * silhouette convex.
 */
function buildMassParameters(seed: number): MassParameters {
  const formation = formationOf(seed)
  const pick = (index: number) => hash01(seed, index, 77, 0x2545f491)
  const envelopes: Record<Formation, Vec3> = {
    erratic: [0.88, 0.74, 0.79],
    prow: [0.72, 0.88, 0.6],
    arch: [0.92, 0.78, 0.48],
    tor: [0.86, 0.7, 0.76],
    bench: [0.98, 0.52, 0.76],
    monolith: [0.56, 0.96, 0.54],
  }
  const envelope = envelopes[formation]
  const radii: Vec3 = [
    envelope[0] + (pick(1) - 0.5) * 0.08,
    envelope[1] + (pick(2) - 0.5) * 0.07,
    envelope[2] + (pick(3) - 0.5) * 0.08,
  ]

  const facets: number[] = []
  const addFacet = (normal: Vec3, support: number, blend: number) => {
    const unit = normalize(normal)
    const extent = Math.sqrt(
      (unit[0] * radii[0]) ** 2 + (unit[1] * radii[1]) ** 2 + (unit[2] * radii[2]) ** 2,
    )
    facets.push(unit[0], unit[1], unit[2], extent * support, blend)
  }

  // Three dominant joint sets. Each contributes an opposed pair of hard planes,
  // and then a fan of near-parallel planes at slightly different offsets, which
  // is what gives a stepped, columnar cliff face rather than a single flat cut.
  const jointSets: Vec3[] = [
    normalize([0.96, 0.12, -0.25]),
    normalize([-0.19, 0.07, 0.98]),
    normalize([0.44, 0.34, 0.83]),
  ]
  for (let set = 0; set < jointSets.length; set += 1) {
    const axis = jointSets[set]!
    for (const sign of [1, -1]) {
      const jitter = 0.16
      for (let step = 0; step < 2; step += 1) {
        const wobble = (index: number) => (pick(set * 20 + step * 5 + index) - 0.5) * jitter
        addFacet(
          [
            axis[0] * sign + wobble(1),
            axis[1] * sign + wobble(2),
            axis[2] * sign + wobble(3),
          ],
          0.62 + pick(set * 30 + step * 3 + (sign > 0 ? 0 : 1)) * 0.26,
          // Near-hard arrises. Frost-shattered granite has not been abraded.
          0.002 + pick(set * 40 + step) * 0.006,
        )
      }
    }
  }

  // Oblique conchoidal breaks scattered around the mass, biased steep so they
  // read as fracture faces instead of a bevelled top. Planes are the only
  // sharpening tool with no fold limit, so the angular read is carried here
  // rather than by displacement amplitude.
  const breakCount = formation === 'arch' ? 14 : formation === 'tor' ? 20 : 30
  for (let index = 0; index < breakCount; index += 1) {
    const theta = (index / breakCount) * Math.PI * 2 + pick(100 + index) * 0.9
    // Biased upward: steep faces and overhangs are wanted, but planes that dive
    // under the mass would eat the base and leave the outcrop on a point.
    const rise = -0.3 + pick(120 + index) * 1.25
    addFacet(
      [Math.cos(theta), rise, Math.sin(theta)],
      0.55 + pick(140 + index) * 0.29,
      0.0012 + pick(160 + index) * 0.0035,
    )
  }

  // A broad hard base so the outcrop sits on a face rather than a corner.
  addFacet([0.03, -0.99, -0.05], 0.6, 0.004)

  // Spalled notches: angular bites where slabs came away along the joints.
  // Boxoid rather than ellipsoid, and yaw-rotated, so each one leaves flat
  // interior walls and a hard rim. Round scars read as thumb-presses in clay,
  // which is a large part of why the previous asset looked like mud.
  // Six shallow bites, not eleven deep ones. A spall removes a slab from the
  // surface; a subtractor whose radius approaches the mass radius and whose
  // centre sits inside the mass hollows the rock into a shell instead, which
  // reads as a cave from behind and leaves thin plates where trim planes clip
  // the remaining walls. Centres therefore sit at or beyond the surface.
  const scarCount = formation === 'arch' ? 5 : formation === 'monolith' ? 7 : 10
  const scars = new Float64Array(scarCount * 9)
  for (let index = 0; index < scarCount; index += 1) {
    const theta = 0.7 + index * 1.29 + pick(200 + index) * 0.7
    const radius = 0.2 + pick(220 + index) * 0.22
    // Centre at or beyond the surface: this is what separates a broad spall face
    // from a cave that hollows the mass into a shell.
    const distance = 0.98 + radius * (0.72 + pick(240 + index) * 0.3)
    const yaw = pick(320 + index) * Math.PI
    scars[index * 9] = Math.cos(theta) * distance
    scars[index * 9 + 1] = -0.2 + pick(260 + index) * 0.78
    scars[index * 9 + 2] = Math.sin(theta) * distance
    scars[index * 9 + 3] = radius
    scars[index * 9 + 4] = radius * (0.5 + pick(280 + index) * 0.7)
    scars[index * 9 + 5] = radius * (0.6 + pick(290 + index) * 0.8)
    // Tight blend: a spall leaves a sharp rim, not a soft dent.
    scars[index * 9 + 6] = 0.002 + pick(300 + index) * 0.008
    scars[index * 9 + 7] = Math.cos(yaw)
    scars[index * 9 + 8] = Math.sin(yaw)
  }

  // Welded lobes break the convex envelope so the silhouette steps in and out.
  // Boxoid and yaw-rotated, giving ledges and shoulders with real edges.
  // Four lobes, kept well embedded. A lobe centred near or past the surface is
  // only tenuously attached, and the oblique trim planes then clip it into a thin
  // protruding slab.
  const lobeCount = formation === 'arch' ? 2 : formation === 'tor' ? 6 : 4
  const lobes = new Float64Array(lobeCount * 8)
  for (let index = 0; index < lobeCount; index += 1) {
    const theta = 1.9 + index * 1.65 + pick(340 + index) * 0.9
    const radius = 0.15 + pick(360 + index) * 0.13
    const yaw = pick(440 + index) * Math.PI
    lobes[index * 8] = Math.cos(theta) * (0.34 + pick(380 + index) * 0.22)
    lobes[index * 8 + 1] = -0.22 + pick(400 + index) * 0.5
    lobes[index * 8 + 2] = Math.sin(theta) * (0.32 + pick(420 + index) * 0.22)
    lobes[index * 8 + 3] = radius
    lobes[index * 8 + 4] = radius * (0.55 + pick(430 + index) * 0.7)
    lobes[index * 8 + 5] = radius * (0.7 + pick(435 + index) * 0.6)
    lobes[index * 8 + 6] = Math.cos(yaw)
    lobes[index * 8 + 7] = Math.sin(yaw)
  }

  return {
    formation,
    radii,
    facets: new Float64Array(facets),
    facetCount: facets.length / 5,
    scars,
    scarCount,
    lobes,
    lobeCount,
  }
}

/** Conservative ellipsoid distance used only for authored macro booleans. */
function ellipsoid(x: number, y: number, z: number, rx: number, ry: number, rz: number): number {
  const nx = x / rx
  const ny = y / ry
  const nz = z / rz
  return (Math.sqrt(nx * nx + ny * ny + nz * nz) - 1) * Math.min(rx, ry, rz)
}

function massParameters(seed: number): MassParameters {
  if (seed === lastMassSeed) return lastMassParameters!
  let cached = massParameterCache.get(seed)
  if (!cached) {
    cached = buildMassParameters(seed)
    massParameterCache.set(seed, cached)
  }
  lastMassSeed = seed
  lastMassParameters = cached
  return cached
}

/** Number of hard joint planes trimming the mass, for reporting. */
export function facetCount(seed: number): number {
  return massParameters(seed).facetCount
}

/**
 * Low-frequency authored mass. The masterclass point the previous version cited
 * but did not honour is that the final read must already exist here; the bands
 * below only add character to faces this function has already shaped.
 */
export function massSdf(x: number, y: number, z: number, seed: number): number {
  const parameters = massParameters(seed)
  const radii = parameters.radii

  const leanX = x + y * 0.07
  const leanZ = z - y * 0.09
  const taper = 1 - Math.max(-0.1, Math.min(0.24, y * 0.26))
  let distance: number
  switch (parameters.formation) {
    case 'arch': {
      // A plucked granite window: two stout piers and a joint-controlled roof.
      // The tunnel passes fully through Z and reaches below the contact plane, so
      // this is genuine negative space rather than a dark alcove painted on a box.
      distance = boxoid(leanX, y, leanZ, radii[0] * taper, radii[1], radii[2])
      break
    }
    case 'tor': {
      // A castellated tor assembled from interlocked residual blocks.  The
      // narrow waist and offset crown are present before any surface noise.
      const base = boxoid(leanX + 0.12, y + 0.24, leanZ, radii[0] * 0.9, radii[1] * 0.7, radii[2])
      const crown = boxoid(leanX - 0.18, y - 0.34, leanZ + 0.08, radii[0] * 0.68, radii[1] * 0.48, radii[2] * 0.82)
      const shoulder = boxoid(leanX + 0.38, y - 0.05, leanZ - 0.12, radii[0] * 0.42, radii[1] * 0.5, radii[2] * 0.64)
      distance = smin(smin(base, crown, 0.045), shoulder, 0.035)
      break
    }
    case 'bench': {
      const body = boxoid(leanX - 0.12, y + 0.18, leanZ, radii[0] * 0.82, radii[1] * 0.78, radii[2])
      const shelf = boxoid(leanX + 0.16, y - 0.27, leanZ - 0.05, radii[0], radii[1] * 0.34, radii[2] * 0.82)
      distance = smin(body, shelf, 0.035)
      break
    }
    case 'prow': {
      const body = boxoid(leanX, y, leanZ, radii[0] * taper, radii[1], radii[2] * taper)
      // An offset shoulder leaves one glacially plucked face projecting like a
      // prow instead of preserving a centred cuboid silhouette.
      const shoulder = boxoid(leanX - 0.28, y - 0.18, leanZ + 0.08, radii[0] * 0.55, radii[1] * 0.48, radii[2] * 0.78)
      distance = smin(body, shoulder, 0.04)
      break
    }
    default:
      distance = boxoid(leanX, y, leanZ, radii[0] * taper, radii[1], radii[2] * taper)
  }

  const facets = parameters.facets
  for (let index = 0; index < parameters.facetCount; index += 1) {
    const offset = index * 5
    const plane = x * facets[offset]! + y * facets[offset + 1]! + z * facets[offset + 2]! - facets[offset + 3]!
    distance = smax(distance, plane, facets[offset + 4]!)
  }

  const lobes = parameters.lobes
  for (let index = 0; index < parameters.lobeCount; index += 1) {
    const offset = index * 8
    const lx = x - lobes[offset]!
    const lz = z - lobes[offset + 2]!
    const cos = lobes[offset + 6]!
    const sin = lobes[offset + 7]!
    distance = smin(distance, boxoid(
      lx * cos - lz * sin, y - lobes[offset + 1]!, lx * sin + lz * cos,
      lobes[offset + 3]!, lobes[offset + 4]!, lobes[offset + 5]!,
    ), 0.05)
  }

  const scars = parameters.scars
  for (let index = 0; index < parameters.scarCount; index += 1) {
    const offset = index * 9
    const sx = x - scars[offset]!
    const sz = z - scars[offset + 2]!
    const cos = scars[offset + 7]!
    const sin = scars[offset + 8]!
    distance = smax(distance, -boxoid(
      sx * cos - sz * sin, y - scars[offset + 1]!, sx * sin + sz * cos,
      scars[offset + 3]!, scars[offset + 4]!, scars[offset + 5]!,
    ), scars[offset + 6]!)
  }

  if (parameters.formation === 'arch') {
    // Cut last so welded silhouette lobes cannot accidentally plug the window.
    const openingX = (hash01(seed, 901, 77, 0x2545f491) - 0.5) * 0.12
    const shaft = boxoid(x - openingX, y + 0.62, z, 0.36, 0.43, 0.72)
    const crown = ellipsoid(x - openingX, y + 0.14, z, 0.43, 0.43, 0.72)
    distance = smax(distance, -smin(shaft, crown, 0.025), 0.008)
  }

  return distance
}

// --- displacement bands -------------------------------------------------------

export interface OctaveBudget {
  /** Grid cells across the [-1, 1] domain. */
  cells: number
  /** Voxel edge length in domain units. */
  voxel: number
  /** Shortest wavelength the grid can carry at 3 samples per wavelength. */
  minimumWavelength: number
  /** Bands the field may include at this grid. */
  bands: string[]
  /** Bands that must be carried by the surface bake instead. */
  bakeOnly: string[]
}

interface Band {
  name: string
  /** Characteristic wavelength in domain units. */
  wavelength: number
  /** Peak displacement in domain units. */
  amplitude: number
  evaluate(x: number, y: number, z: number, seed: number): number
}

/**
 * Ridge-dominant displacement, coarsest first. Every band returns roughly
 * [-1, 1] and is scaled by its own amplitude, so `amplitude / wavelength`
 * stays readable as the fold-safety ratio at a glance.
 */
const BANDS: Band[] = [
  {
    // Buttresses and gullies across whole faces. Ridged, so faces meet at
    // creased spines instead of rolling into one another.
    name: 'macro-buttress',
    wavelength: 0.72,
    amplitude: 0.052,
    evaluate: (x, y, z, seed) => {
      const wx = x + fbm(x * 1.05 + 3.1, y * 1.05, z * 1.05, seed + 11, 3) * 0.4
      const wy = y + fbm(x * 1.0, y * 1.0 - 5.7, z * 1.0, seed + 43, 3) * 0.3
      const wz = z + fbm(x * 1.1, y * 1.1, z * 1.1 + 8.4, seed + 79, 3) * 0.4
      const spine = ridged(wx * 1.75, wy * 1.35, wz * 1.75, seed + 137, 3)
      const broad = fbm(wx * 1.5, wy * 1.25, wz * 1.5, seed + 101, 3) * 2
      return broad * 0.42 + (spine - 0.4) * 1.15
    },
  },
  {
    // Joint blocks at decimetre scale. The cellular term dominates, so this
    // band cuts the faces into stepped plates with hard borders.
    name: 'meso-jointing',
    wavelength: 0.23,
    amplitude: 0.017,
    evaluate: (x, y, z, seed) => {
      const warp = fbm(x * 2.9 + 6.7, y * 2.9, z * 2.9, seed + 307, 3) * 0.26
      const cells = worleyBorder((x + warp) * 5.4, y * 4.3, (z - warp) * 5.4, seed + 389)
      const plate = 1 - Math.min(1, cells / 0.44)
      const spine = ridged((x + warp) * 4.6, y * 3.9, (z + warp) * 4.6, seed + 421, 2)
      const broken = fbm((x + warp) * 5.6, (y - warp * 0.45) * 4.4, (z + warp) * 5.6, seed + 347, 3) * 2
      return broken * 0.34 + (spine - 0.42) * 0.7 - plate * plate * 0.62
    },
  },
  {
    // Frost-shattered chip scars and exfoliation sheeting. Strongly creased,
    // and stratified in Y so it reads as bedding rather than uniform lumpiness.
    name: 'fine-shatter',
    wavelength: 0.085,
    amplitude: 0.0055,
    evaluate: (x, y, z, seed) => {
      const warp = fbm(x * 7 + 1.3, y * 7, z * 7, seed + 503, 2) * 0.14
      const chips = worleyBorder((x + warp) * 14.5, y * 11.5, (z - warp) * 14.5, seed + 541)
      const scar = 1 - Math.min(1, chips / 0.42)
      const bedding = ridged(x * 6.5, y * 21.5, z * 6.5, seed + 577, 2)
      const grit = fbm(x * 13.5, y * 13.5, z * 13.5, seed + 613, 3) * 2
      return grit * 0.36 - scar * scar * 0.62 - (bedding - 0.4) * 0.5
    },
  },
]

export function octaveBudget(cells: number): OctaveBudget {
  const voxel = 2 / cells
  const minimumWavelength = voxel * 3
  return {
    cells,
    voxel,
    minimumWavelength,
    bands: BANDS.filter((band) => band.wavelength >= minimumWavelength).map((band) => band.name),
    bakeOnly: BANDS.filter((band) => band.wavelength < minimumWavelength).map((band) => band.name),
  }
}

/**
 * Total displacement, restricted to bands the grid can represent. Anything
 * excluded is recovered by the surface bake rather than averaged into mush.
 */
export function displacement(
  x: number,
  y: number,
  z: number,
  seed: number,
  minimumWavelength = 0,
): number {
  let total = 0
  for (let index = 0; index < BANDS.length; index += 1) {
    const band = BANDS[index]!
    if (band.wavelength < minimumWavelength) continue
    total += band.evaluate(x, y, z, seed) * band.amplitude
  }
  return total
}

/**
 * Relief below the mesh's Nyquist limit. Evaluated only in texture space by the
 * bake compiler, where the sampling rate can carry it.
 */
export function microRelief(x: number, y: number, z: number, seed: number): number {
  const grain = fbm(x * 44, y * 44, z * 44, seed + 701, 3) * 2
  const crystal = ridged(x * 72, y * 72, z * 72, seed + 743, 2)
  const flake = worleyBorder(x * 56, y * 56, z * 56, seed + 787)
  const pit = 1 - Math.min(1, flake / 0.36)
  return grain * 0.0021 + (crystal - 0.42) * 0.0017 - pit * pit * 0.0018
}

/** The authoritative surface: authored mass minus the representable bands. */
export function surfaceSdf(
  x: number,
  y: number,
  z: number,
  seed: number,
  minimumWavelength = 0,
): number {
  return massSdf(x, y, z, seed) - displacement(x, y, z, seed, minimumWavelength)
}

/**
 * The surface at full detail: every band plus the sub-Nyquist micro relief.
 * No extracted mesh can represent this, which is exactly why it is the target
 * the surface bake traces against. This is the authoritative high-resolution
 * surface in the high-to-low pipeline.
 */
export function detailedSdf(x: number, y: number, z: number, seed: number): number {
  return massSdf(x, y, z, seed)
    - displacement(x, y, z, seed, 0)
    - microRelief(x, y, z, seed)
}

/** Unit normal of `detailedSdf`, by tetrahedral differences (four evaluations). */
export function detailedNormal(
  x: number, y: number, z: number,
  seed: number,
  step: number,
): Vec3 {
  return detailedNormalInto(x, y, z, seed, step, [0, 0, 0])
}

/** Allocation-free form for the millions of normal samples in a surface bake. */
export function detailedNormalInto(
  x: number, y: number, z: number,
  seed: number,
  step: number,
  output: Vec3,
): Vec3 {
  const base = detailedSdf(x + step, y + step, z + step, seed)
  const dx = detailedSdf(x + step, y - step, z - step, seed)
  const dy = detailedSdf(x - step, y + step, z - step, seed)
  const dz = detailedSdf(x - step, y - step, z + step, seed)
  let nx = base + dx - dy - dz
  let ny = base - dx + dy - dz
  let nz = base - dx - dy + dz
  const length = Math.sqrt(nx * nx + ny * ny + nz * nz)
  if (length < 1e-12) {
    output[0] = 0
    output[1] = 1
    output[2] = 0
    return output
  }
  output[0] = nx / length
  output[1] = ny / length
  output[2] = nz / length
  return output
}

/**
 * The band-limited view handed to the dual contourer, and the full-detail view
 * handed to the bake. They are deliberately different surfaces: the extractor
 * must not be given bands its grid cannot sample, and the bake must be given
 * everything, or it would have nothing left to recover.
 */
export const graniteMeshField = {
  sdf: surfaceSdf,
  octaveBudget,
}

export const graniteDetailField = {
  sdf: detailedSdf,
  normal: detailedNormal,
  normalInto: detailedNormalInto,
}

export interface FieldDiagnostics {
  peakDisplacement: number
  meanNearSurfaceGradient: number
  maximumNearSurfaceGradient: number
  foldedFraction: number
}

/**
 * Envelope and fold-safety report. `foldedFraction` is the share of
 * near-surface samples where |grad d| exceeds 1; a small non-zero share is
 * intended, since those are the creases that read as hard arrises.
 */
export function fieldDiagnostics(
  seed: number,
  minimumWavelength = 0,
  samples = 20000,
): FieldDiagnostics {
  const step = 1e-3
  let peak = 0
  let gradientSum = 0
  let gradientMax = 0
  let folded = 0
  let counted = 0
  for (let index = 0; index < samples; index += 1) {
    const x = hash01(index, 1, seed, 0x1b56c4e9) * 2 - 1
    const y = hash01(index, 2, seed, 0x1b56c4e9) * 2 - 1
    const z = hash01(index, 3, seed, 0x1b56c4e9) * 2 - 1
    peak = Math.max(peak, Math.abs(displacement(x, y, z, seed, minimumWavelength)))
    if (Math.abs(massSdf(x, y, z, seed)) > 0.12) continue
    const dx = displacement(x + step, y, z, seed, minimumWavelength)
      - displacement(x - step, y, z, seed, minimumWavelength)
    const dy = displacement(x, y + step, z, seed, minimumWavelength)
      - displacement(x, y - step, z, seed, minimumWavelength)
    const dz = displacement(x, y, z + step, seed, minimumWavelength)
      - displacement(x, y, z - step, seed, minimumWavelength)
    const magnitude = Math.sqrt(dx * dx + dy * dy + dz * dz) / (2 * step)
    gradientSum += magnitude
    gradientMax = Math.max(gradientMax, magnitude)
    if (magnitude > 1) folded += 1
    counted += 1
  }
  return {
    peakDisplacement: peak,
    meanNearSurfaceGradient: counted === 0 ? 0 : gradientSum / counted,
    maximumNearSurfaceGradient: gradientMax,
    foldedFraction: counted === 0 ? 0 : folded / counted,
  }
}
