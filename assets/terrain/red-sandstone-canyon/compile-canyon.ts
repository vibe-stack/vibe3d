/**
 * Precompile every instance the canyon corridor needs, so the previewer loads
 * artifacts instead of ray marching in the browser.
 *
 *   node --import tsx assets/terrain/red-sandstone-canyon/compile-canyon.ts
 *   CANYON_QUALITY=hero node --import tsx assets/terrain/red-sandstone-canyon/compile-canyon.ts
 *   TERRAIN_JOBS=8 node --import tsx assets/terrain/red-sandstone-canyon/compile-canyon.ts --force
 */
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  encodeCompiledSurfaceBake,
  encodeCompiledTopology,
} from '../../../packages/terrain/src/index.ts'
import {
  ASSET_ID,
  COMPILER_HASH,
  PROFILE,
  RECIPE_HASH,
  compileAssetFor,
  topologyKeyFor,
} from './topology.ts'
import {
  canyonArtifactName,
  canyonInstanceRequests,
  type CanyonInstanceRequest,
  type CanyonQuality,
} from './canyon-scene.ts'
import {
  compileInParallel,
  readCompatibleArtifactPair,
  workerRequest,
  writeArtifactPair,
} from '../shared/scene-compiler.ts'

const quality = (process.env.CANYON_QUALITY ?? 'preview') as CanyonQuality
const directory = resolve(dirname(fileURLToPath(import.meta.url)), 'canyon')
await mkdir(directory, { recursive: true })

interface Row {
  name: string
  cached: boolean
  formation?: string
  triangles: number
  charts?: number
  boundaryEdges?: number
  manifold: boolean
  strays?: number
  millimetresPerTexel?: number
  topologyMb: number
  bakeMb: number
  seconds: number
}

async function compileRequest(request: CanyonInstanceRequest): Promise<Row> {
  const started = Date.now()
  const asset = compileAssetFor(request.seed, request.cells, request.atlas, { diagnostics: false })
  const name = canyonArtifactName(request)
  const topologyBytes = encodeCompiledTopology(asset.topology)
  const bakeBytes = encodeCompiledSurfaceBake(asset.surfaceBake)
  await writeArtifactPair(directory, name, topologyBytes, bakeBytes)
  return {
    name,
    cached: false,
    formation: asset.stats.formation,
    triangles: asset.stats.lod0Triangles,
    charts: asset.stats.chartCount,
    boundaryEdges: asset.stats.integrity.boundaryEdges,
    manifold: asset.stats.integrity.manifold,
    strays: asset.stats.integrity.strayTriangles,
    millimetresPerTexel: +asset.stats.millimetresPerTexel.toFixed(1),
    topologyMb: +(topologyBytes.byteLength / 1e6).toFixed(2),
    bakeMb: +(bakeBytes.byteLength / 1e6).toFixed(2),
    seconds: +((Date.now() - started) / 1000).toFixed(1),
  }
}

const request = workerRequest()
if (request) {
  console.log(JSON.stringify(await compileRequest(request)))
} else {
  const started = Date.now()
  const requests = canyonInstanceRequests(quality)
  const force = process.argv.includes('--force')
  const report: Row[] = []
  const pending: CanyonInstanceRequest[] = []
  for (const candidate of requests) {
    const name = canyonArtifactName(candidate)
    const expected = {
      assetId: ASSET_ID,
      topologyKey: topologyKeyFor(candidate.seed, candidate.cells, candidate.atlas),
      recipeHash: RECIPE_HASH,
      compilerHash: COMPILER_HASH,
      profile: PROFILE,
    }
    const cached = force
      ? undefined
      : await readCompatibleArtifactPair(directory, name, expected, candidate.atlas)
    if (!cached) {
      pending.push(candidate)
      continue
    }
    const row: Row = {
      name,
      cached: true,
      triangles: cached.topology.indices.length / 3,
      manifold: cached.topology.claims.manifold,
      topologyMb: +(cached.topologyBytes.byteLength / 1e6).toFixed(2),
      bakeMb: +(cached.bakeBytes.byteLength / 1e6).toFixed(2),
      seconds: 0,
    }
    report.push(row)
    console.log(JSON.stringify(row))
  }

  console.log(
    `${force ? 'rebuilding' : 'compiling'} ${pending.length}/${requests.length} canyon instance(s) `
    + `at ${quality} quality (${report.length} exact cache hit(s))`,
  )
  const scriptPath = fileURLToPath(import.meta.url)
  const compiled = await compileInParallel<Row>(scriptPath, pending, (row) => {
    report.push(row)
    console.log(JSON.stringify(row))
  })
  const totalMb = report.reduce((sum, row) => sum + row.topologyMb + row.bakeMb, 0)
  console.log(JSON.stringify({
    quality,
    instances: report.length,
    cached: report.filter((row) => row.cached).length,
    compiled: report.filter((row) => !row.cached).length,
    jobs: compiled.jobs,
    totalMb: +totalMb.toFixed(1),
    allManifold: report.every((row) => row.manifold),
    wallSeconds: +((Date.now() - started) / 1000).toFixed(2),
  }))
}
