/**
 * Fast orchestration for multi-instance terrain scene compilers.
 *
 * The expensive recipe compiler stays synchronous and deterministic. Scene
 * compilers get their speed from doing independent seeds in separate processes
 * and from accepting an existing artifact only after decoding it and matching
 * every topology identity field exactly.
 */

import { availableParallelism } from 'node:os'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  decodeCompiledSurfaceBake,
  decodeCompiledTopology,
  type CompiledSurfaceBake,
  type CompiledTopology,
  type TopologyIdentity,
} from '../../../packages/terrain/src/index.ts'

export const TERRAIN_WORKER_ARGUMENT = '--terrain-compile-worker'

export interface SceneCompileRequest {
  seed: number
  cells: number
  atlas: number
}

export interface CompatibleArtifactPair {
  topology: CompiledTopology
  surfaceBake: CompiledSurfaceBake
  topologyBytes: Uint8Array
  bakeBytes: Uint8Array
}

function hasIdentity(value: TopologyIdentity, expected: TopologyIdentity): boolean {
  return value.assetId === expected.assetId
    && value.topologyKey === expected.topologyKey
    && value.recipeHash === expected.recipeHash
    && value.compilerHash === expected.compilerHash
    && value.profile === expected.profile
}

/**
 * Decode and validate both files before treating them as an incremental hit.
 * A nearby seed, old compiler, partial pair, or wrong bake resolution is a miss,
 * never an approximation.
 */
export async function readCompatibleArtifactPair(
  directory: string,
  name: string,
  expected: TopologyIdentity,
  atlas: number,
): Promise<CompatibleArtifactPair | undefined> {
  try {
    const [topologyBytes, bakeBytes] = await Promise.all([
      readFile(resolve(directory, `${name}.vtopo`)),
      readFile(resolve(directory, `${name}.vbake`)),
    ])
    const topology = decodeCompiledTopology(topologyBytes)
    const surfaceBake = decodeCompiledSurfaceBake(bakeBytes)
    if (!hasIdentity(topology, expected) || !hasIdentity(surfaceBake, expected)) return undefined
    if (surfaceBake.width !== atlas || surfaceBake.height !== atlas) return undefined
    return { topology, surfaceBake, topologyBytes, bakeBytes }
  } catch {
    return undefined
  }
}

/** Write both artifacts through unique sibling files, avoiding truncated output. */
export async function writeArtifactPair(
  directory: string,
  name: string,
  topologyBytes: Uint8Array,
  bakeBytes: Uint8Array,
): Promise<void> {
  const nonce = `${process.pid}-${randomUUID()}`
  const topologyPath = resolve(directory, `${name}.vtopo`)
  const bakePath = resolve(directory, `${name}.vbake`)
  const temporaryTopology = `${topologyPath}.${nonce}.tmp`
  const temporaryBake = `${bakePath}.${nonce}.tmp`
  try {
    await Promise.all([
      writeFile(temporaryTopology, topologyBytes, { flag: 'wx' }),
      writeFile(temporaryBake, bakeBytes, { flag: 'wx' }),
    ])
    await Promise.all([
      rename(temporaryTopology, topologyPath),
      rename(temporaryBake, bakePath),
    ])
  } catch (error) {
    await Promise.allSettled([unlink(temporaryTopology), unlink(temporaryBake)])
    throw error
  }
}

function requestedJobCount(requestCount: number): number {
  const argument = process.argv.find((value) => value.startsWith('--jobs='))?.slice('--jobs='.length)
  const configured = Number(argument ?? process.env.TERRAIN_JOBS)
  // These compilers spend part of each job allocating/encoding and do not keep
  // every reported CPU busy continuously. A modest oversubscription closes those
  // gaps; measured on a four-CPU host, ten one-wave jobs beat four by ~18%. The
  // cap keeps memory bounded, and TERRAIN_JOBS/--jobs remains an explicit override.
  const defaultJobs = Math.max(1, Math.min(10, availableParallelism() * 3))
  const jobs = Number.isFinite(configured) && configured >= 1 ? Math.floor(configured) : defaultJobs
  return Math.max(1, Math.min(requestCount, jobs))
}

function workerExecArguments(scriptPath: string, request: SceneCompileRequest): string[] {
  // Inspector flags cannot be shared by child processes because their debug port
  // would collide. Loader/import flags (including tsx) must be inherited.
  const inherited = process.execPath.endsWith('/bun')
    ? []
    : process.execArgv.filter((value) => !value.startsWith('--inspect'))
  return [...inherited, scriptPath, TERRAIN_WORKER_ARGUMENT, JSON.stringify(request)]
}

function runWorker<Row>(scriptPath: string, request: SceneCompileRequest): Promise<Row> {
  return new Promise((resolveWorker, rejectWorker) => {
    const child = spawn(process.execPath, workerExecArguments(scriptPath, request), {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    let errors = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { output += chunk })
    child.stderr.on('data', (chunk: string) => { errors += chunk })
    child.once('error', rejectWorker)
    child.once('close', (code) => {
      if (code !== 0) {
        rejectWorker(new Error(
          `terrain compiler worker exited with code ${code ?? 'unknown'}${errors ? `\n${errors.trim()}` : ''}`,
        ))
        return
      }
      try {
        const lines = output.trim().split(/\r?\n/)
        resolveWorker(JSON.parse(lines[lines.length - 1]!) as Row)
      } catch (error) {
        rejectWorker(new Error(`terrain compiler worker returned invalid output: ${output.trim()}`, { cause: error }))
      }
    })
  })
}

/** Run independent compile requests on a bounded process pool. */
export async function compileInParallel<Row>(
  scriptPath: string,
  requests: SceneCompileRequest[],
  onComplete?: (row: Row) => void,
): Promise<{ rows: Row[]; jobs: number }> {
  if (requests.length === 0) return { rows: [], jobs: 0 }
  const jobs = requestedJobCount(requests.length)
  const rows: Row[] = []
  let cursor = 0

  const runner = async () => {
    while (cursor < requests.length) {
      const request = requests[cursor]!
      cursor += 1
      const row = await runWorker<Row>(scriptPath, request)
      rows.push(row)
      onComplete?.(row)
    }
  }
  await Promise.all(Array.from({ length: jobs }, runner))
  return { rows, jobs }
}

export function workerRequest(): SceneCompileRequest | undefined {
  const index = process.argv.indexOf(TERRAIN_WORKER_ARGUMENT)
  if (index < 0) return undefined
  const encoded = process.argv[index + 1]
  if (!encoded) throw new Error(`${TERRAIN_WORKER_ARGUMENT} requires a JSON request`)
  const request = JSON.parse(encoded) as Partial<SceneCompileRequest>
  if (!Number.isInteger(request.seed) || !Number.isInteger(request.cells) || !Number.isInteger(request.atlas)) {
    throw new Error('terrain compiler worker request must contain integer seed, cells, and atlas values')
  }
  return request as SceneCompileRequest
}
