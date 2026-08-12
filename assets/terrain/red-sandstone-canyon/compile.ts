/**
 * Compile the hero canyon artifacts. Seed and formation are selectable so all
 * three formations can be inspected without editing the file:
 *
 *   node --import tsx assets/terrain/red-sandstone-canyon/compile.ts
 *   CANYON_SEED=5 node --import tsx assets/terrain/red-sandstone-canyon/compile.ts
 */
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

const seed = Math.max(1, Number(process.env.CANYON_SEED ?? 1))
const directory = dirname(fileURLToPath(import.meta.url))
const output = resolve(directory, 'red-sandstone-canyon.vtopo')
const bakeOutput = resolve(directory, 'red-sandstone-canyon.vbake')

const topology = compileTopology(seed)
const surfaceBake = compileSurfaceBakeFor(seed)
const stats = compileStats(seed)
const field = fieldReport(seed)

// Validation crosses the formation boundaries rather than walking consecutive
// seeds: three walls would leave the buttes and blocks entirely unverified.
if (process.env.VIBE_TERRAIN_VALIDATE_FORMATIONS === '1') validateSeedRange([1, 5, 8], topology)

const encoded = encodeCompiledTopology(topology)
const encodedBake = encodeCompiledSurfaceBake(surfaceBake)
await mkdir(dirname(output), { recursive: true })
await Promise.all([writeFile(output, encoded), writeFile(bakeOutput, encodedBake)])

console.log(JSON.stringify({
  seed,
  output,
  bytes: encoded.byteLength,
  bakeOutput,
  bakeBytes: encodedBake.byteLength,
  field,
  stats,
}, null, 2))
