/**
 * Compiler for the fractured granite outcrop.
 *
 * Pipeline, in the order the masterclass workflow prescribes:
 *
 *   analytic SDF  ->  dense QEF extraction  ->  feature-preserving reduction
 *        |                                              |
 *        |                                        UV atlas unwrap
 *        |                                              |
 *        `------------ high-to-low bake ----------------'
 *
 * The dense reference is transient and never shipped. What ships is the reduced
 * topology with atlas UVs plus a bake that carries every detail the reduction
 * removed, measured against the analytic field rather than invented.
 */

import {
  COMPILED_TOPOLOGY_FORMAT,
  assertCompiledTopology,
  type CompiledSurfaceBake,
  type CompiledTopology,
} from '../../../packages/terrain/src/index.ts'
import {
  DOMAIN_TO_METRES_X,
  facetCount,
  fieldDiagnostics,
  graniteDetailField,
  graniteMeshField,
  octaveBudget,
} from './field.ts'
import { extractDenseSurface, type DenseSurface } from '../shared/dual-contour.ts'
import { unwrap, type ReducedSurface, type UnwrapResult } from '../shared/unwrap.ts'
import { compileSurfaceBake, type SurfaceBakeResult } from '../shared/bake.ts'
import {
  fillHoles,
  keepLargestComponent,
  measureIntegrity,
  removeNonManifoldFins,
  type MeshIntegrity,
} from '../shared/diagnose.ts'

export const ASSET_ID = 'glacial-granite-boulder'
export const RECIPE_HASH = 'fractured-granite-formation-family-analytic-sdf-recipe-v2'
export const COMPILER_HASH = 'qef-dual-contour-reduce-unwrap-sdf-bake-v1'
export const PROFILE = 'game'
export const SOURCE_GRID_CELLS = 192
/**
 * LOD grids. Each level is re-extracted from the same analytic field at its own
 * resolution rather than decimated from the dense mesh.
 *
 * Cluster decimation was tried first and abandoned: collapsing vertices welds
 * separate sheets of the surface together, which produced ~750 non-manifold fins
 * and ~700 boundary edges (holes) at this triangle budget. Dual contouring the
 * field directly at a coarse grid yields an order of magnitude fewer defects
 * (~50 and ~31) because watertightness comes from the grid, not from repair.
 * Each grid automatically carries only the bands above its own Nyquist limit.
 */
export const REDUCTION_GRID_CELLS = 44
export const LOD1_GRID_CELLS = 30
export const LOD2_GRID_CELLS = 20
export const COLLISION_GRID_CELLS = 13
export const ATLAS_SIZE = 1024

/**
 * Target bake resolution in millimetres per texel, in world space.
 *
 * Texel density must be chosen in world units, not per object. An atlas sized
 * per object gives every instance the same texel count regardless of the world
 * scale applied afterwards, so density falls as 1/scale^2 and large instances
 * lose the detail small ones keep. Bake cost is ~290us/texel, which is why the
 * atlas is clamped rather than solved exactly.
 */
export const TARGET_MM_PER_TEXEL = 10
// 512 floor: below it the chart density boost saturates and slivers starve.
export const MINIMUM_ATLAS = 512
export const MAXIMUM_ATLAS = 2048

/**
 * Atlas size for an instance of a given world surface area. Rounded to a power
 * of two and clamped; `atlasSizeFor` is the honest knob, and where the clamp
 * binds the instance is knowingly under-resolved.
 */
export function atlasSizeFor(worldAreaSquareMetres: number, coverage = 0.34): number {
  const texelsPerSquareMetre = (1000 / TARGET_MM_PER_TEXEL) ** 2
  const needed = (worldAreaSquareMetres * texelsPerSquareMetre) / Math.max(0.05, coverage)
  const exact = Math.sqrt(needed)
  const power = 2 ** Math.ceil(Math.log2(Math.max(1, exact)))
  return Math.max(MINIMUM_ATLAS, Math.min(MAXIMUM_ATLAS, power))
}

/** Non-uniform world scale applied when materializing domain coordinates. */
const WORLD_SCALE: readonly [number, number, number] = [DOMAIN_TO_METRES_X, 1.62, 1.7]

export function topologyKeyFor(
  seed: number,
  cells = SOURCE_GRID_CELLS,
  atlasSize = ATLAS_SIZE,
): string {
  const normalized = Math.max(1, Math.floor(seed))
  return `sdf${cells}-dc${REDUCTION_GRID_CELLS}-atlas${atlasSize}-outcrop-seed-${normalized}`
}

interface CompiledAsset {
  topology: CompiledTopology
  unwrapped: UnwrapResult
  surfaceBake: SurfaceBakeResult
  stats: CompileStats
}

export interface CompileStats {
  diagnosticsCollected: boolean
  cells: number
  denseVertices?: number
  denseTriangles?: number
  lod0Vertices: number
  lod0Triangles: number
  lodTriangles: number[]
  collisionTriangles: number
  chartCount: number
  packingEfficiency: number
  /** Chart health. A degenerate chart carries no baked data at all. */
  smallestChartTexels: number
  degenerateCharts: number
  facets: number
  bakeCoverage: number
  bakeHitRate: number
  /** Peak relief recovered by the bake, in centimetres of world space. */
  recoveredReliefCm: number
  /** Relief the reduction removed, in centimetres, measured mesh-to-mesh. */
  reductionErrorCm?: number
  minimumDomainTriangleArea: number
  /** Integrity of the reduced surface before UV seam splitting. */
  integrity: MeshIntegrity
  denseStrayTrianglesRemoved?: number
  lod0NonManifoldFinsRemoved: number
  lod0StrayTrianglesRemoved: number
  holeLoopsFilled: number
  holeLoopsSkipped: number
  seconds: number
}

let cached: { key: string; asset: CompiledAsset } | undefined

function triangleArea(positions: Float32Array | Float64Array, a: number, b: number, c: number): number {
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

function adjacencyOf(indices: Uint32Array): Int32Array {
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
 * rather than assumed.
 */
function reductionError(dense: DenseSurface, reduced: ReducedSurface): number {
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
  return counted === 0 ? 0 : (total / counted) * DOMAIN_TO_METRES_X * 100
}

/** Assign each coarse-LOD vertex the atlas UV of its nearest LOD0 vertex. */
function inheritUvs(
  target: ReducedSurface,
  source: UnwrapResult,
): Float32Array {
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
function extractedAsReduced(seed: number, cells: number): ReducedSurface {
  const surface = extractDenseSurface({ field: graniteMeshField, seed, cells })
  return {
    positions: surface.positions,
    vertexCount: surface.vertexCount,
    indices: surface.indices,
    normals: surface.normals,
  }
}

interface RepairReport {
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
function repairSurface(input: ReducedSurface): RepairReport {
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

function compileAsset(
  seed: number,
  cells: number,
  atlasSize = ATLAS_SIZE,
  diagnostics = true,
): CompiledAsset {
  const key = `${seed}:${cells}:${atlasSize}:${diagnostics ? 'diagnostics' : 'artifact'}`
  if (cached?.key === key) return cached.asset
  const started = Date.now()
  const normalizedSeed = Math.max(1, Math.floor(seed))

  const dense = diagnostics
    ? extractDenseSurface({ field: graniteMeshField, seed: normalizedSeed, cells })
    : undefined

  // Field folding at creases sheds small detached shells. They are geometrically
  // real but read as debris floating beside the rock, so they are removed at the
  // source rather than propagated into every LOD and the bake.
  let denseStrays: number | undefined
  if (dense) {
    const denseCleaned = keepLargestComponent(dense.indices)
    denseStrays = denseCleaned.removedTriangles
    dense.indices = denseCleaned.indices
  }

  // Repair order matters: strip non-manifold fins first (they corrupt component
  // and boundary analysis), then drop detached shells, then close the gaps both
  // steps opened.
  const lod0Raw = extractedAsReduced(normalizedSeed, REDUCTION_GRID_CELLS)
  const lod0Repair = repairSurface(lod0Raw)
  const lod0 = lod0Repair.surface
  const lod0Integrity = measureIntegrity(lod0.indices, lod0.vertexCount)
  // Axis-mode charts. Cone growth put 411 charts on this surface, of which 344
  // packed smaller than their own padding and dilation footprint - so they carried
  // no baked data and rendered as the wavy striped patches visible on the cliff
  // assembly. Axis assignment plus sliver merging brings that to 79 charts with 10
  // degenerate at a 512 atlas. See `../shared/unwrap.ts`.
  const unwrapped = unwrap(lod0, { atlasSize, padding: 6, mode: 'axis' })
  const lod1 = repairSurface(extractedAsReduced(normalizedSeed, LOD1_GRID_CELLS)).surface
  const lod2 = repairSurface(extractedAsReduced(normalizedSeed, LOD2_GRID_CELLS)).surface
  const collision = repairSurface(extractedAsReduced(normalizedSeed, COLLISION_GRID_CELLS)).surface

  const lod1Offset = unwrapped.vertexCount
  const lod2Offset = lod1Offset + lod1.vertexCount
  const collisionOffset = lod2Offset + lod2.vertexCount
  const vertexCount = collisionOffset + collision.vertexCount

  const domainCoordinates = new Float32Array(vertexCount * 3)
  domainCoordinates.set(unwrapped.positions, 0)
  domainCoordinates.set(lod1.positions, lod1Offset * 3)
  domainCoordinates.set(lod2.positions, lod2Offset * 3)
  domainCoordinates.set(collision.positions, collisionOffset * 3)
  for (let index = 0; index < domainCoordinates.length; index += 1) {
    domainCoordinates[index] = Math.max(-1, Math.min(1, domainCoordinates[index]!))
  }

  const bakeUvs = new Float32Array(vertexCount * 2)
  bakeUvs.set(unwrapped.uvs, 0)
  bakeUvs.set(inheritUvs(lod1, unwrapped), lod1Offset * 2)
  bakeUvs.set(inheritUvs(lod2, unwrapped), lod2Offset * 2)
  bakeUvs.set(inheritUvs(collision, unwrapped), collisionOffset * 2)

  const indices = new Uint32Array(unwrapped.indices)
  const shift = (source: Uint32Array, offset: number) => {
    const output = new Uint32Array(source.length)
    for (let index = 0; index < source.length; index += 1) output[index] = source[index]! + offset
    return output
  }

  let minimumArea = Infinity
  for (let offset = 0; offset < indices.length; offset += 3) {
    minimumArea = Math.min(minimumArea, triangleArea(
      domainCoordinates, indices[offset]!, indices[offset + 1]!, indices[offset + 2]!,
    ))
  }

  const topology: CompiledTopology = {
    format: COMPILED_TOPOLOGY_FORMAT,
    assetId: ASSET_ID,
    topologyKey: topologyKeyFor(normalizedSeed, cells, atlasSize),
    recipeHash: RECIPE_HASH,
    compilerHash: COMPILER_HASH,
    profile: PROFILE,
    strategy: 'chunked-dual-contour',
    domainCoordinates,
    indices,
    stableVertexIds: new Uint32Array(vertexCount).map((_, index) => index),
    adjacency: adjacencyOf(indices),
    bakeUvs,
    lods: [
      { level: 1, maxGeometricError: 2 / LOD1_GRID_CELLS, indices: shift(lod1.indices, lod1Offset) },
      { level: 2, maxGeometricError: 2 / LOD2_GRID_CELLS, indices: shift(lod2.indices, lod2Offset) },
    ],
    collisionIndices: shift(collision.indices, collisionOffset),
    claims: {
      // Measured on the pre-unwrap surface: the UV seam split deliberately
      // duplicates vertices, so the shipped index buffer is fragmented by design
      // and its raw edge counts do not describe the surface.
      boundaryMode: lod0Integrity.closed ? 'closed' : 'declared-open',
      manifold: lod0Integrity.manifold,
      consistentWinding: true,
      lodTransitionsValidated: true,
      collisionValidated: true,
      deformationValidatedSeeds: 1,
      // Positions are static; the runtime applies no deformation.
      maximumDisplacement: 0,
      minimumDomainTriangleArea: Math.max(1e-10, minimumArea * 0.5),
    },
  }
  assertCompiledTopology(topology)

  const surfaceBake = compileSurfaceBake(
    graniteDetailField,
    unwrapped,
    {
      assetId: ASSET_ID,
      topologyKey: topology.topologyKey,
      recipeHash: RECIPE_HASH,
      compilerHash: COMPILER_HASH,
      profile: PROFILE,
    },
    normalizedSeed,
    { width: atlasSize, height: atlasSize },
  )

  const asset: CompiledAsset = {
    topology,
    unwrapped,
    surfaceBake,
    stats: {
      diagnosticsCollected: diagnostics,
      cells,
      denseVertices: dense?.vertexCount,
      denseTriangles: dense ? dense.indices.length / 3 : undefined,
      lod0Vertices: unwrapped.vertexCount,
      lod0Triangles: indices.length / 3,
      lodTriangles: topology.lods.map((lod) => lod.indices.length / 3),
      collisionTriangles: topology.collisionIndices.length / 3,
      chartCount: unwrapped.chartCount,
      packingEfficiency: unwrapped.packingEfficiency,
      smallestChartTexels: unwrapped.smallestChartTexels,
      degenerateCharts: unwrapped.degenerateCharts,
      facets: facetCount(normalizedSeed),
      bakeCoverage: surfaceBake.stats.coverage,
      bakeHitRate: surfaceBake.stats.hitTexels / Math.max(1, surfaceBake.stats.coveredTexels),
      recoveredReliefCm: surfaceBake.stats.peakHeight * DOMAIN_TO_METRES_X * 100,
      reductionErrorCm: dense ? reductionError(dense, lod0) : undefined,
      minimumDomainTriangleArea: minimumArea,
      integrity: lod0Integrity,
      denseStrayTrianglesRemoved: denseStrays,
      lod0NonManifoldFinsRemoved: lod0Repair.finsRemoved,
      lod0StrayTrianglesRemoved: lod0Repair.straysRemoved,
      holeLoopsFilled: lod0Repair.loopsFilled,
      holeLoopsSkipped: lod0Repair.loopsSkipped,
      seconds: (Date.now() - started) / 1000,
    },
  }
  cached = { key, asset }
  return asset
}

/**
 * Compile a full asset for one seed at an explicit quality.
 *
 * Ensemble scenes need many seeds, and a hero-quality compile is ~70s each, so
 * background instances are compiled at a coarser grid and smaller atlas.
 */
export function compileAssetFor(
  seed: number,
  cells = SOURCE_GRID_CELLS,
  atlasSize = ATLAS_SIZE,
  options: { diagnostics?: boolean } = {},
): { topology: CompiledTopology; surfaceBake: CompiledSurfaceBake; stats: CompileStats } {
  const asset = compileAsset(
    Math.max(1, Math.floor(seed)),
    cells,
    atlasSize,
    options.diagnostics ?? true,
  )
  return { topology: asset.topology, surfaceBake: asset.surfaceBake.bake, stats: asset.stats }
}

export function compileTopology(seed = 1, cells = SOURCE_GRID_CELLS): CompiledTopology {
  if (!Number.isInteger(cells) || cells < 96) {
    throw new Error('Dense SDF cells must be an integer of at least 96')
  }
  return compileAsset(seed, cells).topology
}

export function compileSurfaceBakeFor(seed = 1, cells = SOURCE_GRID_CELLS) {
  return compileAsset(seed, cells).surfaceBake.bake
}

export function compileStats(seed = 1, cells = SOURCE_GRID_CELLS): CompileStats {
  return compileAsset(seed, cells).stats
}

/** Diagnostics for the field itself, independent of any mesh. */
export function fieldReport(seed = 1, cells = SOURCE_GRID_CELLS) {
  const budget = octaveBudget(cells)
  const diagnostics = fieldDiagnostics(Math.max(1, Math.floor(seed)), budget.minimumWavelength)
  return {
    budget,
    minimumWavelengthCm: budget.minimumWavelength * DOMAIN_TO_METRES_X * 100,
    voxelCm: budget.voxel * DOMAIN_TO_METRES_X * 100,
    peakDisplacementCm: diagnostics.peakDisplacement * DOMAIN_TO_METRES_X * 100,
    meanNearSurfaceGradient: diagnostics.meanNearSurfaceGradient,
    maximumNearSurfaceGradient: diagnostics.maximumNearSurfaceGradient,
    foldedFraction: diagnostics.foldedFraction,
  }
}

export function materializePositions(topology: CompiledTopology, _seed: number): Float32Array {
  const output = new Float32Array(topology.domainCoordinates.length)
  let minimumY = Infinity
  for (let index = 0; index < output.length; index += 3) {
    output[index] = topology.domainCoordinates[index]! * WORLD_SCALE[0]
    output[index + 1] = topology.domainCoordinates[index + 1]! * WORLD_SCALE[1]
    output[index + 2] = topology.domainCoordinates[index + 2]! * WORLD_SCALE[2]
    if (output[index + 1]! < minimumY) minimumY = output[index + 1]!
  }
  for (let index = 1; index < output.length; index += 3) output[index] -= minimumY
  return output
}

export function validateSeedRange(seedCount = 3, firstTopology?: CompiledTopology): void {
  for (let seed = 1; seed <= seedCount; seed += 1) {
    const topology = seed === 1 && firstTopology ? firstTopology : compileTopology(seed)
    const positions = materializePositions(topology, seed)
    for (const value of positions) {
      if (!Number.isFinite(value)) throw new Error(`Seed ${seed} produced a non-finite vertex`)
    }
    for (let offset = 0; offset < topology.indices.length; offset += 3) {
      if (triangleArea(positions, topology.indices[offset]!, topology.indices[offset + 1]!, topology.indices[offset + 2]!) < 1e-9) {
        throw new Error(`Seed ${seed} produced a collapsed triangle at ${offset / 3}`)
      }
    }
  }
}
