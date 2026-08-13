/**
 * Precompile every instance the cliff assembly needs, so the previewer loads
 * artifacts instead of ray marching in the browser.
 */
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { Worker } from 'node:worker_threads'
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
  type PreparedGraniteAsset,
} from './topology.ts'
import type { GraniteGpuBaker } from './gpu-bake.ts'
import {
  cliffArtifactName,
  cliffInstanceRequests,
  type CliffInstanceRequest,
  type CliffQuality,
} from './cliff-scene.ts'
import {
  compileInParallel,
  readCompatibleArtifactPair,
  workerRequest,
  writeArtifactPair,
} from '../shared/scene-compiler.ts'

const quality = (process.env.CLIFF_QUALITY ?? 'preview') as CliffQuality
const directory = resolve(dirname(fileURLToPath(import.meta.url)), 'cliff')
await mkdir(directory, { recursive: true })

interface Row {
  name: string
  cached: boolean
  triangles: number
  boundaryEdges?: number
  manifold: boolean
  topologyMb: number
  bakeMb: number
  seconds: number
}

async function compileRequest(request: CliffInstanceRequest): Promise<Row> {
  const started = Date.now()
  const asset = compileAssetFor(request.seed, request.cells, request.atlas, { diagnostics: false })
  const name = cliffArtifactName(request)
  const topologyBytes = encodeCompiledTopology(asset.topology)
  const bakeBytes = encodeCompiledSurfaceBake(asset.surfaceBake)
  await writeArtifactPair(directory, name, topologyBytes, bakeBytes)
  return {
    name,
    cached: false,
    triangles: asset.stats.lod0Triangles,
    boundaryEdges: asset.stats.integrity.boundaryEdges,
    manifold: asset.stats.integrity.manifold,
    topologyMb: +(topologyBytes.byteLength / 1e6).toFixed(2),
    bakeMb: +(bakeBytes.byteLength / 1e6).toFixed(2),
    seconds: +((Date.now() - started) / 1000).toFixed(1),
  }
}

async function compileRequestGpu(
  baker: GraniteGpuBaker,
  request: CliffInstanceRequest,
  asset: PreparedGraniteAsset,
): Promise<Row> {
  const started = Date.now()
  const surfaceBake = await baker.compile(asset, request.seed, request.atlas)
  const name = cliffArtifactName(request)
  const topologyBytes = encodeCompiledTopology(asset.topology)
  const bakeBytes = encodeCompiledSurfaceBake(surfaceBake.bake)
  await writeArtifactPair(directory, name, topologyBytes, bakeBytes)
  return {
    name,
    cached: false,
    triangles: asset.stats.lod0Triangles,
    boundaryEdges: asset.stats.integrity.boundaryEdges,
    manifold: asset.stats.integrity.manifold,
    topologyMb: +(topologyBytes.byteLength / 1e6).toFixed(2),
    bakeMb: +(bakeBytes.byteLength / 1e6).toFixed(2),
    seconds: +((Date.now() - started) / 1000).toFixed(1),
  }
}

function prepareRequest(request: CliffInstanceRequest): Promise<PreparedGraniteAsset> {
  return new Promise((resolveWorker, rejectWorker) => {
    const worker = new Worker(new URL('./prepare-worker.mjs', import.meta.url), { workerData: request })
    worker.once('message', (asset: PreparedGraniteAsset) => resolveWorker(asset))
    worker.once('error', rejectWorker)
    worker.once('exit', (code) => {
      if (code !== 0) rejectWorker(new Error(`granite prepare worker exited with code ${code}`))
    })
  })
}

const request = workerRequest()
if (request) {
  console.log(JSON.stringify(await compileRequest(request)))
} else {
  const started = Date.now()
  const requests = cliffInstanceRequests(quality)
  const force = process.argv.includes('--force')
  const report: Row[] = []
  const pending: CliffInstanceRequest[] = []
  for (const candidate of requests) {
    const name = cliffArtifactName(candidate)
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
    `${force ? 'rebuilding' : 'compiling'} ${pending.length}/${requests.length} cliff instance(s) `
    + `at ${quality} quality (${report.length} exact cache hit(s))`,
  )
  let jobs = 0
  let backend = 'cache'
  const canUseGpu = !process.argv.includes('--cpu') && !process.execPath.endsWith('/bun')
  if (pending.length > 0 && canUseGpu) {
    let gpuCompleted = 0
    try {
      const { createGraniteGpuBaker } = await import('./gpu-bake.ts')
      const baker = await createGraniteGpuBaker()
      try {
        backend = 'webgpu'
        jobs = 1
        // Topology extraction and UV unwrap are CPU work. Prepare all unique
        // seed assets concurrently while one GPU device owns the bake queue.
        const prepared = await Promise.all(pending.map(prepareRequest))
        for (let index = 0; index < pending.length; index += 1) {
          const candidate = pending[index]!
          const row = await compileRequestGpu(baker, candidate, prepared[index]!)
          report.push(row)
          console.log(JSON.stringify(row))
          gpuCompleted += 1
        }
      } finally {
        baker.dispose()
      }
    } catch (error) {
      console.warn(`WebGPU unavailable; using the exact CPU compiler: ${(error as Error).message}`)
      const scriptPath = fileURLToPath(import.meta.url)
      const compiled = await compileInParallel<Row>(scriptPath, pending.slice(gpuCompleted), (row) => {
        report.push(row)
        console.log(JSON.stringify(row))
      })
      backend = 'cpu'
      jobs = compiled.jobs
    }
  } else if (pending.length > 0) {
    const scriptPath = fileURLToPath(import.meta.url)
    const compiled = await compileInParallel<Row>(scriptPath, pending, (row) => {
      report.push(row)
      console.log(JSON.stringify(row))
    })
    backend = 'cpu'
    jobs = compiled.jobs
  }
  const totalMb = report.reduce((sum, row) => sum + row.topologyMb + row.bakeMb, 0)
  console.log(JSON.stringify({
    quality,
    instances: report.length,
    cached: report.filter((row) => row.cached).length,
    compiled: report.filter((row) => !row.cached).length,
    backend,
    jobs,
    totalMb: +totalMb.toFixed(1),
    allManifold: report.every((row) => row.manifold),
    wallSeconds: +((Date.now() - started) / 1000).toFixed(2),
  }))
}

// node-webgpu keeps Dawn's native event loop alive while its owner is retained.
// All writes and GPU readbacks above are awaited, so the compiler can now exit.
process.exit(0)
