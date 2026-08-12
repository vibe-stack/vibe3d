/**
 * Compiler support shared by every terrain recipe.
 *
 * These are the steps that are the same regardless of what the rock is: measure
 * what the reduction cost, repair what the extraction left behind, inherit UVs
 * down the LOD chain, and choose an atlas from world area. A recipe's own
 * `topology.ts` should contain only the decisions specific to that formation -
 * grid sizes, world scale, and what it claims about its own output.
 */

import {
  fillHoles,
  keepLargestComponent,
  measureIntegrity,
  removeNonManifoldFins,
} from './diagnose.ts'
import { extractDenseSurface, type BandLimitedField, type DenseSurface } from './dual-contour.ts'
import type { ReducedSurface, UnwrapResult } from './unwrap.ts'

export function triangleArea(
  positions: Float32Array | Float64Array,
  a: number,
  b: number,
  c: number,
): number {
  const ax = positions[a * 3]!
  const ay = positions[a * 3 + 1]!
  const az = positions[a * 3 + 2]!
  const abx = positions[b * 3]! - ax
  const aby = positions[b * 3 + 1]! - ay
  const abz = positions[b * 3 + 2]! - az
  const acx = positions[c * 3]! - ax
  const acy = positions[c * 3 + 1]! - ay
  const acz = positions[c * 3 + 2]! - az
  const x = aby * acz - abz * acy
  const y = abz * acx - abx * acz
  const z = abx * acy - aby * acx
  return Math.sqrt(x * x + y * y + z * z) * 0.5
}

/** Per-triangle-edge neighbour table, -1 where an edge is on a boundary. */
export function adjacencyOf(indices: Uint32Array): Int32Array {
  const output = new Int32Array(indices.length).fill(-1)
  const edges = new Map<number, { triangle: number; edge: number }>()
  for (let offset = 0; offset < indices.length; offset += 3) {
    const triangle = offset / 3
    for (let edge = 0; edge < 3; edge += 1) {
      const a = indices[offset + edge]!
      const b = indices[offset + ((edge + 1) % 3)]!
      const key = a < b ? a * 1000003 + b : b * 1000003 + a
      const previous = edges.get(key)
      if (previous) {
        output[previous.triangle * 3 + previous.edge] = triangle
        output[triangle * 3 + edge] = previous.triangle
        edges.delete(key)
      } else edges.set(key, { triangle, edge })
    }
  }
  return output
}

/**
 * Mean distance from the dense surface to the reduced surface, in world
 * centimetres. This is the quantity the bake has to recover, so it is measured
 * rather than assumed - and it is what the bake's search distance must exceed.
 */
export function reductionError(
  dense: DenseSurface,
  reduced: ReducedSurface,
  metresPerDomainUnit: number,
): number {
  const cellSize = 0.08
  const buckets = new Map<number, number[]>()
  const keyOf = (x: number, y: number, z: number) =>
    (Math.floor((x + 1) / cellSize) * 131 + Math.floor((y + 1) / cellSize)) * 131
    + Math.floor((z + 1) / cellSize)
  for (let vertex = 0; vertex < reduced.vertexCount; vertex += 1) {
    const key = keyOf(
      reduced.positions[vertex * 3]!,
      reduced.positions[vertex * 3 + 1]!,
      reduced.positions[vertex * 3 + 2]!,
    )
    const bucket = buckets.get(key)
    if (bucket) bucket.push(vertex)
    else buckets.set(key, [vertex])
  }
  let total = 0
  let counted = 0
  const stride = Math.max(1, Math.floor(dense.vertexCount / 20000))
  for (let vertex = 0; vertex < dense.vertexCount; vertex += stride) {
    const px = dense.positions[vertex * 3]!
    const py = dense.positions[vertex * 3 + 1]!
    const pz = dense.positions[vertex * 3 + 2]!
    let best = Infinity
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const bucket = buckets.get(keyOf(px + dx * cellSize, py + dy * cellSize, pz + dz * cellSize))
          if (!bucket) continue
          for (const candidate of bucket) {
            const ex = reduced.positions[candidate * 3]! - px
            const ey = reduced.positions[candidate * 3 + 1]! - py
            const ez = reduced.positions[candidate * 3 + 2]! - pz
            const squared = ex * ex + ey * ey + ez * ez
            if (squared < best) best = squared
          }
        }
      }
    }
    if (best === Infinity) continue
    total += Math.sqrt(best)
    counted += 1
  }
  return counted === 0 ? 0 : (total / counted) * metresPerDomainUnit * 100
}

/** Assign each coarse-LOD vertex the atlas UV of its nearest LOD0 vertex. */
export function inheritUvs(target: ReducedSurface, source: UnwrapResult): Float32Array {
  const uvs = new Float32Array(target.vertexCount * 2)
  for (let vertex = 0; vertex < target.vertexCount; vertex += 1) {
    const px = target.positions[vertex * 3]!
    const py = target.positions[vertex * 3 + 1]!
    const pz = target.positions[vertex * 3 + 2]!
    let best = Infinity
    let bestIndex = 0
    for (let candidate = 0; candidate < source.vertexCount; candidate += 1) {
      const ex = source.positions[candidate * 3]! - px
      const ey = source.positions[candidate * 3 + 1]! - py
      const ez = source.positions[candidate * 3 + 2]! - pz
      const squared = ex * ex + ey * ey + ez * ez
      if (squared < best) {
        best = squared
        bestIndex = candidate
      }
    }
    uvs[vertex * 2] = source.uvs[bestIndex * 2]!
    uvs[vertex * 2 + 1] = source.uvs[bestIndex * 2 + 1]!
  }
  return uvs
}

/** Extract the field at `cells` and present it as a reduced surface. */
export function extractedAsReduced(
  field: BandLimitedField,
  seed: number,
  cells: number,
): ReducedSurface {
  const surface = extractDenseSurface({ field, seed, cells })
  return {
    positions: surface.positions,
    vertexCount: surface.vertexCount,
    indices: surface.indices,
    normals: surface.normals,
  }
}

export interface RepairReport {
  surface: ReducedSurface
  finsRemoved: number
  straysRemoved: number
  loopsFilled: number
  loopsSkipped: number
}

/**
 * Make a surface shippable: manifold, single-component, and as closed as the
 * extraction allows.
 *
 * Order and repetition both matter. Fin removal opens holes, hole filling can
 * weld a crack into a new non-manifold edge, and component pruning opens holes
 * too, so the passes alternate. Manifoldness is enforced on the final pass
 * because a residual hole is cosmetic while a non-manifold edge has no defined
 * orientation and is rejected outright by the compiled-topology validator.
 */
export function repairSurface(input: ReducedSurface): RepairReport {
  let positions = input.positions
  let normals = input.normals
  let indices = input.indices
  let finsRemoved = 0
  let straysRemoved = 0
  let loopsFilled = 0
  let loopsSkipped = 0

  for (let pass = 0; pass < 3; pass += 1) {
    const fins = removeNonManifoldFins(indices, positions)
    finsRemoved += fins.removedTriangles
    const cleaned = keepLargestComponent(fins.indices)
    straysRemoved += cleaned.removedTriangles
    const integrity = measureIntegrity(cleaned.indices, positions.length / 3)
    if (integrity.closed) {
      indices = cleaned.indices
      break
    }
    const filled = fillHoles(cleaned.indices, positions, normals)
    loopsFilled += filled.filledLoops
    loopsSkipped = filled.skippedLoops
    positions = filled.positions
    normals = filled.normals
    indices = filled.indices
  }

  // Final guarantee: manifold, even at the cost of leaving a hole open.
  const finalFins = removeNonManifoldFins(indices, positions)
  finsRemoved += finalFins.removedTriangles
  const finalCleaned = keepLargestComponent(finalFins.indices)
  straysRemoved += finalCleaned.removedTriangles

  return {
    surface: {
      positions,
      normals,
      vertexCount: positions.length / 3,
      indices: finalCleaned.indices,
    },
    finsRemoved,
    straysRemoved,
    loopsFilled,
    loopsSkipped,
  }
}

export interface AtlasDensityPolicy {
  /** Target bake resolution in millimetres per texel, in world space. */
  targetMillimetresPerTexel: number
  minimumAtlas: number
  maximumAtlas: number
}

/**
 * Atlas size for an instance of a given world surface area.
 *
 * Texel density must be chosen in world units, not per object. An atlas sized per
 * object gives every instance the same texel count regardless of the world scale
 * applied afterwards, so density falls as 1/scale^2 and large instances lose the
 * detail small ones keep - measured at 68mm/texel on the largest cliff block
 * against 6mm on the smallest scree. Bake cost is ~290us/texel, which is why the
 * result is clamped rather than solved exactly; where the clamp binds, the
 * instance is knowingly under-resolved rather than accidentally so.
 */
export function atlasSizeFor(
  worldAreaSquareMetres: number,
  policy: AtlasDensityPolicy,
  coverage = 0.34,
): number {
  const texelsPerSquareMetre = (1000 / policy.targetMillimetresPerTexel) ** 2
  const needed = (worldAreaSquareMetres * texelsPerSquareMetre) / Math.max(0.05, coverage)
  const exact = Math.sqrt(needed)
  const power = 2 ** Math.ceil(Math.log2(Math.max(1, exact)))
  return Math.max(policy.minimumAtlas, Math.min(policy.maximumAtlas, power))
}

/** World surface area of a materialized LOD0, in square metres. */
export function surfaceAreaOf(
  positions: Float64Array,
  indices: Uint32Array,
  worldScale: readonly [number, number, number],
): number {
  const scaled = new Float64Array(positions.length)
  for (let index = 0; index < positions.length; index += 3) {
    scaled[index] = positions[index]! * worldScale[0]
    scaled[index + 1] = positions[index + 1]! * worldScale[1]
    scaled[index + 2] = positions[index + 2]! * worldScale[2]
  }
  let total = 0
  for (let offset = 0; offset < indices.length; offset += 3) {
    total += triangleArea(scaled, indices[offset]!, indices[offset + 1]!, indices[offset + 2]!)
  }
  return total
}
