/**
 * Deterministic noise and CSG primitives shared by every terrain recipe.
 *
 * These functions are the hot path of every compile: a single asset evaluates
 * them on the order of 10^7 times. They therefore allocate nothing, build no
 * closures, and avoid `Math.hypot` (56ns against 3ns for `Math.sqrt`) and
 * fractional `**` (71ns) wherever a cheaper algebraic form exists. Every one of
 * those was measured on this workload, not assumed.
 *
 * Extracted from the granite recipe unchanged so a second formation cannot
 * silently drift onto a different basis: two recipes that disagree about what
 * `fbm` means cannot be compared or budgeted against the same fold limit.
 */

export type Vec3 = [number, number, number]

// --- hashing ------------------------------------------------------------------

export function hashBits(x: number, y: number, z: number, seed: number): number {
  let value = Math.imul(x | 0, 0x1f123bb5)
  value ^= Math.imul(y | 0, 0x5f356495)
  value ^= Math.imul(z | 0, 0x6c8e9cf5)
  value ^= Math.imul(seed | 0, 0x27d4eb2d)
  value ^= value >>> 15
  value = Math.imul(value, 0x85ebca6b)
  value ^= value >>> 13
  value = Math.imul(value, 0xc2b2ae35)
  value ^= value >>> 16
  return value >>> 0
}

export function hash01(x: number, y: number, z: number, seed: number): number {
  return hashBits(x, y, z, seed) / 0x100000000
}

// --- gradient noise -----------------------------------------------------------

/**
 * The 12 edge-midpoint gradients of a cube (padded to 16), selected by hash
 * bits. Deriving gradients through sin/cos instead cost ~2000 trig calls per
 * field evaluation.
 */
const GRADIENTS = new Float64Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
  1, 1, 0, 0, -1, 1, -1, 1, 0, 0, -1, -1,
])

interface GradientCell {
  seed: number
  x: number
  y: number
  z: number
  /** Eight offsets into GRADIENTS, in n000..n111 order. */
  bases: Int16Array
}

// Field tracing and tetrahedral normals evaluate clusters of points separated by
// only a few thousandths of a domain unit. For any given octave/seed those
// points overwhelmingly occupy the same lattice cell. Hashing its eight corners
// again produces exactly the same gradient indices, so retain the most recent
// cell per seed. This is acceleration data only; all interpolation math and its
// operation order remain unchanged.
const NOISE_CELL_CACHE_SIZE = 4096
const gradientCellBySeed: Array<GradientCell | undefined> = new Array(NOISE_CELL_CACHE_SIZE)

/**
 * Perlin gradient noise, roughly [-0.7, 0.7]. Written flat: an earlier version
 * built two closures per call, and at ~29 noise calls per field evaluation that
 * allocation dominated the entire compile.
 */
export function gradientNoise(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const iz = Math.floor(z)
  const fx = x - ix
  const fy = y - iy
  const fz = z - iz
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10)

  const cacheSlot = seed & (NOISE_CELL_CACHE_SIZE - 1)
  let cell = gradientCellBySeed[cacheSlot]
  if (!cell || cell.seed !== seed) {
    cell = { seed, x: NaN, y: NaN, z: NaN, bases: new Int16Array(8) }
    gradientCellBySeed[cacheSlot] = cell
  }
  if (cell.x !== ix || cell.y !== iy || cell.z !== iz) {
    cell.x = ix
    cell.y = iy
    cell.z = iz
    const bases = cell.bases
    bases[0] = (hashBits(ix, iy, iz, seed) & 15) * 3
    bases[1] = (hashBits(ix + 1, iy, iz, seed) & 15) * 3
    bases[2] = (hashBits(ix, iy + 1, iz, seed) & 15) * 3
    bases[3] = (hashBits(ix + 1, iy + 1, iz, seed) & 15) * 3
    bases[4] = (hashBits(ix, iy, iz + 1, seed) & 15) * 3
    bases[5] = (hashBits(ix + 1, iy, iz + 1, seed) & 15) * 3
    bases[6] = (hashBits(ix, iy + 1, iz + 1, seed) & 15) * 3
    bases[7] = (hashBits(ix + 1, iy + 1, iz + 1, seed) & 15) * 3
  }
  const bases = cell.bases
  let base = bases[0]!
  const n000 = GRADIENTS[base]! * fx + GRADIENTS[base + 1]! * fy + GRADIENTS[base + 2]! * fz
  base = bases[1]!
  const n100 = GRADIENTS[base]! * (fx - 1) + GRADIENTS[base + 1]! * fy + GRADIENTS[base + 2]! * fz
  base = bases[2]!
  const n010 = GRADIENTS[base]! * fx + GRADIENTS[base + 1]! * (fy - 1) + GRADIENTS[base + 2]! * fz
  base = bases[3]!
  const n110 = GRADIENTS[base]! * (fx - 1) + GRADIENTS[base + 1]! * (fy - 1) + GRADIENTS[base + 2]! * fz
  base = bases[4]!
  const n001 = GRADIENTS[base]! * fx + GRADIENTS[base + 1]! * fy + GRADIENTS[base + 2]! * (fz - 1)
  base = bases[5]!
  const n101 = GRADIENTS[base]! * (fx - 1) + GRADIENTS[base + 1]! * fy + GRADIENTS[base + 2]! * (fz - 1)
  base = bases[6]!
  const n011 = GRADIENTS[base]! * fx + GRADIENTS[base + 1]! * (fy - 1) + GRADIENTS[base + 2]! * (fz - 1)
  base = bases[7]!
  const n111 = GRADIENTS[base]! * (fx - 1) + GRADIENTS[base + 1]! * (fy - 1) + GRADIENTS[base + 2]! * (fz - 1)

  const x00 = n000 + (n100 - n000) * ux
  const x10 = n010 + (n110 - n010) * ux
  const x01 = n001 + (n101 - n001) * ux
  const x11 = n011 + (n111 - n011) * ux
  const y0 = x00 + (x10 - x00) * uy
  const y1 = x01 + (x11 - x01) * uy
  return y0 + (y1 - y0) * uz
}

/** Signed fbm, normalized to roughly [-0.5, 0.5]. */
export function fbm(x: number, y: number, z: number, seed: number, octaves = 4): number {
  let amplitude = 0.5
  let frequency = 1
  let total = 0
  let weight = 0
  for (let octave = 0; octave < octaves; octave += 1) {
    total += gradientNoise(x * frequency, y * frequency, z * frequency, seed + octave * 1013) * amplitude
    weight += amplitude
    amplitude *= 0.5
    frequency *= 2.0173
  }
  return (total / weight) * 0.71
}

/**
 * Ridged fbm in [0, 1]. Peaks at 1 along the zero set of the underlying noise,
 * giving creased spines whose slope discontinuity survives meshing. Creases have
 * no fold limit, so this - not amplitude - is where surface hardness comes from.
 */
export function ridged(x: number, y: number, z: number, seed: number, octaves = 4): number {
  let amplitude = 0.5
  let frequency = 1
  let total = 0
  let weight = 0
  for (let octave = 0; octave < octaves; octave += 1) {
    const raw = 1 - Math.abs(gradientNoise(x * frequency, y * frequency, z * frequency, seed + octave * 1013) * 2.2)
    const band = raw < 0 ? 0 : raw
    total += band * band * amplitude
    weight += amplitude
    amplitude *= 0.52
    frequency *= 2.0173
  }
  return total / weight
}

/**
 * Worley F2-F1, near zero on cell borders, so it draws crack networks.
 * Squared distances are compared and only the two winners take a sqrt: the
 * hypot-per-cell form cost 27 hypot calls (1.5us) per invocation.
 */
export function worleyBorder(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const iz = Math.floor(z)
  const cacheSlot = seed & (NOISE_CELL_CACHE_SIZE - 1)
  let cell = worleyCellBySeed[cacheSlot]
  if (!cell || cell.seed !== seed) {
    cell = { seed, x: NaN, y: NaN, z: NaN, points: new Float64Array(27 * 3) }
    worleyCellBySeed[cacheSlot] = cell
  }
  if (cell.x !== ix || cell.y !== iy || cell.z !== iz) {
    cell.x = ix
    cell.y = iy
    cell.z = iz
    let cursor = 0
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const cx = ix + dx
          const cy = iy + dy
          const cz = iz + dz
          cell.points[cursor] = cx + hashBits(cx, cy, cz, seed) / 0x100000000
          cell.points[cursor + 1] = cy + hashBits(cx, cy, cz, seed + 31) / 0x100000000
          cell.points[cursor + 2] = cz + hashBits(cx, cy, cz, seed + 67) / 0x100000000
          cursor += 3
        }
      }
    }
  }
  let first = Infinity
  let second = Infinity
  const points = cell.points
  for (let cursor = 0; cursor < points.length; cursor += 3) {
    const ex = x - points[cursor]!
    const ey = y - points[cursor + 1]!
    const ez = z - points[cursor + 2]!
    const squared = ex * ex + ey * ey + ez * ez
    if (squared < first) {
      second = first
      first = squared
    } else if (squared < second) second = squared
  }
  return Math.sqrt(second) - Math.sqrt(first)
}

interface WorleyCell {
  seed: number
  x: number
  y: number
  z: number
  /** Feature-point xyz triples in the original dz/dy/dx traversal order. */
  points: Float64Array
}

const worleyCellBySeed: Array<WorleyCell | undefined> = new Array(NOISE_CELL_CACHE_SIZE)

// --- CSG ----------------------------------------------------------------------

export function normalize([x, y, z]: Vec3): Vec3 {
  const length = Math.sqrt(x * x + y * y + z * z) || 1
  return [x / length, y / length, z / length]
}

/** Smooth max with a blend radius. k = 0 gives a hard arris. */
export function smax(a: number, b: number, k: number): number {
  if (k <= 0) return a > b ? a : b
  const difference = a - b
  const spread = difference < 0 ? -difference : difference
  const h = k - spread
  if (h <= 0) return a > b ? a : b
  return (a > b ? a : b) + (h * h) / (k * 4)
}

/** Smooth min with a blend radius. k = 0 gives a hard arris. */
export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return a < b ? a : b
  const difference = a - b
  const spread = difference < 0 ? -difference : difference
  const h = k - spread
  if (h <= 0) return a < b ? a : b
  return (a < b ? a : b) - (h * h) / (k * 4)
}

/** Integer-power superellipsoid, avoiding fractional `**` on the hot path. */
export function boxoid(
  x: number, y: number, z: number,
  rx: number, ry: number, rz: number,
): number {
  // Exponent 4 via two squarings, then a fourth root as two sqrts.
  const ax = x / rx
  const ay = y / ry
  const az = z / rz
  const sx = ax * ax
  const sy = ay * ay
  const sz = az * az
  const sum = sx * sx + sy * sy + sz * sz
  const normalized = Math.sqrt(Math.sqrt(sum))
  const smallest = rx < ry ? (rx < rz ? rx : rz) : (ry < rz ? ry : rz)
  return (normalized - 1) * smallest
}
