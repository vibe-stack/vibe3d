import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import {
  modelsLockSchema,
  type ModelsConfig,
  type Registry,
} from '@vibe3djs/schema'
import type { ResolvedRegistryItem } from './resolve.js'

export interface InstallOptions {
  cwd: string
  config: ModelsConfig
  registry: Registry
  source: string
  version: string
  items: ResolvedRegistryItem[]
  overwrite?: boolean
  dryRun?: boolean
}

export interface InstallResult {
  files: string[]
  artifacts: string[]
  dependencies: string[]
  skipped: string[]
}

interface NormalizedInstalledItem {
  address: string
  source: string
  version: string
  installedAt: string
  files: Array<{ path: string; sourceHash: string }>
  artifacts: Array<{ path: string; sourceHash: string; mediaType: string }>
  dependencies: string[]
}

interface NormalizedLock {
  schemaVersion: 1 | 2
  items: Record<string, NormalizedInstalledItem>
}

function sha256(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}

function rewriteContent(content: string, config: ModelsConfig): string {
  return content
    .replaceAll('@vibe3d/', `${config.aliases.vibe3d}/`)
    .replaceAll('@models/', `${config.aliases.models}/`)
}

function targetPath(target: string, options: InstallOptions): string {
  const interpolated = target
    .replaceAll('{vibe3d}', options.config.paths.vibe3d)
    .replaceAll('{models}', options.config.paths.models)
  if (isAbsolute(interpolated)) throw new Error(`Absolute install target is not allowed: ${target}`)
  const resolved = resolve(options.cwd, interpolated)
  const scoped = relative(options.cwd, resolved)
  if (scoped.startsWith('..') || isAbsolute(scoped)) {
    throw new Error(`Install target leaves the project: ${target}`)
  }
  return resolved
}

function lockedPath(path: string, cwd: string): string {
  if (isAbsolute(path)) throw new Error(`Absolute lockfile path is not allowed: ${path}`)
  const resolved = resolve(cwd, path)
  const scoped = relative(cwd, resolved)
  if (scoped.startsWith('..') || isAbsolute(scoped)) {
    throw new Error(`Lockfile path leaves the project: ${path}`)
  }
  return resolved
}

function decodeArtifact(content: string): Uint8Array {
  return Uint8Array.from(Buffer.from(content, 'base64'))
}

async function loadLock(cwd: string): Promise<NormalizedLock> {
  try {
    const raw = JSON.parse(await readFile(join(cwd, 'models.lock.json'), 'utf8')) as unknown
    const lock = modelsLockSchema.parse(raw)
    return {
      schemaVersion: lock.schemaVersion,
      items: lock.schemaVersion === 2
        ? Object.fromEntries(Object.entries(lock.items).map(([address, item]) => [address, item]))
        : Object.fromEntries(Object.entries(lock.items).map(([address, item]) => [address, {
            ...item,
            artifacts: [],
          }])),
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schemaVersion: 1, items: {} }
    throw error
  }
}

export async function installRegistryItems(options: InstallOptions): Promise<InstallResult> {
  const files: string[] = []
  const artifacts: string[] = []
  const skipped: string[] = []
  const dependencies = new Set<string>()
  const lock = await loadLock(options.cwd)

  for (const resolvedItem of options.items) {
    const previous = lock.items[resolvedItem.address]
    const installedFiles = new Map(previous?.files.map((file) => [file.path, file]) ?? [])
    const previousArtifacts = new Map(previous?.artifacts.map((artifact) => [artifact.path, artifact]) ?? [])
    const installedArtifacts = new Map<string, NormalizedInstalledItem['artifacts'][number]>()
    for (const dependency of resolvedItem.item.dependencies) dependencies.add(dependency)
    for (const file of resolvedItem.item.files) {
      const destination = targetPath(file.target, options)
      const content = rewriteContent(file.content, options.config)
      try {
        const existing = await readFile(destination, 'utf8')
        const destinationPath = relative(options.cwd, destination)
        const previousFile = installedFiles.get(destinationPath)
        const locallyUnchanged = previousFile?.sourceHash === sha256(existing)
        if (existing !== content && !locallyUnchanged && !options.overwrite) {
          skipped.push(relative(options.cwd, destination))
          continue
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      files.push(relative(options.cwd, destination))
      installedFiles.set(relative(options.cwd, destination), {
        path: relative(options.cwd, destination),
        sourceHash: sha256(content),
      })
      if (!options.dryRun) {
        await mkdir(dirname(destination), { recursive: true })
        await writeFile(destination, content, 'utf8')
      }
    }
    for (const artifact of ('artifacts' in resolvedItem.item ? resolvedItem.item.artifacts : [])) {
      const destination = targetPath(artifact.target, options)
      const destinationPath = relative(options.cwd, destination)
      const content = decodeArtifact(artifact.content)
      if (content.byteLength !== artifact.byteLength) {
        throw new Error(`${resolvedItem.address} artifact ${artifact.path} has an invalid byte length`)
      }
      const sourceHash = sha256(content)
      if (sourceHash !== artifact.hash) {
        throw new Error(`${resolvedItem.address} artifact ${artifact.path} has a stale hash`)
      }
      artifacts.push(destinationPath)
      installedArtifacts.set(destinationPath, {
        path: destinationPath,
        sourceHash,
        mediaType: artifact.mediaType,
      })
      if (!options.dryRun) {
        await mkdir(dirname(destination), { recursive: true })
        await writeFile(destination, content)
      }
    }
    for (const previousArtifact of previousArtifacts.values()) {
      if (installedArtifacts.has(previousArtifact.path) || options.dryRun) continue
      try {
        await rm(lockedPath(previousArtifact.path, options.cwd))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    lock.items[resolvedItem.address] = {
      address: resolvedItem.address,
      source: options.source,
      version: options.version,
      installedAt: new Date().toISOString(),
      files: [...installedFiles.values()],
      artifacts: [...installedArtifacts.values()],
      dependencies: resolvedItem.item.dependencies,
    }
  }

  if (!options.dryRun) {
    if (Object.values(lock.items).some((item) => item.artifacts.length > 0)) lock.schemaVersion = 2
    const serializedLock = lock.schemaVersion === 1
      ? {
          schemaVersion: 1 as const,
          items: Object.fromEntries(Object.entries(lock.items).map(([address, item]) => [address, {
            address: item.address,
            source: item.source,
            version: item.version,
            installedAt: item.installedAt,
            files: item.files,
            dependencies: item.dependencies,
          }])),
        }
      : { schemaVersion: 2 as const, items: lock.items }
    await writeFile(
      join(options.cwd, 'models.lock.json'),
      `${JSON.stringify(serializedLock, null, 2)}\n`,
      'utf8',
    )
  }
  return { files, artifacts, skipped, dependencies: [...dependencies].sort() }
}
