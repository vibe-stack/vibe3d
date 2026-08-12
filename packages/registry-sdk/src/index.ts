import { createHash } from 'node:crypto'
import {
  registryItemSchema,
  registrySchema,
  type Registry,
  type RegistryArtifact,
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

export function compiledArtifact(
  path: string,
  target: string,
  mediaType: string,
  content: Uint8Array,
): RegistryArtifact {
  return {
    path,
    target,
    mediaType,
    encoding: 'base64',
    content: Buffer.from(content).toString('base64'),
    hash: createHash('sha256').update(content).digest('hex'),
    byteLength: content.byteLength,
  }
}
