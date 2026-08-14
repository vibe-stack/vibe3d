/**
 * QEF dual contouring of a band-limited analytic field.
 *
 * Vertices are placed by solving a quadratic error function over the analytic
 * surface normals at each cell's edge crossings, which is what keeps a hard
 * arris hard. Averaging the crossing points instead (plain surface nets, as the
 * first compiler in this repo did) rounds every feature by roughly half a voxel,
 * so a mesh built that way cannot express the joint planes the field defines no
 * matter how sharp the field is.
 *
 * The field arrives as a parameter rather than an import. Every recipe shares
 * this extractor, and the grid it is called with decides which displacement
 * bands the field is allowed to include - which is why `octaveBudget` is part of
 * the interface rather than a detail of one recipe.
 */

import type { Vec3 } from './noise.ts'

/**
 * A recipe's surface, evaluable at a declared band limit.
 *
 * `sdf` must omit every band whose wavelength is below `minimumWavelength`:
 * including a band the grid cannot sample does not add detail, it aliases into
 * mush. Bands excluded here are recovered by the surface bake instead.
 */
export interface BandLimitedField {
  sdf(x: number, y: number, z: number, seed: number, minimumWavelength: number): number
  /** Shortest wavelength a grid of `cells` across the [-1, 1] domain can carry. */
  octaveBudget(cells: number): { minimumWavelength: number }
}

export interface DenseSurface {
  cells: number
  /** Vertex positions in the normalized [-1, 1] domain. */
  positions: Float64Array
  vertexCount: number
  indices: Uint32Array
  /** Analytic unit surface normal per vertex. */
  normals: Float64Array
}

const CORNERS: ReadonlyArray<Vec3> = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
]

const EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
]

/**
 * Tetrahedral gradient: four field evaluations instead of six for central
 * differences. At ~10^6 crossings per compile the saving is material.
 */
export function analyticNormal(
  field: BandLimitedField,
  x: number, y: number, z: number,
  seed: number,
  minimumWavelength: number,
  step: number,
): Vec3 {
  const base = field.sdf(x + step, y + step, z + step, seed, minimumWavelength)
  const dx = field.sdf(x + step, y - step, z - step, seed, minimumWavelength)
  const dy = field.sdf(x - step, y + step, z - step, seed, minimumWavelength)
  const dz = field.sdf(x - step, y - step, z + step, seed, minimumWavelength)
  let nx = base + dx - dy - dz
  let ny = base - dx + dy - dz
  let nz = base - dx - dy + dz
  const length = Math.sqrt(nx * nx + ny * ny + nz * nz)
  if (length < 1e-12) return [0, 1, 0]
  nx /= length
  ny /= length
  nz /= length
  return [nx, ny, nz]
}

/**
 * Solve min sum_i (n_i . (v - p_i))^2 with a pull toward the crossing centroid.
 * The regularizer keeps the system well posed on flat and cylindrical cells,
 * where the normal equations are singular or near-singular.
 */
function solveQef(
  points: Float64Array,
  normals: Float64Array,
  count: number,
  centroid: Vec3,
  regularization: number,
): Vec3 {
  // Normal equations A^T A v = A^T b, symmetric 3x3.
  let a00 = regularization; let a01 = 0; let a02 = 0
  let a11 = regularization; let a12 = 0; let a22 = regularization
  let b0 = centroid[0] * regularization
  let b1 = centroid[1] * regularization
  let b2 = centroid[2] * regularization
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3
    const nx = normals[offset]!
    const ny = normals[offset + 1]!
    const nz = normals[offset + 2]!
    const d = nx * points[offset]! + ny * points[offset + 1]! + nz * points[offset + 2]!
    a00 += nx * nx; a01 += nx * ny; a02 += nx * nz
    a11 += ny * ny; a12 += ny * nz; a22 += nz * nz
    b0 += nx * d; b1 += ny * d; b2 += nz * d
  }
  const determinant = a00 * (a11 * a22 - a12 * a12)
    - a01 * (a01 * a22 - a12 * a02)
    + a02 * (a01 * a12 - a11 * a02)
  if (Math.abs(determinant) < 1e-14) return centroid
  const inverse = 1 / determinant
  const i00 = (a11 * a22 - a12 * a12) * inverse
  const i01 = (a02 * a12 - a01 * a22) * inverse
  const i02 = (a01 * a12 - a02 * a11) * inverse
  const i11 = (a00 * a22 - a02 * a02) * inverse
  const i12 = (a02 * a01 - a00 * a12) * inverse
  const i22 = (a00 * a11 - a01 * a01) * inverse
  return [
    i00 * b0 + i01 * b1 + i02 * b2,
    i01 * b0 + i11 * b1 + i12 * b2,
    i02 * b0 + i12 * b1 + i22 * b2,
  ]
}

export interface DenseSurfaceOptions {
  field: BandLimitedField
  seed: number
  cells: number
  /** Sharp-feature fidelity. Lower pulls harder toward the centroid. */
  regularization?: number
}

export function extractDenseSurface(options: DenseSurfaceOptions): DenseSurface {
  const { field: recipe, seed, cells } = options
  const regularization = options.regularization ?? 0.035
  const budget = recipe.octaveBudget(cells)
  const minimumWavelength = budget.minimumWavelength
  const samples = cells + 1
  const step = 2 / cells

  // Scalar grid, evaluated analytically. Never a resample of a coarser grid.
  const field = new Float32Array(samples * samples * samples)
  for (let z = 0; z < samples; z += 1) {
    const pz = -1 + z * step
    for (let y = 0; y < samples; y += 1) {
      const py = -1 + y * step
      const rowOffset = samples * (y + samples * z)
      for (let x = 0; x < samples; x += 1) {
        field[x + rowOffset] = recipe.sdf(-1 + x * step, py, pz, seed, minimumWavelength)
      }
    }
  }
  const sampleAt = (x: number, y: number, z: number) => field[x + samples * (y + samples * z)]!

  const vertexByCell = new Int32Array(cells * cells * cells).fill(-1)
  const positions: number[] = []
  const normals: number[] = []
  const crossingPoints = new Float64Array(12 * 3)
  const crossingNormals = new Float64Array(12 * 3)
  const cornerValues = new Float64Array(8)
  const gradientStep = step * 0.35

  for (let z = 0; z < cells; z += 1) {
    for (let y = 0; y < cells; y += 1) {
      for (let x = 0; x < cells; x += 1) {
        let inside = 0
        for (let corner = 0; corner < 8; corner += 1) {
          const offset = CORNERS[corner]!
          const value = sampleAt(x + offset[0], y + offset[1], z + offset[2])
          cornerValues[corner] = value
          if (value < 0) inside += 1
        }
        if (inside === 0 || inside === 8) continue

        let count = 0
        let cx = 0; let cy = 0; let cz = 0
        for (let edge = 0; edge < 12; edge += 1) {
          const [a, b] = EDGES[edge]!
          const va = cornerValues[a]!
          const vb = cornerValues[b]!
          if ((va < 0) === (vb < 0)) continue
          const t = va / (va - vb)
          const ca = CORNERS[a]!
          const cb = CORNERS[b]!
          const px = -1 + (x + ca[0] + (cb[0] - ca[0]) * t) * step
          const py = -1 + (y + ca[1] + (cb[1] - ca[1]) * t) * step
          const pz = -1 + (z + ca[2] + (cb[2] - ca[2]) * t) * step
          const normal = analyticNormal(recipe, px, py, pz, seed, minimumWavelength, gradientStep)
          const offset = count * 3
          crossingPoints[offset] = px
          crossingPoints[offset + 1] = py
          crossingPoints[offset + 2] = pz
          crossingNormals[offset] = normal[0]
          crossingNormals[offset + 1] = normal[1]
          crossingNormals[offset + 2] = normal[2]
          cx += px; cy += py; cz += pz
          count += 1
        }
        if (count === 0) continue
        const centroid: Vec3 = [cx / count, cy / count, cz / count]
        const solved = solveQef(crossingPoints, crossingNormals, count, centroid, regularization)

        // Clamp into a slightly grown cell. An unclamped QEF solution can shoot
        // far away on nearly-parallel normal sets and tangle the mesh.
        const minX = -1 + x * step - step * 0.25
        const minY = -1 + y * step - step * 0.25
        const minZ = -1 + z * step - step * 0.25
        const vx = Math.min(minX + step * 1.5, Math.max(minX, solved[0]))
        const vy = Math.min(minY + step * 1.5, Math.max(minY, solved[1]))
        const vz = Math.min(minZ + step * 1.5, Math.max(minZ, solved[2]))

        vertexByCell[x + cells * (y + cells * z)] = positions.length / 3
        positions.push(vx, vy, vz)
        const normal = analyticNormal(recipe, vx, vy, vz, seed, minimumWavelength, gradientStep)
        normals.push(normal[0], normal[1], normal[2])
      }
    }
  }

  const indices: number[] = []
  const vertexAt = (x: number, y: number, z: number) => vertexByCell[x + cells * (y + cells * z)]!
  const pushQuad = (outward: boolean, a: number, b: number, c: number, d: number) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return
    if (a === b || a === c || a === d || b === c || b === d || c === d) return
    if (outward) indices.push(a, b, c, a, c, d)
    else indices.push(a, d, c, a, c, b)
  }
  for (let z = 1; z < cells; z += 1) {
    for (let y = 1; y < cells; y += 1) {
      for (let x = 0; x < cells; x += 1) {
        const a = sampleAt(x, y, z)
        const b = sampleAt(x + 1, y, z)
        if ((a < 0) !== (b < 0)) {
          pushQuad(a < 0, vertexAt(x, y - 1, z - 1), vertexAt(x, y, z - 1), vertexAt(x, y, z), vertexAt(x, y - 1, z))
        }
      }
    }
  }
  for (let z = 1; z < cells; z += 1) {
    for (let y = 0; y < cells; y += 1) {
      for (let x = 1; x < cells; x += 1) {
        const a = sampleAt(x, y, z)
        const b = sampleAt(x, y + 1, z)
        if ((a < 0) !== (b < 0)) {
          pushQuad(a < 0, vertexAt(x - 1, y, z - 1), vertexAt(x - 1, y, z), vertexAt(x, y, z), vertexAt(x, y, z - 1))
        }
      }
    }
  }
  for (let z = 0; z < cells; z += 1) {
    for (let y = 1; y < cells; y += 1) {
      for (let x = 1; x < cells; x += 1) {
        const a = sampleAt(x, y, z)
        const b = sampleAt(x, y, z + 1)
        if ((a < 0) !== (b < 0)) {
          pushQuad(a < 0, vertexAt(x - 1, y - 1, z), vertexAt(x, y - 1, z), vertexAt(x, y, z), vertexAt(x - 1, y, z))
        }
      }
    }
  }

  return {
    cells,
    positions: new Float64Array(positions),
    vertexCount: positions.length / 3,
    indices: new Uint32Array(indices),
    normals: new Float64Array(normals),
  }
}
