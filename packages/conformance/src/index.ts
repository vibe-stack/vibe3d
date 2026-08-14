import { createHash } from 'node:crypto'
import { isAbsolute, normalize } from 'node:path'
import { resolveRegistryItems } from '@vibe3djs/registry'
import { registrySchema, type Registry } from '@vibe3djs/schema'

export interface ConformanceReport {
  registry: Registry
  checkedItems: number
  checkedFiles: number
  checkedArtifacts: number
}

export function checkRegistry(input: unknown): ConformanceReport {
  const registry = registrySchema.parse(input)
  let checkedFiles = 0
  let checkedArtifacts = 0

  for (const item of registry.items) {
    resolveRegistryItems(registry, item.name)
    const targets = new Set<string>()
    for (const file of item.files) {
      checkedFiles += 1
      const expanded = file.target.replaceAll('{vibe3d}', 'src/lib/vibe3d').replaceAll('{models}', 'src/models')
      const normalized = normalize(expanded)
      if (isAbsolute(normalized) || normalized === '..' || normalized.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
        throw new Error(`${registry.namespace}/${item.name} has an unsafe target: ${file.target}`)
      }
      if (targets.has(normalized)) throw new Error(`${registry.namespace}/${item.name} writes ${file.target} more than once`)
      targets.add(normalized)
      if (file.hash) {
        const actual = createHash('sha256').update(file.content).digest('hex')
        if (actual !== file.hash) throw new Error(`${registry.namespace}/${item.name} has a stale hash for ${file.path}`)
      }
    }
    for (const artifact of ('artifacts' in item ? item.artifacts : [])) {
      checkedArtifacts += 1
      const expanded = artifact.target.replaceAll('{vibe3d}', 'src/lib/vibe3d').replaceAll('{models}', 'src/models')
      const normalized = normalize(expanded)
      if (isAbsolute(normalized) || normalized === '..' || normalized.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
        throw new Error(`${registry.namespace}/${item.name} has an unsafe artifact target: ${artifact.target}`)
      }
      if (targets.has(normalized)) throw new Error(`${registry.namespace}/${item.name} writes ${artifact.target} more than once`)
      targets.add(normalized)
      const content = Buffer.from(artifact.content, 'base64')
      if (content.byteLength !== artifact.byteLength) {
        throw new Error(`${registry.namespace}/${item.name} has an invalid byte length for ${artifact.path}`)
      }
      const actual = createHash('sha256').update(content).digest('hex')
      if (actual !== artifact.hash) {
        throw new Error(`${registry.namespace}/${item.name} has a stale hash for ${artifact.path}`)
      }
    }
  }

  return { registry, checkedItems: registry.items.length, checkedFiles, checkedArtifacts }
}
