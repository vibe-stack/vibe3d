import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  encodeCompiledSurfaceBake,
  encodeCompiledTopology,
} from '../../../packages/terrain/src/index.ts'
import {
  ATLAS_SIZE,
  SOURCE_GRID_CELLS,
  compileAssetFor,
  fieldReport,
  prepareAssetFor,
  validateSeedRange,
} from './topology.ts'
import { DOMAIN_TO_METRES_X } from './field.ts'

const directory = dirname(fileURLToPath(import.meta.url))
const output = resolve(directory, 'glacial-granite-boulder.vtopo')
const bakeOutput = resolve(directory, 'glacial-granite-boulder.vbake')

const prepared = prepareAssetFor(1, SOURCE_GRID_CELLS, ATLAS_SIZE)
let topology = prepared.topology
let surfaceBake
let stats
let backend = 'cpu'
try {
  const { createGraniteGpuBaker } = await import('./gpu-bake.ts')
  const baker = await createGraniteGpuBaker()
  try {
    const baked = await baker.compile(prepared, 1, ATLAS_SIZE)
    surfaceBake = baked.bake
    stats = {
      ...prepared.stats,
      bakeCoverage: baked.stats.coverage,
      bakeHitRate: baked.stats.hitTexels / Math.max(1, baked.stats.coveredTexels),
      recoveredReliefCm: baked.stats.peakHeight * DOMAIN_TO_METRES_X * 100,
    }
    backend = 'webgpu'
  } finally {
    baker.dispose()
  }
} catch (error) {
  console.warn(`WebGPU unavailable; using the exact CPU bake: ${(error as Error).message}`)
  const compiled = compileAssetFor(1, SOURCE_GRID_CELLS, ATLAS_SIZE)
  topology = compiled.topology
  surfaceBake = compiled.surfaceBake
  stats = compiled.stats
}
const field = fieldReport(1)

const validatedSeeds = Math.max(1, Number(process.env.VIBE_TERRAIN_VALIDATION_SEEDS ?? 1))
validateSeedRange(validatedSeeds, topology)

const encoded = encodeCompiledTopology(topology)
const encodedBake = encodeCompiledSurfaceBake(surfaceBake)
await mkdir(dirname(output), { recursive: true })
await Promise.all([writeFile(output, encoded), writeFile(bakeOutput, encodedBake)])

console.log(JSON.stringify({
  output,
  bytes: encoded.byteLength,
  bakeOutput,
  bakeBytes: encodedBake.byteLength,
  field,
  stats,
  backend,
  testedSeeds: validatedSeeds,
}, null, 2))

// node-webgpu retains Dawn's native event loop after all awaited readbacks and
// writes complete. Explicit exit keeps this one-shot compiler deterministic.
process.exit(0)
