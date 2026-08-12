import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  encodeCompiledSurfaceBake,
  encodeCompiledTopology,
} from '../../../packages/terrain/src/index.ts'
import {
  compileStats,
  compileSurfaceBakeFor,
  compileTopology,
  fieldReport,
  validateSeedRange,
} from './topology.ts'

const directory = dirname(fileURLToPath(import.meta.url))
const output = resolve(directory, 'glacial-granite-boulder.vtopo')
const bakeOutput = resolve(directory, 'glacial-granite-boulder.vbake')

const topology = compileTopology(1)
const surfaceBake = compileSurfaceBakeFor(1)
const stats = compileStats(1)
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
  testedSeeds: validatedSeeds,
}, null, 2))
