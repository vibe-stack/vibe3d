import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import {
  modelsLockSchema,
  type ModelsConfig,
  type ModelsLock,
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
  dependencies: string[]
  skipped: string[]
}

function sha256(content: string): string {
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

async function loadLock(cwd: string): Promise<ModelsLock> {
  try {
    const raw = JSON.parse(await readFile(join(cwd, 'models.lock.json'), 'utf8')) as unknown
    return modelsLockSchema.parse(raw)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schemaVersion: 1, items: {} }
    throw error
  }
}

export async function installRegistryItems(options: InstallOptions): Promise<InstallResult> {
  const files: string[] = []
  const skipped: string[] = []
  const dependencies = new Set<string>()
  const lock = await loadLock(options.cwd)

  for (const resolvedItem of options.items) {
    const previous = lock.items[resolvedItem.address]
    const installedFiles = new Map(previous?.files.map((file) => [file.path, file]) ?? [])
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
    lock.items[resolvedItem.address] = {
      address: resolvedItem.address,
      source: options.source,
      version: options.version,
      installedAt: new Date().toISOString(),
      files: [...installedFiles.values()],
      dependencies: resolvedItem.item.dependencies,
    }
  }

  if (!options.dryRun) {
    await writeFile(
      join(options.cwd, 'models.lock.json'),
      `${JSON.stringify(lock, null, 2)}\n`,
      'utf8',
    )
  }
  return { files, skipped, dependencies: [...dependencies].sort() }
}
