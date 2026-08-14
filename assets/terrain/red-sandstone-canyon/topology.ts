/**
 * Compiler for red sandstone canyon rock.
 *
 * Pipeline is the same high-to-low workflow as the granite recipe, and the
 * machinery is literally the same code in `../shared`:
 *
 *   analytic SDF  ->  dense QEF extraction  ->  coarse re-extraction (LOD chain)
 *        |                                              |
 *        |                                        UV atlas unwrap
 *        |                                              |
 *        `------------ high-to-low bake ----------------'
 *
 * Two things are specific to strata and drive every constant below.
 *
 * First, the LOD0 grid is finer than the granite's (52 against 44 cells) because
 * bedding is this formation's entire identity and a bed only survives extraction
 * if it is a few voxels thick. `bedBudget` measures that margin and the compile
 * reports it rather than trusting it.
 *
 * Second, world scale is per formation. A wall panel and a collapsed block are
 * both authored in the same [-1, 1] domain but are not the same size in metres,
 * and since atlas size is chosen from world area, getting this wrong silently
 * mis-resolves the bake.
 */

import {
  COMPILED_TOPOLOGY_FORMAT,
  assertCompiledTopology,
  type CompiledSurfaceBake,
  type CompiledTopology,
} from '../../../packages/terrain/src/index.ts'
import {
  DOMAIN_TO_METRES_X,
  bedBudget,
  bedCount,
  canyonDetailField,
  canyonMeshField,
  fieldDiagnostics,
  formationOf,
  jointCount,
  octaveBudget,
  type Formation,
} from './field.ts'
import { extractDenseSurface, type DenseSurface } from '../shared/dual-contour.ts'
import { unwrap, type ReducedSurface, type UnwrapResult } from '../shared/unwrap.ts'
import { compileSurfaceBake, type SurfaceBakeResult } from '../shared/bake.ts'
import { measureIntegrity, keepLargestComponent, type MeshIntegrity } from '../shared/diagnose.ts'
import {
  adjacencyOf,
  atlasSizeFor as atlasSizeForArea,
  extractedAsReduced,
  inheritUvs,
  reductionError,
  repairSurface,
  surfaceAreaOf,
  triangleArea,
  type AtlasDensityPolicy,
} from '../shared/compile-support.ts'

export const ASSET_ID = 'red-sandstone-canyon'
export const RECIPE_HASH = 'water-sculpted-slot-canyon-analytic-sdf-recipe-v3'
export const COMPILER_HASH = 'qef-dual-contour-reextract-unwrap-sdf-bake-v2'
export const PROFILE = 'game'
export const SOURCE_GRID_CELLS = 192

/**
 * LOD grids. Each level is re-extracted from the same analytic field at its own
 * resolution rather than decimated from the dense mesh: watertightness comes from
 * the grid, not from repair. Cluster decimation was measured at ~750 non-manifold
 * fins against ~50 for re-extraction on the granite recipe.
 *
 * 52 rather than 44 cells at LOD0 because of the bedding. At 44 the thinnest bed
 * is 2.6 voxels; at 52 it is 3.1, which leaves the ledge lip and the bed sole as
 * distinguishable features rather than one averaged step.
 */
export const REDUCTION_GRID_CELLS = 52
export const LOD1_GRID_CELLS = 36
export const LOD2_GRID_CELLS = 24
export const COLLISION_GRID_CELLS = 15
export const ATLAS_SIZE = 1024

/**
 * Coarser texel target than the granite's 14mm. These formations are metres
 * across and read from across a canyon rather than at arm's length, and the
 * sub-centimetre band is supplied in world space by the shader rather than baked,
 * so spending atlas on it here would buy nothing.
 */
export const ATLAS_POLICY: AtlasDensityPolicy = {
  targetMillimetresPerTexel: 14,
  // 512 floor, not 256. Measured: at a 512 atlas a wall still packs 97 charts below
  // their usable texel threshold because the per-chart density boost hits its cap;
  // at 1024 that falls to 13. An atlas too small for its chart count produces
  // smeared stripes rather than merely softer detail.
  minimumAtlas: 512,
  maximumAtlas: 2048,
}

export function atlasSizeFor(worldAreaSquareMetres: number, coverage = 0.34): number {
  return atlasSizeForArea(worldAreaSquareMetres, ATLAS_POLICY, coverage)
}

/**
 * Bake trace envelope in domain units. Must exceed the reduction error or the
 * trace misses the detailed surface and the texel bakes flat; must not greatly
 * exceed it or a ray reaches past a ledge lip and bakes relief from the bed
 * behind it. Sized against the 52-cell voxel (0.038).
 */
const BAKE_SEARCH_DISTANCE = 0.05

/**
 * World size of the [-1, 1] domain per formation, in metres.
 *
 * An instance at scale 1 is then the size the formation actually is, which is
 * what makes the scene's numbers mean anything and what makes area-driven atlas
 * sizing correct.
 */
const WORLD_SCALES: Record<Formation, readonly [number, number, number]> = {
  // A wall is 12m of frontage. It has to be wide enough that a handful of segments
  // placed with overlap read as one continuous cliff face rather than as a row of
  // standing monoliths - which is exactly how the first assembly read at 6m.
  wall: [5.4, 9.2, 5.6],
  butte: [2.6, 4.4, 2.5],
  block: [1.4, 1, 1.3],
  arch: [3.5, 4.8, 2.2],
}

export function worldScaleFor(seed: number): readonly [number, number, number] {
  return WORLD_SCALES[formationOf(seed)]
}

export function topologyKeyFor(
  seed: number,
  cells = SOURCE_GRID_CELLS,
  atlasSize = ATLAS_SIZE,
): string {
  const normalized = Math.max(1, Math.floor(seed))
  return `sdf${cells}-dc${REDUCTION_GRID_CELLS}-atlas${atlasSize}`
    + `-canyon-${formationOf(normalized)}-seed-${normalized}`
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
  formation: Formation
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
  beds: number
  joints: number
  /** Thinnest bed in LOD0 voxels. Below ~2 the bed cannot survive extraction. */
  thinnestBedVoxels: number
  bedsRepresentable: boolean
  bakeCoverage: number
  bakeHitRate: number
  recoveredReliefCm: number
  reductionErrorCm?: number
  /** World surface area of LOD0, and the texel density that follows from it. */
  worldAreaSquareMetres: number
  millimetresPerTexel: number
  minimumDomainTriangleArea: number
  integrity: MeshIntegrity
  denseStrayTrianglesRemoved?: number
  lod0NonManifoldFinsRemoved: number
  lod0StrayTrianglesRemoved: number
  holeLoopsFilled: number
  holeLoopsSkipped: number
  seconds: number
}

let cached: { key: string; asset: CompiledAsset } | undefined

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
  const formation = formationOf(normalizedSeed)
  const worldScale = WORLD_SCALES[formation]

  const dense = diagnostics
    ? extractDenseSurface({ field: canyonMeshField, seed: normalizedSeed, cells })
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

  const lod0Repair = repairSurface(extractedAsReduced(canyonMeshField, normalizedSeed, REDUCTION_GRID_CELLS))
  const lod0 = lod0Repair.surface
  const lod0Integrity = measureIntegrity(lod0.indices, lod0.vertexCount)

  // Axis-mode charts, not cone growth. This surface is built from booleans -
  // bedding steps and vertical joints - so its faces already cluster around the
  // six axes, and cone growth fragments at every step: it produced 2,792 charts
  // here against the granite assembly's 411, which was already the most visible
  // artefact in that scene. Axis assignment also bounds stretch at 1.73 by
  // construction rather than relying on a running average not to drift.
  const unwrapped = unwrap(lod0, { atlasSize, padding: 6, mode: 'axis' })

  const lod1 = repairSurface(extractedAsReduced(canyonMeshField, normalizedSeed, LOD1_GRID_CELLS)).surface
  const lod2 = repairSurface(extractedAsReduced(canyonMeshField, normalizedSeed, LOD2_GRID_CELLS)).surface
  const collision = repairSurface(extractedAsReduced(canyonMeshField, normalizedSeed, COLLISION_GRID_CELLS)).surface

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
      maximumDisplacement: 0,
      minimumDomainTriangleArea: Math.max(1e-10, minimumArea * 0.5),
    },
  }
  assertCompiledTopology(topology)

  const surfaceBake = compileSurfaceBake(
    canyonDetailField,
    unwrapped,
    {
      assetId: ASSET_ID,
      topologyKey: topology.topologyKey,
      recipeHash: RECIPE_HASH,
      compilerHash: COMPILER_HASH,
      profile: PROFILE,
    },
    normalizedSeed,
    { width: atlasSize, height: atlasSize, searchDistance: BAKE_SEARCH_DISTANCE },
  )

  const beds = bedBudget(normalizedSeed, REDUCTION_GRID_CELLS)
  const worldArea = surfaceAreaOf(lod0.positions, lod0.indices, worldScale)
  const asset: CompiledAsset = {
    topology,
    unwrapped,
    surfaceBake,
    stats: {
      diagnosticsCollected: diagnostics,
      cells,
      formation,
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
      beds: bedCount(normalizedSeed),
      joints: jointCount(normalizedSeed),
      thinnestBedVoxels: beds.thinnestBedVoxels,
      bedsRepresentable: beds.representable,
      bakeCoverage: surfaceBake.stats.coverage,
      bakeHitRate: surfaceBake.stats.hitTexels / Math.max(1, surfaceBake.stats.coveredTexels),
      recoveredReliefCm: surfaceBake.stats.peakHeight * worldScale[0] * 100,
      reductionErrorCm: dense ? reductionError(dense, lod0, worldScale[0]) : undefined,
      worldAreaSquareMetres: worldArea,
      // The honest density: what the atlas actually resolves for this instance,
      // given its covered fraction. Reported so an under-resolved instance is
      // visible in the compile output rather than only in the render.
      millimetresPerTexel: Math.sqrt(
        (worldArea * 1e6) / Math.max(1, atlasSize * atlasSize * surfaceBake.stats.coverage),
      ),
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
  const normalizedSeed = Math.max(1, Math.floor(seed))
  const budget = octaveBudget(cells)
  const beds = bedBudget(normalizedSeed, REDUCTION_GRID_CELLS)
  const diagnostics = fieldDiagnostics(normalizedSeed, budget.minimumWavelength)
  const metres = WORLD_SCALES[formationOf(normalizedSeed)][0]
  return {
    formation: formationOf(normalizedSeed),
    budget,
    beds,
    thinnestBedCm: beds.thinnestBedDomain * metres * 100,
    minimumWavelengthCm: budget.minimumWavelength * metres * 100,
    voxelCm: budget.voxel * metres * 100,
    peakDisplacementCm: diagnostics.peakDisplacement * metres * 100,
    meanNearSurfaceGradient: diagnostics.meanNearSurfaceGradient,
    maximumNearSurfaceGradient: diagnostics.maximumNearSurfaceGradient,
    foldedFraction: diagnostics.foldedFraction,
    meanFieldGradient: diagnostics.meanFieldGradient,
    maximumFieldGradient: diagnostics.maximumFieldGradient,
  }
}

/**
 * Materialize domain coordinates into world metres, seated on the ground.
 *
 * Scale is per formation, so `seed` is load-bearing here rather than decorative -
 * passing the wrong one produces a correctly shaped rock at the wrong size.
 */
export function materializePositions(topology: CompiledTopology, seed: number): Float32Array {
  const worldScale = worldScaleFor(seed)
  const output = new Float32Array(topology.domainCoordinates.length)
  let minimumY = Infinity
  for (let index = 0; index < output.length; index += 3) {
    output[index] = topology.domainCoordinates[index]! * worldScale[0]
    output[index + 1] = topology.domainCoordinates[index + 1]! * worldScale[1]
    output[index + 2] = topology.domainCoordinates[index + 2]! * worldScale[2]
    if (output[index + 1]! < minimumY) minimumY = output[index + 1]!
  }
  for (let index = 1; index < output.length; index += 3) output[index] -= minimumY
  return output
}

/**
 * Compile one seed per formation and check the output is finite and
 * non-degenerate. Seeds are chosen to cross the formation boundaries rather than
 * to be consecutive: the formations are different geometry, so validating three
 * walls would leave the buttes and blocks unverified.
 */
export function validateSeedRange(seeds: number[] = [1, 5, 8], firstTopology?: CompiledTopology): void {
  for (const seed of seeds) {
    const topology = seed === seeds[0] && firstTopology ? firstTopology : compileTopology(seed)
    const positions = materializePositions(topology, seed)
    for (const value of positions) {
      if (!Number.isFinite(value)) throw new Error(`Seed ${seed} produced a non-finite vertex`)
    }
    for (let offset = 0; offset < topology.indices.length; offset += 3) {
      const area = triangleArea(
        positions, topology.indices[offset]!, topology.indices[offset + 1]!, topology.indices[offset + 2]!,
      )
      if (area < 1e-9) throw new Error(`Seed ${seed} produced a collapsed triangle at ${offset / 3}`)
    }
  }
}

export type { DenseSurface, ReducedSurface }
