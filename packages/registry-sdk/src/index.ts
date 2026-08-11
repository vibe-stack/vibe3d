import { createHash } from 'node:crypto'
import {
  registryItemSchema,
  registrySchema,
  type Registry,
  type RegistryFile,
  type RegistryItem,
} from '@vibe3djs/schema'

export function defineRegistry(registry: Registry): Registry {
  return registrySchema.parse(registry)
}

export function defineRegistryItem(item: RegistryItem): RegistryItem {
  return registryItemSchema.parse(item)
}

export function sourceFile(path: string, target: string, content: string): RegistryFile {
  return {
    path,
    target,
    content,
    hash: createHash('sha256').update(content).digest('hex'),
  }
}
