import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pacote from 'pacote'
import {
  modelsConfigSchema,
  registrySchema,
  type ModelsConfig,
  type Registry,
  type RegistrySource,
} from '@vibe3djs/schema'

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown
}

export async function loadModelsConfig(cwd: string): Promise<ModelsConfig> {
  const path = join(cwd, 'models.json')
  return modelsConfigSchema.parse(await readJson(path))
}

export async function loadRegistry(
  cwd: string,
  registrySource: RegistrySource,
): Promise<Registry> {
  const { source, version } = registrySource
  if (source.startsWith('file://')) {
    return registrySchema.parse(await readJson(fileURLToPath(source)))
  }

  if (source.startsWith('file:')) {
    const value = source.slice('file:'.length)
    const path = isAbsolute(value) ? value : resolve(cwd, value)
    return registrySchema.parse(await readJson(path))
  }

  if (source.startsWith('http://') || source.startsWith('https://')) {
    const response = await fetch(source, { headers: { accept: 'application/json' } })
    if (!response.ok) throw new Error(`Unable to fetch ${source}: ${response.status}`)
    return registrySchema.parse(await response.json())
  }

  if (source.startsWith('npm:')) {
    const packageName = source.slice('npm:'.length)
    const tempRoot = await mkdtemp(join(tmpdir(), 'vibe3d-registry-'))
    try {
      await pacote.extract(`${packageName}@${version}`, tempRoot)
      const packageJsonPath = join(tempRoot, 'package.json')
      const packageJson = await readJson(packageJsonPath) as {
        vibe3d?: { registry?: string }
      }
      const registryPath = packageJson.vibe3d?.registry
      if (!registryPath) throw new Error(`${packageName} does not declare vibe3d.registry`)
      const resolvedPath = resolve(dirname(packageJsonPath), registryPath)
      const scopedPath = relative(tempRoot, resolvedPath)
      if (scopedPath.startsWith('..') || isAbsolute(scopedPath)) {
        throw new Error(`${packageName} declares an unsafe registry path`)
      }
      return registrySchema.parse(await readJson(resolvedPath))
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  }

  if (source.startsWith('github:')) {
    throw new Error('GitHub registry sources are planned but not available yet')
  }

  throw new Error(`Unsupported Vibe3D registry source: ${source}`)
}
